import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { criarHandlerVercel, origemVercel } from '../src/operacao/vercel.mjs';
import { prepararAdministrador } from '../src/operacao/administrador-inicial.mjs';
import { bancoDeTeste } from './ajuda.mjs';
import { criarApp } from '../src/app.mjs';

async function executar(handler, {method='GET',url='/api/saude',body,raw,headers={}} = {}) {
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []),{method,url,body,headers,socket:{remoteAddress:'127.0.0.1'}});
  const res = {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=v;}};
  await handler(req,res); return res;
}

test('Vercel preserva login, cookie, JSON, permissões e corpo não pré-processado',async t=>{
  const db=await bancoDeTeste(); t.after(()=>db.close());
  const env={GHT4_ADMIN_EMAIL:'vercel@example.test',GHT4_ADMIN_NOME:'Operador QA',GHT4_ADMIN_SENHA_INICIAL:'senha-sintetica-vercel'};
  await assert.rejects(prepararAdministrador(db,{GHT4_ADMIN_EMAIL:env.GHT4_ADMIN_EMAIL}),/juntos/);
  assert.equal((await prepararAdministrador(db,{GHT4_ADMIN_EMAIL:env.GHT4_ADMIN_EMAIL,ght4:env.GHT4_ADMIN_SENHA_INICIAL})).criado,true);
  assert.equal((await prepararAdministrador(db,{...env,GHT4_ADMIN_SENHA_INICIAL:'nao-deve-redefinir'})).criado,false);
  assert.equal((await prepararAdministrador(db,{GHT4_ADMIN_EMAIL:env.GHT4_ADMIN_EMAIL})).criado,false);
  // Recuperação: o segredo de bootstrap esquecido no ambiente não redefine nada;
  // só a variável dedicada redefine, e ela exige o e-mail junto.
  await assert.rejects(prepararAdministrador(db,{GHT4_ADMIN_SENHA_REDEFINIR:'senha-de-recuperacao-2026'}),/GHT4_ADMIN_EMAIL/);
  await assert.rejects(prepararAdministrador(db,{GHT4_ADMIN_EMAIL:'ninguem@example.test',GHT4_ADMIN_SENHA_REDEFINIR:'senha-de-recuperacao-2026'}),/não encontrada/);
  const recuperado=await prepararAdministrador(db,{GHT4_ADMIN_EMAIL:env.GHT4_ADMIN_EMAIL,GHT4_ADMIN_SENHA_REDEFINIR:'senha-de-recuperacao-2026'});
  assert.deepEqual([recuperado.criado,recuperado.redefinido],[false,true]);
  assert.equal((await prepararAdministrador(db,{...env,GHT4_ADMIN_SENHA_REDEFINIR:env.GHT4_ADMIN_SENHA_INICIAL})).redefinido,true,'volta para a senha que o resto do teste usa');
  const app=await criarApp(db,{origemPublica:'https://ght4.example.test'}); t.after(()=>app.close());
  const handler=criarHandlerVercel(async()=>app);
  assert.equal((await executar(handler)).statusCode,200);
  assert.equal((await executar(handler,{url:'/api/eu'})).statusCode,401);
  const credenciais={email:env.GHT4_ADMIN_EMAIL,senha:env.GHT4_ADMIN_SENHA_INICIAL};
  const login=await executar(handler,{method:'POST',url:'/api/sessao',body:credenciais,headers:{'content-type':'application/json','content-length':'999'}});
  assert.equal(login.statusCode,200);
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  assert.equal((await executar(handler,{url:'/api/eu',headers:{cookie}})).statusCode,200);
  assert.equal((await executar(handler,{method:'POST',url:'/api/sessao',raw:JSON.stringify(credenciais),headers:{'content-type':'application/json'}})).statusCode,200);
  assert.equal((await executar(handler,{method:'POST',url:'/api/sessao',body:credenciais,headers:{'content-type':'application/json',origin:'https://outro.example.test'}})).statusCode,403);
  assert.equal((await executar(handler,{method:'POST',url:'/api/sessao',raw:'x'.repeat(4*1024*1024+1)})).statusCode,413);
});

test('Vercel preserva bytes binários e esconde erros de infraestrutura',async()=>{
  const bytes=Buffer.from([0,255,13,10,128]);
  const handler=criarHandlerVercel(async()=>({inject:async()=>({statusCode:200,headers:{'content-type':'application/pdf'},rawPayload:bytes})}));
  assert.deepEqual((await executar(handler)).body,bytes);
  const falha=await executar(criarHandlerVercel(async()=>{throw new Error('segredo-que-nao-pode-vazar');}));
  assert.equal(falha.statusCode,503); assert.ok(!falha.body.includes('segredo'));
  assert.equal(falha.headers['Cache-Control'],'no-store');
});

test('origem Vercel distingue produção e preview e rejeita origem inválida',()=>{
  assert.equal(origemVercel({VERCEL_ENV:'production',VERCEL_PROJECT_PRODUCTION_URL:'ght4.example.test'}),'https://ght4.example.test');
  assert.equal(origemVercel({VERCEL_ENV:'preview',VERCEL_URL:'preview.example.test',VERCEL_PROJECT_PRODUCTION_URL:'prod.example.test'}),'https://preview.example.test');
  assert.throws(()=>origemVercel({}));
  assert.throws(()=>origemVercel({GHT4_ORIGEM_PUBLICA:'http://localhost'}));
});
