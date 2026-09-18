import { readFile } from 'node:fs/promises';
import { abrir, fechar, urlDireta, descreverAlvo, urlBanco } from '../server/src/db/cliente.mjs';
import { migrar } from '../server/src/db/migrar.mjs';
import { importarCatalogo } from '../server/src/agente/importar-catalogo.mjs';
import { prepararAdministrador } from '../server/src/operacao/administrador-inicial.mjs';

/* Diz qual foi a falha sem expor a conexão. Só `code`/`name` resumia tudo a
   "Error" e não dava para agir. Nem a nossa mensagem nem a do driver carregam
   usuário ou senha: a credencial vive no objeto de configuração do pool, que
   não é impresso aqui. */
function descrever(erro) {
  const partes = [erro.code ?? erro.name];
  if (Array.isArray(erro.issues)) partes.push(erro.issues.map((i) => `${i.path.join('.') || 'valor'}: ${i.message}`).join('; '));
  else partes.push(erro.message);
  if (erro.detail) partes.push(erro.detail);
  return partes.filter(Boolean).join(' · ');
}

/* 28P01 nao diz qual metade da credencial esta errada, e a string nao pode ser
   impressa. Isto imprime a ESTRUTURA dela: nada que sirva para entrar no banco.
   O erro quase sempre e de formato, nao de senha — usuario sem o sufixo de
   tenant que o pooler exige, caractere reservado sem percent-encoding, ou valor
   colado pela metade. Sem isto, a unica pista e um 28P01 sem contexto. */
function estruturaDaUrl(url) {
  try {
    const u = new URL(url);
    const autoridade = url.slice(url.indexOf('//') + 2).split('/')[0];
    return [
      `usuario=${u.username || '(vazio)'}`,
      `senha=${u.password.length} caracteres${u.password.includes('%') ? ', com percent-encoding' : ''}`,
      `arrobas na autoridade=${(autoridade.match(/@/g) || []).length}`,
      `host=${u.hostname}:${u.port || '(padrao)'}`,
      `banco=${u.pathname.slice(1) || '(vazio)'}`,
    ].join(' · ');
  } catch { return '(connection string malformada)'; }
}

// Executado antes do deploy, nunca como chamada pública ou a cada pesquisa.
try {
  if (!urlBanco()) throw new Error('Defina DATABASE_URL (ou POSTGRES_URL) do PostgreSQL de destino. Este comando não abre o banco local.');
  /* Migrations, advisory lock e importação do catálogo precisam de sessão que
     sobreviva ao fim da transação — ver urlDireta() em server/src/db/cliente.mjs.
     Num Supabase, isto é a porta 5432; a API fica na 6543. */
  const destino = urlDireta();
  console.log(`Preparando ${descreverAlvo(destino)}`);
  const db = await abrir({ url: destino });
  if (db.tipo !== 'postgres') throw new Error('A preparação exige PostgreSQL persistente.');
  const trava = await db.conectar();
  try {
    await trava.query('SELECT pg_advisory_lock(742814)');
    await migrar(db);
    // Contas existentes dispensam a senha inicial, que pode ser retirada da hospedagem.
    const administrador = await prepararAdministrador(db, process.env);
    const texto = await readFile(new URL('../data-quimicos.js', import.meta.url), 'utf8');
    const resultado = await importarCatalogo(db, { texto });
    console.log(JSON.stringify({ catalogo: resultado, administrador }));
  } finally {
    /* A trava cai sozinha ao encerrar a sessão. Falhar em liberá-la não pode
       reprovar um deploy cuja preparação já terminou. */
    try { await trava.query('SELECT pg_advisory_unlock(742814)'); }
    catch (erro) { console.error('Aviso: a trava não foi liberada explicitamente.', descrever(erro)); }
    finally { trava.release(); }
  }
} catch (erro) {
  // Não imprimir connection strings ou objetos de conexão em logs de deployment.
  console.error('Falha ao preparar banco e catálogo.', descrever(erro));
  // Credencial recusada: o util e saber como a string esta formada, nao o que ela contem.
  if (erro.code === '28P01') console.error('  estrutura da conexão:', estruturaDaUrl(urlDireta()));
  process.exitCode = 1;
} finally { await fechar(); }
