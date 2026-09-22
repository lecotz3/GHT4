// Ensaio isolado: banco em memória, contas fictícias e nenhuma chamada ao provedor de IA.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bancoDeTeste,criarUsuario } from '../server/tests/ajuda.mjs';
import { criarApp } from '../server/src/app.mjs';
import { servirInterface } from '../server/src/operacao/estatico.mjs';
import { fileURLToPath } from 'node:url';
const db=await bancoDeTeste();
const senha='Ensaio-local-2026!';
const admin=await criarUsuario(db,{email:'operador@teste.local',nome:'Operador de teste',papel:'admin',senha});
const membro=await criarUsuario(db,{email:'membro@teste.local',nome:'Membro de teste',papel:'analista',senha});
const empresa={id:'cnpj12345678',nome:'Química Exemplo — teste',razaoSocial:'Química Exemplo de Teste Ltda.',cnpjRaiz:'12345678',uf:'SP',cidade:'São Paulo',cnaePrincipal:'4684299',estado:'provavel',referencia:'2026-08'};
const app=await criarApp(db,{catalogo:{obter:async(id)=>id===empresa.id?empresa:null,buscar:async()=>({empresas:[empresa],total:1,referencia:'2026-08',hash:'f'.repeat(64),offset:0,proximoOffset:null,cobertura:{}})}});
await servirInterface(app,fileURLToPath(new URL('../v1/dist',import.meta.url)));
const host=await app.listen({host:'127.0.0.1',port:process.argv.includes('--interface')?5188:0});
async function sessao(email){const r=await fetch(`${host}/api/sessao`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0]}
async function chamar(cookie,metodo,caminho,corpo){const r=await fetch(`${host}${caminho}`,{method:metodo,headers:{Cookie:cookie,...(corpo?{'Content-Type':'application/json'}:{})},body:corpo?JSON.stringify(corpo):undefined});const j=await r.json();assert.ok(r.ok,`${metodo} ${caminho}: ${r.status} ${j.mensagem??''}`);return j}
try{
  const cookie=await sessao(admin.email),cookieMembro=await sessao(membro.email);
  const pessoa=(await chamar(cookie,'POST','/api/rede/pessoas',{id:randomUUID(),lado:'ght4',nome:'Membro de teste',usuarioId:membro.id,cargo:'Participante do piloto'})).pessoa;
  if(process.argv.includes('--interface')){
    await chamar(cookie,'POST','/api/rede/pessoas',{id:randomUUID(),lado:'mercado',nome:'Dirigente sintético',cargo:'Diretor',senioridade:'diretoria',organizacao:empresa.nome,empresaId:empresa.id});
    console.log(`Ensaio visual isolado em ${host}. PID ${process.pid}. Contas operador@teste.local e membro@teste.local; senha exclusivamente sintética: ${senha}`);
    await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve)});
  }else{
    assert.equal((await fetch(host)).status,200);
    const corpo={id:randomUUID(),pessoaGht4Id:pessoa.id,fonte:'Seleção sintética',autorizacao:'Autorização fictícia para teste isolado.',compartilhado:true,
      linhas:[{nome:'Diretora de teste',cargo:'Diretora',organizacao:empresa.nome,empresaId:empresa.id,evidencia:'Contato fictício de ensaio; não corresponde a pessoa real.'}]};
    const previa=await chamar(cookie,'POST','/api/rede/importacoes/previa',corpo);
    await chamar(cookie,'POST','/api/rede/importacoes',{...corpo,previaHash:previa.hash});
    let painel=(await chamar(cookieMembro,'GET','/api/rede')).resumo;
    assert.equal(painel.pendentes,1);assert.equal(painel.confirmadas,0);assert.equal(painel.perguntasPossiveis,1);assert.equal(painel.respondidas,0);
    let caminhos=await chamar(cookieMembro,'GET',`/api/rede/caminhos?empresaId=${empresa.id}`);
    assert.equal(caminhos.caminhos[0].categoria,'a_confirmar');
    const alvo=caminhos.caminhos[0].alvo;
    await chamar(cookieMembro,'POST','/api/rede/reconhecimento',{id:randomUUID(),pessoaAlvoId:alvo.id,resposta:'posso_apresentar',evidencia:'Trabalhamos juntos, conforme relato sintético.',versao:0});
    caminhos=await chamar(cookieMembro,'GET',`/api/rede/caminhos?empresaId=${empresa.id}`);assert.equal(caminhos.caminhos[0].categoria,'introducao_viavel');
    painel=(await chamar(cookieMembro,'GET','/api/rede')).resumo;
    assert.equal(painel.confirmadas,1);assert.equal(painel.pendentes,0);assert.equal(painel.respondidas,1);
    await chamar(cookieMembro,'POST','/api/rede/reconhecimento',{id:randomUUID(),pessoaAlvoId:alvo.id,resposta:'nao_conheco',versao:1});
    caminhos=await chamar(cookieMembro,'GET',`/api/rede/caminhos?empresaId=${empresa.id}`);assert.equal(caminhos.caminhos.length,0);
    painel=(await chamar(cookieMembro,'GET','/api/rede')).resumo;
    assert.equal(painel.confirmadas,0);assert.equal(painel.respondidas,1);
    await chamar(cookieMembro,'POST',`/api/rede/importacoes/${corpo.id}/retirar`,{motivo:'Fim do teste de compartilhamento.'});
    console.log('Ensaio HTTP aprovado: interface, login, duas contas, importação, confirmação pelo titular, indicadores do painel, correção e retirada. Banco descartado.');
  }
}finally{await app.close();await db.close()}
