// Fotografa o app real (servidor-demo.mjs) em cada funcionalidade e anota as caixas dos elementos
// que a câmera do vídeo destaca. Saída: work/shots/*.png e work/shots/caixas.json.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const require = createRequire('C:/Users/Leonardo/AppData/Local/npm-cache/_npx/af752b90495482d7/package.json');
const { chromium } = require('playwright-core');
const demo = JSON.parse(readFileSync(join(aqui, process.env.DEMO_ARQ || 'demo.json'), 'utf8'));
const pasta = join(aqui, 'shots'); mkdirSync(pasta, { recursive: true });
const so = process.argv[2] ?? 'tudo';
const caixasArq = join(pasta, 'caixas.json');
const caixas = (() => { try { return JSON.parse(readFileSync(caixasArq, 'utf8')); } catch { return {}; } })();

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });

async function abrir({ largura = 1440, altura = 900, escala = 2, movel = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: escala, isMobile: movel, hasTouch: movel });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[erro]', e.message));
  await page.addInitScript(() => {
    const s = document.createElement('style'); s.textContent = '*,*::before,*::after{caret-color:transparent!important}';
    // Sem o sublinhado do corretor ortográfico nos campos digitados.
    const sem = () => document.querySelectorAll('textarea,input').forEach((e) => { e.spellcheck = false; });
    document.addEventListener('DOMContentLoaded', () => { document.head.appendChild(s); sem(); new MutationObserver(sem).observe(document.body, { childList: true, subtree: true }); });
  });
  await page.goto(demo.host);
  await page.getByLabel(/e-?mail/i).fill(demo.email);
  await page.getByLabel(/senha/i).first().fill(demo.senha);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForTimeout(2000);
  return page;
}
const pausa = (page, ms = 900) => page.waitForTimeout(ms);
async function foto(page, nome, marcas = {}) {
  await page.mouse.move(2, 2);
  await pausa(page, 350);
  await page.screenshot({ path: join(pasta, `${nome}.png`) });
  const reg = {};
  for (const [k, loc] of Object.entries(marcas)) {
    const b = await loc.first().boundingBox().catch(() => null);
    if (b) reg[k] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    else console.warn(`  sem caixa: ${nome}.${k}`);
  }
  caixas[nome] = reg;
  writeFileSync(caixasArq, JSON.stringify(caixas, null, 1));
  console.log('foto', nome, Object.keys(reg).join(','));
}
const menu = (page, nome) => page.getByRole('button', { name: nome, exact: true }).first().click();
const topo = (page) => page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main, [class*=rolagem]').forEach((e) => { e.scrollTop = 0; }); });
async function digitar(page, campo, texto, prefixo, passos = 8) {
  await campo.click();
  const cortes = Array.from({ length: passos }, (_, k) => Math.round(((k + 1) / passos) * texto.length));
  let feito = 0;
  for (const [k, c] of cortes.entries()) {
    await campo.pressSequentially(texto.slice(feito, c), { delay: 0 });
    feito = c;
    await foto(page, `${prefixo}-${k}`, { campo });
  }
}

/* ---------- 1. Encontrar quem decide (gancho, juízo e plano) ---------- */
if (so === 'tudo' || so === 'encontrar') {
  const page = await abrir();
  await menu(page, 'Encontrar quem decide'); await pausa(page, 1200);
  const campo = page.getByRole('textbox').first();
  await foto(page, 'enc-vazio', { campo, botao: page.getByRole('button', { name: 'Encontrar', exact: true }) });
  await digitar(page, campo, 'Quem decide nas distribuidoras de SP com mais de 20 anos', 'enc-dig', 7);
  await page.getByRole('button', { name: 'Encontrar', exact: true }).click();
  await page.getByText(/pessoas atendem/).first().waitFor();
  await pausa(page, 800);
  await page.getByText(/pessoas atendem/).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -260));
  await foto(page, 'enc-res', { resumo: page.getByText(/pessoas atendem/), funil: page.getByText('Atendem ao pedido').locator('..').locator('..'), leitura: page.getByText('Como li o pedido').locator('..') });
  // O primeiro cartão de quem atende, com o juízo aberto.
  const juizo = page.getByRole('button', { name: 'Ver o juízo' }).first();
  await juizo.click(); await pausa(page);
  const tabela = page.getByRole('table').first();
  await tabela.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await foto(page, 'enc-juizo', { tabela, cartao: tabela.locator('xpath=ancestor::*[contains(@class,"rounded") or self::article or self::li][1]') });
  await juizo.click().catch(() => {});
  // O plano de acesso do mesmo cartão.
  await page.getByRole('button', { name: 'Plano de acesso' }).first().click(); await pausa(page, 1500);
  const chegar = page.getByText('Chegar a quem decide').first();
  await chegar.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -120));
  await foto(page, 'plano-1', { chegar, quem: page.getByText('Quem decide', { exact: true }).first() });
  const ceis = page.getByText(/CEIS/).first();
  await ceis.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await foto(page, 'plano-2', { ceis });
  // Onde falta quem decide.
  const falta = page.getByText('Onde falta quem decide').first();
  await falta.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -40));
  await foto(page, 'enc-lacunas', { falta });
  await page.close();
}

