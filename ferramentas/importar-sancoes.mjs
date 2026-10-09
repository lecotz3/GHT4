/* =============================================================================
 *  GHT4 · sanções públicas a empresas (CEIS e CNEP) → data-sancoes.js
 * -----------------------------------------------------------------------------
 *  Fonte: Portal da Transparência (Controladoria-Geral da União), dados abertos,
 *  download sem chave nem cadastro:
 *    CEIS  Cadastro de Empresas Inidôneas e Suspensas
 *    CNEP  Cadastro Nacional de Empresas Punidas (Lei 12.846, anticorrupção)
 *
 *  POR QUE ISSO IMPORTA EM M&A
 *  É diligência de primeira hora. Empresa impedida de contratar com o poder
 *  público, ou punida pela Lei Anticorrupção, muda a conversa antes de ela
 *  começar — e descobrir isso depois da primeira reunião custa caro à casa.
 *
 *  LGPD
 *  Os arquivos trazem pessoas físicas (CPF e nome). Ficam fora NA LEITURA: só
 *  entra registro de PESSOA JURÍDICA cuja raiz de CNPJ está no catálogo, e só os
 *  campos da sanção — cadastro, código, categoria, datas, órgão, esfera, UF e
 *  abrangência. Nome de sancionado, processo e fundamentação não são gravados.
 *
 *  USO
 *    node ferramentas/importar-sancoes.mjs                    baixa o dia mais recente publicado
 *    node ferramentas/importar-sancoes.mjs --data=20261008    dia específico (AAAAMMDD)
 *    node ferramentas/importar-sancoes.mjs --ceis=a.zip --cnep=b.zip   zips já baixados
 *    node ferramentas/importar-sancoes.mjs --ensaio           conta, sem gravar
 *
 *  SEM DEPENDÊNCIAS: fetch e zlib da biblioteca padrão. Lê o CSV (latin1, ";").
 * ========================================================================== */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lerFonteCatalogo } from '../server/src/agente/catalogo.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'data-sancoes.js');
const PORTAL = 'https://portaldatransparencia.gov.br/download-de-dados';
export const COLUNAS = Object.freeze(['raiz', 'cnpj', 'cadastro', 'codigo', 'categoria', 'inicio', 'fim', 'orgao', 'esfera', 'uf', 'abrangencia']);

/** Conteúdo do primeiro arquivo de um ZIP (deflate ou armazenado), pelo diretório central. */
export function primeiroArquivoDoZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('ZIP sem diretório central.');
  const central = buf.readUInt32LE(fim + 16);
  if (buf.readUInt32LE(central) !== 0x02014b50) throw new Error('Diretório central inválido.');
  const metodo = buf.readUInt16LE(central + 10);
  const tamanho = buf.readUInt32LE(central + 20);
  const local = buf.readUInt32LE(central + 42);
  if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('Cabeçalho local inválido.');
  const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const dados = buf.subarray(inicio, inicio + tamanho);
  if (metodo === 0) return dados;
  if (metodo === 8) return zlib.inflateRawSync(dados);
  throw new Error(`Método de compressão ${metodo} não suportado.`);
}

/** Campos de uma linha CSV com ";" e aspas (aspas duplicadas viram uma). */
export function campos(linha) {
  const saida = [];
  let atual = '', dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { if (dentro && linha[i + 1] === '"') { atual += '"'; i++; } else dentro = !dentro; continue; }
    if (c === ';' && !dentro) { saida.push(atual); atual = ''; continue; }
    atual += c;
  }
  saida.push(atual);
  return saida;
}

const chave = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
const data = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s).trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const curto = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Registros de pessoa jurídica de um CSV do CEIS ou do CNEP, só das raízes pedidas.
 * Linhas de pessoa física são descartadas antes de qualquer outro campo ser lido.
 */
export function sancoesDoCsv(texto, raizes) {
  const linhas = texto.split(/\r?\n/).filter(Boolean);
  if (!linhas.length) return { registros: [], pessoasFisicasDescartadas: 0, foraDoCatalogo: 0 };
  const cab = campos(linhas[0]).map(chave);
  const col = (...nomes) => { const i = cab.findIndex((c) => nomes.includes(c)); return i; };
  const idx = {
    cadastro: col('CADASTRO'), codigo: col('CODIGO DA SANCAO'), tipo: col('TIPO DE PESSOA'), doc: col('CPF OU CNPJ DO SANCIONADO'),
    categoria: col('CATEGORIA DA SANCAO'), inicio: col('DATA INICIO SANCAO'), fim: col('DATA FINAL SANCAO'), orgao: col('ORGAO SANCIONADOR'),
    esfera: col('ESFERA ORGAO SANCIONADOR'), uf: col('UF ORGAO SANCIONADOR'), abrangencia: col('ABRAGENCIA DA SANCAO', 'ABRANGENCIA DA SANCAO'),
  };
  for (const k of ['cadastro', 'tipo', 'doc', 'categoria', 'inicio']) if (idx[k] < 0) throw new Error(`Coluna ausente no CSV: ${k}. O layout da CGU mudou?`);
  const registros = [];
  let pessoasFisicasDescartadas = 0, foraDoCatalogo = 0;
  for (const linha of linhas.slice(1)) {
    const f = campos(linha);
    if (f[idx.tipo] !== 'J') { pessoasFisicasDescartadas++; continue; }
    const cnpj = String(f[idx.doc]).replace(/\D/g, '');
    if (cnpj.length !== 14) continue;
    const raiz = cnpj.slice(0, 8);
    if (!raizes.has(raiz)) { foraDoCatalogo++; continue; }
    registros.push([raiz, cnpj, curto(f[idx.cadastro], 8), curto(f[idx.codigo], 20), curto(f[idx.categoria], 160), data(f[idx.inicio]), data(f[idx.fim]),
      curto(f[idx.orgao], 160), curto(f[idx.esfera], 20), curto(f[idx.uf], 2), idx.abrangencia >= 0 ? curto(f[idx.abrangencia], 80) : '']);
  }
  return { registros, pessoasFisicasDescartadas, foraDoCatalogo };
}

