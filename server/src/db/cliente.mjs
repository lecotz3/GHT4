/* =============================================================================
 *  GHT4 · conexão com o banco
 * -----------------------------------------------------------------------------
 *  POR QUE PGlite, E NÃO POSTGRES DIRETO
 *  PGlite é o Postgres compilado para WebAssembly: mesmo parser, mesmo
 *  planejador, mesmos tipos. Roda dentro do Node por npm, sem instalar serviço
 *  nem container. Isso importa aqui por um motivo concreto — a máquina de
 *  desenvolvimento deste projeto não tem Docker nem Postgres, e o critério de
 *  aceite da Fase 2 exige que o backend seja EXECUTADO e testado, não só escrito.
 *
 *  O SQL é o mesmo. As migrations são as mesmas. Trocar para um Postgres de
 *  verdade é trocar a implementação de `abrir()` e nada mais — por isso toda a
 *  aplicação fala com a interface daqui, nunca com o driver.
 *
 *  O QUE PGlite NÃO É
 *  Não é multiusuário: é um processo, um banco. Serve para desenvolvimento,
 *  teste e demonstração. Homologação e produção pedem Postgres de verdade, e a
 *  Fase 9 trata disso.
 * ========================================================================== */

import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ_SERVIDOR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..',
);

/* Onde os dados moram quando não é em memória. Fica fora do git. */
const CAMINHO_PADRAO = path.join(RAIZ_SERVIDOR, '.dados');

let instancia = null;

/**
 * Abre (ou reaproveita) a conexão.
 *
 * @param {object} [opcoes]
 * @param {boolean} [opcoes.emMemoria] descarta tudo ao fechar. É o modo dos testes.
 * @param {string}  [opcoes.caminho]   diretório do banco, quando persistente.
 */
export async function abrir({ emMemoria = false, caminho = CAMINHO_PADRAO } = {}) {
  if (instancia) return instancia;
  instancia = await PGlite.create(emMemoria ? undefined : caminho);
  return instancia;
}

/** Uma conexão nova e isolada, sem tocar na global. Para testes paralelos. */
export async function abrirIsolado() {
  return PGlite.create();
}

export async function fechar() {
  if (!instancia) return;
  await instancia.close();
  instancia = null;
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
