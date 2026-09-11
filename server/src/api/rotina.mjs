import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { Id, Data, Versao, hoje } from '../crm/contratos.mjs';
export const escopoDe = (o) => o.mandato_id ? `mandato:${o.mandato_id}` : `usuario:${o.criado_por}`;
export const restricaoDe = async (db, o) => (await db.query('SELECT ativa,categoria,motivo,versao,atualizado_em FROM crm_restricoes_contato WHERE escopo=$1 AND empresa_id=$2', [escopoDe(o),o.empresa.id])).rows[0] || null;
const Categorias = ['solicitacao_da_empresa','conflito_de_interesse','exclusividade','sem_aderencia','outro'];
const erroVersao = () => new ErroHttp(409, 'registro_atualizado', 'O registro mudou. Atualize a oportunidade antes de salvar.');
export async function registrarRotina(app, { oportunidade, participantes, adicionarEvento, repetido }) {
  const { db } = app;
  app.get('/api/crm/oportunidades/:id/rotina', async (req) => {
    const o = await oportunidade(req,req.params.id);
    const tarefas = (await db.query(`SELECT t.id,t.descricao,t.tipo,t.prazo::text,t.concluida,t.versao,t.responsavel_id,u.nome AS responsavel_nome,u.ativo AS responsavel_ativo
      FROM crm_tarefas t JOIN usuarios u ON u.id=t.responsavel_id WHERE oportunidade_id=$1 ORDER BY concluida,prazo,t.id`,[o.id])).rows;
    return { tarefas, restricao: await restricaoDe(db,o), categorias: Categorias };
  });
  app.put('/api/crm/oportunidades/:id/tarefas/:tarefaId', async (req) => {
    const o = await oportunidade(req,req.params.id,'crm.editar');
    const id = Id.parse(req.params.tarefaId);
    const p = z.object({ chave: Id, versao: Versao, descricao: z.string().trim().min(3).max(2000),
      responsavelId: Id, prazo: Data, tipo: z.enum(['pesquisa','contato','reuniao','documento','interno']), concluida: z.boolean() }).strict().parse(req.body);
    const pedido={...p,tarefaId:id};
    if (!(await participantes(req,o)).some((u) => u.id === p.responsavelId)) throw new ErroHttp(422,'responsavel_invalido','Escolha um responsável ativo deste espaço.');
    await db.transaction(async (tx) => {
      const atual = (await tx.query('SELECT * FROM crm_oportunidades WHERE id=$1 FOR UPDATE',[o.id])).rows[0];
      if (await repetido(tx,o,pedido)) return;
      if (atual.versao !== p.versao) throw erroVersao();
      if (p.tipo === 'contato' && (await restricaoDe(tx,o))?.ativa) throw new ErroHttp(422,'nao_contatar','Esta empresa está marcada como não contatar neste espaço.');
      const anterior = (await tx.query('SELECT * FROM crm_tarefas WHERE id=$1',[id])).rows[0];
      if (anterior && anterior.oportunidade_id !== o.id) throw erroVersao();
      if (!anterior && p.concluida) throw new ErroHttp(422,'tarefa_nova_concluida','Crie a tarefa antes de registrar sua conclusão.');
      await tx.query(`INSERT INTO crm_tarefas(id,oportunidade_id,responsavel_id,descricao,tipo,prazo,concluida)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET responsavel_id=$3,descricao=$4,tipo=$5,prazo=$6,concluida=$7,versao=crm_tarefas.versao+1,atualizado_em=now()`,
      [id,o.id,p.responsavelId,p.descricao,p.tipo,p.prazo,p.concluida]);
      await tx.query('UPDATE crm_oportunidades SET versao=versao+1,atualizado_em=now() WHERE id=$1',[o.id]);
      await adicionarEvento(tx,req,o,pedido,'tarefa',`${p.concluida ? 'Concluída' : 'Atualizada'}: ${p.descricao}`, { tarefaId: id, responsavelId: p.responsavelId, prazo: p.prazo, concluida: p.concluida });
    });
    return { salvo: true };
  });
  app.put('/api/crm/oportunidades/:id/restricao', async (req) => {
    const o = await oportunidade(req,req.params.id,'crm.editar');
    const p = z.object({ chave: Id, versao: Versao, versaoRestricao: Versao, ativa: z.boolean(), categoria: z.enum(Categorias), motivo: z.string().trim().min(10).max(1000) }).strict().parse(req.body);
    if (!p.ativa) await oportunidade(req,o.id,'crm.mover');
    await db.transaction(async (tx) => {
      const atual = (await tx.query('SELECT * FROM crm_oportunidades WHERE id=$1 FOR UPDATE',[o.id])).rows[0];
      if (await repetido(tx,o,p)) return;
      if (atual.versao !== p.versao) throw erroVersao();
      const valores = [escopoDe(o),o.empresa.id,p.ativa,p.categoria,p.motivo,req.usuario.id];
      const r = p.versaoRestricao === 0 ? await tx.query(`INSERT INTO crm_restricoes_contato(escopo,empresa_id,ativa,categoria,motivo,usuario_id)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING versao`,valores)
        : await tx.query(`UPDATE crm_restricoes_contato SET ativa=$3,categoria=$4,motivo=$5,usuario_id=$6,versao=versao+1,atualizado_em=now()
          WHERE escopo=$1 AND empresa_id=$2 AND versao=$7 RETURNING versao`,[...valores,p.versaoRestricao]);
      if (!r.rows.length) throw erroVersao();
      await tx.query('UPDATE crm_oportunidades SET versao=versao+1,atualizado_em=now() WHERE id=$1',[o.id]);
      await adicionarEvento(tx,req,o,p,'restricao',p.ativa ? 'Empresa marcada como não contatar neste espaço.' : 'Restrição de contato retirada por responsável autorizado.', { ativa: p.ativa, categoria: p.categoria, motivo: p.motivo });
    });
    return { salvo: true };
  });
  app.get('/api/crm/painel', async (req) => {
    const u = req.exigir('crm.ler');
    const escopo = `((o.mandato_id IS NULL AND o.criado_por=$1) OR (o.mandato_id IS NOT NULL AND ($2 OR m.confidencial=false OR o.mandato_id=ANY($3::uuid[]))))`;
    const v = [u.id,u.papel === 'admin',(u.mandatos || []).map((m) => m.id)];
    const funil = (await db.query(`SELECT o.frente,o.etapa,count(*)::int quantidade FROM crm_oportunidades o LEFT JOIN mandatos m ON m.id=o.mandato_id WHERE ${escopo} GROUP BY o.frente,o.etapa ORDER BY o.frente,o.etapa`,v)).rows;
    const pendencias = (await db.query(`SELECT * FROM (
      SELECT o.id AS oportunidade_id,o.titulo,o.proxima_acao AS descricao,o.prazo::text,o.responsavel_id,u.nome AS responsavel_nome,'Próximo passo' AS tipo
      FROM crm_oportunidades o LEFT JOIN mandatos m ON m.id=o.mandato_id JOIN usuarios u ON u.id=o.responsavel_id
      WHERE ${escopo} AND NOT o.acao_concluida AND o.etapa NOT IN ('perdida','mandato_assinado')
      UNION ALL SELECT o.id,o.titulo,t.descricao,t.prazo::text,t.responsavel_id,u.nome,t.tipo FROM crm_tarefas t
      JOIN crm_oportunidades o ON o.id=t.oportunidade_id LEFT JOIN mandatos m ON m.id=o.mandato_id JOIN usuarios u ON u.id=t.responsavel_id
      WHERE ${escopo} AND NOT t.concluida) p ORDER BY prazo,oportunidade_id,descricao LIMIT 100`,v)).rows;
    return { funil, pendencias, hoje: hoje(), limitePendencias: 100,
      metodologia: 'Contagem de oportunidades acessíveis no estado atual, separada por frente. Não é taxa de conversão. Agenda mostra até 100 compromissos, incluindo tarefas de execução após assinatura.' };
  });
}
