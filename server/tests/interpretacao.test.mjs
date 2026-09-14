import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { interpretarLocal,validarInterpretacao } from '../src/agente/interpretacao.mjs';
import { filtrosDoContexto } from '../src/agente/filtros.mjs';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste,criarUsuario,criarMandato,darAcesso } from './ajuda.mjs';
import { criar } from '../src/seguranca/sessao.mjs';
import { configurarIA,criarServicoIA } from '../src/agente/provedor.mjs';
import { complementarComIA,executarTarefa } from '../src/agente/tarefas.mjs';

test('regras locais preservam critérios não citados e sinalizam sobras, exclusões e ambiguidades',()=>{
  const atual={frente:'venda',uf:'RJ',cnae:'4684299'};
  const p=interpretarLocal('Distribuidoras em SP para compra; busca: Campinas; incluir possíveis',atual);
  assert.equal(p.aplicavel,true);assert.equal(p.filtrosPropostos.uf,'SP');assert.equal(p.filtrosPropostos.busca,'campinas');assert.equal(p.filtrosPropostos.frente,'compra');assert.equal(p.filtrosPropostos.cnae,'4684299');assert.equal(p.filtrosAtuais.uf,'RJ');
  for(const pedido of ['Buscar em SP e em RJ','Não buscar em SP','Buscar em São Paulo','Buscar em SP com faturamento acima de 50 milhões','Buscar distribuidores excluindo trading','Pesquisar e envie e-mail aos sócios','Em SP; cidade: Campinas','Em SP; nome: Adequim']) {
    const r=interpretarLocal(pedido,atual);assert.equal(r.aplicavel,false,pedido);assert.ok(r.pendencias.length,pedido);
  }
  const nao=interpretarLocal('Em SP; não incluir possíveis',{});assert.equal(nao.aplicavel,true);assert.equal(nao.filtrosPropostos.incluirPossiveis,false);
});

test('interpretação recusa campos extras, valor inválido, termo inventado e origem inexistente',()=>{
  const a={campo:'uf',valor:'SP',trecho:'em SP'},pedido='Buscar em SP';
  assert.throws(()=>validarInterpretacao({alteracoes:[{...a,campo:'sql'}],pendencias:[]},pedido,{}));
  assert.throws(()=>validarInterpretacao({alteracoes:[{...a,valor:'XX'}],pendencias:[]},pedido,{}));
  assert.throws(()=>validarInterpretacao({alteracoes:[{campo:'busca',valor:'Empresa inventada',trecho:'em SP'}],pendencias:[]},pedido,{}));
  assert.throws(()=>validarInterpretacao({alteracoes:[{...a,trecho:'em RJ'}],pendencias:[]},pedido,{}));
  assert.throws(()=>validarInterpretacao({alteracoes:[a,a],pendencias:[]},pedido,{}));
  const financeiro=validarInterpretacao({alteracoes:[a],pendencias:[]},pedido+' com receita de 50 milhões',{});
  assert.equal(financeiro.aplicavel,false);
});

async function ambiente(t,opcoes={}) {
  const db=await bancoDeTeste();let consultas=0;
  const app=await criarApp(db,{catalogo:{buscar:async()=>{consultas++;return {empresas:[],total:0,referencia:'QA',hash:'a'.repeat(64)}}},...opcoes});
  t.after(async()=>{await app.close();await db.close()});
  const u=await criarUsuario(db,{email:'proposta@example.test'}),s=await criar(db,{usuarioId:u.id});
  const headers={cookie:`ght4_sessao=${s.token}`};
  const chamar=(method,url,payload)=>app.inject({method,url,payload,headers});
  const c=(await chamar('POST','/api/agente/conversas',{id:randomUUID(),titulo:'Prévia sintética',contexto:{frente:'venda',uf:'RJ',objetivo:'Objetivo privado'}})).json().conversa;
  const preparar=async(texto='Distribuidoras em SP para compra',versao=0,contexto={})=>(await chamar('POST',`/api/agente/conversas/${c.id}/mensagens`,{chave:randomUUID(),versao,tarefa:'interpretar_busca',texto,contexto})).json();
  return {db,app,u,c,chamar,preparar,consultas:()=>consultas};
}

