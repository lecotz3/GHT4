/* =============================================================================
 *  GHT4 · CRUZAMENTO IBAMA × CADASTRO CNPJ
 * -----------------------------------------------------------------------------
 *  O PROBLEMA QUE ESTE ARQUIVO RESOLVE
 *
 *  A ingestão do CNPJ devolveu 38.583 empresas no recorte químico. Mas 25.650
 *  delas — dois terços — entraram por CNAE SECUNDÁRIO. E CNAE secundário é
 *  declaração de intenção no cadastro, não prova de operação: uma transportadora
 *  de carga geral que um dia declarou "comércio atacadista de adubos" fica lá
 *  para sempre, idêntica no filtro a uma distribuidora química de verdade.
 *
 *  O IBAMA resolve isso por um caminho independente. Quem exerce atividade
 *  potencialmente poluidora entrega o RAPP todo ano, e nele declara a CATEGORIA
 *  DE ATIVIDADE que exerce de fato. Essa categoria não vem do CNAE, não conversa
 *  com a Receita e é preenchida sob obrigação legal com fiscalização ambiental
 *  atrás. É a segunda fonte que o método da casa exige: afirmação de um lado,
 *  documento do outro.
 *
 *  O cruzamento responde três perguntas, nesta ordem de valor:
 *
 *    1. CONFIRMA — dos nossos 38.583, quais aparecem no RAPP exercendo atividade
 *       química? Esses deixam de ser hipótese e viram lista de alvo.
 *    2. DESMENTE — quais têm CNAE químico e nenhuma pegada ambiental? Não é prova
 *       de que não operam, e o arquivo NÃO os descarta: rebaixa a confiança e
 *       declara o motivo. Empresa pequena de escritório pode legitimamente não
 *       entregar RAPP.
 *    3. DESCOBRE — e esta é a que ninguém pede e todo mundo quer: quem declara
 *       "Indústria Química" ao IBAMA e NÃO está no nosso universo, porque se
 *       cadastrou na Receita como comércio geral. São alvos que o filtro de CNAE
 *       perde por construção, e só aparecem por aqui.
 *
 *  FORMULÁRIOS USADOS
 *  Quatro trazem "Categoria de Atividade" declarada. O quinto, de transporte de
 *  produto químico perigoso, não traz — e não precisa: estar nele já é a
 *  declaração. As QUANTIDADES de todos eles são ignoradas de propósito; ver a
 *  ressalva em fontes.js sob `ibama_transporte`.
 *
 *  USO
 *    node ferramentas/cruzar-ibama.mjs                 baixa e cruza
 *    node ferramentas/cruzar-ibama.mjs --cache         guarda os CSV em .cache/
 *    node ferramentas/cruzar-ibama.mjs --sem-rede      usa só o que está em .cache/
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import vm from 'node:vm';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(RAIZ, '.cache', 'ibama');
const SAIDA = path.join(RAIZ, 'data-ibama.js');
const SAIDA_FORA = path.join(RAIZ, 'ibama-fora-do-escopo.csv');

const USAR_CACHE = process.argv.includes('--cache');
const SEM_REDE = process.argv.includes('--sem-rede');

const BASE_URL = 'https://dadosabertos.ibama.gov.br/dados/RAPP';

/* Os formulários, e por que cada um está aqui.
   `colunaCnpj` varia de nome entre formulários — "CNPJ", "CNPJ do gerador",
   "CNPJ do destinador". Por isso a coluna é achada pelo cabeçalho, não fixada. */
const FORMULARIOS = [
  { id: 'residuoSolidosGerador',        rotulo: 'Resíduos sólidos — gerador',   temCategoria: true  },
  { id: 'efluentesLiquidos',            rotulo: 'Efluentes líquidos',            temCategoria: true  },
  { id: 'emissoesPoluentesAtmosfericos', rotulo: 'Emissões atmosféricas',        temCategoria: true  },
  { id: 'residuoSolidosDestinador',     rotulo: 'Resíduos sólidos — destinador', temCategoria: true  },
  { id: 'transpProdQuiPerigCombustivel', rotulo: 'Transporte de químico perigoso', temCategoria: false,
    /* Sem categoria declarada, mas o formulário inteiro É a declaração: quem
       está aqui transporta ou armazena produto químico perigoso. */
    categoriaImplicita: 'Transporte de produto químico perigoso' },
];

