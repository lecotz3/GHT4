import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { criarApp } from '../src/app.mjs';
import { migrar } from '../src/db/migrar.mjs';
import { criarUsuario } from './ajuda.mjs';

test('seleção, oportunidade, atividade e sessão sobrevivem ao fechamento e reabertura do banco em disco', async (t) => {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-crm-persistencia-'));
  const pastaReal = await realpath(pasta);
  let db; let app;
  t.after(async () => {
    await app?.close(); await db?.close();
    // Remove apenas o diretório temporário criado por este teste, conferindo o destino real.
    const destino = await realpath(pasta);
    assert.equal(destino, pastaReal);
    assert.equal(path.dirname(path.resolve(pasta)), path.resolve(tmpdir()));
    assert.ok(path.basename(destino).startsWith('ght4-crm-persistencia-'));
    await rm(destino, { recursive: true, force: true });
  });
  async function abrir() {
    db = await PGlite.create(pasta);
    await migrar(db, { silencioso: true });
    app = await criarApp(db, { catalogo: { buscar: async () => ({ empresas: [{ id: 'cnpj12345678', nome: 'Cadastro de teste persistente', cnpjRaiz: '12345678', referencia: '2026-08' }], total: 1, referencia: '2026-08' }) } });
  }
  await abrir();
  const u = await criarUsuario(db, { email: 'persistencia@teste.local', papel: 'socio', senha: 'Apenas para teste em disco!' });
  const login = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email: u.email, senha: 'Apenas para teste em disco!' } });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers['set-cookie'].split(';')[0];
  async function chamar(method, url, payload, status = 200) {
    const r = await app.inject({ method,url,payload,headers: { cookie } });
    assert.equal(r.statusCode,status,r.body); return r.json();
  }
  const { conversa } = await chamar('POST','/api/agente/conversas',{id:randomUUID(),titulo:'Pesquisa que será retomada',contexto:{frente:'venda'}},201);
  const { turno } = await chamar('POST',`/api/agente/conversas/${conversa.id}/mensagens`,{chave:randomUUID(),versao:0,tarefa:'buscar_empresas'});
  const { selecao } = await chamar('PUT',`/api/agente/conversas/${conversa.id}/selecao/cnpj12345678`,{turnoId:turno.id,versao:0,estado:'priorizar',justificativa:'Avaliar a necessidade de assessoria financeira.'});
  const corpo = {id:randomUUID(),selecaoId:selecao.id,titulo:'Oportunidade persistente',objetivo:'Qualificar objetivos dos acionistas.',proximaAcao:'Revisar informações antes da reunião',prazo:'2026-12-15'};
  const { oportunidade } = await chamar('POST','/api/crm/oportunidades',corpo,201);
  const atividade = {chave:randomUUID(),versao:1,descricao:'Contato efetuado para qualificação inicial.',ocorridoEm:'2026-01-02',etapa:'contatada',canal:'Ligação',participantes:'Responsável de teste'};
  await chamar('POST',`/api/crm/oportunidades/${oportunidade.id}/atividades`,atividade);
  await app.close(); app = null; await db.close(); db = null;
  await abrir();
  const retomada = await chamar('GET',`/api/crm/oportunidades/${oportunidade.id}`);
  assert.equal(retomada.oportunidade.etapa,'contatada');
  assert.equal(retomada.oportunidade.frente,'venda');
  assert.equal(retomada.oportunidade.prazo,'2026-12-15');
  assert.equal(retomada.oportunidade.responsavel_id,u.id);
  assert.equal(retomada.historico.length,2);
  assert.equal((await chamar('GET',`/api/agente/conversas/${conversa.id}/selecao`)).selecao[0].oportunidade_id,oportunidade.id);
  await chamar('POST',`/api/crm/oportunidades/${oportunidade.id}/atividades`,atividade);
  assert.equal((await chamar('GET',`/api/crm/oportunidades/${oportunidade.id}`)).historico.length,2);
  assert.equal((await chamar('POST','/api/crm/oportunidades',corpo,201)).oportunidade.id,oportunidade.id);
});
