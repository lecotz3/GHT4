import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { bancoDeTeste,criarUsuario } from './ajuda.mjs';
import { criarApp } from '../src/app.mjs';
import { administrarAcesso } from '../src/operacao/acesso.mjs';
import { criarBackup,restaurarBackup } from '../src/operacao/backup.mjs';
import { validarOperacao } from '../src/operacao/configuracao.mjs';
import { servirInterface } from '../src/operacao/estatico.mjs';
import { criar,resolver } from '../src/seguranca/sessao.mjs';
import { conferir } from '../src/seguranca/senha.mjs';
import { cenarioOperacional } from './cenario-operacional.mjs';
const senha='senha-sintetica-de-teste';

test('console inicializa uma vez e recuperação revoga sessões sem reativar conta',async()=>{
  const db=await bancoDeTeste();
  const u=await administrarAcesso(db,{acao:'iniciar',nome:'Operador QA',email:'operacao@example.test',senha});
  const s=await criar(db,{usuarioId:u.id});assert.ok(await resolver(db,s.token));
  await assert.rejects(administrarAcesso(db,{acao:'iniciar',nome:'Outro',email:'outro@example.test',senha}),/Já existe/);
  await db.query('UPDATE usuarios SET ativo=false WHERE id=$1',[u.id]);
  const r=await administrarAcesso(db,{acao:'redefinir',email:'operacao@example.test',senha:senha+'-nova'});
  assert.equal(r.ativo,false);assert.equal(await resolver(db,s.token),null);
  const cred=(await db.query('SELECT senha_hash,senha_sal FROM usuarios WHERE id=$1',[u.id])).rows[0];
  assert.ok(await conferir(senha+'-nova',cred.senha_hash,cred.senha_sal));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM mandatos')).rows[0].n,1);
});

test('backup cifrado restaura dados e documentos; senha errada e destino existente não sobrescrevem',async()=>{
  const db=await bancoDeTeste();db.tipo='pglite';
  const u=await administrarAcesso(db,{acao:'iniciar',nome:'Backup QA',email:'backup@example.test',senha});
  const s=await criar(db,{usuarioId:u.id});
  const empresa={id:'cnpj12345678',nome:'Empresa sintética',cnpjRaiz:'12345678',cidade:'Campinas',uf:'SP',referencia:'2026-09'};
  const app=await criarApp(db,{catalogo:{buscar:async()=>({empresas:[empresa],total:1,referencia:'2026-09'})}});
  const cenario=await cenarioOperacional(app,`ght4_sessao=${s.token}`);await app.close();
  const arquivo=await criarBackup(db,senha);
  assert.ok(!arquivo.toString().includes('Documento sintético'));
  const pasta=await mkdtemp(path.join(os.tmpdir(),'ght4-restore-'));
  const destino=path.join(pasta,'nova');
  await assert.rejects(restaurarBackup(arquivo,senha+'errada',destino),/Senha incorreta/);
  await assert.rejects(access(destino));
  await writeFile(path.join(pasta,'marcador'),'preservar');
  await assert.rejects(restaurarBackup(arquivo,senha,pasta),{code:'EEXIST'});
  assert.equal(await readFile(path.join(pasta,'marcador'),'utf8'),'preservar');
  const r=await restaurarBackup(arquivo,senha,destino);assert.ok(r.migracoes.some(n=>n.startsWith('0012')));
  const copia=await PGlite.create(destino);
  try {
    const salvo=(await copia.query('SELECT * FROM crm_documentos WHERE id=$1',[cenario.documento.id])).rows[0];
    assert.equal(Buffer.from(salvo.conteudo).toString(),cenario.bytes.toString());
    assert.equal((await copia.query('SELECT titulo FROM agente_conversas WHERE id=$1',[cenario.conversa.id])).rows[0].titulo,cenario.conversa.titulo);
    assert.equal((await copia.query('SELECT titulo FROM crm_oportunidades WHERE id=$1',[cenario.oportunidade.id])).rows[0].titulo,cenario.oportunidade.titulo);
    assert.ok((await copia.query('SELECT count(*)::int AS n FROM auditoria')).rows[0].n>2);
    assert.equal(await resolver(copia,s.token),null);assert.ok(await resolver(db,s.token));
  } finally {await copia.close()}
});

test('operação exige administrador e senha; proteção de origem e limite persistente de login',async()=>{
  const db=await bancoDeTeste();db.tipo='pglite';const app=await criarApp(db,{origemPublica:'https://ght4.example.test'});
  const u=await criarUsuario(db,{email:'analista@example.test',papel:'analista',senha});
  const s=await criar(db,{usuarioId:u.id}),headers={cookie:`ght4_sessao=${s.token}`};
  assert.equal((await app.inject({url:'/api/operacao',headers})).statusCode,403);
  const a=await criarUsuario(db,{email:'admin@example.test',papel:'admin',senha}),sa=await criar(db,{usuarioId:a.id});
  headers.cookie=`ght4_sessao=${sa.token}`;
  assert.equal((await app.inject({url:'/api/operacao',headers})).statusCode,200);
  const payload={senhaAcesso:'incorreta',senhaBackup:senha,incluiTrabalhosPrivados:true};
  assert.equal((await app.inject({method:'POST',url:'/api/operacao/backup',headers,payload})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/operacao/backup',headers:{...headers,origin:'https://intruso.example.test'},payload})).statusCode,403);
  const b=await app.inject({method:'POST',url:'/api/operacao/backup',headers,payload:{...payload,senhaAcesso:senha}});
  assert.equal(b.statusCode,200,b.body);assert.equal(JSON.parse(b.body).formato,'ght4-backup');
  for(let i=0;i<12;i++)assert.equal((await app.inject({method:'POST',url:'/api/sessao',payload:{email:'ausente@example.test',senha}})).statusCode,401);
  const app2=await criarApp(db);
  const bloqueada=await app2.inject({method:'POST',url:'/api/sessao',payload:{email:'AUSENTE@example.test',senha}});
  assert.equal(bloqueada.statusCode,429);assert.equal(bloqueada.headers['retry-after'],'900');
  await app2.close();await app.close();
});

test('produção valida configuração e serve somente arquivos do build com CSP',async()=>{
  assert.throws(()=>validarOperacao({NODE_ENV:'production'}),/Postgres persistente/);
  const env={NODE_ENV:'production',DATABASE_URL:'postgresql://ght4:exemplo@db/ght4',GHT4_SERVIR_INTERFACE:'/app/v1/dist',GHT4_ORIGEM_PUBLICA:'https://ght4.example.test'};
  assert.doesNotThrow(()=>validarOperacao(env));assert.throws(()=>validarOperacao({...env,GHT4_CONFIGURACAO_INICIAL:'1'}),/bootstrap/);
  const pasta=await mkdtemp(path.join(os.tmpdir(),'ght4-build-'));await writeFile(path.join(pasta,'index.html'),'<!doctype html><title>GHT4</title>');await writeFile(path.join(pasta,'.env'),'SEGREDO=teste');
  const db=await bancoDeTeste(),app=await criarApp(db);await servirInterface(app,pasta);
  const pagina=await app.inject({url:'/'});assert.equal(pagina.statusCode,200);assert.match(pagina.headers['content-security-policy'],/frame-ancestors 'none'/);
  for(const url of ['/.env','/%2e%2e/.env','/api/inexistente'])assert.equal((await app.inject({url})).statusCode,404);
  assert.equal((await app.inject({url:'/api/saude'})).statusCode,200);await app.close();
});
