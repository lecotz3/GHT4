import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { pode, podeNoMandato } from '../seguranca/rbac.mjs';
import { Id, EmpresaId, Versao, Criacao, Atualizacao, Atividade, ETAPAS, Etapa, hoje } from '../crm/contratos.mjs';

const hashDe = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const conflito = () => new ErroHttp(409, 'registro_atualizado', 'Este registro foi atualizado. Reabra-o para conferir as mudanças antes de salvar.');
const naoEncontrado = () => new ErroHttp(404, 'oportunidade_inexistente', 'Oportunidade não encontrada.');
const dataTexto = (d) => d instanceof Date ? d.toISOString().slice(0,10) : String(d).slice(0,10);
const campos = `o.id,o.titulo,o.objetivo,o.empresa,o.fontes,o.frente,o.etapa,o.proxima_acao,o.prazo::text,
  o.acao_concluida,o.responsavel_id,o.mandato_id,o.versao,o.criado_em,o.atualizado_em,
  u.nome AS responsavel_nome,u.ativo AS responsavel_ativo,m.rotulo AS espaco`;
const joins = 'FROM crm_oportunidades o JOIN usuarios u ON u.id = o.responsavel_id LEFT JOIN mandatos m ON m.id = o.mandato_id';

export async function registrarProspeccao(app) {
  const { db } = app;
  async function conversa(req, id, permissao, tx = db, bloquear = false) {
    const u = req.exigir(permissao);
    const c = (await tx.query(`SELECT * FROM agente_conversas WHERE id = $1 AND usuario_id = $2 ${bloquear ? 'FOR UPDATE' : ''}`, [Id.parse(id),u.id])).rows[0];
    if (!c) throw new ErroHttp(404, 'trabalho_inexistente', 'Trabalho não encontrado.');
    if (c.mandato_id) await req.exigirNoMandato(c.mandato_id, permissao);
    return c;
  }
  async function oportunidade(req, id, permissao = 'crm.ler', tx = db, bloquear = false) {
    const u = req.exigir(permissao);
    const o = (await tx.query(`SELECT * FROM crm_oportunidades WHERE id = $1 ${bloquear ? 'FOR UPDATE' : ''}`, [Id.parse(id)])).rows[0];
    if (!o) throw naoEncontrado();
    if (o.mandato_id) await req.exigirNoMandato(o.mandato_id, permissao);
    else if (o.criado_por !== u.id) throw naoEncontrado();
    return o;
  }
  async function publicavel(id) { return (await db.query(`SELECT ${campos} ${joins} WHERE o.id = $1`, [id])).rows[0]; }
  async function participantes(req, o) {
    if (!o.mandato_id) return [{ id: req.usuario.id, nome: req.usuario.nome }];
    const m = (await db.query('SELECT id,confidencial FROM mandatos WHERE id = $1', [o.mandato_id])).rows[0];
    const candidatos = (await db.query(`SELECT u.id,u.nome,u.papel,mm.papel AS papel_mandato
      FROM usuarios u LEFT JOIN mandato_membros mm ON mm.usuario_id = u.id AND mm.mandato_id = $1
      WHERE u.ativo = TRUE AND (u.papel = 'admin' OR mm.usuario_id IS NOT NULL) ORDER BY u.nome,u.id`, [o.mandato_id])).rows;
    return candidatos.filter((u) => podeNoMandato({ ...u, mandatos: u.papel_mandato ? [{ id: m.id, papel: u.papel_mandato }] : [] }, m, 'crm.editar')).map(({ id,nome }) => ({ id,nome }));
  }
  async function adicionarEvento(tx, req, o, p, tipo, descricao, dados) {
    await tx.query(`INSERT INTO crm_eventos (oportunidade_id,usuario_id,chave,corpo_hash,tipo,descricao,dados,ocorrido_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [o.id,req.usuario.id,p.chave,hashDe(p),tipo,descricao,JSON.stringify(dados),p.ocorridoEm || hoje()]);
    await registrar(tx, { usuarioId: req.usuario.id, mandatoId: o.mandato_id, entidade: 'crm_oportunidade', entidadeId: o.id,
      acao: tipo, depois: dados, runId: p.chave });
  }
  async function repetido(tx, o, p) {
    const r = (await tx.query('SELECT corpo_hash FROM crm_eventos WHERE oportunidade_id = $1 AND chave = $2', [o.id,p.chave])).rows[0];
    if (r && r.corpo_hash !== hashDe(p)) throw conflito();
    return Boolean(r);
  }

  app.get('/api/agente/conversas/:id/selecao', async (req) => {
    const c = await conversa(req, req.params.id, 'agente.ler');
    const selecao = (await db.query(`SELECT s.*,o.id AS oportunidade_id FROM agente_selecao s
      LEFT JOIN crm_oportunidades o ON o.selecao_id = s.id WHERE s.conversa_id = $1 ORDER BY s.atualizado_em DESC,s.id`, [c.id])).rows;
    return { selecao };
  });

  app.put('/api/agente/conversas/:id/selecao/:empresaId', async (req) => {
    req.exigir('triagem.decidir');
    const p = z.object({ turnoId: Id, versao: Versao, estado: z.enum(['investigar','priorizar','descartar']),
      justificativa: z.string().trim().min(3).max(2000) }).strict().parse(req.body);
    const empresaId = EmpresaId.parse(req.params.empresaId);
    // Permissão antes da transação: PGlite serializa as consultas de uma transação.
    await conversa(req, req.params.id, 'triagem.decidir');
    const selecao = await db.transaction(async (tx) => {
      const c = (await tx.query('SELECT * FROM agente_conversas WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      const turno = (await tx.query('SELECT * FROM agente_turnos WHERE id = $1 AND conversa_id = $2', [p.turnoId,c.id])).rows[0];
      const empresa = turno?.resultado.empresas?.find((e) => e.id === empresaId);
      if (!empresa) throw new ErroHttp(422, 'empresa_fora_do_resultado', 'Selecione uma empresa que conste no resultado deste trabalho.');
      const frente = turno.pedido.contexto.frente || 'venda';
      const anterior = (await tx.query('SELECT * FROM agente_selecao WHERE conversa_id = $1 AND empresa_id = $2 AND frente = $3', [c.id,empresaId,frente])).rows[0];
      if (anterior && anterior.estado === p.estado && anterior.justificativa === p.justificativa) return anterior;
      if ((anterior?.versao || 0) !== p.versao) throw conflito();
      const nova = anterior ? (await tx.query(`UPDATE agente_selecao SET estado = $2,justificativa = $3,
        versao = versao + 1,atualizado_em = now() WHERE id = $1 RETURNING *`, [anterior.id,p.estado,p.justificativa])).rows[0]
        : (await tx.query(`INSERT INTO agente_selecao (conversa_id,turno_id,empresa_id,empresa,fontes,frente,estado,justificativa)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [c.id,p.turnoId,empresaId,JSON.stringify(empresa),JSON.stringify(turno.resultado.fontes || []),frente,p.estado,p.justificativa])).rows[0];
      await registrar(tx, { usuarioId: req.usuario.id, mandatoId: c.mandato_id, entidade: 'agente_selecao', entidadeId: nova.id,
        acao: 'decidir', antes: anterior ? { estado: anterior.estado, justificativa: anterior.justificativa } : null,
        depois: { estado: p.estado, empresaId, frente }, justificativa: p.justificativa });
      return nova;
    });
    return { selecao };
  });

  app.post('/api/crm/oportunidades', async (req, res) => {
    req.exigir('crm.editar'); const p = Criacao.parse(req.body);
    const s = (await db.query('SELECT * FROM agente_selecao WHERE id = $1', [p.selecaoId])).rows[0];
    if (!s) throw naoEncontrado();
    const c = await conversa(req, s.conversa_id, 'crm.editar');
    const o = await db.transaction(async (tx) => {
      const atual = (await tx.query('SELECT * FROM agente_selecao WHERE id = $1 FOR UPDATE', [s.id])).rows[0];
      const anterior = (await tx.query('SELECT * FROM crm_oportunidades WHERE selecao_id = $1 OR id = $2', [s.id,p.id])).rows[0];
      if (anterior) {
        if (anterior.selecao_id !== s.id || anterior.criacao_hash !== hashDe(p)) throw new ErroHttp(409, 'oportunidade_ja_criada', 'Esta seleção já possui uma oportunidade ou o envio mudou. Atualize a lista e abra o registro existente.');
        return anterior;
      }
      if (atual.estado !== 'priorizar') throw new ErroHttp(422, 'revisao_necessaria', 'Priorize a empresa e registre o motivo antes de criar uma oportunidade.');
      const nova = (await tx.query(`INSERT INTO crm_oportunidades (id,selecao_id,criado_por,responsavel_id,mandato_id,empresa,fontes,frente,titulo,objetivo,proxima_acao,prazo,criacao_hash)
        VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [p.id,s.id,req.usuario.id,c.mandato_id,JSON.stringify(s.empresa),JSON.stringify(s.fontes),s.frente,p.titulo,p.objetivo,p.proximaAcao,p.prazo,hashDe(p)])).rows[0];
      await adicionarEvento(tx, req, nova, { ...p, chave: p.id }, 'criacao', 'Oportunidade identificada pela equipe.', { etapa: 'identificada', frente: s.frente });
      return nova;
    });
    return res.status(201).send({ oportunidade: await publicavel(o.id) });
  });

  app.get('/api/crm/oportunidades', async (req) => {
    const u = req.exigir('crm.ler');
    const q = z.object({ frente: z.enum(['compra','venda']).optional(), etapa: Etapa.optional(), busca: z.string().trim().max(120).default(''),
      pendentes: z.enum(['todas','atrasadas','minhas']).default('todas'), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().parse(req.query);
    const valores = [u.id,u.papel === 'admin',(u.mandatos || []).map((m) => m.id),q.frente || null,q.etapa || null,
      `%${q.busca.replace(/[\\%_]/g, '\\$&')}%`,q.pendentes,hoje()];
    const onde = `WHERE ((o.mandato_id IS NULL AND o.criado_por = $1) OR (o.mandato_id IS NOT NULL AND ($2 OR m.confidencial = FALSE OR o.mandato_id = ANY($3::uuid[]))))
      AND ($4::text IS NULL OR o.frente = $4) AND ($5::text IS NULL OR o.etapa = $5)
      AND (o.titulo ILIKE $6 OR o.empresa->>'nome' ILIKE $6 OR o.empresa->>'cnpjRaiz' ILIKE $6)
      AND ($7 = 'todas' OR (o.acao_concluida = FALSE AND o.etapa NOT IN ('mandato_assinado','perdida') AND
        (($7 = 'atrasadas' AND o.prazo < $8::date) OR ($7 = 'minhas' AND o.responsavel_id = $1))))`;
    const total = Number((await db.query(`SELECT count(*) n ${joins} ${onde}`, valores)).rows[0].n);
    const oportunidades = (await db.query(`SELECT ${campos} ${joins} ${onde} ORDER BY o.prazo,o.id LIMIT 30 OFFSET $9`, [...valores,q.offset])).rows;
    return { oportunidades, total, offset: q.offset, limite: 30, hoje: hoje(), etapas: ETAPAS };
  });

  app.get('/api/crm/oportunidades/:id', async (req) => {
    const o = await oportunidade(req, req.params.id);
    const m = o.mandato_id ? (await db.query('SELECT id,confidencial FROM mandatos WHERE id = $1', [o.mandato_id])).rows[0] : null;
    const permitido = (p) => m ? podeNoMandato(req.usuario,m,p) : pode(req.usuario.papel,p);
    const historico = (await db.query(`SELECT e.id,e.tipo,e.descricao,e.dados,e.ocorrido_em::text,e.criado_em,u.nome AS autor
      FROM crm_eventos e JOIN usuarios u ON u.id = e.usuario_id WHERE e.oportunidade_id = $1 ORDER BY e.criado_em DESC,e.id LIMIT 100`, [o.id])).rows;
    return { oportunidade: await publicavel(o.id), historico, etapas: ETAPAS, responsaveis: await participantes(req,o),
      permissoes: { editar: permitido('crm.editar'), mover: permitido('crm.mover') } };
  });

  app.patch('/api/crm/oportunidades/:id', async (req) => {
    const o = await oportunidade(req, req.params.id, 'crm.editar'); const p = Atualizacao.parse(req.body);
    if (!(await participantes(req,o)).some((u) => u.id === p.responsavelId)) throw new ErroHttp(422, 'responsavel_invalido', 'Escolha um responsável ativo com acesso de edição a este espaço.');
    await db.transaction(async (tx) => {
      const atual = (await tx.query('SELECT * FROM crm_oportunidades WHERE id = $1 FOR UPDATE', [o.id])).rows[0];
      if (await repetido(tx,o,p)) return;
      if (atual.versao !== p.versao) throw conflito();
      await tx.query(`UPDATE crm_oportunidades SET titulo=$2,objetivo=$3,proxima_acao=$4,prazo=$5,responsavel_id=$6,
        acao_concluida=$7,versao=versao+1,atualizado_em=now() WHERE id=$1`, [o.id,p.titulo,p.objetivo,p.proximaAcao,p.prazo,p.responsavelId,p.acaoConcluida]);
      await adicionarEvento(tx,req,o,p,'atualizacao','Dados e próximo passo atualizados.', {
        antes: { titulo: atual.titulo, objetivo: atual.objetivo, proximaAcao: atual.proxima_acao, prazo: dataTexto(atual.prazo), responsavelId: atual.responsavel_id, acaoConcluida: atual.acao_concluida },
        depois: { titulo: p.titulo, objetivo: p.objetivo, proximaAcao: p.proximaAcao, prazo: p.prazo, responsavelId: p.responsavelId, acaoConcluida: p.acaoConcluida },
      });
    });
    return { oportunidade: await publicavel(o.id) };
  });

  app.post('/api/crm/oportunidades/:id/atividades', async (req) => {
    const o = await oportunidade(req, req.params.id, 'crm.editar'); const p = Atividade.parse(req.body);
    if (p.etapa && p.etapa !== o.etapa) await oportunidade(req, o.id, 'crm.mover');
    await db.transaction(async (tx) => {
      const atual = (await tx.query('SELECT * FROM crm_oportunidades WHERE id = $1 FOR UPDATE', [o.id])).rows[0];
      if (await repetido(tx,o,p)) return;
      if (atual.versao !== p.versao) throw conflito();
      await tx.query('UPDATE crm_oportunidades SET etapa=$2,versao=versao+1,atualizado_em=now() WHERE id=$1', [o.id,p.etapa || atual.etapa]);
      await adicionarEvento(tx,req,o,p,'atividade',p.descricao, { etapaAnterior: atual.etapa, etapa: p.etapa || atual.etapa,
        canal: p.canal, participantes: p.participantes, referencia: p.referencia, motivo: p.motivo });
    });
    return { oportunidade: await publicavel(o.id) };
  });
}
