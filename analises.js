/* =============================================================================
 *  GHT4 · ANÁLISES COMPLEMENTARES  (Módulo 5)
 * -----------------------------------------------------------------------------
 *  5.1 Valuation (Capital IQ) · 5.2 Report de mercado · 5.3 News run
 *
 *  Os três estão juntos porque o documento os agrupa (seção 6) e porque
 *  compartilham a mesma condição: DEPENDEM DE MATERIAL QUE VEM DE FORA. Nenhum
 *  deles pode ser calculado da DFP da CVM.
 *
 *  A pergunta de projeto foi como entregar isso sem inventar dado. A resposta é
 *  a mesma nos três casos: a ferramenta constrói a ESTRUTURA da análise, mostra
 *  qual campo espera qual dado e de qual fonte, preenche o que a base sustenta,
 *  e deixa o resto declarado como pendente em vez de escondido. O sócio importa
 *  a exportação do Capital IQ ou cola o material, e a análise se completa.
 *
 *  POR QUE NÃO GERAR O TEXTO DA ANÁLISE
 *  Um report com Porter, SWOT e PESTLE é texto interpretativo, e texto
 *  interpretativo sem fonte é a forma mais convincente de erro que uma
 *  ferramenta de IA pode produzir — soa igual ao certo. O que esta camada faz é
 *  montar o esqueleto com os INDICADORES que sustentam cada seção, marcando o
 *  que ainda precisa de leitura humana ou da camada de linguagem natural.
 * ========================================================================== */

/* ---- ARMAZENAMENTO COMPARTILHADO ------------------------------------------ */
const CHAVE_ANALISES = 'ght4.analises.v1';
let analisesEmMemoria = null;

function lerAnalises() {
  if (analisesEmMemoria) return analisesEmMemoria;
  try {
    const cru = window.localStorage.getItem(CHAVE_ANALISES);
    analisesEmMemoria = cru ? JSON.parse(cru) : { valuation: {}, noticias: [] };
  } catch {
    analisesEmMemoria = { valuation: {}, noticias: [] };
  }
  if (!analisesEmMemoria.valuation) analisesEmMemoria.valuation = {};
  if (!analisesEmMemoria.noticias) analisesEmMemoria.noticias = [];
  return analisesEmMemoria;
}

function gravarAnalises(dados) {
  analisesEmMemoria = dados;
  try {
    window.localStorage.setItem(CHAVE_ANALISES, JSON.stringify(dados));
    return true;
  } catch {
    return false;
  }
}

function agoraIso() { return new Date().toISOString(); }

/* =============================================================================
 *  5.1 · VALUATION
 * -----------------------------------------------------------------------------
 *  Ficou decidido que o acesso ao Capital IQ é login web, sem API. Logo: nada de
 *  raspagem — a plataforma é exportada pelo usuário e o arquivo é ingerido aqui.
 *  Isso não é uma limitação técnica contornável; raspar plataforma paga viola o
 *  contrato de assinatura, e o custo desse risco é da GHT4, não do software.
 *
 *  A ingestão aceita CSV colado ou arquivo. O separador é detectado, porque
 *  exportação em português usa ponto-e-vírgula e a mesma tela recebe as duas
 *  formas sem o usuário precisar saber disso.
 * ========================================================================== */

/* Colunas que a análise precisa, com os sinônimos que aparecem nas exportações.
   A detecção é por normalização e contenção: "EV/EBITDA", "ev ebitda" e
   "TEV/EBITDA" são a mesma coluna. */
const COLUNAS_COMPS = [
  { chave: 'empresa', rotulo: 'Empresa', sinonimos: ['empresa', 'company', 'nome', 'company name'], obrigatoria: true },
  { chave: 'receita', rotulo: 'Receita', sinonimos: ['receita', 'revenue', 'total revenue', 'faturamento'] },
  { chave: 'ebitda', rotulo: 'EBITDA', sinonimos: ['ebitda'] },
  { chave: 'valorMercado', rotulo: 'Valor de mercado', sinonimos: ['market cap', 'valor de mercado', 'capitalizacao'] },
  { chave: 'dividaLiquida', rotulo: 'Dívida líquida', sinonimos: ['net debt', 'divida liquida'] },
  { chave: 'ev', rotulo: 'EV', sinonimos: ['ev', 'tev', 'enterprise value', 'valor da firma'] },
  { chave: 'evReceita', rotulo: 'EV/Receita', sinonimos: ['ev/receita', 'ev revenue', 'tev revenue', 'ev/sales'] },
  { chave: 'evEbitda', rotulo: 'EV/EBITDA', sinonimos: ['ev/ebitda', 'ev ebitda', 'tev ebitda'] },
];

