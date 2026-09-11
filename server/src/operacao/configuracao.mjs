export function validarOperacao(env) {
  if(env.NODE_ENV!=='production')return;
  const erros=[];
  if(!env.DATABASE_URL || env.GHT4_APENAS_LOCAL==='1' || env.GHT4_MEMORIA==='1')erros.push('Postgres persistente é obrigatório em produção.');
  if(!env.GHT4_SERVIR_INTERFACE)erros.push('Defina GHT4_SERVIR_INTERFACE com o diretório do build.');
  try { const u=new URL(env.GHT4_ORIGEM_PUBLICA);if(u.protocol!=='https:' || u.origin!==env.GHT4_ORIGEM_PUBLICA)throw new Error(); }
  catch { erros.push('Defina GHT4_ORIGEM_PUBLICA como a origem HTTPS, sem caminho nem barra final.'); }
  if(env.GHT4_CONFIGURACAO_INICIAL==='1')erros.push('Configure o primeiro administrador pelo comando local; bootstrap HTTP fica fechado em produção.');
  if(env.PGSSL_INSEGURO==='1')erros.push('Não desabilite a validação do certificado do banco em produção.');
  if(erros.length)throw new Error(erros.join(' '));
}
