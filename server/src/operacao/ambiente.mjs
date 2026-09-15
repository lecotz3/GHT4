export function ambienteDoServidor(env = process.env) {
  const origemPublica = env.GHT4_ORIGEM_PUBLICA || (env.RENDER === 'true' ? env.RENDER_EXTERNAL_URL : undefined);
  const porta = Number(env.PORT || env.PORTA || 3311);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error('Porta HTTP inválida.');
  const catalogo = env.GHT4_CATALOGO_ORIGEM || (env.NODE_ENV === 'production' ? 'banco' : 'arquivo');
  if (!['banco','arquivo'].includes(catalogo)) throw new Error('Origem do catálogo inválida.');
  if (env.NODE_ENV === 'production' && catalogo !== 'banco') throw new Error('O catálogo de produção deve usar o banco.');
  return { porta, host: env.HOST || (env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1'), origemPublica, catalogo };
}