const COLUNAS_PRECEDENTES = [
  { chave: 'data', rotulo: 'Data', sinonimos: ['data', 'date', 'announced', 'data do anuncio'], obrigatoria: true },
  { chave: 'alvo', rotulo: 'Alvo', sinonimos: ['alvo', 'target', 'empresa alvo'], obrigatoria: true },
  { chave: 'adquirente', rotulo: 'Adquirente', sinonimos: ['adquirente', 'acquirer', 'buyer', 'comprador'] },
  { chave: 'valor', rotulo: 'Valor da transação', sinonimos: ['valor', 'deal value', 'transaction value', 'valor da transacao'] },
  { chave: 'participacao', rotulo: '% adquirido', sinonimos: ['%', 'stake', 'participacao', 'percentual'] },
  { chave: 'evReceita', rotulo: 'EV/Receita', sinonimos: ['ev/receita', 'ev revenue', 'tev revenue'] },
  { chave: 'evEbitda', rotulo: 'EV/EBITDA', sinonimos: ['ev/ebitda', 'ev ebitda', 'tev ebitda'] },
];

function _normalizarCabecalho(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    /* A barra vira espaço: "TEV/EBITDA" e "TEV EBITDA" são o mesmo cabeçalho,
       e os sinônimos passam pela mesma normalização em _mapearColunas. */
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Detecta o separador pela contagem no cabeçalho — ponto-e-vírgula em PT-BR. */
function _separador(linha) {
  const candidatos = [';', '\t', ','];
  let melhor = ',';
  let maior = 0;
  for (const c of candidatos) {
    const n = linha.split(c).length;
    if (n > maior) { maior = n; melhor = c; }
  }
  return melhor;
}

/** Converte "1.234,56" (PT-BR), "1,234.56" (EN) e "12,3x" em número. */
function _numero(bruto) {
  if (bruto === null || bruto === undefined) return null;
  let texto = String(bruto).trim().replace(/[x×%\s]/gi, '').replace(/R\$/gi, '');
  if (!texto || texto === '-' || texto === '—' || texto.toUpperCase() === 'NA' || texto.toUpperCase() === 'NM') return null;

  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');
  if (temVirgula && temPonto) {
    /* O separador decimal é o que aparece por último. */
    texto = texto.lastIndexOf(',') > texto.lastIndexOf('.')
      ? texto.replace(/\./g, '').replace(',', '.')
      : texto.replace(/,/g, '');
  } else if (temVirgula) {
    /* Só vírgula: decimal em PT-BR, a menos que separe milhar (1,234). */
    texto = /,\d{3}\b/.test(texto) ? texto.replace(/,/g, '') : texto.replace(',', '.');
  }

  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

function _linhasCsv(texto) {
  return String(texto).split(/\r?\n/).filter((l) => l.trim().length > 0);
}

/**
 * Divide uma linha de CSV respeitando aspas.
 *
 * `split(sep)` puro não serve, e o motivo apareceu no primeiro teste com
 * exportação em inglês: `Alpha Corp,"1,200.50",300.00` virava três campos
 * errados, porque a vírgula do separador de milhar está DENTRO das aspas.
 * O valor 1.200,50 era lido como 1. Um erro desses não aparece na tela — ele
 * aparece na proposta, num múltiplo calculado sobre a receita errada.
 *
 * Aspas duplas dobradas ("") são o escape do formato e viram uma aspa literal.
 */
function _dividirLinha(linha, separador) {
  const campos = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else dentroDeAspas = !dentroDeAspas;
    } else if (c === separador && !dentroDeAspas) {
      campos.push(atual.trim());
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual.trim());
  return campos;
}

/**
 * Escolhe, para cada coluna esperada, o cabeçalho que melhor a representa.
 *
 * Contenção simples de substring não serve — e isto também veio de um teste
 * real: o sinônimo "ev" casava com o cabeçalho "TEV/EBITDA", então a coluna de
 * EV apontava para o múltiplo, e o EV/Receita derivado saía três ordens de
 * grandeza abaixo. Duas regras resolvem:
 *
 *   1. pontuação por especificidade — sinônimo mais longo e casamento exato
 *      valem mais, então "ev/ebitda" ganha de "ev" no mesmo cabeçalho;
 *   2. atribuição exclusiva — um cabeçalho só serve a uma coluna, e a disputa é
 *      resolvida pela maior pontuação.
 */
function _mapearColunas(cabecalhos, definicaoColunas) {
  const candidatos = [];

  for (const coluna of definicaoColunas) {
    cabecalhos.forEach((cabecalho, indice) => {
      if (!cabecalho) return;
      let melhor = 0;
      for (const sinonimoCru of coluna.sinonimos) {
        const sinonimo = _normalizarCabecalho(sinonimoCru);
        if (cabecalho === sinonimo) melhor = Math.max(melhor, 1000 + sinonimo.length);
        /* Limite de palavra: "ev" casa com "ev ebitda", nunca com "revenue". */
        else if (new RegExp(`(^|[^a-z0-9])${sinonimo}([^a-z0-9]|$)`).test(cabecalho)) {
          melhor = Math.max(melhor, 100 + sinonimo.length);
        }
      }
      if (melhor > 0) candidatos.push({ coluna: coluna.chave, indice, pontos: melhor });
    });
  }

  candidatos.sort((a, b) => b.pontos - a.pontos);

  const mapa = {};
  const usados = {};
  for (const c of candidatos) {
    if (mapa[c.coluna] !== undefined || usados[c.indice]) continue;
    mapa[c.coluna] = c.indice;
    usados[c.indice] = true;
  }
  return mapa;
}

/**
 * Interpreta uma exportação em CSV. Devolve as linhas mapeadas, quais colunas
 * foram reconhecidas e quais faltaram — e o relatório de reconhecimento é tão
 * importante quanto os dados: sem ele, uma coluna não mapeada vira silenciosamente
 * uma análise incompleta que parece completa.
 */
function interpretarCsv(texto, definicaoColunas) {
  const linhas = _linhasCsv(texto);
  if (linhas.length < 2) throw new Error('O material precisa ter cabeçalho e ao menos uma linha.');

  const sep = _separador(linhas[0]);
  const cabecalhos = _dividirLinha(linhas[0], sep).map(_normalizarCabecalho);

  const mapa = _mapearColunas(cabecalhos, definicaoColunas);
  const reconhecidas = definicaoColunas
    .filter((c) => mapa[c.chave] !== undefined)
    .map((c) => c.rotulo);

  const faltando = definicaoColunas.filter((c) => mapa[c.chave] === undefined);
  const obrigatoriaAusente = faltando.find((c) => c.obrigatoria);
  if (obrigatoriaAusente) {
    throw new Error(`Coluna obrigatória não encontrada: ${obrigatoriaAusente.rotulo}. `
      + `Cabeçalhos lidos: ${cabecalhos.filter(Boolean).join(', ')}`);
  }

  const registros = [];
  for (let i = 1; i < linhas.length; i++) {
    const celulas = _dividirLinha(linhas[i], sep);
    const registro = {};
    for (const coluna of definicaoColunas) {
      const indice = mapa[coluna.chave];
      if (indice === undefined) { registro[coluna.chave] = null; continue; }
      const bruto = celulas[indice];
      registro[coluna.chave] = coluna.chave === 'empresa' || coluna.chave === 'alvo'
        || coluna.chave === 'adquirente' || coluna.chave === 'data'
        ? (bruto || null)
        : _numero(bruto);
    }
    if (registro.empresa || registro.alvo) registros.push(registro);
  }

  return {
    registros,
    colunasReconhecidas: reconhecidas,
    colunasAusentes: faltando.map((c) => c.rotulo),
    separador: sep === '\t' ? 'tabulação' : sep,
  };
}

/**
 * Deriva o que dá para derivar e devolve as estatísticas da amostra.
 * Mediana, não média: uma transação atípica distorce a média de uma amostra de
 * cinco comparáveis, e amostra de cinco é o tamanho normal aqui.
 */
function consolidarMultiplos(registros) {
  const derivados = registros.map((r) => {
    const copia = { ...r };
    if (copia.ev === null && copia.valorMercado !== null && copia.dividaLiquida !== null) {
      copia.ev = copia.valorMercado + copia.dividaLiquida;
      copia.evDerivado = true;
    }
    if (copia.evEbitda === null && copia.ev !== null && copia.ebitda) {
      copia.evEbitda = Number((copia.ev / copia.ebitda).toFixed(2));
      copia.evEbitdaDerivado = true;
    }
    if (copia.evReceita === null && copia.ev !== null && copia.receita) {
      copia.evReceita = Number((copia.ev / copia.receita).toFixed(2));
      copia.evReceitaDerivado = true;
    }
    return copia;
  });

  const estatisticas = {};
  for (const campo of ['evEbitda', 'evReceita']) {
    const valores = derivados.map((r) => r[campo]).filter((v) => v !== null && Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    estatisticas[campo] = valores.length ? {
      n: valores.length,
      minimo: valores[0],
      mediana: valores.length % 2
        ? valores[(valores.length - 1) / 2]
        : Number(((valores[valores.length / 2 - 1] + valores[valores.length / 2]) / 2).toFixed(2)),
      maximo: valores[valores.length - 1],
      /* Quartis dão a faixa que se leva ao cliente; o intervalo cheio inclui o
         outlier que ninguém usaria numa proposta. */
      q1: valores[Math.floor(valores.length * 0.25)],
      q3: valores[Math.floor(valores.length * 0.75)],
    } : null;
  }

  return { registros: derivados, estatisticas };
}

/**
 * Aplica os múltiplos a uma empresa da base — a ponte entre o Capital IQ e a
 * DFP. Só usa EBITDA e receita reais da CVM; o múltiplo vem de fora.
 */
function aplicarA(empresa, estatisticas) {
  const ebitda = empresa.receita !== null && empresa.margemEbitda !== null && empresa.margemEbitda !== undefined
    ? empresa.receita * (empresa.margemEbitda / 100)
    : null;

  const faixas = [];
  if (estatisticas.evEbitda && ebitda !== null && ebitda > 0) {
    faixas.push({
      base: 'EV/EBITDA',
      referencia: `EBITDA de R$ ${Math.round(ebitda).toLocaleString('pt-BR')} mi (CVM · 3.05 + 7.04.01)`,
      minimo: Math.round(ebitda * estatisticas.evEbitda.q1),
      central: Math.round(ebitda * estatisticas.evEbitda.mediana),
      maximo: Math.round(ebitda * estatisticas.evEbitda.q3),
      multiplos: estatisticas.evEbitda,
    });
  }
  if (estatisticas.evReceita && empresa.receita) {
    faixas.push({
      base: 'EV/Receita',
      referencia: `Receita de R$ ${empresa.receita.toLocaleString('pt-BR')} mi (CVM · 3.01)`,
      minimo: Math.round(empresa.receita * estatisticas.evReceita.q1),
      central: Math.round(empresa.receita * estatisticas.evReceita.mediana),
      maximo: Math.round(empresa.receita * estatisticas.evReceita.q3),
      multiplos: estatisticas.evReceita,
    });
  }

  return {
    empresa: empresa.nome,
    ebitdaEstimado: ebitda === null ? null : Math.round(ebitda),
    faixas,
    /* EV, não equity value. A diferença é a dívida líquida, e confundir as duas
       é o erro que mais aparece em valuation feito às pressas. */
    ressalva: 'As faixas são de valor da firma (EV). Para chegar a equity value, subtraia a dívida líquida.',
  };
}

/* ---- revisão humana (human-in-the-loop, seção 6.1) -------------------------
 * "devemos poder revisar a análise de valuation, julgá-la correta ou incorreta,
 *  e fazer recomendações/alterações para ajustá-la".
 *
 * O parecer NÃO sobrescreve o cálculo: fica ao lado, com autor e data, e a
 * exportação carrega os dois. Mesma decisão do lastro e das ressalvas — o
 * julgamento humano é registrado, não fundido ao número.
 * -------------------------------------------------------------------------- */
function salvarValuation(empresaId, { comps, precedentes, parecer }) {
  const dados = lerAnalises();
  const anterior = dados.valuation[empresaId] || { revisoes: [] };

  dados.valuation[empresaId] = {
    empresaId,
    comps: comps !== undefined ? comps : anterior.comps || null,
    precedentes: precedentes !== undefined ? precedentes : anterior.precedentes || null,
    atualizadoEm: agoraIso(),
    revisoes: parecer
      ? [...(anterior.revisoes || []), { ...parecer, quando: agoraIso() }]
      : anterior.revisoes || [],
  };

  return { registro: dados.valuation[empresaId], persistiu: gravarAnalises(dados) };
}

function valuationDe(empresaId) {
  return lerAnalises().valuation[empresaId] || null;
}

function removerValuation(empresaId) {
  const dados = lerAnalises();
  delete dados.valuation[empresaId];
  return gravarAnalises(dados);
}

/* =============================================================================
 *  5.2 · REPORT DE MERCADO
 * -----------------------------------------------------------------------------
 *  O documento pede qualidade de consultoria estratégica: trends, TAM/SAM/SOM,
 *  players, 5 Forças, SWOT e PESTLE. Cada seção abaixo declara o que a base
 *  SUSTENTA e o que exige leitura humana ou a camada de linguagem natural.
 *
 *  TAM/SAM/SOM merece um aviso próprio. O que a base permite calcular é a soma
 *  da receita das companhias ABERTAS do setor — que é um PISO do TAM, não o TAM.
 *  Chamar isso de TAM seria o erro mais grave possível neste report, porque o
 *  número parece autoritativo e subestima o mercado por construção.
 * ========================================================================== */

function montarReport(avaliadas, setor) {
  const doSetor = setor ? avaliadas.filter((e) => e.setor === setor) : avaliadas;
  const mercado = window.MERCADO;
  const mapa = mercado ? mercado.mapear(doSetor) : { subsegmentos: [] };

  const receitaSomada = doSetor
    .map((e) => e.receita)
    .filter((v) => v !== null && v !== undefined)
    .reduce((a, b) => a + b, 0);

  const porReceita = [...doSetor].sort((a, b) => (b.receita || 0) - (a.receita || 0));
  const lideres = porReceita.slice(0, 5);
  const concentracaoTop5 = receitaSomada > 0
    ? Math.round((lideres.reduce((a, e) => a + (e.receita || 0), 0) / receitaSomada) * 100)
    : null;

  const hhi = mercado ? mercado.hhi(doSetor) : null;
  const mediana = (campo) => mercado
    ? mercado.mediana(doSetor.map((e) => e[campo]).filter((v) => v !== null && v !== undefined))
    : null;

  return {
    setor: setor || 'Todos os setores',
    geradoEm: agoraIso(),
    universo: {
      empresas: doSetor.length,
      subsegmentos: mapa.subsegmentos.length,
      receitaSomada: Math.round(receitaSomada),
      crescimentoMediano: mediana('crescimento'),
      margemMediana: mediana('margemEbitda'),
      hhi,
      concentracaoTop5,
    },

    dimensionamento: {
      titulo: 'TAM · SAM · SOM',
      tam: {
        valor: Math.round(receitaSomada),
        rotulo: 'PISO do TAM — soma da receita das companhias abertas do setor',
        sustentado: true,
        aviso: 'Não é o TAM. Companhias fechadas, que são a maioria do mercado, não publicam demonstração e estão fora desta soma.',
        fonte: 'CVM · conta 3.01, exercício corrente',
      },
      sam: {
        valor: null,
        rotulo: 'SAM — mercado endereçável pela GHT4',
        sustentado: false,
        oQueFalta: 'Depende do recorte de atuação da casa: geografia, faixa de porte e subsegmentos que a GHT4 atende. É decisão de negócio, não cálculo.',
        fonte: 'A definir com os sócios.',
      },
      som: {
        valor: null,
        rotulo: 'SOM — participação obtenível',
        sustentado: false,
        oQueFalta: 'Depende de capacidade de execução do time e taxa de conversão histórica — dados que vivem no CRM (Módulo 7), depois de alguns trimestres de uso.',
        fonte: 'Pipeline da própria GHT4, acumulado.',
      },
    },

    players: {
      titulo: 'Players principais e consolidadores',
      sustentado: true,
      lideres: lideres.map((e) => ({
        nome: e.nome,
        receita: e.receita,
        participacao: receitaSomada > 0 ? Number((((e.receita || 0) / receitaSomada) * 100).toFixed(1)) : null,
        classificacao: e.classificacao,
        subsetor: e.subsetor,
      })),
      consolidadores: doSetor.filter((e) => e.classificacao === 'comprador').length,
      aviso: 'Ranking entre companhias abertas. Um líder de capital fechado não aparece aqui.',
    },

    /* As 5 Forças com os indicadores que a base sustenta em cada uma. O texto
       analítico é o que falta — e está marcado como falta, força a força. */
    porter: [
      {
        forca: 'Rivalidade entre concorrentes',
        indicador: hhi === null ? null : `HHI ${hhi} · ${mercado ? mercado.classificarHhi(hhi).rotulo : ''}`,
        leitura: hhi === null ? null
          : hhi < 1500 ? 'Mercado pulverizado: rivalidade tende a ser alta e a consolidação é tese natural.'
          : hhi > 2500 ? 'Mercado concentrado: poucos players definem o jogo.'
          : 'Concentração moderada.',
        sustentado: hhi !== null,
        fonte: 'Herfindahl-Hirschman sobre a receita (conta 3.01)',
      },
      {
        forca: 'Ameaça de novos entrantes',
        indicador: (() => {
          const intensidade = mediana('intensidadeInvestimento');
          return intensidade === null ? null : `Investimento mediano de ${intensidade.toFixed(1)}% da receita`;
        })(),
        leitura: 'Intensidade de capital alta é barreira de entrada. Barreira regulatória e de licença NÃO está medida aqui.',
        sustentado: true,
        fonte: 'CVM · conta 6.02 ÷ receita',
        oQueFalta: 'Barreiras regulatórias, licenças e patentes exigem leitura setorial.',
      },
      {
        forca: 'Poder de barganha dos clientes',
        indicador: null,
        leitura: null,
        sustentado: false,
        oQueFalta: 'Depende de concentração de clientes, que a DFP não abre. É um dos quatro critérios que a ferramenta já declara sem fonte.',
        fonte: 'Diligência ou entrevista com a companhia.',
      },
      {
        forca: 'Poder de barganha dos fornecedores',
        indicador: null,
        leitura: null,
        sustentado: false,
        oQueFalta: 'Exige composição de custos por fornecedor, ausente da demonstração padronizada.',
        fonte: 'Diligência ou reports setoriais.',
      },
      {
        forca: 'Ameaça de substitutos',
        indicador: null,
        leitura: null,
        sustentado: false,
        oQueFalta: 'É julgamento setorial e tecnológico — não há indicador contábil que o responda.',
        fonte: 'Reports setoriais (EMIS) e imprensa especializada.',
      },
    ],

    swot: {
      titulo: 'SWOT',
      sustentadoParcialmente: true,
      forcas: [
        mediana('margemEbitda') !== null && `Margem EBITDA mediana do setor: ${mediana('margemEbitda').toFixed(1)}%`,
        mediana('conversaoCaixa') !== null && `Conversão de caixa mediana: ${mediana('conversaoCaixa').toFixed(0)}% do EBITDA`,
      ].filter(Boolean),
      fraquezas: [
        mediana('alavancagem') !== null && `Alavancagem mediana: ${mediana('alavancagem').toFixed(2)}× dívida líquida/EBITDA`,
        mediana('crescimento') !== null && mediana('crescimento') < 5 && `Crescimento mediano baixo: ${mediana('crescimento').toFixed(1)}%`,
      ].filter(Boolean),
      oportunidades: [],
      ameacas: [],
      oQueFalta: 'Oportunidades e ameaças são interpretação de contexto — regulação, tecnologia, ciclo macro. A base contábil não as contém; exigem a camada de análise (5.2 completo) ou redação humana.',
    },

    pestle: ['Político', 'Econômico', 'Social', 'Tecnológico', 'Legal', 'Ambiental'].map((dimensao) => ({
      dimensao,
      sustentado: false,
      oQueFalta: 'Nenhuma dimensão do PESTLE é derivável de demonstração financeira. Exige reports setoriais, acompanhamento regulatório e imprensa.',
      fonte: 'EMIS, associações setoriais, imprensa especializada.',
    })),

    trends: {
      titulo: 'Tendências',
      sustentado: false,
      oQueFalta: 'Tendência é leitura de texto — reports, notícias, regulação. O que a base dá é a direção agregada dos números, não a explicação dela.',
      indicadorDisponivel: mediana('crescimento') === null ? null
        : `Crescimento mediano do setor: ${mediana('crescimento').toFixed(1)}% no exercício`,
      fonte: 'Módulo 5.3 (news run) e EMIS.',
    },
  };
}

/* =============================================================================
 *  5.3 · NEWS RUN
 * -----------------------------------------------------------------------------
 *  "Levantamento de notícias sobre um mercado ou empresa específica dos últimos
 *   X anos (período configurável)."
 *
 *  A ferramenta não tem acesso à internet: é um site estático, e o protótipo
 *  roda offline por decisão de projeto. O que existe aqui é o DESTINO das
 *  notícias — registro estruturado com veículo, data e link, filtrável por
 *  período e vinculado a empresa ou setor, que alimenta a camada de evidência.
 *
 *  Isso não é um substituto do news run automatizado; é a metade que não depende
 *  de infraestrutura. A outra metade (a coleta) precisa de um backend com acesso
 *  a uma fonte licenciada, e está declarada como tal.
 * ========================================================================== */

function registrarNoticia({ empresaId, setor, titulo, veiculo, data, link, resumo, relevancia }) {
  const dados = lerAnalises();
  const noticia = {
    id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    empresaId: empresaId || null,
    setor: setor || null,
    titulo: titulo || 'Sem título',
    veiculo: veiculo || 'Não informado',
    data: data || agoraIso().slice(0, 10),
    link: link || null,
    resumo: resumo || '',
    relevancia: relevancia || 'media',
    registradaEm: agoraIso(),
  };
  dados.noticias.push(noticia);
  return { noticia, persistiu: gravarAnalises(dados) };
}

function removerNoticia(id) {
  const dados = lerAnalises();
  dados.noticias = dados.noticias.filter((n) => n.id !== id);
  return gravarAnalises(dados);
}

/**
 * News run: notícias de uma empresa ou setor num período.
 * `anos` é o "X anos configurável" do documento.
 */
function newsRun({ empresaId, setor, anos } = {}) {
  const dados = lerAnalises();
  const limite = anos ? new Date(Date.now() - anos * 365.25 * 86400000).toISOString().slice(0, 10) : null;

  const filtradas = dados.noticias
    .filter((n) => (!empresaId || n.empresaId === empresaId))
    .filter((n) => (!setor || n.setor === setor))
    .filter((n) => (!limite || n.data >= limite))
    .sort((a, b) => b.data.localeCompare(a.data));

  const porAno = {};
  for (const n of filtradas) {
    const ano = n.data.slice(0, 4);
    porAno[ano] = (porAno[ano] || 0) + 1;
  }

  return {
    periodo: anos ? `últimos ${anos} ano${anos === 1 ? '' : 's'}` : 'todo o histórico registrado',
    total: filtradas.length,
    noticias: filtradas,
    porAno: Object.keys(porAno).sort().reverse().map((ano) => ({ ano, quantidade: porAno[ano] })),
    veiculos: [...new Set(filtradas.map((n) => n.veiculo))],
    limitacao: LIMITACOES_ANALISES.find((l) => l.modulo === '5.3'),
  };
}

/** Importa várias notícias de uma vez, em CSV (título, veículo, data, link). */
function importarNoticias(texto, { empresaId, setor } = {}) {
  const linhas = _linhasCsv(texto);
  if (linhas.length < 2) throw new Error('Cole ao menos o cabeçalho e uma notícia.');
  const sep = _separador(linhas[0]);
  const cabecalhos = linhas[0].split(sep).map(_normalizarCabecalho);

  const indice = (nomes) => cabecalhos.findIndex((c) => nomes.some((n) => c.includes(n)));
  const iTitulo = indice(['titulo', 'title', 'manchete']);
  const iVeiculo = indice(['veiculo', 'fonte', 'source']);
  const iData = indice(['data', 'date']);
  const iLink = indice(['link', 'url']);
  const iResumo = indice(['resumo', 'summary', 'descricao']);

  if (iTitulo === -1) throw new Error(`Coluna de título não encontrada. Cabeçalhos: ${cabecalhos.join(', ')}`);

  let quantidade = 0;
  for (let i = 1; i < linhas.length; i++) {
    const c = _dividirLinha(linhas[i], sep);
    registrarNoticia({
      empresaId, setor,
      titulo: c[iTitulo],
      veiculo: iVeiculo === -1 ? null : c[iVeiculo],
      data: iData === -1 ? null : c[iData],
      link: iLink === -1 ? null : c[iLink],
      resumo: iResumo === -1 ? null : c[iResumo],
    });
    quantidade++;
  }
  return { quantidade, persistiu: true };
}

/* =============================================================================
 *  LIMITAÇÕES DECLARADAS
 * ========================================================================== */
const LIMITACOES_ANALISES = [
  {
    modulo: '5.1',
    titulo: 'Múltiplos vêm de fora, sempre',
    texto: 'A DFP dá receita e EBITDA, nunca valor de firma. Sem preço de transação ou capitalização de mercado não existe múltiplo — e a ferramenta não inventa nenhum. O que ela faz é ingerir a exportação do Capital IQ e aplicar os múltiplos aos números auditados da CVM.',
    viaDeObtencao: 'Exportação do Capital IQ (trading comps e transações precedentes). Acesso é login web, sem API: sem raspagem, por decisão de escopo.',
  },
  {
    modulo: '5.2',
    titulo: 'O report monta a estrutura, não escreve a análise',
    texto: 'Porter, SWOT e PESTLE são texto interpretativo. Gerá-lo sem fonte produziria o erro mais convincente que uma ferramenta de IA pode cometer — texto que soa igual ao certo. Cada seção traz os indicadores que a sustentam e declara, explicitamente, o que ainda depende de leitura humana.',
    viaDeObtencao: 'Camada de linguagem natural + EMIS e reports setoriais.',
  },
  {
    modulo: '5.2',
    titulo: 'O que a base chama de TAM é um piso',
    texto: 'A soma da receita das companhias abertas do setor não é o TAM: a maioria do mercado é de capital fechado e não publica demonstração. O número aparece rotulado como PISO, e SAM e SOM ficam em branco porque dependem de decisão de negócio e de histórico do próprio pipeline.',
    viaDeObtencao: 'Recorte de atuação definido pelos sócios + CRM acumulado (Módulo 7).',
  },
  {
    modulo: '5.3',
    titulo: 'A coleta de notícias precisa de backend',
    texto: 'A ferramenta é um site estático e o protótipo roda offline. O que existe aqui é o destino estruturado das notícias — veículo, data, link, período configurável — e não o robô que as busca. A coleta exige servidor e uma fonte licenciada.',
    viaDeObtencao: 'EMIS (news) ou agregador licenciado, com um serviço para consultá-lo.',
  },
];

window.ANALISES = {
  COLUNAS_COMPS, COLUNAS_PRECEDENTES, LIMITACOES: LIMITACOES_ANALISES,
  interpretarCsv, consolidarMultiplos, aplicarA,
  salvarValuation, valuationDe, removerValuation,
  montarReport,
  registrarNoticia, removerNoticia, newsRun, importarNoticias,
};
