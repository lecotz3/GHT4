import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configurarIA, criarServicoIA, lerResposta } from '../src/agente/provedor.mjs';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';

const config = () => configurarIA({ GHT4_IA_PROVEDOR: 'openai', GHT4_IA_MODELO: 'modelo-de-teste', OPENAI_API_KEY: 'segredo-so-do-teste', GHT4_IA_WEB: '1', GHT4_IA_PEDIDOS_USUARIO_DIA: '2' });
const resposta = () => ({ status: 'completed', output: [{ type: 'message', role: 'assistant',
  content: [{ type: 'output_text', text: 'Confirme o fornecedor antes de priorizar.' }] }], usage: { input_tokens: 50, output_tokens: 20 } });
async function preparar(t, fetchImpl) {
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'ia@teste.local', senha: 'senha-de-teste' });
  const c = (await db.query('INSERT INTO agente_conversas(usuario_id,titulo) VALUES ($1,$2) RETURNING *', [u.id,'Teste IA'])).rows[0];
  const servicoIA = criarServicoIA(db, config(), { fetchImpl });
  const app = await criarApp(db, { servicoIA });
  t.after(async () => { await app.close(); await db.close(); });
  const login = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email: u.email, senha: 'senha-de-teste' } });
  const chamar = (payload) => app.inject({ method: 'POST', url: `/api/agente/conversas/${c.id}/mensagens`,
    headers: { cookie: login.headers['set-cookie'].split(';')[0] }, payload });
  const entrada = () => ({ tarefa: 'conversar', pedido: 'Reveja a tese de venda', contexto: {}, evidencias: [], fontes: [],
    execucao: { usuarioId: u.id, conversaId: c.id, chave: randomUUID(), corpoHash: 'hash' } });
  return { db, app, servicoIA, chamar, entrada, u, c };
}

test('provedor é opt-in e exige modelo e credencial; limites não podem ser removidos', () => {
  assert.equal(configurarIA({}), null);
  assert.throws(() => configurarIA({ GHT4_IA_PROVEDOR: 'openai' }));
  assert.throws(() => configurarIA({ GHT4_IA_PROVEDOR: 'openai', OPENAI_API_KEY: 'x', GHT4_IA_MODELO: 'x', GHT4_IA_PEDIDOS_DIA: '999999' }));
});

test('conversa envia somente contexto selecionado, não concede ferramentas de escrita; reserva limita e deduplica', async (t) => {
  let chamadas = 0;
  const { servicoIA, entrada, db } = await preparar(t, async (url, opcoes) => {
    chamadas++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(opcoes.body);
    assert.equal(body.store, false); assert.equal(body.max_output_tokens, 2500);
    assert.equal(body.tools, undefined); assert.equal(body.model, 'modelo-de-teste');
    assert.match(body.instructions, /fontes não confiáveis/);
    assert.ok(!body.input.includes('segredo-so-do-teste'));
    return Response.json(resposta());
  });
  const p = entrada();
  const r = await servicoIA.redigir(p);
  assert.equal(r.uso.saida, 20);
  assert.deepEqual(await servicoIA.redigir(p), r); assert.equal(chamadas, 1);
  await assert.rejects(servicoIA.redigir({ ...p, execucao: { ...p.execucao, corpoHash: 'outro' } }));
  await servicoIA.redigir(entrada());
  await assert.rejects(servicoIA.redigir(entrada()), /limite_diario/);
  assert.equal(chamadas, 2);
  assert.equal((await db.query('SELECT sum(tokens_saida)::int total FROM ia_execucoes')).rows[0].total, 40);
});

test('web envia apenas consulta pública, registra fontes citadas e exige pesquisa comprovada', async (t) => {
  const r = resposta();
  r.output.unshift({ type: 'web_search_call', status: 'completed', action: { sources: [{ url: 'https://example.org/relatorio' }] } });
  r.output[1].content[0].annotations = [{ type: 'url_citation', start_index: 0, end_index: 8, url: 'https://example.org/relatorio', title: 'Relatório' }];
  const { servicoIA, entrada } = await preparar(t, async (_url, opcoes) => {
    const p = JSON.parse(opcoes.body);
    assert.equal(p.tools[0].type, 'web_search'); assert.equal(p.max_tool_calls, 2);
    assert.ok(!p.input.includes('segredo-negocial')); assert.ok(p.input.includes('distribuição química'));
    return Response.json(r);
  });
  const resultado = await servicoIA.redigir({ ...entrada(), tarefa: 'pesquisar_web', pedido: 'Novidades em distribuição química',
    contexto: { objetivo: 'segredo-negocial' }, historico: ['segredo-negocial'] });
  assert.equal(resultado.citacoes.length, 1); assert.equal(resultado.fontes[0].url, 'https://example.org/relatorio');
  assert.ok(resultado.pesquisadoEm);
  assert.throws(() => lerResposta(resposta(), { web: true }), /pesquisa_sem_fontes/);
  r.output[1].content[0].annotations[0].url = 'javascript:alert(1)';
  assert.throws(() => lerResposta(r, { web: true }), /pesquisa_sem_fontes/);
});

test('falha e resposta incompleta não são repetidas automaticamente nem revelam segredos', async (t) => {
  let chamadas = 0;
  const { servicoIA, entrada, chamar } = await preparar(t, async () => { chamadas++; throw new Error('segredo-so-do-teste'); });
  const p = entrada();
  await assert.rejects(servicoIA.redigir(p)); await assert.rejects(servicoIA.redigir(p));
  assert.equal(chamadas, 1);
  const r = await chamar({ chave: randomUUID(), versao: 0, tarefa: 'conversar', texto: 'Revise meu trabalho' });
  assert.equal(r.statusCode, 200, r.body); assert.ok(r.json().turno.resultado.avisoIA);
  assert.ok(!r.body.includes('segredo-so-do-teste'));
  assert.throws(() => lerResposta({ ...resposta(), status: 'incomplete' }));
});

test('suspensão durante resposta externa impede gravação e devolução do resultado', async (t) => {
  let ambiente;
  ambiente = await preparar(t, async () => {
    await ambiente.db.query('UPDATE usuarios SET ativo=false WHERE id=$1', [ambiente.u.id]);
    return Response.json(resposta());
  });
  const r = await ambiente.chamar({ chave: randomUUID(), versao: 0, tarefa: 'conversar', texto: 'Reveja o trabalho atual' });
  assert.equal(r.statusCode, 401, r.body);
  assert.equal((await ambiente.db.query('SELECT count(*)::int n FROM agente_turnos')).rows[0].n, 0);
});

test('reserva concorrente da mesma chave chama o provedor uma única vez', async (t) => {
  let chamadas = 0;
  let liberar;
  const bloqueio = new Promise((resolve) => { liberar = resolve; });
  const { servicoIA, entrada } = await preparar(t, async () => { chamadas++; await bloqueio; return Response.json(resposta()); });
  const p = entrada();
  const primeira = servicoIA.redigir(p);
  // Reserva concorrente sai sem esperar o provedor. A ordem de início é determinística no PGlite.
  await assert.rejects(servicoIA.redigir(p), /pedido_ja_reservado/);
  liberar(); await primeira; assert.equal(chamadas, 1);
});
