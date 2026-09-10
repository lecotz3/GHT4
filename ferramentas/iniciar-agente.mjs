import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const portaApi = Number(process.env.PORTA || 3311);
const portaWeb = Number(process.env.GHT4_PORTA_WEB || 5173);
const filhos = [];
let encerrando = false;

async function portaLivre(porta) {
  if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) throw new Error('Porta inválida. Use um número entre 1024 e 65535.');
  await new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', () => reject(new Error(`A porta ${porta} está ocupada. Feche a instância anterior ou escolha outra porta.`)));
    s.listen(porta, '127.0.0.1', () => s.close(resolve));
  });
}
function subir(arquivo, argumentos, env, ipc = false) {
  const filho = spawn(process.execPath, [arquivo, ...argumentos], {
    cwd: raiz, env: { ...process.env, ...env }, windowsHide: true,
    stdio: ipc ? ['ignore', 'inherit', 'inherit', 'ipc'] : ['ignore', 'inherit', 'inherit'],
  });
  filhos.push(filho);
  filho.on('error', (e) => { console.error('Não foi possível iniciar:', e.message); encerrar(1); });
  filho.on('exit', (codigo) => { if (!encerrando) encerrar(codigo || 0); });
  return filho;
}
function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  for (const f of filhos) {
    if (f.connected) f.send({ acao: 'encerrar' });
    else if (f.exitCode === null) f.kill();
  }
  const prazo = setTimeout(() => { for (const f of filhos) if (f.exitCode === null) f.kill(); }, 5000);
  Promise.all(filhos.map((f) => f.exitCode !== null || f.signalCode !== null ? Promise.resolve()
    : new Promise((resolve) => f.once('exit', resolve)))).then(() => { clearTimeout(prazo); process.exit(codigo); });
}

async function aguardarApi() {
  const prazo = Date.now() + 30000;
  while (Date.now() < prazo) {
    try {
      const r = await fetch(`http://127.0.0.1:${portaApi}/api/saude`, { signal: AbortSignal.timeout(1000) });
      if (r.ok && (await r.json()).ok === true) return;
    } catch { /* A API ainda está abrindo o banco. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('A API não ficou pronta em 30 segundos. Confira a saída do servidor.');
}

try {
  for (const arquivo of ['server/node_modules/fastify/package.json', 'v1/node_modules/vite/bin/vite.js']) {
    if (!existsSync(path.join(raiz, arquivo))) throw new Error('Instale as dependências com npm ci --prefix server e npm ci --prefix v1.');
  }
  await portaLivre(portaApi); await portaLivre(portaWeb);
  if (portaApi === portaWeb) throw new Error('A API e a interface precisam de portas diferentes.');
  subir(path.join(raiz, 'server/src/index.mjs'), [], {
    PORTA: String(portaApi), HOST: '127.0.0.1', GHT4_APENAS_LOCAL: '1', GHT4_CONFIGURACAO_INICIAL: '1',
  }, true);
  await aguardarApi();
  subir(path.join(raiz, 'v1/node_modules/vite/bin/vite.js'), [path.join(raiz, 'v1'), '--host', '127.0.0.1', '--port', String(portaWeb), '--strictPort'],
    { GHT4_API_URL: `http://127.0.0.1:${portaApi}` });
  console.log(`\nGHT4 · abra http://127.0.0.1:${portaWeb}\nNa primeira abertura, crie seu acesso pela tela.\nBanco local persistente; nenhum banco externo é usado por este iniciador.\nPara encerrar, pressione Ctrl+C.\n`);
} catch (e) { console.error(e.message); encerrar(1); }
process.on('SIGINT', () => encerrar());
process.on('SIGTERM', () => encerrar());
process.on('message', (m) => { if (m?.acao === 'encerrar') encerrar(); });
