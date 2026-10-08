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

test('Meu dia: o aviso de falha segue o estado gravado no servidor; zero execuções não é recuperação; "Verificar de novo" pede nova tentativa', async () => {
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, dados: () => inicio({ monitoradas: 2, itens: [] }) },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, segurar: true },
  ]);
  const t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {} }));
  const quando = new Date(); quando.setHours(15, 30, 0, 0);
  const proximaTentativa = quando.toISOString();
  const texto = () => document.querySelector('section.agente-meu-dia').textContent;
  const inicios = () => pedidos.filter((p) => p.url.endsWith('/api/inicio')).length;
  try {
    await esperar();
    const verificar = () => pedidos.filter((p) => p.url.endsWith('/verificar'));
    assert.deepEqual(verificar()[0].corpo, {}, 'ao abrir, verificação normal (sem pedido de repetição)');
    // A chamada falhou: aviso próprio, sem derrubar a agenda.
    await responder(verificar()[0], { mensagem: 'fora' }, 503);
    await esperar();
    assert.equal(inicios(), 1, 'a agenda não recarrega');
    assert.equal(document.querySelector('[role="alert"]'), null, 'não é erro da agenda');
    assert.match(texto(), /Não foi possível verificar suas teses monitoradas agora/);
    // O pedido explícito executou e falhou: informa a tentativa automática agendada.
    await clicar(botao(/^Verificar de novo$/));
    assert.deepEqual(verificar()[1].corpo, { repetir: true });
    await responder(verificar()[1], { verificados: 0, falhas: 1, emFalha: 1, proximaTentativa });
    assert.match(texto(), /Não foi possível verificar 1 tese monitorada\. Nova tentativa automática a partir de 15:30\./);
    assert.match(texto(), /Nada pendente na última consulta/);
    assert.doesNotMatch(texto(), /Nada pendente com você agora/);
    // Nada executou (falha recente demais), mas o servidor diz que a falha continua: o aviso fica.
    await clicar(botao(/^Verificar de novo$/));
    await responder(verificar()[2], { verificados: 0, falhas: 0, emFalha: 1, proximaTentativa });
    assert.match(texto(), /Não foi possível verificar 1 tese monitorada/);
    assert.match(texto(), /aguarde alguns segundos/);
    // Uma tese verificada e outra com falha: recarrega as novidades e mantém o aviso.
    await clicar(botao(/^Verificar de novo$/));
    await responder(verificar()[3], { verificados: 1, falhas: 1, emFalha: 1, proximaTentativa });
    await esperar();
    assert.equal(inicios(), 2, 'o que foi verificado aparece');
    assert.match(texto(), /Não foi possível verificar 1 tese monitorada/);
    assert.doesNotMatch(texto(), /aguarde/);
    // Recuperação de fato: o servidor não tem mais falha registrada.
    await clicar(botao(/^Verificar de novo$/));
    await responder(verificar()[4], { verificados: 1, falhas: 0, emFalha: 0, proximaTentativa: null });
    await esperar();
    assert.doesNotMatch(texto(), /Não foi possível verificar/);
    assert.equal(verificar().length, 5, 'nenhuma verificação extra');
  } finally { await t.desmontar(); }
});

test('Meu dia: falha registrada antes aparece ao abrir, mesmo quando esta chamada não executou nada', async () => {
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, dados: () => inicio({ monitoradas: 3, itens: [] }) },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, segurar: true },
  ]);
  const t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    await responder(pedidos.find((p) => p.url.endsWith('/verificar')), { verificados: 0, falhas: 0, emFalha: 2, proximaTentativa: '2030-01-02T10:00:00Z' });
    const texto = document.querySelector('section.agente-meu-dia').textContent;
    assert.match(texto, /Não foi possível verificar 2 teses monitoradas\. Nova tentativa automática a partir de \d{2}:\d{2} de 0[12]\/01\/2030\./);
    assert.doesNotMatch(texto, /aguarde/, 'não foi pedido explícito');
  } finally { await t.desmontar(); }
});

