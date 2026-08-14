/* =============================================================================
 *  GHT4 · Agente de Prospecção M&A — MOTOR DE SCORING (ILUSTRATIVO)
 * -----------------------------------------------------------------------------
 *  ESTE É O PONTO DE EDIÇÃO APÓS AS REUNIÕES DE LEVANTAMENTO.
 *
 *  O score é MERAMENTE ILUSTRATIVO. Não prevê transações, não recomenda
 *  negócios e não substitui análise humana. Serve apenas para demonstrar
 *  COMO um agente poderia priorizar e explicar oportunidades.
 *
 *  Como funciona (transparente e simples de alterar):
 *    1) SINAIS: cada empresa passa por regras que detectam "sinais" de mercado.
 *    2) PAPÉIS: cada papel (alvo / comprador / candidata a venda) soma os
 *       pesos dos sinais relevantes para aquele papel.
 *    3) SCORE: a soma é normalizada para 0–100 (relativo ao máximo do papel).
 *    4) CLASSIFICAÇÃO: o papel de maior score vira a classificação principal.
 *    5) LASTRO: quanto do score se apoia em fonte documental verificável.
 *
 *  Para mudar o comportamento, edite:
 *    - LIMIARES (thresholds) abaixo, e
 *    - PESOS de cada sinal dentro de cada papel em CONFIG_PAPEIS.
 *
 *  POR QUE ESTE MOTOR É DETERMINÍSTICO (e não um LLM)
 *  ---------------------------------------------------
 *  Decisão de projeto, não limitação. A pesquisa Datasite/FT (2026) mostra que
 *  71% dos dealmakers colocam ACURÁCIA como atributo mais importante ao usar IA,
 *  e 24% acreditam que o MAU uso de IA vai destruir deals de alto valor nos
 *  próximos cinco anos — o risco citado nas entrevistas é a alucinação
 *  apresentada como fato. Um motor de regras com pesos explícitos não alucina e
 *  é auditável linha a linha: dá para reconstituir exatamente por que uma
 *  empresa recebeu o índice que recebeu.
 *
 *  O lugar natural da IA generativa nesta arquitetura é a CAMADA DE COLETA —
 *  ler notícias, atas, registros e extrair sinais candidatos — sempre com a
 *  fonte anexada (ver `evidencias.js`) e sempre com validação humana antes de
 *  virar sinal ativo. 58% dos dealmakers aplicam exatamente essa revisão.
 * ========================================================================== */

/* ---- 1. LIMIARES AJUSTÁVEIS ------------------------------------------------ */
const LIMIARES = {
  crescimentoRelevante: 20,   // % a.a. a partir do qual o crescimento "conta"
  margemBaixa: 10,            // margem EBITDA (%) abaixo disso = margem comprimida
  /* PISO da margem comprimida. Abaixo daqui não é ineficiência, é prejuízo
     operacional — tese diferente, papel diferente. Ver o sinal margem_baixa. */
  prejuizoOperacional: 0,
  margemAlta: 25,            // margem EBITDA (%) acima disso = margem alta
  escala: 250,               // receita (R$ mi) a partir da qual há "escala"
  porteMedioMin: 30,         // faixa de porte "consolidável" (alvo ideal)
  porteMedioMax: 250,
  retracaoReceita: -5,       // queda de receita (% a.a.) que já conta como sinal

  /* ---- critérios de triagem usados por boutiques de M&A -------------------
   * Estes limiares vêm da prática de screening descrita por assessorias e casas
   * de private equity, não de teoria. Os números são o ponto de partida para a
   * conversa com os sócios — cada um deles é discutível e fácil de mudar.
   *
   *   alavancagem ....... 3× dívida líquida/EBITDA é o patamar em que covenants
   *                       bancários apertam e o comprador passa a herdar a
   *                       dívida junto com o ativo. Abaixo de 1,5× o balanço é
   *                       limpo o bastante para o comprador alavancar a compra.
   *   liquidez .......... abaixo de 1,0 o passivo circulante supera o ativo
   *                       circulante: a empresa depende de rolagem para operar.
   *   conversão de caixa. 70% do EBITDA virando caixa operacional é o corte
   *                       usual entre "lucro contábil" e "lucro com lastro".
   *   contingências ..... obrigações trabalhistas/fiscais e provisões acima de
   *                       30% do patrimônio líquido. Passivo trabalhista é
   *                       apontado como o principal "deal killer" do middle
   *                       market brasileiro — e o balanço mostra só o que já
   *                       foi provisionado, então este limiar é conservador.
   *   margem ............ 2 pontos percentuais de variação já indicam tendência;
   *                       compradores olham a trajetória, não só o nível.
   *   investimento ...... acima de 15% da receita, o negócio consome caixa para
   *                       crescer — muda a estrutura de financiamento do deal. */
  alavancagemConfortavel: 1.5,
  alavancagemElevada: 3,
  liquidezMinima: 1,
  conversaoCaixaBoa: 70,
  contingenciasRelevantes: 30,
  margemEmMovimento: 2,
  intensidadeInvestimentoAlta: 15,
};

