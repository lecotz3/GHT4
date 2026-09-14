import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { filtrosDoContexto } from '../agente/filtros.mjs';
import { validarInterpretacao } from '../agente/interpretacao.mjs';
export const mesmosFiltros=(a,b)=>JSON.stringify(filtrosDoContexto(a))===JSON.stringify(filtrosDoContexto(b));
export async function registrarPropostas(app,{autorizar}) {
  const {db}=app;
  app.post('/api/agente/conversas/:id/propostas/:turnoId/aplicar',async req=>{
    const c=await autorizar(req,req.params.id,'agente.usar');
    const turnoId=z.string().uuid().parse(req.params.turnoId);
    const p=z.object({chave:z.string().uuid(),versao:z.number().int().min(0),revisado:z.literal(true)}).strict().parse(req.body);
    const hash=createHash('sha256').update(JSON.stringify({turnoId,...p})).digest('hex');
    return db.transaction(async tx=>{
      const atual=(await tx.query('SELECT * FROM agente_conversas WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
      const repetido=(await tx.query('SELECT corpo_hash FROM agente_propostas_aplicadas WHERE conversa_id=$1 AND chave=$2',[c.id,p.chave])).rows[0];
      if(repetido){if(repetido.corpo_hash!==hash)throw new ErroHttp(409,'pedido_diferente','Este envio já foi usado para outra aplicação.');return {conversa:atual,repetido:true}}
      if(atual.versao!==p.versao)throw new ErroHttp(409,'trabalho_atualizado','O trabalho mudou. Reabra antes de aplicar a proposta.');
      const turno=(await tx.query('SELECT pedido,resultado FROM agente_turnos WHERE id=$1 AND conversa_id=$2',[turnoId,c.id])).rows[0];
      const salvo=turno?.resultado?.propostaBusca;
      if(turno?.pedido?.tarefa!=='interpretar_busca'||!salvo)throw new ErroHttp(404,'proposta_inexistente','Prévia não encontrada neste trabalho.');
      const proposta=validarInterpretacao({alteracoes:salvo.alteracoes,pendencias:salvo.pendencias},turno.pedido.texto,turno.pedido.contexto,salvo.modo);
      if(proposta.hash!==salvo.hash || !proposta.aplicavel)throw new ErroHttp(422,'proposta_pendente','Resolva as pendências antes de aplicar. Nenhum filtro foi alterado.');
      if(!mesmosFiltros(atual.contexto,proposta.filtrosAtuais))throw new ErroHttp(409,'criterios_atualizados','Os filtros de partida mudaram. Prepare uma nova prévia para preservar suas alterações.');
      const contexto={...atual.contexto,...proposta.filtrosPropostos,modeloBusca:null,empresaId:null,offset:0};delete contexto.catalogoHash;
      const nova=(await tx.query('UPDATE agente_conversas SET contexto=$2,versao=versao+1,atualizado_em=now() WHERE id=$1 RETURNING *',[c.id,JSON.stringify(contexto)])).rows[0];
      await tx.query(`INSERT INTO agente_propostas_aplicadas(conversa_id,turno_id,usuario_id,chave,corpo_hash,proposta_hash,filtros,versao_conversa)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[c.id,turnoId,req.usuario.id,p.chave,hash,proposta.hash,JSON.stringify(proposta.filtrosPropostos),nova.versao]);
      await registrar(tx,{usuarioId:req.usuario.id,mandatoId:c.mandato_id,entidade:'agente_conversa',entidadeId:c.id,acao:'aplicar_proposta_busca',antes:proposta.filtrosAtuais,depois:{filtros:proposta.filtrosPropostos,turnoId,hash:proposta.hash},justificativa:'Critérios conferidos e aplicados explicitamente pelo usuário.'});
      return {conversa:nova,repetido:false};
    });
  });
}
