/* =============================================================================
 *  GHT4 · memória do membro: os critérios que cada pessoa usa
 * -----------------------------------------------------------------------------
 *  Adaptação da "memória" do Lessie (PESQUISA-LESSIE-AI.md §4 e §5.2) para uma
 *  boutique de M&A:
 *
 *    · guarda só critérios de pesquisa por tese, quando a pessoa INICIA a
 *      pesquisa (os que ela confirmou, não os apenas propostos);
 *    · é pessoal: ninguém mais vê, nem administrador;
 *    · é visível e apagável (um a um ou tudo) e pode ser pausada;
 *    · trabalho em mandato confidencial não alimenta a memória;
 *    · sugere, nunca aplica: o critério só entra numa pesquisa quando a pessoa
 *      clica nele.
 *
 *  A chave identifica o critério pelo que ele verifica (regra cadastral, ou o
 *  texto normalizado de um critério de pesquisa), então a mesma exigência
 *  escrita em duas teses soma usos em vez de duplicar.
 * ========================================================================== */

import { createHash } from 'node:crypto';
import { normalizar } from '../agente/catalogo.mjs';

/** Teto por pessoa: além dele saem os menos usados e mais antigos. */
export const MAX_MEMORIA = 60;

export const chaveDoCriterio = (c) => createHash('sha256').update(JSON.stringify(
  c.tipo === 'cadastro' && c.regra ? ['cadastro', c.regra.campo, c.regra.valor] : ['pesquisa', normalizar(c.texto).replace(/\s+/g, ' ').trim()],
)).digest('hex').slice(0, 32);

/** O que fica guardado: o critério sem id, sem trecho da tese e sem origem. */
const guardavel = (c) => ({ texto: c.texto, tipo: c.tipo, regra: c.regra ?? null, obrigatorio: c.obrigatorio });

export async function memoriaAtiva(db, usuarioId) {
  const r = (await db.query('SELECT ativa FROM memoria_preferencias WHERE usuario_id=$1', [usuarioId])).rows[0];
  return r ? r.ativa : true;
}

/**
 * Guardar, pausar e apagar a memória de uma pessoa passam por esta trava, como primeira coisa da
 * transação: uma gravação que já leu "ativa" termina antes da pausa ou da exclusão, e a exclusão a
 * leva junto; nunca depois, repondo o que foi apagado. Serve às buscas e aos critérios, que dividem
 * a preferência. Uma trava só, e da transação: a ordem não diverge e o pooler do Supabase a solta no
 * fim da transação.
 */
export async function travarMemoria(tx, usuarioId) {
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('memoria:' || $1::text, 0))", [usuarioId]);
}

/** Grava os critérios de uma pesquisa iniciada. Devolve quantos entraram (0 com a memória pausada). */
export async function lembrarCriterios(db, usuarioId, criterios) {
  if (!criterios?.length) return 0;
  const linhas = [...new Map(criterios.map((c) => [chaveDoCriterio(c), guardavel(c)])).entries()];
  return db.transaction(async (tx) => {
    await travarMemoria(tx, usuarioId);
    if (!(await memoriaAtiva(tx, usuarioId))) return 0;
    await tx.query(`INSERT INTO memoria_criterios (usuario_id, chave, criterio)
        SELECT $1, x.chave, x.criterio FROM jsonb_to_recordset($2::jsonb) AS x(chave text, criterio jsonb)
      ON CONFLICT (usuario_id, chave) DO UPDATE SET usos=memoria_criterios.usos+1, ultimo_uso=now(), criterio=EXCLUDED.criterio`,
    [usuarioId, JSON.stringify(linhas.map(([chave, criterio]) => ({ chave, criterio })))]);
    await tx.query(`DELETE FROM memoria_criterios WHERE usuario_id=$1 AND chave IN (
        SELECT chave FROM memoria_criterios WHERE usuario_id=$1 ORDER BY usos DESC, ultimo_uso DESC OFFSET $2)`, [usuarioId, MAX_MEMORIA]);
    return linhas.length;
  });
}

/** O que a pessoa vê da própria memória: mais usados primeiro. */
export async function lerMemoria(db, usuarioId) {
  const criterios = (await db.query(`SELECT chave, criterio, usos, ultimo_uso FROM memoria_criterios WHERE usuario_id=$1
    ORDER BY usos DESC, ultimo_uso DESC LIMIT $2`, [usuarioId, MAX_MEMORIA])).rows
    .map((r) => ({ chave: r.chave, ...r.criterio, usos: r.usos, ultimoUso: r.ultimo_uso }));
  return { ativa: await memoriaAtiva(db, usuarioId), criterios };
}
