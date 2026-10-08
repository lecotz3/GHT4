/* Monitoramento semanal na tela: o Meu dia dispara a verificação vencida, recarrega quando
   algo foi verificado e leva à pesquisa marcando as novidades como vistas; a pesquisa liga e
   desliga o monitoramento e mostra a última verificação. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, montar, servidor, botao, clicar, esperar, responder } from './apoio/dom.mjs';

const { MeuDia } = await import('../v1/src/componentes/MeuDia.tsx');
const { PesquisaTese } = await import('../v1/src/componentes/PesquisaTese.tsx');

const ID = 'a0000000-0000-4000-8000-0000000000f1';
const inicio = (teses) => ({ hoje: '2026-10-07', compromissos: { atrasados: 0, hoje: 0, semana: 0, itens: [] }, semProximoPasso: { total: 0, itens: [] },
  rede: { naRede: true, perguntasPendentes: 0, vinculosParaConfirmar: 0 }, teses });
const comNovidade = { monitoradas: 1, itens: [{ pesquisaId: ID, titulo: 't', tese: 'Distribuidoras com mais de 20 anos', novas: 2, eventos: 1, detectadoEm: '2026-10-07T12:00:00Z', exemplos: ['Delta Química', 'Épsilon'] }] };

test('Meu dia: verificação vencida recarrega e mostra a novidade; abrir marca como vista e leva à pesquisa', async () => {
  const abertas = [];
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, segurar: true },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, segurar: true },
    { metodo: 'POST', url: /\/novidades\/vistas$/, dados: () => ({ vistas: 3 }) },
  ]);
  const t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {}, aoAbrirPesquisa: (id) => abertas.push(id) }));
  try {
    const inicios = () => pedidos.filter((p) => p.url.endsWith('/api/inicio'));
    const verificar = pedidos.filter((p) => p.url.endsWith('/api/monitoramentos/verificar'));
    assert.equal(verificar.length, 1, 'abrir o Meu dia dispara a verificação');
    await responder(inicios()[0], inicio({ monitoradas: 1, itens: [] }));
    assert.match(document.body.textContent, /Nada pendente com você agora/);
    // A verificação encontrou algo: recarrega.
    await responder(verificar[0], { verificados: 1, falhas: 0 });
    assert.equal(inicios().length, 2);
    await responder(inicios()[1], inicio(comNovidade));
    const texto = document.querySelector('section.agente-meu-dia').textContent;
    assert.match(texto, /Novidade numa tese monitorada/);
    assert.match(texto, /Distribuidoras com mais de 20 anos · 2 empresas novas · 1 com evento societário \(Delta Química, Épsilon\)/);
    assert.doesNotMatch(texto, /Nada pendente/);
    await clicar(botao(/Distribuidoras com mais de 20 anos/));
    assert.deepEqual(abertas, [ID]);
    assert.equal(pedidos.filter((p) => p.url.endsWith(`/api/pesquisas/${ID}/novidades/vistas`) && p.metodo === 'POST').length, 1);
  } finally { await t.desmontar(); }
});

test('Meu dia: verificação sem nada vencido (ou com falha) não recarrega nem mostra erro', async () => {
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, dados: () => inicio({ monitoradas: 1, itens: [] }) },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, segurar: true },
  ]);
  const t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    const v = pedidos.find((p) => p.url.endsWith('/verificar'));
    await responder(v, { mensagem: 'fora' }, 503);
    await esperar();
    assert.equal(pedidos.filter((p) => p.url.endsWith('/api/inicio')).length, 1);
    assert.equal(document.querySelector('[role="alert"]'), null);
  } finally { await t.desmontar(); }
});

test('pesquisa: liga o monitoramento, mostra a próxima data e a última verificação; desliga', async () => {
  const FUNIL = { recorte: 2, avaliadas: 2, truncado: false, semAtributos: 0, eliminadas: 0, eliminadasPor: {}, exclusivas: {}, aprovadasCadastro: 2, comSite: 2, armazenadas: 2 };
  const pesquisa = { id: ID, conversa_id: 'conv', tese: 'Distribuidoras com mais de 20 anos', frente: 'venda', estado: 'concluida', motivo_estado: null,
    filtros: { uf: '', busca: '', cnae: '', incluirPossiveis: false, subsetor: 'Distribuição e trading químico' }, criterios: [{ id: 'idade', texto: 'Mais de 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 } }],
    meta: 20, limite_web: 40, versao: 3, funil: FUNIL, modo: 'regras', notas: [], referencia: '2026-08', atualizado_em: '2026-10-07T12:00:00Z', execucao: 0 };
  const detalhe = { pesquisa, contagens: { total: 0, revisadas: 0, pendentes: 0, aderente: 0, provavel: 0, a_confirmar: 0, nao_aderente: 0 }, itens: [], ia: null, monitoramento: null };
  const ligado = { ativo: true, verificadoEm: '2026-10-07T12:00:00Z', proximaEm: '2026-10-14T12:00:00Z',
    ultimoResultado: { verificadoEm: '2026-10-07T12:00:00Z', totalNovas: 1, totalEventos: 0, novas: [{ id: 'cnpj44444444', nome: 'Delta Química', aderencia: 100 }], eventos: [] } };
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${ID}$`), dados: () => detalhe },
    { metodo: 'PUT', url: /\/monitoramento$/, segurar: true },
  ]);
  const t = await montar(React.createElement(PesquisaTese, { usuario: { id: 'u', nome: 'Ana', papel: 'analista' }, inicial: { pesquisaId: ID },
    aoConsumirInicial: () => {}, aoAbrirTrabalho: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    const secao = () => document.getElementById(`monitor-${ID}`).closest('section');
    assert.match(secao().textContent, /Monitoramento semanal · desligado/);
    await clicar(botao(/^Monitorar toda semana$/));
    assert.match(botao(/Salvando/).textContent, /Salvando/);
    const puts = () => pedidos.filter((p) => p.metodo === 'PUT');
    assert.deepEqual(puts()[0].corpo, { ativo: true });
    await responder(puts()[0], { monitoramento: ligado });
    assert.match(secao().textContent, /Monitoramento semanal · ligado/);
    assert.match(secao().textContent, /Próxima verificação a partir de 14\/10\/2026/);
    assert.match(secao().textContent, /Última verificação em 07\/10\/2026: 1 empresa nova \(Delta Química\)/);
    assert.match(secao().textContent, /Ajustar critérios/);
    await clicar(botao(/^Parar de monitorar$/));
    assert.deepEqual(puts()[1].corpo, { ativo: false });
    await responder(puts()[1], { monitoramento: { ...ligado, ativo: false } });
    assert.match(secao().textContent, /Monitoramento semanal · desligado/);
  } finally { await t.desmontar(); }
});
