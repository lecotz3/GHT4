/* =============================================================================
 *  GHT4 · a ordem de carga dos globais precisa funcionar nas DUAS interfaces
 * -----------------------------------------------------------------------------
 *  Os scripts da raiz são gerados de packages/domain, e o gerador resolve
 *  `import * as X from './y.mjs'` como `const X = window.GLOBAL;` — uma leitura
 *  que acontece na CARGA, não na chamada. Isso torna a ordem dos <script> parte
 *  do contrato.
 *
 *  E as duas interfaces carregam listas DIFERENTES:
 *    · index.html   carrega a taxonomia, as bases e o motor;
 *    · v1           carrega o motor e as camadas, via src/dominio/index.ts.
 *
 *  Quando mercado.js passou a depender de window.SETORES, a v1 quebrou em tempo
 *  de execução — e `npm run build` e `npm run lint` passaram os dois. Este
 *  arquivo existe para que esse tipo de quebra apareça como teste, e não numa
 *  reunião.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { RAIZ } from './motor.mjs';

/** Lê a ordem real dos <script src> do index.html. */
function ordemDoIndexHtml() {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  return [...html.matchAll(/<script[^>]*src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((src) => !src.startsWith('http'));
}

/** Lê a ordem real dos `import '@dominio/x.js'` da ponte da v1. */
function ordemDaV1() {
  const ts = fs.readFileSync(path.join(RAIZ, 'v1', 'src', 'dominio', 'index.ts'), 'utf8');
  return [...ts.matchAll(/^import '@dominio\/([\w.-]+)'/gm)].map((m) => m[1]);
}

/** Carrega uma lista de scripts num window falso e devolve o resultado. */
function carregar(arquivos, { pularAusentes = false } = {}) {
  const janela = {};
  const memoria = new Map();
  const ctx = {
    console,
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

  for (const arquivo of arquivos) {
    const caminho = path.join(RAIZ, arquivo);
    if (!fs.existsSync(caminho)) {
      if (pularAusentes) continue;
      throw new Error(`${arquivo} não existe`);
    }
    vm.runInContext(fs.readFileSync(caminho, 'utf8'), ctx, { filename: arquivo });
  }
  return janela;
}

const empresa = (subsetor, receita) => ({
  subsetor, receita,
  crescimento: null, margemEbitda: null, alavancagem: null,
});

test('index.html carrega a taxonomia antes de quem depende dela', () => {
  const ordem = ordemDoIndexHtml();
  assert.ok(ordem.includes('setores.js'), 'index.html não carrega setores.js');

  const i = ordem.indexOf('setores.js');
  for (const dependente of ['scoring.js', 'mercado.js']) {
    const j = ordem.indexOf(dependente);
    if (j >= 0) {
      assert.ok(i < j, `index.html carrega ${dependente} antes de setores.js`);
    }
  }
});

test('a v1 carrega a taxonomia antes de mercado.js', () => {
  const ordem = ordemDaV1();
  const i = ordem.indexOf('setores.js');
  const j = ordem.indexOf('mercado.js');

  assert.ok(i >= 0, 'a ponte da v1 não importa setores.js — mercado.js vai quebrar ao avaliar a faixa');
  assert.ok(j >= 0, 'a ponte da v1 não importa mercado.js');
  assert.ok(i < j, 'a v1 importa mercado.js antes de setores.js');
});

test('a lista da v1 realmente roda, e metricas() não quebra', () => {
  /* Reproduz a carga da v1 de verdade: se um global ler outro que ainda não
     existe, isto estoura aqui em vez de estourar na tela. */
  const janela = carregar(ordemDaV1(), { pularAusentes: true });

  assert.ok(janela.MERCADO, 'a carga da v1 não publicou window.MERCADO');
  const m = janela.MERCADO.metricas([empresa('distribuicao', 300)]);
  assert.equal(m.alvosNaFaixa, 1, 'metricas() não avaliou a faixa na carga da v1');
});

test('a lista do index.html realmente roda', () => {
  /* Sem as bases pesadas: data-quimicos.js tem 22 MB e não muda o que se testa
     aqui, que é se a ordem resolve as dependências entre os globais. */
  const pesadas = new Set(['data-quimicos.js', 'data-ibama.js']);
  const janela = carregar(ordemDoIndexHtml().filter((f) => !pesadas.has(f)));

  assert.ok(janela.SETORES, 'a carga do index.html não publicou window.SETORES');
  assert.ok(janela.MOTOR, 'a carga do index.html não publicou window.MOTOR');
});

test('todo global gerado é carregado por alguma interface', () => {
  /* Um módulo portado para packages/domain que ninguém carrega é código morto
     esperando para ser descoberto tarde. */
  const carregados = new Set([...ordemDoIndexHtml(), ...ordemDaV1()]);
  const manifesto = fs.readFileSync(
    path.join(RAIZ, 'ferramentas', 'gerar-globais.mjs'), 'utf8',
  );
  const destinos = [...manifesto.matchAll(/destino: '([\w.-]+)'/g)].map((m) => m[1]);

  assert.ok(destinos.length > 0, 'não consegui ler o manifesto de gerar-globais.mjs');
  for (const destino of destinos) {
    assert.ok(carregados.has(destino), `${destino} é gerado mas nenhuma interface o carrega`);
  }
});
