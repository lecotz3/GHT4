/* =============================================================================
 *  GHT4 · testes de templates e idempotência
 * -----------------------------------------------------------------------------
 *  Cobre a tarefa da Fase 2 "migrar templates de localStorage para APIs", e a
 *  razão de ela existir: sem versão imutável, "com qual régua esta lista foi
 *  feita?" fica sem resposta.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { comIdempotencia } from '../src/api/idempotencia.mjs';

import { criarApp } from '../src/app.mjs';
import { historicoDe } from '../src/auditoria/registrar.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso } from './ajuda.mjs';

const REGRA = {
  filtrosDuros: [{ campo: 'subsetor', operador: 'igual', valor: 'distribuicao' }],
  preferencias: [{ campo: 'janelaSucessao', peso: 25 }],
  politicaDadoAusente: 'sinalizar',
  coberturaMinima: 0.6,
};

test('repetição isola usuário e caminho concreto, e uma falha não vira sucesso vazio',async()=>{
  const {db}=await montar();
  const a=await criarUsuario(db,{email:'idempotencia-a@example.test'}),b=await criarUsuario(db,{email:'idempotencia-b@example.test'});
  const req={usuario:a,headers:{'idempotency-key':'mesma-chave-escopo'},method:'POST',url:'/api/operacao/um',body:{valor:1}};
  const r=await comIdempotencia(db,req,async()=>({status:201,corpo:{autor:'a'}}));assert.equal(r.corpo.autor,'a');
  const outro=await comIdempotencia(db,{...req,usuario:b},async()=>({status:201,corpo:{autor:'b'}}));assert.equal(outro.corpo.autor,'b');
  const caminho=await comIdempotencia(db,{...req,url:'/api/operacao/dois'},async()=>({status:201,corpo:{autor:'segundo'}}));assert.equal(caminho.corpo.autor,'segundo');
  const falha={...req,url:'/api/operacao/falha'};await assert.rejects(comIdempotencia(db,falha,async()=>{throw new Error('falhou')}));
  await assert.rejects(comIdempotencia(db,falha,async()=>({status:200,corpo:null})),{codigo:'envio_falhou'});
});

test('modelo de busca preserva filtros aninhados, recusa edição desatualizada e vincula a versão ao resultado',async()=>{
  const {db,app}=await montar();await criarUsuario(db,{email:'modelo@example.test',papel:'socio',senha:'senha-de-teste-longa'});
  const cookie=await entrar(app,'modelo@example.test'),headers={cookie};
  const filtros={frente:'compra',uf:'SP',busca:'Adequim',cnae:'',incluirPossiveis:false};
  const novo=await app.inject({method:'POST',url:'/api/templates',headers,payload:{nome:'Busca química QA',configuracao:{buscaAgente:filtros}}});
  assert.equal(novo.statusCode,201,novo.body);const {template,versao}=novo.json();
  const conf={buscaAgente:{...filtros,uf:'RJ'}};
  const segunda=await app.inject({method:'POST',url:`/api/templates/${template.id}/versoes`,headers,payload:{baseVersao:1,configuracao:conf}});
  assert.equal(segunda.statusCode,201,segunda.body);assert.notEqual(segunda.json().versao.conteudo_hash,versao.conteudo_hash);
  assert.equal((await app.inject({method:'POST',url:`/api/templates/${template.id}/versoes`,headers,payload:{baseVersao:1,configuracao:{buscaAgente:{...filtros,uf:'MG'}}}})).statusCode,409);
  const contexto={...filtros,modeloBusca:{id:template.id,versao:1,hash:versao.conteudo_hash}};
  const c=(await app.inject({method:'POST',url:'/api/agente/conversas',headers,payload:{id:randomUUID(),titulo:'Modelo testado',contexto}})).json().conversa;
  const pedido={chave:randomUUID(),versao:0,tarefa:'buscar_empresas',contexto};
  const resultado=await app.inject({method:'POST',url:`/api/agente/conversas/${c.id}/mensagens`,headers,payload:pedido});assert.equal(resultado.statusCode,200,resultado.body);
  assert.ok(resultado.json().turno.resultado.fontes.some(f=>f.referencia.includes(versao.conteudo_hash)));
  const divergente=await app.inject({method:'POST',url:`/api/agente/conversas/${c.id}/mensagens`,headers,payload:{...pedido,chave:randomUUID(),versao:1,contexto:{...contexto,uf:'RJ'}}});assert.equal(divergente.statusCode,409);
  const historico=(await app.inject({url:`/api/templates/${template.id}`,headers})).json().versoes;
  assert.deepEqual(historico.map(v=>v.configuracao.buscaAgente.uf),['RJ','SP']);
});

async function montar() {
  const db = await bancoDeTeste();
  const app = await criarApp(db);
  return { db, app };
}

async function entrar(app, email, senha = 'senha-de-teste-longa') {
  const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha } });
  assert.equal(r.statusCode, 200, `login falhou: ${r.body}`);
  const bruto = r.headers['set-cookie'];
  return (Array.isArray(bruto) ? bruto[0] : bruto).split(';')[0];
}

test('criar template grava versão 1 e deixa rastro na auditoria', async () => {
  const { db, app } = await montar();
  await criarUsuario(db, { email: 'an@ght4.com', papel: 'analista', senha: 'senha-de-teste-longa' });
  const cookie = await entrar(app, 'an@ght4.com');

  const r = await app.inject({
    method: 'POST', url: '/api/templates', headers: { cookie },
    payload: { nome: 'Distribuição — sucessão', configuracao: REGRA },
  });

  assert.equal(r.statusCode, 201, r.body);
  const { template, versao } = r.json();
  assert.equal(template.nome, 'Distribuição — sucessão');
  assert.equal(versao.versao, 1);
  assert.ok(versao.conteudo_hash);

  const trilha = await historicoDe(db, 'template', template.id);
  assert.equal(trilha.length, 1);
  assert.equal(trilha[0].acao, 'criar');
  assert.equal(trilha[0].usuario_email, 'an@ght4.com');
});

test('editar cria versão nova em vez de sobrescrever', async () => {
  /* É o ponto todo: a régua que produziu a lista de ontem tem de continuar
     existindo para a lista poder se explicar. */
  const { app, db } = await montar();
  await criarUsuario(db, { email: 's@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  const cookie = await entrar(app, 's@ght4.com');

  const criado = (await app.inject({
    method: 'POST', url: '/api/templates', headers: { cookie },
    payload: { nome: 'Régua A', configuracao: REGRA },
  })).json();

  const r = await app.inject({
    method: 'POST', url: `/api/templates/${criado.template.id}/versoes`, headers: { cookie },
    payload: {
      configuracao: { ...REGRA, coberturaMinima: 0.8 },
      nota: 'Sócios pediram cobertura maior.',
    },
  });

  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().versao.versao, 2);

  const lido = (await app.inject({
    method: 'GET', url: `/api/templates/${criado.template.id}`, headers: { cookie },
  })).json();

  assert.equal(lido.versoes.length, 2, 'a versão anterior sumiu');
  assert.equal(lido.versaoAtual.versao, 2);
  assert.equal(lido.versaoAtual.configuracao.coberturaMinima, 0.8);
});

