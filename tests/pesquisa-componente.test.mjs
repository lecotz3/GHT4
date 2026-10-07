/* Ligação do componente PesquisaTese real (TSX transpilado) com DOM do jsdom e fetch controlado:
   cliques nos botões de verdade, estado React de verdade. Complementa o harness dos fluxos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';

register('./apoio/carregador-tsx.mjs', import.meta.url);
const doV1 = createRequire(new URL('../v1/package.json', import.meta.url));
const { JSDOM } = doV1('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="raiz"></div></body></html>', { url: 'http://127.0.0.1/' });
for (const nome of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  if (!(nome in globalThis) || nome === 'navigator') Object.defineProperty(globalThis, nome, { value: dom.window[nome] ?? ((f) => setTimeout(f, 0)), configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = doV1('react');
const { createRoot } = doV1('react-dom/client');
const { PesquisaTese } = await import('../v1/src/componentes/PesquisaTese.tsx');

const FILTROS = { uf: 'SP', busca: '', cnae: '', incluirPossiveis: false };
const CRITERIOS = [
  { id: 'c1', texto: 'Mais de 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 }, trecho: null, origem: 'regras' },
  { id: 'c2', texto: 'Representa multinacionais', obrigatorio: true, tipo: 'pesquisa', regra: null, trecho: null, origem: 'regras' },
];
const det = (id, tese, o = {}) => ({
  pesquisa: { id, conversa_id: 'conv', anterior_id: null, tese, frente: 'venda', filtros: FILTROS, criterios: CRITERIOS, meta: 20, limite_web: 40,
    referencia: '2026-08', funil: o.funil ?? {}, estado: o.estado ?? 'rascunho', motivo_estado: null, modo: 'regras', notas: [], turno_id: null,
    versao: 1, execucao: 0, atualizado_em: '2026-10-07T12:00:00Z' },
  contagens: { total: 10, revisadas: 0, pendentes: 10, aderente: 0, provavel: o.provavel ?? 0, a_confirmar: 0, nao_aderente: 0 },
  itens: [], ia: null, marca: 'm1',
});
const resumo = (d) => ({ id: d.pesquisa.id, conversa_id: 'conv', tese: d.pesquisa.tese, estado: d.pesquisa.estado, motivo_estado: null, funil: {}, meta: 20, atualizado_em: '2026-10-07T12:00:00Z', titulo: 't', boas: 0 });

/** fetch em que cada pedido espera a decisão do teste (ou responde na hora, por regra). */
function servidor(regras) {
  const pedidos = [];
  globalThis.fetch = (url, o = {}) => new Promise((resolve) => {
    const p = { url: String(url), metodo: o.method ?? 'GET', corpo: o.body ? JSON.parse(o.body) : undefined,
      responder: (dados, status = 200) => resolve(new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json' } })) };
    pedidos.push(p);
    const regra = regras.find((r) => r.metodo === p.metodo && r.url.test(p.url));
    if (regra && !regra.segurar) p.responder(regra.dados(p));
  });
  return pedidos;
}

async function montar(inicial) {
  const raiz = document.getElementById('raiz');
  const root = createRoot(raiz);
  await React.act(async () => {
    root.render(React.createElement(PesquisaTese, { usuario: { id: 'u', nome: 'Ana', papel: 'analista' }, inicial,
      aoConsumirInicial: () => {}, aoAbrirTrabalho: () => {}, aoExpirar: () => {} }));
  });
  return { raiz, desmontar: () => React.act(async () => root.unmount()) };
}
const botao = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent));
const clicar = (b) => React.act(async () => { b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
const esperar = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });

