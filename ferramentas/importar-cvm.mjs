/* =============================================================================
 *  GHT4 · Importador de base REAL — dados abertos da CVM
 * -----------------------------------------------------------------------------
 *  Uso:  node ferramentas/importar-cvm.mjs
 *  Saída: data-real.js  (mesma forma de data.js, com empresas reais)
 *
 *  SEM DEPENDÊNCIAS. Usa só a biblioteca padrão do Node (fetch + zlib), para o
 *  projeto continuar sendo "baixe e abra o index.html".
 *
 *  DE ONDE VÊM OS DADOS
 *  --------------------
 *  Comissão de Valores Mobiliários — Portal de Dados Abertos (dados.cvm.gov.br).
 *  Informação pública, de publicação obrigatória por companhias abertas.
 *
 *    cad_cia_aberta.csv ......... cadastro: nome, setor, município/UF, controle
 *                                 acionário, situação do emissor, canal de RI
 *    dfp_..._DRE_con_YYYY ....... demonstração de resultado consolidada
 *                                 3.01 receita · 3.05 EBIT
 *    dfp_..._DVA_con_YYYY ....... valor adicionado
 *                                 7.04.01 depreciação/amortização (para o EBITDA)
 *    fre_..._empregado_local_... . número de empregados
 *
 *  O QUE ESTA BASE **NÃO** TEM (e por que isso importa)
 *  ----------------------------------------------------
 *  Dado público brasileiro entrega NÚMEROS, não EVENTOS. Não existe fonte
 *  aberta para "captou rodada", "mudou de controle", "abriu praça nova" ou
 *  "mercado fragmentado". Esses sinais ficam desligados aqui — e é proposital:
 *  o razão vai mostrar essas empresas com lastro menor que as fictícias,
 *  deixando visível exatamente qual camada de dados a GHT4 precisaria comprar
 *  ou construir. Ver o comentário final deste arquivo.
 *
 *  Em compensação, esta base traz dois sinais REAIS que a base fictícia não
 *  tinha: recuperação judicial / falência (campo SIT_EMISSOR do cadastro) e
 *  retração de receita (comparação entre os dois exercícios da própria DFP).
 *
 *  PRIVACIDADE (LGPD)
 *  ------------------
 *  Por padrão o contato importado é o CANAL INSTITUCIONAL de Relações com
 *  Investidores (e-mail e telefone que a companhia publica para esse fim),
 *  sem o nome da pessoa física do DRI. O cadastro da CVM traz esse nome; para
 *  incluí-lo, mude INCLUIR_NOME_DRI para true — decisão consciente de quem
 *  opera a ferramenta, não padrão da ferramenta.
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(RAIZ, 'ferramentas', '.cache-cvm');
const SAIDA = path.join(RAIZ, 'data-real.js');

/* ---- parâmetros ajustáveis ------------------------------------------------ */
const ANO = 2025;                 // exercício da DFP
const INCLUIR_NOME_DRI = false;   // ver nota de LGPD acima
const RECEITA_MINIMA_MI = 20;     // corta veículos e cascas sem operação
const SETORES_EXCLUIDOS = new Set([
  // veículos financeiros: a DRE não descreve uma operação comprável
  'Securitização de Recebíveis',
  'Arrendamento Mercantil',
  'Bancos',
  'Seguradoras e Corretoras',
  'Previdência Privada',
  'Fundos',
]);

/* ---- leitor de ZIP mínimo (stored + deflate) ------------------------------ */
function lerZip(buf) {
  // localiza o End of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP inválido: EOCD não encontrado');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const arquivos = new Map();
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo   = buf.readUInt16LE(p + 10);
    const tamComp  = buf.readUInt32LE(p + 20);
    const tamNome  = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamCom   = buf.readUInt16LE(p + 32);
    const offLocal = buf.readUInt32LE(p + 42);
    const nome = buf.toString('latin1', p + 46, p + 46 + tamNome);

    // cabeçalho local: os tamanhos de nome/extra podem diferir do central
    const lNome  = buf.readUInt16LE(offLocal + 26);
    const lExtra = buf.readUInt16LE(offLocal + 28);
    const ini = offLocal + 30 + lNome + lExtra;
    const bruto = buf.subarray(ini, ini + tamComp);
    arquivos.set(nome, metodo === 0 ? bruto : zlib.inflateRawSync(bruto));

    p += 46 + tamNome + tamExtra + tamCom;
  }
  return arquivos;
}

