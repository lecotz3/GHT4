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
const comNovidade = { monitoradas: 1, itens: [{ pesquisaId: ID, titulo: 't', tese: 'Distribuidoras com mais de 20 anos', novas: 2, eventos: 1, detectadoEm: '2026-10-07T12:00:00Z', exemplos: ['Delta Química', 'Épsilon'], ateId: 7, parcial: true }] };

test('Meu dia: verificação vencida recarrega e mostra a novidade; abrir leva à pesquisa com o marco do aviso, sem marcar antes', async () => {
  const abertas = [];
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, segurar: true },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, segurar: true },
    { metodo: 'POST', url: /\/novidades\/vistas$/, dados: () => ({ vistas: 3 }) },
  ]);
  const t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {}, aoAbrirPesquisa: (id, ateId) => abertas.push([id, ateId]) }));
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
    assert.match(texto, /Distribuidoras com mais de 20 anos · 2 empresas novas · 1 com evento societário \(Delta Química, Épsilon\) · verificação parcial do recorte/);
    assert.doesNotMatch(texto, /Nada pendente/);
    await clicar(botao(/Distribuidoras com mais de 20 anos/));
    assert.deepEqual(abertas, [[ID, 7]]);
    assert.equal(pedidos.filter((p) => p.url.endsWith('/novidades/vistas')).length, 0, 'o Meu dia não marca: a pesquisa marca depois de carregar');
  } finally { await t.desmontar(); }
});

test('Meu dia: falha na verificação aparece num aviso próprio, sem derrubar a agenda; "Verificar de novo" repete', async () => {
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, dados: () => inicio({ monitoradas: 1, itens: [] }) },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, segurar: true },
  ]);
  const t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    const verificar = () => pedidos.filter((p) => p.url.endsWith('/verificar'));
    await responder(verificar()[0], { mensagem: 'fora' }, 503);
    await esperar();
    assert.equal(pedidos.filter((p) => p.url.endsWith('/api/inicio')).length, 1, 'a agenda não recarrega');
    assert.equal(document.querySelector('[role="alert"]'), null, 'não é erro da agenda');
    assert.match(document.querySelector('section.agente-meu-dia').textContent, /Não foi possível verificar suas teses monitoradas agora/);
    // Todas as verificações falharam no servidor: o aviso continua.
    await clicar(botao(/^Verificar de novo$/));
    assert.equal(verificar().length, 2);
    await responder(verificar()[1], { verificados: 0, falhas: 1 });
    assert.match(document.querySelector('section.agente-meu-dia').textContent, /Não foi possível verificar suas teses monitoradas agora/);
    // Nova tentativa sem falha: o aviso some.
    await clicar(botao(/^Verificar de novo$/));
    assert.equal(verificar().length, 3);
    await responder(verificar()[2], { verificados: 0, falhas: 0 });
    assert.doesNotMatch(document.querySelector('section.agente-meu-dia').textContent, /Não foi possível verificar/);
  } finally { await t.desmontar(); }
});

test('Meu dia: sem tese monitorada, falha na verificação não gera aviso; 401 encerra a sessão', async () => {
  let expirou = 0;
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, dados: () => inicio({ monitoradas: 0, itens: [] }) },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, segurar: true },
  ]);
  let t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => { expirou += 1; } }));
  try {
    await esperar();
    await responder(pedidos.find((p) => p.url.endsWith('/verificar')), { mensagem: 'fora' }, 503);
    assert.doesNotMatch(document.body.textContent, /Não foi possível verificar/);
    assert.equal(expirou, 0);
  } finally { await t.desmontar(); }
  const p2 = servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, dados: () => inicio({ monitoradas: 1, itens: [] }) },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, segurar: true },
  ]);
  t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => { expirou += 1; } }));
  try {
    await esperar();
    await responder(p2.find((p) => p.url.endsWith('/verificar')), { mensagem: 'Sessão expirada.' }, 401);
    assert.equal(expirou, 1);
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
    assert.equal(secao().querySelector('[role="status"]').textContent, 'Monitoramento ligado. Próxima verificação a partir de 14/10/2026.', 'leitor de tela ouve a mudança');
    await clicar(botao(/^Parar de monitorar$/));
    assert.deepEqual(puts()[1].corpo, { ativo: false });
    await responder(puts()[1], { monitoramento: { ...ligado, ativo: false } });
    assert.match(secao().textContent, /Monitoramento semanal · desligado/);
    assert.equal(secao().querySelector('[role="status"]').textContent, 'Monitoramento desligado.');
  } finally { await t.desmontar(); }
});

