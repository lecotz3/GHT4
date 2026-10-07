/* Carregador de módulos só para testes de componente: transpila .ts/.tsx de v1/src com o
   TypeScript do próprio v1 (JSX automático), resolve importações sem extensão como o Vite
   e troca .css por módulo vazio. Pacotes importados por v1/src vêm de v1/node_modules. */
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PACOTE_V1 = new URL('../../v1/package.json', import.meta.url);
const ts = createRequire(PACOTE_V1)('typescript');
const deV1 = (url) => url?.includes('/v1/src/');
const arquivo = (u) => { const p = fileURLToPath(u); return existsSync(p) && statSync(p).isFile(); };

export async function resolve(especificador, contexto, proximo) {
  if (deV1(contexto.parentURL) && /^\.\.?\//.test(especificador)) {
    const base = new URL(especificador, contexto.parentURL);
    for (const ext of ['', '.ts', '.tsx']) {
      const u = new URL(base.href + ext);
      if (arquivo(u)) return { url: u.href, shortCircuit: true };
    }
  }
  if (deV1(contexto.parentURL) && !/^(\.|node:|file:)/.test(especificador)) return proximo(especificador, { ...contexto, parentURL: PACOTE_V1.href });
  return proximo(especificador, contexto);
}

export async function load(url, contexto, proximo) {
  if (url.endsWith('.css')) return { format: 'module', source: 'export default {}', shortCircuit: true };
  if (deV1(url) && /\.tsx?$/.test(url)) {
    const caminho = fileURLToPath(url);
    const { outputText } = ts.transpileModule(await readFile(caminho, 'utf8'), { fileName: caminho,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  return proximo(url, contexto);
}