/* Números dentro dos textos de sinal seguem a convenção pt-BR (vírgula decimal,
   ponto de milhar). Na base real aparecem receitas de cinco dígitos em R$ mi —
   sem separador, "R$ 12305 mi" é ilegível. */
const n = (v, casas = 0) => (v === null || v === undefined) ? '—'
  : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/* Indicador ausente NÃO é indicador ruim. Todo sinal numérico passa por aqui
   antes de comparar: em JavaScript `null < 10` é verdadeiro, e sem esta guarda
   uma empresa sem o dado acenderia o alerta como se o tivesse. Vale para os
   critérios de triagem, cuja cobertura na base da CVM vai de 71% a 100% — o
   restante precisa ficar em silêncio, não virar alarme falso. */
const tem = (v) => v !== null && v !== undefined;

/* ---- 2. CATÁLOGO DE SINAIS -------------------------------------------------
 * Cada sinal tem:
 *   rotulo   -> nome exibido
 *   tipo     -> positivo / atencao / neutro (afeta só a cor)
 *   natureza -> DE ONDE a afirmação vem, e portanto o que a sustenta:
 *                 'documental'  precisa de fonte externa (notícia, registro,
 *                               comunicado). Sem fonte, vira lacuna explícita.
 *                 'estruturado' vem de um indicador da ficha da empresa.
 *                 'cadastral'   vem do quadro societário.
 *   ativo    -> função que decide se o sinal se aplica à empresa
 *   detalhe  -> texto explicativo
 *
 * A `natureza` é o que permite ao painel de evidência (evidencias.js) buscar a
 * fonte certa e distinguir o que está DOCUMENTADO do que está INFERIDO.
 * -------------------------------------------------------------------------- */
