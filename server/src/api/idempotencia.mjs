/* =============================================================================
 *  GHT4 · idempotência de requisição
 * -----------------------------------------------------------------------------
 *  Uma requisição repetida não pode produzir dois efeitos. Isso acontece o tempo
 *  todo: o usuário clica duas vezes, a rede reenvia, o agente tenta de novo
 *  depois de um timeout. Sem proteção, "promover empresa no CRM" vira duas
 *  promoções, e "gerar lista" vira duas listas.
 *
 *  COMO FUNCIONA
 *  O cliente manda `Idempotency-Key`. A primeira chamada reserva a chave e
 *  executa; a repetição encontra a chave e devolve a resposta guardada, sem
 *  executar de novo.
 *
 *  A MESMA CHAVE COM CORPO DIFERENTE É ERRO
 *  Devolver a resposta antiga nesse caso esconderia um bug do cliente — ele
 *  acha que mandou B e recebeu a resposta de A. Responde-se 409.
 *
 *  DUAS CHAMADAS AO MESMO TEMPO
 *  A reserva é um INSERT com chave primária: a segunda esbarra na unicidade e
 *  recebe 409 `em_curso`. É o banco arbitrando, não a aplicação — que é a única
 *  forma que funciona com mais de um processo servindo.
 * ========================================================================== */

import crypto from 'node:crypto';
import { consultarUm } from '../db/cliente.mjs';
import { ErroHttp } from '../app.mjs';

function hashDoCorpo(corpo) {
  const texto = corpo === undefined || corpo === null ? '' : JSON.stringify(corpo);
  return crypto.createHash('sha256').update(texto).digest('hex');
}

/**
 * Envolve o efeito de uma rota.
 *
 * Sem cabeçalho `Idempotency-Key`, executa direto — a proteção é opcional e
 * quem pede é o cliente. Rotas de efeito sensível devem EXIGIR a chave; ver
 * `exigirChave`.
 *
 * @param {object} db
 * @param {object} req      requisição do Fastify
 * @param {Function} efeito o que fazer. Deve devolver `{ status, corpo }`.
 */
export async function comIdempotencia(db, req, efeito) {
  const chave = req.headers['idempotency-key'];
  if (!chave) return efeito();

  if (typeof chave !== 'string' || chave.length < 8 || chave.length > 200) {
    throw new ErroHttp(400, 'chave_invalida',
      'Idempotency-Key deve ter entre 8 e 200 caracteres.');
  }

  const corpoHash = hashDoCorpo(req.body);
  const rota = `${req.method} ${req.routeOptions?.url ?? req.url}`;

  const existente = await consultarUm(
    db, 'SELECT * FROM chaves_idempotencia WHERE chave = $1', [chave],
  );

  if (existente) {
    if (existente.corpo_hash !== corpoHash) {
      throw new ErroHttp(409, 'chave_reutilizada',
        'Esta Idempotency-Key já foi usada com outro corpo. Use uma chave nova.');
    }
    if (existente.situacao === 'em_curso') {
      throw new ErroHttp(409, 'em_curso',
        'Uma requisição com esta chave ainda está em andamento.');
    }
    /* Repetição legítima: devolve o que a primeira produziu, sem reexecutar. */
    return {
      status: existente.status_http ?? 200,
      corpo: existente.resposta,
      repetida: true,
    };
  }

  try {
    await db.query(
      `INSERT INTO chaves_idempotencia (chave, usuario_id, rota, corpo_hash)
       VALUES ($1, $2, $3, $4)`,
      [chave, req.usuario?.id ?? null, rota, corpoHash],
    );
  } catch {
    /* Outra requisição ganhou a corrida entre o SELECT e o INSERT. */
    throw new ErroHttp(409, 'em_curso',
      'Uma requisição com esta chave ainda está em andamento.');
  }

  try {
    const resultado = await efeito();
    await db.query(
      `UPDATE chaves_idempotencia
          SET situacao = 'concluida', resposta = $2, status_http = $3, concluido_em = now()
        WHERE chave = $1`,
      [chave, JSON.stringify(resultado?.corpo ?? null), resultado?.status ?? 200],
    );
    return { ...resultado, repetida: false };
  } catch (erro) {
    /* Marca como falha em vez de apagar: apagar deixaria a repetição executar de
       novo, que é exatamente o que se quer evitar quando não se sabe se o efeito
       chegou a acontecer. */
    await db.query(
      `UPDATE chaves_idempotencia SET situacao = 'falhou', concluido_em = now()
        WHERE chave = $1`, [chave],
    );
    throw erro;
  }
}

/** Rotas de efeito sensível exigem a chave em vez de aceitá-la. */
export function exigirChave(req) {
  if (!req.headers['idempotency-key']) {
    throw new ErroHttp(400, 'chave_obrigatoria',
      'Esta operação exige o cabeçalho Idempotency-Key.');
  }
}

/** Remove chaves velhas. Roda por job; 7 dias cobre qualquer retry sensato. */
export async function limparAntigas(db, { dias = 7 } = {}) {
  const r = await db.query(
    `DELETE FROM chaves_idempotencia WHERE criado_em < now() - ($1 || ' days')::INTERVAL`,
    [String(dias)],
  );
  return r.affectedRows ?? 0;
}
