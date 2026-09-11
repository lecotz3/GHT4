import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { conferir } from '../seguranca/senha.mjs';
import { criarBackup } from '../operacao/backup.mjs';
import { registrar } from '../auditoria/registrar.mjs';
export async function registrarOperacao(app,{servicoIA}) {
  const {db}=app;let copiando=false;
  const exigirAdmin=req=>req.exigir('usuario.criar');
  app.get('/api/operacao',async req=>{
    exigirAdmin(req);
    const uso=(await db.query(`SELECT count(*)::int AS pedidos,
      count(*) FILTER(WHERE estado='falhou')::int AS falhas,
      count(*) FILTER(WHERE estado='reservada')::int AS pendentes,
      coalesce(sum(tokens_entrada),0)::int AS entrada,coalesce(sum(tokens_saida),0)::int AS saida
      FROM ia_execucoes WHERE criado_em >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`)).rows[0];
    const ultimaCopia=(await db.query("SELECT ocorrido_em FROM auditoria WHERE entidade='operacao' AND acao='solicitar_backup' ORDER BY id DESC LIMIT 1")).rows[0]?.ocorrido_em??null;
    return {banco:db.tipo,backupLocal:db.tipo==='pglite',iaConfigurada:Boolean(servicoIA),uso,ultimaCopia,
      migracoes:(await db.query('SELECT nome,aplicada_em FROM migracoes ORDER BY nome')).rows};
  });
  app.post('/api/operacao/backup',async(req,res)=>{
    const u=exigirAdmin(req);
    const p=z.object({senhaAcesso:z.string().min(1).max(256),senhaBackup:z.string().min(12).max(256),incluiTrabalhosPrivados:z.literal(true)}).strict().parse(req.body);
    if(db.tipo!=='pglite')throw new ErroHttp(409,'backup_operador','O banco compartilhado utiliza o procedimento de backup do servidor.');
    if(copiando)throw new ErroHttp(409,'backup_em_andamento','Já há uma cópia em preparação. Aguarde.');
    copiando=true;
    try {
      const cred=(await db.query('SELECT senha_hash,senha_sal FROM usuarios WHERE id=$1',[u.id])).rows[0];
      if(!await conferir(p.senhaAcesso,cred.senha_hash,cred.senha_sal))throw new ErroHttp(403,'senha_invalida','A senha de acesso não confere.');
      await db.transaction(tx=>registrar(tx,{usuarioId:u.id,entidade:'operacao',entidadeId:'backup',acao:'solicitar_backup',justificativa:'Administrador solicitou cópia completa protegida por senha, incluindo trabalhos privados.'}));
      const arquivo=await criarBackup(db,p.senhaBackup);
      await req.revalidarSessao();exigirAdmin(req);
      return res.header('Content-Disposition',`attachment; filename="ght4-backup-${new Date().toISOString().slice(0,10)}.ght4"`).type('application/octet-stream').send(arquivo);
    } finally {copiando=false}
  });
}
