/* =============================================================================
 *  GHT4 · aplicação HTTP
 * -----------------------------------------------------------------------------
 *  Fastify, cookie de sessão e três decorações que toda rota usa:
 *
 *    req.usuario                 quem está falando, ou null
 *    req.exigirAutenticado()     401 se não houver ninguém
 *    req.exigir(permissao)       403 se o papel não permite
 *    req.exigirNoMandato(id, p)  403 se o papel não permite OU não participa
 *
 *  NEGA POR PADRÃO
 *  Rota que não chama nenhuma das três é rota pública, e isso tem de ser uma
 *  decisão visível. `tests/api.test.mjs` varre as rotas registradas e reprova
 *  qualquer uma que não esteja na lista explícita de públicas — assim esquecer
 *  a verificação vira teste vermelho, não vazamento.
 * ========================================================================== */

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { z } from 'zod';

import * as sessao from './seguranca/sessao.mjs';
import { pode, podeNoMandato } from './seguranca/rbac.mjs';
import { consultarUm } from './db/cliente.mjs';
import { registrarRotasDeTemplate } from './api/templates.mjs';
import { registrarRotasDoAgente } from './api/agente.mjs';
import { registrarInstalacao } from './api/instalacao.mjs';
import { registrarEquipe } from './api/equipe.mjs';
import { registrarProspeccao } from './api/prospeccao.mjs';
import { registrarAcervo } from './api/acervo.mjs';
import { registrarDocumentos } from './api/documentos.mjs';
import { registrarExportacoes } from './api/exportacoes.mjs';
import { registrarOperacao } from './api/operacao.mjs';
import { limitarAcesso } from './operacao/limites.mjs';

/** Erro que vira resposta HTTP em vez de 500. */
export class ErroHttp extends Error {
  constructor(status, codigo, mensagem, detalhe = null) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhe = detalhe;
  }
}

/** Rotas que podem ser acessadas sem sessão. Lista fechada, e é de propósito. */
export const ROTAS_PUBLICAS = Object.freeze([
  'POST /api/sessao',
  'GET /api/saude',
  'GET /api/instalacao',
  'POST /api/instalacao',
  'POST /api/convites/consultar',
  'POST /api/convites/aceitar',
]);

