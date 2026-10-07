/* Ligação do componente PesquisaTese real (TSX transpilado) com DOM do jsdom e fetch controlado:
   cliques nos botões de verdade, estado React de verdade. Complementa o harness dos fluxos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, montar as montarDom, servidor, botao, clicar, esperar, responder } from './apoio/dom.mjs';

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

async function montar(inicial) {
  const t = await montarDom(React.createElement(PesquisaTese, { usuario: { id: 'u', nome: 'Ana', papel: 'analista' }, inicial,
    aoConsumirInicial: () => {}, aoAbrirTrabalho: () => {}, aoExpirar: () => {} }));
  return t;
}

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
  assert.equal(document.querySelector('main h2')?.textContent, 'Tese B laboratórios próprios', 'o título principal, não a lateral');
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

test('componente: B e C abrindo, C falha; "Continuar até a meta" de A envia A e a tela fica em A', async () => {
  const FUNIL = { recorte: 3, avaliadas: 3, truncado: false, semAtributos: 0, eliminadas: 0, eliminadasPor: {}, exclusivas: {}, aprovadasCadastro: 3, comSite: 3, armazenadas: 3 };
  const A = det('a0000000-0000-4000-8000-000000000007', 'Tese A pausada', { estado: 'pausada', funil: FUNIL });
  const B = det('b0000000-0000-4000-8000-000000000008', 'Tese B lenta', { estado: 'pausada', funil: FUNIL });
  const C = det('c0000000-0000-4000-8000-000000000009', 'Tese C quebrada', { estado: 'pausada', funil: FUNIL });
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [resumo(A), resumo(B), resumo(C)], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${A.pesquisa.id}$`), dados: () => A },
    { metodo: 'GET', url: new RegExp(`(${B.pesquisa.id}|${C.pesquisa.id})$`), segurar: true },
    { metodo: 'POST', url: /\/avancar$/, segurar: true },
  ]);
  const t = await montar({ pesquisaId: A.pesquisa.id });
  try {
    await esperar();
    const titulo = () => document.querySelector('main h2')?.textContent;
    assert.equal(titulo(), 'Tese A pausada');
    await clicar(botao(/Tese B lenta/));
    await clicar(botao(/Tese C quebrada/));
    const getB = pedidos.find((p) => p.url.endsWith(B.pesquisa.id));
    const getC = pedidos.find((p) => p.url.endsWith(C.pesquisa.id));
    assert.equal(botao(/Continuar até a meta/).disabled, true, 'bloqueado durante as aberturas');
    await responder(getC, { mensagem: 'Indisponível.' }, 503);
    assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /Indisponível/);
    assert.equal(titulo(), 'Tese A pausada');
    // B (superada) responde depois: não troca a tela.
    await responder(getB, B);
    assert.equal(titulo(), 'Tese A pausada');
    // Ação real depois da falha: o POST sai com o ID de A.
    await clicar(botao(/Continuar até a meta/));
    const avancos = pedidos.filter((p) => p.url.endsWith('/avancar'));
    assert.equal(avancos.length, 1);
    assert.match(avancos[0].url, new RegExp(`${A.pesquisa.id}/avancar$`));
    await responder(avancos[0], { ...A, pesquisa: { ...A.pesquisa, estado: 'concluida' }, execucaoLote: 1 });
  } finally { await t.desmontar(); }
});

test('componente: lista leve; abrir a empresa busca o item completo uma vez, com falha recuperável', async () => {
  const FUNIL = { recorte: 2, avaliadas: 2, truncado: false, semAtributos: 0, eliminadas: 0, eliminadasPor: {}, exclusivas: {}, aprovadasCadastro: 2, comSite: 2, armazenadas: 2 };
  const base = (id) => ({ empresa_id: id, ordem: 1, etapa: 'revisada', aderencia: 80, categoria: 'provavel',
    site: { dominio: 'alfa.com.br', estado: 'lido', identidade: 'cnpj', motivo: null },
    empresa: { id, nome: `Empresa ${id}`, razaoSocial: `Razão ${id}`, cidade: 'Campinas', uf: 'SP', cnpjRaiz: '11111111', cnaePrincipal: '4684299', dominio: 'alfa.com.br', porte: null, capitalSocial: null, dataAbertura: null } });
  const leve = (id) => ({ ...base(id), resumido: true, vereditos: [{ veredito: 'atende', resumo: 'Fundada em 1990', lastro: 'cadastro' }, { veredito: 'indicio', resumo: 'Cita multinacionais', lastro: 'site' }] });
  const cheio = (id) => ({ ...base(id), site: { ...base(id).site, paginas: [{ url: 'https://alfa.com.br/', titulo: 'Alfa' }] },
    vereditos: [{ veredito: 'atende', resumo: 'Fundada em 1990', lastro: 'cadastro', justificativa: 'Data de abertura no cadastro.', evidencias: [{ fonte: 'Receita Federal', referencia: '2026-08' }] },
      { veredito: 'indicio', resumo: 'Cita multinacionais', lastro: 'site', justificativa: 'Termos encontrados juntos.', evidencias: [{ fonte: 'site', url: 'https://alfa.com.br/quem-somos', trecho: 'distribuidor autorizado de multinacionais' }] }] });
  const A = det('a0000000-0000-4000-8000-000000000010', 'Tese A leve', { estado: 'pausada', funil: FUNIL, provavel: 1 });
  A.contagens = { ...A.contagens, revisadas: 1, pendentes: 0 };
  A.itens = [leve('cnpj11111111')];
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [resumo(A)], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${A.pesquisa.id}$`), dados: () => A },
    { metodo: 'GET', url: /\/itens\/cnpj\d{8}$/, segurar: true },
  ]);
  const t = await montar({ pesquisaId: A.pesquisa.id });
  try {
    await esperar();
    assert.doesNotMatch(document.body.textContent, /distribuidor autorizado/, 'a lista não traz trechos');
    await clicar(botao(/Empresa cnpj11111111/));
    const detalhe = () => document.querySelector('.pesquisa-detalhe');
    assert.match(detalhe().textContent, /Carregando evidências/);
    assert.equal(detalhe().getAttribute('aria-busy'), 'true');
    const itens = () => pedidos.filter((p) => /\/itens\/cnpj/.test(p.url));
    assert.equal(itens().length, 1);
    assert.match(itens()[0].url, new RegExp(`${A.pesquisa.id}/itens/cnpj11111111$`));
    // Falha: alerta com nova tentativa.
    await responder(itens()[0], { mensagem: 'Indisponível agora.' }, 503);
    assert.match(detalhe().querySelector('[role="alert"]').textContent, /Não foi possível carregar as evidências/);
    await clicar(botao(/^Tentar de novo$/));
    assert.equal(itens().length, 2);
    await responder(itens()[1], { item: cheio('cnpj11111111') });
    assert.match(detalhe().textContent, /distribuidor autorizado de multinacionais/);
    assert.match(detalhe().textContent, /Termos encontrados juntos/);
    assert.equal(detalhe().getAttribute('aria-busy'), 'false');
  } finally { await t.desmontar(); }
});
