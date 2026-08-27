/* =============================================================================
 *  GHT4 · apoio aos testes do servidor
 * -----------------------------------------------------------------------------
 *  Cada teste ganha um banco PGlite EM MEMÓRIA, migrado do zero. Isolamento
 *  total: nenhum teste enxerga o estado do outro, e a ordem de execução deixa
 *  de importar.
 * ========================================================================== */

import { PGlite } from '@electric-sql/pglite';
import { migrar } from '../src/db/migrar.mjs';
import { derivar } from '../src/seguranca/senha.mjs';

/** Banco novo, migrado, em memória. */
export async function bancoDeTeste() {
  const db = await PGlite.create();
  await migrar(db, { silencioso: true });
  return db;
}

/** Cria um usuário e devolve a linha. */
export async function criarUsuario(db, {
  email, nome = 'Fulano de Teste', papel = 'analista', senha = null,
}) {
  let hash = null, sal = null;
  if (senha) ({ hash, sal } = await derivar(senha));

  const r = await db.query(
    `INSERT INTO usuarios (email, nome, papel, senha_hash, senha_sal)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, nome, papel, ativo`,
    [email, nome, papel, hash, sal],
  );
  return r.rows[0];
}

/** Cria um mandato e devolve a linha. */
export async function criarMandato(db, {
  codigo, rotulo = 'Mandato de teste', confidencial = true,
  setor = 'Químicos', subsetor = 'Distribuição e trading químico',
}) {
  const r = await db.query(
    `INSERT INTO mandatos (codigo, rotulo, confidencial, setor, subsetor)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, codigo, rotulo, confidencial, situacao`,
    [codigo, rotulo, confidencial, setor, subsetor],
  );
  return r.rows[0];
}

/** Põe um usuário dentro de um mandato. */
export async function darAcesso(db, mandatoId, usuarioId, papel = 'analista') {
  await db.query(
    `INSERT INTO mandato_membros (mandato_id, usuario_id, papel) VALUES ($1, $2, $3)`,
    [mandatoId, usuarioId, papel],
  );
}

/** Monta o objeto de usuário no formato que o RBAC espera. */
export async function comoUsuarioDoRbac(db, usuarioId) {
  const u = (await db.query(
    'SELECT id, email, nome, papel FROM usuarios WHERE id = $1', [usuarioId],
  )).rows[0];

  const m = await db.query(
    `SELECT m.id, m.confidencial, mm.papel
       FROM mandato_membros mm JOIN mandatos m ON m.id = mm.mandato_id
      WHERE mm.usuario_id = $1`,
    [usuarioId],
  );

  return { ...u, mandatos: m.rows.map((r) => ({ id: r.id, papel: r.papel })) };
}