const SINAIS = {
  crescimento_relevante: {
    rotulo: 'Crescimento relevante',
    tipo: 'positivo',
    natureza: 'estruturado',
    ativo: (e) => e.crescimento >= LIMIARES.crescimentoRelevante,
    detalhe: (e) => `Crescimento de ${n(e.crescimento, 1)}% a.a.`,
  },
  mercado_fragmentado: {
    rotulo: 'Mercado fragmentado',
    tipo: 'positivo',
    natureza: 'documental',
    ativo: (e) => e.mercadoFragmentado === true,
    detalhe: () => 'Setor pulverizado — tese de consolidação (buy-and-build).',
  },
  margem_baixa: {
    rotulo: 'Margem comprimida',
    tipo: 'atencao',
    natureza: 'estruturado',
    /* O teste de nulo não é decorativo: sem ele, `null < 10` é verdadeiro em
       JavaScript e toda empresa SEM margem apurada acenderia "margem baixa" —
       o modelo confundiria "não sei" com "é ruim". Na base da CVM isso atingiria
       as holdings, cuja margem foi deliberadamente deixada em branco.

       O PISO existe pela mesma razão, do outro lado. A tese de "margem baixa"
       num alvo é upside de eficiência: uma empresa de 4% de margem pode chegar a
       12% sob gestão nova. Essa tese não sobrevive a EBITDA negativo — a −294%
       não há eficiência a capturar, há um negócio que não se paga. Sem o piso, o
       motor colocava a OSX Brasil (recuperação judicial, 8 empregados) como alvo
       de aquisição nº 1 da base real, com o texto "possível upside de
       eficiência" ao lado de uma margem de −293,9%. Prejuízo operacional virou
       sinal próprio, e ele pertence ao papel de candidata a venda. */
    ativo: (e) => e.margemEbitda !== null && e.margemEbitda !== undefined
                  && e.margemEbitda >= LIMIARES.prejuizoOperacional
                  && e.margemEbitda < LIMIARES.margemBaixa,
    detalhe: (e) => `Margem EBITDA de ${n(e.margemEbitda, 1)}% — possível upside de eficiência.`,
  },
  prejuizo_operacional: {
    rotulo: 'Prejuízo operacional',
    tipo: 'atencao',
    natureza: 'estruturado',
    ativo: (e) => e.margemEbitda !== null && e.margemEbitda !== undefined
                  && e.margemEbitda < LIMIARES.prejuizoOperacional,
    detalhe: (e) => `EBITDA negativo (${n(e.margemEbitda, 1)}% da receita) — a operação não se paga. `
                  + `Tese de distressed/turnaround, não de consolidação de margem.`,
  },
  margem_alta: {
    rotulo: 'Margem alta',
    tipo: 'positivo',
    natureza: 'estruturado',
    ativo: (e) => e.margemEbitda >= LIMIARES.margemAlta,
    detalhe: (e) => `Margem EBITDA de ${n(e.margemEbitda, 1)}% — geração de caixa saudável.`,
  },
  rodada_investimento: {
    rotulo: 'Rodada de investimento',
    tipo: 'positivo',
    natureza: 'documental',
    ativo: (e) => e.rodadaRecente === true,
    detalhe: () => 'Captou investimento recentemente — capital para crescer/adquirir.',
  },
  mudanca_controle: {
    rotulo: 'Mudança de controle',
    tipo: 'atencao',
    natureza: 'documental',
    ativo: (e) => e.mudancaControle === true,
    detalhe: () => 'Sinais de reorganização societária / mudança de controle.',
  },
  expansao_geografica: {
    rotulo: 'Expansão geográfica',
    tipo: 'positivo',
    natureza: 'documental',
    ativo: (e) => e.expansaoGeografica === true,
    detalhe: () => 'Movimento recente de expansão para novas praças.',
  },
  sucessao_familiar: {
    rotulo: 'Sucessão familiar',
    tipo: 'atencao',
    natureza: 'cadastral',
    ativo: (e) => e.perfil === 'Familiar',
    detalhe: () => 'Controle familiar — possível janela de sucessão/liquidez.',
  },
  escala: {
    rotulo: 'Escala',
    tipo: 'positivo',
    natureza: 'estruturado',
    ativo: (e) => e.receita >= LIMIARES.escala,
    detalhe: (e) => `Receita de R$ ${n(e.receita)} mi — porte para adquirir.`,
  },
  porte_medio: {
    rotulo: 'Porte consolidável',
    tipo: 'positivo',
    natureza: 'estruturado',
    ativo: (e) => e.receita >= LIMIARES.porteMedioMin && e.receita <= LIMIARES.porteMedioMax,
    detalhe: () => 'Porte típico de alvo em teses de consolidação.',
  },
  backing_pe: {
    rotulo: 'Backing de fundo/PE',
    tipo: 'neutro',
    natureza: 'cadastral',
    ativo: (e) => e.perfil === 'Fundo/PE',
    detalhe: () => 'Investida por fundo — ciclo de investimento pode levar à saída.',
  },

  /* ---- sinais que só a base real (CVM) consegue acender -------------------
   * Os dois abaixo dependem de campos que só existem em registro público de
   * companhia aberta. Na base fictícia eles nunca disparam; na base da CVM
   * são os únicos sinais de EVENTO disponíveis — porque dado público brasileiro
   * entrega números, não acontecimentos. */
  situacao_especial: {
    rotulo: 'Situação especial',
    tipo: 'atencao',
    natureza: 'documental',
    ativo: (e) => !!e.situacaoEspecial,
    detalhe: (e) => `${e.situacaoEspecial} — ativo em situação de estresse, tese de distressed M&A.`,
  },
  retracao_receita: {
    rotulo: 'Retração de receita',
    tipo: 'atencao',
    natureza: 'estruturado',
    ativo: (e) => e.crescimento !== null && e.crescimento !== undefined
                  && e.crescimento <= LIMIARES.retracaoReceita,
    detalhe: (e) => `Receita caiu ${n(Math.abs(e.crescimento), 1)}% no exercício — pressão sobre os controladores.`,
  },

  /* ---- critérios de triagem de boutique ----------------------------------
   * Os sinais abaixo reproduzem o screening que uma casa de M&A faz antes de
   * abrir um alvo: o ativo é financiável? o lucro vira caixa? o passivo esconde
   * surpresa? Todos saem de conta padronizada da DFP, então são `estruturado`
   * e o dossiê cita a linha contábil exata (ver evidencias.js).
   *
   * Os de `tipo: 'atencao'` também alimentam RESSALVAS, exibidas AO LADO do
   * índice — um alvo pode ser excelente e ainda assim carregar um risco que o
   * comprador precisa ver antes de abrir conversa. */
  balanco_desalavancado: {
    rotulo: 'Balanço desalavancado',
    tipo: 'positivo',
    natureza: 'estruturado',
    ativo: (e) => tem(e.alavancagem) && e.alavancagem <= LIMIARES.alavancagemConfortavel,
    detalhe: (e) => e.alavancagem < 0
      ? `Caixa e aplicações superam a dívida (${n(e.alavancagem, 2)}× o EBITDA) — ativo limpo, comprador pode alavancar a compra.`
      : `Dívida líquida de ${n(e.alavancagem, 2)}× o EBITDA — capacidade de endividamento preservada para financiar a transação.`,
  },
  caixa_liquido: {
    rotulo: 'Caixa líquido',
    tipo: 'positivo',
    natureza: 'estruturado',
    ativo: (e) => tem(e.alavancagem) && e.alavancagem < 0,
    detalhe: () => 'Caixa e aplicações financeiras superam a dívida — poder de fogo para adquirir sem tomar dívida nova.',
  },
  alavancagem_elevada: {
    rotulo: 'Alavancagem elevada',
    tipo: 'atencao',
    natureza: 'estruturado',
    ativo: (e) => tem(e.alavancagem) && e.alavancagem >= LIMIARES.alavancagemElevada,
    detalhe: (e) => `Dívida líquida de ${n(e.alavancagem, 2)}× o EBITDA. Acima de ${LIMIARES.alavancagemElevada}× `
                  + 'o comprador herda a dívida junto com o ativo e a estrutura do deal muda.',
  },
  aperto_liquidez: {
    rotulo: 'Aperto de liquidez',
    tipo: 'atencao',
    natureza: 'estruturado',
    ativo: (e) => tem(e.liquidezCorrente) && e.liquidezCorrente < LIMIARES.liquidezMinima,
    detalhe: (e) => `Liquidez corrente de ${n(e.liquidezCorrente, 2)} — o passivo circulante supera o ativo circulante, `
                  + 'a operação depende de rolagem de dívida.',
  },
  conversao_caixa_alta: {
    rotulo: 'EBITDA vira caixa',
    tipo: 'positivo',
    natureza: 'estruturado',
    ativo: (e) => tem(e.conversaoCaixa) && e.conversaoCaixa >= LIMIARES.conversaoCaixaBoa,
    detalhe: (e) => `${n(e.conversaoCaixa, 0)}% do EBITDA virou caixa operacional — o lucro tem lastro em caixa, `
                  + 'não em competência contábil.',
  },
  contingencias_relevantes: {
    rotulo: 'Contingências relevantes',
    tipo: 'atencao',
    natureza: 'estruturado',
    ativo: (e) => tem(e.contingenciasSobrePl) && e.contingenciasSobrePl >= LIMIARES.contingenciasRelevantes,
    detalhe: (e) => `Obrigações trabalhistas, fiscais e provisões somam ${n(e.contingenciasSobrePl, 0)}% do patrimônio líquido. `
                  + 'E o balanço mostra só o que já foi provisionado — o passivo oculto é justamente o que a diligência procura.',
  },
  patrimonio_negativo: {
    rotulo: 'Patrimônio líquido negativo',
    tipo: 'atencao',
    natureza: 'estruturado',
    ativo: (e) => e.patrimonioLiquidoNegativo === true,
    detalhe: () => 'O passivo supera o ativo: o capital próprio foi consumido. Reestruturação societária costuma preceder qualquer transação.',
  },
  margem_em_expansao: {
    rotulo: 'Margem em expansão',
    tipo: 'positivo',
    natureza: 'estruturado',
    /* O piso de margem positiva não é detalhe. Sem ele, a OSX Brasil — EBITDA de
       −293,9% da receita — acendia "Margem em expansão" e somava ponto para
       ALVO, só porque o exercício anterior tinha sido ainda pior. Melhorar de
       −400% para −294% é notícia de turnaround, não de margem em expansão; a
       segunda leitura sugere um ativo saudável ganhando eficiência. Mesma
       lógica do piso de `margem_baixa`. */
    ativo: (e) => tem(e.variacaoMargem) && e.variacaoMargem >= LIMIARES.margemEmMovimento
                  && tem(e.margemEbitda) && e.margemEbitda > LIMIARES.prejuizoOperacional,
    detalhe: (e) => `Margem EBITDA subiu ${n(e.variacaoMargem, 1)} p.p. sobre o exercício anterior — trajetória, não só nível.`,
  },
  margem_em_deterioracao: {
    rotulo: 'Margem em deterioração',
    tipo: 'atencao',
    natureza: 'estruturado',
    ativo: (e) => tem(e.variacaoMargem) && e.variacaoMargem <= -LIMIARES.margemEmMovimento,
    detalhe: (e) => `Margem EBITDA caiu ${n(Math.abs(e.variacaoMargem), 1)} p.p. sobre o exercício anterior.`,
  },
  capital_intensivo: {
    rotulo: 'Capital intensivo',
    tipo: 'neutro',
    natureza: 'estruturado',
    ativo: (e) => tem(e.intensidadeInvestimento) && e.intensidadeInvestimento >= LIMIARES.intensidadeInvestimentoAlta,
    detalhe: (e) => `Investimento consumiu ${n(e.intensidadeInvestimento, 1)}% da receita no exercício — `
                  + 'o crescimento exige capital, o que muda a estrutura de financiamento do deal.',
  },
};

