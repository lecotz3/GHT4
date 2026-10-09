/* =============================================================================
 *  GHT4 · registro da execução da pesquisa por tese
 * -----------------------------------------------------------------------------
 *  O Lessie transmite a execução como eventos tipados (agente, critérios, cartões,
 *  eventos) numa conexão aberta (PESQUISA-LESSIE-AI.md §5.1-6). Aqui a revisão
 *  roda em lotes curtos de função serverless, que não sustentam conexão longa;
 *  então cada passo vira uma linha tipada, e a tela lê as novas por cursor (id)
 *  enquanto acompanha. Interromper e retomar já existem (pausar/continuar).
 *
 *  É um registro informativo, não a trilha de auditoria (que continua sendo a
 *  fonte de verdade de quem mudou o quê). Por isso a gravação é acessória: roda
 *  DEPOIS da mudança, fora da transação dela, e uma falha aqui nunca desfaz nem
 *  bloqueia a ação.
 * ========================================================================== */

export const TIPOS_EVENTO = ['criterios', 'funil', 'retomada', 'lote', 'pausa', 'conclusao', 'revisao_humana', 'ajuste', 'entrega', 'monitoramento'];
/** Quem age em cada tipo: o agente (passos automáticos) ou a pessoa (decisões). */
const DO_AGENTE = new Set(['criterios', 'funil', 'lote', 'conclusao']);

export async function registrarEvento(db, { pesquisaId, tipo, dados = {}, usuarioId = null }, log = null) {
  try {
    await db.query('INSERT INTO pesquisa_eventos (pesquisa_id, tipo, dados, usuario_id) VALUES ($1,$2,$3,$4)',
      [pesquisaId, tipo, JSON.stringify(dados), usuarioId]);
  } catch (erro) { log?.warn({ codigo: erro.code ?? erro.name, tipo }, 'evento da pesquisa não registrado'); }
}

/** Eventos depois do cursor `apos`, do mais antigo para o mais novo, com o nome de quem pediu. */
export async function lerEventos(db, pesquisaId, { apos = 0, limite = 100 } = {}) {
  const eventos = (await db.query(`SELECT e.id, e.tipo, e.dados, e.criado_em, u.nome AS autor FROM pesquisa_eventos e
      LEFT JOIN usuarios u ON u.id=e.usuario_id WHERE e.pesquisa_id=$1 AND e.id > $2 ORDER BY e.id LIMIT $3`, [pesquisaId, apos, limite])).rows
    .map((e) => ({ id: Number(e.id), tipo: e.tipo, dados: e.dados, em: e.criado_em,
      ator: DO_AGENTE.has(e.tipo) || (e.tipo === 'pausa' && e.dados?.automatica) ? 'agente' : 'pessoa', autor: e.autor ?? null }));
  return { eventos, ultimo: eventos.length ? eventos[eventos.length - 1].id : apos };
}
