import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste,criarUsuario } from './ajuda.mjs';
import { caminhosDeAcesso } from '../src/rede/caminhos.mjs';

const empresa={id:'cnpj12345678',nome:'Química Teste',referencia:'2026-08'};
async function montar(t){
  const db=await bancoDeTeste();
  const app=await criarApp(db,{catalogo:{obter:async()=>empresa,buscar:async()=>({empresas:[empresa],total:1,referencia:'2026-08'})}});
  t.after(async()=>{await app.close();await db.close()});
  async function usuario(email,papel){const u=await criarUsuario(db,{email,papel,senha:'Senha sintetica dos testes 2026!'});
    const r=await app.inject({method:'POST',url:'/api/sessao',payload:{email,senha:'Senha sintetica dos testes 2026!'}});
    assert.equal(r.statusCode,200,r.body);const cookie=r.headers['set-cookie'].split(';')[0];
    return {...u,chamar:(method,url,payload)=>app.inject({method,url,payload,headers:{cookie}})};
  }
  const admin=await usuario('admin@teste.local','admin'),membro=await usuario('membro@teste.local','analista');
  async function pessoa(dados){const r=await admin.chamar('POST','/api/rede/pessoas',{id:randomUUID(),...dados});assert.equal(r.statusCode,201,r.body);return r.json().pessoa}
  const casa=await pessoa({lado:'ght4',nome:'Ana da Casa',usuarioId:membro.id});
  const lote=()=>({id:randomUUID(),pessoaGht4Id:casa.id,fonte:'Contatos sintéticos do piloto',autorizacao:'Titular autorizou compartilhar a seleção em 21/09/2026.',compartilhado:true,
    linhas:[{nome:'Carlos Fictício',cargo:'Diretor',organizacao:empresa.nome,empresaId:empresa.id,email:'carlos@exemplo.test',evidencia:'Contato selecionado pelo titular; ainda não confirmado.'}]});
  async function importar(p){const previa=await admin.chamar('POST','/api/rede/importacoes/previa',p);assert.equal(previa.statusCode,200,previa.body);
    const r=await admin.chamar('POST','/api/rede/importacoes',{...p,previaHash:previa.json().hash});return r}
  const responder=(p)=>membro.chamar('POST','/api/rede/reconhecimento',{id:randomUUID(),...p});
  return {db,app,admin,membro,usuario,pessoa,casa,lote,importar,responder};
}

test('lote revisado importa sem confirmar relação, não duplica no reenvio e titular pode retirar',async t=>{
  const {db,admin,membro,lote,importar}=await montar(t);const p=lote();
  let r=await importar(p);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().pessoas,1);
  r=await importar(p);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().repetido,true);
  let caminhos=await caminhosDeAcesso(db,{empresaId:empresa.id});assert.equal(caminhos.caminhos[0].categoria,'a_confirmar');
  const contatos=(await membro.chamar('GET','/api/rede/pessoas?lado=mercado')).json().pessoas;
  assert.equal(contatos[0].email,undefined);assert.ok(contatos[0].camposOmitidos.includes('email'));
  assert.equal(contatos[0].senioridadeRotulo,'Outro cargo');
  assert.equal((await membro.chamar('POST','/api/rede/importacoes/previa',p)).statusCode,403);
  const c=(await admin.chamar('POST','/api/agente/conversas',{id:randomUUID(),titulo:'Caminhos de teste'})).json().conversa;
  r=await admin.chamar('POST',`/api/agente/conversas/${c.id}/mensagens`,{chave:randomUUID(),versao:0,tarefa:'mapear_acesso',contexto:{empresaId:empresa.id}});
  assert.equal(r.statusCode,200,r.body);
  r=await membro.chamar('POST',`/api/rede/importacoes/${p.id}/retirar`,{motivo:'Titular retirou o compartilhamento desta seleção.'});assert.equal(r.statusCode,200,r.body);
  caminhos=await caminhosDeAcesso(db,{empresaId:empresa.id});assert.equal(caminhos.caminhos.length,0);
  const historico=(await admin.chamar('GET',`/api/agente/conversas/${c.id}`)).json();
  assert.equal(historico.turnos[0].resultado.redeDesatualizada,true);assert.ok(!JSON.stringify(historico).includes('carlos@exemplo.test'));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM rede_lotes WHERE retirado_em IS NOT NULL')).rows[0].n,1);
});

