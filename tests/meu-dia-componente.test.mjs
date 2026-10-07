/* Componente MeuDia real no jsdom: falha, recuperação, recarga em voo, 401, fora da rede,
   virada de dia e resposta tardia. Pendência das revisões das Rodadas 5–10. */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { React, montar, servidor, botao, clicar, esperar, responder } from './apoio/dom.mjs';

const { MeuDia } = await import('../v1/src/componentes/MeuDia.tsx');

const inicio = (o = {}) => ({
  hoje: o.hoje ?? '2026-10-07',
  compromissos: o.compromissos === undefined ? { atrasados: 1, hoje: 2, semana: 3, itens: [
    { oportunidade_id: 'o1', titulo: 'Op 1', descricao: 'Ligar para a diretoria', prazo: '2026-10-06', tipo: 'contato', empresa: 'Alfa Química' }] } : o.compromissos,
  semProximoPasso: o.semProximoPasso ?? { total: 0, itens: [] },
  rede: o.rede ?? { naRede: true, perguntasPendentes: 0, vinculosParaConfirmar: 0 },
});
const elemento = (visivel, props = {}) => React.createElement(MeuDia, { visivel, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {}, ...props });
const secao = () => document.querySelector('section.agente-meu-dia');
const alerta = () => document.querySelector('[role="alert"]')?.textContent ?? '';
const pedidosInicio = (pedidos) => pedidos.filter((p) => p.url.endsWith('/api/inicio'));

test('Meu dia: falha na primeira carga mostra o alerta e "Tentar de novo" recupera', async () => {
  const pedidos = servidor([{ metodo: 'GET', url: /\/api\/inicio$/, segurar: true }]);
  const t = await montar(elemento(true));
  assert.equal(secao()?.getAttribute('aria-busy'), 'true', 'esqueleto enquanto carrega');
  await responder(pedidosInicio(pedidos)[0], { mensagem: 'fora do ar' }, 503);
  assert.match(alerta(), /Sua agenda não pôde ser carregada/);
  await clicar(botao(/Tentar de novo/));
  await responder(pedidosInicio(pedidos)[1], inicio());
  assert.equal(alerta(), '');
  assert.match(secao().textContent, /Ligar para a diretoria/);
  assert.match(secao().textContent, /1vencidos/);
  await t.desmontar();
});

test('Meu dia: recarga em voo marca "atualizando" e a falha mantém os números com o horário da consulta', async () => {
  const pedidos = servidor([{ metodo: 'GET', url: /\/api\/inicio$/, segurar: true }]);
  const t = await montar(elemento(true));
  await responder(pedidosInicio(pedidos)[0], inicio({ compromissos: { atrasados: 0, hoje: 0, semana: 0, itens: [] } }));
  assert.match(secao().textContent, /Nada pendente com você agora/);
  // Volta a ficar visível: recarga em voo.
  await t.atualizar(elemento(false));
  await t.atualizar(elemento(true));
  assert.equal(secao().getAttribute('aria-busy'), 'true');
  assert.match(secao().textContent, /atualizando…/);
  assert.match(secao().textContent, /Nada pendente na última consulta/, 'não afirma "agora" com a consulta em voo');
  await responder(pedidosInicio(pedidos)[1], { mensagem: 'erro' }, 500);
  assert.equal(secao().getAttribute('aria-busy'), 'false');
  assert.match(alerta(), /Não foi possível atualizar agora\. Os números abaixo são da consulta das \d\d:\d\d e podem estar desatualizados/);
  assert.match(secao().textContent, /Nada pendente na última consulta/);
  // Recupera: o aviso some.
  await clicar(botao(/Tentar de novo/));
  await responder(pedidosInicio(pedidos)[2], inicio());
  assert.equal(alerta(), '');
  assert.match(secao().textContent, /Ligar para a diretoria/);
  await t.desmontar();
});

test('Meu dia: 401 encerra a sessão sem alerta de falha', async () => {
  let expirou = 0;
  const pedidos = servidor([{ metodo: 'GET', url: /\/api\/inicio$/, segurar: true }]);
  const t = await montar(elemento(true, { aoExpirar: () => { expirou++; } }));
  await responder(pedidosInicio(pedidos)[0], { mensagem: 'Faça login.' }, 401);
  assert.equal(expirou, 1);
  assert.equal(alerta(), '');
  await t.desmontar();
});

test('Meu dia: fora da rede aparece com e sem pendências', async () => {
  const fora = { naRede: false, perguntasPendentes: 0, vinculosParaConfirmar: 0 };
  for (const dados of [inicio({ rede: fora, compromissos: { atrasados: 0, hoje: 0, semana: 0, itens: [] } }), inicio({ rede: fora })]) {
    servidor([{ metodo: 'GET', url: /\/api\/inicio$/, dados: () => dados }]);
    const t = await montar(elemento(true));
    await esperar();
    assert.match(secao().textContent, /Você ainda não está na rede/);
    await t.desmontar();
  }
});

test('Meu dia: falha depois da virada do dia diz a data da consulta, não só a hora', async (t) => {
  // Só o relógio é simulado; os timers continuam reais para o React.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-06T12:00:00Z') });
  t.after(() => mock.timers.reset());
  const pedidos = servidor([{ metodo: 'GET', url: /\/api\/inicio$/, segurar: true }]);
  const m = await montar(elemento(true));
  await responder(pedidosInicio(pedidos)[0], inicio({ hoje: '2026-10-06' }));
  mock.timers.setTime(new Date('2026-10-07T12:00:00Z').getTime());
  await m.atualizar(elemento(false));
  await m.atualizar(elemento(true));
  await responder(pedidosInicio(pedidos)[1], { mensagem: 'erro' }, 500);
  assert.match(alerta(), /consulta das \d\d:\d\d de 06\/10\/2026/);
  await m.desmontar();
});

test('Meu dia: resposta de uma consulta abandonada (tela escondida) não é aplicada', async () => {
  const pedidos = servidor([{ metodo: 'GET', url: /\/api\/inicio$/, segurar: true }]);
  const t = await montar(elemento(true));
  await responder(pedidosInicio(pedidos)[0], inicio({ compromissos: { atrasados: 0, hoje: 0, semana: 0, itens: [] } }));
  await t.atualizar(elemento(false));
  await t.atualizar(elemento(true));
  await t.atualizar(elemento(false));
  // A consulta abandonada responde depois: nada muda na tela, nem o estado de atualização.
  await responder(pedidosInicio(pedidos)[1], inicio());
  assert.doesNotMatch(secao().textContent, /Ligar para a diretoria/);
  assert.equal(pedidosInicio(pedidos).length, 2);
  await t.desmontar();
});