/* ---------------------------------------------------------------------------
 *  De "Detalhe" do IBAMA para o nosso subsetor. É o mesmo exercício que o CNAE
 *  faz, por outro caminho — e é a discordância entre os dois que interessa:
 *  quando o CNAE diz fertilizante e o IBAMA diz tinta, um dos dois está velho.
 * ------------------------------------------------------------------------ */
const SUBSETOR_POR_DETALHE = [
  [/fertilizantes e agroquímicos/i,                              'Fertilizantes e nutrição vegetal'],
  [/tintas, esmaltes, lacas, vernizes/i,                         'Tintas, vernizes e revestimentos'],
  [/limpeza e polimento|sabões, detergentes/i,                   'Domissanitários e produtos de limpeza'],
  [/resinas e de fibras/i,                                       'Resinas, elastômeros e fibras'],
  [/pólvora, explosivos/i,                                       'Explosivos e pirotecnia'],
  [/processamento de petróleo/i,                                 'Petroquímica básica e intermediários'],
  [/concentrados aromáticos/i,                                   'Especialidades e aditivos'],
  [/recuperação e refino de solventes/i,                         'Especialidades e aditivos'],
  /* Este é largo de propósito: o IBAMA junta inorgânicos, orgânicos e
     especialidades num detalhe só, e forçar uma escolha aqui seria inventar. */
  [/produção de substâncias e fabricação de produtos químicos/i, null],
];

/* Categorias que contam como pegada QUÍMICA. "Transporte, Terminais, Depósitos
   e Comércio" entra porque é onde a distribuição química se cadastra — mas só
   vale como confirmação quando a empresa já está no nosso recorte por CNAE,
   já que a categoria sozinha também abriga transportadora de grãos. */
const CATEGORIA_QUIMICA = /Indústria Química/i;
const CATEGORIA_COMERCIO = /Transporte, Terminais, Depósitos e Comércio/i;

/* Detalhes que a decisão da reunião deixou FORA do escopo. Marcados, não
   descartados: se aparecerem cruzados com CNAE do escopo, viram caso a revisar. */
const DETALHE_FORA = /farmacêuticos e veterinários|perfumarias e cosméticos/i;

const subsetorDoDetalhe = (d) => {
  for (const [re, sub] of SUBSETOR_POR_DETALHE) if (re.test(d)) return sub;
  return null;
};

const N = (x) => x.toLocaleString('pt-BR');

/* ---------------------------------------------------------------------------
 *  Leitura em streaming. Os arquivos somam ~3 GB; nenhum deles cabe inteiro na
 *  memória e nenhum precisa caber. Encoding UTF-8 — os arquivos da Receita são
 *  latin1 e estes NÃO são; ler errado não dá erro, só quebra os acentos, e aí
 *  o filtro por categoria devolve zero silenciosamente.
 * ------------------------------------------------------------------------ */
async function* linhasDo(form) {
  const arquivoCache = path.join(CACHE, `${form.id}.csv`);

  if (SEM_REDE || (USAR_CACHE && fs.existsSync(arquivoCache))) {
    if (!fs.existsSync(arquivoCache)) {
      console.log(`    · ${form.rotulo}: sem cache, pulado (--sem-rede)`);
      return;
    }
    const mb = (fs.statSync(arquivoCache).size / 1048576).toFixed(0);
    console.log(`    ${form.rotulo} · ${mb} MB (cache)`);
    const rl = readline.createInterface({
      input: fs.createReadStream(arquivoCache).setEncoding('utf8'), crlfDelay: Infinity,
    });
    for await (const l of rl) yield l;
    return;
  }

  const resposta = await fetch(`${BASE_URL}/${form.id}/relatorio.csv`);
  if (!resposta.ok) throw new Error(`${form.id}: HTTP ${resposta.status}`);
  const tamanho = Number(resposta.headers.get('content-length') || 0);
  console.log(`    ${form.rotulo} · ${tamanho ? (tamanho / 1048576).toFixed(0) + ' MB' : 'tamanho não informado'}`);

  let fluxo = Readable.fromWeb(resposta.body);
  let gravador = null;
  if (USAR_CACHE) {
    fs.mkdirSync(CACHE, { recursive: true });
    gravador = fs.createWriteStream(arquivoCache);
    fluxo.pipe(gravador);
  }
  fluxo.setEncoding('utf8');
  const rl = readline.createInterface({ input: fluxo, crlfDelay: Infinity });
  for await (const l of rl) yield l;
  if (gravador) await new Promise((ok) => gravador.end(ok));
}

