import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
export async function cenarioOperacional(app,cookie,{frente='compra',mandatoId=null,termo=''}={}) {
  const chamar=async(method,url,payload)=>{
    const r=await app.inject({method,url,payload,headers:{cookie}});
    assert.ok(r.statusCode>=200 && r.statusCode<300,`${method} ${url}: ${r.body}`);return r.json();
  };
  const {conversa}=await chamar('POST','/api/agente/conversas',{id:randomUUID(),titulo:'Ensaio sintético · '+frente,mandatoId,contexto:{frente,busca:termo,objetivo:'Verificar produto com dados de teste.'}});
  const {turno}=await chamar('POST',`/api/agente/conversas/${conversa.id}/mensagens`,{chave:randomUUID(),versao:0,tarefa:'buscar_empresas'});
  const empresa=turno.resultado.empresas[0];assert.ok(empresa);
  const {selecao}=await chamar('PUT',`/api/agente/conversas/${conversa.id}/selecao/${empresa.id}`,{turnoId:turno.id,versao:0,estado:'priorizar',justificativa:'Ensaio sintético do fluxo; não representa uma decisão comercial.'});
  const {oportunidade}=await chamar('POST','/api/crm/oportunidades',{id:randomUUID(),selecaoId:selecao.id,titulo:'Ensaio GHT4 · '+frente,objetivo:'Validar o produto com cenário sintético.',proximaAcao:'Revisar as evidências do teste',prazo:new Date().toISOString().slice(0,10)});
  const bytes=Buffer.from('Documento sintético para QA.\n\nAtuação em especialidades químicas. Receita não informada.');
  const {documento}=await chamar('POST',`/api/crm/oportunidades/${oportunidade.id}/documentos`,{id:randomUUID(),nome:'cenario-qa.txt',base64:bytes.toString('base64'),autorizado:true});
  return {conversa,empresa,selecao,oportunidade,documento,bytes};
}