/* ---- rede com cache em disco --------------------------------------------- */
async function baixar(url, nomeLocal) {
  const destino = path.join(CACHE, nomeLocal);
  if (fs.existsSync(destino)) {
    console.log('  (cache) ' + nomeLocal);
    return fs.readFileSync(destino);
  }
  process.stdout.write('  baixando ' + nomeLocal + ' ... ');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ao baixar ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(destino, buf);
  console.log((buf.length / 1048576).toFixed(1) + ' MB');
  return buf;
}

/* ---- CSV da CVM: latin1, separado por ponto-e-vírgula --------------------- */
const dec = new TextDecoder('latin1');
function lerCsv(buf) {
  const linhas = dec.decode(buf).split(/\r?\n/);
  const cols = linhas[0].split(';');
  const idx = Object.fromEntries(cols.map((c, i) => [c.trim(), i]));
  const linhasOk = [];
  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i]) continue;
    const f = linhas[i].split(';');
    if (f.length < cols.length) continue;
    linhasOk.push(f);
  }
  return { idx, linhas: linhasOk };
}

const num = (s) => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : null; };
const arred = (v, casas = 1) => v === null ? null : Math.round(v * 10 ** casas) / 10 ** casas;

/* O código CVM aparece zerado à esquerda na DFP ("001023") e sem zeros no
   cadastro ("16330"). Sem normalizar, o cruzamento entre os dois não acha nada. */
const chaveCvm = (s) => String(s).trim().replace(/^0+/, '');

/* ---- título em caixa de nome próprio -------------------------------------- */
const MINUSCULAS = new Set(['de','da','do','das','dos','e','em','a','o','para','com','por']);
function nomeBonito(s) {
  const limpo = s.replace(/\s*-\s*EM RECUPERA[ÇC][ÃA]O JUDICIAL.*$/i, '')
                 .replace(/\s+/g, ' ').trim();
  return limpo.split(' ').map((p, i) => {
    const b = p.toLowerCase();
    if (i > 0 && MINUSCULAS.has(b)) return b;
    if (/^(s\.?a\.?|s\/a|ltda\.?|me|epp|cia\.?|holding|part\.?|participa[çc][õo]es)$/i.test(p)) {
      return /^s\.?a\.?$|^s\/a$/i.test(p) ? 'S.A.' : (b[0].toUpperCase() + b.slice(1));
    }
    if (p.length <= 3 && p === p.toUpperCase() && !/[aeiou]/i.test(p)) return p; // siglas
    return b[0] ? b[0].toUpperCase() + b.slice(1) : p;
  }).join(' ');
}

/* ---- perfil societário a partir do controle acionário --------------------- */
function perfilDe(controle) {
  const c = (controle || '').toUpperCase();
  if (c.startsWith('ESTRANGEIRO')) return 'Multinacional';
  if (c.startsWith('ESTATAL')) return 'Estatal';
  if (c.includes('HOLDING')) return 'Holding de participações';
  return 'Capital aberto';
}

/* ---- setor: agrupa a classificação da CVM em famílias legíveis ------------ */
const FAMILIAS = [
  [/energia el[ée]trica|petr[óo]leo|g[áa]s|combust/i, 'Energia'],
  [/saúde|hospitalar|medicamento|farmac/i,            'Saúde'],
  [/comércio|varejo|atacado/i,                        'Varejo'],
  [/telecomunica|inform[áa]tica|software|tecnolog/i,  'Tecnologia'],
  [/alimento|bebida|agricultura|carnes|fumo/i,        'Alimentos & Agro'],
  [/constru|imobili|incorpora/i,                      'Construção & Imobiliário'],
  [/transporte|log[íi]stica|rodovi|aero|portu/i,      'Transporte & Logística'],
  [/metalurgia|siderurgia|extra[çc][ãa]o mineral|papel|celulose|petroqu[íi]m|qu[íi]mic|borracha/i, 'Indústria de base'],
  [/máquinas|equipamentos|ve[íi]culos|pe[çc]as|el[ée]tricos|eletr[ôo]nic/i, 'Bens de capital'],
  [/têxtil|vestuário|calçad|couro/i,                  'Têxtil & Vestuário'],
  [/educa/i,                                          'Educação'],
  [/hospedagem|turismo|lazer|servi[çc]os m[ée]dic/i,  'Serviços ao consumidor'],
  [/saneamento|água|ambient/i,                        'Saneamento & Ambiental'],
];
function familiaDe(setorCvm) {
  for (const [re, nome] of FAMILIAS) if (re.test(setorCvm)) return nome;
  return 'Outros setores';
}

/* ========================== EXECUÇÃO ====================================== */
console.log(`\nGHT4 · importando base real da CVM (exercício ${ANO})\n`);

