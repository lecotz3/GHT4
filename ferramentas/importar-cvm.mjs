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
 *    dfp_..._DRE_{con,ind}_YYYY . demonstração de resultado
 *                                 3.01 receita · 3.05 EBIT
 *    dfp_..._DVA_{con,ind}_YYYY . valor adicionado
 *                                 7.04.01 depreciação/amortização (para o EBITDA)
 *    dfp_..._BPA_{con,ind}_YYYY . balanço ativo
 *                                 1.01 circulante · 1.01.01 caixa · 1.01.02 aplicações
 *    dfp_..._BPP_{con,ind}_YYYY . balanço passivo
 *                                 2.01/2.02 passivos · 2.03 patrimônio líquido
 *                                 2.01.04 + 2.02.01 empréstimos e financiamentos
 *                                 2.01.01 obrigações trabalhistas · 2.01.03 fiscais
 *                                 2.01.06 + 2.02.04 provisões
 *    dfp_..._DFC_{MI,MD}_..._YYYY  fluxo de caixa
 *                                 6.01 caixa operacional · 6.02 investimento
 *    fre_..._empregado_local_... . número de empregados
 *
 *  CONSOLIDADA COM QUEDA PARA INDIVIDUAL
 *  --------------------------------------
 *  A consolidada descreve o grupo econômico e é sempre preferida. Mas companhia
 *  sem controladas não publica consolidada — só individual. Ler apenas `_con`
 *  descartava 217 companhias ATIVAS (de 663 no cadastro), e essas pendem para o
 *  lado PEQUENO justamente da faixa que interessa a uma boutique: a faixa
 *  consolidável de R$ 30–250 mi saltou de 39 para 58 companhias ao incluí-las.
 *  Cada registro carrega em `cvm.demonstrativo` de qual das duas ele veio, e a
 *  camada de evidência cita isso — individual não é o mesmo documento que
 *  consolidada, e quem lê precisa saber qual está vendo.
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
  if (!dfpZip.has(nomeArquivo)) return new Map();
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

/* Lê vários demonstrativos em ORDEM DE PREFERÊNCIA e mescla por companhia: o
   primeiro arquivo que trouxer a companhia vence. Consolidada antes de
   individual; no fluxo de caixa, indireto (majoritário) antes de direto.
   Devolve também de qual arquivo veio cada companhia, para a proveniência. */
function mesclar(nomes, alvos) {
  const mapa = new Map(), origem = new Map();
  for (const nome of nomes) {
    for (const [cd, reg] of contasDe(nome, alvos)) {
      if (mapa.has(cd)) continue;
      mapa.set(cd, reg);
      origem.set(cd, nome.includes('_ind_') ? 'individual' : 'consolidada');
    }
  }
  return { mapa, origem };
}
const dfpA = (base) => [`dfp_cia_aberta_${base}_con_${ANO}.csv`, `dfp_cia_aberta_${base}_ind_${ANO}.csv`];

const dreCon = contasDe(`dfp_cia_aberta_DRE_con_${ANO}.csv`, new Set(['3.01', '3.05']));
const { mapa: dre, origem: dreOrigem } = mesclar(dfpA('DRE'), new Set(['3.01', '3.05']));
const { mapa: dva } = mesclar(dfpA('DVA'), new Set(['7.04.01']));

/* Contas patrimoniais e de caixa — a matéria-prima dos critérios de triagem que
   uma boutique aplica antes de abrir um alvo: alavancagem, liquidez, conversão
   de caixa, intensidade de capital e contingências. */
const { mapa: bpa } = mesclar(dfpA('BPA'), new Set(['1', '1.01', '1.01.01', '1.01.02', '1.02.03', '1.02.04']));
const { mapa: bpp } = mesclar(dfpA('BPP'), new Set(['2.01', '2.02', '2.03',
  '2.01.01', '2.01.03', '2.01.04', '2.01.06', '2.02.01', '2.02.04']));
