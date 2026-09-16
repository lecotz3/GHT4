import { administrarAcesso } from './acesso.mjs';

// Somente no comando de preparação, com acesso aos segredos da hospedagem.
// Nunca redefine uma conta existente nem habilita bootstrap público.
export async function prepararAdministrador(db, env) {
  // Alias do segredo inicial já cadastrado pelo administrador na Vercel.
  const email = env.GHT4_ADMIN_EMAIL, senha = env.GHT4_ADMIN_SENHA_INICIAL || env.ght4;
  if (!email && !senha) return { configurado: false };
  const total = Number((await db.query('SELECT count(*) AS n FROM usuarios')).rows[0].n);
  if (total) return { configurado: true, criado: false };
  if (!email || !senha) throw new Error('Configure e-mail e senha inicial do administrador juntos.');
  await administrarAcesso(db, {acao:'iniciar',email,senha,nome:env.GHT4_ADMIN_NOME || 'Administrador GHT4'});
  return { configurado: true, criado: true };
}
