/* =============================================================================
 *  GHT4 · o funil do piloto químico continua reproduzível?
 * -----------------------------------------------------------------------------
 *  O adendo (§10) é explícito: "o funil atual deve continuar reproduzível" e
 *  "nenhum número deve ser hardcoded como verdade permanente".
 *
 *  Este arquivo trava duas coisas diferentes, e a distinção importa:
 *
 *  1. O FUNIL DECLARADO — 38.583 → 6.592 → 1.670 → 204 → 35 — que é o
 *     enquadramento por CNAE, sem regra de exclusão. É o baseline histórico, e
 *     precisa reproduzir exatamente sobre este snapshot.
 *
 *  2. O FUNIL DO CLASSIFICADOR, que é mais estrito porque aplica as exclusões
 *     do §8.3 do plano: adjacência declarada, natureza jurídica que não é alvo.
 *     Dá números MENORES, e isso é melhoria, não regressão.
 *
 *  A diferença entre os dois é medida e explicada aqui. Se ela mudar sem alguém
 *  decidir, o teste reprova — que é o ponto.
 *
 *  Estes números valem para o snapshot de referência 2026-08. Trocado o
 *  snapshot, os números mudam e este arquivo muda junto: eles descrevem um
 *  estado do mundo, não uma constante.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { classificar, dentroDoSubsetor } from '../packages/domain/classificacao.mjs';
import { RAIZ } from './motor.mjs';

const SUBSETOR = 'Distribuição e trading químico';
const REFERENCIA = '2026-08';

/* A base tem 22 MB. Carrega uma vez para todos os testes deste arquivo. */
const base = (() => {
  const arquivos = ['data-quimicos.js', 'data-ibama.js']
    .map((n) => path.join(RAIZ, n));

  if (!arquivos.every((a) => fs.existsSync(a))) return null;

  const ctx = { console, window: {} };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  for (const a of arquivos) {
    vm.runInContext(fs.readFileSync(a, 'utf8'), ctx, { filename: path.basename(a) });
  }
  return {
    empresas: ctx.window.EMPRESAS_QUIMICOS,
    ibama: ctx.window.IBAMA_PEGADA,
    referencia: ctx.window.REFERENCIA_QUIMICOS,
  };
})();

/* A base é gerada por `node ferramentas/importar-cnpj.mjs` e pode não existir
   num clone recém-feito. Pular é honesto; falhar seria ruído. */
const pular = base ? false : 'data-quimicos.js não foi gerado neste clone';

const rappVivo = (e) => Boolean(base.ibama[e.cnpjRaiz]?.viva);

test('a base é a do snapshot de referência', { skip: pular }, () => {
  assert.equal(base.referencia, REFERENCIA,
    'a base mudou de referência — os números abaixo descrevem outro snapshot');
});

test('o funil declarado reproduz exatamente', { skip: pular }, () => {
  /* Enquadramento por CNAE, sem regra de exclusão: é o baseline histórico do
     plano §8.1 e do adendo §10. */
  const universo = base.empresas;
  const doSubsetor = universo.filter((e) => e.subsetor === SUBSETOR);
  const porPrincipal = doSubsetor.filter((e) => !e.enquadramentoPorSecundario);
  const comSucessao = porPrincipal.filter((e) => e.sucessaoProvavel);
  const comRapp = comSucessao.filter(rappVivo);

  assert.equal(universo.length, 38583, 'o universo químico ativo mudou');
  assert.equal(doSubsetor.length, 6592, 'a associação a Distribuição e Trading mudou');
  assert.equal(porPrincipal.length, 1670, 'o corte por CNAE principal mudou');
  assert.equal(comSucessao.length, 204, 'a janela de sucessão mudou');
  assert.equal(comRapp.length, 35, 'a coorte com RAPP vivo mudou');
});

