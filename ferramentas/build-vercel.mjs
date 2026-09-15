import { spawnSync } from 'node:child_process';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npm, ['run','build'], {stdio:'inherit',shell:process.platform==='win32'});
if (build.error || build.status !== 0) process.exit(build.status || 1);
// Credenciais de produção só são configuradas no ambiente Production da Vercel.
if (process.env.VERCEL_ENV === 'production') {
  if (!process.env.DATABASE_URL) { console.error('Configure DATABASE_URL em Production antes do deploy do agente.'); process.exit(1); }
  await import('./preparar-banco.mjs');
}