test('prévia não busca nem aplica; confirmação aplica uma vez, persiste e aparece como fonte',async t=>{
  const {db,c,chamar,preparar,consultas}=await ambiente(t);
  const previa=await preparar();assert.equal(previa.conversa.contexto.uf,'RJ');assert.equal(consultas(),0);
  assert.equal(previa.turno.resultado.propostaBusca.aplicavel,true);
  const url=`/api/agente/conversas/${c.id}/propostas/${previa.turno.id}/aplicar`,p={chave:randomUUID(),versao:1,revisado:true};
  assert.equal((await chamar('POST',url,{...p,revisado:false})).statusCode,422);
  const aplicada=await chamar('POST',url,p);assert.equal(aplicada.statusCode,200,aplicada.body);assert.equal(aplicada.json().conversa.contexto.uf,'SP');
  assert.equal((await chamar('POST',url,p)).json().repetido,true);assert.equal(consultas(),0);
  assert.equal((await db.query('SELECT count(*)::int n FROM agente_propostas_aplicadas')).rows[0].n,1);
  assert.equal((await chamar('POST',url,{...p,versao:2})).statusCode,409);
  const busca=await chamar('POST',`/api/agente/conversas/${c.id}/mensagens`,{chave:randomUUID(),versao:2,tarefa:'buscar_empresas'});
  assert.equal(busca.statusCode,200,busca.body);assert.equal(consultas(),1);assert.ok(busca.json().turno.resultado.fontes.some(f=>f.titulo==='Prévia de filtros revisada'));
  const salvo=(await chamar('GET',`/api/agente/conversas/${c.id}`)).json();assert.equal(salvo.conversa.contexto.frente,'compra');assert.equal(salvo.conversa.contexto.objetivo,'Objetivo privado');
});

test('pendências e mudança dos filtros de partida impedem aplicar uma prévia',async t=>{
  const {c,chamar,preparar}=await ambiente(t);
  const primeira=await preparar('Em SP com faturamento acima de 80 milhões');
  const aplicar=(turnoId,versao)=>chamar('POST',`/api/agente/conversas/${c.id}/propostas/${turnoId}/aplicar`,{chave:randomUUID(),versao,revisado:true});
  assert.equal((await aplicar(primeira.turno.id,1)).statusCode,422);
  const segunda=await preparar('Em SP para compra',1);
  await chamar('POST',`/api/agente/conversas/${c.id}/mensagens`,{chave:randomUUID(),versao:2,tarefa:'ver_pendencias',contexto:{uf:'MG'}});
  assert.equal((await aplicar(segunda.turno.id,3)).statusCode,409);
});

test('outro usuário e remoção de acesso ao espaço impedem aplicação',async t=>{
  const {db,app,u,c,chamar,preparar}=await ambiente(t);const previa=await preparar();
  const outro=await criarUsuario(db,{email:'outro-proposta@example.test'}),s=await criar(db,{usuarioId:outro.id});
  const url=`/api/agente/conversas/${c.id}/propostas/${previa.turno.id}/aplicar`,payload={chave:randomUUID(),versao:1,revisado:true};
  assert.equal((await app.inject({method:'POST',url,payload,headers:{cookie:`ght4_sessao=${s.token}`}})).statusCode,404);
  const m=await criarMandato(db,{codigo:'PREVIA'});await darAcesso(db,m.id,u.id);await db.query('UPDATE agente_conversas SET mandato_id=$2 WHERE id=$1',[c.id,m.id]);
  await db.query('DELETE FROM mandato_membros WHERE mandato_id=$1 AND usuario_id=$2',[m.id,u.id]);
  assert.equal((await chamar('POST',url,payload)).statusCode,404);
});