test('régua idêntica não vira versão nova', async () => {
  const { app, db } = await montar();
  await criarUsuario(db, { email: 's2@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  const cookie = await entrar(app, 's2@ght4.com');

  const criado = (await app.inject({
    method: 'POST', url: '/api/templates', headers: { cookie },
    payload: { nome: 'Régua B', configuracao: REGRA },
  })).json();

  const r = await app.inject({
    method: 'POST', url: `/api/templates/${criado.template.id}/versoes`, headers: { cookie },
    payload: { configuracao: REGRA },
  });

  assert.equal(r.statusCode, 409);
  assert.equal(r.json().erro, 'sem_mudanca');
});

test('versão já usada não pode ser alterada nem apagada', async () => {
  const { app, db } = await montar();
  await criarUsuario(db, { email: 's3@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  const cookie = await entrar(app, 's3@ght4.com');

  const criado = (await app.inject({
    method: 'POST', url: '/api/templates', headers: { cookie },
    payload: { nome: 'Régua C', configuracao: REGRA },
  })).json();

  await app.inject({
    method: 'POST', url: `/api/templates/${criado.template.id}/versoes/1/usar`, headers: { cookie },
  });

  /* A regra é do banco: nem a aplicação consegue burlar. */
  await assert.rejects(
    () => db.query(
      `UPDATE templates_versoes SET configuracao = '{"x":1}'::jsonb WHERE template_id = $1 AND versao = 1`,
      [criado.template.id]),
    /imutável/,
  );
  await assert.rejects(
    () => db.query('DELETE FROM templates_versoes WHERE template_id = $1 AND versao = 1',
      [criado.template.id]),
    /não pode ser apagada/,
  );
});

test('analista não edita template, sócio edita', async () => {
  const { app, db } = await montar();
  await criarUsuario(db, { email: 'an2@ght4.com', papel: 'analista', senha: 'senha-de-teste-longa' });
  await criarUsuario(db, { email: 's4@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });

  const cookieSocio = await entrar(app, 's4@ght4.com');
  const criado = (await app.inject({
    method: 'POST', url: '/api/templates', headers: { cookie: cookieSocio },
    payload: { nome: 'Régua D', configuracao: REGRA },
  })).json();

  const cookieAnalista = await entrar(app, 'an2@ght4.com');
  const r = await app.inject({
    method: 'POST', url: `/api/templates/${criado.template.id}/versoes`,
    headers: { cookie: cookieAnalista },
    payload: { configuracao: { ...REGRA, coberturaMinima: 0.9 } },
  });

  assert.equal(r.statusCode, 403);
  assert.equal(r.json().erro, 'sem_permissao');
});

test('template de mandato não aparece para quem não participa', async () => {
  const { app, db } = await montar();
  const dentro = await criarUsuario(db, { email: 'd@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  await criarUsuario(db, { email: 'f@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  const m = await criarMandato(db, { codigo: 'QUIM-01' });
  await darAcesso(db, m.id, dentro.id, 'socio');

  const cookieDentro = await entrar(app, 'd@ght4.com');
  await app.inject({
    method: 'POST', url: '/api/templates', headers: { cookie: cookieDentro },
    payload: { nome: 'Régua sigilosa', mandatoId: m.id, configuracao: REGRA },
  });

  const cookieFora = await entrar(app, 'f@ght4.com');
  const lista = (await app.inject({
    method: 'GET', url: '/api/templates', headers: { cookie: cookieFora },
  })).json();

  assert.equal(lista.templates.length, 0, 'template de mandato alheio apareceu');
});

/* ---- idempotência --------------------------------------------------------- */

test('a mesma chave não cria dois templates', async () => {
  /* O caso real: o usuário clica duas vezes, ou o cliente reenvia. */
  const { app, db } = await montar();
  await criarUsuario(db, { email: 'i@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  const cookie = await entrar(app, 'i@ght4.com');

  const pedido = {
    method: 'POST', url: '/api/templates',
    headers: { cookie, 'idempotency-key': 'chave-de-teste-12345' },
    payload: { nome: 'Régua única', configuracao: REGRA },
  };

  const primeira = await app.inject(pedido);
  const segunda = await app.inject(pedido);

  assert.equal(primeira.statusCode, 201);
  assert.equal(segunda.statusCode, 201);
  assert.equal(
    primeira.json().template.id, segunda.json().template.id,
    'a repetição criou um template diferente',
  );

  const quantos = (await db.query(
    `SELECT count(*)::int AS n FROM templates_triagem WHERE nome = 'Régua única'`)).rows[0].n;
  assert.equal(quantos, 1);
});

test('a mesma chave com corpo diferente é recusada', async () => {
  /* Devolver a resposta antiga esconderia um bug do cliente: ele acha que
     mandou B e recebeu a resposta de A. */
  const { app, db } = await montar();
  await criarUsuario(db, { email: 'i2@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  const cookie = await entrar(app, 'i2@ght4.com');
  const headers = { cookie, 'idempotency-key': 'chave-de-teste-67890' };

  await app.inject({
    method: 'POST', url: '/api/templates', headers,
    payload: { nome: 'Primeira', configuracao: REGRA },
  });

  const r = await app.inject({
    method: 'POST', url: '/api/templates', headers,
    payload: { nome: 'Segunda', configuracao: REGRA },
  });

  assert.equal(r.statusCode, 409);
  assert.equal(r.json().erro, 'chave_reutilizada');
});

test('chave curta demais é recusada', async () => {
  const { app, db } = await montar();
  await criarUsuario(db, { email: 'i3@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  const cookie = await entrar(app, 'i3@ght4.com');

  const r = await app.inject({
    method: 'POST', url: '/api/templates',
    headers: { cookie, 'idempotency-key': 'curta' },
    payload: { nome: 'X', configuracao: REGRA },
  });

  assert.equal(r.statusCode, 400);
  assert.equal(r.json().erro, 'chave_invalida');
});

/* ---- importação do localStorage ------------------------------------------- */

test('importa o que estava no navegador, sem duplicar na segunda vez', async () => {
  const { app, db } = await montar();
  await criarUsuario(db, { email: 'imp@ght4.com', papel: 'socio', senha: 'senha-de-teste-longa' });
  const cookie = await entrar(app, 'imp@ght4.com');

  /* O formato real de `ght4.templates.v1`. */
  const doNavegador = {
    templates: {
      tpl_abc: { id: 'tpl_abc', nome: 'Sucessão familiar', salvoEm: '2026-08-20T10:00:00.000Z', configuracao: REGRA },
      tpl_def: { id: 'tpl_def', nome: 'Multi-praça', salvoEm: '2026-08-21T10:00:00.000Z', configuracao: REGRA },
    },
  };

  const primeira = await app.inject({
    method: 'POST', url: '/api/templates/importar', headers: { cookie }, payload: doNavegador,
  });
  assert.equal(primeira.statusCode, 200, primeira.body);
  assert.equal(primeira.json().importados.length, 2);
  assert.equal(primeira.json().pulados.length, 0);

  const segunda = await app.inject({
    method: 'POST', url: '/api/templates/importar', headers: { cookie }, payload: doNavegador,
  });
  assert.equal(segunda.json().importados.length, 0);
  assert.equal(segunda.json().pulados.length, 2, 'a segunda importação duplicou');
  assert.match(segunda.json().pulados[0].motivo, /já existe/);

  const quantos = (await db.query('SELECT count(*)::int AS n FROM templates_triagem')).rows[0].n;
  assert.equal(quantos, 2);
});
