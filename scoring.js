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
 *
 *  Para mudar o comportamento, edite:
 *    - LIMIARES (thresholds) abaixo, e
 *    - PESOS de cada sinal dentro de cada papel em CONFIG_PAPEIS.
 * ========================================================================== */

/* ---- 1. LIMIARES AJUSTÁVEIS ------------------------------------------------ */
const LIMIARES = {
  crescimentoRelevante: 20,   // % a.a. a partir do qual o crescimento "conta"
  margemBaixa: 10,            // margem EBITDA (%) abaixo disso = margem baixa
  margemAlta: 25,            // margem EBITDA (%) acima disso = margem alta
  escala: 250,               // receita (R$ mi) a partir da qual há "escala"
  porteMedioMin: 30,         // faixa de porte "consolidável" (alvo ideal)
  porteMedioMax: 250,
};

/* ---- 2. CATÁLOGO DE SINAIS -------------------------------------------------
 * Cada sinal tem: rótulo, tipo (positivo/atenção/neutro) e uma função que
 * decide se está ativo para a empresa. Fácil de estender.
 * -------------------------------------------------------------------------- */
const SINAIS = {
  crescimento_relevante: {
    rotulo: 'Crescimento relevante',
    tipo: 'positivo',
    ativo: (e) => e.crescimento >= LIMIARES.crescimentoRelevante,
    detalhe: (e) => `Crescimento de ${e.crescimento}% a.a.`,
  },
  mercado_fragmentado: {
    rotulo: 'Mercado fragmentado',
    tipo: 'positivo',
    ativo: (e) => e.mercadoFragmentado === true,
    detalhe: () => 'Setor pulverizado — tese de consolidação (buy-and-build).',
  },
  margem_baixa: {
    rotulo: 'Margem baixa',
    tipo: 'atencao',
    ativo: (e) => e.margemEbitda < LIMIARES.margemBaixa,
    detalhe: (e) => `Margem EBITDA de ${e.margemEbitda}% — possível upside de eficiência.`,
  },
  margem_alta: {
    rotulo: 'Margem alta',
    tipo: 'positivo',
    ativo: (e) => e.margemEbitda >= LIMIARES.margemAlta,
    detalhe: (e) => `Margem EBITDA de ${e.margemEbitda}% — geração de caixa saudável.`,
  },
  rodada_investimento: {
    rotulo: 'Rodada de investimento',
    tipo: 'positivo',
    ativo: (e) => e.rodadaRecente === true,
    detalhe: () => 'Captou investimento recentemente — capital para crescer/adquirir.',
  },
  mudanca_controle: {
    rotulo: 'Mudança de controle',
    tipo: 'atencao',
    ativo: (e) => e.mudancaControle === true,
    detalhe: () => 'Sinais de reorganização societária / mudança de controle.',
  },
  expansao_geografica: {
    rotulo: 'Expansão geográfica',
    tipo: 'positivo',
    ativo: (e) => e.expansaoGeografica === true,
    detalhe: () => 'Movimento recente de expansão para novas praças.',
  },
  sucessao_familiar: {
    rotulo: 'Sucessão familiar',
    tipo: 'atencao',
    ativo: (e) => e.perfil === 'Familiar',
    detalhe: () => 'Controle familiar — possível janela de sucessão/liquidez.',
  },
  escala: {
    rotulo: 'Escala',
    tipo: 'positivo',
    ativo: (e) => e.receita >= LIMIARES.escala,
    detalhe: (e) => `Receita estimada de R$ ${e.receita} mi — porte para adquirir.`,
  },
  porte_medio: {
    rotulo: 'Porte consolidável',
    tipo: 'positivo',
    ativo: (e) => e.receita >= LIMIARES.porteMedioMin && e.receita <= LIMIARES.porteMedioMax,
    detalhe: () => 'Porte típico de alvo em teses de consolidação.',
  },
  backing_pe: {
    rotulo: 'Backing de fundo/PE',
    tipo: 'neutro',
    ativo: (e) => e.perfil === 'Fundo/PE',
    detalhe: () => 'Investida por fundo — ciclo de investimento pode levar à saída.',
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
    pesos: {
      mudanca_controle: 35,
      sucessao_familiar: 30,
      rodada_investimento: 12,
      margem_baixa: 12,
      backing_pe: 11,
    },
  },
};

/* ---- 4. CÁLCULO ------------------------------------------------------------ */

/** Retorna a lista de sinais ativos para uma empresa. */
function detectarSinais(empresa) {
  const ativos = [];
  for (const chave in SINAIS) {
    const s = SINAIS[chave];
    if (s.ativo(empresa)) {
      ativos.push({ chave, rotulo: s.rotulo, tipo: s.tipo, detalhe: s.detalhe(empresa) });
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
        peso,
        detalhe: SINAIS[chave].detalhe(empresa),
      });
    }
  }
  contribuicoes.sort((a, b) => b.peso - a.peso);
  const score = maxPossivel > 0 ? Math.round((soma / maxPossivel) * 100) : 0;
  return { score, contribuicoes, maxPossivel };
}

/** Avalia uma empresa em todos os papéis e define a classificação principal. */
function avaliarEmpresa(empresa) {
  const papeis = {};
  for (const p in CONFIG_PAPEIS) {
    papeis[p] = scorePapel(empresa, p);
  }
  // classificação principal = papel de maior score (desempate por ordem definida)
  const ordem = ['alvo', 'comprador', 'vendedora'];
  let principal = ordem[0];
  for (const p of ordem) {
    if (papeis[p].score > papeis[principal].score) principal = p;
  }
  return {
    ...empresa,
    sinais: detectarSinais(empresa),
    papeis,
    classificacao: principal,
    scorePrincipal: papeis[principal].score,
  };
}

/** Avalia toda a base. */
function avaliarBase(empresas) {
  return empresas.map(avaliarEmpresa);
}

window.MOTOR = {
  LIMIARES, SINAIS, CONFIG_PAPEIS,
  detectarSinais, scorePapel, avaliarEmpresa, avaliarBase,
};
