import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { Id, Versao } from '../crm/contratos.mjs';
import { autorizarOportunidade } from '../crm/acesso.mjs';
import { FORMULARIOS } from '../acervo/contratos.mjs';
import { analisarComparaveis } from '../acervo/analises.mjs';
import { xlsxDe,pdfDe,serializar } from '../acervo/exports.mjs';
import { registrar } from '../auditoria/registrar.mjs';

const fonteTexto=(fs=[]) => fs.map((f)=>`${f.titulo} | ${f.referencia || ''} | ${f.url || ''}`).join('\n');
export async function registrarExportacoes(app) {
  const { db }=app;
  app.post('/api/exportacoes',async(req)=>{
    const u=req.exigir('exportar');
    const p=z.object({ id:Id,oportunidadeId:Id.optional(),conversaId:Id.optional(),versao:Versao,
      selecao:z.array(z.object({id:Id,versao:Versao}).strict()).max(10000).optional() }).strict()
      .refine((p)=>Boolean(p.oportunidadeId)!==Boolean(p.conversaId),'Selecione uma oportunidade ou lista.').parse(req.body);
    let o,c;
    if(p.oportunidadeId)o=await autorizarOportunidade(req,db,p.oportunidadeId,'exportar');
    else {
      c=(await db.query('SELECT * FROM agente_conversas WHERE id=$1 AND usuario_id=$2',[p.conversaId,u.id])).rows[0];
      if(!c)throw new ErroHttp(404,'trabalho_inexistente','Trabalho não encontrado.');
      if(c.mandato_id)await req.exigirNoMandato(c.mandato_id,'exportar');
    }
    const exportacao=await db.transaction(async(tx)=>{
      const hashPedido=createHash('sha256').update(serializar(p)).digest('hex');
      const anterior=(await tx.query('SELECT id,hash,hash_pedido,usuario_id,oportunidade_id,conversa_id FROM agente_exportacoes WHERE id=$1',[p.id])).rows[0];
      if(anterior) {
        if(anterior.hash_pedido!==hashPedido || anterior.usuario_id!==u.id || anterior.oportunidade_id!==(o?.id || null) || anterior.conversa_id!==(c?.id || null))throw new ErroHttp(409,'exportacao_existente','Escolha uma nova exportação.');
        return {id:anterior.id,hash:anterior.hash};
      }
      const atual=(await tx.query(`SELECT * FROM ${o?'crm_oportunidades':'agente_conversas'} WHERE id=$1 FOR UPDATE`,[o?.id || c.id])).rows[0];
      if(atual.versao!==p.versao)throw new ErroHttp(409,'versao_alterada','Atualize a tela antes de gerar a exportação.');
      const payload={ titulo:atual.titulo,data:new Date().toISOString(),escopo:atual.mandato_id?'Espaço compartilhado autorizado':'Trabalho privado',
        limites:'Corte salvo para revisão. Cadastro não demonstra intenção de transação. Fontes e registros declarados pela equipe; informações financeiras ausentes não foram estimadas. O arquivo contém informações da oportunidade ou lista selecionada e deve circular somente entre destinatários autorizados.',secoes:[] };
      if(o) {
        payload.secoes.push({titulo:'Oportunidade',colunas:['Empresa','Frente','Etapa','Objetivo','Próximo passo','Prazo','Fontes'],
          linhas:[[atual.empresa.nome,atual.frente,atual.etapa,atual.objetivo,atual.proxima_acao,atual.prazo instanceof Date?atual.prazo.toISOString().slice(0,10):atual.prazo,fonteTexto(atual.fontes)]]});
        const tarefas=(await tx.query(`SELECT t.*,u.nome FROM crm_tarefas t JOIN usuarios u ON u.id=t.responsavel_id WHERE oportunidade_id=$1 ORDER BY prazo,t.id`,[o.id])).rows;
        payload.secoes.push({titulo:'Agenda',colunas:['Tarefa','Tipo','Responsável','Prazo','Concluída'],linhas:tarefas.map((t)=>[t.descricao,t.tipo,t.nome,t.prazo instanceof Date?t.prazo.toISOString().slice(0,10):t.prazo,t.concluida?'Sim':'Não'])});
        const registros=(await tx.query('SELECT DISTINCT ON(serie_id) * FROM crm_registros WHERE oportunidade_id=$1 ORDER BY serie_id,versao DESC',[o.id])).rows;
        for(const [tipo,f] of Object.entries(FORMULARIOS)) {
          const campos=f.campos.filter((c)=>!['email','telefone'].includes(c.id));
          payload.secoes.push({titulo:f.titulo.slice(0,31),colunas:[...campos.map((c)=>c.rotulo),'Versão','Revisado'],
            linhas:registros.filter((r)=>r.tipo===tipo).map((r)=>[...campos.map((c)=>r.dados[c.id]??null),r.versao,r.revisado?'Sim':'Não'])});
        }
        payload.secoes.push({titulo:'Valuation descritivo',colunas:['Empresa','EV/Receita','EV/EBITDA','Período','Fonte','Limites'],
          linhas:analisarComparaveis(registros.filter((r)=>r.tipo==='comparavel')).map((r)=>[r.empresa,r.evReceita,r.evEbitda,r.periodo,r.fonte,r.limite])});
        const documentos=(await tx.query('SELECT nome,hash,estado FROM crm_documentos WHERE oportunidade_id=$1 ORDER BY criado_em,id',[o.id])).rows;
        payload.secoes.push({titulo:'Documentos',colunas:['Nome','Hash SHA-256','Extração'],linhas:documentos.map((d)=>[d.nome,d.hash,d.estado])});
      } else {
        const selecao=(await tx.query('SELECT * FROM agente_selecao WHERE conversa_id=$1 ORDER BY id',[c.id])).rows;
        const esperado=new Map((p.selecao || []).map((s)=>[s.id,s.versao]));
        if(esperado.size!==selecao.length || selecao.some((s)=>esperado.get(s.id)!==s.versao))throw new ErroHttp(409,'selecao_alterada','A seleção mudou. Atualize a lista antes de exportar.');
        payload.secoes.push({titulo:'Distribuição química',colunas:['Empresa','Razão social','CNPJ raiz','Cidade','UF','Frente','Decisão','Justificativa','Versão','Fontes'],
          linhas:selecao.map((s)=>[s.empresa.nome,s.empresa.razaoSocial,s.empresa.cnpjRaiz,s.empresa.cidade,s.empresa.uf,s.frente,s.estado,s.justificativa,s.versao,fonteTexto(s.fontes)])});
      }
      const serializado=serializar(payload);
      if(serializado.length>2000000)throw new ErroHttp(422,'exportacao_excessiva','O corte é grande demais para o piloto. Divida a seleção em trabalhos menores.');
      const hash=createHash('sha256').update(serializado).digest('hex');
      await tx.query('INSERT INTO agente_exportacoes(id,usuario_id,mandato_id,oportunidade_id,conversa_id,payload,hash,hash_pedido) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[p.id,u.id,atual.mandato_id,o?.id||null,c?.id||null,serializado,hash,hashPedido]);
      await registrar(tx,{usuarioId:u.id,mandatoId:atual.mandato_id,entidade:'agente_exportacao',entidadeId:p.id,acao:'gerar',depois:{hash,secoes:payload.secoes.length}});
      return {id:p.id,hash};
    });
    return { exportacao };
  });
  app.get('/api/exportacoes/:id/:formato',async(req,res)=>{
    const u=req.exigir('exportar'),id=Id.parse(req.params.id),formato=z.enum(['pdf','xlsx','json']).parse(req.params.formato);
    const x=(await db.query('SELECT * FROM agente_exportacoes WHERE id=$1 AND usuario_id=$2',[id,u.id])).rows[0];
    if(!x)throw new ErroHttp(404,'exportacao_inexistente','Exportação não encontrada.');
    if(x.mandato_id)await req.exigirNoMandato(x.mandato_id,'exportar');
    if(x.oportunidade_id)await autorizarOportunidade(req,db,x.oportunidade_id,'exportar');
    res.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition',`attachment; filename="GHT4-${id}.${formato}"`);
    if(formato==='json')return {hash:x.hash,...x.payload};
    if(formato==='xlsx')return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(xlsxDe(x.payload,x.hash));
    const pdf=await pdfDe(x.payload,x.hash);
    await req.revalidarSessao();req.exigir('exportar');if(x.mandato_id)await req.exigirNoMandato(x.mandato_id,'exportar');
    return res.type('application/pdf').send(pdf);
  });
}
