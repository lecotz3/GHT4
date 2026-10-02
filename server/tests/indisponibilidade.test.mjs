import test from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/app.mjs';
import { criarHandlerVercel } from '../src/operacao/vercel.mjs';

test('saúde sinaliza indisponibilidade, registra código sem segredos e se recupera', async t => {
  const logs = [];
  let indisponivel = true;
  const db = { async query() {
    if (indisponivel) throw Object.assign(new Error('postgres://usuario:segredo@host/banco'), { code: '28P01' });
    return { rows: [{ '?column?': 1 }] };
  } };
  const app = await criarApp(db, { logger: { level: 'error', stream: { write: linha => logs.push(linha) } } });
  t.after(() => app.close());
  const handler = criarHandlerVercel(async () => app);
  const resposta = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(v) { this.body = v.toString(); } };
  await handler({ method: 'GET', url: '/api/saude', headers: {}, socket: {} }, resposta);
  assert.equal(resposta.statusCode, 503);
  assert.equal(JSON.parse(resposta.body).erro, 'servico_indisponivel');
  assert.equal(resposta.headers['cache-control'], 'no-store');
  assert.equal(JSON.parse(logs[0]).codigo, '28P01');
  assert.ok(JSON.parse(logs[0]).reqId);
  assert.doesNotMatch(resposta.body + logs.join(''), /segredo|postgres:\/\//);
  indisponivel = false;
  const recuperada = await app.inject({ method: 'GET', url: '/api/saude' });
  assert.equal(recuperada.statusCode, 200);
  assert.equal(recuperada.json().ok, true);
});

test('falha no login registra o incidente sem corpo, cookie ou mensagem do driver', async t => {
  const logs = [];
  const db = { async query() {
    throw Object.assign(new Error('segredo-do-driver'), { code: 'ECONNREFUSED' });
  } };
  const app = await criarApp(db, { logger: { level: 'error', stream: { write: linha => logs.push(linha) } } });
  t.after(() => app.close());
  const resposta = await app.inject({ method: 'POST', url: '/api/sessao',
    headers: { cookie: 'outro=segredo-do-cookie' },
    payload: { email: 'teste@example.test', senha: 'segredo-da-senha' } });
  assert.equal(resposta.statusCode, 500);
  assert.equal(resposta.json().erro, 'erro_interno');
  assert.equal(JSON.parse(logs[0]).codigo, 'ECONNREFUSED');
  assert.doesNotMatch(resposta.body + logs.join(''), /segredo-|teste@example/);
});