export async function criarApp(db, { logger = false, instalacaoInicial = false, catalogo, redigirIA = null, servicoIA = null, origemPublica = null } = {}) {
  const app = Fastify({
    logger,
    /* O corpo cru é preciso para o hash de idempotência: dois JSON iguais podem
       ter bytes diferentes, e o hash tem de ser do que o cliente mandou. */
    bodyLimit: 4 * 1024 * 1024,
  });

  await app.register(cookie);

  app.addHook('onRequest',async(req,res)=>{
    if(req.url.startsWith('/api/'))res.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff');
    if(origemPublica && !['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin!==origemPublica) {
      throw new ErroHttp(403,'origem_invalida','A origem desta requisição não é autorizada.');
    }
  });

  app.decorate('db', db);
  limitarAcesso(app);

  /* ---- quem está falando -------------------------------------------------- */
  app.decorateRequest('usuario', null);

  app.decorateRequest('revalidarSessao', async function () {
    const token = this.cookies?.[sessao.NOME_COOKIE];
    this.usuario = token ? await sessao.resolver(db, token) : null;
  });

  app.addHook('onRequest', async (req) => {
    const token = req.cookies?.[sessao.NOME_COOKIE];
    req.usuario = token ? await sessao.resolver(db, token) : null;
  });

  app.decorateRequest('exigirAutenticado', function () {
    if (!this.usuario) throw new ErroHttp(401, 'nao_autenticado', 'Faça login para continuar.');
    return this.usuario;
  });

  app.decorateRequest('exigir', function (permissao) {
    const u = this.exigirAutenticado();
    if (!pode(u.papel, permissao)) {
      throw new ErroHttp(403, 'sem_permissao', `Seu papel não permite "${permissao}".`);
    }
    return u;
  });

  /**
   * A checagem que rota de mandato deve usar: junta papel e participação.
   * Devolve 404, e não 403, para mandato que o usuário não alcança — responder
   * "existe, mas você não pode" já entrega que aquele mandato existe.
   */
  app.decorateRequest('exigirNoMandato', async function (mandatoId, permissao) {
    const u = this.exigirAutenticado();
    const mandato = await consultarUm(
      db,
      'SELECT id, codigo, rotulo, confidencial, situacao FROM mandatos WHERE id = $1',
      [mandatoId],
    );
    if (!mandato) throw new ErroHttp(404, 'mandato_inexistente', 'Mandato não encontrado.');

    if (!podeNoMandato(u, mandato, permissao)) {
      const participa = (u.mandatos ?? []).some((m) => m.id === mandato.id) || u.papel === 'admin';
      if (!participa) {
        throw new ErroHttp(404, 'mandato_inexistente', 'Mandato não encontrado.');
      }
      throw new ErroHttp(403, 'sem_permissao', `Seu papel neste mandato não permite "${permissao}".`);
    }
    return { usuario: u, mandato };
  });

  /* ---- respostas de erro, sem vazar interno ------------------------------- */
  app.setErrorHandler((erro, req, resposta) => {
    if (erro.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return resposta.status(413).send({erro:'arquivo_excessivo',mensagem:'O envio excede o limite permitido. Documentos devem ter até 2 MB.'});
    if (erro instanceof ErroHttp) {
      return resposta.status(erro.status).send({
        erro: erro.codigo, mensagem: erro.message, detalhe: erro.detalhe,
      });
    }
    if (erro instanceof z.ZodError) {
      return resposta.status(422).send({
        erro: 'corpo_invalido',
        mensagem: `Confira os campos: ${erro.issues.slice(0,3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        detalhe: erro.issues.map((i) => ({ campo: i.path.join('.'), problema: i.message })),
      });
    }
    /* Erro não previsto: registra inteiro no log, devolve genérico. Mensagem de
       exceção costuma carregar caminho de arquivo e trecho de SQL. */
    req.log?.error({ erro }, 'erro não tratado');
    return resposta.status(500).send({
      erro: 'erro_interno', mensagem: 'Algo falhou aqui dentro. O incidente foi registrado.',
    });
  });

  app.get('/api/saude', async () => {
    await db.query('SELECT 1');
    return { ok: true, agora: new Date().toISOString() };
  });

  await app.register(registrarRotasDeSessao);
  await app.register(registrarRotasDeMandato);
  await app.register(registrarRotasDeTemplate);
  await app.register(registrarInstalacao, { habilitada: instalacaoInicial });
  await app.register(registrarRotasDoAgente, { catalogo, redigirIA, servicoIA });
  await app.register(registrarEquipe);
  await app.register(registrarProspeccao);
  await app.register(registrarAcervo);
  await app.register(registrarDocumentos);
  await app.register(registrarExportacoes);
  await app.register(registrarOperacao, { servicoIA });

  return app;
}

/* ---------------------------------------------------------------------------
 *  Sessão
 * ------------------------------------------------------------------------- */

const CorpoLogin = z.object({
  email: z.string().trim().email('e-mail inválido').max(200),
  senha: z.string().min(1, 'senha obrigatória').max(256),
});

async function registrarRotasDeSessao(app) {
  const { db } = app;

  app.post('/api/sessao', async (req, resposta) => {
    const { email, senha } = CorpoLogin.parse(req.body);

    const u = await consultarUm(
      db,
      `SELECT id, email, nome, papel, ativo, senha_hash, senha_sal
         FROM usuarios WHERE lower(email) = lower($1)`,
      [email],
    );

    const { conferir } = await import('./seguranca/senha.mjs');
    const senhaOk = u ? await conferir(senha, u.senha_hash, u.senha_sal) : false;

    /* Mesma resposta para e-mail inexistente, senha errada e conta desativada.
       Distinguir permitiria descobrir quem tem conta na casa. */
    if (!u || !u.ativo || !senhaOk) {
      throw new ErroHttp(401, 'credenciais_invalidas', 'E-mail ou senha incorretos.');
    }

    const { token, expiraEm } = await sessao.criar(db, {
      usuarioId: u.id,
      ip: req.ip,
      agente: req.headers['user-agent'] ?? null,
    });

    resposta.setCookie(sessao.NOME_COOKIE, token, sessao.opcoesDoCookie({ expiraEm }));
    return { id: u.id, nome: u.nome, email: u.email, papel: u.papel };
  });

  app.delete('/api/sessao', async (req, resposta) => {
    const token = req.cookies?.[sessao.NOME_COOKIE];
    if (token) await sessao.encerrar(db, token);
    resposta.clearCookie(sessao.NOME_COOKIE, { path: '/' });
    return { encerrada: true };
  });

  app.get('/api/eu', async (req) => {
    const u = req.exigirAutenticado();
    return {
      id: u.id, nome: u.nome, email: u.email, papel: u.papel,
      mandatos: u.mandatos,
    };
  });
}

/* ---------------------------------------------------------------------------
 *  Mandatos
 * ------------------------------------------------------------------------- */

async function registrarRotasDeMandato(app) {
  const { db } = app;

  app.get('/api/mandatos', async (req) => {
    const u = req.exigirAutenticado();

    /* Admin vê tudo. Os demais veem os que participam, mais os não
       confidenciais — o filtro é do SQL, não da aplicação: deixar passar e
       filtrar depois é como vazamento acontece. */
    const linhas = u.papel === 'admin'
      ? (await db.query(
          `SELECT id, codigo, rotulo, setor, subsetor, situacao, confidencial
             FROM mandatos ORDER BY codigo`)).rows
      : (await db.query(
          `SELECT DISTINCT m.id, m.codigo, m.rotulo, m.setor, m.subsetor,
                  m.situacao, m.confidencial
             FROM mandatos m
             LEFT JOIN mandato_membros mm
               ON mm.mandato_id = m.id AND mm.usuario_id = $1
            WHERE mm.usuario_id IS NOT NULL OR m.confidencial = FALSE
            ORDER BY m.codigo`, [u.id])).rows;

    return { mandatos: linhas };
  });

  app.get('/api/mandatos/:id', async (req) => {
    const { mandato } = await req.exigirNoMandato(req.params.id, 'triagem.ler');
    return { mandato };
  });
}
