import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A preparação termina e fecha o banco antes de abrir o servidor HTTP.
// Funciona também no plano gratuito, que não oferece pre-deploy command.
const resultado = spawnSync(process.execPath, [fileURLToPath(new URL('./preparar-banco.mjs', import.meta.url))], { stdio: 'inherit' });
if (resultado.error || resultado.status !== 0) {
  console.error('Inicialização interrompida: a preparação do banco não terminou.');
  process.exit(1);
}
await import('../server/src/index.mjs');
