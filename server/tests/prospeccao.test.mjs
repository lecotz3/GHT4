import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso } from './ajuda.mjs';
import { hoje } from '../src/crm/contratos.mjs';

const empresa = { id: 'cnpj12345678', nome: 'Química de teste', razaoSocial: 'Química de teste Ltda', cnpjRaiz: '12345678',
  cidade: 'Campinas', uf: 'SP', estado: 'provavel', referencia: '2026-08', receita: null };
const fontes = [{ titulo: 'Receita Federal — cadastro CNPJ', referencia: '2026-08' }];
async function montar(t) {
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo: { buscar: async () => ({ empresas: [empresa], total: 1, referencia: '2026-08' }) } });
  t.after(async () => { await app.close(); await db.close(); });
  async function usuario(email, papel = 'analista') {
    const u = await criarUsuario(db, { email, papel, senha: 'Senha para testes somente!' });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha: 'Senha para testes somente!' } });
    const cookie = r.headers['set-cookie'].split(';')[0];
    return { ...u, chamar: (method,url,payload) => app.inject({ method,url,payload,headers: { cookie } }) };
  }
  async function selecionar(u, mandatoId = null, frente = 'compra') {
    const r = await u.chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Pesquisa privada de teste', mandatoId, contexto: { frente, objetivo: 'Nota pessoal que não deve ir ao CRM' } });
    assert.equal(r.statusCode, 201, r.body); const c = r.json().conversa;
    const pesquisa = await u.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`, { chave: randomUUID(), versao: 0, tarefa: 'buscar_empresas' });
    assert.equal(pesquisa.statusCode, 200, pesquisa.body); const turno = pesquisa.json().turno;
    const corpo = { turnoId: turno.id, versao: 0, estado: 'priorizar', justificativa: 'Adequação ao recorte geográfico, a validar.' };
    const selecao = await u.chamar('PUT', `/api/agente/conversas/${c.id}/selecao/${empresa.id}`, corpo);
    assert.equal(selecao.statusCode, 200, selecao.body);
    return { c, turno, s: selecao.json().selecao, corpo };
  }
  function criarCorpo(s) { return { id: randomUUID(), selecaoId: s.id, titulo: 'Distribuição SP · teste', objetivo: 'Verificar a tese de expansão territorial.', proximaAcao: 'Revisar produtos e fabricantes representados', prazo: hoje() }; }
  async function criar(u, s) {
    const corpo = criarCorpo(s); const r = await u.chamar('POST', '/api/crm/oportunidades', corpo);
    assert.equal(r.statusCode, 201, r.body); return { o: r.json().oportunidade, corpo };
  }
  return { db, app, usuario, selecionar, criar, criarCorpo };
}

test('seleção guarda decisão e fonte do resultado; revisão é reversível e independente por frente', async (t) => {
  const { usuario } = await montar(t); const u = await usuario('an@teste.local');
  const r = await u.chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Tese em duas frentes', contexto: { frente: 'compra' } });
  const c = r.json().conversa;
  async function pesquisar(versao, frente) {
    return (await u.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`, { chave: randomUUID(), versao, tarefa: 'buscar_empresas', contexto: { frente } })).json().turno;
  }
  const turno = await pesquisar(0, 'compra');
  const url = `/api/agente/conversas/${c.id}/selecao/${empresa.id}`;
  const p = { turnoId: turno.id, versao: 0, estado: 'descartar', justificativa: 'Fora da tese de aplicações neste momento.' };
  const primeira = await u.chamar('PUT', url, p);
  assert.equal(primeira.statusCode, 200, primeira.body);
  assert.deepEqual(primeira.json().selecao.empresa, empresa);
  assert.equal(primeira.json().selecao.fontes[0].referencia, fontes[0].referencia);
  assert.equal((await u.chamar('PUT', url, p)).json().selecao.versao, 1);
  assert.equal((await u.chamar('PUT', url, { ...p, estado: 'priorizar' })).statusCode, 409);
  const revisao = await u.chamar('PUT', url, { ...p, versao: 1, estado: 'investigar', justificativa: 'Reabrir investigação após ajuste da tese.' });
  assert.equal(revisao.json().selecao.versao, 2);
  const venda = await pesquisar(1, 'venda');
  assert.equal((await u.chamar('PUT', url, { ...p, turnoId: venda.id, estado: 'priorizar' })).statusCode, 200);
  const lista = (await u.chamar('GET', `/api/agente/conversas/${c.id}/selecao`)).json().selecao;
  assert.deepEqual(lista.map((s) => s.frente).sort(), ['compra','venda']);
  assert.equal((await u.chamar('PUT', `/api/agente/conversas/${c.id}/selecao/cnpj87654321`, p)).statusCode, 422);
  assert.equal((await u.chamar('PUT', url, { ...p, empresa: { nome: 'Dado inventado' } })).statusCode, 422);
});

