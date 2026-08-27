/* =============================================================================
 *  GHT4 · carregador do motor para testes
 * -----------------------------------------------------------------------------
 *  Os .js da raiz são scripts de navegador: publicam em `window.NOME` por efeito
 *  colateral e não têm `import`/`export`. Isso é deliberado — é o que faz o
 *  duplo-clique no index.html funcionar sem servidor e sem rede.
 *
 *  Para testá-los em Node, monta-se um `window` falso num contexto de vm e
 *  carregam-se os arquivos NA MESMA ORDEM do index.html. A ordem importa:
 *  scoring.js consulta `window.EVIDENCIA` no momento da avaliação.
 *
 *  A base química (22 MB) fica fora por padrão. Peça-a explicitamente:
 *      carregarMotor({ comBaseQuimica: true })
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* A ordem do index.html, menos as bases pesadas. */
const ORDEM_BASE = [
  'setores.js',
  'fontes.js',
  'data.js',
  'data-real.js',
  'evidencias.js',
  'scoring.js',
  'configuracao.js',
  'mercado.js',
  'matchmaking.js',
  'conexoes.js',
  'crm.js',
  'analises.js',
  'exportar-excel.js',
];

/** localStorage de mentira: os módulos 4, 5 e 7 persistem nele ao carregar. */
function localStorageFalso() {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => void mapa.set(k, String(v)),
    removeItem: (k) => void mapa.delete(k),
    clear: () => void mapa.clear(),
    key: (i) => [...mapa.keys()][i] ?? null,
    get length() { return mapa.size; },
  };
}

/**
 * Carrega o motor num contexto isolado e devolve o `window` resultante.
 * Cada chamada monta um contexto novo — testes não vazam estado entre si.
 */
export function carregarMotor({ comBaseQuimica = false, comIbama = false } = {}) {
  const janela = {};
  const ctx = {
    console,
    window: janela,
    localStorage: localStorageFalso(),
    document: undefined,
    setTimeout,
    clearTimeout,
    URL,
    Blob: undefined,
    fetch: undefined,
  };
  ctx.window.window = janela;
  ctx.window.localStorage = ctx.localStorage;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const arquivos = [...ORDEM_BASE];
  /* Entram logo após data-real.js, como no index.html. */
  if (comIbama) arquivos.splice(4, 0, 'data-ibama.js');
  if (comBaseQuimica) arquivos.splice(4, 0, 'data-quimicos.js');

  for (const arquivo of arquivos) {
    const caminho = path.join(RAIZ, arquivo);
    if (!fs.existsSync(caminho)) {
      throw new Error(`motor.mjs: ${arquivo} não existe. Foi renomeado ou é gerado e ainda não foi produzido?`);
    }
    try {
      vm.runInContext(fs.readFileSync(caminho, 'utf8'), ctx, { filename: arquivo });
    } catch (erro) {
      throw new Error(`motor.mjs: falha ao carregar ${arquivo} — ${erro.message}`, { cause: erro });
    }
  }

  return janela;
}

/**
 * O importador consome a taxonomia? Confere sem executá-lo — rodar de verdade
 * dispararia o download de ~5 GB dos dados abertos do CNPJ.
 *
 * Desde a Fase 1 ele não carrega mais uma cópia da tabela: importa
 * `tabelaSubsetorPorCnae` de packages/domain. Este teste existe para que
 * reintroduzir um literal duplicado ali volte a ser um erro visível.
 */
export function importadorUsaFonteUnica() {
  const fonte = fs.readFileSync(path.join(RAIZ, 'ferramentas', 'importar-cnpj.mjs'), 'utf8');
  return {
    importa: /import \{[^}]*tabelaSubsetorPorCnae[^}]*\} from '\.\.\/packages\/domain\/taxonomia\.mjs'/.test(fonte),
    temLiteralDuplicado: /const SUBSETOR_POR_CNAE = \{[\s\S]*?'\d{7}':/.test(fonte),
  };
}

/** Roda o conferidor dos globais gerados. Devolve o código de saída. */
export function conferirGeradosEmDia() {
  const { status } = spawnSync(
    process.execPath,
    [path.join(RAIZ, 'ferramentas', 'gerar-globais.mjs'), '--conferir'],
    { cwd: RAIZ, encoding: 'utf8' },
  );
  return status;
}