test('IA usa schema estrito, envia só pedido/filtros e valida saída antes de salvar reserva',async t=>{
  const {db,u,c}=await ambiente(t);let chamadas=0;
  const config=configurarIA({GHT4_IA_PROVEDOR:'openai',GHT4_IA_MODELO:'modelo-sintetico',OPENAI_API_KEY:'chave-so-de-teste'});
  const servico=criarServicoIA(db,config,{fetchImpl:async(_url,opcoes)=>{
    chamadas++;const p=JSON.parse(opcoes.body);assert.equal(p.text.format.type,'json_schema');assert.equal(p.text.format.strict,true);assert.equal(p.tools,undefined);
    assert.deepEqual(Object.keys(JSON.parse(p.input)).sort(),['filtrosAtuais','pedido']);assert.ok(!p.input.includes('privado'));
    return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({alteracoes:[{campo:'uf',valor:'SP',trecho:'em SP'}],pendencias:[]})}]}],usage:{input_tokens:10,output_tokens:10}});
  }});
  const entrada={tarefa:'interpretar_busca',pedido:'Buscar em SP',contexto:{uf:'RJ',objetivo:'Objetivo privado'},historico:['privado'],documentos:[{nome:'privado',trechos:[]}],execucao:{usuarioId:u.id,conversaId:c.id,chave:randomUUID(),corpoHash:'teste'}};
  const r=await servico.redigir(entrada);assert.equal(r.propostaBusca.filtrosPropostos.uf,'SP');assert.deepEqual(await servico.redigir(entrada),r);assert.equal(chamadas,1);
  assert.equal((await db.query('SELECT contexto FROM agente_conversas WHERE id=$1',[c.id])).rows[0].contexto.uf,'RJ');
  assert.deepEqual(r.propostaBusca.filtrosAtuais,filtrosDoContexto(entrada.contexto));
});

test('duas abas aplicando propostas na mesma versão não sobrescrevem a decisão vencedora',async t=>{
  const {db,c,chamar,preparar}=await ambiente(t);
  const primeira=await preparar('Buscar em SP para compra');
  const segunda=await preparar('Buscar em MG para venda',1);
  const respostas=await Promise.all([primeira,segunda].map(p=>chamar('POST',`/api/agente/conversas/${c.id}/propostas/${p.turno.id}/aplicar`,{chave:randomUUID(),versao:2,revisado:true})));
  assert.deepEqual(respostas.map(r=>r.statusCode).sort(),[200,409]);
  const vencedora=respostas.find(r=>r.statusCode===200).json().conversa;
  const final=(await chamar('GET',`/api/agente/conversas/${c.id}`)).json().conversa;
  assert.equal(final.versao,3);assert.deepEqual(final.contexto,vencedora.contexto);
  assert.equal((await db.query('SELECT count(*)::int n FROM agente_propostas_aplicadas')).rows[0].n,1);
});

test('recusa e saída inválida da IA consomem a reserva e preservam uma prévia local identificada',async t=>{
  const {db,u,c}=await ambiente(t);let chamadas=0;
  const config=configurarIA({GHT4_IA_PROVEDOR:'openai',GHT4_IA_MODELO:'modelo-sintetico',OPENAI_API_KEY:'chave-so-de-teste'});
  for(const conteudo of [{type:'refusal',refusal:'Recusa sintética'},{type:'output_text',text:'{"alteracoes":[{"campo":"sql","valor":"DELETE","trecho":"em SP"}],"pendencias":[]}'}]) {
    const servico=criarServicoIA(db,config,{fetchImpl:async()=>{chamadas++;return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[conteudo]}]})}});
    const entrada={tarefa:'interpretar_busca',texto:'Buscar em SP para compra',contexto:{uf:'RJ'},execucao:{usuarioId:u.id,conversaId:c.id,chave:randomUUID(),corpoHash:'qa-falha'}};
    const local=await executarTarefa(entrada);
    const r=await complementarComIA(local,entrada,servico.redigir);
    assert.equal(r.propostaBusca.modo,'regras_locais');assert.equal(r.propostaBusca.filtrosPropostos.uf,'SP');assert.match(r.avisoIA,/somente as regras locais/);
    await assert.rejects(servico.redigir({...entrada,pedido:entrada.texto}),/pedido_ja_falhou/);
  }
  assert.equal(chamadas,2);
  assert.equal((await db.query("SELECT count(*)::int n FROM ia_execucoes WHERE estado='falhou'")).rows[0].n,2);
  assert.equal((await db.query('SELECT contexto FROM agente_conversas WHERE id=$1',[c.id])).rows[0].contexto.uf,'RJ');
});
