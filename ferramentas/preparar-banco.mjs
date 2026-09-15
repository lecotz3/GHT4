import { readFile } from 'node:fs/promises';
import { abrir, fechar } from '../server/src/db/cliente.mjs';
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

// Executado antes do deploy, nunca como chamada pública ou a cada pesquisa.
try {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do PostgreSQL de destino. Este comando não abre o banco local.');
  /* O par do administrador é conferido antes de migrar e importar: pela metade,
     a preparação só quebraria no último passo, depois de todo o trabalho. */
  const { GHT4_ADMIN_EMAIL: email, GHT4_ADMIN_SENHA_INICIAL: senha } = process.env;
  if (Boolean(email) !== Boolean(senha)) {
    throw new Error(`Configure GHT4_ADMIN_EMAIL e GHT4_ADMIN_SENHA_INICIAL juntos — falta ${email ? 'a senha' : 'o e-mail'} — ou não configure nenhum dos dois.`);
  }
  const db = await abrir();
  if (db.tipo !== 'postgres') throw new Error('A preparação exige PostgreSQL persistente.');
  const trava = await db.conectar();
  try {
    await trava.query('SELECT pg_advisory_lock(742814)');
    await migrar(db);
    const texto = await readFile(new URL('../data-quimicos.js', import.meta.url), 'utf8');
    const resultado = await importarCatalogo(db, { texto });
    const administrador = await prepararAdministrador(db, process.env);
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
  process.exitCode = 1;
} finally { await fechar(); }
