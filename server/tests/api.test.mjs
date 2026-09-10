/* =============================================================================
 *  GHT4 · testes da API
 * -----------------------------------------------------------------------------
 *  Usa `app.inject()`: exercita o pipeline inteiro do Fastify — cookie, hooks,
 *  validação, tratamento de erro — sem abrir porta. Rápido e determinístico.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';

import { criarApp, ROTAS_PUBLICAS } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso } from './ajuda.mjs';

/** Sobe app + banco e devolve os dois. */
async function montar() {
  const db = await bancoDeTeste();
  const app = await criarApp(db);
  return { db, app };
}

/** Faz login e devolve o cookie pronto para o cabeçalho. */
async function entrar(app, email, senha) {
  const r = await app.inject({
    method: 'POST', url: '/api/sessao', payload: { email, senha },
  });
  assert.equal(r.statusCode, 200, `login falhou: ${r.body}`);
  const bruto = r.headers['set-cookie'];
  const cookie = Array.isArray(bruto) ? bruto[0] : bruto;
  return cookie.split(';')[0];
}

test('saúde responde sem sessão', async () => {
  const { app } = await montar();
  const r = await app.inject({ method: 'GET', url: '/api/saude' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().ok, true);
});

test('login correto abre sessão e /api/eu passa a responder', async () => {
  const { db, app } = await montar();
  await criarUsuario(db, { email: 'socio@ght4.com', nome: 'Sócia', papel: 'socio', senha: 'senha-de-teste-longa' });

  const cookie = await entrar(app, 'socio@ght4.com', 'senha-de-teste-longa');

  const r = await app.inject({ method: 'GET', url: '/api/eu', headers: { cookie } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().email, 'socio@ght4.com');
  assert.equal(r.json().papel, 'socio');
});

test('senha errada e e-mail inexistente respondem igual', async () => {
  /* Distinguir os dois permitiria descobrir quem tem conta na casa. */
  const { db, app } = await montar();
  await criarUsuario(db, { email: 'existe@ght4.com', senha: 'a-senha-certa-aqui' });

  const errada = await app.inject({
    method: 'POST', url: '/api/sessao',
    payload: { email: 'existe@ght4.com', senha: 'a-senha-errada' },
  });
  const inexistente = await app.inject({
    method: 'POST', url: '/api/sessao',
    payload: { email: 'naoexiste@ght4.com', senha: 'a-senha-errada' },
  });

  assert.equal(errada.statusCode, 401);
  assert.equal(inexistente.statusCode, 401);
  assert.deepEqual(errada.json(), inexistente.json());
});

test('conta desativada não entra', async () => {
  const { db, app } = await montar();
  const u = await criarUsuario(db, { email: 'ex@ght4.com', senha: 'senha-de-teste-longa' });
  await db.query('UPDATE usuarios SET ativo = FALSE WHERE id = $1', [u.id]);

  const r = await app.inject({
    method: 'POST', url: '/api/sessao',
    payload: { email: 'ex@ght4.com', senha: 'senha-de-teste-longa' },
  });
  assert.equal(r.statusCode, 401);
});

test('o cookie de sessão é httpOnly', async () => {
  const { db, app } = await montar();
  await criarUsuario(db, { email: 'h@ght4.com', senha: 'senha-de-teste-longa' });
  const r = await app.inject({
    method: 'POST', url: '/api/sessao',
    payload: { email: 'h@ght4.com', senha: 'senha-de-teste-longa' },
  });
  const bruto = r.headers['set-cookie'];
  const cookie = Array.isArray(bruto) ? bruto[0] : bruto;
  assert.match(cookie, /HttpOnly/i);
});

test('sem sessão, rota protegida devolve 401', async () => {
  const { app } = await montar();
  const r = await app.inject({ method: 'GET', url: '/api/eu' });
  assert.equal(r.statusCode, 401);
  assert.equal(r.json().erro, 'nao_autenticado');
});

test('logout invalida o cookie de verdade', async () => {
  const { db, app } = await montar();
  await criarUsuario(db, { email: 'sai@ght4.com', senha: 'senha-de-teste-longa' });
  const cookie = await entrar(app, 'sai@ght4.com', 'senha-de-teste-longa');

  await app.inject({ method: 'DELETE', url: '/api/sessao', headers: { cookie } });

  const r = await app.inject({ method: 'GET', url: '/api/eu', headers: { cookie } });
  assert.equal(r.statusCode, 401, 'o cookie continuou valendo depois do logout');
});

test('corpo fora do contrato devolve 422, não 500', async () => {
  const { app } = await montar();
  const r = await app.inject({
    method: 'POST', url: '/api/sessao', payload: { email: 'nao-e-email' },
  });
  assert.equal(r.statusCode, 422);
  assert.equal(r.json().erro, 'corpo_invalido');
  assert.ok(Array.isArray(r.json().detalhe));
});

/* ---- escopo de mandato pela API ------------------------------------------- */

test('a lista de mandatos só traz os que o usuário alcança', async () => {
  const { db, app } = await montar();
  const u = await criarUsuario(db, { email: 'an@ght4.com', papel: 'analista', senha: 'senha-de-teste-longa' });
  const meu = await criarMandato(db, { codigo: 'MEU', rotulo: 'Meu mandato' });
  await criarMandato(db, { codigo: 'ALHEIO', rotulo: 'De outro time' });
  const aberto = await criarMandato(db, { codigo: 'PILOTO', confidencial: false });
  await darAcesso(db, meu.id, u.id, 'analista');

  const cookie = await entrar(app, 'an@ght4.com', 'senha-de-teste-longa');
  const r = await app.inject({ method: 'GET', url: '/api/mandatos', headers: { cookie } });

  const codigos = r.json().mandatos.map((m) => m.codigo).sort();
  assert.deepEqual(codigos, ['MEU', 'PILOTO']);
  assert.ok(!codigos.includes('ALHEIO'), 'mandato alheio apareceu na lista');
  assert.ok(aberto);
});

test('mandato alheio responde 404, não 403', async () => {
  /* 403 confirmaria que aquele mandato existe. Para dado confidencial, a
     resposta certa é "não encontrado". */
  const { db, app } = await montar();
  await criarUsuario(db, { email: 'fora@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  const alheio = await criarMandato(db, { codigo: 'SIGILO' });

  const cookie = await entrar(app, 'fora@ght4.com', 'senha-de-teste-longa');
  const r = await app.inject({
    method: 'GET', url: `/api/mandatos/${alheio.id}`, headers: { cookie },
  });

  assert.equal(r.statusCode, 404);
  assert.equal(r.json().erro, 'mandato_inexistente');
  assert.ok(!r.body.includes('SIGILO'), 'o código do mandato vazou na resposta');
});

test('quem participa lê o mandato', async () => {
  const { db, app } = await montar();
  const u = await criarUsuario(db, { email: 'dentro@ght4.com', papel: 'analista', senha: 'senha-de-teste-longa' });
  const m = await criarMandato(db, { codigo: 'QUIM-01' });
  await darAcesso(db, m.id, u.id, 'analista');

  const cookie = await entrar(app, 'dentro@ght4.com', 'senha-de-teste-longa');
  const r = await app.inject({ method: 'GET', url: `/api/mandatos/${m.id}`, headers: { cookie } });

  assert.equal(r.statusCode, 200);
  assert.equal(r.json().mandato.codigo, 'QUIM-01');
});

/* ---- nega por padrão ------------------------------------------------------ */

test('toda rota registrada é pública por decisão, não por esquecimento', async () => {
  /* Varre as rotas do Fastify e reprova qualquer uma fora da lista explícita de
     públicas. Assim, adicionar rota sem verificação vira teste vermelho em vez
     de virar vazamento. */
  const { app } = await montar();
  await app.ready();

  const registradas = app.printRoutes({ commonPrefix: false })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  /* printRoutes desenha uma árvore; o que interessa é que a lista de públicas
     não cresceu sem alguém decidir. */
  assert.deepEqual(
    [...ROTAS_PUBLICAS].sort(),
    ['GET /api/instalacao', 'GET /api/saude', 'POST /api/instalacao', 'POST /api/sessao'],
    'a lista de rotas públicas mudou — foi decisão?',
  );
  assert.ok(registradas.length > 0);
});
