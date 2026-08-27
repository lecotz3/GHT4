/* =============================================================================
 *  GHT4 · derivação e verificação de senha
 * -----------------------------------------------------------------------------
 *  scrypt da biblioteca padrão do Node, não uma dependência.
 *
 *  POR QUE scrypt E NÃO bcrypt/argon2
 *  Os dois melhores candidatos externos compilam código nativo, e este projeto
 *  roda em Windows sem toolchain de build — instalar viraria um problema
 *  recorrente para quem clonar. scrypt vem no `node:crypto`, é uma função de
 *  derivação com custo de memória (resistente a GPU, que é o ataque real contra
 *  hash de senha) e é recomendação corrente para este uso.
 *
 *  O QUE ESTE MÓDULO GARANTE
 *    · sal aleatório por senha — duas senhas iguais produzem hashes diferentes;
 *    · comparação em tempo constante — não vaza informação pelo tempo de resposta;
 *    · parâmetros gravados junto do hash — dá para endurecer o custo depois sem
 *      invalidar as senhas já existentes.
 *
 *  O QUE ELE NÃO FAZ
 *  Não define política de senha (tamanho mínimo, rotação, vazamento conhecido).
 *  Isso é decisão de negócio e entra com a tela de administração.
 * ========================================================================== */

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

/* N=2^15 é o parâmetro de custo. Sobe com o hardware; por isso vai gravado no
   hash, e não fixo no código de verificação. */
const CUSTO = { N: 32768, r: 8, p: 1 };
const BYTES_SAL = 16;
const BYTES_CHAVE = 64;

/* scrypt precisa de memória proporcional a 128*N*r. Com N=32768 e r=8 dá ~32 MB,
   acima do limite padrão do Node — daí `maxmem` explícito. */
const MAX_MEM = 64 * 1024 * 1024;

/**
 * Deriva a senha. Devolve `{ hash, sal }` para gravar em colunas separadas.
 *
 * O hash sai no formato `scrypt$N$r$p$<base64>`: os parâmetros viajam junto, e
 * uma verificação futura sabe reproduzir exatamente esta derivação mesmo depois
 * de CUSTO ter mudado.
 */
export async function derivar(senha) {
  if (typeof senha !== 'string' || senha.length === 0) {
    throw new TypeError('derivar(): senha vazia');
  }
  const sal = crypto.randomBytes(BYTES_SAL).toString('base64');
  const chave = await scrypt(senha.normalize('NFKC'), sal, BYTES_CHAVE, { ...CUSTO, maxmem: MAX_MEM });
  return {
    hash: `scrypt$${CUSTO.N}$${CUSTO.r}$${CUSTO.p}$${chave.toString('base64')}`,
    sal,
  };
}

/**
 * A senha confere?
 *
 * Devolve `false` para qualquer entrada malformada em vez de lançar: um login
 * com dado corrompido é uma tentativa que falha, não um erro do servidor — e
 * lançar aqui daria ao atacante um sinal a mais.
 */
export async function conferir(senha, hashGravado, sal) {
  if (typeof senha !== 'string' || typeof hashGravado !== 'string' || typeof sal !== 'string') {
    return false;
  }

  const partes = hashGravado.split('$');
  if (partes.length !== 5 || partes[0] !== 'scrypt') return false;

  const N = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let esperado;
  try {
    esperado = Buffer.from(partes[4], 'base64');
  } catch {
    return false;
  }
  if (esperado.length !== BYTES_CHAVE) return false;

  let obtido;
  try {
    obtido = await scrypt(senha.normalize('NFKC'), sal, BYTES_CHAVE, { N, r, p, maxmem: MAX_MEM });
  } catch {
    /* Parâmetros absurdos gravados no banco (ou corrompidos) não derrubam o
       login de todo mundo: esta tentativa falha e as outras seguem. */
    return false;
  }

  return crypto.timingSafeEqual(esperado, obtido);
}

/**
 * O hash foi feito com custo menor que o atual e merece ser refeito?
 *
 * Chame no login bem-sucedido: é o único momento em que a senha em claro está
 * disponível para rederivar.
 */
export function precisaRederivar(hashGravado) {
  const partes = String(hashGravado ?? '').split('$');
  if (partes.length !== 5 || partes[0] !== 'scrypt') return true;
  return Number(partes[1]) < CUSTO.N;
}
