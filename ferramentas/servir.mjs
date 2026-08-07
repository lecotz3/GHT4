/* =============================================================================
 *  GHT4 · servidor estático mínimo (só para apresentar)
 * -----------------------------------------------------------------------------
 *  Uso:  node ferramentas/servir.mjs [porta]
 *
 *  O protótipo roda perfeitamente com duplo-clique no index.html. Este servidor
 *  existe para dois casos: apresentar numa rede (abrir do celular ou de outra
 *  máquina) e evitar restrições de file:// em navegadores mais fechados.
 *  Sem dependências — só a biblioteca padrão do Node.
 * ========================================================================== */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.argv[2]) || 8000;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const servidor = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const alvo = path.resolve(RAIZ, rel);

  // nunca servir nada fora da pasta do projeto
  if (!alvo.startsWith(RAIZ)) { res.writeHead(403).end('403'); return; }

  fs.readFile(alvo, (erro, dados) => {
    if (erro) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<p style="font-family:sans-serif">404 — <code>${rel}</code> não encontrado.</p>`);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(dados);
  });
});

servidor.listen(PORTA, () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  GHT4 · Livro-razão de Prospecção');
  console.log('  ─────────────────────────────────');
  console.log(`  local:  http://localhost:${PORTA}`);
  ips.forEach(ip => console.log(`  rede:   http://${ip}:${PORTA}`));
  console.log(`\n  fundamentos:  http://localhost:${PORTA}/fundamentos.html`);
  console.log('\n  Ctrl+C para parar.\n');
});
