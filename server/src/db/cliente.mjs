/* =============================================================================
 *  GHT4 · conexão com o banco
 * -----------------------------------------------------------------------------
 *  DOIS DESTINOS, UM CONTRATO
 *
 *    DATABASE_URL definida  → Postgres de verdade (Supabase, ou qualquer outro)
 *    sem DATABASE_URL       → PGlite, o Postgres compilado para WebAssembly
 *
 *  PGlite é Postgres: mesmo parser, mesmo planejador, mesmos tipos. Roda por npm
 *  sem instalar serviço, e é o que faz os testes serem rápidos, isolados e sem
 *  rede. O esquema, os índices, o particionamento e a ingestão são escritos para
 *  o Postgres real — PGlite só executa a verificação funcional.
 *
 *  A RESSALVA QUE NÃO PODE SUMIR
 *  Os benchmarks de escala do adendo (10 milhões de estabelecimentos, p95 < 2 s,
 *  planos de consulta reais) NÃO rodam em PGlite, que é single-process em WASM.
 *  Enquanto não rodarem contra Postgres de verdade, o requisito de escala está
 *  pendente — nunca aprovado. Ver docs/architecture/adr/0001.
 *
 *  A aplicação inteira fala com as funções daqui, nunca com o driver. É isso que
 *  permite os dois destinos conviverem sem `if` espalhado pelo código.
 * ========================================================================== */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CA_SUPABASE } from './ca-supabase.mjs';

export const RAIZ_SERVIDOR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..',
);

/* Carrega server/.env, se existir. A connection string do Supabase mora ali, e
   .env está no .gitignore: credencial não entra no repositório. */
const ENV = path.join(RAIZ_SERVIDOR, '.env');
if (fs.existsSync(ENV) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(ENV); } catch { /* .env malformado não derruba o processo */ }
}

const CAMINHO_PADRAO = process.env.GHT4_DADOS_DIR || path.join(RAIZ_SERVIDOR, '.dados');

let instancia = null;
let tipoAtual = null;

/* ---------------------------------------------------------------------------
 *  Conexão de sessão, para migrations e ingestão em massa.
 *
 *  Pooler em modo transação (Supabase na 6543, PgBouncer em geral) devolve a
 *  conexão ao pool no fim de CADA transação. Duas coisas dependem da sessão
 *  sobreviver a isso e por isso não funcionam ali:
 *
 *    · `pg_advisory_lock`, que serializa dois deploys sobre o mesmo banco —
 *      a trava é da sessão, e a sessão troca embaixo do pé;
 *    · a transação longa da importação do catálogo, que segura uma conexão
 *      do pool de transação por dezenas de segundos.
 *
 *  DATABASE_URL_DIRETA aponta para a porta de sessão (5432). Sem ela, cai em
 *  DATABASE_URL — que é o certo quando o destino não é um pooler.
 * ------------------------------------------------------------------------- */
export function urlDireta() {
  if (process.env.DATABASE_URL_DIRETA) return process.env.DATABASE_URL_DIRETA;
  const url = urlBanco();
  return url ? sessaoDoPooler(url) ?? url : null;
}

/**
 * A mesma credencial, na porta de sessão.
 *
 * O Supavisor (pooler do Supabase) atende transação na 6543 e sessão na 5432 no
 * MESMO host, com o MESMO usuário e senha. Derivar a segunda da primeira evita
 * guardar o mesmo segredo duas vezes na hospedagem, e é o que faz a integração
 * Supabase↔Vercel bastar sozinha.
 *
 * `POSTGRES_URL_NON_POOLING`, que essa integração também injeta, parece o
 * candidato óbvio e NÃO serve: aponta para db.<ref>.supabase.co, que só publica
 * registro AAAA, e o build da Vercel não tem saída IPv6.
 *
 * Devolve null quando a URL não é um pooler do Supabase na 6543 — aí quem chama
 * fica com a original, que é o certo para qualquer outro Postgres.
 */
export function sessaoDoPooler(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('.pooler.supabase.com') || u.port !== '6543') return null;
    u.port = '5432';
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * A connection string da aplicação.
 *
 * `DATABASE_URL` manda. `POSTGRES_URL` é o nome que a integração oficial
 * Supabase↔Vercel injeta sozinha no projeto — aceitá-lo é o que permite ligar
 * banco e hospedagem sem ninguém copiar senha de um painel para o outro.
 */
export function urlBanco() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

/** Host, porta e banco. Nunca usuário ou senha: isto vai para log de deploy. */
export function descreverAlvo(url) {
  if (!url) return 'PGlite local (sem DATABASE_URL)';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(connection string malformada)';
  }
}

/** 'postgres' quando há DATABASE_URL, 'pglite' caso contrário. */
export function tipoDeBanco() {
  return process.env.GHT4_APENAS_LOCAL === '1' ? 'pglite' : urlBanco() ? 'postgres' : 'pglite';
}

/* ---------------------------------------------------------------------------
 *  Adaptador: dá a um Pool do `pg` a mesma superfície do PGlite.
 *
 *  PGlite expõe `query`, `exec` e `transaction`. O `pg` expõe `query` e um
 *  cliente por conexão. Uniformizar aqui é o que evita `if (ehPglite)` no resto
 *  do código — e é o ponto onde um bug custaria caro, então ele é pequeno e
 *  fica visível.
 * ------------------------------------------------------------------------- */
