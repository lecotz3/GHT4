/* Componente EncontrarPessoas real (TSX transpilado) com DOM do jsdom e fetch controlado: pedido,
   leitura, três grupos, juízo, plano de acesso aberto do cartão e das lacunas, e a passagem para a
   pesquisa por tese só com a parte do pedido que fala da empresa. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, dom, montar, servidor, botao, clicar, esperar, responder } from './apoio/dom.mjs';

const { EncontrarPessoas } = await import('../v1/src/componentes/EncontrarPessoas.tsx');
const { resumoResultado } = await import('../v1/src/agente/encontrar.ts');

const digitar = (el, valor) => React.act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, valor);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const linha = (requisito, julgamento, obrigatorio = true, fonte = null) => ({ requisito, julgamento, informacao: `${requisito}: informação`, fonte, obrigatorio });
const empresa = (id, nome) => ({ id, nome, cidade: 'Campinas', uf: 'SP', subsetor: 'Distribuição e trading químico' });
const pessoa = (id, nome, grupo, extra = {}) => ({ id, nome, cargo: 'Sócio-administrador', senioridade: 'ceo', senioridadeRotulo: 'CEO ou presidente', origem: 'manual',
  empresa: empresa('cnpj11111111', 'Alfa Química'), posicao: { id: 'decide', rotulo: 'Decide a venda' }, grupo, motivo: null, pendencias: [], pedePesquisa: false,
  juizo: [linha('Decide a venda', 'atende', true, 'Site oficial da empresa: Quem somos'), linha('A casa chega até ela', 'atende', false, 'Rede de relacionamento')],
  caminho: null, respostas: { respostas: 0, negativas: 0 }, ...extra });
const RESULTADO = {
  leitura: { pedido: 'Quem decide nas distribuidoras de solventes industriais em SP', tese: 'nas distribuidoras de solventes industriais em SP',
    papel: { decide: true, senioridades: [], rotulo: 'Quem decide a venda', padrao: false, trechos: ['Quem decide'] },
    acesso: { exigido: null, obrigatorio: false, trecho: null },
    recorte: { uf: 'SP', subsetor: 'Distribuição e trading químico', cnae: '', incluirPossiveis: false },
    criterios: [{ id: 'pesquisa_solventes', texto: 'Nas distribuidoras de solventes industriais', obrigatorio: true, tipo: 'pesquisa' }],
    notas: ['Recorte no subsetor "Distribuição e trading químico".'] },
  funil: { recorte: 3, lidas: 3, truncado: false, nosCriterios: 3, comPessoas: 2, pessoas: 3, foraDosCriterios: 0, forte: 1, revisar: 1, excluido: 1 },
  grupos: {
    forte: [pessoa('p1', 'Carlos Nunes', 'forte', { caminho: { rota: 'Helena Sócia → Carlos Nunes', categoria: 'relacao_confirmada', categoriaRotulo: 'Relação confirmada', saltos: 1 } })],
    revisar: [pessoa('p2', 'Dora Lima', 'revisar', { empresa: empresa('cnpj22222222', 'Beta Química'), pendencias: ['Nas distribuidoras de solventes industriais'], pedePesquisa: true })],
    excluido: [pessoa('p3', 'Bia Prado', 'excluido', { cargo: 'Gerente', posicao: { id: 'porta', rotulo: 'Porta de entrada' }, motivo: 'Decide a venda: Gerência: porta de entrada, não decide a venda.' })],
  },
  lacunas: { total: 1, ninguemMapeado: 1, empresas: [{ empresa: empresa('cnpj44444444', 'Delta Química'), mapeadas: 0, estrutura: '2 sócios pessoas físicas: a venda depende deles em conjunto.', pendentes: 1 }] },
  membros: 1, referencia: '2026-08', fonte: 'Receita Federal · CNPJ', limitacoes: ['Telefone e e-mail não aparecem.'],
};
const PLANO = (id, nome) => ({ empresa: { id, nome, razaoSocial: null, cnpjRaiz: id.slice(4), cidade: 'Campinas', uf: 'SP', subsetor: null },
  estrutura: { conhecida: true, natureza: 'ltda', naturezaRotulo: 'sociedade limitada', socios: 2, sociosPj: 0, socioEstrangeiro: false, leitura: 'Leitura da estrutura.', sinais: [], fonte: null },
  pessoas: [], passo: { acao: 'registrar_decisor', titulo: 'Descubra quem decide', texto: 'Ninguém desta empresa está na rede ainda.', rascunhos: [], regras: [] },
  canais: [], caminhos: [], cobertura: { membros: 1, perguntasPossiveis: 0, perguntasPendentes: 0, respostas: 0, situacao: 'nao_mapeada', apuracaoCompleta: false },
  restricao: null, restricoesOutras: [], diligencia: null, oportunidades: [], limitacoes: [], eu: { naRede: true, pessoaId: 'eu' }, podeRegistrar: false, tiposFonte: [], senioridades: [] });

test('o resumo do resultado diz quantas atendem, pedem revisão e ficaram fora', () => {
  assert.equal(resumoResultado(RESULTADO), '1 pessoa atende, 1 pede revisão e 1 ficou fora, em 2 empresas com alguém mapeado.');
  assert.match(resumoResultado({ ...RESULTADO, funil: { ...RESULTADO.funil, recorte: 0 } }), /Nenhuma empresa do catálogo cabe/);
  assert.equal(resumoResultado({ ...RESULTADO, funil: { ...RESULTADO.funil, pessoas: 0, nosCriterios: 12 } }), '12 empresas se encaixam no pedido, e a casa ainda não mapeou ninguém nelas.');
});

test('componente: pedido, grupos, juízo, plano de acesso e passagem para a pesquisa por tese', async () => {
  const teses = [];
  const pedidos = servidor([
    { metodo: 'POST', url: /\/api\/encontrar$/, segurar: true },
    { metodo: 'GET', url: /\/api\/acesso\/cnpj11111111$/, dados: () => PLANO('cnpj11111111', 'Alfa Química') },
    { metodo: 'GET', url: /\/api\/acesso\/cnpj44444444$/, dados: () => PLANO('cnpj44444444', 'Delta Química') },
  ]);
  const t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: (tese) => teses.push(tese), aoExpirar: () => {} }));
  try {
    assert.ok(botao(/^Encontrar/).disabled, 'sem pedido não busca');
    await clicar(botao(/^Pela rede/));
    assert.match(document.querySelector('#pedido-encontrar').value, /que a casa conhece/, 'exemplo vira pedido');
    await digitar(document.querySelector('#pedido-encontrar'), RESULTADO.leitura.pedido);
    await clicar(botao(/^Encontrar/));
    const post = pedidos.find((p) => p.metodo === 'POST' && p.url.endsWith('/api/encontrar'));
    assert.deepEqual(post.corpo, { pedido: RESULTADO.leitura.pedido });
    assert.ok(botao(/^Procurando/).disabled, 'um pedido por vez');
    await responder(post, RESULTADO);
    await esperar();

    const pagina = document.querySelector('.encontrar').textContent;
    assert.match(document.querySelector('.encontrar-resumo').textContent, /^1 pessoa atende, 1 pede revisão/);
    assert.equal(document.querySelector('.encontrar-resumo').getAttribute('role'), 'status');
    assert.match(pagina, /Como li o pedido/);
    assert.match(pagina, /Quem decide a venda/);
    assert.match(pagina, /Nas distribuidoras de solventes industriaissite oficial/);
    assert.match(pagina, /Relação confirmada: Helena Sócia → Carlos Nunes/);
    assert.match(pagina, /A revisar: Nas distribuidoras de solventes industriais/);
    assert.doesNotMatch(pagina, /@|telefone:/i, 'nenhum contato pessoal');

    // Fora do pedido fica recolhido, com o motivo.
    const fora = document.querySelector('details.encontrar-grupo.excluido');
    assert.equal(fora.open, false);
    assert.match(fora.textContent, /Bia Prado/);
    assert.match(fora.textContent, /porta de entrada, não decide a venda/);

    // O juízo abre na tabela, e a linha informativa é marcada.
    const verJuizo = botao(/^Ver o juízo/);
    await clicar(verJuizo);
    assert.equal(verJuizo.getAttribute('aria-expanded'), 'true');
    const tabela = document.querySelector('[role="table"][aria-label="Juízo sobre Carlos Nunes"]');
    assert.ok(tabela);
    assert.match(tabela.textContent, /A casa chega até ela \(informativo\)/);
    assert.match(tabela.textContent, /Site oficial da empresa: Quem somos/);

    // Plano de acesso aberto do cartão (um por vez) e da lacuna.
    await clicar(botao(/^Plano de acesso/));
    await esperar();
    assert.ok(pedidos.some((p) => p.metodo === 'GET' && /\/api\/acesso\/cnpj11111111$/.test(p.url)));
    assert.ok(document.querySelector('[aria-label="Plano de acesso — Alfa Química"]'), 'plano montado no cartão');
    await clicar(botao(/^Abrir o plano e registrar quem decide/));
    await esperar();
    assert.ok(document.querySelector('[aria-label="Plano de acesso — Delta Química"]'));
    assert.equal(document.querySelector('[aria-label="Plano de acesso — Alfa Química"]'), null, 'abrir outro fecha o anterior');
    assert.match(document.querySelector('.encontrar-grupo.lacunas').textContent, /Onde falta quem decide1/);

    // A pesquisa por tese recebe só a parte da empresa.
    await clicar(botao(/^Rodar a pesquisa por tese/));
    assert.deepEqual(teses, ['nas distribuidoras de solventes industriais em SP']);
  } finally { await t.desmontar(); }
});

test('componente: sessão expirada chama aoExpirar; outra falha aparece como alerta', async () => {
  let expirou = 0;
  const pedidos = servidor([{ metodo: 'POST', url: /\/api\/encontrar$/, segurar: true }]);
  const t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => { expirou++ } }));
  try {
    await digitar(document.querySelector('#pedido-encontrar'), 'Quem decide em SP');
    await clicar(botao(/^Encontrar/));
    await responder(pedidos.at(-1), { erro: 'base_indisponivel', mensagem: 'O catálogo não pôde ser consultado. Tente novamente.' }, 503);
    await esperar();
    assert.match(document.querySelector('[role="alert"]').textContent, /catálogo não pôde ser consultado/);
    await clicar(botao(/^Encontrar/));
    await responder(pedidos.at(-1), { erro: 'nao_autenticado', mensagem: 'Faça login para continuar.' }, 401);
    await esperar();
    assert.equal(expirou, 1);
  } finally { await t.desmontar(); }
});
