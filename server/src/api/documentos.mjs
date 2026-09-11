import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ErroHttp } from '../app.mjs';
import { Id } from '../crm/contratos.mjs';
import { autorizarOportunidade } from '../crm/acesso.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { extrairDocumento } from '../acervo/extrair.mjs';
const MIME={ pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain',md:'text/markdown' };
export async function registrarDocumentos(app) {
  const { db }=app;
  app.get('/api/crm/oportunidades/:id/documentos',async(req) => {
    const o=await autorizarOportunidade(req,db,req.params.id);
    return { documentos:(await db.query('SELECT id,nome,formato,hash,tamanho,estado,criado_em FROM crm_documentos WHERE oportunidade_id=$1 ORDER BY criado_em DESC,id',[o.id])).rows };
  });
  app.post('/api/crm/oportunidades/:id/documentos',async(req) => {
    const o=await autorizarOportunidade(req,db,req.params.id,'crm.editar');
    const p=z.object({ id:Id,nome:z.string().trim().min(1).max(180).regex(/^[^\\/\x00-\x1f]+$/),
      base64:z.string().max(2800000).regex(/^[A-Za-z0-9+/]*={0,2}$/), autorizado:z.literal(true) }).strict().parse(req.body);
    const formato=p.nome.split('.').pop().toLowerCase();
    const bytes=Buffer.from(p.base64,'base64'), hash=createHash('sha256').update(bytes).digest('hex');
    if(!MIME[formato] || !bytes.length || bytes.length>2*1024*1024 || bytes.toString('base64')!==p.base64) throw new ErroHttp(422,'arquivo_invalido','Use PDF, DOCX, TXT ou MD de até 2 MB.');
    if((formato==='pdf' && bytes.subarray(0,5).toString()!=='%PDF-') || (formato==='docx' && bytes.subarray(0,2).toString()!=='PK')) throw new ErroHttp(422,'formato_invalido','O conteúdo não corresponde ao formato informado.');
    const anterior=(await db.query('SELECT id,estado FROM crm_documentos WHERE oportunidade_id=$1 AND hash=$2',[o.id,hash])).rows[0];
    if(anterior) return { documento:anterior,repetido:true };
    let extraido;
    try { extraido=await extrairDocumento(bytes,formato); }
    catch { throw new ErroHttp(503,'extracao_ocupada','Outros documentos estão em processamento. Tente novamente em instantes.'); }
    await req.revalidarSessao(); await autorizarOportunidade(req,db,o.id,'crm.editar');
    const documento=await db.transaction(async(tx) => {
      await tx.query('SELECT id FROM crm_oportunidades WHERE id=$1 FOR UPDATE',[o.id]);
      const n=(await tx.query('SELECT count(*)::int n FROM crm_documentos WHERE oportunidade_id=$1',[o.id])).rows[0].n;
      if(n>=100) throw new ErroHttp(422,'limite_documentos','O piloto aceita até 100 documentos por oportunidade.');
      const r=(await tx.query(`INSERT INTO crm_documentos(id,oportunidade_id,usuario_id,nome,formato,hash,tamanho,conteudo,trechos,estado)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id,estado`,
      [p.id,o.id,req.usuario.id,p.nome,formato,hash,bytes.length,bytes,JSON.stringify(extraido.trechos),extraido.estado])).rows[0];
      if(!r) {
        const existente=(await tx.query('SELECT id,estado FROM crm_documentos WHERE oportunidade_id=$1 AND hash=$2',[o.id,hash])).rows[0];
        if(!existente) throw new ErroHttp(409,'arquivo_conflitante','Este envio já foi utilizado. Atualize os documentos.');
        return existente;
      }
      await registrar(tx,{ usuarioId:req.usuario.id,mandatoId:o.mandato_id,entidade:'crm_documento',entidadeId:r.id,acao:'receber',depois:{ hash,tamanho:bytes.length,estado:r.estado } });
      await tx.query('UPDATE crm_oportunidades SET versao=versao+1,atualizado_em=now() WHERE id=$1',[o.id]);
      return r;
    });
    return { documento };
  });
  app.get('/api/crm/oportunidades/:id/documentos/:documentoId',async(req,res) => {
    const o=await autorizarOportunidade(req,db,req.params.id);
    const q=z.object({ baixar:z.enum(['1']).optional() }).strict().parse(req.query);
    const d=(await db.query('SELECT * FROM crm_documentos WHERE oportunidade_id=$1 AND id=$2',[o.id,Id.parse(req.params.documentoId)])).rows[0];
    if(!d) throw new ErroHttp(404,'documento_inexistente','Documento não encontrado.');
    if(q.baixar) return res.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff')
      .header('Content-Disposition',`attachment; filename="documento.${d.formato}"`).type(MIME[d.formato]).send(Buffer.from(d.conteudo));
    return { documento:{ id:d.id,nome:d.nome,estado:d.estado,hash:d.hash,trechos:d.trechos },
      limite:'Texto extraído para conferência: PDFs por página; DOCX apenas corpo por parágrafo, sem cabeçalhos, rodapés ou validação de assinaturas. Arquivos digitalizados precisam de transcrição ou OCR externo.' };
  });
}
