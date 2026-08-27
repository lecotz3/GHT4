/* =============================================================================
 *  GHT4 · IMPORTADOR DA BASE CNPJ — UNIVERSO DO SETOR QUÍMICO
 * -----------------------------------------------------------------------------
 *  POR QUE ESTE ARQUIVO EXISTE
 *  A base da CVM tem SEIS companhias no setor químico, e NENHUMA na faixa
 *  consolidável de R$ 30–250 mi. Rode `node ferramentas/importar-cvm.mjs` e o
 *  terminal diz isso na cara. Filtrar seis registros não é originação — é uma
 *  lista de e-mails.
 *
 *  Este importador troca a base primária do agente. Ele lê os dados abertos do
 *  CNPJ da Receita Federal — o cadastro inteiro das pessoas jurídicas do país —
 *  e devolve o universo do setor químico: dezenas de milhares de empresas, a
 *  esmagadora maioria de CAPITAL FECHADO, que é exatamente o cliente típico de
 *  uma boutique e exatamente quem a CVM não enxerga.
 *
 *  O QUE ESTA BASE NÃO TEM, E É PRECISO DIZER ANTES DE QUALQUER COISA
 *  Ela não tem faturamento. Nem EBITDA, nem margem, nem número de funcionários.
 *  O campo `receita` sai NULO para todos os registros, de propósito. A tentação
 *  de preencher receita com capital social é forte e está errada: capital social
 *  é o que os sócios integralizaram, muitas vezes há vinte anos e em moeda
 *  diferente, e não guarda relação estável com faturamento. Preencher seria
 *  produzir um filtro de receita que funciona na tela e mente no resultado.
 *
 *  O porte vem na etapa seguinte do pipeline (Econodata/Neoway para faturamento
 *  estimado, Comex para faixa de importação). Ver `fontes.js`.
 *
 *  O QUE ESTA BASE TEM E NENHUMA OUTRA TEM
 *  1. O universo de capital fechado. Ninguém mais publica isso.
 *  2. O quadro societário com FAIXA ETÁRIA de cada sócio. Sócio único acima de
 *     60 anos, empresa com mais de 25 anos, nenhum sócio jovem no quadro: é o
 *     retrato da sucessão sem sucessor, que é o gatilho de venda mais comum no
 *     middle market industrial brasileiro. O sinal `sucessaoProvavel` sai daqui.
 *  3. Um limite superior de receita de graça: quem é optante do Simples fatura,
 *     por definição legal, no máximo R$ 4,8 mi/ano. Não é estimativa — é
 *     consequência da opção tributária. Serve para CORTAR, não para estimar.
 *  4. Filiais por UF, que é expansão geográfica com data de início de atividade.
 *  5. Histórico mensal desde 2023-05 no repositório da RFB — ver `--mes`.
 *     Isso é o que permite reconstruir EVENTOS societários para trás, sem
 *     esperar coleta. Ver ferramentas/eventos-cnpj.mjs.
 *
 *  USO
 *    node ferramentas/importar-cnpj.mjs                 # último mês publicado
 *    node ferramentas/importar-cnpj.mjs --mes=2026-08   # mês específico
 *    node ferramentas/importar-cnpj.mjs --cache         # guarda os .zip em disco
 *    node ferramentas/importar-cnpj.mjs --arquivar      # grava snapshot p/ delta
 *    node ferramentas/importar-cnpj.mjs --listar-meses  # meses disponíveis
 *
 *  CUSTO DE REDE: cerca de 5 GB por execução (Estabelecimentos sozinho tem ~3,5
 *  GB). Por padrão o arquivo é consumido em fluxo, direto da rede, sem gravar em
 *  disco — o filtro reduz tudo a alguns milhares de registros na memória. Com
 *  --cache os .zip ficam em ferramentas/.cache-cnpj para a próxima execução não
 *  baixar de novo, ao custo do espaço em disco.
 *
 *  LGPD — decisão consciente, igual à do importador da CVM
 *  O quadro societário traz NOME DE PESSOA FÍSICA. O agente precisa da ESTRUTURA
 *  (quantos sócios, de que faixa etária, PF ou PJ, de que país) para os sinais
 *  de sucessão e de controle; não precisa dos nomes para isso. Por padrão os
 *  nomes NÃO são gravados: só a estrutura. Mude INCLUIR_NOME_SOCIOS para true se
 *  a casa decidir o contrário — e registre a decisão, porque ela muda o
 *  tratamento de dado pessoal do produto inteiro.
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(RAIZ, 'ferramentas', '.cache-cnpj');
const HISTORICO = path.join(RAIZ, 'ferramentas', 'historico-cnpj');
const SAIDA = path.join(RAIZ, 'data-quimicos.js');

/* ---- parâmetros ajustáveis ------------------------------------------------ */
const INCLUIR_NOME_SOCIOS = false;  // ver nota de LGPD acima
const IDADE_MINIMA_ANOS   = 3;      // CNPJ recém-aberto não é alvo de M&A
const EXCLUIR_SIMPLES     = true;   // optante do Simples fatura ≤ R$ 4,8 mi/ano
const EXCLUIR_MEI         = true;   // MEI fatura ≤ R$ 81 mil/ano
const SITUACAO_ATIVA      = '02';   // código da RFB para "ATIVA"
const IDADE_SUCESSAO      = 20;     // anos de empresa que caracterizam maturidade

