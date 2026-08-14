/* =============================================================================
 *  GHT4 · MAPEAMENTO E RANKING DE SUBSEGMENTOS  (Módulos 1 e 2)
 * -----------------------------------------------------------------------------
 *  Módulo 1 — dado um setor, devolver seus subsegmentos e as empresas de cada.
 *  Módulo 2 — ranquear esses subsegmentos por atratividade para M&A.
 *
 *  O QUE A BASE ABERTA SUSTENTA E O QUE NÃO SUSTENTA
 *  O documento lista quatro critérios para o ranking de subsegmentos (seção 3):
 *  interesse de compradores, volume de transações recentes, tendências do
 *  subsegmento e múltiplos de valuation praticados. Nenhum dos quatro existe em
 *  dado público brasileiro. Três das alternativas seriam ruins:
 *
 *    a) inventar os quatro    — número sem lastro é pior que número ausente;
 *    b) não entregar o módulo — a GHT4 fica sem o mapa que já dá para fazer;
 *    c) entregar e calar      — critério silenciado parece critério atendido.
 *
 *  A saída é a mesma do resto do projeto: calcular o que a DFP sustenta, dizer
 *  qual proxy está no lugar de quê, e DECLARAR os quatro ausentes com o motivo e
 *  a via de obtenção (ver CRITERIOS_SEM_FONTE_MERCADO no fim do arquivo). O
 *  ranking sai com a régua à mostra.
 *
 *  RESSALVA QUE ATRAVESSA O ARQUIVO INTEIRO
 *  Todo número aqui é calculado sobre COMPANHIAS ABERTAS. O universo real de um
 *  subsegmento inclui as fechadas — que são a maioria e são o cliente típico de
 *  uma boutique. Logo: a contagem de empresas é piso, não total, e o índice de
 *  concentração enxerga só a parte listada do mercado. Está declarado em
 *  `ressalvaCobertura` e a interface exibe junto do resultado.
 * ========================================================================== */

/* ---- utilitários numéricos ------------------------------------------------ */

function _numeros(lista, ler) {
  const saida = [];
  for (const item of lista) {
    const v = ler(item);
    if (v !== null && v !== undefined && !Number.isNaN(v)) saida.push(v);
  }
  return saida;
}

function mediana(valores) {
  if (!valores.length) return null;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2;
}

/**
 * Índice Herfindahl-Hirschman sobre a receita — mede concentração.
 * Faixas usuais de antitruste: < 1500 fragmentado · 1500–2500 moderado ·
 * > 2500 concentrado. Para M&A o interesse é o inverso do usual: fragmentado é
 * BOM, porque é onde a tese de consolidação (buy-and-build) existe.
 */
function hhi(empresas) {
  const receitas = _numeros(empresas, (e) => e.receita).filter((r) => r > 0);
  if (receitas.length < 2) return null;
  const total = receitas.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const indice = receitas.reduce((acc, r) => acc + Math.pow((r / total) * 100, 2), 0);
  return Math.round(indice);
}

function classificarHhi(indice) {
  if (indice === null) return { chave: 'indeterminado', rotulo: 'Não calculável' };
  if (indice < 1500) return { chave: 'fragmentado', rotulo: 'Fragmentado' };
  if (indice <= 2500) return { chave: 'moderado', rotulo: 'Moderadamente concentrado' };
  return { chave: 'concentrado', rotulo: 'Concentrado' };
}

/* ---- 1. MÓDULO 1 · MAPEAMENTO --------------------------------------------- */

/** Setores presentes na base, com a contagem de empresas e de subsegmentos. */
function setoresDisponiveis(empresas) {
  const mapa = {};
  for (const e of empresas) {
    const setor = e.setor || 'Não classificado';
    if (!mapa[setor]) mapa[setor] = { setor, empresas: 0, subsegmentos: {} };
    mapa[setor].empresas += 1;
    mapa[setor].subsegmentos[e.subsetor || 'Não classificado'] = true;
  }
  return Object.values(mapa)
    .map((s) => ({ setor: s.setor, empresas: s.empresas, subsegmentos: Object.keys(s.subsegmentos).length }))
    .sort((a, b) => b.empresas - a.empresas);
}

