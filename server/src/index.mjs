/* =============================================================================
 *  GHT4 · sobe o servidor
 * -----------------------------------------------------------------------------
 *  USO
 *    npm run migrar --prefix server     aplica as migrations
 *    npm run dev --prefix server        sobe em http://localhost:3311
 *
 *  Variáveis:
 *    PORTA         padrão 3311
 *    HOST          padrão 127.0.0.1 — só localhost, de propósito. Expor para a
 *                  rede é decisão de quem opera, e vem junto com TLS (Fase 9).
 *    GHT4_MEMORIA  se '1', banco em memória: some ao encerrar. Bom para demo.
 * ========================================================================== */

import { abrir, fechar } from './db/cliente.mjs';
import { migrar } from './db/migrar.mjs';
import { criarApp } from './app.mjs';

const PORTA = Number(process.env.PORTA) || 3311;
const HOST = process.env.HOST || '127.0.0.1';
const EM_MEMORIA = process.env.GHT4_MEMORIA === '1';

const db = await abrir({ emMemoria: EM_MEMORIA });

/* Migrar na subida: em desenvolvimento é o que evita "esqueci de migrar" virar
   uma hora de depuração. A Fase 9 separa isso do deploy de produção, onde
   migration é passo próprio com rollback documentado. */
const aplicadas = await migrar(db, { silencioso: true });
if (aplicadas.length) console.log(`  migrations aplicadas: ${aplicadas.join(', ')}`);

const app = await criarApp(db, {
  logger: { level: process.env.LOG_NIVEL || 'info' },
});

try {
  await app.listen({ port: PORTA, host: HOST });
  console.log(`\n  GHT4 · API em http://${HOST}:${PORTA}`);
  console.log(`  banco: ${EM_MEMORIA ? 'memória (some ao encerrar)' : 'server/.dados'}\n`);
} catch (erro) {
  console.error('não subiu:', erro);
  process.exit(1);
}

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    console.log('\n  encerrando…');
    await app.close();
    await fechar();
    process.exit(0);
  });
}
