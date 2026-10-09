/* Rodada 22 na interface: ligar ao CNPJ quem a rede só conhece pelo nome da organização
   (VincularCnpj real, DOM do jsdom, fetch controlado) e a linha "Empresa" do find quando o
   pedido cita a empresa pelo nome. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, dom, montar, servidor, botao, clicar, esperar, responder } from './apoio/dom.mjs';

const { VincularCnpj } = await import('../v1/src/componentes/VincularCnpj.tsx');
const { situacaoDasSugestoes, raizFormatada } = await import('../v1/src/agente/vinculo-cnpj.ts');
const { EncontrarPessoas } = await import('../v1/src/componentes/EncontrarPessoas.tsx');

const digitar = (el, valor) => React.act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, valor);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const sugerida = (raiz, nome, cidade) => ({ id: `cnpj${raiz}`, nome, razaoSocial: `${nome} Ltda`, cnpjRaiz: raiz, cidade, uf: 'SP', subsetor: 'Distribuição e trading químico' });
const RUI = { id: 'p-rui', lado: 'mercado', nome: 'Rui Campos', cargo: 'Diretor industrial', senioridade: 'diretoria', senioridadeRotulo: 'Diretoria',
  organizacao: 'Química Alfa Ltda.', empresaId: null, ativo: true, versao: 3, camposOmitidos: [] };

test('a situação das sugestões explica o que fazer em cada caso', () => {
  const base = { busca: 'Química Alfa', empresaAtual: null, identifica: true, total: 0, empresas: [] };
  assert.match(situacaoDasSugestoes({ ...base, busca: '' }), /Escreva o nome da empresa ou o CNPJ/);
  assert.match(situacaoDasSugestoes({ ...base, identifica: false }), /só tem palavras comuns/);
  assert.match(situacaoDasSugestoes(base), /Nenhuma empresa do catálogo/);
  assert.equal(situacaoDasSugestoes({ ...base, total: 1, empresas: [sugerida('11111111', 'Alfa Química', 'Campinas')] }), '1 empresa parecida. Confira cidade e razão social antes de ligar.');
  assert.match(situacaoDasSugestoes({ ...base, total: 12, empresas: Array.from({ length: 8 }, (_, i) => sugerida(`1111111${i}`, 'Alfa', 'Campinas')) }), /^12 empresas parecidas; abaixo, as 8 mais próximas/);
  assert.equal(raizFormatada('11111111'), '11.111.111');
});

test('componente: sugere pelo nome escrito, procura de novo e liga só o CNPJ escolhido', async () => {
  const avisos = [], falhas = [];
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/rede\/pessoas\/p-rui\/empresas-sugeridas/, segurar: true },
    { metodo: 'POST', url: /\/api\/rede\/pessoas\/p-rui\/empresa$/, segurar: true },
  ]);
  const t = await montar(React.createElement(VincularCnpj, { pessoa: RUI, aoLigar: (x) => avisos.push(x), aoFalhar: (e) => falhas.push(e) }));
  try {
    const primeira = pedidos.find((p) => p.url.includes('empresas-sugeridas'));
    assert.match(primeira.url, /empresas-sugeridas$/, 'abre com o nome do cadastro, sem consulta própria');
    assert.match(document.querySelector('[role="status"]').textContent, /Procurando no catálogo/);
    await responder(primeira, { busca: 'Química Alfa Ltda.', empresaAtual: null, identifica: true, total: 2,
      empresas: [sugerida('11111111', 'Alfa Química', 'Campinas'), sugerida('55555555', 'Alfa Solventes', 'Campinas')] });
    await esperar();
    assert.match(document.querySelector('[role="status"]').textContent, /^2 empresas parecidas/);
    const itens = [...document.querySelectorAll('section li')].map((li) => li.textContent);
    assert.equal(itens.length, 2);
    assert.match(itens[0], /Alfa Química.*CNPJ 11\.111\.111 · Campinas\/SP/);

    // Procurar de novo pelo CNPJ digitado.
    await digitar(document.querySelector('section input'), '55.555.555/0001-00');
    await clicar(botao(/^Procurar$/));
    const segunda = pedidos.filter((p) => p.url.includes('empresas-sugeridas'))[1];
    assert.match(segunda.url, /empresas-sugeridas\?busca=55\.555\.555%2F0001-00$/);
    await responder(segunda, { busca: '55.555.555/0001-00', empresaAtual: null, identifica: true, total: 1, empresas: [sugerida('55555555', 'Alfa Solventes', 'Campinas')] });
    await esperar();

    // Ligar manda só o CNPJ e a versão; o aviso diz que a pessoa passa a aparecer no find.
    await clicar(document.querySelector('button[aria-label="Ligar Rui Campos a Alfa Solventes"]'));
    const post = pedidos.find((p) => p.metodo === 'POST');
    assert.deepEqual(post.corpo, { empresaId: 'cnpj55555555', versao: 3 });
    assert.ok(botao(/^Ligando/).disabled, 'um vínculo por vez');
    await responder(post, { pessoa: { ...RUI, empresaId: 'cnpj55555555', versao: 4 }, empresa: sugerida('55555555', 'Alfa Solventes', 'Campinas') });
    await esperar();
    assert.deepEqual(avisos, ['Vínculo registrado: Rui Campos → Alfa Solventes (CNPJ 55.555.555). A pessoa agora aparece em Encontrar quem decide.']);
    assert.deepEqual(falhas, []);
  } finally { await t.desmontar(); }
});

test('componente: conflito de versão vai para quem abriu a tela, sem aviso de sucesso', async () => {
  const avisos = [], falhas = [];
  const pedidos = servidor([
    { metodo: 'GET', url: /empresas-sugeridas/, dados: () => ({ busca: 'Química Alfa Ltda.', empresaAtual: null, identifica: true, total: 1, empresas: [sugerida('11111111', 'Alfa Química', 'Campinas')] }) },
    { metodo: 'POST', url: /\/empresa$/, dados: () => ({ erro: 'registro_atualizado', mensagem: 'Este registro mudou. Reabra a rede antes de salvar.' }), status: () => 409 },
  ]);
  const t = await montar(React.createElement(VincularCnpj, { pessoa: RUI, aoLigar: (x) => avisos.push(x), aoFalhar: (e) => falhas.push(e) }));
  try {
    await esperar();
    await clicar(botao(/^Ligar a esta$/));
    await esperar();
    assert.equal(pedidos.filter((p) => p.metodo === 'POST').length, 1);
    assert.deepEqual(avisos, []);
    assert.equal(falhas.length, 1);
    assert.equal(falhas[0].status, 409);
  } finally { await t.desmontar(); }
});

test('find: a empresa citada pelo nome aparece em "Como li o pedido" e vira o recorte', async () => {
  const resultado = {
    leitura: { pedido: 'Quem decide na Química Alfa', tese: '', papel: { decide: true, senioridades: [], rotulo: 'Quem decide a venda', padrao: false, trechos: ['Quem decide'] },
      acesso: { exigido: null, obrigatorio: false, trecho: null }, recorte: { uf: '', subsetor: 'todos', cnae: '', incluirPossiveis: false }, criterios: [], notas: [],
      empresas: [{ trecho: 'Química Alfa', empresas: [{ id: 'cnpj11111111', nome: 'Alfa Química', cidade: 'Campinas', uf: 'SP' }] }] },
    funil: { recorte: 1, lidas: 1, truncado: false, nosCriterios: 1, comPessoas: 0, pessoas: 0, foraDosCriterios: 0, forte: 0, revisar: 0, excluido: 0 },
    grupos: { forte: [], revisar: [], excluido: [] }, lacunas: { total: 0, ninguemMapeado: 0, empresas: [] },
    membros: 1, referencia: '2026-08', fonte: 'Receita Federal · CNPJ', limitacoes: [],
  };
  const pedidos = servidor([{ metodo: 'POST', url: /\/api\/encontrar$/, segurar: true }]);
  const t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => {} }));
  try {
    await digitar(document.querySelector('#pedido-encontrar'), resultado.leitura.pedido);
    await clicar(botao(/^Encontrar/));
    await responder(pedidos.find((p) => p.metodo === 'POST'), resultado);
    await esperar();
    const leitura = document.querySelector('.encontrar-leitura').textContent;
    assert.match(leitura, /EmpresaAlfa QuímicaCampinas\/SP/);
    assert.match(leitura, /RecorteSó as empresas citadas/);
    assert.doesNotMatch(leitura, /Todos os setores-alvo/);
  } finally { await t.desmontar(); }
});
