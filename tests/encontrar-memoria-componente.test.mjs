/* Rodada 24 na interface: "Suas buscas recentes" no find. Repetir com um clique, esquecer uma,
   apagar todas, e o aviso de memória pausada. Componente real, DOM do jsdom, fetch controlado. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, montar, servidor, botao, clicar, esperar, responder } from './apoio/dom.mjs';

const { EncontrarPessoas } = await import('../v1/src/componentes/EncontrarPessoas.tsx');
const { resumoDaLembrada } = await import('../v1/src/agente/encontrar.ts');

const busca = (chave, pedido, extra = {}) => ({ chave: chave.repeat(32).slice(0, 32), pedido, usos: 1, ultimoUso: '2026-10-09T12:00:00Z',
  resumo: { forte: 2, revisar: 1, excluido: 0, lacunas: 3 }, ...extra });
const VAZIO = {
  leitura: { pedido: 'x', tese: '', papel: { decide: true, senioridades: [], rotulo: 'Quem decide a venda', padrao: false, trechos: [] },
    acesso: { exigido: null, obrigatorio: false, trecho: null }, recorte: { uf: 'SP', subsetor: 'todos', cnae: '', incluirPossiveis: false }, criterios: [], notas: [] },
  funil: { recorte: 1, lidas: 1, truncado: false, nosCriterios: 1, comPessoas: 0, pessoas: 0, foraDosCriterios: 0, forte: 0, revisar: 0, excluido: 0 },
  grupos: { forte: [], revisar: [], excluido: [] }, lacunas: { total: 0, ninguemMapeado: 0, empresas: [] },
  membros: 1, referencia: '2026-08', fonte: 'Receita Federal · CNPJ', limitacoes: [],
};

test('o resumo da busca lembrada diz o que ela trouxe, quando e quantas vezes', () => {
  assert.equal(resumoDaLembrada(busca('a', 'Quem decide em SP', { usos: 3 })), '2 atendem · 1 para revisar · 3 lacunas · 09/10/2026 · 3 vezes');
  assert.equal(resumoDaLembrada(busca('b', 'x', { resumo: { forte: 1, revisar: 0, excluido: 0, lacunas: 1 } })), '1 atende · 1 lacuna · 09/10/2026');
});

test('componente: repetir uma busca lembrada, esquecer uma e apagar todas', async () => {
  const lista = [busca('a', 'Quem decide nas distribuidoras de SP'), busca('b', 'Donos de distribuidoras em MG')];
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/encontrar\/memoria$/, dados: () => ({ ativa: true, buscas: lista }) },
    { metodo: 'POST', url: /\/api\/encontrar$/, segurar: true },
    { metodo: 'DELETE', url: /\/api\/encontrar\/memoria\/b{32}$/, dados: () => ({ ativa: true, buscas: [lista[0]] }) },
    { metodo: 'DELETE', url: /\/api\/encontrar\/memoria$/, dados: () => ({ ativa: true, buscas: [] }) },
  ]);
  const t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    const secao = () => document.querySelector('.encontrar-memoria');
    assert.match(secao().textContent, /Suas buscas recentes/);
    assert.match(secao().textContent, /Só você vê esta lista/);
    assert.equal(secao().querySelectorAll('li').length, 2);

    // Esquecer uma: a lista vem do servidor.
    await clicar(document.querySelector('button[aria-label="Esquecer a busca: Donos de distribuidoras em MG"]'));
    await esperar();
    assert.equal(secao().querySelectorAll('li').length, 1);

    // Repetir: preenche o pedido, busca na hora e relê a memória depois.
    const lidasAntes = pedidos.filter((p) => p.metodo === 'GET' && p.url.endsWith('/api/encontrar/memoria')).length;
    await clicar(botao(/^Quem decide nas distribuidoras de SP/));
    assert.equal(document.querySelector('#pedido-encontrar').value, 'Quem decide nas distribuidoras de SP');
    const post = pedidos.find((p) => p.metodo === 'POST');
    assert.deepEqual(post.corpo, { pedido: 'Quem decide nas distribuidoras de SP' });
    await responder(post, VAZIO);
    await esperar();
    assert.equal(pedidos.filter((p) => p.metodo === 'GET' && p.url.endsWith('/api/encontrar/memoria')).length, lidasAntes + 1);
    assert.ok(!secao(), 'com resultado na tela, a lista sai do caminho');
  } finally { await t.desmontar(); }

  // Apagar todas, em outra montagem.
  const t2 = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    await clicar(botao(/^Apagar todas/));
    await esperar();
    assert.ok(pedidos.some((p) => p.metodo === 'DELETE' && p.url.endsWith('/api/encontrar/memoria')));
    assert.ok(!document.querySelector('.encontrar-memoria'), 'sem buscas e com a memória ligada, nada a mostrar');
  } finally { await t2.desmontar(); }
});

test('componente: memória pausada avisa que buscas novas não ficam guardadas', async () => {
  servidor([{ metodo: 'GET', url: /\/api\/encontrar\/memoria$/, dados: () => ({ ativa: false, buscas: [] }) }]);
  const t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    assert.match(document.querySelector('.encontrar-memoria').textContent, /Sua memória está pausada: buscas novas não ficam guardadas/);
  } finally { await t.desmontar(); }
});

test('componente: sessão expirada ao ler a memória vai para o login; outra falha só esconde a lista', async () => {
  const expiradas = [];
  servidor([{ metodo: 'GET', url: /\/api\/encontrar\/memoria$/, dados: () => ({ erro: 'sessao_expirada', mensagem: 'Entre de novo.' }), status: () => 401 }]);
  let t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => expiradas.push(1) }));
  try {
    await esperar(); await esperar();
    assert.deepEqual(expiradas, [1], '401 segue o tratamento da busca');
  } finally { await t.desmontar(); }

  servidor([{ metodo: 'GET', url: /\/api\/encontrar\/memoria$/, dados: () => ({ erro: 'falha', mensagem: 'Indisponível.' }), status: () => 503 }]);
  t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => expiradas.push(2) }));
  try {
    await esperar(); await esperar();
    assert.deepEqual(expiradas, [1], 'falha passageira não derruba a sessão');
    assert.equal(document.querySelector('.encontrar-memoria'), null);
    assert.equal(document.querySelector('[role="alert"]'), null, 'nem vira erro na tela: a memória é auxiliar');
  } finally { await t.desmontar(); }
});
