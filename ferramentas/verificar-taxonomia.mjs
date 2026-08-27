/* =============================================================================
 *  GHT4 · VERIFICAÇÃO DA TAXONOMIA DO SETOR FOCO
 * -----------------------------------------------------------------------------
 *  A lista de CNAEs do escopo vive em DOIS lugares, e isso é deliberado:
 *
 *    setores.js               — script de navegador (window.SETORES). É a régua
 *                               do produto, e é lida pelo index.html por <script>.
 *    ferramentas/importar-cnpj.mjs — módulo de Node. É a régua da ingestão.
 *
 *  Converter setores.js para ESM resolveria a duplicação e QUEBRARIA o protótipo:
 *  navegador bloqueia módulo ES em file://, e é o duplo-clique no index.html que
 *  faz a demonstração funcionar numa sala de reunião sem rede. A duplicação é o
 *  preço, e este arquivo é o que impede que ela vire divergência silenciosa —
 *  que seria o pior dos mundos: a tela dizendo um recorte e a ingestão fazendo
 *  outro, sem ninguém perceber.
 *
 *  Verifica também que os códigos existem de fato na CNAE oficial do IBGE.
 *  Sem rede, essa parte é pulada com aviso, e o resto continua valendo.
 *
 *  USO
 *    node ferramentas/verificar-taxonomia.mjs
 *    node ferramentas/verificar-taxonomia.mjs --sem-rede
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEM_REDE = process.argv.includes('--sem-rede');

let falhas = 0;
const erro = (msg) => { falhas++; console.error(`  ✗ ${msg}`); };
const ok   = (msg) => console.log(`  ✓ ${msg}`);

console.log('\nGHT4 · verificando a taxonomia do setor foco\n');

/* ---- 1. carrega setores.js num contexto de navegador simulado -------------- */
const ctx = { console, window: {} };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'setores.js'), 'utf8'), ctx, { filename: 'setores.js' });
const SETORES = ctx.window.SETORES;
if (!SETORES) { erro('setores.js não expôs window.SETORES'); process.exit(1); }

/* ---- 2. extrai a tabela do importador sem executá-lo -----------------------
 * O importador é um script com efeitos colaterais (baixa 5 GB). Ler o literal
 * do objeto é o jeito de comparar sem disparar a ingestão. */
const fonteImportador = fs.readFileSync(path.join(RAIZ, 'ferramentas', 'importar-cnpj.mjs'), 'utf8');
const bloco = fonteImportador.match(/const SUBSETOR_POR_CNAE = \{([\s\S]*?)\n\};/);
if (!bloco) { erro('não encontrei SUBSETOR_POR_CNAE em importar-cnpj.mjs'); process.exit(1); }

const doImportador = {};
for (const m of bloco[1].matchAll(/'(\d{7})':\s*'([^']+)'/g)) doImportador[m[1]] = m[2];

/* ---- 3. compara os dois lados --------------------------------------------- */
const doProduto = {};
for (const s of SETORES.SUBSETORES) {
  for (const c of s.cnae) doProduto[c] = s.rotulo;
}
const excluidos = new Set(SETORES.SUBSETORES.flatMap((s) => s.excluirCnae || []));
for (const c of excluidos) delete doProduto[c];

const soNoProduto = Object.keys(doProduto).filter((c) => !doImportador[c]);
const soNoImportador = Object.keys(doImportador).filter((c) => !doProduto[c]);

/* Os CNAEs secundários (mesmo código servindo dois subsetores, como o 4683400
   em fertilizantes e defensivos) entram no importador e não no mapa principal
   de setores.js. São exceção conhecida, não divergência. */
const secundarios = new Set(SETORES.SUBSETORES.flatMap((s) => s.cnaeSecundario || []));
const divergentesImportador = soNoImportador.filter((c) => !secundarios.has(c));

if (soNoProduto.length) {
  erro(`CNAEs em setores.js e ausentes no importador: ${soNoProduto.join(', ')}`);
} else {
  ok(`todos os ${Object.keys(doProduto).length} CNAEs de setores.js estão no importador`);
}

if (divergentesImportador.length) {
  erro(`CNAEs no importador e ausentes em setores.js: ${divergentesImportador.join(', ')}`);
} else {
  ok('o importador não inventa CNAE fora da taxonomia');
}

const rotulosDivergentes = Object.keys(doProduto)
  .filter((c) => doImportador[c] && doImportador[c] !== doProduto[c]);
if (rotulosDivergentes.length) {
  for (const c of rotulosDivergentes) {
    erro(`CNAE ${c}: setores.js diz "${doProduto[c]}", importador diz "${doImportador[c]}"`);
  }
} else {
  ok('os rótulos de subsetor batem nos dois arquivos');
}

/* ---- 4. coerência interna da taxonomia ------------------------------------ */
for (const s of SETORES.SUBSETORES) {
  if (s.faixaConsolidavel === null && !s.semAlvoDeBoutique) {
    erro(`"${s.rotulo}" tem faixa nula sem explicar por quê (falta semAlvoDeBoutique)`);
  }
  if (s.faixaConsolidavel && s.faixaConsolidavel.min >= s.faixaConsolidavel.max) {
    erro(`"${s.rotulo}" tem faixa invertida: ${s.faixaConsolidavel.min}–${s.faixaConsolidavel.max}`);
  }
  for (const b of (s.barreiraRegulatoria || [])) {
    if (!SETORES.BARREIRAS[b]) erro(`"${s.rotulo}" cita a barreira "${b}", que não existe em BARREIRAS`);
  }
}
const rotulos = SETORES.SUBSETORES.map((s) => s.rotulo);
if (new Set(rotulos).size !== rotulos.length) erro('há rótulos de subsetor repetidos');

/* Adjacência não pode reaparecer dentro do escopo — seria excluir e incluir. */
for (const a of SETORES.ADJACENCIAS) {
  for (const c of a.cnae) {
    if (doProduto[c]) erro(`CNAE ${c} está em "${a.rotulo}" (adjacência) e também no escopo`);
  }
}
if (falhas === 0) ok('taxonomia internamente coerente: faixas, barreiras e adjacências');

/* ---- 5. os códigos existem mesmo na CNAE oficial? ------------------------- */
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

    const inexistentes = [...new Set([...Object.keys(doProduto), ...Object.keys(doImportador)])]
      .filter((c) => !valido(c));
    if (inexistentes.length) {
      erro(`CNAEs que não existem na CNAE oficial, nem como subclasse nem como classe: ${inexistentes.join(', ')}`);
    } else {
      const porClasse = [...new Set([...Object.keys(doProduto), ...Object.keys(doImportador)])]
        .filter((c) => !subclasses.has(c));
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
  ? `\n  taxonomia verificada: ${SETORES.SUBSETORES.length} subsetores, ${Object.keys(doProduto).length} CNAEs.\n`
  : `\n  ${falhas} divergência(s). Corrija antes de rodar a ingestão.\n`);
process.exitCode = falhas === 0 ? 0 : 1;