/* ---------- 2. Pela rede e leitura com IA ---------- */
if (so === 'tudo' || so === 'rede') {
  const page = await abrir();
  await menu(page, 'Encontrar quem decide'); await pausa(page, 1200);
  const campo = page.getByRole('textbox').first();
  await campo.fill('Quem decide nas distribuidoras de SP com mais de 20 anos que a casa conhece');
  await page.getByRole('button', { name: 'Encontrar', exact: true }).click();
  await page.getByText(/pessoas? atende/).first().waitFor(); await pausa(page);
  const caminho = page.getByText(/Relação confirmada|Introdução viável|apresentar/i).first();
  await caminho.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await foto(page, 'rede-encontrar', { caminho, resumo: page.getByText(/pessoas? atende/) });
  // IA opcional: um pedido que as regras não leem por inteiro.
  await topo(page); await pausa(page, 300);
  await campo.fill(demo.pedidoIA);
  await page.getByRole('button', { name: 'Encontrar', exact: true }).click();
  await page.getByText(/pessoas? atende/).first().waitFor(); await pausa(page);
  const oferta = page.getByRole('button', { name: /IA/ }).first();
  await oferta.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await foto(page, 'ia-oferta', { oferta, leitura: page.getByText('Como li o pedido').locator('..') });
  await oferta.click(); await pausa(page, 2200);
  await page.getByText('Como li o pedido').first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -160));
  await foto(page, 'ia-lida', { leitura: page.getByText('Como li o pedido').locator('..'), resumo: page.getByText(/pessoas? atende/) });
  // Relacionamentos: visão geral e reconhecimento.
  await menu(page, 'Relacionamentos'); await pausa(page, 1500); await topo(page);
  await foto(page, 'rel-geral', { numeros: page.getByText('Pessoas nas empresas').locator('..').locator('..') });
  await page.getByRole('button', { name: /Reconhecimento/ }).first().click(); await pausa(page, 1800);
  const pergunta = page.getByText('Você conhece esta pessoa?').first();
  await pergunta.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await foto(page, 'rel-reconhecimento', { pergunta });
  await page.close();
}

/* ---------- 3. Pesquisa por tese ---------- */
if (so === 'tudo' || so === 'tese') {
  const page = await abrir();
  await menu(page, 'Pesquisar por tese'); await pausa(page, 1200);
  const campo = page.getByRole('textbox').first();
  await foto(page, 'tese-vazio', { campo });
  await digitar(page, campo, 'Distribuidoras químicas em SP com mais de 20 anos, sem sócio estrangeiro e com filiais', 'tese-dig', 7);
  await page.getByRole('button', { name: /Montar critérios/ }).click();
  await page.getByText('Critérios desta pesquisa').first().waitFor(); await pausa(page, 1200);
  await foto(page, 'tese-criterios', { criterios: page.getByText('Critérios desta pesquisa').locator('..').locator('..'), funil: page.getByText('No recorte').first().locator('..').locator('..') });
  await page.getByRole('button', { name: /Aplicar critérios/ }).click(); await pausa(page, 3000);
  const grupo = page.locator('details.pesquisa-grupo').first();
  await grupo.evaluate((e) => e.scrollIntoView({ block: 'start' })).catch(() => {});
  await page.evaluate(() => window.scrollBy(0, -140));
  await foto(page, 'tese-resultado', { grupo, funil: page.getByText('No recorte').first().locator('..').locator('..') });
  // Detalhe de uma empresa: cada veredito com a fonte.
  await page.locator('button.pesquisa-empresa').first().click(); await pausa(page);
  const det = page.locator('.pesquisa-detalhe-linha').first();
  await det.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await foto(page, 'tese-detalhe', { det });
  await page.close();
}