async function baixar(cadastro, dia) {
  const r = await fetch(`${PORTAL}/${cadastro}/${dia}`, { headers: { 'User-Agent': 'GHT4-importador/1.0' }, redirect: 'follow' });
  if (!r.ok || !/zip/i.test(r.headers.get('content-type') ?? '')) return null;
  return Buffer.from(await r.arrayBuffer());
}

/** O dia mais recente com os dois arquivos publicados, voltando até 10 dias. */
async function baixarMaisRecente(pedido) {
  const dias = pedido ? [pedido] : Array.from({ length: 10 }, (_, i) => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10).replaceAll('-', ''));
  for (const dia of dias) {
    const ceis = await baixar('ceis', dia);
    if (!ceis) continue;
    const cnep = await baixar('cnep', dia);
    if (cnep) return { dia, ceis, cnep };
  }
  throw new Error('Nenhum arquivo do CEIS/CNEP publicado nos últimos dias. Tente --data=AAAAMMDD.');
}

export function gerarArquivo(registros, referencia, contagem) {
  const ordenados = [...registros].sort((a, b) => a[0].localeCompare(b[0]) || String(a[5]).localeCompare(String(b[5])) || a[3].localeCompare(b[3]));
  return `/* =============================================================================
 *  GHT4 · SANÇÕES PÚBLICAS A EMPRESAS — gerado por ferramentas/importar-sancoes.mjs
 * -----------------------------------------------------------------------------
 *  Fonte: Portal da Transparência (CGU), CEIS e CNEP de ${referencia}. NÃO editar à mão.
 *  Só pessoa jurídica com raiz de CNPJ no catálogo, e só os campos da sanção:
 *  pessoas físicas, nomes, processos e fundamentação ficaram fora na leitura.
 *  ${contagem.empresas.toLocaleString('pt-BR')} empresas do catálogo, ${ordenados.length.toLocaleString('pt-BR')} registros.
 *  Ausência aqui não prova idoneidade: a lista cobre só o que os órgãos informaram à CGU.
 * ========================================================================== */
const REFERENCIA_SANCOES = ${JSON.stringify(referencia)};
const COLUNAS_SANCOES = ${JSON.stringify(COLUNAS)};
const LINHAS_SANCOES = [
${ordenados.map((l) => JSON.stringify(l)).join(',\n')}
];
`;
}

async function principal() {
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const ensaio = process.argv.includes('--ensaio');
  const fonte = lerFonteCatalogo(await readFile(path.join(RAIZ, 'data-quimicos.js'), 'utf8'));
  const iRaiz = fonte.colunas.indexOf('cnpjRaiz');
  const raizes = new Set(fonte.linhas.map((l) => l[iRaiz]).filter((r) => /^\d{8}$/.test(r)));
  let dia, ceis, cnep;
  if (arg('ceis') && arg('cnep')) {
    [ceis, cnep] = await Promise.all([readFile(arg('ceis')), readFile(arg('cnep'))]);
    dia = arg('data') ?? path.basename(arg('ceis')).match(/\d{8}/)?.[0] ?? null;
  } else ({ dia, ceis, cnep } = await baixarMaisRecente(arg('data')));
  const referencia = dia ? `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}` : 'sem data';
  const partes = [ceis, cnep].map((zip) => sancoesDoCsv(primeiroArquivoDoZip(zip).toString('latin1'), raizes));
  const registros = partes.flatMap((p) => p.registros);
  const empresas = new Set(registros.map((r) => r[0])).size;
  console.log(`CEIS/CNEP de ${referencia}: ${registros.length} registros de ${empresas} empresas do catálogo (${raizes.size} raízes).`);
  console.log(`Descartados na leitura: ${partes.reduce((s, p) => s + p.pessoasFisicasDescartadas, 0)} de pessoa física, ${partes.reduce((s, p) => s + p.foraDoCatalogo, 0)} de empresas fora do catálogo.`);
  if (ensaio) { console.log('Ensaio: nada gravado.'); return; }
  await writeFile(SAIDA, gerarArquivo(registros, referencia, { empresas }));
  console.log(`Gravado: ${path.relative(RAIZ, SAIDA)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal().catch((e) => { console.error(e.message); process.exit(1); });
}
