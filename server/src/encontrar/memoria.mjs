import { createHash } from 'node:crypto';
import { normalizar } from '../agente/catalogo.mjs';
import { memoriaAtiva, travarMemoria } from '../pesquisa/memoria.mjs';

/* =============================================================================
 *  GHT4 · memória das buscas do "encontrar quem decide"
 * -----------------------------------------------------------------------------
 *  Os pedidos que cada membro fez, para repetir com um clique, como a memória de
 *  critérios da pesquisa por tese (pesquisa/memoria.mjs), com as mesmas regras:
 *    · pessoal: só a própria pessoa vê, nem administrador;
 *    · visível e apagável, uma a uma ou tudo;
 *    · pausável pela mesma preferência da memória (pausar não apaga);
 *    · guarda o pedido e a contagem do último resultado, nunca as pessoas;
 *    · busca dentro de uma pesquisa por tese não entra (o recorte é a pesquisa).
 *  O mesmo pedido escrito com outra caixa, acento ou espaço soma usos.
 * ========================================================================== */

/** Teto por pessoa: além dele saem as buscas usadas há mais tempo. */
export const MAX_BUSCAS = 30;

export const chaveDaBusca = (pedido) => createHash('sha256')
  .update(normalizar(pedido).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 32);

/** O que fica do resultado: as contagens, para a lista dizer o que a busca trouxe da última vez. */
export const resumoDaBusca = (r) => ({ forte: r.funil.forte, revisar: r.funil.revisar, excluido: r.funil.excluido, lacunas: r.lacunas.total });

/** Guarda o pedido feito. Devolve false com a memória pausada. A trava é a da pausa e da exclusão. */
export async function lembrarBusca(db, usuarioId, pedido, resumo) {
  const texto = pedido.replace(/\s+/g, ' ').trim();
  return db.transaction(async (tx) => {
    await travarMemoria(tx, usuarioId);
    if (!(await memoriaAtiva(tx, usuarioId))) return false;
    await tx.query(`INSERT INTO memoria_buscas (usuario_id, chave, pedido, resumo) VALUES ($1,$2,$3,$4)
      ON CONFLICT (usuario_id, chave) DO UPDATE SET usos=memoria_buscas.usos+1, ultimo_uso=now(), pedido=EXCLUDED.pedido, resumo=EXCLUDED.resumo`,
    [usuarioId, chaveDaBusca(texto), texto, JSON.stringify(resumo)]);
    await tx.query(`DELETE FROM memoria_buscas WHERE usuario_id=$1 AND chave IN (
        SELECT chave FROM memoria_buscas WHERE usuario_id=$1 ORDER BY ultimo_uso DESC, chave OFFSET $2)`, [usuarioId, MAX_BUSCAS]);
    return true;
  });
}

/** O que a pessoa vê: as mais recentes primeiro. */
export async function lerBuscas(db, usuarioId) {
  const buscas = (await db.query(`SELECT chave, pedido, usos, resumo, ultimo_uso FROM memoria_buscas WHERE usuario_id=$1
    ORDER BY ultimo_uso DESC, chave LIMIT $2`, [usuarioId, MAX_BUSCAS])).rows
    .map((r) => ({ chave: r.chave, pedido: r.pedido, usos: r.usos, resumo: r.resumo, ultimoUso: r.ultimo_uso }));
  return { ativa: await memoriaAtiva(db, usuarioId), buscas };
}
