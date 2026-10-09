/* =============================================================================
 *  GHT4 · revisão humana de um veredito
 * -----------------------------------------------------------------------------
 *  Adaptação da "visão versionada com campos travados" do Lessie
 *  (PESQUISA-LESSIE-AI.md §3.2 e §5.1-7). O membro confirma, contesta ou deixa em
 *  aberto um critério de uma empresa JÁ REVISADA, sempre com justificativa:
 *
 *    · o veredito passa a ter lastro 'humano', com autor, data e, se houver, a
 *      fonte que a pessoa consultou (conversa, documento, página);
 *    · fica travado: a revisão automática só trabalha a fila (aguardando), nunca
 *      volta a uma empresa revisada;
 *    · o veredito automático fica guardado junto (`automatico`) e "desfazer"
 *      devolve exatamente ele;
 *    · cada mudança é uma versão em `pesquisa_revisoes` (só INSERT) e um registro
 *      na auditoria, com a justificativa;
 *    · aderência e categoria são recalculadas pela mesma regra (`consolidar`).
 *
 *  Não existe "indício" humano: a pessoa confirma, contesta ou deixa em aberto.
 * ========================================================================== */

import { z } from 'zod';
import { consolidar } from './criterios.mjs';

export const PedidoRevisao = z.object({
  criterioId: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  veredito: z.enum(['atende', 'nao_atende', 'indeterminado']),
  justificativa: z.string().trim().min(10).max(600),
  resumo: z.string().trim().max(120).optional(),
  fonte: z.object({
    descricao: z.string().trim().min(3).max(200),
    url: z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Use um endereço http(s).').optional(),
  }).strict().optional(),
  /** O veredito que a tela mostrava: se mudou em outra aba, a revisão é recusada. */
  anterior: z.object({ veredito: z.enum(['atende', 'indicio', 'indeterminado', 'nao_atende']), lastro: z.string().max(20).nullable() }).strict(),
}).strict();

const RESUMO = { atende: 'Confirmado pela equipe', nao_atende: 'Contestado pela equipe', indeterminado: 'Em aberto, segundo a equipe' };
const semAutomatico = ({ automatico, ...v }) => v;

export class ConflitoRevisao extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; }
}

/** Lê e trava o item; recusa empresa fora da pesquisa ou ainda não revisada. */
async function itemTravado(tx, pesquisaId, empresaId) {
  const item = (await tx.query('SELECT * FROM pesquisa_itens WHERE pesquisa_id=$1 AND empresa_id=$2 FOR UPDATE', [pesquisaId, empresaId])).rows[0];
  if (!item) throw new ConflitoRevisao('item_inexistente', 'Empresa não encontrada nesta pesquisa.');
  if (item.etapa !== 'revisada') throw new ConflitoRevisao('item_nao_revisado', 'Esta empresa ainda está na fila da revisão automática. Revise-a depois que ela for pesquisada.');
  return item;
}

async function gravar(tx, { pesquisa, item, indice, criterio, novo, acao, usuario }) {
  const antes = item.vereditos[indice];
  const vereditos = [...item.vereditos];
  vereditos[indice] = novo;
  const { aderencia, categoria } = consolidar(pesquisa.criterios, vereditos);
  const salvo = (await tx.query(`UPDATE pesquisa_itens SET vereditos=$3, aderencia=$4, categoria=$5 WHERE pesquisa_id=$1 AND empresa_id=$2 RETURNING *`,
    [pesquisa.id, item.empresa_id, JSON.stringify(vereditos), aderencia, categoria])).rows[0];
  await tx.query(`INSERT INTO pesquisa_revisoes (pesquisa_id, empresa_id, criterio_id, acao, antes, depois, usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [pesquisa.id, item.empresa_id, criterio.id, acao, JSON.stringify(semAutomatico(antes ?? {})), JSON.stringify(semAutomatico(novo)), usuario.id]);
  return { item: salvo, antes, depois: novo, categoriaAntes: item.categoria };
}

/** Registra a decisão humana sobre um critério de uma empresa revisada. */
export async function revisarVeredito(tx, { pesquisa, empresaId, pedido, usuario }) {
  const indice = pesquisa.criterios.findIndex((c) => c.id === pedido.criterioId);
  if (indice < 0) throw new ConflitoRevisao('criterio_inexistente', 'Este critério não existe nesta pesquisa.');
  const item = await itemTravado(tx, pesquisa.id, empresaId);
  const atual = item.vereditos[indice] ?? { veredito: 'indeterminado', lastro: null };
  if (atual.veredito !== pedido.anterior.veredito || (atual.lastro ?? null) !== pedido.anterior.lastro) {
    throw new ConflitoRevisao('veredito_atualizado', 'Este veredito mudou em outra aba. Reabra a empresa antes de revisar.');
  }
  const automatico = atual.lastro === 'humano' ? atual.automatico : atual;
  const novo = {
    veredito: pedido.veredito, resumo: pedido.resumo || RESUMO[pedido.veredito], justificativa: pedido.justificativa, lastro: 'humano',
    evidencias: [{ fonte: 'Revisão da equipe', referencia: pedido.fonte?.descricao ?? 'Sem fonte externa informada', ...(pedido.fonte?.url ? { url: pedido.fonte.url } : {}) }],
    revisao: { autor: { id: usuario.id, nome: usuario.nome }, em: new Date().toISOString(), ...(pedido.fonte ? { fonte: pedido.fonte } : {}) },
    automatico,
  };
  return gravar(tx, { pesquisa, item, indice, criterio: pesquisa.criterios[indice], novo, acao: 'revisar', usuario });
}

/** Devolve o veredito automático guardado. Só vale para um veredito com revisão humana. */
export async function desfazerRevisao(tx, { pesquisa, empresaId, criterioId, usuario }) {
  const indice = pesquisa.criterios.findIndex((c) => c.id === criterioId);
  if (indice < 0) throw new ConflitoRevisao('criterio_inexistente', 'Este critério não existe nesta pesquisa.');
  const item = await itemTravado(tx, pesquisa.id, empresaId);
  const atual = item.vereditos[indice];
  if (atual?.lastro !== 'humano' || !atual.automatico) throw new ConflitoRevisao('sem_revisao_humana', 'Este veredito não tem revisão humana para desfazer.');
  return gravar(tx, { pesquisa, item, indice, criterio: pesquisa.criterios[indice], novo: atual.automatico, acao: 'desfazer', usuario });
}

/** Versões de uma empresa, da mais nova para a mais antiga, com o nome de quem fez. */
export async function revisoesDoItem(db, pesquisaId, empresaId) {
  return (await db.query(`SELECT r.id, r.criterio_id, r.acao, r.antes, r.depois, r.criado_em, u.nome AS autor
    FROM pesquisa_revisoes r JOIN usuarios u ON u.id=r.usuario_id WHERE r.pesquisa_id=$1 AND r.empresa_id=$2 ORDER BY r.id DESC LIMIT 50`,
  [pesquisaId, empresaId])).rows.map((r) => ({ id: Number(r.id), criterioId: r.criterio_id, acao: r.acao, antes: r.antes, depois: r.depois, em: r.criado_em, autor: r.autor }));
}