/* ---- 3. PAPÉIS E PESOS -----------------------------------------------------
 * Para cada papel, quais sinais contam e com que peso. EDITE AQUI livremente.
 * -------------------------------------------------------------------------- */
const CONFIG_PAPEIS = {
  alvo: {
    id: 'alvo',
    rotulo: 'Possível alvo de aquisição',
    descricao: 'Empresa com perfil atraente para ser adquirida por um cliente comprador.',
    cor: 'alvo',
    pesos: {
      porte_medio: 25,
      mercado_fragmentado: 22,
      crescimento_relevante: 22,
      balanco_desalavancado: 18,
      conversao_caixa_alta: 15,
      margem_em_expansao: 12,
      margem_baixa: 12,
      situacao_especial: 12,
      expansao_geografica: 10,
    },
  },
  comprador: {
    id: 'comprador',
    rotulo: 'Potencial comprador',
    descricao: 'Empresa com porte, caixa ou mandato para consolidar o setor.',
    cor: 'comprador',
    pesos: {
      escala: 30,
      caixa_liquido: 25,
      margem_alta: 20,
      backing_pe: 20,
      conversao_caixa_alta: 15,
      rodada_investimento: 15,
      expansao_geografica: 15,
    },
  },
  vendedora: {
    id: 'vendedora',
    rotulo: 'Possível candidata a venda',
    descricao: 'Empresa com sinais de que os controladores podem buscar liquidez.',
    cor: 'vendedora',
    /* `prejuizo_operacional` entra AQUI e não em `alvo`: EBITDA negativo é
       evidência de que os controladores podem precisar de liquidez, não de que a
       empresa é um alvo limpo de consolidação. */
    /* Os critérios de balanço entram AQUI, e não em `alvo`, pela mesma lógica
       de `prejuizo_operacional`: alavancagem alta, aperto de liquidez e
       patrimônio consumido são evidência de que os controladores podem precisar
       de liquidez — não de que a empresa é um alvo limpo de consolidação.
       Como RESSALVA eles aparecem em qualquer papel; como PESO, só neste. */
    pesos: {
      mudanca_controle: 35,
      sucessao_familiar: 30,
      situacao_especial: 28,
      patrimonio_negativo: 25,
      alavancagem_elevada: 22,
      prejuizo_operacional: 20,
      aperto_liquidez: 18,
      contingencias_relevantes: 15,
      margem_em_deterioracao: 14,
      rodada_investimento: 12,
      margem_baixa: 12,
      retracao_receita: 12,
      backing_pe: 11,
    },
  },
};

