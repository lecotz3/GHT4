/* =============================================================================
 *  GHT4 · quadro societário público → pessoas da rede
 * -----------------------------------------------------------------------------
 *  Lê o `socios` de `data-quimicos.js` e cria, para cada pessoa física do quadro,
 *  uma pessoa `mercado` na rede, já ligada à empresa do catálogo. É o roster que
 *  a passada de reconhecimento precisa ter na mão: ninguém responde "conhece
 *  alguém na Química Alfa?", mas todo mundo responde "conhece Carlos Nunes,
 *  sócio-administrador da Química Alfa desde 2009?".
 *
 *  ESTE SCRIPT NÃO RODA SOZINHO
 *  `ferramentas/importar-cnpj.mjs` descarta os nomes do quadro societário por
 *  padrão (`INCLUIR_NOME_SOCIOS = false`), e a nota de LGPD no topo daquele
 *  arquivo diz por quê. Sem os nomes, aqui não há o que importar e o script
 *  explica isso em vez de gravar uma lista vazia.
 *
 *  Ligar os nomes muda o tratamento de dado pessoal do produto inteiro: passa a
 *  haver nome de pessoa física de terceiro no banco, sem que o titular tenha
 *  sido consultado. Isso pede base legal registrada, e é decisão da casa — não
 *  de quem executa o comando. Por isso `--confirmo-a-decisao-lgpd` é
 *  obrigatório: não é burocracia, é o lugar onde a decisão aparece no histórico
 *  do terminal e de quem rodou.
 *
 *  USO
 *    node ferramentas/importar-quadro-societario.mjs --ensaio
 *    node ferramentas/importar-quadro-societario.mjs --confirmo-a-decisao-lgpd
 *    node ferramentas/importar-quadro-societario.mjs --arquivo=... --ensaio
 *
 *  `--ensaio` lê, classifica e conta, sem escrever nada. É o modo que permite à
 *  casa ver o volume e a cara do dado ANTES de decidir.
 * ========================================================================== */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { abrir, fechar, urlDireta } from '../server/src/db/cliente.mjs';
import { lerFonteCatalogo } from '../server/src/agente/catalogo.mjs';
import { normalizar } from '../server/src/rede/contratos.mjs';
import { qualificacao, importavel, QUALIFICACOES_EXCLUIDAS } from '../server/src/rede/qualificacoes.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argumento = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=').slice(1).join('=');
const tem = (nome) => process.argv.includes(`--${nome}`);

const ENSAIO = tem('ensaio');
const CONFIRMADO = tem('confirmo-a-decisao-lgpd');
const ARQUIVO = argumento('arquivo') ?? path.join(RAIZ, 'data-quimicos.js');

/* `data-quimicos.js` é um script que povoa globais, mas nunca é executado para
   ser lido: `lerFonteCatalogo` extrai os literais JSON do texto. Manter essa
   propriedade importa mais aqui do que em qualquer outro lugar — este é o
   caminho por onde nome de pessoa entra no banco. */
async function lerCatalogo(caminho) {
  const { colunas, linhas, referencia } = lerFonteCatalogo(await readFile(caminho, 'utf8'));
  const empresas = linhas.map((linha) => Object.fromEntries(colunas.map((c, i) => [c, linha[i]])));
  return { empresas, referencia };
}

/** Converte o quadro societário de uma empresa em pessoas da rede. */
export function pessoasDoQuadro(empresa, referencia) {
  const saida = [], descartes = [];
  for (const s of empresa.socios ?? []) {
    if (s.tipo !== 'fisica') { descartes.push({ motivo: 'pessoa jurídica no quadro' }); continue; }
    if (!s.nome || String(s.nome).trim().length < 3) { descartes.push({ motivo: 'nome ausente' }); continue; }
    if (!importavel(s.qualificacao)) {
      descartes.push({ motivo: QUALIFICACOES_EXCLUIDAS.get(String(s.qualificacao ?? '').padStart(2, '0')) ?? 'qualificação excluída' });
      continue;
    }
    const q = qualificacao(s.qualificacao);
    const nome = String(s.nome).trim();
    saida.push({
      nome,
      nomeNormalizado: normalizar(nome),
      cargo: q.cargo,
      senioridade: q.senioridade,
      qualificacaoConhecida: q.conhecida,
      organizacao: empresa.nome ?? empresa.razaoSocial ?? '',
      empresaId: empresa.id,
      /* A referência guarda de onde o registro veio e desde quando a pessoa está
         no quadro. Faixa etária existe na fonte e fica DE FORA de propósito: o
         produto já se proíbe de inferir sucessão pela idade dos sócios, e ter o
         campo à mão só cria a tentação de segmentar pessoa por idade. */
      referencia: [`RFB CNPJ ${referencia}`, `qualificação ${String(s.qualificacao ?? '').padStart(2, '0')}`,
        s.entrada ? `no quadro desde ${s.entrada}` : null].filter(Boolean).join(' · '),
    });
  }
  return { pessoas: saida, descartes };
}