test('oportunidade nasce da seleção priorizada, conserva escopo e não copia notas privadas', async (t) => {
  const { db, usuario, selecionar, criar, criarCorpo } = await montar(t);
  const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local', 'socio');
  const m = await criarMandato(db, { codigo: 'EQUIPE' }); await darAcesso(db,m.id,a.id); await darAcesso(db,m.id,b.id,'socio');
  const { c,s } = await selecionar(a,m.id);
  const { o,corpo } = await criar(a,s);
  assert.equal(o.mandato_id,m.id); assert.equal(o.frente,'compra'); assert.equal(o.responsavel_id,a.id);
  assert.equal(o.etapa,'identificada'); assert.equal(o.prazo,hoje()); assert.deepEqual(o.empresa,empresa);
  const compartilhada = await b.chamar('GET', `/api/crm/oportunidades/${o.id}`);
  assert.equal(compartilhada.statusCode,200);
  assert.ok(!compartilhada.body.includes('Nota pessoal')); assert.ok(!compartilhada.body.includes(c.id));
  assert.equal((await b.chamar('GET', `/api/agente/conversas/${c.id}/selecao`)).statusCode,404);
  assert.equal((await a.chamar('POST', '/api/crm/oportunidades',corpo)).json().oportunidade.id,o.id);
  assert.equal((await a.chamar('POST', '/api/crm/oportunidades',criarCorpo(s))).statusCode,409);
  const excluida = await selecionar(a,null,'venda');
  await a.chamar('PUT', `/api/agente/conversas/${excluida.c.id}/selecao/${empresa.id}`, { ...excluida.corpo, versao:1,estado:'descartar' });
  assert.equal((await a.chamar('POST','/api/crm/oportunidades',criarCorpo(excluida.s))).statusCode,422);
});

test('CRM nega anônimos, isola trabalhos pessoais e responde à retirada de acesso ao espaço', async (t) => {
  const { app,db,usuario,selecionar,criar } = await montar(t);
  const a = await usuario('a@teste.local'); const fora = await usuario('fora@teste.local','admin');
  const pessoal = await criar(a,(await selecionar(a)).s);
  for (const [method,url] of [['GET','/api/crm/oportunidades'],['POST','/api/crm/oportunidades'],['GET',`/api/crm/oportunidades/${pessoal.o.id}`],['PATCH',`/api/crm/oportunidades/${pessoal.o.id}`],['POST',`/api/crm/oportunidades/${pessoal.o.id}/atividades`]]) {
    assert.equal((await app.inject({method,url})).statusCode,401,url);
  }
  assert.equal((await fora.chamar('GET',`/api/crm/oportunidades/${pessoal.o.id}`)).statusCode,404);
  assert.equal((await fora.chamar('GET','/api/crm/oportunidades')).json().total,0);
  const m = await criarMandato(db,{codigo:'SIGILO'}); await darAcesso(db,m.id,a.id);
  const compartilhada = await criar(a,(await selecionar(a,m.id)).s);
  assert.equal((await fora.chamar('GET',`/api/crm/oportunidades/${compartilhada.o.id}`)).statusCode,200);
  await db.query('DELETE FROM mandato_membros WHERE mandato_id=$1 AND usuario_id=$2',[m.id,a.id]);
  assert.equal((await a.chamar('GET',`/api/crm/oportunidades/${compartilhada.o.id}`)).statusCode,404);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades')).json().total,1);
});

