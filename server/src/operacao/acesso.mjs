import { z } from 'zod';
import { derivar } from '../seguranca/senha.mjs';
import { registrar } from '../auditoria/registrar.mjs';

// Somente o operador com acesso ao banco chama este módulo; não é uma rota pública.
export async function administrarAcesso(db, dados) {
  const p = z.object({ acao: z.enum(['iniciar','redefinir']), nome: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(200).transform(v => v.toLowerCase()), senha: z.string().min(12).max(256) }).strict().parse(dados);
  if(p.acao==='iniciar' && !p.nome)throw new Error('Informe o nome do primeiro administrador.');
  const {hash,sal}=await derivar(p.senha);
  return db.transaction(async tx=>{
    if(p.acao==='iniciar') {
      const reserva=await tx.query('INSERT INTO instalacao_inicial (id) VALUES (1) ON CONFLICT DO NOTHING RETURNING id');
      if(!reserva.rows.length || Number((await tx.query('SELECT count(*) AS n FROM usuarios')).rows[0].n))throw new Error('Já existe uma instalação. Use redefinir para recuperar uma conta existente.');
      const u=(await tx.query("INSERT INTO usuarios (nome,email,papel,senha_hash,senha_sal) VALUES ($1,$2,'admin',$3,$4) RETURNING id",[p.nome,p.email,hash,sal])).rows[0];
      const m=(await tx.query("INSERT INTO mandatos (codigo,rotulo,setor,subsetor,criado_por) VALUES ('PILOTO-QUIMICOS','Piloto de prospecção química','Químicos','Distribuição e trading químico',$1) RETURNING id",[u.id])).rows[0];
      await tx.query("INSERT INTO mandato_membros (mandato_id,usuario_id,papel) VALUES ($1,$2,'admin')",[m.id,u.id]);
      await registrar(tx,{usuarioId:u.id,entidade:'instalacao',entidadeId:'1',acao:'configurar_console',depois:{piloto:m.id}});
      return {id:u.id,criada:true};
    }
    const u=(await tx.query('SELECT id,ativo FROM usuarios WHERE lower(email)=$1 FOR UPDATE',[p.email])).rows[0];
    if(!u)throw new Error('Conta não encontrada. Nenhuma conta foi criada.');
    await tx.query('UPDATE usuarios SET senha_hash=$2,senha_sal=$3,atualizado_em=now() WHERE id=$1',[u.id,hash,sal]);
    await tx.query('UPDATE sessoes SET encerrada_em=now() WHERE usuario_id=$1 AND encerrada_em IS NULL',[u.id]);
    await registrar(tx,{entidade:'usuario',entidadeId:u.id,acao:'redefinir_senha_console',justificativa:'Recuperação pelo operador autenticado no servidor. Sessões anteriores revogadas.'});
    return {id:u.id,criada:false,ativo:u.ativo};
  });
}
