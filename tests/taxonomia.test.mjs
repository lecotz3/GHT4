/* =============================================================================
 *  GHT4 · testes de regressão da taxonomia do setor foco
 * -----------------------------------------------------------------------------
 *  A taxonomia vive em dois lugares por necessidade — `setores.js` para o
 *  navegador, `ferramentas/importar-cnpj.mjs` para a ingestão em Node. A razão
 *  está no cabeçalho de `ferramentas/verificar-taxonomia.mjs`: converter
 *  setores.js para ESM quebraria o duplo-clique em file://.
 *
 *  Estes testes são a rede que impede a duplicação de virar divergência. Eles
 *  precisam continuar passando depois que a Fase 1 mover a fonte da verdade para
 *  packages/domain — o que muda é de onde os dois lados derivam, não o que vale.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarMotor, tabelaCnaeDoImportador } from './motor.mjs';

const janela = carregarMotor();
const SETORES = janela.SETORES;

test('setores.js publica window.SETORES com a superfície esperada', () => {
  assert.ok(SETORES, 'window.SETORES não foi publicado');
  for (const nome of [
    'SETOR_FOCO', 'SUBSETORES', 'ADJACENCIAS', 'BARREIRAS', 'CONSOLIDADORES',
    'cnaesDoEscopo', 'subsetorDeCnae', 'subsetor', 'faixaDe',
    'naFaixaConsolidavel', 'subsetoresAcionaveis', 'consolidadoresDe', 'barreirasDe',
  ]) {
    assert.ok(nome in SETORES, `window.SETORES não expõe ${nome}`);
  }
});

test('o setor foco é Químicos e distribuição é a prioridade 1', () => {
  assert.equal(SETORES.SETOR_FOCO, 'Químicos');
  const primeiro = [...SETORES.SUBSETORES].sort((a, b) => a.prioridade - b.prioridade)[0];
  assert.equal(primeiro.chave, 'distribuicao');
  assert.equal(primeiro.rotulo, 'Distribuição e trading químico');
});

test('distribuição declara os CNAEs do escopo do piloto', () => {
  const dist = SETORES.subsetor('distribuicao');
  /* Spread traz o array para o realm do teste: objetos criados dentro do vm têm
     outro Array.prototype, e deepStrictEqual compara protótipo. */
  assert.deepEqual([...dist.cnae], ['4684201', '4684202', '4684299']);
  assert.deepEqual([...dist.cnaeSecundario], ['4689399']);
});

test('cada subsetor tem prioridade única', () => {
  const vistas = new Set();
  for (const s of SETORES.SUBSETORES) {
    assert.ok(!vistas.has(s.prioridade), `prioridade ${s.prioridade} duplicada em ${s.chave}`);
    vistas.add(s.prioridade);
  }
});

test('toda faixa consolidável é um intervalo válido', () => {
  for (const s of SETORES.SUBSETORES) {
    if (!s.faixaConsolidavel) continue;
    const { min, max } = s.faixaConsolidavel;
    assert.equal(typeof min, 'number', `${s.chave}: min não é número`);
    assert.equal(typeof max, 'number', `${s.chave}: max não é número`);
    assert.ok(min < max, `${s.chave}: faixa invertida (${min} > ${max})`);
    assert.ok(min > 0, `${s.chave}: min não positivo`);
  }
});

test('naFaixaConsolidavel resolve a faixa do próprio subsetor', () => {
  /* 40–600 em distribuição. Um valor de 35 está fora aqui, e é justamente o que
     o corte fixo de 30–250 em mercado.js deixava passar. */
  assert.equal(SETORES.naFaixaConsolidavel({ subsetor: 'distribuicao', receita: 300 }), true);
  assert.equal(SETORES.naFaixaConsolidavel({ subsetor: 'distribuicao', receita: 35 }), false);
  assert.equal(SETORES.naFaixaConsolidavel({ subsetor: 'distribuicao', receita: 700 }), false);
});

test('dado ausente devolve null, nunca false', () => {
  /* Regra 3 do projeto: "não sei" e "não atende" são estados distintos. */
  assert.equal(SETORES.naFaixaConsolidavel({ subsetor: 'distribuicao', receita: null }), null);
  assert.equal(SETORES.naFaixaConsolidavel({ subsetor: 'distribuicao' }), null);
  assert.equal(SETORES.naFaixaConsolidavel({ subsetor: 'inexistente', receita: 100 }), null);
});

test('subsetorDeCnae mapeia os CNAEs do piloto para distribuição', () => {
  for (const cnae of ['4684201', '4684202', '4684299']) {
    const s = SETORES.subsetorDeCnae(cnae);
    assert.ok(s, `${cnae} não resolveu para subsetor nenhum`);
    assert.equal(s.chave, 'distribuicao');
  }
});

test('cnaesDoEscopo não devolve código repetido', () => {
  const cnaes = SETORES.cnaesDoEscopo();
  assert.equal(cnaes.length, new Set(cnaes).size, 'há CNAE repetido no escopo');
  assert.ok(cnaes.length > 0);
});

test('todo CNAE do escopo tem sete dígitos', () => {
  for (const cnae of SETORES.cnaesDoEscopo()) {
    assert.match(cnae, /^\d{7}$/, `CNAE fora do formato: ${cnae}`);
  }
});

test('a taxonomia do produto e a do importador não divergem', () => {
  const doImportador = tabelaCnaeDoImportador();

  const doProduto = {};
  for (const s of SETORES.SUBSETORES) for (const c of s.cnae) doProduto[c] = s.rotulo;
  for (const c of SETORES.SUBSETORES.flatMap((s) => s.excluirCnae || [])) delete doProduto[c];

  const soNoProduto = Object.keys(doProduto).filter((c) => !doImportador[c]);
  assert.deepEqual(soNoProduto, [], 'CNAEs em setores.js e ausentes no importador');

  /* Um mesmo código pode servir dois subsetores como secundário (o 4683400 em
     fertilizantes e defensivos). Entra no importador e não no mapa principal:
     exceção conhecida, não divergência. */
  const secundarios = new Set(SETORES.SUBSETORES.flatMap((s) => s.cnaeSecundario || []));
  const soNoImportador = Object.keys(doImportador)
    .filter((c) => !doProduto[c] && !secundarios.has(c));
  assert.deepEqual(soNoImportador, [], 'CNAEs no importador e ausentes em setores.js');

  for (const [cnae, rotulo] of Object.entries(doProduto)) {
    assert.equal(doImportador[cnae], rotulo, `rótulo divergente para o CNAE ${cnae}`);
  }
});

test('barreiras e consolidadores citados pelos subsetores existem', () => {
  for (const s of SETORES.SUBSETORES) {
    for (const chave of s.barreiraRegulatoria || []) {
      assert.ok(SETORES.BARREIRAS[chave], `${s.chave} cita a barreira inexistente "${chave}"`);
    }
  }
});

test('adjacências apontam para subsetores que existem', () => {
  const chaves = new Set(SETORES.SUBSETORES.map((s) => s.chave));
  for (const a of SETORES.ADJACENCIAS) {
    for (const lado of [a.de, a.para].filter(Boolean)) {
      assert.ok(chaves.has(lado), `adjacência aponta para subsetor inexistente: ${lado}`);
    }
  }
});