/* ---- o repositório da RFB é um compartilhamento Nextcloud ------------------
 * A raiz de arquivos.receitafederal.gov.br redireciona para um share público
 * cujo token vale como usuário do WebDAV. Não é gambiarra: é a forma publicada
 * de acesso, e é o que permite LISTAR os meses disponíveis em vez de adivinhar
 * a URL. Se o token mudar, o script avisa em vez de falhar em silêncio.
 * -------------------------------------------------------------------------- */
const HOST  = 'https://arquivos.receitafederal.gov.br';
const TOKEN = 'gn672Ad4CF8N6TK';
const BASE  = '/public.php/webdav/Dados/Cadastros/CNPJ';
const AUTH  = 'Basic ' + Buffer.from(TOKEN + ':').toString('base64');

/* ---- taxonomia: os CNAEs do escopo ----------------------------------------
 * Espelha `setores.js`. Está duplicado aqui de propósito: setores.js é um script
 * de navegador (window.SETORES) e este é um módulo de Node. Duplicar sete linhas
 * custa menos que converter setores.js para ESM e quebrar o duplo-clique no
 * index.html, que é o que faz o protótipo funcionar numa sala de reunião.
 *
 * Se mexer num, mexa no outro — e rode `node ferramentas/verificar-taxonomia.mjs`,
 * que compara as duas listas e reprova a divergência. O risco que ele existe
 * para eliminar é o pior possível: a tela dizendo um recorte e a ingestão
 * fazendo outro, sem ninguém perceber.
 * -------------------------------------------------------------------------- */
const SUBSETOR_POR_CNAE = {
  // Distribuição e trading químico
  '4684201': 'Distribuição e trading químico',
  '4684202': 'Distribuição e trading químico',
  '4684299': 'Distribuição e trading químico',
  // Especialidades e aditivos
  '2091600': 'Especialidades e aditivos',
  '2093200': 'Especialidades e aditivos',
  '2094100': 'Especialidades e aditivos',
  '2099101': 'Especialidades e aditivos',
  '2099199': 'Especialidades e aditivos',
  // Tintas, vernizes e revestimentos
  '2071100': 'Tintas, vernizes e revestimentos',
  '2072000': 'Tintas, vernizes e revestimentos',
  '2073800': 'Tintas, vernizes e revestimentos',
  // Domissanitários e produtos de limpeza
  '2052500': 'Domissanitários e produtos de limpeza',
  '2061400': 'Domissanitários e produtos de limpeza',
  '2062200': 'Domissanitários e produtos de limpeza',
  // Inorgânicos e gases industriais
  '2011800': 'Inorgânicos e gases industriais',
  '2014200': 'Inorgânicos e gases industriais',
  '2019399': 'Inorgânicos e gases industriais',
  // Fertilizantes e nutrição vegetal
  '2012600': 'Fertilizantes e nutrição vegetal',
  '2013400': 'Fertilizantes e nutrição vegetal',
  '2013401': 'Fertilizantes e nutrição vegetal',
  '2013402': 'Fertilizantes e nutrição vegetal',
  '4683400': 'Fertilizantes e nutrição vegetal',
  // Defensivos agrícolas
  '2051700': 'Defensivos agrícolas',
  // Explosivos e pirotecnia
  '2092401': 'Explosivos e pirotecnia',
  '2092402': 'Explosivos e pirotecnia',
  '2092403': 'Explosivos e pirotecnia',
  // Resinas, elastômeros e fibras
  '2031200': 'Resinas, elastômeros e fibras',
  '2032100': 'Resinas, elastômeros e fibras',
  '2033900': 'Resinas, elastômeros e fibras',
  '2040100': 'Resinas, elastômeros e fibras',
  // Petroquímica básica e intermediários (contexto: sem alvo de boutique)
  '2021500': 'Petroquímica básica e intermediários',
  '2022300': 'Petroquímica básica e intermediários',
  '2029100': 'Petroquímica básica e intermediários',
};
/* 2019301 (combustíveis nucleares) fica fora: monopólio estatal, sem transação
   privada possível. 2063100 (cosméticos) fica fora: adjacência declarada. */

/* Subsetor sem alvo de boutique — entra no mapa como contexto, não como lista. */
const SUBSETORES_CONTEXTO = new Set(['Petroquímica básica e intermediários']);

/* ---- CLI ------------------------------------------------------------------ */
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt  = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };

const USAR_CACHE = flag('cache');
const ARQUIVAR   = flag('arquivar');

/* ---- WebDAV: listar e baixar ---------------------------------------------- */

/** Destrói o pool de conexões para o laço de eventos poder esvaziar. Ver o
    bloco de encerramento no fim do arquivo, que explica por quê. */
async function encerrar() {
  const pool = globalThis[Symbol.for('undici.globalDispatcher.1')];
  if (pool && typeof pool.destroy === 'function') { try { await pool.destroy(); } catch { /* já destruído */ } }
}

async function listar(caminho) {
  const r = await fetch(HOST + caminho, {
    method: 'PROPFIND',
    headers: { Authorization: AUTH, Depth: '1' },
  });
  if (!r.ok) {
    throw new Error(`${r.status} ao listar ${caminho}. `
      + 'Se o repositório da RFB mudou de endereço, atualize HOST/TOKEN/BASE no topo deste arquivo.');
  }
  const xml = await r.text();
  const hrefs = [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/gi)].map((m) => decodeURIComponent(m[1]));
  return hrefs.filter((h) => h !== caminho + '/' && h !== caminho);
}

async function mesesDisponiveis() {
  const itens = await listar(BASE);
  return itens.map((h) => (h.match(/(\d{4}-\d{2})\/?$/) || [])[1]).filter(Boolean).sort();
}

