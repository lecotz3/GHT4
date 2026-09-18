import { abrir, urlBanco } from '../db/cliente.mjs';
import { criarApp } from '../app.mjs';
import { criarCatalogoBanco } from '../agente/catalogo-banco.mjs';
import { configurarIA, criarServicoIA } from '../agente/provedor.mjs';

export function origemVercel(env) {
  const host = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
  const origem = env.GHT4_ORIGEM_PUBLICA || (host ? `https://${host}` : null);
  const url = new URL(origem);
  if (url.protocol !== 'https:' || url.origin !== origem) throw new Error('Configure uma origem HTTPS válida.');
  return origem;
}

let pronta;
export function obterAppVercel() {
  if (!pronta) pronta = (async () => {
    if (!urlBanco() || process.env.GHT4_APENAS_LOCAL === '1' || process.env.PG_TLS_MODE === 'disable' || process.env.PGSSL_INSEGURO === '1') {
      throw new Error('A Vercel exige PostgreSQL externo com TLS validado.');
    }
    const db = await abrir();
    const app = await criarApp(db, { catalogo: criarCatalogoBanco(db),
      origemPublica: origemVercel(process.env),
      servicoIA: criarServicoIA(db, configurarIA(process.env)) });
    await app.ready();
    return app;
  })().catch(erro => { pronta = null; throw erro; });
  return pronta;
}

const MAX_CORPO = 4 * 1024 * 1024;
export function criarHandlerVercel(obterApp = obterAppVercel) {
  return async (req, res) => {
    try {
      let payload = req.body;
      if (payload === undefined && !['GET','HEAD'].includes(req.method)) {
        const partes = []; let tamanho = 0;
        for await (const parte of req) {
          const bytes = Buffer.isBuffer(parte) ? parte : Buffer.from(parte);
          tamanho += bytes.length;
          if (tamanho > MAX_CORPO) { res.statusCode = 413; res.end(); return; }
          partes.push(bytes);
        }
        if (tamanho) payload = Buffer.concat(partes);
      }
      const headers = { ...req.headers };
      // O runtime pode ter convertido o corpo em JSON; deixar Fastify recalcular o tamanho.
      delete headers['content-length']; delete headers['transfer-encoding'];
      const app = await obterApp();
      const resposta = await app.inject({ method: req.method, url: req.url,
        headers, payload, remoteAddress: req.socket?.remoteAddress || '127.0.0.1' });
      res.statusCode = resposta.statusCode;
      for (const [nome, valor] of Object.entries(resposta.headers)) res.setHeader(nome, valor);
      res.end(resposta.rawPayload);
    } catch (erro) {
      console.error('Falha na API GHT4:', erro.code ?? erro.name);
      res.statusCode = 503;
      res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
      res.end(JSON.stringify({erro:'servico_indisponivel',mensagem:'O agente está temporariamente indisponível. Tente novamente.'}));
    }
  };
}
