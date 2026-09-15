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

import { abrir, fechar, tipoAberto } from './db/cliente.mjs';
import { migrar } from './db/migrar.mjs';
import { criarApp } from './app.mjs';
import { configurarIA, criarServicoIA } from './agente/provedor.mjs';
import { validarOperacao } from './operacao/configuracao.mjs';
import { servirInterface } from './operacao/estatico.mjs';
import { ambienteDoServidor } from './operacao/ambiente.mjs';
import { criarCatalogoBanco } from './agente/catalogo-banco.mjs';

const ambiente = ambienteDoServidor();
const PORTA = ambiente.porta;
const HOST = ambiente.host;
const EM_MEMORIA = process.env.GHT4_MEMORIA === '1';

validarOperacao({ ...process.env, GHT4_ORIGEM_PUBLICA: ambiente.origemPublica });
const db = await abrir({ emMemoria: EM_MEMORIA });

/* Migrar na subida: em desenvolvimento é o que evita "esqueci de migrar" virar
   uma hora de depuração. A Fase 9 separa isso do deploy de produção, onde
   migration é passo próprio com rollback documentado. */
const aplicadas = await migrar(db, { silencioso: true });
if (aplicadas.length) console.log(`  migrations aplicadas: ${aplicadas.join(', ')}`);

const app = await criarApp(db, {
  logger: { level: process.env.LOG_NIVEL || 'info' },
  instalacaoInicial: process.env.GHT4_CONFIGURACAO_INICIAL === '1',
  catalogo: ambiente.catalogo === 'banco' ? criarCatalogoBanco(db) : undefined,
  servicoIA: criarServicoIA(db, configurarIA(process.env)),
  origemPublica: ambiente.origemPublica,
});
if(process.env.GHT4_SERVIR_INTERFACE)await servirInterface(app,process.env.GHT4_SERVIR_INTERFACE);

try {
  await app.listen({ port: PORTA, host: HOST });
  console.log(`\n  GHT4 · API em http://${HOST}:${PORTA}`);
  console.log(`  banco: ${tipoAberto()} · ${EM_MEMORIA ? 'memória (some ao encerrar)' : 'persistente'}\n`);
} catch (erro) {
  console.error('não subiu:', erro);
  process.exit(1);
}

let encerrando = false;
async function encerrar() {
    if (encerrando) return;
    encerrando = true;
    console.log('\n  encerrando…');
    await app.close();
    await fechar();
    process.exit(0);
}
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, encerrar);
process.on('message', (m) => { if (m?.acao === 'encerrar') void encerrar(); });
