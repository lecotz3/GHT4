/* =============================================================================
 *  GHT4 · testes da faixa consolidável no mapa de mercado
 * -----------------------------------------------------------------------------
 *  Até a Fase 1, `metricas()` filtrava `receita >= 30 && receita <= 250` embutido
 *  no código, para o setor inteiro. Isso contradizia `setores.js`, que declara a
 *  faixa POR SUBSETOR — distribuição é R$ 40–600 mi — e tratava receita ausente
 *  como "fora da faixa", violando a regra de que dado ausente é null e nunca
 *  false.
 *
 *  Estes testes existem para que a régua não volte a viver em dois lugares.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarMotor } from './motor.mjs';

const janela = carregarMotor();
const MERCADO = janela.MERCADO;
const SETORES = janela.SETORES;

/** Empresa mínima que `metricas()` consegue medir. */
const empresa = (subsetor, receita) => ({
  subsetor, receita,
  crescimento: null, margemEbitda: null, alavancagem: null,
});

test('a faixa vem do subsetor, não de um corte fixo do setor', () => {
  /* R$ 300 mi está DENTRO de distribuição (40–600) e estaria FORA do antigo
     corte fixo de 30–250. É o caso que provava o conflito. */
  const m = MERCADO.metricas([empresa('distribuicao', 300)]);
  assert.equal(m.alvosNaFaixa, 1);
  assert.equal(m.alvosForaDaFaixa, 0);
});

test('abaixo do piso do subsetor conta como fora', () => {
  /* R$ 35 mi passava no corte antigo (>= 30) e está abaixo do piso de
     distribuição (40). */
  const m = MERCADO.metricas([empresa('distribuicao', 35)]);
  assert.equal(m.alvosNaFaixa, 0);
  assert.equal(m.alvosForaDaFaixa, 1);
});

test('receita ausente é indeterminada, não "fora da faixa"', () => {
  const m = MERCADO.metricas([empresa('distribuicao', null)]);
  assert.equal(m.alvosNaFaixa, 0);
  assert.equal(m.alvosForaDaFaixa, 0);
  assert.equal(m.semFaixaApurada, 1);
});

test('a porcentagem não conta indeterminada no denominador', () => {
  /* Uma dentro, uma fora, oito sem receita: 50%, não 10%. Contar as ausentes
     como fora faria a base do CNPJ — onde receita é nula em todos os registros —
     reportar 0% em vez de "não apurado". */
  const conjunto = [
    empresa('distribuicao', 300),
    empresa('distribuicao', 35),
    ...Array.from({ length: 8 }, () => empresa('distribuicao', null)),
  ];
  const m = MERCADO.metricas(conjunto);
  assert.equal(m.alvosNaFaixa, 1);
  assert.equal(m.alvosForaDaFaixa, 1);
  assert.equal(m.semFaixaApurada, 8);
  assert.equal(m.pctNaFaixa, 50);
});

test('sem nenhuma faixa avaliada, a porcentagem é null e não zero', () => {
  /* É exatamente o caso da base do CNPJ. Zero afirmaria "nenhuma na faixa";
     null diz "não apurado", que é a verdade. */
  const m = MERCADO.metricas([empresa('distribuicao', null), empresa('distribuicao', null)]);
  assert.equal(m.pctNaFaixa, null);
  assert.equal(m.semFaixaApurada, 2);
});

test('subsetor sem alvo de boutique não produz falso positivo', () => {
  /* Petroquímica básica tem faixaConsolidavel null com o motivo declarado: a
     escala mínima de um cracker é bilionária. Nenhuma receita cai na faixa
     porque não há faixa. */
  const semFaixa = SETORES.SUBSETORES.find((s) => s.faixaConsolidavel === null);
  assert.ok(semFaixa, 'a taxonomia deixou de ter subsetor sem faixa — reveja este teste');

  const m = MERCADO.metricas([empresa(semFaixa.chave, 100), empresa(semFaixa.chave, 5000)]);
  assert.equal(m.alvosNaFaixa, 0);
  assert.equal(m.semFaixaApurada, 2, 'sem faixa declarada, o certo é indeterminado, não "fora"');
});

test('cada empresa é medida pela faixa do seu próprio subsetor', () => {
  const dist = SETORES.faixaDe('distribuicao');
  const outro = SETORES.SUBSETORES.find(
    (s) => s.faixaConsolidavel && s.chave !== 'distribuicao'
      && (s.faixaConsolidavel.min !== dist.min || s.faixaConsolidavel.max !== dist.max),
  );
  assert.ok(outro, 'nenhum subsetor com faixa diferente — reveja este teste');

  /* Um valor dentro de distribuição e fora do outro subsetor, ou vice-versa:
     se a régua fosse única, os dois cairiam do mesmo lado. */
  const m = MERCADO.metricas([
    empresa('distribuicao', dist.min + 1),
    empresa(outro.chave, outro.faixaConsolidavel.max + 1),
  ]);
  assert.equal(m.alvosNaFaixa, 1);
  assert.equal(m.alvosForaDaFaixa, 1);
});

test('o total continua fechando', () => {
  /* Regra 6 do projeto: nada entra no índice sem entrar no denominador. */
  const conjunto = [
    empresa('distribuicao', 300),
    empresa('distribuicao', 35),
    empresa('distribuicao', null),
  ];
  const m = MERCADO.metricas(conjunto);
  assert.equal(m.alvosNaFaixa + m.alvosForaDaFaixa + m.semFaixaApurada, conjunto.length);
  assert.equal(m.contagem, conjunto.length);
});