/**
 * Descarta o cabeçalho local do ZIP e deixa passar só os bytes comprimidos.
 *
 * Os arquivos da RFB têm UMA entrada por .zip, então o cabeçalho local está no
 * offset 0 — dá para inflar direto do fluxo HTTP, sem gravar o arquivo em disco.
 * Estabelecimentos tem 3,5 GB: essa diferença é o que torna a execução viável
 * numa máquina comum. Sendo um Transform de verdade, a contrapressão do resto do
 * cano funciona: o download desacelera quando o parser não dá conta, em vez de
 * empilhar gigabytes na memória.
 */
function tiraCabecalhoZip(arquivo) {
  let buf = Buffer.alloc(0);
  let pronto = false;
  return new Transform({
    transform(pedaco, _enc, cb) {
      if (pronto) { this.push(pedaco); return cb(); }
      buf = Buffer.concat([buf, pedaco]);
      if (buf.length < 30) return cb();
      if (buf.readUInt32LE(0) !== 0x04034b50) return cb(new Error(`${arquivo}: não é um ZIP`));
      const metodo = buf.readUInt16LE(8);
      if (metodo !== 8) {
        return cb(new Error(`${arquivo}: método de compressão ${metodo}; este leitor só trata deflate (8). `
          + 'Se a RFB mudou o formato, ajuste tiraCabecalhoZip().'));
      }
      const inicio = 30 + buf.readUInt16LE(26) + buf.readUInt16LE(28);
      if (buf.length < inicio) return cb();
      pronto = true;
      this.push(buf.subarray(inicio));
      buf = null;
      cb();
    },
  });
}

/** Conta os bytes que passam, só para o terminal mostrar progresso. */
function contador(estado) {
  return new Transform({
    transform(pedaco, _enc, cb) { estado.bytes += pedaco.length; this.push(pedaco); cb(); },
  });
}

/** Devolve as linhas de texto (latin1) de um .zip do repositório. */
async function* linhasDoZip(mes, arquivo) {
  const bruto = await abrirZipBruto(mes, arquivo);
  const estado = { bytes: 0 };

  const inflado = bruto
    .pipe(contador(estado))
    .pipe(tiraCabecalhoZip(arquivo))
    .pipe(zlib.createInflateRaw());

  /* readline cuida da contrapressão e da quebra de linha; setEncoding garante
     latin1, que é como a RFB publica (acento em CSV utf-8 seria outra história). */
  inflado.setEncoding('latin1');
  const rl = readline.createInterface({ input: inflado, crlfDelay: Infinity });

  try {
    for await (const linha of rl) if (linha) yield linha;
  } finally {
    rl.close();
    process.stdout.write(`  · ${(estado.bytes / 1048576).toFixed(0)} MB\n`);
  }
}

async function abrirZipBruto(mes, arquivo) {
  const local = path.join(CACHE, mes, arquivo);
  if (USAR_CACHE && fs.existsSync(local)) {
    process.stdout.write(`  (cache) ${arquivo}`);
    return fs.createReadStream(local);
  }
  process.stdout.write(`  lendo ${arquivo}`);
  const r = await fetch(`${HOST}${BASE}/${mes}/${arquivo}`, { headers: { Authorization: AUTH } });
  if (!r.ok) throw new Error(`${r.status} ao baixar ${arquivo}`);
  if (!USAR_CACHE) return Readable.fromWeb(r.body);

  fs.mkdirSync(path.join(CACHE, mes), { recursive: true });
  const parcial = local + '.parcial';
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(parcial));
  fs.renameSync(parcial, local);
  return fs.createReadStream(local);
}

/* ---- CSV da RFB: latin1, ";" como separador, campos entre aspas ------------ */
function campos(linha) {
  const saida = [];
  let atual = '';
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { dentro = !dentro; continue; }
    if (c === ';' && !dentro) { saida.push(atual); atual = ''; continue; }
    atual += c;
  }
  saida.push(atual);
  return saida;
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'para', 'com', 'por']);
function nomeBonito(s) {
  const limpo = String(s || '').replace(/\s+/g, ' ').trim();
  return limpo.split(' ').map((p, i) => {
    const b = p.toLowerCase();
    if (i > 0 && MINUSCULAS.has(b)) return b;
    if (/^(s\.?a\.?|s\/a|ltda\.?|me|epp|cia\.?|eireli)$/i.test(p)) {
      return /^s\.?a\.?$|^s\/a$/i.test(p) ? 'S.A.' : (b[0].toUpperCase() + b.slice(1));
    }
    if (p.length <= 3 && p === p.toUpperCase() && !/[aeiou]/i.test(p)) return p;
    return b[0] ? b[0].toUpperCase() + b.slice(1) : p;
  }).join(' ');
}

const anosDesde = (aaaammdd) => {
  if (!/^\d{8}$/.test(aaaammdd)) return null;
  const ano = +aaaammdd.slice(0, 4), mes = +aaaammdd.slice(4, 6), dia = +aaaammdd.slice(6, 8);
  if (!ano || ano < 1900) return null;
  const d = new Date(ano, mes - 1, dia);
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
};
const iso = (aaaammdd) => /^\d{8}$/.test(aaaammdd)
  ? `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}` : null;

/* Faixa etária do sócio, na codificação da RFB. */
const FAIXA_ETARIA = {
  '0': null, '1': '0–12', '2': '13–20', '3': '21–30', '4': '31–40',
  '5': '41–50', '6': '51–60', '7': '61–70', '8': '71–80', '9': '80+',
};
const FAIXA_IDOSA = new Set(['7', '8', '9']);      // 61 anos ou mais
const FAIXA_JOVEM = new Set(['2', '3', '4', '5']); // até 50 anos