test('o filtro de sucessão é opcional, e o funil sem ele é maior', { skip: pular }, () => {
  /* O plano §8.1 diz que os 35 são coorte de VALIDAÇÃO, não o universo final.
     Tratá-los como o alvo seria confundir amostra com população. */
  const porPrincipal = base.empresas
    .filter((e) => e.subsetor === SUBSETOR && !e.enquadramentoPorSecundario);

  const comRappSemSucessao = porPrincipal.filter(rappVivo);
  const comRappComSucessao = porPrincipal.filter((e) => e.sucessaoProvavel && rappVivo(e));

  assert.ok(comRappSemSucessao.length > comRappComSucessao.length,
    'sem o filtro de sucessão o funil deveria ser maior');
  assert.equal(comRappComSucessao.length, 35);
});

test('o classificador é mais estrito que o funil declarado, e a diferença é explicada', { skip: pular }, () => {
  const doSubsetor = base.empresas.filter((e) => e.subsetor === SUBSETOR);

  const porSinal = {};
  let excluidas = 0;
  for (const e of doSubsetor) {
    const r = classificar(e, { rappVivo: rappVivo(e) });
    if (r.estado === 'excluida') {
      excluidas++;
      porSinal[r.sinais[0]] = (porSinal[r.sinais[0]] ?? 0) + 1;
    }
  }

  /* 427 dos 6.592 saem: são adjacência declarada (combustível, cosmético
     acabado) e naturezas que não são alvo de aquisição. */
  assert.equal(excluidas, 427, 'o número de exclusões mudou sem decisão');
  assert.equal(porSinal.adjacencia, 361);
  assert.equal(porSinal.natureza_exterior, 60);
  assert.equal(porSinal.natureza_sem_fins, 6);
  assert.equal(doSubsetor.length - excluidas, 6165);
});

test('o universo inteiro sai classificado, e 100% com motivo', { skip: pular }, () => {
  /* Critério de aceite da Fase 3. */
  const resumo = { confirmada: 0, provavel: 0, possivel: 0, excluida: 0 };
  let semMotivo = 0;

  for (const e of base.empresas) {
    const r = classificar(e, { rappVivo: rappVivo(e) });
    resumo[r.estado]++;
    if (!r.motivo || r.motivo.trim().length === 0) semMotivo++;
  }

  assert.equal(semMotivo, 0, `${semMotivo} registros sem motivo`);
  assert.equal(
    resumo.confirmada + resumo.provavel + resumo.possivel + resumo.excluida,
    base.empresas.length,
    'o resumo não fecha com o universo',
  );

  /* Distribuição sobre o snapshot 2026-08. Mudou muito? Foi decisão de alguém? */
  assert.equal(resumo.confirmada, 2841);
  assert.equal(resumo.provavel, 9642);
  assert.equal(resumo.possivel, 24443);
  assert.equal(resumo.excluida, 1657);
});

test('a maior parte do universo é "possível" — e isso é a verdade, não um defeito', { skip: pular }, () => {
  /* 63% entram só por CNAE secundário. Apresentar isso como se fosse universo
     qualificado seria o erro; declarar que é fila de revisão é o produto. */
  const resumo = { possivel: 0, dentro: 0 };
  for (const e of base.empresas) {
    const r = classificar(e, { rappVivo: rappVivo(e) });
    if (r.estado === 'possivel') resumo.possivel++;
    if (dentroDoSubsetor(r.estado)) resumo.dentro++;
  }

  assert.ok(resumo.possivel > resumo.dentro,
    'o universo deixou de ser majoritariamente candidato a revisão — foi decisão?');
});

test('Distribuição e Trading, pelo classificador', { skip: pular }, () => {
  const porEstado = { confirmada: 0, provavel: 0, possivel: 0 };
  for (const e of base.empresas) {
    const r = classificar(e, { rappVivo: rappVivo(e) });
    if (r.subsetor === SUBSETOR) porEstado[r.estado]++;
  }

  assert.equal(porEstado.confirmada, 226);
  assert.equal(porEstado.provavel, 1387);
  assert.equal(porEstado.possivel, 4552);

  /* Confirmada + provável = 1.613, contra os 1.670 do funil declarado. A
     diferença de 57 são as exclusões aplicadas ao corte por CNAE principal. */
  assert.equal(porEstado.confirmada + porEstado.provavel, 1613);
});