test('Meu dia: pedido em curso trava "Verificar de novo"; tentativa em andamento em outra aba aparece como tal, sem falso zero', async () => {
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, dados: () => inicio({ monitoradas: 1, itens: [] }) },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, segurar: true },
  ]);
  const t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {} }));
  const texto = () => document.querySelector('section.agente-meu-dia').textContent;
  const verificar = () => pedidos.filter((p) => p.url.endsWith('/verificar'));
  try {
    await esperar();
    await responder(verificar()[0], { verificados: 0, falhas: 1, emFalha: 1, emAndamento: 0, proximaTentativa: '2030-01-02T10:00:00Z' });
    await clicar(botao(/^Verificar de novo$/));
    const emCurso = botao(/^Verificando…$/);
    assert.ok(emCurso.disabled);
    await clicar(emCurso);
    assert.equal(verificar().length, 2, 'segundo clique não sobrepõe outro pedido');
    // Outra aba já está calculando a nova tentativa: o aviso diz isso, sem "aguarde" nem falso zero.
    await responder(verificar()[1], { verificados: 0, falhas: 0, emFalha: 1, emAndamento: 1, proximaTentativa: '2030-01-02T10:00:00Z' });
    assert.match(texto(), /Não foi possível verificar 1 tese monitorada\. Uma nova tentativa está em andamento\./);
    assert.doesNotMatch(texto(), /aguarde|Nova tentativa automática|Nada pendente com você agora/);
    assert.ok(botao(/^Verificar de novo$/) && !botao(/^Verificar de novo$/).disabled, 'concluído o pedido, o botão volta');
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

test('pesquisa: falha registrada e transição "a conferir" aparecem no monitoramento; Meu dia mostra quantas são a conferir', async () => {
  const FUNIL = { recorte: 2, avaliadas: 2, truncado: false, semAtributos: 0, eliminadas: 0, eliminadasPor: {}, exclusivas: {}, aprovadasCadastro: 2, comSite: 2, armazenadas: 2 };
  const pesquisa = { id: ID, conversa_id: 'conv', tese: 'Distribuidoras com mais de 20 anos', frente: 'venda', estado: 'concluida', motivo_estado: null,
    filtros: { uf: '', busca: '', cnae: '', incluirPossiveis: false, subsetor: 'Distribuição e trading químico' }, criterios: [{ id: 'idade', texto: 'Mais de 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 } }],
    meta: 20, limite_web: 40, versao: 3, funil: FUNIL, modo: 'regras', notas: [], referencia: '2026-08', atualizado_em: '2026-10-07T12:00:00Z', execucao: 0 };
  const monitoramento = { ativo: true, verificadoEm: '2026-10-07T12:00:00Z', proximaEm: '2026-10-08T13:00:00Z', falhaEm: '2026-10-08T12:00:00Z', cobertura: { recorte: 2, avaliadas: 2, completa: true },
    ultimoResultado: { verificadoEm: '2026-10-07T12:00:00Z', totalNovas: 2, totalEventos: 0, aConferir: 2, transicao: 'incerta', novas: [{ id: 'cnpj33333333', nome: 'Gama', aderencia: 100 }, { id: 'cnpj44444444', nome: 'Delta', aderencia: 100 }], eventos: [] } };
  servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${ID}$`), dados: () => ({ pesquisa, contagens: { total: 0, revisadas: 0, pendentes: 0, aderente: 0, provavel: 0, a_confirmar: 0, nao_aderente: 0 }, itens: [], ia: null, monitoramento }) },
  ]);
  let t = await montar(React.createElement(PesquisaTese, { usuario: { id: 'u', nome: 'Ana', papel: 'analista' }, inicial: { pesquisaId: ID },
    aoConsumirInicial: () => {}, aoAbrirTrabalho: () => {}, aoExpirar: () => {} }));
  try {
    await esperar();
    const texto = document.getElementById(`monitor-${ID}`).closest('section').textContent;
    assert.match(texto, /A última tentativa de verificação falhou \(08\/10\/2026\)\. Nova tentativa automática a partir de 08\/10\/2026/);
    assert.match(texto, /Verificação de transição: este monitoramento foi ligado numa versão anterior, que não acompanhava o recorte inteiro, .*As 2 empresas listadas como novas podem já atender à tese desde antes do monitoramento: confira\./);
  } finally { await t.desmontar(); }
  servidor([
    { metodo: 'GET', url: /\/api\/inicio$/, dados: () => inicio({ monitoradas: 1, itens: [{ ...comNovidade.itens[0], novas: 2, eventos: 0, aConferir: 2, parcial: false }] }) },
    { metodo: 'POST', url: /\/api\/monitoramentos\/verificar$/, dados: () => ({ verificados: 0, falhas: 0, emFalha: 0, proximaTentativa: null }) },
  ]);
  t = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {}, aoAbrirPesquisa: () => {} }));
  try {
    await esperar();
    assert.match(document.querySelector('section.agente-meu-dia').textContent, /Distribuidoras com mais de 20 anos · 2 empresas novas \(2 a conferir\)/);
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
    assert.match(secao.textContent, /Cobertura parcial: a última verificação avaliou 10\.000 de 12\.145 empresas do recorte, e empresas fora dessa parte não geraram aviso\. A próxima verificação lê o recorte inteiro\./);
    assert.match(secao.textContent, /Última verificação em 07\/10\/2026 \(parcial\)/);
  } finally { await t.desmontar(); }
  // Recorte acima do teto da varredura: a orientação é restringir o recorte.
  const acima = { cobertura: { recorte: 150000, avaliadas: 100000, completa: false } };
  pedidos = servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${ID}$`), dados: () => ({ ...detalhe, monitoramento: { ...parcial, ...acima, ultimoResultado: { ...parcial.ultimoResultado, ...acima } } }) },
  ]);
  t = await montar(React.createElement(PesquisaTese, { ...props, inicial: { pesquisaId: ID } }));
  try {
    await esperar(); await esperar();
    const secao = document.getElementById(`monitor-${ID}`).closest('section');
    assert.match(secao.textContent, /avaliou 100\.000 de 150\.000 empresas do recorte, e empresas fora dessa parte não geraram aviso\. O recorte passa do teto de 100\.000 empresas por verificação: para cobrir tudo, restrinja o recorte/);
    assert.doesNotMatch(secao.textContent, /A próxima verificação lê o recorte inteiro/);
  } finally { await t.desmontar(); }
});