/* Natureza jurídica → perfil societário, na linguagem do agente.
 * --------------------------------------------------------------------------
 * Os códigos saem da TABELA OFICIAL da RFB (`Naturezas.zip`, mesmo repositório
 * de onde este importador já lê `Municipios.zip`, referência 2026-08). Uma cópia
 * fica em `ferramentas/naturezas-rfb.csv` para o mapeamento abaixo ser
 * conferível sem rede. O rótulo oficial de cada código está no comentário.
 *
 * Confundir código aqui não gera erro visível: gera rótulo errado na tela e
 * sinal desligado em silêncio. Foi o que aconteceu na versão anterior, que
 * tratava 2062 (LTDA) e 2054 (S.A. FECHADA) como "Capital aberto": das 34.430
 * empresas nessas duas naturezas, 33.268 saíram com o rótulo — o universo de
 * capital FECHADO carimbado como aberto. E 2046 (S.A. ABERTA), a única que é de
 * fato capital aberto, caía na regex de estatal. Como `sucessao_familiar`
 * em scoring.js exige perfil === 'Familiar', o sinal central da tese ficava
 * apagado justamente na base primária.
 * -------------------------------------------------------------------------- */
const NAT_ESTATAL   = new Set(['2011', '2038']);          // Empresa Pública; Soc. de Economia Mista
const NAT_ABERTA    = new Set(['2046']);                  // Sociedade Anônima Aberta
const NAT_COOPER    = new Set(['2143', '2330']);          // Cooperativa; Cooperativas de Consumo
const NAT_FUNDO     = new Set(['2224', '3247']);          // Clube/Fundo de Investimento; Fundo Privado
const NAT_SEM_FINS  = new Set(['3069', '3131', '3212', '3220', '3999']);
                     // Fundação Privada; Entidade Sindical; Fundação ou Associação
                     // Domiciliada no Exterior; Organização Religiosa; Associação Privada
const NAT_EXTERIOR  = new Set(['2178', '2216', '2275']);  // Estabelecimento, no Brasil, de Sociedade
                     // Estrangeira; Empresa Domiciliada no Exterior; Empresa Binacional
const NAT_GRUPO     = new Set(['2127', '2151', '2160']);  // Soc. em Conta de Participação;
                     // Consórcio de Sociedades; Grupo de Sociedades
const NAT_UNIPESSOAL = new Set(['2135', '2305', '2313', '2321']);
                     // Empresário (Individual); EIRELI empresária; EIRELI simples;
                     // Sociedade Unipessoal de Advocacia

function perfilDe(natureza, socios) {
  /* A forma jurídica decide primeiro: ela vale mesmo quando o quadro de sócios
     não veio (Empresário Individual não tem sócio no arquivo da RFB). */
  if (/^1\d{3}$/.test(natureza) || NAT_ESTATAL.has(natureza)) return 'Estatal';
  if (NAT_ABERTA.has(natureza)) return 'Capital aberto';
  if (NAT_COOPER.has(natureza)) return 'Cooperativa';
  if (NAT_SEM_FINS.has(natureza)) return 'Entidade sem fins lucrativos';
  if (NAT_FUNDO.has(natureza)) return 'Fundo/PE';
  if (NAT_EXTERIOR.has(natureza)) return 'Multinacional';
  if (NAT_UNIPESSOAL.has(natureza)) return 'Founder-led';
  if (NAT_GRUPO.has(natureza)) return 'Holding de participações';

  /* Daqui para baixo é sociedade de capital fechado — LTDA (2062), S.A. fechada
     (2054), sociedades simples. Quem controla sai do quadro de sócios. */
  if (socios.some((s) => s.pais && s.pais !== 'BRASIL')) return 'Multinacional';
  if (socios.some((s) => s.tipo === 'juridica')) return 'Holding de participações';
  if (socios.length === 1) return 'Founder-led';
  if (socios.length === 0) return 'Quadro não informado';
  return 'Familiar';
}

