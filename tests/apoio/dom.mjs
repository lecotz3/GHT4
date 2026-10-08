/* Apoio aos testes de componente: componentes reais de v1/src (TSX transpilado pelo
   carregador), DOM do jsdom, React 19 com act e fetch controlado pelo teste. */
import { createRequire, register } from 'node:module';

register('./carregador-tsx.mjs', import.meta.url);
const doV1 = createRequire(new URL('../../v1/package.json', import.meta.url));
const { JSDOM } = doV1('jsdom');
export const dom = new JSDOM('<!doctype html><html><body><div id="raiz"></div></body></html>', { url: 'http://127.0.0.1/' });
for (const nome of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  if (!(nome in globalThis) || nome === 'navigator') Object.defineProperty(globalThis, nome, { value: dom.window[nome] ?? ((f) => setTimeout(f, 0)), configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
export const React = doV1('react');
const { createRoot } = doV1('react-dom/client');

/** Renderiza `elemento` na raiz; `atualizar` troca as props; `desmontar` limpa. */
export async function montar(elemento) {
  const root = createRoot(document.getElementById('raiz'));
  await React.act(async () => { root.render(elemento); });
  return {
    atualizar: (novo) => React.act(async () => { root.render(novo); }),
    desmontar: () => React.act(async () => root.unmount()),
  };
}

/** fetch em que cada pedido espera a decisão do teste, ou responde na hora por regra. */
export function servidor(regras) {
  const pedidos = [];
  globalThis.fetch = (url, o = {}) => new Promise((resolve) => {
    const p = { url: String(url), metodo: o.method ?? 'GET', corpo: o.body ? JSON.parse(o.body) : undefined, cabecalhos: o.headers ?? {},
      responder: (dados, status = 200) => resolve(new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } })) };
    pedidos.push(p);
    const regra = regras.find((r) => r.metodo === p.metodo && r.url.test(p.url));
    if (regra && !regra.segurar) p.responder(regra.dados(p), regra.status?.(p) ?? 200);
  });
  return pedidos;
}

export const botao = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent));
export const clicar = (b) => React.act(async () => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
export const esperar = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
export const responder = (pedido, dados, status) => React.act(async () => { pedido.responder(dados, status); });
