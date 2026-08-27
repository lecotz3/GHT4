/* =============================================================================
 *  GHT4 · o motor portado devolve o mesmo que o de antes?
 * -----------------------------------------------------------------------------
 *  A Fase 1 tirou as regras de `window.*` e as moveu para packages/domain. Os
 *  scripts da raiz passaram a ser gerados, as dependências viraram import, e as
 *  guardas deixaram de testar o módulo para testar a capacidade.
 *
 *  Nada disso deveria mudar UM número. Este arquivo prova que não mudou, e é o
 *  que o aceite da fase pede: "resultados do motor atual são reproduzidos para
 *  fixtures conhecidas, ou as diferenças são documentadas e aprovadas".
 *
 *  COMO
 *  Busca no git a versão dos .js da raiz ANTES do porte, carrega as duas
 *  versões em contextos separados, roda as duas sobre a mesma base de
 *  demonstração e compara o resultado inteiro.
 *
 *  Se o commit de referência sumir (rebase, squash), o teste se declara pulado
 *  em vez de falhar: ele afirma uma equivalência histórica, e não faz sentido
 *  reprovar a suíte porque a história foi reescrita.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { RAIZ } from './motor.mjs';

/* Último commit antes de os módulos de regra saírem do window.*. */
const ANTES = '6be71ea';

/* A ordem do index.html mais as camadas que só a v1 carrega. */
const ORDEM = [
  'setores.js', 'data.js', 'evidencias.js', 'scoring.js',
  'configuracao.js', 'conexoes.js', 'mercado.js', 'matchmaking.js',
];

function doGit(revisao, arquivo) {
  const r = spawnSync('git', ['show', `${revisao}:${arquivo}`], {
    cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : null;
}

function contexto() {
  const janela = {};
  const memoria = new Map();
  const ctx = {
    console: { ...console, warn: () => {}, error: () => {} },
    window: janela,
    localStorage: {
      getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
      setItem: (k, v) => void memoria.set(k, String(v)),
      removeItem: (k) => void memoria.delete(k),
      clear: () => void memoria.clear(),
    },
    setTimeout, clearTimeout, URL,
  };
  ctx.window.window = janela;
  ctx.window.localStorage = ctx.localStorage;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  return { ctx, janela };
}

/** Carrega uma versão do motor: 'agora' lê do disco, um sha lê do git. */
function carregarVersao(revisao) {
  const { ctx, janela } = contexto();
  for (const arquivo of ORDEM) {
    const fonte = revisao === 'agora'
      ? fs.readFileSync(path.join(RAIZ, arquivo), 'utf8')
      : doGit(revisao, arquivo);
    if (fonte === null) return null;
    /* armazenamento.js não existia antes do porte; conexoes.js da versão nova
       depende dele. Carrega quando existir na revisão pedida. */
    vm.runInContext(fonte, ctx, { filename: `${revisao}:${arquivo}` });
  }
  return janela;
}

/** Só o que é comparável: números e rótulos, sem funções nem ordem instável. */
function retrato(janela) {
  const base = janela.EMPRESAS_DEMO;
  const avaliadas = base
    .map((e) => janela.MOTOR.avaliarEmpresa(e))
    .map((a) => JSON.parse(JSON.stringify(a)));

  return {
    quantas: base.length,
    avaliadas,
    mapa: JSON.parse(JSON.stringify(janela.MERCADO.mapear(base))),
  };
}

const referenciaExiste = doGit(ANTES, 'scoring.js') !== null;

test('o motor portado reproduz o de antes, empresa por empresa', { skip: !referenciaExiste && `commit de referência ${ANTES} não está mais no histórico` }, () => {
  const antes = carregarVersao(ANTES);
  assert.ok(antes, `não consegui carregar a versão ${ANTES}`);

  /* A versão nova carrega armazenamento.js, que a antiga não tinha. */
  const agora = carregarVersaoAtual();

  const a = retrato(antes);
  const b = retrato(agora);

  assert.equal(b.quantas, a.quantas, 'a base de demonstração mudou de tamanho');

  for (let i = 0; i < a.avaliadas.length; i++) {
    assert.deepEqual(
      b.avaliadas[i], a.avaliadas[i],
      `a avaliação da empresa ${i} (${antes.EMPRESAS_DEMO[i]?.nome}) mudou com o porte`,
    );
  }
});

test('o mapa de mercado só mudou onde a faixa foi corrigida', { skip: !referenciaExiste && `commit de referência ${ANTES} não está mais no histórico` }, () => {
  /* A correção da faixa consolidável entrou ANTES deste commit de referência,
     então aqui o mapa tem de sair idêntico: o porte não muda número nenhum. */
  const a = retrato(carregarVersao(ANTES));
  const b = retrato(carregarVersaoAtual());
  assert.deepEqual(b.mapa, a.mapa, 'o mapa de mercado mudou com o porte');
});

/** A versão de agora inclui armazenamento.js, que não existia antes. */
function carregarVersaoAtual() {
  const { ctx, janela } = contexto();
  const ordem = ['setores.js', 'armazenamento.js', ...ORDEM.slice(1)];
  for (const arquivo of ordem) {
    vm.runInContext(
      fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), ctx, { filename: `agora:${arquivo}` },
    );
  }
  return janela;
}
