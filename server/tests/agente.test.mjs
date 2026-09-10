import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso } from './ajuda.mjs';
import { complementarComIA } from '../src/agente/tarefas.mjs';

const empresa = { id: 'cnpj12345678', nome: 'Empresa de teste', razaoSocial: 'Empresa de teste Ltda',
  cnpjRaiz: '12345678', uf: 'SP', cidade: 'Campinas', estado: 'provavel', referencia: '2026-08', receita: null };
const catalogo = { buscar: async () => ({ empresas: [empresa], total: 1, referencia: '2026-08', hash: 'hash-teste' }),
  obter: async (id) => id === empresa.id ? empresa : null };

async function montar(t, opcoes = {}) {
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo, ...opcoes });
  t.after(async () => { await app.close(); await db.close(); });
  async function usuario(email, papel = 'analista') {
    const u = await criarUsuario(db, { email, papel, senha: 'senha-para-teste-apenas' });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha: 'senha-para-teste-apenas' } });
    assert.equal(r.statusCode, 200);
    const cookie = r.headers['set-cookie'].split(';')[0];
    const chamar = (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
    return { ...u, chamar };
  }
  async function trabalho(u, extra = {}) {
    const r = await u.chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Pesquisa química', ...extra });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().conversa;
  }
  return { db, app, usuario, trabalho };
}

test('trabalho salva resultado, contexto e ação; retomada e repetição não duplicam', async (t) => {
  const { db, usuario, trabalho } = await montar(t);
  const u = await usuario('a@teste.local');
  const c = await trabalho(u);
  const url = `/api/agente/conversas/${c.id}/mensagens`;
  const p = { chave: randomUUID(), versao: 0, tarefa: 'buscar_empresas', texto: 'Tese de compra', contexto: { frente: 'compra', uf: 'SP' } };
  const r = await u.chamar('POST', url, p);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().turno.resultado.empresas[0].receita, null);
  assert.equal(r.json().conversa.versao, 1);
  assert.equal((await u.chamar('POST', url, p)).json().turno.id, r.json().turno.id);
  assert.equal((await u.chamar('POST', url, { ...p, texto: 'Outro pedido' })).statusCode, 409);
  assert.equal((await u.chamar('POST', url, { ...p, chave: randomUUID() })).statusCode, 409);
  const reuniao = await u.chamar('POST', url, { chave: randomUUID(), versao: 1, tarefa: 'preparar_reuniao', contexto: { empresaId: empresa.id } });
  assert.equal(reuniao.statusCode, 200, reuniao.body);
  assert.ok(reuniao.json().turno.resultado.blocos.some((b) => b.titulo.includes('aquisições')));
  const acao = { chave: randomUUID(), versao: 2, tarefa: 'registrar_passo', texto: 'Confirmar aplicações antes da reunião' };
  assert.equal((await u.chamar('POST', url, acao)).statusCode, 200);
  assert.equal((await u.chamar('POST', url, acao)).statusCode, 200);
  const salvo = (await u.chamar('GET', `/api/agente/conversas/${c.id}`)).json();
  assert.equal(salvo.turnos.length, 3);
  assert.equal(salvo.acoes.length, 1);
  assert.equal(salvo.conversa.contexto.uf, 'SP');
  assert.equal(salvo.conversa.contexto.objetivo, 'Tese de compra');
  const fim = await u.chamar('PATCH', `/api/agente/conversas/${c.id}/acoes/${salvo.acoes[0].id}`, { concluida: true });
  assert.equal(fim.json().acoes[0].concluida, true);
  const abrir = await u.chamar('PATCH', `/api/agente/conversas/${c.id}/acoes/${salvo.acoes[0].id}`, { concluida: false });
  assert.equal(abrir.json().acoes[0].concluida, false);
  assert.equal(Number((await db.query("SELECT count(*) n FROM auditoria WHERE entidade = 'agente_acao'")).rows[0].n), 2);
});

