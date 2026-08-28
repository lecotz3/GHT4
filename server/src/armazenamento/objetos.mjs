/* =============================================================================
 *  GHT4 · object storage
 * -----------------------------------------------------------------------------
 *  A camada raw guarda os arquivos como chegaram. Em produção isso é S3; em
 *  desenvolvimento é disco local. O contrato é o mesmo — `por`, `obter`,
 *  `listar`, `remover`, `existe` — para trocar a implementação sem tocar em
 *  quem chama.
 *
 *  DUAS REGRAS QUE VALEM NAS DUAS IMPLEMENTAÇÕES
 *
 *  1. O hash é calculado durante a escrita, em streaming. Guardar 5 GB na
 *     memória para depois hashear derrota o propósito de streamar.
 *
 *  2. Escrita é atômica: grava em arquivo temporário e renomeia. Um processo
 *     morto no meio deixa lixo temporário, nunca um objeto pela metade que a
 *     próxima leitura tomaria por completo.
 *
 *  A chave carrega o hash: `raw/rfb_cnpj/2026-08/<hash>-empresas.zip`. Isso
 *  torna o armazenamento endereçado por conteúdo — o mesmo arquivo enviado duas
 *  vezes ocupa um lugar só, e reprocessar é garantidamente idêntico.
 * ========================================================================== */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { RAIZ_SERVIDOR } from '../db/cliente.mjs';

const RAIZ_OBJETOS = process.env.OBJETOS_DIR || path.join(RAIZ_SERVIDOR, '.dados', 'objetos');

/** Barra a fuga do diretório: `../` numa chave viraria escrita fora da raiz. */
function resolverSeguro(chave) {
  if (typeof chave !== 'string' || chave.length === 0) {
    throw new TypeError('chave de objeto vazia');
  }
  if (chave.includes('\0')) throw new TypeError('chave de objeto com byte nulo');

  const limpa = chave.replace(/\\/g, '/');

  /* Caminho absoluto é recusado em vez de normalizado.
     Aparar a barra da frente faria "/etc/passwd" virar a chave "etc/passwd" —
     que não escapa do armazenamento, mas grava num lugar que ninguém pediu e
     esconde o bug de quem chamou. Recusar mostra o bug na hora. */
  if (limpa.startsWith('/') || /^[a-zA-Z]:/.test(limpa)) {
    throw new Error(`chave de objeto aponta para fora do armazenamento: ${chave}`);
  }

  const alvo = path.resolve(RAIZ_OBJETOS, limpa);
  const raiz = path.resolve(RAIZ_OBJETOS);

  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) {
    throw new Error(`chave de objeto aponta para fora do armazenamento: ${chave}`);
  }
  return alvo;
}

/** Monta a chave canônica de um ativo raw. */
export function chaveDeAtivo({ fonte, referencia, hash, nomeArquivo }) {
  const nome = path.basename(nomeArquivo).replace(/[^\w.\-]/g, '_');
  return `raw/${fonte}/${referencia}/${hash.slice(0, 16)}-${nome}`;
}

/**
 * Grava um objeto a partir de um stream, hasheando durante a escrita.
 *
 * @returns {Promise<{chave, hash, tamanho}>}
 */
export async function por(chave, origem) {
  const alvo = resolverSeguro(chave);
  await fsp.mkdir(path.dirname(alvo), { recursive: true });

  const temporario = `${alvo}.${process.pid}.${Date.now()}.tmp`;
  const hash = crypto.createHash('sha256');
  let tamanho = 0;

  const entrada = origem instanceof Readable
    ? origem
    : Readable.from(Buffer.isBuffer(origem) ? origem : Buffer.from(String(origem)));

  /* Passa pelo hash antes de chegar ao disco: um arquivo grande nunca precisa
     estar inteiro na memória. */
  entrada.on('data', (pedaco) => {
    hash.update(pedaco);
    tamanho += pedaco.length;
  });

  try {
    await pipeline(entrada, fs.createWriteStream(temporario));
    await fsp.rename(temporario, alvo);
  } catch (erro) {
    await fsp.rm(temporario, { force: true });
    throw erro;
  }

  return { chave, hash: hash.digest('hex'), tamanho };
}

/** Stream de leitura. Para arquivo grande, nunca `readFile`. */
export function obterStream(chave) {
  return fs.createReadStream(resolverSeguro(chave));
}

/** Conteúdo inteiro. Só para objeto pequeno — manifesto, relatório. */
export async function obter(chave) {
  return fsp.readFile(resolverSeguro(chave));
}

export async function existe(chave) {
  try {
    await fsp.access(resolverSeguro(chave));
    return true;
  } catch {
    return false;
  }
}

/** Tamanho e data, sem ler o conteúdo. */
export async function estatisticas(chave) {
  const s = await fsp.stat(resolverSeguro(chave));
  return { tamanho: s.size, modificadoEm: s.mtime };
}

/** Chaves sob um prefixo, recursivamente. */
export async function listar(prefixo = '') {
  const base = resolverSeguro(prefixo);
  const raiz = path.resolve(RAIZ_OBJETOS);
  const achadas = [];

  async function varrer(dir) {
    let entradas;
    try {
      entradas = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return; // prefixo que não existe é lista vazia, não erro
    }
    for (const e of entradas) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) await varrer(completo);
      else if (!e.name.endsWith('.tmp')) {
        achadas.push(path.relative(raiz, completo).replace(/\\/g, '/'));
      }
    }
  }

  await varrer(base);
  return achadas.sort();
}

/**
 * Remove um objeto.
 *
 * Objeto raw referenciado por um ativo NÃO deve ser removido — é o que sustenta
 * a reprodutibilidade. Quem chama é responsável por conferir; esta função não
 * consulta o banco de propósito, para não amarrar o armazenamento ao esquema.
 */
export async function remover(chave) {
  await fsp.rm(resolverSeguro(chave), { force: true });
}

/**
 * Hash de um objeto já gravado, em streaming.
 *
 * Consome o stream direto, sem escoá-lo para um dispositivo nulo. A primeira
 * versão daqui usava `/dev/null` — e no Windows criou um arquivo chamado `NUL`
 * dentro do projeto, porque lá o dispositivo nulo é `\\.\NUL` e o resto vira
 * nome comum. Não há sink nenhum a preencher: basta ler.
 */
export async function hashDe(chave) {
  const hash = crypto.createHash('sha256');
  for await (const pedaco of obterStream(chave)) hash.update(pedaco);
  return hash.digest('hex');
}

/** Onde os objetos vivem. Útil em log e runbook. */
export function raiz() {
  return RAIZ_OBJETOS;
}