/* ---- 3b. RESSALVAS DE TRIAGEM ----------------------------------------------
 * Uma boutique não descarta um alvo porque ele tem risco — ela quer o risco na
 * mesa antes de abrir conversa. Um ativo pode ser excelente candidato E ter
 * alavancagem de 4×; as duas coisas são verdade ao mesmo tempo.
 *
 * Por isso as ressalvas NÃO entram no índice do papel `alvo`: são exibidas ao
 * lado dele, como o lastro. Mesma decisão de projeto — o índice responde "vale
 * olhar?", a ressalva responde "olhando o quê?", e quem pondera é a pessoa.
 * -------------------------------------------------------------------------- */
const RESSALVAS = [
  'patrimonio_negativo',
  'alavancagem_elevada',
  'aperto_liquidez',
  'contingencias_relevantes',
  'margem_em_deterioracao',
  'prejuizo_operacional',
  'retracao_receita',
  'capital_intensivo',
];

/** Ressalvas ativas para uma empresa, na ordem de gravidade acima. */
function ressalvasDe(empresa) {
  return RESSALVAS
    .filter((chave) => SINAIS[chave] && SINAIS[chave].ativo(empresa))
    .map((chave) => ({
      chave,
      rotulo: SINAIS[chave].rotulo,
      detalhe: SINAIS[chave].detalhe(empresa),
      evidencia: evidenciaDe(empresa, chave),
    }));
}

