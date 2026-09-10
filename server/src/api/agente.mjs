import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { criarCatalogo } from '../agente/catalogo.mjs';
import { TAREFAS, executarTarefa, complementarComIA } from '../agente/tarefas.mjs';

const Id = z.string().uuid();
const Contexto = z.object({
  frente: z.enum(['compra', 'venda']).optional(),
  objetivo: z.string().trim().max(2000).optional(),
  busca: z.string().trim().max(120).optional(),
  uf: z.string().regex(/^$|^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/).optional(),
  incluirPossiveis: z.boolean().optional(),
  empresaId: z.string().regex(/^cnpj\d{8}$/).nullable().optional(),
}).strict();
const Pedido = z.object({
  chave: Id, versao: z.number().int().min(0),
  tarefa: z.enum(TAREFAS.map((t) => t.id)),
  texto: z.string().trim().max(4000).default(''),
  contexto: Contexto.default({}),
}).strict().refine((p) => p.tarefa !== 'registrar_passo' || p.texto.length > 0,
  { message: 'Descreva o próximo passo.', path: ['texto'] });

export async function registrarRotasDoAgente(app, { catalogo = criarCatalogo(), redigirIA = null } = {}) {
  const { db } = app;

  async function autorizar(req, id, permissao = 'agente.ler') {
    const usuario = req.exigir(permissao);
    const conversa = (await db.query('SELECT * FROM agente_conversas WHERE id = $1 AND usuario_id = $2',
      [Id.parse(id), usuario.id])).rows[0];
    if (!conversa) throw new ErroHttp(404, 'trabalho_inexistente', 'Trabalho não encontrado.');
    if (conversa.mandato_id) await req.exigirNoMandato(conversa.mandato_id, permissao);
    return conversa;
  }

  const acoesDe = async (id) => (await db.query(
    'SELECT * FROM agente_acoes WHERE conversa_id = $1 ORDER BY criado_em, id', [id])).rows;

  app.get('/api/agente', async (req) => {
    req.exigir('agente.ler');
    let base;
    try {
      const r = await catalogo.buscar({ limite: 0 });
      base = { disponivel: true, total: r.total, referencia: r.referencia };
    } catch { base = { disponivel: false, mensagem: 'A base de empresas não está disponível. As ações e o histórico continuam acessíveis.' }; }
    return { tarefas: TAREFAS, iaConfigurada: Boolean(redigirIA), base };
  });

  app.get('/api/agente/empresas', async (req) => {
    req.exigir('agente.ler');
    const filtros = z.object({ busca: z.string().max(120).default(''), uf: Contexto.shape.uf,
      limite: z.coerce.number().int().min(1).max(30).default(12),
      incluirPossiveis: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    }).parse(req.query);
    try { return await catalogo.buscar(filtros); }
    catch { throw new ErroHttp(503, 'base_indisponivel', 'Não foi possível consultar a base. Tente novamente ou continue pelas pendências.'); }
  });

  app.get('/api/agente/conversas', async (req) => {
    const u = req.exigir('agente.ler');
    const conversas = (await db.query(
      `SELECT c.id, c.titulo, c.contexto, c.mandato_id, c.versao, c.atualizado_em
       FROM agente_conversas c LEFT JOIN mandatos m ON m.id = c.mandato_id
       WHERE c.usuario_id = $1 AND (c.mandato_id IS NULL OR $2 OR m.confidencial = FALSE
         OR c.mandato_id = ANY($3::uuid[]))
       ORDER BY c.atualizado_em DESC, c.id LIMIT 100`,
      [u.id, u.papel === 'admin', (u.mandatos ?? []).map((m) => m.id)])).rows;
    return { conversas };
  });

  app.post('/api/agente/conversas', async (req, res) => {
    const u = req.exigir('agente.usar');
    const p = z.object({ id: Id, titulo: z.string().trim().min(1).max(120),
      mandatoId: Id.nullable().default(null), contexto: Contexto.default({}),
    }).strict().parse(req.body);
    if (p.mandatoId) await req.exigirNoMandato(p.mandatoId, 'agente.usar');
    const conversa = await db.transaction(async (tx) => {
      const r = (await tx.query(
        `INSERT INTO agente_conversas (id, usuario_id, mandato_id, titulo, contexto)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING RETURNING *`,
        [p.id, u.id, p.mandatoId, p.titulo, JSON.stringify(p.contexto)])).rows[0];
      if (!r) {
        const anterior = (await tx.query('SELECT * FROM agente_conversas WHERE id = $1 AND usuario_id = $2', [p.id, u.id])).rows[0];
        if (!anterior || anterior.titulo !== p.titulo || anterior.mandato_id !== p.mandatoId) {
          throw new ErroHttp(409, 'trabalho_ja_existe', 'Não foi possível criar este trabalho. Atualize a lista e tente novamente.');
        }
        return anterior;
      }
      await registrar(tx, { usuarioId: u.id, mandatoId: p.mandatoId, entidade: 'agente_conversa',
        entidadeId: p.id, acao: 'criar', depois: { titulo: p.titulo } });
      return r;
    });
    return res.status(201).send({ conversa });
  });

  app.get('/api/agente/conversas/:id', async (req) => {
    const conversa = await autorizar(req, req.params.id);
    const turnos = (await db.query(
      'SELECT id, numero, pedido, resultado, criado_em FROM agente_turnos WHERE conversa_id = $1 ORDER BY numero DESC LIMIT 50',
      [conversa.id])).rows.reverse();
    return { conversa, turnos, acoes: await acoesDe(conversa.id) };
  });

  app.post('/api/agente/conversas/:id/mensagens', async (req) => {
    const conversa = await autorizar(req, req.params.id, 'agente.usar');
    const p = Pedido.parse(req.body);
    const hash = createHash('sha256').update(JSON.stringify(p)).digest('hex');
    const anterior = (await db.query('SELECT * FROM agente_turnos WHERE conversa_id = $1 AND chave = $2', [conversa.id, p.chave])).rows[0];
    if (anterior) {
      if (anterior.corpo_hash !== hash) throw new ErroHttp(409, 'pedido_diferente', 'Este envio já foi usado com outro conteúdo.');
      return { turno: anterior, conversa, acoes: await acoesDe(conversa.id) };
    }
    if (conversa.versao !== p.versao) throw new ErroHttp(409, 'trabalho_atualizado', 'O trabalho mudou em outra aba. Reabra-o antes de enviar.');
    const contexto = { ...conversa.contexto, ...p.contexto };
    if (p.texto && ['buscar_empresas', 'preparar_reuniao'].includes(p.tarefa)) contexto.objetivo = p.texto.slice(0, 2000);
    const acoes = await acoesDe(conversa.id);
    let resultado;
    try { resultado = await executarTarefa({ ...p, contexto, catalogo, acoes }); }
    catch { throw new ErroHttp(503, 'base_indisponivel', 'A base não pôde ser consultada. Seu pedido não foi perdido; tente novamente.'); }
    resultado = await complementarComIA(resultado, { ...p, contexto }, redigirIA);
    // O provedor não decide permissões, cálculos nem gravações. Revalida o escopo antes da escrita.
    await autorizar(req, conversa.id, 'agente.usar');
    const salvo = await db.transaction(async (tx) => {
      const atual = (await tx.query('SELECT * FROM agente_conversas WHERE id = $1 FOR UPDATE', [conversa.id])).rows[0];
      const repetido = (await tx.query('SELECT * FROM agente_turnos WHERE conversa_id = $1 AND chave = $2', [conversa.id, p.chave])).rows[0];
      if (repetido) {
        if (repetido.corpo_hash !== hash) throw new ErroHttp(409, 'pedido_diferente', 'Este envio já foi usado com outro conteúdo.');
        return { turno: repetido, conversa: atual };
      }
      if (atual.versao !== p.versao) throw new ErroHttp(409, 'trabalho_atualizado', 'O trabalho mudou em outra aba. Reabra-o antes de enviar.');
      const turno = (await tx.query(
        `INSERT INTO agente_turnos (conversa_id, chave, corpo_hash, numero, pedido, resultado)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [conversa.id, p.chave, hash, p.versao + 1,
          JSON.stringify({ tarefa: p.tarefa, texto: p.texto, contexto }), JSON.stringify(resultado)])).rows[0];
      if (p.tarefa === 'registrar_passo') await tx.query(
        'INSERT INTO agente_acoes (conversa_id, turno_id, descricao) VALUES ($1,$2,$3)', [conversa.id, turno.id, p.texto]);
      const nova = (await tx.query(
        'UPDATE agente_conversas SET contexto = $2, versao = versao + 1, atualizado_em = now() WHERE id = $1 RETURNING *',
        [conversa.id, JSON.stringify(contexto)])).rows[0];
      await registrar(tx, { usuarioId: req.usuario.id, mandatoId: conversa.mandato_id, entidade: 'agente_conversa',
        entidadeId: conversa.id, acao: 'executar_tarefa', depois: { tarefa: p.tarefa, turno: turno.id }, runId: p.chave });
      return { conversa: nova, turno };
    });
    return { ...salvo, acoes: await acoesDe(conversa.id) };
  });

  app.patch('/api/agente/conversas/:id/acoes/:acaoId', async (req) => {
    const conversa = await autorizar(req, req.params.id, 'agente.usar');
    const { concluida } = z.object({ concluida: z.boolean() }).strict().parse(req.body);
    const id = Id.parse(req.params.acaoId);
    await db.transaction(async (tx) => {
      const antes = (await tx.query('SELECT * FROM agente_acoes WHERE id = $1 AND conversa_id = $2 FOR UPDATE', [id, conversa.id])).rows[0];
      if (!antes) throw new ErroHttp(404, 'acao_inexistente', 'Ação não encontrada.');
      if (antes.concluida === concluida) return;
      await tx.query('UPDATE agente_acoes SET concluida = $2, atualizado_em = now() WHERE id = $1', [id, concluida]);
      await tx.query('UPDATE agente_conversas SET atualizado_em = now() WHERE id = $1', [conversa.id]);
      await registrar(tx, { usuarioId: req.usuario.id, mandatoId: conversa.mandato_id, entidade: 'agente_acao',
        entidadeId: id, acao: concluida ? 'concluir' : 'reabrir', antes: { concluida: antes.concluida }, depois: { concluida } });
    });
    return { acoes: await acoesDe(conversa.id) };
  });
}
