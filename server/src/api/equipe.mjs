import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { derivar } from '../seguranca/senha.mjs';
import * as sessao from '../seguranca/sessao.mjs';
import { registrar } from '../auditoria/registrar.mjs';

const Id = z.string().uuid();
const Token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const hashDe = (token) => createHash('sha256').update(token).digest('hex');
const erroConvite = () => new ErroHttp(410, 'convite_indisponivel', 'Este convite expirou, foi cancelado ou já foi utilizado. Solicite um novo link ao administrador.');
const IDs = z.array(Id).max(50).refine((v) => new Set(v).size === v.length, 'Espaços repetidos.');

export async function registrarEquipe(app) {
  const { db } = app;
  async function conviteValido(tx, token, bloquear = false) {
    const c = (await tx.query(`SELECT id,nome,email,papel,expira_em FROM convites_equipe
      WHERE token_hash = $1 AND usado_em IS NULL AND revogado_em IS NULL AND expira_em > now()
      ${bloquear ? 'FOR UPDATE' : ''}`, [hashDe(Token.parse(token))])).rows[0];
    if (!c) throw erroConvite();
    return c;
  }

  app.get('/api/equipe', async (req) => {
    req.exigir('usuario.criar');
    const usuarios = (await db.query('SELECT id,nome,email,papel,ativo FROM usuarios ORDER BY nome,id')).rows;
    const espacos = (await db.query('SELECT id,codigo,rotulo,situacao FROM mandatos ORDER BY rotulo,id')).rows;
    const membros = (await db.query('SELECT mandato_id,usuario_id,papel FROM mandato_membros')).rows;
    const convites = (await db.query(`SELECT id,nome,email,papel,expira_em FROM convites_equipe
      WHERE usado_em IS NULL AND revogado_em IS NULL AND expira_em > now() ORDER BY criado_em DESC`)).rows;
    return { usuarios, espacos, membros, convites };
  });

  app.post('/api/equipe/convites', async (req, res) => {
    const u = req.exigir('usuario.criar');
    const p = z.object({ nome: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200).transform((v) => v.toLowerCase()),
      papel: z.enum(['socio', 'analista', 'leitura']), espacos: IDs.default([]) }).strict().parse(req.body);
    const token = randomBytes(32).toString('base64url');
    const convite = await db.transaction(async (tx) => {
      if ((await tx.query('SELECT id FROM usuarios WHERE lower(email) = $1', [p.email])).rows.length) {
        throw new ErroHttp(409, 'usuario_existente', 'Este e-mail já tem acesso. Use a lista da equipe para administrar a conta.');
      }
      const existentes = (await tx.query("SELECT id FROM mandatos WHERE id = ANY($1::uuid[]) AND situacao = 'ativo'", [p.espacos])).rows;
      if (existentes.length !== p.espacos.length) throw new ErroHttp(422, 'espaco_invalido', 'Um dos espaços não está disponível. Atualize a lista.');
      await tx.query('UPDATE convites_equipe SET revogado_em = now() WHERE lower(email) = $1 AND usado_em IS NULL AND revogado_em IS NULL', [p.email]);
      const c = (await tx.query(`INSERT INTO convites_equipe (token_hash,nome,email,papel,criado_por)
        VALUES ($1,$2,$3,$4,$5) RETURNING id,nome,email,papel,expira_em`, [hashDe(token),p.nome,p.email,p.papel,u.id])).rows[0];
      for (const id of p.espacos) await tx.query('INSERT INTO convite_espacos (convite_id,mandato_id) VALUES ($1,$2)', [c.id,id]);
      await registrar(tx, { usuarioId: u.id, entidade: 'convite', entidadeId: c.id, acao: 'criar', depois: { email: p.email, papel: p.papel, espacos: p.espacos } });
      return c;
    }).catch((erro) => {
      if (erro.code === '23505') throw new ErroHttp(409, 'convite_em_atualizacao', 'Outro convite foi criado para este e-mail. Atualize a lista antes de tentar novamente.');
      throw erro;
    });
    res.header('Cache-Control', 'no-store');
    return res.status(201).send({ convite, token });
  });

  app.delete('/api/equipe/convites/:id', async (req) => {
    const u = req.exigir('usuario.criar'); const id = Id.parse(req.params.id);
    await db.transaction(async (tx) => {
      const r = await tx.query('UPDATE convites_equipe SET revogado_em = now() WHERE id = $1 AND revogado_em IS NULL AND usado_em IS NULL RETURNING id', [id]);
      if (r.rows.length) await registrar(tx, { usuarioId: u.id, entidade: 'convite', entidadeId: id, acao: 'revogar' });
    });
    return { cancelado: true };
  });

  app.post('/api/convites/consultar', async (req, res) => {
    const { token } = z.object({ token: Token }).strict().parse(req.body);
    res.header('Cache-Control', 'no-store');
    return { convite: await conviteValido(db, token) };
  });

  app.post('/api/convites/aceitar', async (req, res) => {
    const { token, senha } = z.object({ token: Token, senha: z.string().min(12).max(256) }).strict().parse(req.body);
    await conviteValido(db, token);
    const { hash, sal } = await derivar(senha);
    const u = await db.transaction(async (tx) => {
      const c = await conviteValido(tx, token, true);
      if ((await tx.query('SELECT id FROM usuarios WHERE lower(email) = lower($1)', [c.email])).rows.length) {
        throw new ErroHttp(409, 'usuario_existente', 'Já existe uma conta para este e-mail. Faça login.');
      }
      const usuario = (await tx.query(`INSERT INTO usuarios (nome,email,papel,senha_hash,senha_sal)
        VALUES ($1,$2,$3,$4,$5) RETURNING id,nome,email,papel`, [c.nome,c.email,c.papel,hash,sal])).rows[0];
      await tx.query(`INSERT INTO mandato_membros (mandato_id,usuario_id,papel)
        SELECT mandato_id,$2,$3 FROM convite_espacos WHERE convite_id = $1`, [c.id,usuario.id,c.papel]);
      await tx.query('UPDATE convites_equipe SET usado_em = now(), usuario_criado = $2 WHERE id = $1', [c.id,usuario.id]);
      await registrar(tx, { usuarioId: usuario.id, entidade: 'convite', entidadeId: c.id, acao: 'aceitar', depois: { usuarioId: usuario.id } });
      return usuario;
    });
    const s = await sessao.criar(db, { usuarioId: u.id, ip: req.ip, agente: req.headers['user-agent'] ?? null });
    res.setCookie(sessao.NOME_COOKIE, s.token, sessao.opcoesDoCookie({ expiraEm: s.expiraEm }));
    res.header('Cache-Control', 'no-store');
    return res.status(201).send(u);
  });

  app.patch('/api/equipe/usuarios/:id', async (req) => {
    const u = req.exigir('usuario.desativar'); const id = Id.parse(req.params.id);
    const { ativo } = z.object({ ativo: z.boolean() }).strict().parse(req.body);
    if (id === u.id) throw new ErroHttp(422, 'propria_conta', 'Você não pode suspender seu próprio acesso.');
    await db.transaction(async (tx) => {
      const usuario = (await tx.query('SELECT id,ativo,papel FROM usuarios WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!usuario) throw new ErroHttp(404, 'usuario_inexistente', 'Membro não encontrado.');
      if (usuario.papel === 'admin') throw new ErroHttp(422, 'conta_administradora', 'A gestão de outros administradores exige um procedimento próprio.');
      if (usuario.ativo === ativo) return;
      await tx.query('UPDATE usuarios SET ativo = $2, atualizado_em = now() WHERE id = $1', [id,ativo]);
      if (!ativo) await tx.query('UPDATE sessoes SET encerrada_em = now() WHERE usuario_id = $1 AND encerrada_em IS NULL', [id]);
      await registrar(tx, { usuarioId: u.id, entidade: 'usuario', entidadeId: id, acao: ativo ? 'reativar' : 'suspender', antes: { ativo: usuario.ativo }, depois: { ativo } });
    });
    return { atualizado: true };
  });

  app.post('/api/equipe/espacos', async (req, res) => {
    const u = req.exigir('mandato.criar');
    const p = z.object({ rotulo: z.string().trim().min(2).max(120) }).strict().parse(req.body);
    const espaco = await db.transaction(async (tx) => {
      const m = (await tx.query(`INSERT INTO mandatos (codigo,rotulo,setor,subsetor,confidencial,criado_por)
        VALUES ($1,$2,'Químicos','Distribuição e trading químico',TRUE,$3) RETURNING id,codigo,rotulo,situacao`,
        [`QUIM-${randomUUID().slice(0,8).toUpperCase()}`,p.rotulo,u.id])).rows[0];
      await tx.query("INSERT INTO mandato_membros (mandato_id,usuario_id,papel) VALUES ($1,$2,'admin')", [m.id,u.id]);
      await registrar(tx, { usuarioId: u.id, mandatoId: m.id, entidade: 'mandato', entidadeId: m.id, acao: 'criar', depois: { rotulo: p.rotulo } });
      return m;
    });
    return res.status(201).send({ espaco });
  });

  app.put('/api/equipe/espacos/:id/membros/:usuarioId', async (req) => {
    req.exigir('usuario.editar');
    const { usuario: admin } = await req.exigirNoMandato(Id.parse(req.params.id), 'mandato.membros');
    const { participa } = z.object({ participa: z.boolean() }).strict().parse(req.body);
    const id = Id.parse(req.params.usuarioId); const mandatoId = req.params.id;
    await db.transaction(async (tx) => {
      const u = (await tx.query('SELECT id,papel,ativo FROM usuarios WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!u) throw new ErroHttp(404, 'usuario_inexistente', 'Membro não encontrado.');
      if (u.papel === 'admin') throw new ErroHttp(422, 'admin_global', 'Administradores já têm acesso aos espaços pela função de administração.');
      const anterior = (await tx.query('SELECT papel FROM mandato_membros WHERE mandato_id = $1 AND usuario_id = $2', [mandatoId,id])).rows[0];
      if (Boolean(anterior) === participa) return;
      if (participa) await tx.query('INSERT INTO mandato_membros (mandato_id,usuario_id,papel,criado_por) VALUES ($1,$2,$3,$4)', [mandatoId,id,u.papel,admin.id]);
      else await tx.query('DELETE FROM mandato_membros WHERE mandato_id = $1 AND usuario_id = $2', [mandatoId,id]);
      await registrar(tx, { usuarioId: admin.id, mandatoId, entidade: 'mandato_membro', entidadeId: id,
        acao: participa ? 'conceder_acesso' : 'retirar_acesso', antes: { participa: Boolean(anterior) }, depois: { participa } });
    });
    return { atualizado: true };
  });
}