/* NOTA SOBRE A ESCALA (importante ao comparar com versões anteriores)
 * O score é normalizado pelo TOTAL de pesos do papel. Ao acrescentar os dois
 * sinais da base real, o denominador do papel "candidata a venda" subiu de 100
 * para 140, e `prejuizo_operacional` levou-o a 160 — logo, todos os índices
 * desse papel caíram proporcionalmente a cada acréscimo,
 * inclusive na base fictícia, onde esses sinais nunca acendem.
 *
 * Os critérios de triagem mexeram de novo nos três denominadores: alvo 103→148,
 * comprador 100→140, candidata a venda 160→254. ÍNDICES DESTA VERSÃO NÃO SÃO
 * COMPARÁVEIS COM OS DA ANTERIOR — nem entre si ao longo do tempo, enquanto o
 * catálogo de sinais estiver sendo ajustado nas reuniões. O que permanece
 * comparável é a ORDEM dentro de uma mesma execução.
 *
 * Efeito colateral a discutir com os sócios: na base da CVM os critérios de
 * balanço têm cobertura de 71% a 100%, mas na base fictícia eles não existem —
 * `data.js` não tem dívida, liquidez nem fluxo de caixa. Os índices das duas
 * bases, portanto, não se comparam entre si. Se isso incomodar, o caminho é
 * acrescentar esses campos às empresas fictícias (ver README).
 * Isso é consequência da normalização, não um bug: o índice é RELATIVO ao que o
 * modelo considera possível. Se os sócios preferirem índices estáveis no tempo,
 * a alternativa é normalizar por um máximo fixo ou usar ordenação relativa —
 * está na lista de decisões em aberto (escala do índice). */

/* ---- 4. CÁLCULO ------------------------------------------------------------ */

/** Busca a evidência de um sinal, se a camada de evidência estiver carregada. */
function evidenciaDe(empresa, chave) {
  return window.EVIDENCIA ? window.EVIDENCIA.evidenciaDe(empresa, chave) : null;
}

/** Retorna a lista de sinais ativos para uma empresa, já com evidência anexada. */
function detectarSinais(empresa) {
  const ativos = [];
  for (const chave in SINAIS) {
    const s = SINAIS[chave];
    if (s.ativo(empresa)) {
      ativos.push({
        chave,
        rotulo: s.rotulo,
        tipo: s.tipo,
        natureza: s.natureza,
        detalhe: s.detalhe(empresa),
        evidencia: evidenciaDe(empresa, chave),
      });
    }
  }
  return ativos;
}

