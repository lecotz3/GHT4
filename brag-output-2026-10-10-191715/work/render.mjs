// Renderiza stage.html quadro a quadro.
//   node render.mjs stills 0.5,3.0,...   → work/stills/t_XX.png
//   node render.mjs video                → work/video-sem-audio.mp4
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('C:/Users/Leonardo/AppData/Local/npm-cache/_npx/af752b90495482d7/package.json');
const { chromium } = require('playwright-core');
const aqui = dirname(fileURLToPath(import.meta.url));
export const FPS = 30, DURACAO = 45.0;
const POSTER = Number(process.env.POSTER ?? 14.6);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG || 'C:/Users/Leonardo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.error('[pagina]', m.text()); });
page.on('pageerror', (e) => console.error('[erro]', e.message));
await page.goto(pathToFileURL(join(aqui, 'stage.html')).href, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.pronto === true, null, { timeout: 60000 });

const quadro = async (t, tipo = 'png') => {
  await page.evaluate((x) => window.render(x), t);
  return page.screenshot({ type: tipo, quality: tipo === 'jpeg' ? 95 : undefined });
};

const [modo, lista] = process.argv.slice(2);
if (modo === 'stills') {
  mkdirSync(join(aqui, 'stills'), { recursive: true });
  for (const t of lista.split(',').map(Number)) writeFileSync(join(aqui, 'stills', `t_${t.toFixed(2)}.png`), await quadro(t));
} else if (modo === 'video') {
  const total = Math.round(DURACAO * FPS);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(aqui, 'video-sem-audio.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < total; i++) {
    // O quadro 0 é o pôster (um quadro assentado): a miniatura de qualquer plataforma mostra ele.
    const buf = await quadro(i === 0 ? POSTER : i / FPS, 'jpeg');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`quadro ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg ' + c)))));
}
await browser.close();
