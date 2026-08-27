/* =============================================================================
 *  GHT4 · trilha de auditoria
 * -----------------------------------------------------------------------------
 *  O plano é explícito: "toda mutação registra quem, quando, antes/depois e
 *  justificativa". Este módulo é o único caminho para escrever nessa trilha.
 *
 *  A REGRA QUE ESTE ARQUIVO IMPÕE
 *  Auditar acontece DENTRO da mesma transação da mutação. Se a mutação sobe e o
 *  registro não, a trilha passa a mentir por omissão — e uma trilha que mente às
 *  vezes é pior que nenhuma, porque cria confiança injustificada. Por isso
 *  `registrar` recebe a transação, nunca abre a sua.
 *
 *  O banco reforça o resto: `auditoria` tem trigger que recusa UPDATE e DELETE.
 * ========================================================================== */

import { consultarUm } from '../db/cliente.mjs';

/* Nomes de campo que nunca entram na trilha, mesmo que apareçam no `antes`/
   `depois` de uma linha. Auditoria é lida por gente; não é lugar de segredo. */
const NUNCA_REGISTRAR = new Set([
  'senha', 'senha_hash', 'senhaHash', 'senha_sal', 'senhaSal',
  'token', 'token_hash', 'tokenHash', 'segredo', 'apiKey', 'api_key',
]);

/**
 * Remove segredos de um objeto antes de ele virar registro permanente.
 * Recursivo: o segredo pode estar aninhado.
 */
export function limpar(valor, profundidade = 0) {
  if (valor === null || typeof valor !== 'object') return valor;
  if (profundidade > 8) return '[profundo demais]';
  if (Array.isArray(valor)) return valor.map((v) => limpar(v, profundidade + 1));

  const saida = {};
  for (const [chave, v] of Object.entries(valor)) {
    saida[chave] = NUNCA_REGISTRAR.has(chave) ? '[omitido]' : limpar(v, profundidade + 1);
  }
  return saida;
}

/**
 * Grava um evento na trilha.
 *
 * @param {object} tx        a transação da mutação. Obrigatória, e é o ponto.
 * @param {object} evento
 * @param {string} evento.acao          'criar' | 'editar' | 'mover' | 'aprovar' | ...
 * @param {string} evento.entidade      tabela ou agregado tocado
 * @param {string} [evento.entidadeId]
 * @param {string} [evento.usuarioId]   quem fez. Null só em ação do sistema.
 * @param {string} [evento.mandatoId]
 * @param {object} [evento.antes]       estado anterior. Null em criação.
 * @param {object} [evento.depois]      estado posterior. Null em exclusão.
 * @param {string} [evento.justificativa]
 * @param {string} [evento.ip]
 * @param {string} [evento.runId]       run do agente que originou, se houver.
 */
export async function registrar(tx, evento) {
  if (!tx || typeof tx.query !== 'function') {
    throw new TypeError(
      'registrar(): precisa da transação da mutação. Auditar fora dela permite ' +
      'que a mudança suba e o registro não.',
    );
  }
  if (!evento?.acao || !evento?.entidade) {
    throw new TypeError('registrar(): `acao` e `entidade` são obrigatórios');
  }

  const r = await tx.query(
    `INSERT INTO auditoria
       (usuario_id, mandato_id, acao, entidade, entidade_id,
        antes, depois, justificativa, ip, run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, ocorrido_em`,
    [
      evento.usuarioId ?? null,
      evento.mandatoId ?? null,
      evento.acao,
      evento.entidade,
      evento.entidadeId ?? null,
      evento.antes === undefined || evento.antes === null ? null : JSON.stringify(limpar(evento.antes)),
      evento.depois === undefined || evento.depois === null ? null : JSON.stringify(limpar(evento.depois)),
      evento.justificativa ?? null,
      evento.ip ?? null,
      evento.runId ?? null,
    ],
  );
  return r.rows[0];
}

/**
 * Decisão humana que muda estado de triagem, score aprovado ou estágio de CRM.
 *
 * Exige justificativa, e é aqui que a exigência mora — não numa convenção de
 * quem chama. O plano trata isso como requisito: "nenhum registro muda de estado
 * sem um responsável nomeado".
 */
export async function registrarDecisao(tx, evento) {
  if (!evento?.justificativa || String(evento.justificativa).trim().length === 0) {
    throw new TypeError(
      'registrarDecisao(): decisão humana exige justificativa. ' +
      'Estado que muda sem motivo registrado não é auditável.',
    );
  }
  if (!evento?.usuarioId) {
    throw new TypeError('registrarDecisao(): decisão humana exige um responsável nomeado.');
  }
  return registrar(tx, { ...evento, acao: evento.acao ?? 'decidir' });
}

/** Histórico de uma entidade, do mais recente para o mais antigo. */
export async function historicoDe(db, entidade, entidadeId, { limite = 100 } = {}) {
  const r = await db.query(
    `SELECT a.id, a.ocorrido_em, a.acao, a.entidade, a.entidade_id,
            a.antes, a.depois, a.justificativa, a.run_id,
            u.nome AS usuario_nome, u.email AS usuario_email
       FROM auditoria a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.entidade = $1 AND a.entidade_id = $2
      ORDER BY a.ocorrido_em DESC, a.id DESC
      LIMIT $3`,
    [entidade, entidadeId, limite],
  );
  return r.rows;
}

/** A trilha aceita mesmo só INSERT? Usado pelos testes e pelo runbook. */
export async function trilhaEhImutavel(db) {
  const linha = await consultarUm(db, 'SELECT id FROM auditoria ORDER BY id LIMIT 1');
  if (!linha) return null;
  try {
    await db.query('UPDATE auditoria SET acao = $1 WHERE id = $2', ['adulterada', linha.id]);
    return false;
  } catch {
    return true;
  }
}
