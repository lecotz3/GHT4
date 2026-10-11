// Passada exploratória: entra na demonstração e fotografa as telas principais em work/explorar/.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const require = createRequire('C:/Users/Leonardo/AppData/Local/npm-cache/_npx/af752b90495482d7/package.json');
const { chromium } = require('playwright-core');
const demo = JSON.parse(readFileSync(join(aqui, 'demo.json'), 'utf8'));
const pasta = join(aqui, 'explorar'); mkdirSync(pasta, { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.error('[erro]', e.message));
await page.goto(demo.host);
await page.waitForTimeout(1500);
await page.screenshot({ path: join(pasta, '00-login.png') });
await page.getByLabel(/e-?mail/i).fill(demo.email);
await page.getByLabel(/senha/i).first().fill(demo.senha);
await page.getByRole('button', { name: /entrar/i }).click();
await page.waitForTimeout(2500);
const menu = ['Início', 'Pesquisar por tese', 'Encontrar quem decide', 'Meus trabalhos', 'Relacionamentos', 'Oportunidades', 'Equipe e acessos', 'Como usar o agente'];
for (const [k, nome] of menu.entries()) {
  await page.getByRole('button', { name: nome, exact: true }).first().click().catch((e) => console.error(nome, e.message));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(pasta, `${String(k + 1).padStart(2, '0')}-${nome.replace(/\W+/g, '_')}.png`), fullPage: true });
}
await browser.close();
console.log('ok');
