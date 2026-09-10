import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { derivar } from '../seguranca/senha.mjs';
import { registrar } from '../auditoria/registrar.mjs';

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export async function registrarInstalacao(app, { habilitada = false } = {}) {
  const disponivel = async (req) => habilitada && LOCAL.has(req.ip)
    && Number((await app.db.query('SELECT count(*) AS n FROM usuarios')).rows[0].n) === 0;
  app.get('/api/instalacao', async (req) => ({ disponivel: await disponivel(req) }));
  app.post('/api/instalacao', async (req, res) => {
    if (!await disponivel(req)) throw new ErroHttp(403, 'instalacao_fechada', 'A configuração inicial não está disponível.');
    const p = z.object({ nome: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200),
      senha: z.string().min(12).max(256) }).strict().parse(req.body);
    const { hash, sal } = await derivar(p.senha);
    await app.db.transaction(async (tx) => {
      const reserva = await tx.query('INSERT INTO instalacao_inicial (id) VALUES (1) ON CONFLICT DO NOTHING RETURNING id');
      if (!reserva.rows.length || Number((await tx.query('SELECT count(*) AS n FROM usuarios')).rows[0].n) > 0) {
        throw new ErroHttp(409, 'instalacao_concluida', 'A configuração inicial já foi concluída. Faça login.');
      }
      const u = (await tx.query(
        `INSERT INTO usuarios (nome,email,papel,senha_hash,senha_sal) VALUES ($1,$2,'admin',$3,$4) RETURNING id`,
        [p.nome, p.email.toLowerCase(), hash, sal])).rows[0];
      const m = (await tx.query(
        `INSERT INTO mandatos (codigo,rotulo,setor,subsetor,criado_por) VALUES
         ('PILOTO-QUIMICOS','Piloto de prospecção química','Químicos','Distribuição e trading químico',$1) RETURNING id`, [u.id])).rows[0];
      await tx.query("INSERT INTO mandato_membros (mandato_id,usuario_id,papel) VALUES ($1,$2,'admin')", [m.id, u.id]);
      await registrar(tx, { usuarioId: u.id, entidade: 'instalacao', entidadeId: '1', acao: 'configurar', depois: { piloto: m.id } });
    });
    return res.status(201).send({ criada: true });
  });
}