async function principal() {
  /* ========================== EXECUÇÃO ====================================== */
  console.log('\nGHT4 · importando o universo do setor químico (dados abertos do CNPJ)\n');

  const meses = await mesesDisponiveis();
  if (flag('listar-meses')) {
    console.log(`  ${meses.length} meses disponíveis no repositório da RFB:`);
    console.log('  ' + meses.join('  '));
    console.log('\n  O histórico permite reconstruir eventos societários para trás:');
    console.log('  node ferramentas/importar-cnpj.mjs --mes=' + meses[0] + ' --arquivar');
    console.log('  node ferramentas/importar-cnpj.mjs --mes=' + meses[meses.length - 1] + ' --arquivar');
    console.log('  node ferramentas/eventos-cnpj.mjs\n');
    return;
  }

  const MES = opt('mes') || meses[meses.length - 1];
  if (!meses.includes(MES)) {
    throw new Error(`mês ${MES} não existe no repositório. Disponíveis: ${meses.join(', ')}`);
  }
  console.log(`  referência: ${MES}  (${meses.length} meses no repositório, de ${meses[0]} a ${meses[meses.length - 1]})`);
  console.log(`  escopo: ${Object.keys(SUBSETOR_POR_CNAE).length} CNAEs em ${new Set(Object.values(SUBSETOR_POR_CNAE)).size} subsetores\n`);

  /* ---- 1. tabela de municípios ---------------------------------------------- */
  const municipios = new Map();
  for await (const l of linhasDoZip(MES, 'Municipios.zip')) {
    const f = campos(l);
    municipios.set(f[0], f[1]);
  }
  console.log(`  municípios: ${municipios.size}`);

  /* ---- 2. ESTABELECIMENTOS — a passada cara, e a que define o universo -------
   * Layout: cnpjBasico;cnpjOrdem;cnpjDv;matrizFilial;nomeFantasia;situacao;
   *         dataSituacao;motivo;cidadeExterior;pais;dataInicio;cnaePrincipal;
   *         cnaeSecundaria;tipoLogradouro;logradouro;numero;complemento;bairro;
   *         cep;uf;municipio;ddd1;tel1;ddd2;tel2;dddFax;fax;email;
   *         situacaoEspecial;dataSituacaoEspecial
   *
   * Guardamos APENAS os estabelecimentos que casam com o escopo. É o que mantém a
   * memória em alguns milhares de registros em vez de dezenas de milhões.
   * -------------------------------------------------------------------------- */
  const emEscopo = new Map();   // cnpjBasico -> dados agregados
  let lidos = 0;

  for (let i = 0; i <= 9; i++) {
    for await (const l of linhasDoZip(MES, `Estabelecimentos${i}.zip`)) {
      lidos++;
      const f = campos(l);
      const principal = f[11];
      const secundarias = f[12] || '';

      let sub = SUBSETOR_POR_CNAE[principal];
      let porSecundario = false;
      if (!sub && secundarias) {
        for (const c of secundarias.split(',')) {
          if (SUBSETOR_POR_CNAE[c]) { sub = SUBSETOR_POR_CNAE[c]; porSecundario = true; break; }
        }
      }
      if (!sub) continue;

      const base = f[0];
      const eMatriz = f[3] === '1';
      const ativa = f[5] === SITUACAO_ATIVA;

      let reg = emEscopo.get(base);
      if (!reg) {
        reg = { base, ufs: new Set(), estabelecimentos: 0, ativos: 0, matriz: null, melhor: null,
                cnaes: new Set(), porSecundarioApenas: true, aberturaFilial: null };
        emEscopo.set(base, reg);
      }
      reg.estabelecimentos++;
      if (ativa) reg.ativos++;
      if (f[19]) reg.ufs.add(f[19]);
      reg.cnaes.add(principal);
      if (!porSecundario) reg.porSecundarioApenas = false;

      const dados = {
        cnpj: base + f[1] + f[2], eMatriz, ativa, situacao: f[5],
        dataSituacao: f[6], nomeFantasia: f[4], dataInicio: f[10],
        cnaePrincipal: principal, cnaeSecundarias: secundarias,
        uf: f[19], municipio: municipios.get(f[20]) || '',
        email: f[27], ddd: f[21], telefone: f[22],
        subsetor: sub, porSecundario,
      };
      if (eMatriz) reg.matriz = dados;
      /* Se a matriz não casou com o escopo, a melhor referência é o primeiro
         estabelecimento ativo que casou — é dele que sai o endereço. */
      if (!reg.melhor || (ativa && !reg.melhor.ativa)) reg.melhor = dados;
      /* Filial aberta fora da UF da matriz é expansão geográfica com data. */
      if (!eMatriz && ativa && f[10] && (!reg.aberturaFilial || f[10] > reg.aberturaFilial)) {
        reg.aberturaFilial = f[10];
      }
    }
  }
  console.log(`\n  estabelecimentos lidos: ${lidos.toLocaleString('pt-BR')}`);
  console.log(`  no escopo químico: ${emEscopo.size.toLocaleString('pt-BR')} empresas (CNPJ raiz)\n`);

  /* ---- 3. EMPRESAS — razão social, natureza jurídica, capital, porte --------- */
  const dadosEmpresa = new Map();
  for (let i = 0; i <= 9; i++) {
    for await (const l of linhasDoZip(MES, `Empresas${i}.zip`)) {
      const f = campos(l);
      if (!emEscopo.has(f[0])) continue;
      dadosEmpresa.set(f[0], {
        razaoSocial: f[1], natureza: f[2], capitalSocial: parseFloat(String(f[4]).replace(',', '.')) || 0,
        porte: f[5],
      });
    }
  }
  console.log(`  empresas casadas: ${dadosEmpresa.size.toLocaleString('pt-BR')}`);

  /* ---- 4. SIMPLES — o limite superior de receita que sai de graça ------------ */
  const simples = new Map();
  for await (const l of linhasDoZip(MES, 'Simples.zip')) {
    const f = campos(l);
    if (!emEscopo.has(f[0])) continue;
    simples.set(f[0], { simples: f[1] === 'S', mei: f[4] === 'S' });
  }
  console.log(`  registros do Simples casados: ${simples.size.toLocaleString('pt-BR')}`);

  /* ---- 5. SÓCIOS — a estrutura societária, sem os nomes por padrão ----------- */
  const sociosPorEmpresa = new Map();
  for (let i = 0; i <= 9; i++) {
    for await (const l of linhasDoZip(MES, `Socios${i}.zip`)) {
      const f = campos(l);
      if (!emEscopo.has(f[0])) continue;
      const lista = sociosPorEmpresa.get(f[0]) || [];
      lista.push({
        tipo: f[1] === '1' ? 'juridica' : f[1] === '2' ? 'fisica' : 'estrangeiro',
        nome: INCLUIR_NOME_SOCIOS ? nomeBonito(f[2]) : null,
        qualificacao: f[4],
        entrada: iso(f[5]),
        pais: f[6] || null,
        faixaEtariaCod: f[10],
        faixaEtaria: FAIXA_ETARIA[f[10]] || null,
      });
      sociosPorEmpresa.set(f[0], lista);
    }
  }
  console.log(`  empresas com quadro societário: ${sociosPorEmpresa.size.toLocaleString('pt-BR')}\n`);

  /* ---- 6. MONTAGEM ---------------------------------------------------------- */
  const empresas = [];
  const cortes = { inativa: 0, jovem: 0, simples: 0, mei: 0, semCadastro: 0, soSecundario: 0 };

  for (const [base, reg] of emEscopo) {
    const emp = dadosEmpresa.get(base);
    if (!emp) { cortes.semCadastro++; continue; }

    const ref = reg.matriz && reg.matriz.ativa ? reg.matriz : (reg.melhor || reg.matriz);
    if (!ref) { cortes.semCadastro++; continue; }

    if (reg.ativos === 0) { cortes.inativa++; continue; }

    const idade = anosDesde(ref.dataInicio);
    if (idade !== null && idade < IDADE_MINIMA_ANOS) { cortes.jovem++; continue; }

    const sn = simples.get(base) || { simples: false, mei: false };
    if (EXCLUIR_MEI && sn.mei) { cortes.mei++; continue; }
    if (EXCLUIR_SIMPLES && sn.simples) { cortes.simples++; continue; }

    const socios = sociosPorEmpresa.get(base) || [];
    const pf = socios.filter((s) => s.tipo === 'fisica');
    const idosos = pf.filter((s) => FAIXA_IDOSA.has(s.faixaEtariaCod));
    const jovens = pf.filter((s) => FAIXA_JOVEM.has(s.faixaEtariaCod));

    /* SUCESSÃO SEM SUCESSOR — o sinal que só esta base sustenta.
       Empresa madura, todos os sócios pessoa física acima de 60, nenhum abaixo de
       50 no quadro. Não prova que há venda a caminho; prova que a estrutura de
       controle vai ter de mudar, e é isso que abre a conversa de originação. */
    const sucessaoProvavel = pf.length > 0
      && idosos.length === pf.length
      && jovens.length === 0
      && idade !== null && idade >= IDADE_SUCESSAO;

    const ufs = [...reg.ufs].filter(Boolean).sort();
    const expansao = ufs.length > 1;

    empresas.push({
      id: 'cnpj' + base,
      nome: nomeBonito(ref.nomeFantasia || emp.razaoSocial),
      razaoSocial: nomeBonito(emp.razaoSocial),
      subsetor: ref.subsetor,
      cidade: nomeBonito(ref.municipio),
      uf: ref.uf,

      /* ---- O QUE ESTA FONTE NÃO TEM. Nulo, e declarado, nunca inventado. ---- */
      receita: null,
      crescimento: null,
      margemEbitda: null,
      funcionarios: null,

      /* ---- o que ela tem ---- */
      cnpjRaiz: base,
      cnaePrincipal: ref.cnaePrincipal,
      cnaeSecundarias: ref.cnaeSecundarias ? ref.cnaeSecundarias.split(',') : [],
      enquadramentoPorSecundario: ref.porSecundario,
      naturezaJuridica: emp.natureza,
      capitalSocial: emp.capitalSocial,
      porteDeclarado: emp.porte,
      optanteSimples: sn.simples,
      /* Limite superior de receita por consequência legal da opção tributária —
         não é estimativa. Nulo quando a empresa não é optante, porque aí não há
         teto conhecido. */
      tetoReceitaLegal: sn.simples ? 4.8 : null,
      dataAbertura: iso(ref.dataInicio),
      idadeAnos: idade,
      estabelecimentos: reg.estabelecimentos,
      estabelecimentosAtivos: reg.ativos,
      ufsAtuacao: ufs,
      situacaoCadastral: ref.situacao,
      perfil: perfilDe(emp.natureza, socios),

      /* ---- estrutura societária (sem nomes, ver LGPD no topo) ---- */
      qtdSocios: socios.length,
      qtdSociosPf: pf.length,
      qtdSociosPj: socios.filter((s) => s.tipo === 'juridica').length,
      socioEstrangeiro: socios.some((s) => s.pais && s.pais !== 'BRASIL'),
      faixasEtarias: pf.map((s) => s.faixaEtaria).filter(Boolean),
      socios: INCLUIR_NOME_SOCIOS ? socios : undefined,

      contato: {
        nome: 'Canal cadastral',
        cargo: 'Contato declarado no CNPJ',
        email: ref.email || null,
        telefone: ref.ddd && ref.telefone ? `(${ref.ddd}) ${ref.telefone}` : null,
      },

      /* ---- SINAIS ----
         Três são calculáveis aqui. Os outros três exigem comparar dois meses do
         cadastro (ver eventos-cnpj.mjs) ou fonte externa, e por isso saem NULOS —
         nulo é "não avaliado", que é diferente de false, que seria "não ocorreu". */
      sucessaoProvavel,
      expansaoGeografica: expansao,
      aberturaFilialRecente: iso(reg.aberturaFilial),
      mercadoFragmentado: null,   // calculado por subsetor depois do carregamento
      rodadaRecente: null,        // exige delta de capital social entre dois meses
      mudancaControle: null,      // exige delta do quadro societário

    });
  }

  /* ---- 7. FRAGMENTAÇÃO POR SUBSETOR -----------------------------------------
   * Aqui o dado público sustenta uma afirmação que antes era hipótese: com o
   * universo inteiro na mão, dá para dizer quantas empresas cada subsetor tem.
   * O que NÃO dá é calcular HHI, porque HHI precisa de receita e não há receita.
   * Logo: contagem sim, concentração não. A diferença fica declarada.
   * -------------------------------------------------------------------------- */
  const porSubsetor = {};
  for (const e of empresas) porSubsetor[e.subsetor] = (porSubsetor[e.subsetor] || 0) + 1;
  for (const e of empresas) {
    e.mercadoFragmentado = SUBSETORES_CONTEXTO.has(e.subsetor) ? false : porSubsetor[e.subsetor] >= 200;
  }

  empresas.sort((a, b) => (b.capitalSocial || 0) - (a.capitalSocial || 0));

  /* ---- 8. RELATÓRIO --------------------------------------------------------- */
  console.log(`  → ${empresas.length.toLocaleString('pt-BR')} empresas no universo químico\n`);
  console.log(`     cortes: ${JSON.stringify(cortes)}`);
  console.log('\n     por subsetor:');
  for (const [s, n] of Object.entries(porSubsetor).sort((a, b) => b[1] - a[1])) {
    console.log(`       ${String(n).padStart(6)}  ${s}${SUBSETORES_CONTEXTO.has(s) ? '  (contexto — sem alvo de boutique)' : ''}`);
  }

  const porUf = {};
  for (const e of empresas) porUf[e.uf] = (porUf[e.uf] || 0) + 1;
  console.log('\n     dez maiores praças:');
  for (const [uf, n] of Object.entries(porUf).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`       ${String(n).padStart(6)}  ${uf}`);
  }

  const comSucessao = empresas.filter((e) => e.sucessaoProvavel).length;
  const comExpansao = empresas.filter((e) => e.expansaoGeografica).length;
  const comEstrangeiro = empresas.filter((e) => e.socioEstrangeiro).length;
  const comEmail = empresas.filter((e) => e.contato.email).length;
  console.log('\n     sinais calculáveis nesta fonte:');
  console.log(`       sucessão sem sucessor no quadro: ${comSucessao.toLocaleString('pt-BR')} (${(comSucessao / empresas.length * 100).toFixed(1)}%)`);
  console.log(`       presença em mais de uma UF:      ${comExpansao.toLocaleString('pt-BR')} (${(comExpansao / empresas.length * 100).toFixed(1)}%)`);
  console.log(`       sócio estrangeiro no quadro:     ${comEstrangeiro.toLocaleString('pt-BR')}`);
  console.log(`       com e-mail de contato no cadastro: ${comEmail.toLocaleString('pt-BR')}`);
  console.log('\n     NÃO calculáveis nesta fonte (saem nulos, por decisão):');
  console.log('       receita · EBITDA · margem · funcionários  → Econodata/Comex (ver fontes.js)');
  console.log('       rodada · mudança de controle              → delta entre dois meses (eventos-cnpj.mjs)');

  /* ---- 9. SNAPSHOT PARA O CÁLCULO DE EVENTOS -------------------------------- */
  if (ARQUIVAR) {
    fs.mkdirSync(HISTORICO, { recursive: true });
    const magro = empresas.map((e) => ({
      id: e.id, base: e.cnpjRaiz, nome: e.razaoSocial, subsetor: e.subsetor, uf: e.uf,
      capitalSocial: e.capitalSocial, qtdSocios: e.qtdSocios, qtdSociosPj: e.qtdSociosPj,
      socioEstrangeiro: e.socioEstrangeiro, estabelecimentos: e.estabelecimentos,
      ufs: e.ufsAtuacao, situacao: e.situacaoCadastral,
    }));
    const destino = path.join(HISTORICO, `quimicos-${MES}.json`);
    fs.writeFileSync(destino, JSON.stringify({ mes: MES, empresas: magro }), 'utf8');
    console.log(`\n  snapshot arquivado: ${path.relative(RAIZ, destino)} (${(fs.statSync(destino).size / 1048576).toFixed(1)} MB)`);
    console.log('  com dois meses arquivados, rode: node ferramentas/eventos-cnpj.mjs');
  }

  /* ---- 10. GRAVAÇÃO --------------------------------------------------------- */
  const subsetores = [...new Set(empresas.map((e) => e.subsetor))].sort();
  const perfis = [...new Set(empresas.map((e) => e.perfil))].sort();

  const cabecalho = `/* =============================================================================
   *  GHT4 · BASE REAL DO SETOR QUÍMICO — GERADO AUTOMATICAMENTE. NÃO EDITAR.
   * -----------------------------------------------------------------------------
   *  Fonte: dados abertos do CNPJ, Receita Federal do Brasil — referência ${MES}.
   *  Gerado por: node ferramentas/importar-cnpj.mjs
   *
   *  ${empresas.length.toLocaleString('pt-BR')} empresas ATIVAS do setor químico, quase todas de CAPITAL FECHADO.
   *  Para efeito de comparação, a base da CVM tem SEIS companhias no mesmo setor,
   *  e nenhuma na faixa consolidável.
   *
   *  O QUE ESTA BASE NÃO TEM — leia antes de filtrar
   *  ----------------------------------------------
   *  receita, crescimento, margemEbitda e funcionarios saem NULOS para TODOS os
   *  registros. O cadastro do CNPJ não publica faturamento, e capital social não
   *  é proxy dele. Qualquer filtro de porte aplicado sobre esta base sozinha vai
   *  devolver lista vazia — e está certo que devolva, porque o dado não existe
   *  aqui. O porte entra na etapa seguinte do pipeline (ver fontes.js).
   *
   *  A ÚNICA AFIRMAÇÃO DE PORTE QUE ESTA BASE SUSTENTA
   *  ------------------------------------------------
   *  \`optanteSimples: true\` implica faturamento ≤ R$ 4,8 mi/ano por definição
   *  legal — está no campo tetoReceitaLegal. Serve para EXCLUIR, nunca para
   *  estimar. Por padrão o importador já cortou os optantes.
   *
   *  SINAIS
   *  ------
   *  sucessaoProvavel ..... todos os sócios PF acima de 60, nenhum abaixo de 50,
   *                         empresa com ${IDADE_SUCESSAO}+ anos. ${comSucessao.toLocaleString('pt-BR')} empresas.
   *  expansaoGeografica ... estabelecimentos ativos em mais de uma UF.
   *  mudancaControle ...... NULO. Exige comparar dois meses do cadastro.
   *  rodadaRecente ........ NULO. Idem, via delta de capital social.
   *  mercadoFragmentado ... contagem de empresas no subsetor (≥ 200). Não é HHI:
   *                         HHI precisa de receita, e não há receita aqui.
   *
   *  LGPD: nomes de sócios ${INCLUIR_NOME_SOCIOS ? 'INCLUÍDOS (INCLUIR_NOME_SOCIOS = true)' : 'omitidos por padrão — só a estrutura'}.
   *
   *  Para atualizar:  node ferramentas/importar-cnpj.mjs
   * ========================================================================== */

  `;

  /* ---------------------------------------------------------------------------
   *  FORMATO COLUNAR, e a razão é prática: 38 mil objetos JSON repetem o nome de
   *  cada campo 38 mil vezes. Só os nomes de campo passavam de 20 MB — mais do
   *  que os dados. Aqui vai uma lista de colunas e uma matriz de valores, e o
   *  próprio arquivo se re-hidrata ao carregar. O index.html não muda nada:
   *  continua recebendo window.EMPRESAS_QUIMICOS como array de objetos.
   *
   *  Os campos derivados (oQueFazem, descricao) e os constantes (setor, origem,
   *  fonteBase, confianca, dataAtualizacao) não viajam no arquivo: são montados
   *  na re-hidratação. Guardar 38 mil cópias da palavra "Químicos" é desperdício.
   * ------------------------------------------------------------------------ */
  const colunas = Object.keys(empresas[0] || {});
  const matriz = empresas.map((e) => colunas.map((c) => (e[c] === undefined ? null : e[c])));

  const corpo = `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\n`
    + 'const LINHAS_QUIMICOS = [\n'
    + matriz.map((l) => JSON.stringify(l)).join(',\n')
    + '\n];\n\n'
    + `const REFERENCIA_QUIMICOS = ${JSON.stringify(MES)};\n\n`
    + 'const EMPRESAS_QUIMICOS = LINHAS_QUIMICOS.map(function (linha) {\n'
    + '  var e = {};\n'
    + '  for (var i = 0; i < COLUNAS_QUIMICOS.length; i++) e[COLUNAS_QUIMICOS[i]] = linha[i];\n'
    + '  e.setor = \'Químicos\';\n'
    + '  e.fonteBase = \'cnpj\';\n'
    + '  e.origem = \'Cadastro público\';\n'
    + '  e.confianca = \'Alta\';\n'
    + '  e.dataAtualizacao = REFERENCIA_QUIMICOS + \'-01\';\n'
    + '  e.oQueFazem = \'Empresa ativa no cadastro da Receita Federal, CNAE principal \' + e.cnaePrincipal\n'
    + '    + (e.enquadramentoPorSecundario ? \' (o enquadramento no escopo veio de CNAE secundário)\' : \'\')\n'
    + '    + \', \' + e.estabelecimentos + \' estabelecimento(s) em \' + e.ufsAtuacao.length + \' UF(s).\';\n'
    + '  e.descricao = e.razaoSocial + \' — \' + e.subsetor + \'. Cadastro ativo há \'\n'
    + '    + (e.idadeAnos === null ? \'?\' : e.idadeAnos) + \' anos, \' + e.qtdSocios + \' sócio(s) no quadro\'\n'
    + '    + (e.sucessaoProvavel ? \', todos acima de 60 anos e nenhum abaixo de 50: sucessão sem sucessor no quadro.\' : \'.\');\n'
    + '  return e;\n'
    + '});\n\n'
    + `const PERFIS_QUIMICOS = ${JSON.stringify(perfis)};\n`
    + `const SUBSETORES_QUIMICOS = ${JSON.stringify(subsetores)};\n\n`
    + 'window.EMPRESAS_QUIMICOS = EMPRESAS_QUIMICOS;\n'
    + 'window.PERFIS_QUIMICOS = PERFIS_QUIMICOS;\n'
    + 'window.SUBSETORES_QUIMICOS = SUBSETORES_QUIMICOS;\n'
    + 'window.REFERENCIA_QUIMICOS = REFERENCIA_QUIMICOS;\n';

  fs.writeFileSync(SAIDA, cabecalho + corpo, 'utf8');
  console.log(`\n  gravado: ${path.relative(RAIZ, SAIDA)} (${(fs.statSync(SAIDA).size / 1048576).toFixed(1)} MB)\n`);

}

/* O encerramento é explícito porque process.exit() com conexões HTTP ainda
   abertas dispara uma assertion do libuv no Windows (UV_HANDLE_CLOSING): o
   script imprime tudo certo e devolve código 127. Destruir o pool e deixar o
   laço de eventos esvaziar sozinho é o encerramento correto. */
try {
  await principal();
} catch (erro) {
  console.error(`\n  ERRO: ${erro.message}\n`);
  process.exitCode = 1;
} finally {
  await encerrar();
}