test('pesquisa aberta pelo aviso: marca como vistas até o marco só depois de carregar; falhou ao abrir, não marca', async () => {
  const FUNIL = { recorte: 2, avaliadas: 2, truncado: false, semAtributos: 0, eliminadas: 0, eliminadasPor: {}, exclusivas: {}, aprovadasCadastro: 2, comSite: 2, armazenadas: 2 };
  const pesquisa = { id: ID, conversa_id: 'conv', tese: 'Distribuidoras com mais de 20 anos', frente: 'venda', estado: 'concluida', motivo_estado: null,
    filtros: { uf: '', busca: '', cnae: '', incluirPossiveis: false }, criterios: [{ id: 'idade', texto: 'Mais de 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 } }],
    meta: 20, limite_web: 40, versao: 3, funil: FUNIL, modo: 'regras', notas: [], referencia: '2026-08', atualizado_em: '2026-10-07T12:00:00Z', execucao: 0 };
  const parcial = { ativo: true, verificadoEm: '2026-10-07T12:00:00Z', proximaEm: '2026-10-14T12:00:00Z', cobertura: { recorte: 12145, avaliadas: 10000, completa: false },
    ultimoResultado: { verificadoEm: '2026-10-07T12:00:00Z', totalNovas: 0, totalEventos: 0, cobertura: { recorte: 12145, avaliadas: 10000, completa: false }, novas: [], eventos: [] } };
  const detalhe = { pesquisa, contagens: { total: 0, revisadas: 0, pendentes: 0, aderente: 0, provavel: 0, a_confirmar: 0, nao_aderente: 0 }, itens: [], ia: null, monitoramento: parcial };
  const props = { usuario: { id: 'u', nome: 'Ana', papel: 'analista' }, aoConsumirInicial: () => {}, aoAbrirTrabalho: () => {}, aoExpirar: () => {} };
  // Falha ao abrir: nenhum pedido de "vistas".
  let pedidos = servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${ID}$`), segurar: true },
  ]);
  let t = await montar(React.createElement(PesquisaTese, { ...props, inicial: { pesquisaId: ID, novidadesAte: 7 } }));
  try {
    await esperar();
    await responder(pedidos.find((p) => p.metodo === 'GET' && p.url.endsWith(ID)), { mensagem: 'fora' }, 503);
    await esperar();
    assert.equal(pedidos.filter((p) => p.url.endsWith('/novidades/vistas')).length, 0, 'aviso continua no Meu dia');
  } finally { await t.desmontar(); }
  // Abriu: marca até o marco, uma vez; cobertura parcial aparece.
  pedidos = servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${ID}$`), dados: () => detalhe },
    { metodo: 'POST', url: /\/novidades\/vistas$/, dados: () => ({ vistas: 2 }) },
  ]);
  t = await montar(React.createElement(PesquisaTese, { ...props, inicial: { pesquisaId: ID, novidadesAte: 7 } }));
  try {
    await esperar(); await esperar();
    const vistas = pedidos.filter((p) => p.url.endsWith(`/api/pesquisas/${ID}/novidades/vistas`));
    assert.equal(vistas.length, 1);
    assert.deepEqual(vistas[0].corpo, { ateId: 7 });
    const secao = document.getElementById(`monitor-${ID}`).closest('section');
    assert.match(secao.textContent, /Cobertura parcial: a verificação avalia 10\.000 de 12\.145 empresas do recorte/);
    assert.match(secao.textContent, /Última verificação em 07\/10\/2026 \(parcial\)/);
  } finally { await t.desmontar(); }
});
