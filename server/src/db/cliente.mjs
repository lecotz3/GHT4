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

export const RAIZ_SERVIDOR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..',
);

/* Carrega server/.env, se existir. A connection string do Supabase mora ali, e
   .env está no .gitignore: credencial não entra no repositório. */
const ENV = path.join(RAIZ_SERVIDOR, '.env');
if (fs.existsSync(ENV) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(ENV); } catch { /* .env malformado não derruba o processo */ }
}

const CAMINHO_PADRAO = path.join(RAIZ_SERVIDOR, '.dados');

let instancia = null;
let tipoAtual = null;

/** 'postgres' quando há DATABASE_URL, 'pglite' caso contrário. */
export function tipoDeBanco() {
  return process.env.DATABASE_URL ? 'postgres' : 'pglite';
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

async function abrirPostgres(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: url,
    /* Supabase e a maioria dos Postgres gerenciados exigem TLS. `rejectUnauthorized`
       fica ligado por padrão; quem estiver atrás de um proxy com certificado
       próprio ajusta por PGSSLMODE, sem afrouxar isto no código. */
    ssl: url.includes('localhost') || url.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: process.env.PGSSL_INSEGURO !== '1' },
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

  const destino = url ?? process.env.DATABASE_URL;
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
