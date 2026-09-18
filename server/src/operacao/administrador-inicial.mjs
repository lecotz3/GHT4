import { administrarAcesso } from './acesso.mjs';

// Somente no comando de preparação, com acesso aos segredos da hospedagem.
// Nunca redefine uma conta existente nem habilita bootstrap público.
export async function prepararAdministrador(db, env) {
  // Alias do segredo inicial já cadastrado pelo administrador na Vercel.
  const email = env.GHT4_ADMIN_EMAIL, senha = env.GHT4_ADMIN_SENHA_INICIAL || env.ght4;
  const redefinir = env.GHT4_ADMIN_SENHA_REDEFINIR;
  if (!email && !senha && !redefinir) return { configurado: false };
  const total = Number((await db.query('SELECT count(*) AS n FROM usuarios')).rows[0].n);
  if (total) {
    if (!redefinir) return { configurado: true, criado: false };
    /* Recuperação de última instância. A conta administradora é a única que o
       produto não redefine por dentro — quem perde a senha dela perde o console
       inteiro, e o banco fica fora de alcance quando a hospedagem guarda a
       connection string como segredo ilegível. Variável separada do segredo de
       bootstrap de propósito: aquele fica esquecido no ambiente com frequência e
       não pode virar uma redefinição silenciosa a cada build. Esta continua
       valendo enquanto estiver presente, então sai do ambiente logo em seguida. */
    if (!email) throw new Error('Para redefinir, configure GHT4_ADMIN_EMAIL junto com GHT4_ADMIN_SENHA_REDEFINIR.');
    await administrarAcesso(db, { acao: 'redefinir', email, senha: redefinir });
    return { configurado: true, criado: false, redefinido: true };
  }
  if (!email || !senha) throw new Error('Configure e-mail e senha inicial do administrador juntos.');
  await administrarAcesso(db, {acao:'iniciar',email,senha,nome:env.GHT4_ADMIN_NOME || 'Administrador GHT4'});
  return { configurado: true, criado: true };
}