test('rotas negam anônimos e isolam histórico mesmo entre participantes do mesmo mandato', async (t) => {
  const { app, db, usuario, trabalho } = await montar(t);
  const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local');
  const m = await criarMandato(db, { codigo: 'CONFIDENCIAL' });
  await darAcesso(db, m.id, a.id); await darAcesso(db, m.id, b.id);
  const c = await trabalho(a, { mandatoId: m.id });
  for (const url of ['/api/agente', '/api/agente/empresas', '/api/agente/conversas', `/api/agente/conversas/${c.id}`]) {
    assert.equal((await app.inject({ method: 'GET', url })).statusCode, 401, url);
  }
  assert.equal((await b.chamar('GET', `/api/agente/conversas/${c.id}`)).statusCode, 404);
  assert.equal((await b.chamar('GET', '/api/agente/conversas')).json().conversas.length, 0);
  assert.equal((await b.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`, { chave: randomUUID(), versao: 0, tarefa: 'buscar_empresas' })).statusCode, 404);
  await db.query('DELETE FROM mandato_membros WHERE usuario_id = $1 AND mandato_id = $2', [a.id, m.id]);
  assert.equal((await a.chamar('GET', `/api/agente/conversas/${c.id}`)).statusCode, 404);
  assert.equal((await a.chamar('GET', '/api/agente/conversas')).json().conversas.length, 0);
});

test('papel leitura não cria trabalho nem executa tarefas; corpo e IDs são validados', async (t) => {
  const { usuario, trabalho } = await montar(t);
  const leitura = await usuario('leitura@teste.local', 'leitura');
  assert.equal((await leitura.chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Novo' })).statusCode, 403);
  const u = await usuario('an@teste.local'); const c = await trabalho(u);
  assert.equal((await u.chamar('GET', '/api/agente/conversas/invalido')).statusCode, 422);
  assert.equal((await u.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`, { chave: randomUUID(), versao: 0, tarefa: 'registrar_passo', texto: ' ' })).statusCode, 422);
  assert.equal((await u.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`, { chave: randomUUID(), versao: 0, tarefa: 'buscar_empresas', contexto: { uf: 'XX' } })).statusCode, 422);
});

test('falha de fonte é recuperável e não gera turno vazio; pendências funcionam sem catálogo', async (t) => {
  const { usuario, trabalho } = await montar(t, { catalogo: { buscar: async () => { throw new Error('arquivo inválido'); } } });
  const u = await usuario('an@teste.local'); const c = await trabalho(u);
  assert.equal((await u.chamar('GET', '/api/agente')).json().base.disponivel, false);
  assert.equal((await u.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`, { chave: randomUUID(), versao: 0, tarefa: 'buscar_empresas' })).statusCode, 503);
  const r = await u.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`, { chave: randomUUID(), versao: 0, tarefa: 'ver_pendencias' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().conversa.versao, 1);
});

test('configuração inicial é local, opt-in e só cria um administrador', async (t) => {
  const { app, db } = await montar(t, { instalacaoInicial: true });
  assert.equal((await app.inject('/api/instalacao')).json().disponivel, true);
  const payload = { nome: 'Administrador de teste', email: 'admin@teste.local', senha: 'senha-inicial-de-teste' };
  assert.equal((await app.inject({ method: 'POST', url: '/api/instalacao', remoteAddress: '192.0.2.8', payload })).statusCode, 403);
  const r = await app.inject({ method: 'POST', url: '/api/instalacao', payload });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal((await app.inject('/api/instalacao')).json().disponivel, false);
  assert.equal((await app.inject({ method: 'POST', url: '/api/instalacao', payload })).statusCode, 403);
  assert.equal(Number((await db.query('SELECT count(*) n FROM usuarios')).rows[0].n), 1);
  const u = (await db.query('SELECT * FROM usuarios')).rows[0];
  assert.notEqual(u.senha_hash, payload.senha);
  assert.equal(u.papel, 'admin');
});

test('configuração inicial permanece fechada por padrão', async (t) => {
  const { app } = await montar(t);
  assert.equal((await app.inject('/api/instalacao')).json().disponivel, false);
});

test('adaptador de IA é opcional e falha sem apagar evidência ou fingir sucesso', async () => {
  const base = { titulo: 'Ficha', empresas: [empresa], fontes: [{ titulo: 'Cadastro' }] };
  assert.deepEqual(await complementarComIA(base, {}, null), base);
  const r = await complementarComIA(base, { tarefa: 'preparar_reuniao', texto: 'Objetivo', contexto: {} }, async ({ evidencias }) => {
    assert.deepEqual(evidencias, [empresa]); return 'Complemento para revisão';
  });
  assert.equal(r.complementoIA, 'Complemento para revisão');
  const falha = await complementarComIA(base, {}, async () => { throw new Error('segredo-interno'); });
  assert.deepEqual(falha.empresas, [empresa]);
  assert.ok(falha.avisoIA);
  assert.ok(!JSON.stringify(falha).includes('segredo-interno'));
});