/**
 * Módulo 1: mapa de um setor. Sem `setor`, mapeia a base inteira.
 * Devolve os subsegmentos com a lista completa de empresas de cada um —
 * é sobre esta estrutura que os módulos seguintes operam.
 */
function mapear(empresas, setor) {
  const escopo = setor ? empresas.filter((e) => e.setor === setor) : empresas;
  const mapa = {};

  for (const e of escopo) {
    const chave = e.subsetor || 'Não classificado';
    if (!mapa[chave]) mapa[chave] = { subsegmento: chave, setor: e.setor, empresas: [] };
    mapa[chave].empresas.push(e);
  }

  const subsegmentos = Object.values(mapa)
    .map((s) => ({ ...s, ...metricas(s.empresas) }))
    .sort((a, b) => b.contagem - a.contagem);

  return {
    setor: setor || 'Todos os setores',
    totalEmpresas: escopo.length,
    totalSubsegmentos: subsegmentos.length,
    subsegmentos,
    ressalvaCobertura: ressalvaCobertura(escopo.length),
  };
}

/** Métricas descritivas de um conjunto de empresas. */
function metricas(empresas) {
  const receitas = _numeros(empresas, (e) => e.receita);
  const indiceHhi = hhi(empresas);

  /* Faixa consolidável: o mesmo recorte que o restante do projeto trata como
     alvo típico de boutique (R$ 30–250 mi de receita). */
  const naFaixa = empresas.filter((e) => e.receita >= 30 && e.receita <= 250);

  return {
    contagem: empresas.length,
    receitaTotal: receitas.length ? Math.round(receitas.reduce((a, b) => a + b, 0)) : null,
    receitaMediana: mediana(receitas),
    crescimentoMediano: mediana(_numeros(empresas, (e) => e.crescimento)),
    margemMediana: mediana(_numeros(empresas, (e) => e.margemEbitda)),
    alavancagemMediana: mediana(_numeros(empresas, (e) => e.alavancagem)),
    hhi: indiceHhi,
    concentracao: classificarHhi(indiceHhi),
    alvosNaFaixa: naFaixa.length,
    pctNaFaixa: empresas.length ? Math.round((naFaixa.length / empresas.length) * 100) : 0,
  };
}

/* ---- 2. MÓDULO 2 · RANKING DE SUBSEGMENTOS --------------------------------
 * Cada critério vira uma nota 0–1 comparando os subsegmentos ENTRE SI (min-max
 * dentro do setor consultado). Nota relativa, não absoluta: a pergunta que a
 * originação faz é "onde eu abro conversa primeiro?", que é comparativa por
 * natureza.
 *
 * Os pesos são configuráveis, como manda a seção 3 do documento ("a escala de
 * prioridade/peso entre os critérios deve ser configurável pelo usuário").
 * -------------------------------------------------------------------------- */
const CRITERIOS_SUBSEGMENTO = {
  densidade: {
    rotulo: 'Densidade de empresas',
    explicacao: 'Mais companhias no subsegmento significam mais alvos possíveis e mais chances de mandato.',
    fonte: 'Contagem na base CVM',
    pesoPadrao: 20,
    ler: (s) => s.contagem,
    direcao: 'maior',
  },
  fragmentacao: {
    rotulo: 'Fragmentação (HHI invertido)',
    explicacao: 'Mercado pulverizado sustenta tese de consolidação. HHI baixo pontua alto.',
    fonte: 'Herfindahl-Hirschman sobre receita (conta 3.01)',
    pesoPadrao: 25,
    ler: (s) => s.hhi,
    direcao: 'menor',
  },
  alvosConsolidaveis: {
    rotulo: 'Alvos na faixa consolidável',
    explicacao: 'Quantas empresas estão na faixa de R$ 30–250 mi de receita, o recorte típico de boutique.',
    fonte: 'Derivado da receita (conta 3.01)',
    pesoPadrao: 25,
    ler: (s) => s.alvosNaFaixa,
    direcao: 'maior',
  },
  crescimento: {
    rotulo: 'Crescimento mediano',
    explicacao: 'Subsegmento em expansão atrai comprador estratégico e sustenta múltiplo.',
    fonte: 'Mediana do crescimento de receita, dois exercícios',
    pesoPadrao: 15,
    ler: (s) => s.crescimentoMediano,
    direcao: 'maior',
  },
  rentabilidade: {
    rotulo: 'Margem mediana',
    explicacao: 'Margem saudável no subsegmento indica negócio que se paga — e comprador disposto.',
    fonte: 'Mediana da margem EBITDA (contas 3.05 + 7.04.01)',
    pesoPadrao: 10,
    ler: (s) => s.margemMediana,
    direcao: 'maior',
  },
  consolidadoresPresentes: {
    rotulo: 'Consolidadores presentes',
    explicacao: 'Empresas do próprio subsegmento com porte e caixa para comprar. Proxy interno de "interesse de compradores".',
    fonte: 'Classificação do motor de scoring (papel comprador)',
    pesoPadrao: 5,
    ler: (s) => s.compradores,
    direcao: 'maior',
    proxy: true,
  },
};

