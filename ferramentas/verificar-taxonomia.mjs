/* =============================================================================
 *  GHT4 · VERIFICAÇÃO DA TAXONOMIA DO SETOR FOCO
 * -----------------------------------------------------------------------------
 *  Até a Fase 1, a taxonomia existia em duas cópias mantidas à mão — setores.js
 *  para o navegador, importar-cnpj.mjs para a ingestão — e este script existia
 *  para impedir que as duas divergissem.
 *
 *  Agora há uma fonte só: packages/domain/taxonomia.mjs. O setores.js da raiz é
 *  GERADO dela, e o importador a importa. Não sobrou o que divergir, e o papel
 *  deste arquivo mudou. Ele agora responde três perguntas:
 *
 *    1. O setores.js commitado ainda corresponde à fonte, ou alguém editou o
 *       gerado à mão e a próxima geração vai apagar o trabalho?
 *    2. A taxonomia é internamente coerente — faixas, barreiras, adjacências,
 *       rótulos e prioridades únicos, descoberta que não enquadra?
 *    3. Os códigos existem mesmo na CNAE oficial do IBGE?
 *
 *  A terceira é a que só este script faz, e é a que justifica ele continuar
 *  existindo ao lado da suíte de testes.
 *
 *  USO
 *    node ferramentas/verificar-taxonomia.mjs
 *    node ferramentas/verificar-taxonomia.mjs --sem-rede
 * ========================================================================== */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as TAXONOMIA from '../packages/domain/taxonomia.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEM_REDE = process.argv.includes('--sem-rede');

let falhas = 0;
const erro = (msg) => { falhas++; console.error(`  ✗ ${msg}`); };
const ok   = (msg) => console.log(`  ✓ ${msg}`);

console.log('\nGHT4 · verificando a taxonomia do setor foco\n');

const tabela = TAXONOMIA.tabelaSubsetorPorCnae();

/* ---- 1. o gerado está em dia com a fonte? --------------------------------- */
{
  const r = spawnSync(
    process.execPath,
    [path.join(RAIZ, 'ferramentas', 'gerar-setores.mjs'), '--conferir'],
    { cwd: RAIZ, encoding: 'utf8' },
  );
  if (r.status === 0) {
    ok('setores.js está em dia com packages/domain/taxonomia.mjs');
  } else {
    erro('setores.js divergiu da fonte — rode `node ferramentas/gerar-setores.mjs`');
  }
}

/* ---- 2. coerência interna da taxonomia ------------------------------------ */
for (const s of TAXONOMIA.SUBSETORES) {
  if (s.faixaConsolidavel === null && !s.semAlvoDeBoutique) {
    erro(`"${s.rotulo}" tem faixa nula sem explicar por quê (falta semAlvoDeBoutique)`);
  }
  if (s.faixaConsolidavel && s.faixaConsolidavel.min >= s.faixaConsolidavel.max) {
    erro(`"${s.rotulo}" tem faixa invertida: ${s.faixaConsolidavel.min}–${s.faixaConsolidavel.max}`);
  }
  for (const b of (s.barreiraRegulatoria || [])) {
    if (!TAXONOMIA.BARREIRAS[b]) erro(`"${s.rotulo}" cita a barreira "${b}", que não existe em BARREIRAS`);
  }
}

const rotulos = TAXONOMIA.SUBSETORES.map((s) => s.rotulo);
if (new Set(rotulos).size !== rotulos.length) erro('há rótulos de subsetor repetidos');

const prioridades = TAXONOMIA.SUBSETORES.map((s) => s.prioridade);
if (new Set(prioridades).size !== prioridades.length) erro('há prioridades de subsetor repetidas');

/* Adjacência não pode reaparecer dentro do escopo — seria excluir e incluir. */
for (const a of TAXONOMIA.ADJACENCIAS) {
  for (const c of (a.cnae || [])) {
    if (tabela[c]) erro(`CNAE ${c} está em "${a.rotulo}" (adjacência) e também no escopo`);
  }
}

/* Um CNAE só-descoberta não pode enquadrar. Se aparecer na tabela de ingestão,
   a regra vazou e a base vai encher de falso positivo. */
for (const c of TAXONOMIA.cnaesDeDescoberta()) {
  if (tabela[c]) erro(`CNAE ${c} é só-descoberta e mesmo assim enquadra na ingestão`);
}

if (falhas === 0) ok('taxonomia internamente coerente: faixas, barreiras, adjacências e descoberta');

/* ---- 3. os códigos existem mesmo na CNAE oficial? ------------------------- */
const universo = [...new Set([...Object.keys(tabela), ...TAXONOMIA.cnaesDeDescoberta()])];

if (SEM_REDE) {
  console.log('  · verificação contra o IBGE pulada (--sem-rede)');
} else {
  try {
    const [rSub, rCls] = await Promise.all([
      fetch('https://servicodados.ibge.gov.br/api/v2/cnae/subclasses'),
      fetch('https://servicodados.ibge.gov.br/api/v2/cnae/classes'),
    ]);
    if (!rSub.ok || !rCls.ok) throw new Error(`HTTP ${rSub.status}/${rCls.status}`);
    const subclasses = new Set((await rSub.json()).map((s) => s.id));
    const classes = new Set((await rCls.json()).map((c) => c.id));

    /* Um código de 7 dígitos é válido se for subclasse, OU se for uma CLASSE de
       5 dígitos com "00" no fim. A tabela da Receita usa essa forma para classes
       que ela não desdobrou — 2013400 (adubos e fertilizantes) é o caso vivo, e
       há estabelecimentos cadastrados nele. Aceitar isso não é afrouxar: é
       reconhecer que a régua da ingestão é a tabela da RFB, não a do IBGE. */
    const valido = (c) => subclasses.has(c) || (c.endsWith('00') && classes.has(c.slice(0, 5)));

    const inexistentes = universo.filter((c) => !valido(c));
    if (inexistentes.length) {
      erro(`CNAEs que não existem na CNAE oficial, nem como subclasse nem como classe: ${inexistentes.join(', ')}`);
    } else {
      const porClasse = universo.filter((c) => !subclasses.has(c));
      ok(`todos os códigos existem na CNAE oficial (${subclasses.size} subclasses, ${classes.size} classes)`);
      if (porClasse.length) console.log(`    · válidos no nível de CLASSE, não de subclasse: ${porClasse.join(', ')}`);
    }
  } catch (e) {
    console.log(`  · não deu para consultar o IBGE (${e.message}) — rode com --sem-rede para pular`);
  }
  const pool = globalThis[Symbol.for('undici.globalDispatcher.1')];
  if (pool && typeof pool.destroy === 'function') { try { await pool.destroy(); } catch { /* já destruído */ } }
}

console.log(falhas === 0
  ? `\n  taxonomia verificada: ${TAXONOMIA.SUBSETORES.length} subsetores, ${Object.keys(tabela).length} CNAEs de enquadramento, ${TAXONOMIA.cnaesDeDescoberta().length} de descoberta.\n`
  : `\n  ${falhas} divergência(s). Corrija antes de rodar a ingestão.\n`);
process.exitCode = falhas === 0 ? 0 : 1;
