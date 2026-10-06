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

test('saúde com cookie de sessão mantém o 503 e não consulta a sessão', async t => {
  const logs = [];
  let indisponivel = true;
  const consultas = [];
  const db = { async query(sql) {
    consultas.push(sql);
    if (indisponivel) throw Object.assign(new Error('postgres://usuario:segredo@host/banco'), { code: 'ECONNREFUSED' });
    return { rows: [{ '?column?': 1 }] };
  } };
  const app = await criarApp(db, { logger: { level: 'error', stream: { write: linha => logs.push(linha) } } });
  t.after(() => app.close());
  const cookie = `ght4_sessao=${'a'.repeat(43)}`;
  const resposta = await app.inject({ method: 'GET', url: '/api/saude?origem=painel', headers: { cookie } });
  assert.equal(resposta.statusCode, 503);
  assert.equal(resposta.json().erro, 'servico_indisponivel');
  assert.deepEqual(consultas, ['SELECT 1']);
  assert.equal(JSON.parse(logs[0]).codigo, 'ECONNREFUSED');
  assert.doesNotMatch(resposta.body + logs.join(''), /segredo|postgres:\/\/|aaaaaaaaaa/);
  indisponivel = false;
  const recuperada = await app.inject({ method: 'GET', url: '/api/saude', headers: { cookie } });
  assert.equal(recuperada.statusCode, 200);
  assert.equal(recuperada.json().ok, true);
});

test('só GET/HEAD da saúde pulam a sessão; caminhos parecidos e rotas protegidas a resolvem', async t => {
  const consultas = [];
  const db = { async query(sql) {
    consultas.push(sql);
    throw Object.assign(new Error('segredo-do-driver'), { code: 'ECONNREFUSED' });
  } };
  const app = await criarApp(db, { logger: false });
  t.after(() => app.close());
  const cookie = `ght4_sessao=${'a'.repeat(43)}`;
  const head = await app.inject({ method: 'HEAD', url: '/api/saude', headers: { cookie } });
  assert.equal(head.statusCode, 503);
  assert.deepEqual(consultas, ['SELECT 1']);
  for (const url of ['/api/saude/', '/api/saudex', '/api/crm/painel?url=/api/saude']) {
    consultas.length = 0;
    await app.inject({ method: 'GET', url, headers: { cookie } });
    assert.ok(consultas.length > 0 && consultas[0] !== 'SELECT 1', `${url} deveria resolver a sessão`);
  }
});

test('com o banco fora, rota autenticada responde 503 sem expor o erro do driver', async t => {
  for (const code of ['ECONNREFUSED', '57P01', '08006', '53300', '28P01']) {
    const db = { async query() { throw Object.assign(new Error('segredo-do-driver'), { code }); } };
    const app = await criarApp(db, { logger: false });
    const resposta = await app.inject({ method: 'GET', url: '/api/crm/painel', headers: { cookie: `ght4_sessao=${'a'.repeat(43)}` } });
    await app.close();
    assert.equal(resposta.statusCode, 503, code);
    assert.equal(resposta.headers['retry-after'], code === '28P01' ? undefined : '30', `Retry-After ${code}`);
    assert.equal(resposta.json().erro, 'servico_indisponivel');
    assert.doesNotMatch(resposta.body, /segredo-do-driver/);
  }
});

test('erro que não é de conexão continua 500', async t => {
  const db = { async query() { throw Object.assign(new Error('segredo-do-driver'), { code: '42P01' }); } };
  const app = await criarApp(db, { logger: false });
  t.after(() => app.close());
  const resposta = await app.inject({ method: 'GET', url: '/api/crm/painel', headers: { cookie: `ght4_sessao=${'a'.repeat(43)}` } });
  assert.equal(resposta.statusCode, 500);
  assert.equal(resposta.json().erro, 'erro_interno');
  assert.doesNotMatch(resposta.body, /segredo-do-driver/);
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
  assert.equal(resposta.statusCode, 503);
  assert.equal(resposta.json().erro, 'servico_indisponivel');
  assert.equal(JSON.parse(logs[0]).codigo, 'ECONNREFUSED');
  assert.doesNotMatch(resposta.body + logs.join(''), /segredo-|teste@example/);
});
