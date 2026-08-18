/* =============================================================================
 *  GHT4 · gerador de PDF (Módulo 9 — "análise exportada em PDF")
 * -----------------------------------------------------------------------------
 *  Uso:  node ferramentas/gerar-pdf.mjs [pagina.html] [saida.pdf]
 *        node ferramentas/gerar-pdf.mjs fundamentos.html ~/Downloads/Fundamentos.pdf
 *
 *  Imprime pela engine nativa do Chrome, sem dependência de npm — mesma decisão
 *  do resto do projeto. A folha `@media print` da própria página é quem manda no
 *  layout; aqui só entram as opções que o CSS não alcança.
 *
 *  O aviso de confidencialidade vai no RODAPÉ CORRIDO, não na tarja preta do
 *  topo: o Chrome pinta `position:fixed` só na primeira folha, e um PDF circula
 *  solto — é a página avulsa que vaza. O rodapé o Chrome repete de verdade.
 * ========================================================================== */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

const PAGINA = process.argv[2] ?? 'fundamentos.html';
const SAIDA = path.resolve(process.argv[3] ?? `GHT4-${path.parse(PAGINA).name}.pdf`);
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const chrome = CHROMES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error('Chrome não encontrado. Instale-o ou abra a página e use Ctrl+P → Salvar como PDF.');
  process.exit(1);
}

/* Servidor estático efêmero: o Chrome headless recusa boa parte do que precisa
   em file://, e a página tem de ser servida igual à do protótipo. */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const servidor = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const alvo = path.resolve(RAIZ, rel);
  if (!alvo.startsWith(RAIZ)) return res.writeHead(403).end('403');
  import('node:fs').then(({ readFile }) => readFile(alvo, (e, d) => {
    if (e) return res.writeHead(404).end('404');
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo).toLowerCase()] ?? 'application/octet-stream' }).end(d);
  }));
});
await new Promise((r) => servidor.listen(0, r));
const porta = servidor.address().port;

const perfil = path.join(os.tmpdir(), `ght4-pdf-${Date.now()}`);
mkdirSync(perfil, { recursive: true });
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });

/* O Chrome anuncia a porta do protocolo em stderr; é mais confiável que fixar
   um número e torcer para estar livre. */
const portaCDP = await new Promise((ok, no) => {
  const prazo = setTimeout(() => no(new Error('Chrome não anunciou a porta de depuração em 20 s')), 20000);
  proc.stderr.on('data', (d) => {
    const m = String(d).match(/ws:\/\/127\.0\.0\.1:(\d+)/);
    if (m) { clearTimeout(prazo); ok(Number(m[1])); }
  });
});

const alvos = await (await fetch(`http://127.0.0.1:${portaCDP}/json/list`)).json();
const ws = new WebSocket(alvos.find((t) => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const cmd = (m, p = {}) => new Promise((ok, no) => { pend.set(++id, { ok, no }); ws.send(JSON.stringify({ id, method: m, params: p })); });
await new Promise((r) => ws.addEventListener('open', r));
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { const { ok, no } = pend.get(m.id); pend.delete(m.id); m.error ? no(new Error(JSON.stringify(m.error))) : ok(m.result); }
});

await cmd('Page.enable');
const carregou = new Promise((r) => {
  const h = (e) => { if (JSON.parse(e.data).method === 'Page.loadEventFired') { ws.removeEventListener('message', h); r(); } };
  ws.addEventListener('message', h);
});
await cmd('Page.navigate', { url: `http://127.0.0.1:${porta}/${PAGINA}` });
await Promise.race([carregou, new Promise((r) => setTimeout(r, 15000))]);
await new Promise((r) => setTimeout(r, 1500));   // fontes e layout assentarem

const rodape =
  '<div style="width:100%;font:8px -apple-system,Segoe UI,sans-serif;color:#6B6B6B;' +
  'padding:0 13mm;display:flex;justify-content:space-between;align-items:center">' +
  '<span><b style="color:#FF6E00">CONFIDENCIAL</b> &middot; GHT4 &middot; documento de apoio &agrave; reuni&atilde;o de levantamento</span>' +
  '<span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>';

const { data } = await cmd('Page.printToPDF', {
  printBackground: true,          // sem isto a tarja preta e o laranja somem
  preferCSSPageSize: true,        // respeita o @page da folha de impressão
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: rodape,
});

writeFileSync(SAIDA, Buffer.from(data, 'base64'));
console.log(`PDF gerado: ${SAIDA}`);
console.log(`${(Buffer.from(data, 'base64').length / 1024).toFixed(0)} KB`);

ws.close(); servidor.close(); proc.kill();
process.exit(0);