const BASE_DFP = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/';
const BASE_FRE = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/';
const BASE_CAD = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/';

const cadBuf = await baixar(BASE_CAD + 'cad_cia_aberta.csv', 'cad_cia_aberta.csv');
const dfpZip = lerZip(await baixar(`${BASE_DFP}dfp_cia_aberta_${ANO}.zip`, `dfp_${ANO}.zip`));
const freZip = lerZip(await baixar(`${BASE_FRE}fre_cia_aberta_${ANO}.zip`, `fre_${ANO}.zip`));

/* ---- 1. cadastro ---------------------------------------------------------- */
const cad = lerCsv(cadBuf);
const cadastro = new Map(); // CD_CVM -> registro
for (const f of cad.linhas) {
  if (f[cad.idx.SIT] !== 'ATIVO') continue;
  cadastro.set(chaveCvm(f[cad.idx.CD_CVM]), {
    cnpj:     f[cad.idx.CNPJ_CIA],
    social:   f[cad.idx.DENOM_SOCIAL],
    comerc:   f[cad.idx.DENOM_COMERC],
    setorCvm: f[cad.idx.SETOR_ATIV],
    municipio:f[cad.idx.MUN],
    uf:       f[cad.idx.UF],
    controle: f[cad.idx.CONTROLE_ACIONARIO],
    sitEmis:  f[cad.idx.SIT_EMISSOR],
    dtSitEmis:f[cad.idx.DT_INI_SIT_EMISSOR],
    email:    f[cad.idx.EMAIL],
    ddd:      f[cad.idx.DDD_TEL],
    tel:      f[cad.idx.TEL],
    respNome: f[cad.idx.RESP],
    respCargo:f[cad.idx.TP_RESP],
  });
}
console.log(`\n  cadastro: ${cadastro.size} companhias com registro ATIVO`);

/* ---- 2. contas da DFP (mantendo só a versão mais recente por companhia) ---- */
function contasDe(nomeArquivo, alvos) {
  const csv = lerCsv(dfpZip.get(nomeArquivo));
  const i = csv.idx;
  const versaoMax = new Map();
  for (const f of csv.linhas) {
    const cd = chaveCvm(f[i.CD_CVM]), v = +f[i.VERSAO];
    if (!(versaoMax.get(cd) >= v)) versaoMax.set(cd, v);
  }
  const out = new Map(); // CD_CVM -> { conta: { ultimo, penultimo } }
  for (const f of csv.linhas) {
    const cd = chaveCvm(f[i.CD_CVM]);
    if (+f[i.VERSAO] !== versaoMax.get(cd)) continue;
    if (f[i.MOEDA] !== 'REAL') continue;
    if (!alvos.has(f[i.CD_CONTA])) continue;
    const escala = f[i.ESCALA_MOEDA] === 'MIL' ? 1e3 : 1;
    const valor = num(f[i.VL_CONTA]);
    if (valor === null) continue;
    const reg = out.get(cd) || {};
    const conta = reg[f[i.CD_CONTA]] || {};
    conta[f[i.ORDEM_EXERC].startsWith('ÚLT') ? 'ultimo' : 'penultimo'] = valor * escala;
    conta.ds = f[i.DS_CONTA];
    conta.fim = f[i.DT_FIM_EXERC];
    reg[f[i.CD_CONTA]] = conta;
    out.set(cd, reg);
  }
  return out;
}

const dre = contasDe(`dfp_cia_aberta_DRE_con_${ANO}.csv`, new Set(['3.01', '3.05']));
const dva = contasDe(`dfp_cia_aberta_DVA_con_${ANO}.csv`, new Set(['7.04.01']));
console.log(`  DRE consolidada: ${dre.size} companhias · DVA: ${dva.size}`);

/* ---- 3. empregados (FRE) --------------------------------------------------- */
const empregados = new Map(); // CNPJ -> total
{
  const nome = [...freZip.keys()].find(k => /empregado_local_faixa_etaria/.test(k));
  const csv = lerCsv(freZip.get(nome));
  const i = csv.idx;
  const versaoMax = new Map();
  for (const f of csv.linhas) {
    const k = f[i.CNPJ_Companhia], v = +f[i.Versao];
    if (!(versaoMax.get(k) >= v)) versaoMax.set(k, v);
  }
  for (const f of csv.linhas) {
    const k = f[i.CNPJ_Companhia];
    if (+f[i.Versao] !== versaoMax.get(k)) continue;
    const soma = (num(f[i.Quantidade_Ate30Anos]) || 0)
               + (num(f[i.Quantidade_30a50Anos]) || 0)
               + (num(f[i.Quantidade_Acima50Anos]) || 0);
    empregados.set(k, (empregados.get(k) || 0) + soma);
  }
  console.log(`  empregados (FRE): ${empregados.size} companhias`);
}

