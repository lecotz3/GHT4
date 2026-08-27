/* =============================================================================
 *  GHT4 · testes do contrato Dado<T>
 * -----------------------------------------------------------------------------
 *  O que estes testes protegem é a diferença entre "não sei" e "não atende" —
 *  a regra que o projeto já seguia por disciplina e que agora é tipo.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dado, naoApurado, ehDado, ehApurado, temLastro, valorDe,
  cobertura, rotuloDoEstado, ESTADOS,
} from '../packages/schemas/dado.mjs';

const receita = (v, meta) => dado(v, { unidade: 'BRL_milhoes', periodo: '2025', ...meta });

test('um valor reportado carrega fonte, unidade e período', () => {
  const d = receita(300, { estado: 'reportado', fonte: 'cvm_dfp', observadoEm: '2026-03-31' });
  assert.equal(d.valor, 300);
  assert.equal(d.estado, 'reportado');
  assert.equal(d.fonte, 'cvm_dfp');
  assert.equal(d.unidade, 'BRL_milhoes');
  assert.ok(temLastro(d));
});

test('ausência exige motivo', () => {
  assert.throws(() => naoApurado(), /motivo é obrigatório/);
  assert.throws(() => naoApurado(''), /motivo é obrigatório/);

  const d = naoApurado('o cadastro do CNPJ não publica faturamento');
  assert.equal(d.valor, null);
  assert.equal(d.estado, 'nao_apurado');
  assert.match(d.motivo, /não publica faturamento/);
});

test('null com estado apurado é erro, não ausência silenciosa', () => {
  assert.throws(
    () => dado(null, { estado: 'reportado', fonte: 'cvm_dfp', unidade: 'BRL_milhoes' }),
    /Ausência é naoApurado/,
  );
});

test('quem afirma lastro precisa dizer a fonte', () => {
  assert.throws(
    () => receita(300, { estado: 'reportado' }),
    /exige fonte/,
  );
  assert.throws(
    () => receita(300, { estado: 'estimado' }),
    /exige fonte/,
  );
  /* Inferido não exige fonte — justamente porque não tem. Mas também não
     ganha lastro. */
  const inferido = receita(300, { estado: 'inferido', metodo: 'proporção do capital social' });
  assert.ok(ehApurado(inferido));
  assert.ok(!temLastro(inferido), 'inferência não pode contar como lastro');
});

test('número sem unidade é recusado', () => {
  /* "R$ 300" — mil ou milhões? A seção 7.4 do plano exige unidade e período. */
  assert.throws(
    () => dado(300, { estado: 'inferido' }),
    /exige unidade/,
  );
  /* Texto não precisa de unidade. */
  assert.doesNotThrow(() => dado('familiar', { estado: 'reportado', fonte: 'rfb_cnpj' }));
});

test('estado inválido é recusado', () => {
  assert.throws(() => dado(1, { estado: 'talvez', unidade: 'pct' }), /estado inválido/);
  assert.throws(
    () => dado(1, { estado: 'nao_apurado', unidade: 'pct' }),
    /use naoApurado/,
  );
});

test('confiança fora de 0..1 é recusada', () => {
  assert.throws(() => receita(300, { estado: 'proxy', confianca: 1.5 }), /confiança fora/);
  assert.throws(() => receita(300, { estado: 'proxy', confianca: -0.1 }), /confiança fora/);
  assert.doesNotThrow(() => receita(300, { estado: 'proxy', confianca: 0.4 }));
});

test('valorDe devolve null para ausência, sem lançar', () => {
  assert.equal(valorDe(naoApurado('sem fonte de porte')), null);
  assert.equal(valorDe(receita(300, { estado: 'proxy' })), 300);
  assert.equal(valorDe(null), null);
  assert.equal(valorDe(42), null, 'valor cru não é Dado');
});

test('ehDado não deixa valor cru passar por engano', () => {
  assert.ok(!ehDado(300));
  assert.ok(!ehDado(null));
  assert.ok(!ehDado({ valor: 300 }));
  assert.ok(ehDado(naoApurado('motivo')));
});

test('o Dado é imutável', () => {
  const d = receita(300, { estado: 'reportado', fonte: 'cvm_dfp' });
  assert.throws(() => { d.valor = 999; }, TypeError);
});

test('cobertura mede quanto se apoia em documento', () => {
  const ficha = {
    receita: receita(300, { estado: 'reportado', fonte: 'cvm_dfp' }),
    margem: dado(0.08, { estado: 'estimado', fonte: 'econodata', unidade: 'pct', periodo: '2025' }),
    funcionarios: dado(120, { estado: 'inferido', unidade: 'pessoas' }),
    crescimento: naoApurado('série histórica não disponível'),
  };
  const c = cobertura(ficha);
  assert.equal(c.total, 4);
  assert.equal(c.comLastro, 2);
  assert.equal(c.apurados, 3);
  assert.equal(c.ausentes, 1);
  assert.equal(c.pctComLastro, 50);
});

test('cobertura de conjunto vazio é null, não zero', () => {
  /* Zero afirmaria "nada tem lastro". A verdade é "não há o que medir". */
  assert.equal(cobertura({}).pctComLastro, null);
  assert.equal(cobertura(null).pctComLastro, null);
});

test('todo estado tem rótulo, e o de inferido avisa', () => {
  for (const e of ESTADOS) {
    assert.equal(typeof rotuloDoEstado(e), 'string');
    assert.ok(rotuloDoEstado(e).length > 0);
  }
  assert.match(rotuloDoEstado('inferido'), /sem documento/);
});