test('homônimos exigem decisão explícita; selecionar existente não sobrescreve cargo ou confirmação',async t=>{
  const {db,admin,pessoa,lote,importar,casa}=await montar(t);
  const alvo=await pessoa({lado:'mercado',nome:'Carlos Fictício',organizacao:empresa.nome,empresaId:empresa.id,cargo:'Presidente',senioridade:'ceo'});
  const p=lote();let r=await admin.chamar('POST','/api/rede/importacoes/previa',p);
  assert.equal(r.json().linhas[0].candidatos[0].id,alvo.id);assert.ok(r.json().linhas[0].erro);
  assert.equal((await importar(p)).statusCode,422);
  p.linhas[0].acao='existente';p.linhas[0].pessoaId=alvo.id;
  r=await importar(p);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().pessoas,0);
  assert.equal((await db.query('SELECT cargo FROM rede_pessoas WHERE id=$1',[alvo.id])).rows[0].cargo,'Presidente');
  assert.equal((await db.query('SELECT count(*)::int n FROM rede_vinculos WHERE pessoa_a_id=$1 OR pessoa_b_id=$1',[casa.id])).rows[0].n,1);
});

test('prévia alterada, lote sem autorização, duplicidade interna e identidade fora dos candidatos são recusados',async t=>{
  const {db,admin,lote,importar}=await montar(t);const p=lote();
  assert.equal((await admin.chamar('POST','/api/rede/importacoes/previa',{...p,compartilhado:false})).statusCode,422);
  const previa=(await admin.chamar('POST','/api/rede/importacoes/previa',p)).json();
  assert.equal((await admin.chamar('POST','/api/rede/importacoes',{...p,fonte:'Fonte modificada',previaHash:previa.hash})).statusCode,409);
  p.linhas.push({...p.linhas[0]});assert.equal((await importar(p)).statusCode,422);
  p.linhas=p.linhas.slice(0,1);p.linhas[0].acao='existente';p.linhas[0].pessoaId=randomUUID();
  assert.equal((await importar(p)).statusCode,422);
  assert.equal((await db.query('SELECT count(*)::int n FROM rede_lotes')).rows[0].n,0);
});

test('membro responde e retira somente seus próprios vínculos; revisão rejeita versão antiga',async t=>{
  const {admin,membro,pessoa,casa,responder,db}=await montar(t);
  const outro=await pessoa({lado:'ght4',nome:'Bruno da Casa'}),alvo=await pessoa({lado:'mercado',nome:'Carlos Teste',organizacao:empresa.nome,empresaId:empresa.id});
  assert.equal((await responder({pessoaGht4Id:outro.id,pessoaAlvoId:alvo.id,resposta:'nao_conheco'})).statusCode,403);
  let r=await responder({pessoaGht4Id:casa.id,pessoaAlvoId:alvo.id,resposta:'posso_apresentar',versao:0,evidencia:'Trabalhamos juntos e conversamos neste mês.'});assert.equal(r.statusCode,201,r.body);
  const vid=r.json().reconhecimento.vinculo_id;
  assert.equal((await responder({pessoaAlvoId:alvo.id,resposta:'nao_conheco',versao:0})).statusCode,409);
  const fila=(await membro.chamar('GET','/api/rede/reconhecimento?revisao=true')).json();assert.equal(fila.pendentes[0].resposta_anterior,'posso_apresentar');assert.equal(fila.podeResponder,true);
  r=await responder({pessoaAlvoId:alvo.id,resposta:'nao_intermediar',versao:1,evidencia:'Conheço, mas não desejo apresentar nesta oportunidade.'});assert.equal(r.statusCode,201,r.body);
  assert.equal((await caminhosDeAcesso(db,{empresaId:empresa.id})).caminhos[0].recomendavel,false);
  const v=(await admin.chamar('GET',`/api/rede/pessoas/${casa.id}/vinculos`)).json().vinculos.find(v=>v.id===vid);
  r=await membro.chamar('PATCH',`/api/rede/vinculos/${vid}`,{versao:v.versao,forca:v.forca,evidencia:v.evidencia,disposicao:v.disposicao,ativo:false});assert.equal(r.statusCode,200,r.body);
  assert.equal((await caminhosDeAcesso(db,{empresaId:empresa.id})).caminhos.length,0);
});

