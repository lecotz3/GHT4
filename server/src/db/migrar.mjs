/* =============================================================================
 *  GHT4 · executor de migrations
 * -----------------------------------------------------------------------------
 *  SQL puro, numerado, aplicado uma vez e registrado. Sem ORM.
 *
 *  POR QUE SEM ORM
 *  O plano permite "Drizzle ou equivalente tipado, escolhido uma vez e
 *  documentado". A escolha aqui é SQL explícito com validação Zod na fronteira,
 *  por três motivos:
 *
 *    · Este produto precisa explicar de onde veio cada número. SQL que se lê é
 *      auditável; SQL gerado por ORM é mais uma camada entre a pergunta do sócio
 *      e a resposta.
 *    · O projeto tem cultura de dependência mínima — o `.xlsx` é escrito à mão
 *      para não depender de npm. Um ORM contraria isso sem ganho proporcional.
 *    · A tipagem que importa é a da FRONTEIRA (o que entra pela API, o que sai
 *      para a tela), e essa fica com Zod, que já é dependência.
 *
 *  CADA MIGRATION RODA DENTRO DE UMA TRANSAÇÃO. Falhou no meio, não aplicou
 *  nada — não existe banco meio migrado.
 *
 *  USO
 *    node src/db/migrar.mjs
 *    node src/db/migrar.mjs --status
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { abrir, consultar, fechar } from './cliente.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PASTA = path.join(AQUI, 'migracoes');

const TABELA = `
  CREATE TABLE IF NOT EXISTS migracoes (
    nome        TEXT PRIMARY KEY,
    hash        TEXT NOT NULL,
    aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

/** As migrations em disco, em ordem de nome (que é a ordem de aplicação). */
export function migracoesEmDisco() {
  if (!fs.existsSync(PASTA)) return [];
  return fs.readdirSync(PASTA)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((nome) => {
      const sql = fs.readFileSync(path.join(PASTA, nome), 'utf8');
      return {
        nome,
        sql,
        hash: crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16),
      };
    });
}

/**
 * Aplica o que falta. Idempotente: rodar duas vezes não faz nada na segunda.
 *
 * @returns {Promise<string[]>} nomes das migrations aplicadas nesta chamada.
 */
export async function migrar(db, { silencioso = false } = {}) {
  await db.exec(TABELA);

  const jaAplicadas = new Map(
    (await consultar(db, 'SELECT nome, hash FROM migracoes')).map((r) => [r.nome, r.hash]),
  );

  const aplicadas = [];

  for (const m of migracoesEmDisco()) {
    const hashAnterior = jaAplicadas.get(m.nome);

    if (hashAnterior !== undefined) {
      /* Migration já aplicada que mudou em disco. Reaplicar produziria um banco
         diferente do que o histórico afirma, e ficar calado é pior: o time
         passaria a ter esquemas divergentes sem saber. */
      if (hashAnterior !== m.hash) {
        throw new Error(
          `a migration ${m.nome} já foi aplicada mas seu conteúdo mudou ` +
          `(${hashAnterior} → ${m.hash}). Migration aplicada não se edita: crie a próxima.`,
        );
      }
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query('INSERT INTO migracoes (nome, hash) VALUES ($1, $2)', [m.nome, m.hash]);
    });

    aplicadas.push(m.nome);
    if (!silencioso) console.log(`  ✓ ${m.nome}`);
  }

  if (!silencioso && aplicadas.length === 0) console.log('  · nada a aplicar');
  return aplicadas;
}

/* ---- execução direta ------------------------------------------------------ */
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrar.mjs')) {
  const db = await abrir();

  if (process.argv.includes('--status')) {
    await db.exec(TABELA);
    const aplicadas = new Set(
      (await consultar(db, 'SELECT nome FROM migracoes')).map((r) => r.nome),
    );
    console.log('\nGHT4 · migrations\n');
    for (const m of migracoesEmDisco()) {
      console.log(`  ${aplicadas.has(m.nome) ? '✓' : '·'} ${m.nome}`);
    }
    console.log('');
  } else {
    console.log('\nGHT4 · aplicando migrations\n');
    await migrar(db);
    console.log('');
  }

  await fechar();
}