const { mapa: dfc } = mesclar([
  `dfp_cia_aberta_DFC_MI_con_${ANO}.csv`, `dfp_cia_aberta_DFC_MD_con_${ANO}.csv`,
  `dfp_cia_aberta_DFC_MI_ind_${ANO}.csv`, `dfp_cia_aberta_DFC_MD_ind_${ANO}.csv`,
], new Set(['6.01', '6.02']));

const soInd = [...dreOrigem.values()].filter(v => v === 'individual').length;
console.log(`  DRE: ${dre.size} companhias (${dreCon.size} consolidada + ${soInd} só individual) · DVA: ${dva.size}`);
console.log(`  BPA: ${bpa.size} · BPP: ${bpp.size} · DFC: ${dfc.size}`);

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

  /* ---- critérios de triagem que uma boutique aplica antes de abrir um alvo ---
     Cada um sai de conta padronizada da própria DFP, então o dossiê consegue
     citar a linha exata. Onde a conta não veio, o indicador fica NULO — nunca
     zero: "não informado" e "zero" são afirmações diferentes sobre a empresa. */
  const cta = (mapa) => (c) => {
    const reg = mapa.get(cd);
    return (reg && reg[c] && reg[c].ultimo !== undefined) ? reg[c].ultimo : null;
  };
  const A = cta(bpa), P = cta(bpp), F = cta(dfc);
  const somaOuNulo = (...vs) => vs.every(v => v === null) ? null
                              : vs.reduce((t, v) => t + (v ?? 0), 0);

  // Alavancagem: dívida líquida / EBITDA — o filtro nº 1 de qualquer comprador.
  const caixaTotal   = somaOuNulo(A('1.01.01'), A('1.01.02'));
  const dividaBruta  = somaOuNulo(P('2.01.04'), P('2.02.01'));
  const dividaLiquida = dividaBruta === null ? null : dividaBruta - (caixaTotal ?? 0);
  /* Só faz sentido com EBITDA positivo: dividir dívida por EBITDA negativo
     devolve um número negativo que parece saudável e descreve o oposto. */
  const alavancagem = (dividaLiquida !== null && ebitda !== null && ebitda > 0)
    ? dividaLiquida / ebitda : null;

  // Liquidez corrente: ativo circulante / passivo circulante.
  const ativoCirc = A('1.01'), passivoCirc = P('2.01');
  const liquidezCorrente = (ativoCirc !== null && passivoCirc !== null && passivoCirc > 0)
    ? ativoCirc / passivoCirc : null;

  // Conversão de caixa: quanto do EBITDA vira caixa operacional de fato.
  const fco = F('6.01');
  let conversaoCaixa = (fco !== null && ebitda !== null && ebitda > 0)
    ? (fco / ebitda) * 100 : null;
  /* Mesmo artefato de denominador que derruba a margem das holdings, do outro
     lado da conta: com EBITDA quase nulo, qualquer caixa operacional produz um
     quociente enorme que não descreve conversão. A TS Agro aparecia com 1.788%
     — EBITDA de 2,1% da receita contra um FCO ordinário. Fora da faixa, devolve
     lacuna com motivo em vez de um número que parece ótimo e não significa nada. */
  let conversaoObs = null;
  if (conversaoCaixa !== null && (conversaoCaixa > 300 || conversaoCaixa < -300)) {
    conversaoObs = `Caixa operacional de ${(fco / 1e6).toFixed(0)} mi sobre EBITDA de `
                 + `${(ebitda / 1e6).toFixed(0)} mi devolve ${conversaoCaixa.toFixed(0)}%: `
                 + 'o EBITDA é pequeno demais para servir de denominador. '
                 + 'O quociente não descreve conversão de caixa.';
    conversaoCaixa = null;
  }

  /* Intensidade de investimento: caixa líquido consumido em investimento sobre
     receita. Não é capex puro — a conta 6.02 também abriga aplicações
     financeiras e aquisições. Por isso o nome não diz "capex". */
  const fcInvest = F('6.02');
  const intensidadeInvestimento = (fcInvest !== null && fcInvest < 0)
    ? (Math.abs(fcInvest) / receita.ultimo) * 100 : null;

  /* Contingências e obrigações trabalhistas/fiscais sobre o patrimônio líquido.
     A pesquisa de due diligence brasileira aponta passivo trabalhista oculto
     como o principal "deal killer" do middle market. O balanço só mostra o que
     JÁ está provisionado — o oculto, por definição, não aparece aqui. Este
     indicador mede o que foi reconhecido, e é piso, não teto. */
  const contingencias = somaOuNulo(P('2.01.01'), P('2.01.03'), P('2.01.06'), P('2.02.04'));
  const patrimonioLiquido = P('2.03');
  const contingenciasSobrePl = (contingencias !== null && patrimonioLiquido !== null && patrimonioLiquido > 0)
    ? (contingencias / patrimonioLiquido) * 100 : null;

  // Produtividade: receita por funcionário (proxy de eficiência operacional).
  const funcs = empregados.get(c.cnpj) ?? null;
  const receitaPorFuncionario = (funcs && funcs > 0) ? receita.ultimo / funcs : null;

  // Tendência de margem: o exercício anterior da própria DFP.
  const ebitAnt = contas['3.05'] ? (contas['3.05'].penultimo ?? null) : null;
  const daAnt   = dva.get(cd) && dva.get(cd)['7.04.01'] && dva.get(cd)['7.04.01'].penultimo !== undefined
    ? Math.abs(dva.get(cd)['7.04.01'].penultimo) : null;
  const ebitdaAnt = (ebitAnt !== null && daAnt !== null) ? ebitAnt + daAnt : null;
  const margemAnterior = (ebitdaAnt !== null && receita.penultimo && receita.penultimo > 0)
    ? (ebitdaAnt / receita.penultimo) * 100 : null;
  const variacaoMargem = (margem !== null && margemAnterior !== null && margemAnterior <= 100)
    ? margem - margemAnterior : null;

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
    funcionarios: funcs,
    perfil: perfilDe(c.controle),
    /* ---- critérios de triagem (ver bloco de cálculo acima) ---- */
    alavancagem:            arred(alavancagem, 2),
    liquidezCorrente:       arred(liquidezCorrente, 2),
    conversaoCaixa:         arred(conversaoCaixa, 1),
    conversaoObservacao:    conversaoObs,
    intensidadeInvestimento:arred(intensidadeInvestimento, 1),
    contingenciasSobrePl:   arred(contingenciasSobrePl, 1),
    patrimonioLiquidoNegativo: patrimonioLiquido !== null ? patrimonioLiquido < 0 : null,
    receitaPorFuncionario:  arred(receitaPorFuncionario === null ? null : receitaPorFuncionario / 1e3, 0),
    variacaoMargem:         arred(variacaoMargem, 1),
    /* Critérios que uma boutique usa e que NENHUMA fonte pública abre. Ficam
       declarados como nulos para o dossiê listá-los como lacuna com motivo, em
       vez de simplesmente não mencionar que existem. */
    concentracaoClientes: null,
    receitaRecorrente: null,
    dependenciaFundador: null,
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
      demonstrativo: dreOrigem.get(cd) || 'consolidada',
      receitaConta: '3.01', receitaValor: receita.ultimo, receitaAnterior: receita.penultimo ?? null,
      ebitConta: '3.05', ebitValor: ebit,
      daConta: '7.04.01', daValor: da,
      // contas que sustentam os critérios de triagem, para o dossiê citar a linha
      dividaContas: '2.01.04 + 2.02.01', dividaBrutaValor: dividaBruta,
      caixaContas: '1.01.01 + 1.01.02', caixaValor: caixaTotal,
      dividaLiquidaValor: dividaLiquida,
      circulanteContas: '1.01 / 2.01', ativoCirculante: ativoCirc, passivoCirculante: passivoCirc,
      fcoConta: '6.01', fcoValor: fco,
      investimentoConta: '6.02', investimentoValor: fcInvest,
      contingenciasContas: '2.01.01 + 2.01.03 + 2.01.06 + 2.02.04', contingenciasValor: contingencias,
      plConta: '2.03', plValor: patrimonioLiquido,
      controle: c.controle,
    },
    fonteBase: 'cvm',
    origem: `CVM · DFP ${ANO} ${dreOrigem.get(cd) === 'individual' ? '(individual)' : '(consolidada)'}`,
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