/* ---------- 4. Oportunidades, trabalhos e equipe ---------- */
if (so === 'tudo' || so === 'crm') {
  const page = await abrir();
  await menu(page, 'Oportunidades'); await pausa(page, 1500); await topo(page);
  await foto(page, 'opo-painel', { etapas: page.getByText('Por etapa').locator('..').locator('..') });
  const lista = page.getByText(/oportunidades neste recorte/).first();
  await lista.evaluate((e) => e.scrollIntoView({ block: 'start' })).catch(() => {});
  await page.evaluate(() => window.scrollBy(0, -20));
  await foto(page, 'opo-cartoes', {});
  await page.getByRole('button', { name: 'Quadro', exact: true }).first().click().catch(() => {}); await pausa(page, 1200);
  await lista.evaluate((e) => e.scrollIntoView({ block: 'start' })).catch(() => {});
  await page.evaluate(() => window.scrollBy(0, -20));
  await foto(page, 'opo-quadro', {});
  await page.getByRole('button', { name: 'Cartões', exact: true }).first().click().catch(() => {}); await pausa(page, 1000);
  await page.getByRole('button', { name: /Abrir oportunidade/ }).first().click(); await pausa(page, 1500);
  await topo(page);
  await foto(page, 'opo-detalhe', {});
  // "Não contatar" nesta oportunidade da demonstração, para mostrar o aviso.
  await page.getByText('Definir ou revisar restrição de contato').first().click(); await pausa(page, 600);
  const marca = page.getByRole('checkbox', { name: 'Não contatar' });
  if (!(await marca.isChecked())) await marca.check();
  await page.getByLabel('Categoria').selectOption('solicitacao_da_empresa').catch(() => {});
  await page.getByLabel('Justificativa').fill('Os sócios pediram para não serem procurados até o fim do ano.');
  await page.getByRole('button', { name: 'Salvar restrição' }).click(); await pausa(page, 1500);
  const aviso = page.getByText('Não contatar esta empresa neste espaço.').first();
  await aviso.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
  await foto(page, 'opo-restricao', { aviso });
  await menu(page, 'Meus trabalhos'); await pausa(page, 1500); await topo(page);
  await foto(page, 'trabalhos', {});
  await menu(page, 'Equipe e acessos'); await pausa(page, 1500); await topo(page);
  await foto(page, 'equipe', {});
  await page.getByRole('button', { name: /Espaços/ }).first().click().catch(() => {}); await pausa(page, 1000);
  await foto(page, 'equipe-espacos', {});
  await menu(page, 'Início'); await pausa(page, 1500); await topo(page);
  await foto(page, 'inicio', {});
  await page.close();
}

/* ---------- 5. Celular ---------- */
if (so === 'tudo' || so === 'celular') {
  const page = await abrir({ largura: 390, altura: 844, escala: 3, movel: true });
  await page.getByRole('button', { name: /menu/i }).first().click().catch(() => {}); await pausa(page, 600);
  await page.getByRole('button', { name: 'Encontrar quem decide', exact: true }).first().click(); await pausa(page, 1200);
  const campo = page.getByRole('textbox').first();
  await campo.fill('Quem decide nas distribuidoras de SP com mais de 20 anos');
  await page.getByRole('button', { name: 'Encontrar', exact: true }).click();
  await page.getByText(/pessoas atendem/).first().waitFor(); await pausa(page);
  await page.getByText(/pessoas atendem/).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -74));
  await foto(page, 'cel-res', {});
  await page.getByRole('button', { name: 'Ver o juízo' }).first().click(); await pausa(page);
  await page.getByRole('table').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await foto(page, 'cel-juizo', {});
  await page.close();
}
await browser.close();