test('responsável e ação têm controle de versão; tentativas repetidas não duplicam histórico', async (t) => {
  const { db,usuario,selecionar,criar } = await montar(t);
  const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local'); const fora = await usuario('fora@teste.local');
  const m = await criarMandato(db,{codigo:'EQUIPE'}); await darAcesso(db,m.id,a.id); await darAcesso(db,m.id,b.id);
  const { o } = await criar(a,(await selecionar(a,m.id)).s);
  const p = { chave:randomUUID(),versao:1,titulo:o.titulo,objetivo:o.objetivo,proximaAcao:'Agendar conversa de qualificação',prazo:'2020-01-01',responsavelId:b.id,acaoConcluida:false };
  const r = await a.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,p);
  assert.equal(r.statusCode,200,r.body); assert.equal(r.json().oportunidade.versao,2);
  assert.equal((await a.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,p)).json().oportunidade.versao,2);
  assert.equal((await a.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,{...p,chave:randomUUID()})).statusCode,409);
  assert.equal((await a.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,{...p,versao:2,responsavelId:fora.id})).statusCode,422);
  assert.equal((await b.chamar('GET','/api/crm/oportunidades?pendentes=minhas')).json().total,1);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades?pendentes=atrasadas')).json().total,1);
  const fim = { ...p,chave:randomUUID(),versao:2,acaoConcluida:true };
  assert.equal((await b.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,fim)).statusCode,200);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades?pendentes=atrasadas')).json().total,0);
  assert.equal((await a.chamar('GET',`/api/crm/oportunidades/${o.id}`)).json().historico.length,3);
});

test('avanço comercial exige papel e evidência; nota do analista preserva etapa', async (t) => {
  const { db,usuario,selecionar,criar } = await montar(t);
  const a = await usuario('a@teste.local'); const socio = await usuario('s@teste.local','socio');
  const leitura = await usuario('l@teste.local','leitura');
  const m = await criarMandato(db,{codigo:'FLUXO'}); await darAcesso(db,m.id,a.id); await darAcesso(db,m.id,socio.id,'socio'); await darAcesso(db,m.id,leitura.id,'leitura');
  const { o } = await criar(a,(await selecionar(a,m.id)).s);
  const base = { chave:randomUUID(),versao:1,ocorridoEm:hoje(),descricao:'Registro de teste informado pelo participante.' };
  assert.equal((await leitura.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,base)).statusCode,403);
  assert.equal((await a.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,{...base,etapa:'negociacao'})).statusCode,403);
  for (const etapa of ['contatada','conversa_realizada','proposta_enviada','mandato_assinado','perdida']) {
    assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,{...base,etapa})).statusCode,422,etapa);
  }
  const nota = await a.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,base);
  assert.equal(nota.statusCode,200,nota.body); assert.equal(nota.json().oportunidade.etapa,'identificada');
  const contato = { ...base,chave:randomUUID(),versao:2,etapa:'contatada',canal:'Reunião por vídeo',participantes:'Responsável comercial (teste)' };
  assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,contato)).statusCode,200);
  assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,contato)).json().oportunidade.versao,3);
  await assert.rejects(db.query("UPDATE crm_eventos SET descricao='alterado' WHERE oportunidade_id=$1",[o.id]));
  assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,{...base,chave:randomUUID(),versao:3,ocorridoEm:'2099-01-01'})).statusCode,422);
});

test('criações concorrentes geram uma oportunidade e um evento, sem duplicar seleção', async (t) => {
  const { db,usuario,selecionar,criarCorpo } = await montar(t);
  const a = await usuario('a@teste.local'); const { s } = await selecionar(a); const corpo=criarCorpo(s);
  const respostas = await Promise.all([1,2].map(() => a.chamar('POST','/api/crm/oportunidades',corpo)));
  assert.deepEqual(respostas.map((r) => r.statusCode),[201,201]);
  assert.equal(Number((await db.query('SELECT count(*) n FROM crm_oportunidades')).rows[0].n),1);
  assert.equal(Number((await db.query('SELECT count(*) n FROM crm_eventos')).rows[0].n),1);
});

test('valida datas, filtros, IDs e campos sem permitir alterar fonte ou escopo pelo cliente', async (t) => {
  const { usuario,selecionar,criarCorpo } = await montar(t);
  const a=await usuario('a@teste.local'); const {s}=await selecionar(a); const p=criarCorpo(s);
  for (const extra of [{prazo:'2026-02-31'},{prazo:'amanhã'},{mandatoId:randomUUID()},{empresa:{nome:'Inventado'}},{frente:'venda'}]) {
    assert.equal((await a.chamar('POST','/api/crm/oportunidades',{...p,...extra})).statusCode,422);
  }
  assert.equal((await a.chamar('GET','/api/crm/oportunidades/invalido')).statusCode,422);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades?offset=-1')).statusCode,422);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades?busca=%25')).json().total,0);
});
