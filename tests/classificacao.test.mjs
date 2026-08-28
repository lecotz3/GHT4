/* =============================================================================
 *  GHT4 · testes da classificação em quatro estados
 * -----------------------------------------------------------------------------
 *  O que estes testes protegem: que "é distribuidora química" e "é boa alvo"
 *  continuem sendo perguntas separadas, e que nenhum registro saia sem motivo.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classificar, classificarLote, dentroDoSubsetor, forcaDoEstado, ESTADOS,
} from '../packages/domain/classificacao.mjs';

const distribuidora = (extra = {}) => ({
  cnaePrincipal: '4684201',
  cnaeSecundarias: [],
  situacaoCadastral: 'ativa',
  naturezaJuridica: '2062', // LTDA
  ...extra,
});

test('CNAE principal com RAPP vivo é confirmada', () => {
  const r = classificar(distribuidora(), { rappVivo: true });
  assert.equal(r.estado, 'confirmada');
  assert.equal(r.subsetor, 'Distribuição e trading químico');
  assert.ok(r.sinais.includes('cnae_principal'));
  assert.ok(r.sinais.includes('rapp_vivo'));
  assert.match(r.motivo, /RAPP\/IBAMA vivo/);
});

test('certificado de associação confirma com a maior confiança', () => {
  const r = classificar(distribuidora(), { certificadoAssociacao: true });
  assert.equal(r.estado, 'confirmada');
  assert.ok(r.confianca > 0.95);
  assert.ok(r.sinais.includes('certificado_associacao'));
});

test('CNAE principal sem evidência operacional é apenas provável', () => {
  const r = classificar(distribuidora());
  assert.equal(r.estado, 'provavel');
  assert.match(r.motivo, /sem evidência operacional/);
});

test('só CNAE secundário é possível, nunca confirmada', () => {
  /* Mesmo com RAPP: o RAPP confirma que a empresa opera com químico, não que o
     negócio principal dela seja distribuição. Uma indústria de alimentos tem
     RAPP e não é distribuidora. */
  const empresa = distribuidora({ cnaePrincipal: '1091102', cnaeSecundarias: ['4684201'] });

  const semRapp = classificar(empresa);
  assert.equal(semRapp.estado, 'possivel');
  assert.match(semRapp.motivo, /apenas pelo CNAE secundário/);

  const comRapp = classificar(empresa, { rappVivo: true });
  assert.equal(comRapp.estado, 'possivel', 'o RAPP promoveu um enquadramento secundário');
  assert.ok(comRapp.confianca > semRapp.confianca, 'o RAPP deveria elevar a confiança');
});

test('o CNAE de descoberta levanta candidato e não enquadra', () => {
  /* 4689399 é "outros produtos não especificados": metade do atacado brasileiro
     cabe ali. */
  const r = classificar(distribuidora({ cnaePrincipal: '4689399' }));
  assert.equal(r.estado, 'possivel');
  assert.equal(r.subsetor, null);
  assert.ok(r.confianca < 0.3);
  assert.match(r.motivo, /genérico demais/);
});

test('situação cadastral não ativa exclui antes de qualquer CNAE', () => {
  const r = classificar(distribuidora({ situacaoCadastral: 'baixada' }));
  assert.equal(r.estado, 'excluida');
  assert.match(r.motivo, /baixada/);
  assert.ok(r.sinais.includes('situacao_nao_ativa'));
});

test('associação, fundação e estatal são excluídas com o motivo certo', () => {
  const associacao = classificar(distribuidora({ naturezaJuridica: '3999' }));
  assert.equal(associacao.estado, 'excluida');
  assert.match(associacao.motivo, /sem fins lucrativos/);

  const estatal = classificar(distribuidora({ naturezaJuridica: '2038' }));
  assert.equal(estatal.estado, 'excluida');
  assert.match(estatal.motivo, /economia mista|pública/);

  const exterior = classificar(distribuidora({ naturezaJuridica: '2216' }));
  assert.equal(exterior.estado, 'excluida');
  assert.match(exterior.motivo, /exterior/);
});

test('CNAE fora da taxonomia é excluído dizendo qual era', () => {
  const r = classificar(distribuidora({ cnaePrincipal: '5611201' })); // restaurante
  assert.equal(r.estado, 'excluida');
  assert.match(r.motivo, /5611201/);
  assert.ok(r.sinais.includes('fora_da_taxonomia'));
});

test('sem CNAE nenhum, exclui dizendo que não há como enquadrar', () => {
  const r = classificar(distribuidora({ cnaePrincipal: null }));
  assert.equal(r.estado, 'excluida');
  assert.match(r.motivo, /sem CNAE principal/);
});

test('TODA classificação devolve motivo não vazio', () => {
  /* Critério de aceite: 100% dos registros com motivo de inclusão ou exclusão. */
  const casos = [
    distribuidora(),
    distribuidora({ situacaoCadastral: 'baixada' }),
    distribuidora({ naturezaJuridica: '3999' }),
    distribuidora({ cnaePrincipal: '5611201' }),
    distribuidora({ cnaePrincipal: '4689399' }),
    distribuidora({ cnaePrincipal: null }),
    distribuidora({ cnaePrincipal: '1091102', cnaeSecundarias: ['4684201'] }),
  ];

  for (const caso of casos) {
    for (const evidencias of [{}, { rappVivo: true }, { certificadoAssociacao: true }]) {
      const r = classificar(caso, evidencias);
      assert.ok(ESTADOS.includes(r.estado), `estado inválido: ${r.estado}`);
      assert.ok(typeof r.motivo === 'string' && r.motivo.trim().length > 10,
        `motivo vazio ou curto demais para ${JSON.stringify(caso)}`);
      assert.ok(Array.isArray(r.sinais) && r.sinais.length > 0, 'sem sinais');
      assert.ok(r.confianca > 0 && r.confianca <= 1, `confiança fora de 0..1: ${r.confianca}`);
    }
  }
});

test('a força dos estados ordena a fila de revisão', () => {
  assert.ok(forcaDoEstado('confirmada') > forcaDoEstado('provavel'));
  assert.ok(forcaDoEstado('provavel') > forcaDoEstado('possivel'));
  assert.ok(forcaDoEstado('possivel') > forcaDoEstado('excluida'));
});

test('"dentro do subsetor" exclui possível por padrão', () => {
  /* Possível é candidato a revisar, não empresa a apresentar ao sócio. */
  assert.equal(dentroDoSubsetor('confirmada'), true);
  assert.equal(dentroDoSubsetor('provavel'), true);
  assert.equal(dentroDoSubsetor('possivel'), false);
  assert.equal(dentroDoSubsetor('possivel', { incluirPossivel: true }), true);
  assert.equal(dentroDoSubsetor('excluida', { incluirPossivel: true }), false);
});

test('o lote resume por estado e não perde ninguém', () => {
  const empresas = [
    distribuidora(),
    distribuidora({ cnaePrincipal: '5611201' }),
    distribuidora({ cnaePrincipal: '1091102', cnaeSecundarias: ['4684201'] }),
    distribuidora(),
  ];

  const { resumo, total, resultados } = classificarLote(
    empresas,
    (e) => ({ rappVivo: e.cnaePrincipal === '4684201' }),
  );

  assert.equal(total, 4);
  assert.equal(resultados.length, 4);
  assert.equal(resumo.confirmada + resumo.provavel + resumo.possivel + resumo.excluida, 4,
    'o resumo não fecha com o total');
  assert.equal(resumo.confirmada, 2);
  assert.equal(resumo.possivel, 1);
  assert.equal(resumo.excluida, 1);
});