function adaptarPg(pool) {
  const envolver = (executor) => ({
    query: (sql, parametros = []) => executor.query(sql, parametros),
    /* `exec` do PGlite roda vários comandos separados por ponto e vírgula. No
       `pg`, uma query sem parâmetros já aceita múltiplos comandos. */
    exec: (sql) => executor.query(sql),
  });

  return {
    tipo: 'postgres',
    ...envolver(pool),

    async transaction(corpo) {
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        const r = await corpo(envolver(cliente));
        await cliente.query('COMMIT');
        return r;
      } catch (erro) {
        try { await cliente.query('ROLLBACK'); } catch { /* conexão já caiu */ }
        throw erro;
      } finally {
        cliente.release();
      }
    },

    async close() { await pool.end(); },
    /* Só o Postgres real tem pool; a ingestão por COPY precisa de um cliente
       dedicado, e é aqui que ela o obtém. */
    conectar: () => pool.connect(),
  };
}

/* ---------------------------------------------------------------------------
 *  TLS da conexão.
 *
 *  A regra é uma: verificar sempre, e dizer contra QUEM verificar. Postgres
 *  gerenciado costuma assinar com autoridade própria, que não está no bundle do
 *  Node — sem âncora, o driver recusa com SELF_SIGNED_CERT_IN_CHAIN antes mesmo
 *  de mandar a senha. A saída comum é desligar a verificação; a saída certa é
 *  fornecer a raiz. Ver server/src/db/ca-supabase.mjs.
 * ------------------------------------------------------------------------- */
function opcoesTls(url) {
  const host = new URL(url).hostname;
  // Banco na própria máquina não atravessa rede: exigir TLS ali só atrapalha.
  if (process.env.PG_TLS_MODE === 'disable' || ['localhost','127.0.0.1','[::1]'].includes(host)) return false;
  /* Escotilha de emergência, e só isso. Aceita qualquer servidor que se diga o
     banco, o que num produto que trafega sessão e carteira de clientes é caro.
     Documentada como "nunca em produção" em server/.env.example. */
  if (process.env.PGSSL_INSEGURO === '1') return { rejectUnauthorized: false };
  // PG_CA_CERT atende quem está atrás de proxy com certificado próprio.
  const ca = process.env.PG_CA_CERT || (/(^|\.)supabase\.(com|co)$/.test(host) ? CA_SUPABASE : null);
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

async function abrirPostgres(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: opcoesTls(url),
    max: Number(process.env.PG_POOL_MAX) || 10,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    /* Consulta que passa disso é bug ou falta de índice. Falhar rápido é melhor
       que segurar conexão do pool. */
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 60_000,
  });
  /* Erro em conexão ociosa não pode derrubar o processo. */
  pool.on('error', (erro) => console.error('[db] erro em conexão ociosa:', erro.message));
  return adaptarPg(pool);
}

async function abrirPglite({ emMemoria, caminho }) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create(emMemoria ? undefined : caminho);
  db.tipo = 'pglite';
  return db;
}

/**
 * Abre (ou reaproveita) a conexão.
 *
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.emMemoria] só vale para PGlite. É o modo dos testes.
 * @param {string}  [opcoes.caminho]   diretório do PGlite persistente.
 * @param {string}  [opcoes.url]       força Postgres nesta URL.
 */
export async function abrir({ emMemoria = false, caminho = CAMINHO_PADRAO, url = null } = {}) {
  if (instancia) return instancia;

  const destino = process.env.GHT4_APENAS_LOCAL === '1' ? null : url ?? urlBanco();
  if (destino) {
    instancia = await abrirPostgres(destino);
    tipoAtual = 'postgres';
  } else {
    instancia = await abrirPglite({ emMemoria, caminho });
    tipoAtual = 'pglite';
  }
  return instancia;
}

/** Conexão nova e isolada, sem tocar na global. Para testes paralelos. */
export async function abrirIsolado() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create();
  db.tipo = 'pglite';
  return db;
}

export async function fechar() {
  if (!instancia) return;
  await instancia.close();
  instancia = null;
  tipoAtual = null;
}

export function tipoAberto() {
  return tipoAtual;
}

/**
 * Consulta parametrizada. SEMPRE com `$1`, nunca com interpolação.
 *
 * Concatenar valor em SQL é a porta de entrada de injeção, e num produto que vai
 * ler texto de sites e planilhas de terceiros isso deixa de ser hipótese.
 */
export async function consultar(db, sql, parametros = []) {
  const r = await db.query(sql, parametros);
  return r.rows;
}

/** Consulta que espera no máximo uma linha. */
export async function consultarUm(db, sql, parametros = []) {
  const linhas = await consultar(db, sql, parametros);
  if (linhas.length > 1) {
    throw new Error(`consultarUm: a consulta devolveu ${linhas.length} linhas`);
  }
  return linhas[0] ?? null;
}

/**
 * Executa dentro de uma transação, com rollback automático em erro.
 *
 * Toda mutação que precisa gravar auditoria junto passa por aqui: o registro do
 * que mudou e a mudança em si têm de subir ou cair juntos, senão a trilha mente.
 */
export async function emTransacao(db, corpo) {
  return db.transaction(async (tx) => corpo(tx));
}

/** Quantas linhas a última escrita afetou, nos dois drivers. */
export function linhasAfetadas(resultado) {
  return resultado?.affectedRows ?? resultado?.rowCount ?? 0;
}