/* ---------------------------------------------------------------------------
 *  PRINCIPAL
 * ------------------------------------------------------------------------ */
async function principal() {
  console.log('\nGHT4 · cruzando o RAPP do IBAMA com o cadastro CNPJ\n');

  /* ---- 1. o nosso universo ------------------------------------------------ */
  const arquivoBase = path.join(RAIZ, 'data-quimicos.js');
  if (!fs.existsSync(arquivoBase)) {
    throw new Error('data-quimicos.js não existe. Rode antes: node ferramentas/importar-cnpj.mjs');
  }
  const ctx = { window: {} }; ctx.window.window = ctx.window;
  vm.runInNewContext(fs.readFileSync(arquivoBase, 'utf8'), ctx);
  const NOSSAS = ctx.window.EMPRESAS_QUIMICOS;
  const porRaiz = new Map();
  for (const e of NOSSAS) porRaiz.set(e.cnpjRaiz, e);
  console.log(`  universo CNPJ: ${N(NOSSAS.length)} empresas`);

  /* ---- 2. varre os formulários ------------------------------------------- */
  /* Guarda uma linha só se: (a) a empresa é nossa — para confirmar; ou
     (b) declarou Indústria Química — para descobrir quem o CNAE perdeu.
     Sem esse filtro, seriam milhões de CNPJs de setores que não nos interessam. */
  const pegada = new Map();   // raiz -> { nome, ufs:Set, forms:Set, cats:Set, dets:Set, ano }
  let lidas = 0;

  console.log('\n  formulários:');
  for (const form of FORMULARIOS) {
    let cabecalho = null, iCnpj = -1, iNome = -1, iUf = -1, iCat = -1, iDet = -1, iAno = -1;
    let doForm = 0;

    for await (const linha of linhasDo(form)) {
      if (!cabecalho) {
        cabecalho = linha.split(';').map((c) => c.trim());
        iCnpj = cabecalho.findIndex((c) => /^CNPJ/i.test(c));
        iNome = cabecalho.findIndex((c) => /Raz/i.test(c));
        iUf   = cabecalho.findIndex((c) => /^Estado$/i.test(c));
        iCat  = cabecalho.findIndex((c) => /^Categoria de Atividade$/i.test(c));
        iDet  = cabecalho.findIndex((c) => /^Detalhe$/i.test(c));
        iAno  = cabecalho.findIndex((c) => /^Ano/i.test(c));
        if (iCnpj < 0) throw new Error(`${form.id}: não achei a coluna de CNPJ em "${linha.slice(0, 120)}"`);
        continue;
      }
      lidas++;
      const c = linha.split(';');
      const cnpj = (c[iCnpj] || '').replace(/\D/g, '');
      if (cnpj.length !== 14) continue;
      const raiz = cnpj.slice(0, 8);

      const cat = iCat >= 0 ? (c[iCat] || '') : (form.categoriaImplicita || '');
      const det = iDet >= 0 ? (c[iDet] || '') : '';
      const nosso = porRaiz.has(raiz);
      const quimica = CATEGORIA_QUIMICA.test(cat) || !form.temCategoria;
      if (!nosso && !quimica) continue;

      let p = pegada.get(raiz);
      if (!p) {
        p = { nome: (c[iNome] || '').trim(), ufs: new Set(), forms: new Set(), cats: new Set(), dets: new Set(), ano: 0 };
        pegada.set(raiz, p);
      }
      if (iUf >= 0 && c[iUf]) p.ufs.add(c[iUf].trim());
      p.forms.add(form.rotulo);
      if (cat) p.cats.add(cat.trim());
      /* SÓ o detalhe de linha QUÍMICA entra. Um grupo grande — JBS, Raízen —
         entrega RAPP por dezenas de estabelecimentos, e a maioria em categoria
         que não é a nossa. Guardar todos os detalhes fazia o selo de "Indústria
         Química" abrir um tooltip escrito "matadouros e abatedouros", que é
         verdade sobre a empresa e mentira sobre o motivo do selo. */
      if (det && CATEGORIA_QUIMICA.test(cat)) p.dets.add(det.trim());
      const ano = parseInt(c[iAno], 10);
      if (Number.isFinite(ano) && ano > p.ano && ano <= new Date().getFullYear()) p.ano = ano;
      doForm++;
    }
    console.log(`      ${N(doForm)} linhas retidas`);
  }

  console.log(`\n  linhas lidas no total: ${N(lidas)}`);
  console.log(`  CNPJs com pegada ambiental relevante: ${N(pegada.size)}`);

  /* ---- 3. cruza ----------------------------------------------------------- */
  const ANO_CORTE = 2022;   /* RAPP de 2022 em diante = pegada viva */

  const confirmadas = [];
  const semPegada = [];
  const divergentes = [];
  const foraDoEscopoMarcadas = [];

  for (const e of NOSSAS) {
    const p = pegada.get(e.cnpjRaiz);
    if (!p) { semPegada.push(e); continue; }

    const cats = [...p.cats];
    const dets = [...p.dets];
    const industria = cats.some((c) => CATEGORIA_QUIMICA.test(c));
    const comercio = cats.some((c) => CATEGORIA_COMERCIO.test(c));
    const transporte = p.forms.has('Transporte de químico perigoso');

    const grau = industria ? 'industria'
      : transporte ? 'transporte'
      : comercio ? 'comercio'
      : 'outra';

    const reg = {
      raiz: e.cnpjRaiz, nome: e.nome, subsetor: e.subsetor, uf: e.uf,
      porSecundario: !!e.enquadramentoPorSecundario,
      grau, viva: p.ano >= ANO_CORTE, ano: p.ano,
      formularios: [...p.forms], categorias: cats, detalhes: dets,
      ufsIbama: [...p.ufs],
    };
    confirmadas.push(reg);

    /* Discordância de classificação: o IBAMA aponta subsetor diferente do CNAE. */
    const sugeridos = [...new Set(dets.map(subsetorDoDetalhe).filter(Boolean))];
    if (sugeridos.length && !sugeridos.includes(e.subsetor)) {
      divergentes.push({ ...reg, cnaeDiz: e.subsetor, ibamaDiz: sugeridos });
    }
    if (dets.some((d) => DETALHE_FORA.test(d))) {
      foraDoEscopoMarcadas.push({ ...reg, detalheFora: dets.filter((d) => DETALHE_FORA.test(d)) });
    }
  }

  /* ---- 4. descoberta: química no IBAMA e ausente do nosso universo --------
   * A categoria "Indústria Química" do IBAMA é mais larga que o nosso escopo:
   * ela inclui farmoquímico e cosmético acabado, que a reunião deixou de fora.
   * A lista sai separada, não misturada — quem for decidir precisa ver os dois
   * montes, porque a decisão de escopo pode mudar e o custo de incluir é zero. */
  const descobertas = [];
  const descobertasFora = [];
  for (const [raiz, p] of pegada) {
    if (porRaiz.has(raiz)) continue;
    if (![...p.cats].some((c) => CATEGORIA_QUIMICA.test(c))) continue;
    if (p.ano < ANO_CORTE) continue;
    const dets = [...p.dets];
    const reg = { raiz, nome: p.nome, ufs: [...p.ufs], ano: p.ano, detalhes: dets };
    /* Fora do escopo só quando TODO detalhe declarado é fora — quem faz
       cosmético e também faz especialidade química continua sendo candidato. */
    const soFora = dets.length > 0 && dets.every((d) => DETALHE_FORA.test(d));
    (soFora ? descobertasFora : descobertas).push(reg);
  }
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  descobertas.sort(porNome);
  descobertasFora.sort(porNome);

  /* ---- 5. relatório ------------------------------------------------------- */
  const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : '—';
  const vivas = confirmadas.filter((c) => c.viva);

  console.log(`\n  ─── CONFIRMA ─────────────────────────────────────────────────`);
  console.log(`  com pegada no RAPP:        ${N(confirmadas.length).padStart(7)}  (${pct(confirmadas.length, NOSSAS.length)} do universo)`);
  console.log(`    dessas, pegada viva (${ANO_CORTE}+): ${N(vivas.length).padStart(7)}  (${pct(vivas.length, NOSSAS.length)})`);
  console.log(`  sem pegada nenhuma:        ${N(semPegada.length).padStart(7)}  (${pct(semPegada.length, NOSSAS.length)})`);

  const porGrau = {};
  for (const c of vivas) porGrau[c.grau] = (porGrau[c.grau] || 0) + 1;
  console.log('\n  natureza da pegada viva:');
  const rotuloGrau = { industria: 'declara Indústria Química', transporte: 'transporta químico perigoso',
    comercio: 'transporte/depósito/comércio', outra: 'outra categoria' };
  for (const [g, n] of Object.entries(porGrau).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${N(n).padStart(6)}  ${rotuloGrau[g] || g}`);
  }

  console.log(`\n  ─── O TESTE QUE IMPORTA ──────────────────────────────────────`);
  const sec = NOSSAS.filter((e) => e.enquadramentoPorSecundario);
  const pri = NOSSAS.filter((e) => !e.enquadramentoPorSecundario);
  const secVivas = vivas.filter((c) => c.porSecundario).length;
  const priVivas = vivas.filter((c) => !c.porSecundario).length;
  console.log(`  CNAE principal:  ${N(priVivas).padStart(6)} de ${N(pri.length).padStart(6)} com pegada viva  (${pct(priVivas, pri.length)})`);
  console.log(`  só secundário:   ${N(secVivas).padStart(6)} de ${N(sec.length).padStart(6)} com pegada viva  (${pct(secVivas, sec.length)})`);

  console.log('\n  por subsetor — quanto do subsetor tem pegada viva:');
  const porSub = new Map();
  for (const e of NOSSAS) {
    const s = porSub.get(e.subsetor) || { total: 0, viva: 0, sec: 0, secViva: 0 };
    s.total++; if (e.enquadramentoPorSecundario) s.sec++;
    porSub.set(e.subsetor, s);
  }
  for (const c of vivas) {
    const s = porSub.get(c.subsetor); if (!s) continue;
    s.viva++; if (c.porSecundario) s.secViva++;
  }
  console.log('       total    viva      %   subsetor');
  for (const [sub, s] of [...porSub.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`    ${N(s.total).padStart(8)}${N(s.viva).padStart(8)}${pct(s.viva, s.total).padStart(8)}   ${sub}`);
  }

  console.log(`\n  ─── DESCOBRE ─────────────────────────────────────────────────`);
  console.log(`  declaram Indústria Química ao IBAMA e NÃO estão no nosso universo: ${N(descobertas.length)}`);
  console.log(`  (mais ${N(descobertasFora.length)} que só declaram farma ou cosmético — fora do escopo da reunião)`);
  if (descobertas.length) {
    console.log('  ATENÇÃO: não dá para saber, só com isto, se o CNAE na Receita não é químico');
    console.log('  ou se a empresa entrou no recorte e foi cortada por idade, Simples ou inatividade.');
    console.log('  Separar os dois casos exige uma segunda passada na base da RFB, por raiz de CNPJ.');
    for (const d of descobertas.slice(0, 12)) {
      console.log(`      ${d.raiz}  ${d.nome.slice(0, 44).padEnd(44)} ${(d.ufs[0] || '').slice(0, 18).padEnd(18)} ${d.ano}`);
    }
    if (descobertas.length > 12) console.log(`      … e mais ${N(descobertas.length - 12)}`);
  }

  console.log(`\n  ─── DISCORDA ─────────────────────────────────────────────────`);
  console.log(`  CNAE e IBAMA apontam subsetores diferentes: ${N(divergentes.length)}`);
  const paresDiv = new Map();
  for (const d of divergentes) {
    const k = `${d.cnaeDiz}  →  ${d.ibamaDiz.join(' / ')}`;
    paresDiv.set(k, (paresDiv.get(k) || 0) + 1);
  }
  for (const [k, n] of [...paresDiv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`      ${N(n).padStart(5)}  ${k}`);
  }
  console.log(`\n  no escopo pelo CNAE, mas o IBAMA diz farma/cosmético: ${N(foraDoEscopoMarcadas.length)}`);

  /* ---- 6. grava ----------------------------------------------------------- */
  const colunas = ['raiz', 'grau', 'viva', 'ano', 'formularios', 'categorias', 'detalhes', 'ufsIbama'];
  const linhas = confirmadas.map((c) => colunas.map((k) => (c[k] === undefined ? null : c[k])));

  const cabecalho = `/* =============================================================================
 *  GHT4 · PEGADA AMBIENTAL — gerado por ferramentas/cruzar-ibama.mjs
 * -----------------------------------------------------------------------------
 *  Gerado em ${new Date().toISOString().slice(0, 10)} a partir do RAPP do IBAMA.
 *  NÃO editar à mão.
 *
 *  window.IBAMA_PEGADA[cnpjRaiz] devolve a confirmação independente de que a
 *  empresa exerce atividade química de fato — declarada por ela ao órgão
 *  ambiental, sem passar pelo CNAE.
 *
 *    grau  'industria'  declarou a categoria Indústria Química
 *          'transporte' consta no formulário de transporte de químico perigoso
 *          'comercio'   transporte, terminais, depósitos e comércio
 *          'outra'      tem RAPP, mas em categoria não química
 *    viva  entregou RAPP de ${ANO_CORTE} em diante
 *
 *  ${N(confirmadas.length)} de ${N(NOSSAS.length)} empresas do universo têm pegada. A AUSÊNCIA de pegada
 *  NÃO é prova de que a empresa não opera — empresa pequena pode legitimamente
 *  não ter obrigação de RAPP. Rebaixa confiança; não descarta.
 * ========================================================================== */

`;
  const corpo = `const COLUNAS_IBAMA = ${JSON.stringify(colunas)};\n`
    + 'const LINHAS_IBAMA = [\n'
    + linhas.map((l) => JSON.stringify(l)).join(',\n')
    + '\n];\n\n'
    + 'const IBAMA_PEGADA = {};\n'
    + 'LINHAS_IBAMA.forEach(function (linha) {\n'
    + '  var p = {};\n'
    + '  for (var i = 0; i < COLUNAS_IBAMA.length; i++) p[COLUNAS_IBAMA[i]] = linha[i];\n'
    + '  IBAMA_PEGADA[p.raiz] = p;\n'
    + '});\n\n'
    + `const IBAMA_RESUMO = ${JSON.stringify({
        universo: NOSSAS.length, comPegada: confirmadas.length, viva: vivas.length,
        semPegada: semPegada.length, descobertas: descobertas.length,
        divergentes: divergentes.length, anoCorte: ANO_CORTE,
        formularios: FORMULARIOS.map((f) => f.rotulo),
      })};\n\n`
    + 'window.IBAMA_PEGADA = IBAMA_PEGADA;\n'
    + 'window.IBAMA_RESUMO = IBAMA_RESUMO;\n';

  fs.writeFileSync(SAIDA, cabecalho + corpo, 'utf8');
  console.log(`\n  gravado: ${path.relative(RAIZ, SAIDA)} (${(fs.statSync(SAIDA).size / 1048576).toFixed(1)} MB)`);

  /* As descobertas saem em CSV, não em JS: elas não alimentam a tela, alimentam
     a PRÓXIMA ingestão — é uma lista de CNPJs para buscar no cadastro por raiz,
     e não por CNAE. Formato de planilha porque quem vai olhar é gente. */
  const linhaCsv = (d, escopo) =>
    [d.raiz, `"${d.nome.replace(/"/g, "'")}"`, d.ufs[0] || '', d.ano, escopo,
      `"${d.detalhes.join(' | ').replace(/"/g, "'")}"`].join(';');
  const csv = ['cnpj_raiz;razao_social_ibama;uf;ultimo_rapp;escopo;detalhe_declarado']
    .concat(descobertas.map((d) => linhaCsv(d, 'dentro')))
    .concat(descobertasFora.map((d) => linhaCsv(d, 'fora')))
    .join('\n');
  fs.writeFileSync(SAIDA_FORA, '﻿' + csv, 'utf8');
  console.log(`  gravado: ${path.relative(RAIZ, SAIDA_FORA)} (${N(descobertas.length + descobertasFora.length)} candidatas, ${N(descobertas.length)} dentro do escopo)\n`);
}

/* Encerramento explícito: process.exit() com socket do undici ainda aberto
   dispara assertion do libuv no Windows. Destruir o pool e deixar o Node sair
   sozinho é o único caminho que não trava. */
async function encerrar() {
  const pool = globalThis[Symbol.for('undici.globalDispatcher.1')];
  if (pool && typeof pool.destroy === 'function') { try { await pool.destroy(); } catch { /* já foi */ } }
}

try { await principal(); }
catch (erro) { console.error(`\n  ERRO: ${erro.message}\n`); process.exitCode = 1; }
finally { await encerrar(); }