/* ---- 4. montagem ---------------------------------------------------------- */
const SIT_ESPECIAIS = /RECUPERA[ÇC][ÃA]O|FALIDA|LIQUIDA[ÇC][ÃA]O|PARALISADA/i;
const empresas = [];
const descartes = { semDre: 0, semReceita: 0, receitaBaixa: 0, setorExcluido: 0, semCadastro: 0 };

for (const [cd, contas] of dre) {
  const c = cadastro.get(cd);
  if (!c) { descartes.semCadastro++; continue; }
  if (SETORES_EXCLUIDOS.has(c.setorCvm)) { descartes.setorExcluido++; continue; }

  const receita = contas['3.01'];
  if (!receita || !receita.ultimo || receita.ultimo <= 0) { descartes.semReceita++; continue; }

  const receitaMi = receita.ultimo / 1e6;
  if (receitaMi < RECEITA_MINIMA_MI) { descartes.receitaBaixa++; continue; }

  const ebit = contas['3.05'] ? contas['3.05'].ultimo : null;
  const da   = dva.get(cd) && dva.get(cd)['7.04.01'] ? Math.abs(dva.get(cd)['7.04.01'].ultimo) : null;
  // EBITDA = EBIT + depreciação/amortização. Sem D&A, a margem fica nula em vez
  // de virar "margem EBIT disfarçada de EBITDA".
  const ebitda = (ebit !== null && da !== null) ? ebit + da : null;
  let margem = ebitda !== null ? (ebitda / receita.ultimo) * 100 : null;

  /* Margem acima de 100% não é margem operacional — é artefato de holding.
     Em holdings, a linha 3.01 (receita) é pequena, mas o 3.05 (EBIT) incorpora
     equivalência patrimonial das controladas. O quociente estoura e descreve
     outra coisa. Itaúsa apareceu com 234,9% assim. Melhor devolver lacuna com
     motivo declarado do que um número que parece margem e não é. */
  let margemObs = null;
  if (margem !== null && margem > 100) {
    margemObs = 'EBIT incorpora resultado de equivalência patrimonial: o quociente '
              + `sobre a receita (${margem.toFixed(0)}%) não descreve margem operacional. `
              + 'Típico de holding — exige olhar as controladas uma a uma.';
    margem = null;
  }

  const cresc = (receita.penultimo && receita.penultimo > 0)
    ? ((receita.ultimo - receita.penultimo) / receita.penultimo) * 100
    : null;

  const especial = SIT_ESPECIAIS.test(c.sitEmis || '') ? c.sitEmis : null;
  const nome = nomeBonito(c.comerc || c.social);
  const familia = familiaDe(c.setorCvm);

  empresas.push({
    id: 'cvm' + cd,
    nome,
    setor: familia,
    subsetor: c.setorCvm,
    oQueFazem: `Companhia aberta registrada na CVM sob o código ${cd}, classificada no setor "${c.setorCvm}".`,
    cidade: nomeBonito(c.municipio || ''),
    uf: c.uf,
    receita: arred(receitaMi, 0),
    crescimento: arred(cresc, 1),
    margemEbitda: arred(margem, 1),
    margemObservacao: margemObs,
    funcionarios: empregados.get(c.cnpj) ?? null,
    perfil: perfilDe(c.controle),
    contato: {
      nome: INCLUIR_NOME_DRI && c.respNome ? nomeBonito(c.respNome) : 'Relações com Investidores',
      cargo: c.respCargo ? nomeBonito(c.respCargo) : 'Canal institucional',
      email: (c.email || '').toLowerCase() || null,
      telefone: c.ddd && c.tel ? `+55 (${c.ddd}) ${c.tel}` : null,
    },
    // eventos de mercado: não existem em fonte pública aberta — ficam desligados
    mercadoFragmentado: false,
    rodadaRecente: false,
    mudancaControle: false,
    expansaoGeografica: false,
    // sinais reais que só esta base tem
    situacaoEspecial: especial,
    dataSituacaoEspecial: especial ? c.dtSitEmis : null,
    // proveniência, para a camada de evidência citar a conta exata
    cvm: {
      codigo: cd,
      cnpj: c.cnpj,
      razaoSocial: c.social,
      exercicio: receita.fim,
      receitaConta: '3.01', receitaValor: receita.ultimo, receitaAnterior: receita.penultimo ?? null,
      ebitConta: '3.05', ebitValor: ebit,
      daConta: '7.04.01', daValor: da,
      controle: c.controle,
    },
    fonteBase: 'cvm',
    origem: `CVM · DFP ${ANO}`,
    dataAtualizacao: (receita.fim || `${ANO}-12-31`).slice(0, 10),
    confianca: 'Alta',
    descricao: [
      `Companhia aberta de controle ${(c.controle || 'não informado').toLowerCase()}.`,
      especial ? `Situação do emissor: ${especial.toLowerCase()}.` : null,
      cresc !== null && cresc < -5 ? `Receita recuou ${Math.abs(cresc).toFixed(1)}% no exercício.` : null,
    ].filter(Boolean).join(' '),
  });
}