/** Calcula o score (0–100) e a contribuição de cada sinal para um papel. */
function scorePapel(empresa, papel) {
  const cfg = CONFIG_PAPEIS[papel];
  const maxPossivel = Object.values(cfg.pesos).reduce((a, b) => a + b, 0);
  let soma = 0;
  const contribuicoes = [];
  for (const chave in cfg.pesos) {
    const peso = cfg.pesos[chave];
    if (SINAIS[chave] && SINAIS[chave].ativo(empresa)) {
      soma += peso;
      contribuicoes.push({
        chave,
        rotulo: SINAIS[chave].rotulo,
        tipo: SINAIS[chave].tipo,
        natureza: SINAIS[chave].natureza,
        peso,
        detalhe: SINAIS[chave].detalhe(empresa),
        evidencia: evidenciaDe(empresa, chave),
      });
    }
  }
  contribuicoes.sort((a, b) => b.peso - a.peso);
  const score = maxPossivel > 0 ? Math.round((soma / maxPossivel) * 100) : 0;
  return { score, contribuicoes, maxPossivel, somaPontos: soma };
}

/* ---- 5. LASTRO DE EVIDÊNCIA ------------------------------------------------
 * Um índice alto construído sobre boato não vale o mesmo que um índice alto
 * construído sobre registro público. O LASTRO mede que fração dos pontos do
 * score se apoia em fonte documental verificável — e é exibido junto do índice,
 * nunca embutido nele. O usuário decide o que fazer com essa informação.
 *
 * Justificativa (Datasite/FT 2026): 71% dos dealmakers apontam acurácia como o
 * atributo mais importante; 43% exigem transparência sobre como o output foi
 * gerado; 45% estabelecem accountability explícita para decisões informadas por
 * IA. Esconder a diferença entre "documentado" e "inferido" quebra os três.
 * -------------------------------------------------------------------------- */
function lastroDoPapel(empresa, resultadoPapel) {
  let pontosDocumentados = 0, pontosInferidos = 0, pontosEstruturados = 0;
  const lacunas = [];

  for (const c of resultadoPapel.contribuicoes) {
    const ev = c.evidencia;
    if (!ev) { pontosEstruturados += c.peso; continue; }
    if (ev.natureza === 'documental') pontosDocumentados += c.peso;
    else if (ev.natureza === 'lacuna') { pontosInferidos += c.peso; lacunas.push(c.rotulo); }
    else pontosEstruturados += c.peso;
  }

  const total = resultadoPapel.somaPontos || 0;
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return {
    pctDocumentado: pct(pontosDocumentados),
    pctEstruturado: pct(pontosEstruturados),
    pctInferido: pct(pontosInferidos),
    lacunas,
  };
}

/** Rótulo curto para a qualidade do lastro. */
function rotuloLastro(lastro) {
  if (lastro.pctInferido >= 25) return { chave: 'fraco', rotulo: 'Lastro frágil' };
  if (lastro.pctDocumentado >= 50) return { chave: 'forte', rotulo: 'Bem documentado' };
  if (lastro.pctDocumentado >= 25) return { chave: 'medio', rotulo: 'Parcialmente documentado' };
  return { chave: 'medio', rotulo: 'Baseado em indicadores' };
}

/** Avalia uma empresa em todos os papéis e define a classificação principal. */
function avaliarEmpresa(empresa) {
  const papeis = {};
  for (const p in CONFIG_PAPEIS) {
    papeis[p] = scorePapel(empresa, p);
    papeis[p].lastro = lastroDoPapel(empresa, papeis[p]);
  }
  // classificação principal = papel de maior score (desempate por ordem definida)
  const ordem = ['alvo', 'comprador', 'vendedora'];
  let principal = ordem[0];
  for (const p of ordem) {
    if (papeis[p].score > papeis[principal].score) principal = p;
  }
  const sinais = detectarSinais(empresa);
  return {
    ...empresa,
    sinais,
    papeis,
    classificacao: principal,
    scorePrincipal: papeis[principal].score,
    lastroPrincipal: papeis[principal].lastro,
    rotuloLastro: rotuloLastro(papeis[principal].lastro),
    ressalvas: ressalvasDe(empresa),
    criteriosNaoAvaliados: window.EVIDENCIA ? window.EVIDENCIA.criteriosNaoAvaliados(empresa) : [],
    cobertura: window.EVIDENCIA ? window.EVIDENCIA.coberturaEvidencia(empresa, sinais) : null,
  };
}

/** Avalia toda a base. */
function avaliarBase(empresas) {
  return empresas.map(avaliarEmpresa);
}

window.MOTOR = {
  LIMIARES, SINAIS, CONFIG_PAPEIS, RESSALVAS,
  detectarSinais, scorePapel, avaliarEmpresa, avaliarBase,
  lastroDoPapel, rotuloLastro, ressalvasDe,
};