test('respostas parciais não esgotam a rede e não contatar bloqueia também a consulta direta',async t=>{
  const {db,pessoa,responder}=await montar(t);
  await pessoa({lado:'ght4',nome:'Bruno da Casa'});const alvo=await pessoa({lado:'mercado',nome:'Carlos Teste',organizacao:empresa.nome,empresaId:empresa.id});
  await responder({pessoaAlvoId:alvo.id,resposta:'nao_conheco'});
  let c=await caminhosDeAcesso(db,{empresaId:empresa.id});assert.equal(c.cobertura.apuracaoCompleta,false);assert.equal(c.cobertura.perguntasPendentes,1);
  await responder({pessoaAlvoId:alvo.id,resposta:'posso_apresentar',evidencia:'Conversamos sobre negócios no mês passado.'});
  await db.query(`INSERT INTO crm_restricoes_contato(escopo,empresa_id,ativa,categoria,motivo,usuario_id)
    VALUES ('usuario:teste',$1,true,'outro','Não abordar a empresa neste período.',(SELECT id FROM usuarios WHERE papel='admin' LIMIT 1))`,[empresa.id]);
  c=await caminhosDeAcesso(db,{empresaId:empresa.id,escopo:'usuario:teste'});assert.equal(c.caminhos.length,0);assert.equal(c.semCaminho.length,0);assert.equal(c.restricao.ativa,true);
});

test('paginação e busca por nome sem acento alcançam pessoas depois da primeira página; conta não pode ser apropriada duas vezes',async t=>{
  const {admin,pessoa,membro}=await montar(t);
  await pessoa({lado:'mercado',nome:'Álvaro Químico',organizacao:empresa.nome});await pessoa({lado:'mercado',nome:'Bruno Químico',organizacao:empresa.nome});
  let r=(await admin.chamar('GET','/api/rede/pessoas?lado=mercado&limite=1')).json();assert.equal(r.pessoas.length,1);assert.equal(r.proximoOffset,1);
  const id=r.pessoas[0].id;r=(await admin.chamar('GET','/api/rede/pessoas?lado=mercado&limite=1&offset=1')).json();assert.notEqual(r.pessoas[0].id,id);assert.equal(r.proximoOffset,null);
  r=(await admin.chamar('GET','/api/rede/pessoas?busca=alvaro')).json();assert.equal(r.pessoas[0].nome,'Álvaro Químico');
  assert.equal((await admin.chamar('POST','/api/rede/pessoas',{id:randomUUID(),lado:'ght4',nome:'Pessoa duplicada',usuarioId:membro.id})).statusCode,409);
});

test('cadastro alterado depois da prévia exige nova revisão; lote de 500 contatos grava inteiro',async t=>{
  const {db,admin,pessoa,lote,importar}=await montar(t);const p=lote();
  const previa=(await admin.chamar('POST','/api/rede/importacoes/previa',p)).json();
  await pessoa({lado:'mercado',nome:'Carlos Fictício',organizacao:'Outra empresa'});
  assert.equal((await admin.chamar('POST','/api/rede/importacoes',{...p,previaHash:previa.hash})).statusCode,409);
  const grande=lote();grande.linhas=Array.from({length:500},(_,i)=>({...grande.linhas[0],nome:`Pessoa sintética ${String(i).padStart(3,'0')}`,email:''}));
  const r=await importar(grande);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().pessoas,500);assert.equal(r.json().vinculos,500);
  assert.equal((await db.query('SELECT count(*)::int n FROM rede_pessoas WHERE lote_id=$1',[grande.id])).rows[0].n,500);
});