test('componente: abrir B pendente desabilita "Revisar até a meta" de A e nenhum clique inicia A', async () => {
  const A = det('a0000000-0000-4000-8000-000000000001', 'Tese A distribuidoras antigas');
  const B = det('b0000000-0000-4000-8000-000000000002', 'Tese B laboratórios próprios');
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [resumo(A), resumo(B)], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${A.pesquisa.id}$`), dados: () => A },
    { metodo: 'POST', url: /\/previa$/, dados: () => ({ funil: { recorte: 10, avaliadas: 10, truncado: false, semAtributos: 0, eliminadas: 0, eliminadasPor: {}, exclusivas: {}, aprovadasCadastro: 10, comSite: 10, armazenadas: 10 }, referencia: '2026-08', amostra: [] }) },
    { metodo: 'GET', url: new RegExp(`${B.pesquisa.id}$`), segurar: true },
  ]);
  const t = await montar({ pesquisaId: A.pesquisa.id });
  await esperar();
  const meta = botao(/Revisar até a meta/);
  assert.ok(meta && !meta.disabled, 'A aberta, botão habilitado');
  // Abre B pela lateral; o GET fica pendente.
  await clicar(botao(/Tese B laboratórios/));
  const getB = pedidos.find((p) => p.metodo === 'GET' && p.url.endsWith(B.pesquisa.id));
  assert.ok(getB, 'GET de B saiu');
  assert.equal(botao(/Revisar até a meta/).disabled, true, 'ações de A bloqueadas durante a abertura');
  await clicar(botao(/Revisar até a meta/));
  await clicar(botao(/Revisar as \d+ primeiras/));
  await esperar();
  assert.deepEqual(pedidos.filter((p) => /PATCH|POST/.test(p.metodo) && /iniciar|avancar|pesquisas\/[\w-]+$/.test(p.url)).map((p) => p.metodo + ' ' + p.url), []);
  await React.act(async () => { getB.responder(B); });
  await esperar();
  assert.match(document.body.textContent, /Tese B laboratórios/);
  assert.equal(document.querySelector('.pesquisa-estado.rodando'), null, 'nada rodando');
  assert.equal(botao(/Revisar até a meta/).disabled, false, 'B aberta, ações liberadas');
  await t.desmontar();
});

test('componente: falha ao abrir B devolve as ações de A e mostra o erro', async () => {
  const A = det('a0000000-0000-4000-8000-000000000003', 'Tese A química fina');
  const B = det('b0000000-0000-4000-8000-000000000004', 'Tese B inacessível');
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [resumo(A), resumo(B)], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${A.pesquisa.id}$`), dados: () => A },
    { metodo: 'POST', url: /\/previa$/, dados: () => ({ funil: { recorte: 1, avaliadas: 1, truncado: false, semAtributos: 0, eliminadas: 0, eliminadasPor: {}, exclusivas: {}, aprovadasCadastro: 1, comSite: 1, armazenadas: 1 }, referencia: '2026-08', amostra: [] }) },
    { metodo: 'GET', url: new RegExp(`${B.pesquisa.id}$`), segurar: true },
  ]);
  const t = await montar({ pesquisaId: A.pesquisa.id });
  await esperar();
  await clicar(botao(/Tese B inacessível/));
  const getB = pedidos.find((p) => p.metodo === 'GET' && p.url.endsWith(B.pesquisa.id));
  await React.act(async () => { getB.responder({ mensagem: 'Pesquisa não encontrada.' }, 404); });
  await esperar();
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /não encontrada/);
  assert.equal(botao(/Revisar até a meta/).disabled, false, 'A volta a aceitar ações');
  await t.desmontar();
});

test('componente: resposta antiga de "Mostrar empresas" não libera o botão do pedido novo em voo', async () => {
  const FUNIL = { recorte: 3, avaliadas: 3, truncado: false, semAtributos: 0, eliminadas: 0, eliminadasPor: {}, exclusivas: {}, aprovadasCadastro: 3, comSite: 3, armazenadas: 3 };
  const A = det('a0000000-0000-4000-8000-000000000005', 'Tese A com prováveis', { estado: 'concluida', funil: FUNIL, provavel: 2 });
  A.contagens = { ...A.contagens, revisadas: 2, pendentes: 0 };
  const B = det('b0000000-0000-4000-8000-000000000006', 'Tese B qualquer', { estado: 'concluida', funil: FUNIL });
  const item = (id) => ({ empresa_id: id, ordem: 1, etapa: 'revisada', vereditos: [], aderencia: 70, categoria: 'provavel', site: null,
    empresa: { id, nome: `Empresa ${id}`, razaoSocial: '', cidade: 'Campinas', uf: 'SP', cnpjRaiz: '', cnaePrincipal: '', dominio: null, porte: null, capitalSocial: null, dataAbertura: null } });
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [resumo(A), resumo(B)], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${A.pesquisa.id}$`), dados: () => A },
    { metodo: 'GET', url: new RegExp(`${B.pesquisa.id}$`), dados: () => B },
    { metodo: 'GET', url: /\/itens\?/, segurar: true },
  ]);
  const t = await montar({ pesquisaId: A.pesquisa.id });
  await esperar();
  await clicar(botao(/Mostrar empresas/));
  const velho = pedidos.filter((p) => p.url.includes('/itens?')).at(-1);
  assert.match(velho.url, /grupo=provavel&offset=0&marca=m1/);
  await clicar(botao(/Tese B qualquer/)); await esperar();
  await clicar(botao(/Tese A com prováveis/)); await esperar();
  await clicar(botao(/Mostrar empresas/));
  const novo = pedidos.filter((p) => p.url.includes('/itens?')).at(-1);
  assert.notEqual(novo, velho);
  // A antiga responde primeiro: não entra e não libera o botão do pedido novo.
  await React.act(async () => { velho.responder({ itens: [item('cnpj00000001')], total: 2, proximoOffset: 1, marca: 'm1' }); });
  await esperar();
  const emVoo = [...document.querySelectorAll('button')].find((b) => /Carregando/.test(b.textContent));
  assert.ok(emVoo?.disabled, 'botão do pedido novo segue bloqueado');
  assert.doesNotMatch(document.body.textContent, /Empresa cnpj00000001/);
  await clicar(emVoo);
  assert.equal(pedidos.filter((p) => p.url.includes('/itens?')).length, 2, 'nenhum terceiro pedido');
  await React.act(async () => { novo.responder({ itens: [item('cnpj00000002')], total: 2, proximoOffset: 1, marca: 'm1' }); });
  await esperar();
  assert.match(document.body.textContent, /Empresa cnpj00000002/);
  assert.match(botao(/Mostrar mais/)?.textContent ?? '', /1 restantes/);
  await t.desmontar();
});