/** Normaliza um valor dentro do intervalo observado — devolve 0..1. */
function _normalizar(valor, min, max, direcao) {
  if (valor === null || valor === undefined) return null;
  if (max === min) return 0.5;
  const bruto = (valor - min) / (max - min);
  return direcao === 'menor' ? 1 - bruto : bruto;
}

/**
 * Módulo 2: ranqueia os subsegmentos.
 *
 * `avaliadas` são as empresas JÁ passadas pelo motor de scoring — é de onde sai
 * a contagem de consolidadores presentes, único critério que depende do papel
 * atribuído a cada empresa.
 *
 * `pesos` é opcional; sem ele, usa `pesoPadrao` de cada critério.
 */
function ranquearSubsegmentos(avaliadas, opcoes) {
  const config = opcoes || {};
  const mapa = mapear(avaliadas, config.setor);

  /* Enriquecimento que só existe depois do scoring: quantos compradores e
     quantas candidatas a venda o motor identificou dentro do subsegmento. */
  for (const s of mapa.subsegmentos) {
    s.compradores = s.empresas.filter((e) => e.classificacao === 'comprador').length;
    s.candidatasVenda = s.empresas.filter((e) => e.classificacao === 'vendedora').length;
    s.alvos = s.empresas.filter((e) => e.classificacao === 'alvo').length;
  }

  const pesos = {};
  for (const chave in CRITERIOS_SUBSEGMENTO) {
    pesos[chave] = config.pesos && config.pesos[chave] !== undefined
      ? Number(config.pesos[chave])
      : CRITERIOS_SUBSEGMENTO[chave].pesoPadrao;
  }

  /* Intervalos observados, critério a critério — a base da normalização. */
  const faixas = {};
  for (const chave in CRITERIOS_SUBSEGMENTO) {
    const valores = _numeros(mapa.subsegmentos, CRITERIOS_SUBSEGMENTO[chave].ler);
    faixas[chave] = valores.length
      ? { min: Math.min(...valores), max: Math.max(...valores) }
      : null;
  }

  const ranqueados = mapa.subsegmentos.map((s) => {
    const contribuicoes = [];
    let soma = 0;
    let pesoAplicado = 0;

    for (const chave in CRITERIOS_SUBSEGMENTO) {
      const criterio = CRITERIOS_SUBSEGMENTO[chave];
      const peso = pesos[chave];
      if (!peso || !faixas[chave]) continue;

      const bruto = criterio.ler(s);
      const nota = _normalizar(bruto, faixas[chave].min, faixas[chave].max, criterio.direcao);

      /* Subsegmento sem o dado não é penalizado nem premiado: o critério sai do
         denominador dele. Distribuir zero seria afirmar que o valor é o pior
         possível, que é exatamente a confusão entre "não sei" e "é ruim". */
      if (nota === null) {
        contribuicoes.push({ chave, rotulo: criterio.rotulo, peso, nota: null, bruto: null, semDado: true });
        continue;
      }

      soma += nota * peso;
      pesoAplicado += peso;
      contribuicoes.push({ chave, rotulo: criterio.rotulo, peso, nota, bruto, pontos: Math.round(nota * peso) });
    }

    contribuicoes.sort((a, b) => (b.pontos || 0) - (a.pontos || 0));

    return {
      ...s,
      score: pesoAplicado > 0 ? Math.round((soma / pesoAplicado) * 100) : 0,
      contribuicoes,
      pesoAplicado,
    };
  });

  ranqueados.sort((a, b) => b.score - a.score);

  return {
    setor: mapa.setor,
    totalEmpresas: mapa.totalEmpresas,
    totalSubsegmentos: mapa.totalSubsegmentos,
    subsegmentos: ranqueados,
    pesos,
    ressalvaCobertura: mapa.ressalvaCobertura,
    criteriosSemFonte: CRITERIOS_SEM_FONTE_MERCADO,
  };
}

