/* =============================================================================
 *  GHT4 · sessões
 * -----------------------------------------------------------------------------
 *  Sessão opaca em cookie, com o HASH do token no banco — nunca o token.
 *
 *  POR QUE NÃO JWT
 *  JWT não se revoga sem manter uma lista de revogados, que é justamente a
 *  tabela de sessões que se queria evitar. Aqui revogar é um UPDATE, e num
 *  produto que carrega mandato confidencial "tirar o acesso agora" precisa ser
 *  imediato e verificável.
 *
 *  POR QUE GUARDAR O HASH
 *  Se o banco vazar, as sessões ativas não viram chaves de entrada. É a mesma
 *  razão de não guardar senha em claro, aplicada ao token.
 * ========================================================================== */

import crypto from 'node:crypto';
import { consultarUm } from '../db/cliente.mjs';

const BYTES_TOKEN = 32;
export const NOME_COOKIE = 'ght4_sessao';
const DURACAO_PADRAO_H = 12;

/** Hash do token. SHA-256 basta: o token já é aleatório de 256 bits. */
export function hashDoToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Abre sessão e devolve o token EM CLARO — a única vez que ele existe fora do
 * navegador. Quem chama põe no cookie e esquece.
 */
export async function criar(db, { usuarioId, ip = null, agente = null, horas = DURACAO_PADRAO_H }) {
  const token = crypto.randomBytes(BYTES_TOKEN).toString('base64url');
  const expiraEm = new Date(Date.now() + horas * 3600_000);

  await db.query(
    `INSERT INTO sessoes (usuario_id, token_hash, expira_em, ip, agente)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuarioId, hashDoToken(token), expiraEm, ip, agente],
  );

  return { token, expiraEm };
}

/**
 * Resolve o token no usuário, já com os mandatos de que ele participa.
 *
 * Devolve `null` para token inválido, expirado, encerrado ou de usuário
 * desativado — todos os casos indistinguíveis de fora, de propósito.
 */
export async function resolver(db, token) {
  if (typeof token !== 'string' || token.length < 20) return null;

  const linha = await consultarUm(
    db,
    `SELECT s.id AS sessao_id, s.expira_em,
            u.id, u.email, u.nome, u.papel, u.ativo
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1
        AND s.encerrada_em IS NULL
        AND s.expira_em > now()`,
    [hashDoToken(token)],
  );

  if (!linha || !linha.ativo) return null;

  const mandatos = await db.query(
    `SELECT m.id, m.codigo, m.rotulo, m.confidencial, mm.papel
       FROM mandato_membros mm
       JOIN mandatos m ON m.id = mm.mandato_id
      WHERE mm.usuario_id = $1 AND m.situacao = 'ativo'`,
    [linha.id],
  );

  return {
    id: linha.id,
    email: linha.email,
    nome: linha.nome,
    papel: linha.papel,
    sessaoId: linha.sessao_id,
    expiraEm: linha.expira_em,
    mandatos: mandatos.rows.map((m) => ({
      id: m.id, codigo: m.codigo, rotulo: m.rotulo,
      confidencial: m.confidencial, papel: m.papel,
    })),
  };
}

/** Encerra uma sessão. Idempotente: encerrar duas vezes não é erro. */
export async function encerrar(db, token) {
  await db.query(
    `UPDATE sessoes SET encerrada_em = now()
      WHERE token_hash = $1 AND encerrada_em IS NULL`,
    [hashDoToken(token)],
  );
}

/**
 * Encerra TODAS as sessões de um usuário.
 * É o que se chama ao desativar alguém ou ao trocar senha — sem isso, tirar o
 * acesso não tira o acesso de quem já está dentro.
 */
export async function encerrarTodasDe(db, usuarioId) {
  const r = await db.query(
    `UPDATE sessoes SET encerrada_em = now()
      WHERE usuario_id = $1 AND encerrada_em IS NULL`,
    [usuarioId],
  );
  return r.affectedRows ?? 0;
}

/** Remove sessões vencidas há mais de 30 dias. Roda por job. */
export async function limparVencidas(db) {
  const r = await db.query(
    `DELETE FROM sessoes WHERE expira_em < now() - INTERVAL '30 days'`,
  );
  return r.affectedRows ?? 0;
}

/** Opções de cookie. `secure` só fora de desenvolvimento — em localhost não há TLS. */
export function opcoesDoCookie({ producao = process.env.NODE_ENV === 'production', expiraEm } = {}) {
  return {
    httpOnly: true,      // JavaScript da página não lê: reduz o estrago de um XSS
    sameSite: 'lax',     // corta CSRF em navegação de terceiro
    secure: producao,    // só trafega em HTTPS quando há HTTPS
    path: '/',
    expires: expiraEm,
  };
}
