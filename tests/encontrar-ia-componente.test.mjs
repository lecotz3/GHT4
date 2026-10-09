/* Rodada 26 na interface: a leitura com IA, oferecida só quando as regras não leram parte do
   pedido, com a cota do dia; o "um de cada" com a cobertura de cada papel e o que falta em cada
   lacuna. Componente real, DOM do jsdom, fetch controlado. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, dom, montar, servidor, botao, clicar, esperar, responder } from './apoio/dom.mjs';

const { EncontrarPessoas } = await import('../v1/src/componentes/EncontrarPessoas.tsx');
const { resumoResultado } = await import('../v1/src/agente/encontrar.ts');

const digitar = (el, valor) => React.act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, valor);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const PEDIDO = 'Chefe de pessoas e o presidente das distribuidoras de SP';
const base = (leitura = {}, extra = {}) => ({
  leitura: { pedido: PEDIDO, tese: 'Chefe de das distribuidoras de SP', papel: { decide: false, senioridades: ['ceo'], rotulo: 'CEO ou presidente', padrao: false, trechos: ['presidente'] },
    acesso: { exigido: null, obrigatorio: false, trecho: null }, recorte: { uf: 'SP', subsetor: 'todos', cnae: '', incluirPossiveis: false }, criterios: [], notas: [],
    modo: 'regras', ambiguidades: ['"Chefe" parece cargo, mas não está na escala da rede.'], ia: null, ...leitura },
  funil: { recorte: 2, lidas: 2, truncado: false, nosCriterios: 2, comPessoas: 2, pessoas: 2, foraDosCriterios: 0, forte: 2, revisar: 0, excluido: 0 },
  grupos: { forte: [], revisar: [], excluido: [] }, lacunas: { total: 0, ninguemMapeado: 0, empresas: [] },
  membros: 1, referencia: '2026-08', fonte: 'Receita Federal · CNPJ', limitacoes: [],
  ia: { disponivel: true, provedor: 'groq', modelo: 'm', gratuito: true, restantes: 2, falha: null }, ...extra,
});
const UM_DE_CADA = base({ modo: 'ia', ambiguidades: [], ia: { modelo: 'modelo-x', duvidas: ['"Chefe" pode ser gerência.'], descartes: 0 },
  papel: { decide: false, senioridades: ['diretoria', 'ceo'], rotulo: 'Um de cada: Diretoria · recursos humanos · CEO ou presidente', padrao: false,
    trechos: ['Chefe de pessoas', 'o presidente'], requisitos: [
      { rotulo: 'Diretoria · recursos humanos', decide: false, senioridades: ['diretoria'], area: { id: 'rh', rotulo: 'recursos humanos' } },
      { rotulo: 'CEO ou presidente', decide: false, senioridades: ['ceo'], area: null }] } }, {
  cobertura: [{ rotulo: 'Diretoria · recursos humanos', empresas: 1, pessoas: 1 }, { rotulo: 'CEO ou presidente', empresas: 2, pessoas: 2 }],
  lacunas: { total: 1, ninguemMapeado: 0, empresas: [{ empresa: { id: 'cnpj22222222', nome: 'Beta Química', cidade: 'Santos', uf: 'SP', subsetor: null },
    mapeadas: 1, estrutura: 'Sociedade limitada.', pendentes: 0, faltam: ['Diretoria · recursos humanos'] }] },
  ia: { disponivel: true, provedor: 'groq', modelo: 'm', gratuito: true, restantes: 1, falha: null },
});

test('o resumo conta a cobertura de cada papel do "um de cada"', () => {
  assert.match(resumoResultado(UM_DE_CADA), /Por papel: Diretoria · recursos humanos em 1 empresa; CEO ou presidente em 2 empresas\.$/);
  assert.doesNotMatch(resumoResultado(base()), /Por papel/);
});

test('componente: leitura ambígua oferece a IA com a cota; o clique manda uma chave; volta às regras', async () => {
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/encontrar\/memoria$/, dados: () => ({ ativa: true, buscas: [] }) },
    { metodo: 'POST', url: /\/api\/encontrar$/, segurar: true },
  ]);
  const t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    await digitar(document.querySelector('#pedido-encontrar'), PEDIDO);
    await clicar(botao(/^Encontrar/));
    const primeiro = pedidos.filter((p) => p.metodo === 'POST')[0];
    assert.deepEqual(primeiro.corpo, { pedido: PEDIDO }, 'a busca normal não pede IA');
    await responder(primeiro, base());
    await esperar();
    const ambiguo = document.querySelector('.encontrar-ambiguo');
    assert.match(ambiguo.textContent, /Parte do pedido ficou ambígua/);
    assert.match(ambiguo.textContent, /Usa 1 dos 2 pedidos à IA que você ainda tem hoje/);
    assert.match(ambiguo.textContent, /nenhuma pessoa da rede sai daqui/);
    assert.match(ambiguo.textContent, /Na camada gratuita, o provedor pode reter o texto/);

    await clicar(botao(/^Ler o pedido com a IA/));
    const segundo = pedidos.filter((p) => p.metodo === 'POST')[1];
    assert.equal(segundo.corpo.pedido, PEDIDO);
    assert.match(segundo.corpo.ia.chave, /^[0-9a-f-]{36}$/);
    await responder(segundo, UM_DE_CADA);
    await esperar();
    const leitura = document.querySelector('.encontrar-leitura');
    assert.match(leitura.querySelector('h3').textContent, /com a IA · modelo-x/);
    assert.match(leitura.textContent, /Um de cada, em cada empresa/);
    assert.match(leitura.textContent, /Diretoria · recursos humanos1 empresa/);
    assert.match(leitura.textContent, /Lido de: “Chefe de pessoas”, “o presidente”/);
    assert.match(leitura.textContent, /"Chefe" pode ser gerência/);
    assert.ok(!document.querySelector('.encontrar-ambiguo:not(.is-ia)'), 'lido com IA, a oferta some');
    assert.match(document.querySelector('#titulo-lacunas').textContent, /Onde falta algum papel do pedido/);
    assert.match(document.querySelector('.encontrar-lacuna .acesso-posicao').textContent, /^Falta: Diretoria · recursos humanos$/);

    await clicar(botao(/^Voltar à leitura por regras/));
    assert.deepEqual(pedidos.filter((p) => p.metodo === 'POST')[2].corpo, { pedido: PEDIDO });
  } finally { await t.desmontar(); }
});

test('componente: sem cota, o botão fica desligado; sem IA, a dica é reescrever; a falha aparece', async () => {
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/encontrar\/memoria$/, dados: () => ({ ativa: true, buscas: [] }) },
    { metodo: 'POST', url: /\/api\/encontrar$/, segurar: true },
  ]);
  const t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    await digitar(document.querySelector('#pedido-encontrar'), PEDIDO);
    await clicar(botao(/^Encontrar/));
    await responder(pedidos.filter((p) => p.metodo === 'POST')[0], base({}, { ia: { disponivel: true, provedor: 'groq', restantes: 0, falha: 'A cota diária de pedidos à IA acabou.' } }));
    await esperar();
    assert.equal(botao(/^Ler o pedido com a IA/).disabled, true);
    assert.match(document.querySelector('.encontrar-ambiguo').textContent, /A cota de pedidos à IA de hoje acabou/);
    assert.match(document.querySelector('.encontrar-leitura [role="alert"]').textContent, /A cota diária de pedidos à IA acabou/);

    await clicar(botao(/^Encontrar/));
    await responder(pedidos.filter((p) => p.metodo === 'POST')[1], base({}, { ia: { disponivel: false, falha: null } }));
    await esperar();
    assert.ok(!botao(/^Ler o pedido com a IA/));
    assert.match(document.querySelector('.encontrar-ambiguo').textContent, /Reescreva com um cargo da escala/);
  } finally { await t.desmontar(); }
});