async function principal() {
  console.log('\nGHT4 · quadro societário público → rede\n');

  const { empresas, referencia } = await lerCatalogo(ARQUIVO);
  const comQuadro = empresas.filter((e) => Array.isArray(e.socios) && e.socios.length);

  if (!comQuadro.length) {
    console.error('Nenhuma empresa do catálogo traz nomes no quadro societário.\n');
    console.error('  `ferramentas/importar-cnpj.mjs` descarta os nomes por padrão. Para tê-los:');
    console.error('    1. leia a nota de LGPD no topo daquele arquivo;');
    console.error('    2. registre a decisão da casa;');
    console.error('    3. mude INCLUIR_NOME_SOCIOS para true e reimporte o cadastro.\n');
    process.exit(2);
  }

  let pessoas = [], descartes = [], semQualificacao = 0;
  for (const e of comQuadro) {
    const r = pessoasDoQuadro(e, referencia);
    pessoas.push(...r.pessoas);
    descartes.push(...r.descartes);
    semQualificacao += r.pessoas.filter((p) => !p.qualificacaoConhecida).length;
  }

  /* Homônimo dentro da MESMA empresa é quase sempre a mesma pessoa listada duas
     vezes com qualificações diferentes; fica a de maior senioridade. Homônimo
     entre empresas diferentes é outra história e não se resolve aqui: vira fila
     de revisão humana, nunca fusão automática. */
  const porChave = new Map();
  const ordem = ['ceo', 'conselho', 'cfo', 'diretoria', 'gerencia', 'outro'];
  for (const p of pessoas) {
    const chave = `${p.empresaId}|${p.nomeNormalizado}`;
    const atual = porChave.get(chave);
    if (!atual || ordem.indexOf(p.senioridade) < ordem.indexOf(atual.senioridade)) porChave.set(chave, p);
  }
  const unicas = [...porChave.values()];
  const duplicadasNaEmpresa = pessoas.length - unicas.length;

  const porNome = new Map();
  for (const p of unicas) porNome.set(p.nomeNormalizado, (porNome.get(p.nomeNormalizado) ?? 0) + 1);
  const homonimos = [...porNome.values()].filter((n) => n > 1).length;

  const contagem = {};
  for (const p of unicas) contagem[p.senioridade] = (contagem[p.senioridade] ?? 0) + 1;

  console.log(`  referência cadastral .......... ${referencia}`);
  console.log(`  empresas com quadro ........... ${comQuadro.length.toLocaleString('pt-BR')}`);
  console.log(`  pessoas físicas a importar .... ${unicas.length.toLocaleString('pt-BR')}`);
  console.log(`  descartadas ................... ${descartes.length.toLocaleString('pt-BR')}`);
  for (const [motivo, n] of Object.entries(descartes.reduce((a, d) => ({ ...a, [d.motivo]: (a[d.motivo] ?? 0) + 1 }), {}))) {
    console.log(`      · ${motivo}: ${n.toLocaleString('pt-BR')}`);
  }
  console.log(`  repetidas na mesma empresa .... ${duplicadasNaEmpresa.toLocaleString('pt-BR')} (mantida a maior senioridade)`);
  console.log(`  nomes iguais em empresas dif .. ${homonimos.toLocaleString('pt-BR')} (revisão humana, sem fusão)`);
  console.log(`  qualificação desconhecida ..... ${semQualificacao.toLocaleString('pt-BR')} (entram como "outro")`);
  console.log('  por senioridade:');
  for (const s of ordem) if (contagem[s]) console.log(`      · ${s}: ${contagem[s].toLocaleString('pt-BR')}`);

  if (ENSAIO) {
    console.log('\n  ENSAIO — nada foi gravado. Amostra:');
    for (const p of unicas.slice(0, 5)) console.log(`      ${p.nome} · ${p.cargo} · ${p.organizacao}`);
    console.log('');
    return;
  }

  if (!CONFIRMADO) {
    console.error('\nFalta a confirmação da decisão.\n');
    console.error('  Gravar estes nomes põe dado pessoal de terceiros no banco, sem que os');
    console.error('  titulares tenham sido consultados. Isso exige base legal registrada, e a');
    console.error('  decisão é da casa.\n');
    console.error('  Para ver o volume sem gravar:  --ensaio');
    console.error('  Para gravar:                   --confirmo-a-decisao-lgpd\n');
    process.exit(3);
  }

  const db = await abrir({ url: urlDireta() });
  try {
    const operador = (await db.query("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo ORDER BY criado_em LIMIT 1")).rows[0];
    if (!operador) throw new Error('Nenhum administrador ativo para responder pela importação.');

    let criadas = 0, atualizadas = 0;
    for (const p of unicas) {
      const r = await db.query(
        `INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,
           organizacao_normalizada,empresa_id,origem,origem_referencia,criado_por)
         VALUES ($1,'mercado',$2,$3,$4,$5,$6,$7,$8,'cadastro_publico',$9,$10)
         ON CONFLICT (empresa_id, nome_normalizado) WHERE origem = 'cadastro_publico'
         DO UPDATE SET cargo = EXCLUDED.cargo, senioridade = EXCLUDED.senioridade,
           organizacao = EXCLUDED.organizacao, organizacao_normalizada = EXCLUDED.organizacao_normalizada,
           origem_referencia = EXCLUDED.origem_referencia, versao = rede_pessoas.versao + 1,
           atualizado_em = now()
         RETURNING (xmax = 0) AS nova`,
        [randomUUID(), p.nome, p.nomeNormalizado, p.cargo, p.senioridade, p.organizacao,
          normalizar(p.organizacao), p.empresaId, p.referencia, operador.id]);
      if (r.rows[0]?.nova) criadas++; else atualizadas++;
    }
    await db.query(
      `INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, depois, justificativa)
       VALUES ($1,'importar','rede_quadro_societario',$2,$3,$4)`,
      [operador.id, referencia, JSON.stringify({ criadas, atualizadas, descartadas: descartes.length }),
        'Importação do quadro societário público, confirmada na linha de comando.']);
    console.log(`\n  criadas ${criadas.toLocaleString('pt-BR')} · atualizadas ${atualizadas.toLocaleString('pt-BR')}\n`);
  } finally {
    await fechar();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal().catch((erro) => {
    console.error('\nFalha ao importar o quadro societário.', erro.message, '\n');
    process.exit(1);
  });
}