test('nova resposta do titular substitui recusa ou confirmação em todos os tipos de vínculo do par',async t=>{
  const {db,admin,pessoa,casa,responder}=await montar(t);
  const alvo=await pessoa({lado:'mercado',nome:'Dirigente Sintético',organizacao:empresa.nome,empresaId:empresa.id});
  const r=await admin.chamar('POST','/api/rede/vinculos',{id:randomUUID(),pessoaAId:casa.id,pessoaBId:alvo.id,tipo:'trabalharam_juntos',forca:'direta',evidencia:'Passagem profissional confirmada pelo titular.',disposicao:'conheco'});
  assert.equal(r.statusCode,201,r.body);
  await responder({pessoaAlvoId:alvo.id,resposta:'nao_intermediar',evidencia:'Não quero intermediar esta apresentação.'});
  assert.equal((await caminhosDeAcesso(db,{empresaId:empresa.id})).caminhos[0].recomendavel,false);
  await responder({pessoaAlvoId:alvo.id,resposta:'posso_apresentar',evidencia:'Reavaliei e posso conversar sobre a apresentação.'});
  assert.equal((await caminhosDeAcesso(db,{empresaId:empresa.id})).caminhos[0].categoria,'introducao_viavel');
  await responder({pessoaAlvoId:alvo.id,resposta:'talvez',evidencia:'Preciso confirmar novamente o contato atual.'});
  assert.equal((await caminhosDeAcesso(db,{empresaId:empresa.id})).caminhos[0].categoria,'a_confirmar');
});

test('painel conta pares distintos, respeita recusas e ignora pessoas inativas na cobertura', async t => {
  const {db,admin,pessoa,casa,responder,membro}=await montar(t);
  const alvo=await pessoa({lado:'mercado',nome:'Diretora do painel',organizacao:empresa.nome,empresaId:empresa.id});
  await pessoa({lado:'ght4',nome:'Participante sem conta'});
  const resumo=async()=>{const r=await admin.chamar('GET','/api/rede');assert.equal(r.statusCode,200,r.body);return r.json().resumo};
  assert.deepEqual(await resumo(),{confirmadas:0,pendentes:0,bloqueadas:0,membrosSemConta:1,cargosRevisar:1,respondidas:0,perguntasPossiveis:2});
  for (const [tipo,disposicao] of [['trabalharam_juntos','conheco'],['formacao','nao_confirmado']]) {
    const r=await admin.chamar('POST','/api/rede/vinculos',{id:randomUUID(),pessoaAId:casa.id,pessoaBId:alvo.id,tipo,disposicao,forca:'indireta',evidencia:'Evidência sintética para testar o painel.'});
    assert.equal(r.statusCode,201,r.body);
  }
  assert.equal((await resumo()).confirmadas,1);
  assert.equal((await resumo()).pendentes,0);
  let r=await admin.chamar('POST','/api/rede/vinculos',{id:randomUUID(),pessoaAId:casa.id,pessoaBId:alvo.id,tipo:'outro',disposicao:'nao_intermediar',forca:'indireta',evidencia:'Titular prefere não intermediar esta relação.'});
  assert.equal(r.statusCode,201,r.body);
  assert.equal((await resumo()).confirmadas,0);
  assert.equal((await resumo()).bloqueadas,1);
  r=await responder({pessoaAlvoId:alvo.id,resposta:'nao_conheco'});assert.equal(r.statusCode,201,r.body);
  assert.equal((await resumo()).respondidas,1);
  assert.equal((await resumo()).bloqueadas,0);
  await db.query('UPDATE rede_pessoas SET ativo=false WHERE id=$1',[alvo.id]);
  const final=await resumo();assert.equal(final.respondidas,0);assert.equal(final.perguntasPossiveis,0);assert.equal(final.cargosRevisar,0);
  await db.query('UPDATE usuarios SET ativo=false WHERE id=$1',[membro.id]);
  assert.equal((await resumo()).membrosSemConta,2);
});
