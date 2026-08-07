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
};

/* Números dentro dos textos de sinal seguem a convenção pt-BR (vírgula decimal,
   ponto de milhar). Na base real aparecem receitas de cinco dígitos em R$ mi —
   sem separador, "R$ 12305 mi" é ilegível. */
const n = (v, casas = 0) => (v === null || v === undefined) ? '—'
  : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

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
      margem_alta: 20,
      backing_pe: 20,
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
    pesos: {
      mudanca_controle: 35,
      sucessao_familiar: 30,
      situacao_especial: 28,
      prejuizo_operacional: 20,
      rodada_investimento: 12,
      margem_baixa: 12,
      retracao_receita: 12,
      backing_pe: 11,
    },
  },
};

/* NOTA SOBRE A ESCALA (importante ao comparar com versões anteriores)
 * O score é normalizado pelo TOTAL de pesos do papel. Ao acrescentar os dois
 * sinais da base real, o denominador do papel "candidata a venda" subiu de 100
 * para 140, e `prejuizo_operacional` levou-o a 160 — logo, todos os índices
 * desse papel caíram proporcionalmente a cada acréscimo,
 * inclusive na base fictícia, onde esses sinais nunca acendem.
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
    cobertura: window.EVIDENCIA ? window.EVIDENCIA.coberturaEvidencia(empresa, sinais) : null,
  };
}

/** Avalia toda a base. */
function avaliarBase(empresas) {
  return empresas.map(avaliarEmpresa);
}

window.MOTOR = {
  LIMIARES, SINAIS, CONFIG_PAPEIS,
  detectarSinais, scorePapel, avaliarEmpresa, avaliarBase,
  lastroDoPapel, rotuloLastro,
};