/* ---- 3. O QUE NÃO EXISTE EM FONTE ABERTA -----------------------------------
 * Mesmo padrão de `CRITERIOS_SEM_FONTE` em evidencias.js: o critério aparece
 * declarado, com o motivo da ausência e a via de obtenção. Vira lista de
 * compras de dados — e, na reunião, pauta de decisão de orçamento.
 * -------------------------------------------------------------------------- */
const CRITERIOS_SEM_FONTE_MERCADO = [
  {
    criterio: 'Volume e atividade recente de transações',
    porQueImporta: 'Subsegmento com M&A ativo tem comprador com mandato aberto e comparáveis frescos.',
    porQueFalta: 'Não existe registro público consolidado de transações de capital fechado no Brasil. O que se publica é o que a imprensa noticia, com viés para deals grandes.',
    viaDeObtencao: 'Capital IQ ou EMIS (transações precedentes), base que a GHT4 já assina.',
  },
  {
    criterio: 'Múltiplos de valuation praticados',
    porQueImporta: 'É o critério que liga atratividade a preço — subsegmento de múltiplo alto justifica priorização.',
    porQueFalta: 'A DFP dá receita e EBITDA, mas não valor de firma. Sem preço de transação ou capitalização de mercado, não há múltiplo.',
    viaDeObtencao: 'Capital IQ (trading comps e precedentes) — Módulo 5.1.',
  },
  {
    criterio: 'Interesse de compradores estratégicos e financeiros',
    porQueImporta: 'O documento cita como primeiro critério do Módulo 2. Comprador com apetite declarado encurta o ciclo do mandato.',
    porQueFalta: 'Apetite de comprador não é dado público. Circula em conversa de mercado, teaser e mandato — a rede da GHT4 sabe, a CVM não.',
    viaDeObtencao: 'Base proprietária da GHT4 (histórico de mandatos e conversas) + Módulo 4 (rede de conexões).',
    substitutoAtual: 'A ferramenta usa hoje "consolidadores presentes" — empresas do próprio subsegmento com porte e caixa para comprar. É um proxy interno da base, não interesse declarado.',
  },
  {
    criterio: 'Tendências do subsegmento (crescimento, consolidação, tecnologia, regulação)',
    porQueImporta: 'Tese setorial é o que sustenta a conversa de originação com o dono.',
    porQueFalta: 'Exige leitura de reports setoriais, imprensa especializada e regulação — texto, não tabela. Depende da camada de análise de mercado.',
    viaDeObtencao: 'Módulo 5.2 (report de mercado) com EMIS e fontes públicas.',
  },
];

/** Ressalva de cobertura, exibida junto de qualquer resultado deste módulo. */
function ressalvaCobertura(quantas) {
  return {
    titulo: 'O mapa cobre apenas companhias abertas',
    texto: `Os ${quantas} registros vêm da base CVM. Empresas de capital fechado — a maioria do mercado `
         + `e o cliente típico de uma boutique — não têm obrigação de publicar demonstração e não aparecem aqui. `
         + `Logo: a contagem por subsegmento é PISO, não total, e o índice de concentração enxerga só a parte listada.`,
    viaDeObtencao: 'Associações setoriais e EMIS cobrem capital fechado — seção 10.1 do documento de requisitos.',
  };
}

window.MERCADO = {
  CRITERIOS_SUBSEGMENTO, CRITERIOS_SEM_FONTE_MERCADO,
  setoresDisponiveis, mapear, metricas, ranquearSubsegmentos,
  hhi, classificarHhi, mediana,
};