const daInd = empresas.filter(e => e.cvm.demonstrativo === 'individual').length;
const naFaixa = empresas.filter(e => e.receita >= 30 && e.receita <= 250).length;
console.log(`\n  origem do demonstrativo: ${empresas.length - daInd} consolidada · ${daInd} individual`);
console.log(`  na faixa consolidável R$ 30–250 mi: ${naFaixa}`);

const cob = (campo) => {
  const n = empresas.filter(e => e[campo] !== null && e[campo] !== undefined).length;
  return `${String(n).padStart(4)} (${String(Math.round(n / empresas.length * 100)).padStart(3)}%)`;
};
console.log(`\n  cobertura dos critérios de triagem:`);
for (const [campo, rotulo] of [
  ['alavancagem',             'dívida líquida / EBITDA'],
  ['liquidezCorrente',        'liquidez corrente'],
  ['conversaoCaixa',          'conversão de caixa (FCO/EBITDA)'],
  ['intensidadeInvestimento', 'intensidade de investimento'],
  ['contingenciasSobrePl',    'contingências / patrimônio'],
  ['receitaPorFuncionario',   'receita por funcionário'],
  ['variacaoMargem',          'tendência de margem'],
]) console.log(`     ${rotulo.padEnd(34)} ${cob(campo)}`);

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
 *  CRITÉRIOS DE TRIAGEM CALCULADOS (cada um cita a conta que o sustenta)
 *  ---------------------------------------------------------------------
 *    alavancagem ............. dívida líquida / EBITDA   (2.01.04+2.02.01 − 1.01.01+1.01.02)
 *    liquidezCorrente ........ ativo circ. / passivo circ.  (1.01 / 2.01)
 *    conversaoCaixa .......... caixa operacional / EBITDA   (6.01)
 *    intensidadeInvestimento . caixa em investimento / receita  (6.02)
 *    contingenciasSobrePl .... obrigações trabalhistas+fiscais+provisões / PL
 *                              (2.01.01 + 2.01.03 + 2.01.06 + 2.02.04 sobre 2.03)
 *    receitaPorFuncionario ... receita / empregados (FRE), em R$ mil
 *    variacaoMargem .......... margem EBITDA do exercício menos a do anterior
 *
 *  LIMITES DESTA BASE — ler antes de tirar conclusão
 *  -------------------------------------------------
 *  1. São só companhias ABERTAS (~${empresas.length}). O middle market que uma boutique
 *     assessora é majoritariamente de capital fechado e NÃO aparece aqui.
 *  1b. Parte vem da DFP INDIVIDUAL (companhias sem controladas não publicam
 *     consolidada). O campo cvm.demonstrativo diz qual, e o dossiê exibe isso:
 *     individual e consolidada não descrevem o mesmo perímetro econômico.
 *  1c. Concentração de clientes, receita recorrente e dependência do fundador
 *     são critérios centrais de qualquer boutique e NÃO existem em fonte
 *     pública. Vêm nulos de propósito, para o dossiê declarar a lacuna.
 *  1d. Contingência trabalhista/fiscal aqui é só a JÁ PROVISIONADA no balanço.
 *     O passivo oculto — o que a due diligence brasileira aponta como principal
 *     "deal killer" — por definição não está no balanço. Este número é piso.
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