empresas.sort((a, b) => b.receita - a.receita);

/* ---- 5. relatório --------------------------------------------------------- */
const perfis = [...new Set(empresas.map(e => e.perfil))].sort();
const setores = [...new Set(empresas.map(e => e.setor))].sort();
const comMargem = empresas.filter(e => e.margemEbitda !== null).length;
const comCresc  = empresas.filter(e => e.crescimento !== null).length;
const comFunc   = empresas.filter(e => e.funcionarios !== null).length;
const emCrise   = empresas.filter(e => e.situacaoEspecial).length;

console.log(`\n  → ${empresas.length} empresas importadas`);
console.log(`     descartes: ${JSON.stringify(descartes)}`);
console.log(`     com margem EBITDA calculável: ${comMargem} (${Math.round(comMargem / empresas.length * 100)}%)`);
console.log(`     com crescimento comparável:   ${comCresc} (${Math.round(comCresc / empresas.length * 100)}%)`);
console.log(`     com nº de empregados:         ${comFunc} (${Math.round(comFunc / empresas.length * 100)}%)`);
console.log(`     em situação especial:         ${emCrise}`);
console.log(`     setores: ${setores.length} · perfis: ${perfis.join(', ')}`);

/* ---- 6. gravação ---------------------------------------------------------- */
const cabecalho = `/* =============================================================================
 *  GHT4 · BASE REAL — companhias abertas brasileiras (dados da CVM)
 * -----------------------------------------------------------------------------
 *  GERADO AUTOMATICAMENTE por ferramentas/importar-cvm.mjs — não editar à mão.
 *  Gerado em ${new Date().toISOString().slice(0, 10)} · exercício ${ANO} · ${empresas.length} companhias.
 *
 *  Estas empresas são REAIS e os números são REAIS, extraídos das demonstrações
 *  financeiras padronizadas (DFP) entregues à CVM e auditadas.
 *  Fonte: dados.cvm.gov.br — informação pública de divulgação obrigatória.
 *
 *  LIMITES DESTA BASE — ler antes de tirar conclusão
 *  -------------------------------------------------
 *  1. São só companhias ABERTAS (~${empresas.length}). O middle market que uma boutique
 *     assessora é majoritariamente de capital fechado e NÃO aparece aqui.
 *  2. Não há eventos de mercado. Rodada de investimento, mudança de controle,
 *     expansão geográfica e fragmentação setorial não existem em fonte pública
 *     aberta — ficam desligados, e o razão mostra isso como lastro menor.
 *  3. Sucessão familiar e backing de fundo não se aplicam: por definição, estas
 *     companhias têm capital aberto.
 *  4. A margem é EBITDA de verdade (EBIT + depreciação/amortização da DVA), não
 *     EBIT disfarçado. Onde a DVA não trouxe D&A, a margem fica nula.
 *  5. Contato = canal institucional de RI publicado pela própria companhia.
 *     Nome do DRI omitido por padrão (ver INCLUIR_NOME_DRI no importador).
 *
 *  Para atualizar:  node ferramentas/importar-cvm.mjs
 * ========================================================================== */

`;

const corpo = 'const EMPRESAS_CVM = [\n'
  + empresas.map(e => '  ' + JSON.stringify(e)).join(',\n')
  + '\n];\n\n'
  + `const PERFIS_CVM = ${JSON.stringify(perfis)};\n`
  + `const SETORES_CVM = ${JSON.stringify(setores)};\n\n`
  + 'window.EMPRESAS_CVM = EMPRESAS_CVM;\n'
  + 'window.PERFIS_CVM = PERFIS_CVM;\n'
  + 'window.SETORES_CVM = SETORES_CVM;\n';

fs.writeFileSync(SAIDA, cabecalho + corpo, 'utf8');
console.log(`\n  gravado: ${path.relative(RAIZ, SAIDA)} (${(fs.statSync(SAIDA).size / 1024).toFixed(0)} KB)\n`);
