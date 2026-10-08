/* A lista de subsetores da tela espelha a taxonomia: um subsetor novo ou renomeado lá
   precisa aparecer no seletor, ou a tela ofereceria um escopo que o servidor recusa. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './apoio/dom.mjs';

const { SUBSETORES_ALVO, SUBSETOR_ORIGINAL, rotuloSubsetor } = await import('../v1/src/agente/pesquisa.ts');
const { subsetoresAcionaveis } = await import('../packages/domain/taxonomia.mjs');
const servidor = await import('../server/src/agente/catalogo.mjs');

test('setores-alvo: a tela oferece exatamente os subsetores acionáveis da taxonomia', () => {
  assert.deepEqual([...SUBSETORES_ALVO], subsetoresAcionaveis().map((s) => s.rotulo));
  assert.deepEqual([...SUBSETORES_ALVO], servidor.SUBSETORES_ALVO);
  assert.equal(SUBSETOR_ORIGINAL, servidor.SUBSETOR);
  assert.equal(rotuloSubsetor('todos'), 'todos os setores-alvo');
  assert.equal(rotuloSubsetor(undefined), 'todos os setores-alvo');
  assert.equal(rotuloSubsetor('Defensivos agrícolas'), 'Defensivos agrícolas');
});
