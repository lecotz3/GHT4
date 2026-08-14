/* =============================================================================
 *  GHT4 · LISTAS DE POTENCIAIS COMPRADORES E ALVOS  (Módulo 6)
 * -----------------------------------------------------------------------------
 *  Cenário do documento (seção 7): a GHT4 foi mandatada para vender a empresa X.
 *  A pergunta deixa de ser "quem é interessante no mercado" e passa a ser "quem
 *  compra ESTA empresa" — outra pergunta, outro ranking.
 *
 *  A diferença em relação ao Módulo 3 é o ponto de referência. Lá, cada empresa
 *  é avaliada contra um ideal abstrato de comprador. Aqui, cada candidata é
 *  avaliada contra um alvo CONCRETO: proximidade com a atividade dele, porte
 *  suficiente para absorvê-lo, balanço que aguenta a compra.
 *
 *  Vale nos dois sentidos: `compradoresPara` (mandato de venda, sell-side) e
 *  `alvosPara` (mandato de compra, buy-side).
 *
 *  O QUE ESTE MÓDULO NÃO SABE
 *  Um comprador real se qualifica por apetite declarado, tese de aquisição,
 *  mandato de fundo com prazo para alocar e histórico de compras. Nada disso é
 *  público. O que a base sustenta é CAPACIDADE — porte, caixa, proximidade
 *  setorial — que é condição necessária e não suficiente. A lista devolvida
 *  carrega essa distinção em `limitacoes`, e a interface a exibe junto.
 * ========================================================================== */

/* ---- 1. CRITÉRIOS ----------------------------------------------------------
 * Cada critério devolve 0..1, ou null quando a candidata não publicou o dado.
 * Pesos configuráveis, como o restante da ferramenta.
 * -------------------------------------------------------------------------- */
const CRITERIOS_COMPRADOR = {
  proximidade: {
    rotulo: 'Proximidade com a atividade',
    explicacao: 'Comprador do mesmo subsegmento captura sinergia direta; do mesmo setor, adjacência; de fora, tese de diversificação.',
    pesoPadrao: 30,
    fonte: 'Classificação setorial CVM',
    nota: (candidata, alvo) => {
      if (candidata.subsetor && candidata.subsetor === alvo.subsetor) return 1;
      if (candidata.setor && candidata.setor === alvo.setor) return 0.6;
      return 0.15;
    },
    descrever: (candidata, alvo) => {
      if (candidata.subsetor === alvo.subsetor) return `Mesmo subsegmento (${candidata.subsetor})`;
      if (candidata.setor === alvo.setor) return `Mesmo setor, outro subsegmento (${candidata.subsetor})`;
      return `Setor distinto (${candidata.setor}) — tese de diversificação`;
    },
  },

  capacidade: {
    rotulo: 'Capacidade de absorção',
    explicacao: 'Razão entre a receita da compradora e a do alvo. Abaixo de 1× a compra vira fusão entre iguais, que é outra conversa.',
    pesoPadrao: 25,
    fonte: 'CVM · conta 3.01 de ambas',
    nota: (candidata, alvo) => {
      if (!candidata.receita || !alvo.receita) return null;
      const razao = candidata.receita / alvo.receita;
      if (razao >= 5) return 1;
      if (razao >= 1) return 0.2 + ((razao - 1) / 4) * 0.8;
      return Math.max(0, razao * 0.2);
    },
    descrever: (candidata, alvo) => {
      if (!candidata.receita || !alvo.receita) return 'Receita não publicada';
      const razao = candidata.receita / alvo.receita;
      return `Receita ${razao.toFixed(1)}× a do alvo`;
    },
  },

  folgaFinanceira: {
    rotulo: 'Folga no balanço',
    explicacao: 'Quem já está alavancado não faz aquisição. Dívida líquida/EBITDA baixa — ou caixa líquido — é o que permite escrever cheque.',
    pesoPadrao: 20,
    fonte: 'CVM · 2.01.04 + 2.02.01 − 1.01.01 − 1.01.02 ÷ EBITDA',
    nota: (candidata) => {
      const a = candidata.alavancagem;
      if (a === null || a === undefined) return null;
      if (a < 0) return 1;           // caixa líquido
      if (a <= 1.5) return 0.85;
      if (a >= 3.5) return 0;
      return 0.85 * (1 - (a - 1.5) / 2);
    },
    descrever: (candidata) => {
      const a = candidata.alavancagem;
      if (a === null || a === undefined) return 'Alavancagem não apurada';
      if (a < 0) return `Caixa líquido (${a.toFixed(2)}×)`;
      return `Dívida líquida/EBITDA de ${a.toFixed(2)}×`;
    },
  },

  geracaoDeCaixa: {
    rotulo: 'Geração de caixa',
    explicacao: 'Conversão de EBITDA em caixa operacional. Sustenta a capacidade de pagar sem depender só de dívida nova.',
    pesoPadrao: 10,
    fonte: 'CVM · conta 6.01 ÷ EBITDA',
    nota: (candidata) => {
      const c = candidata.conversaoCaixa;
      if (c === null || c === undefined) return null;
      if (c >= 100) return 1;
      if (c <= 0) return 0;
      return c / 100;
    },
    descrever: (candidata) => {
      const c = candidata.conversaoCaixa;
      return c === null || c === undefined
        ? 'Conversão de caixa não apurada'
        : `Converte ${c.toFixed(0)}% do EBITDA em caixa`;
    },
  },

  indiceComprador: {
    rotulo: 'Índice de comprador',
    explicacao: 'O score do papel "potencial comprador" calculado pelo motor, com todos os sinais que ele já pondera.',
    pesoPadrao: 10,
    fonte: 'Motor de scoring · papel comprador',
    nota: (candidata) => {
      const p = candidata.papeis && candidata.papeis.comprador;
      return p ? p.score / 100 : null;
    },
    descrever: (candidata) => {
      const p = candidata.papeis && candidata.papeis.comprador;
      return p ? `Índice de comprador ${p.score}/100` : 'Não avaliado';
    },
  },

  perfilConsolidador: {
    rotulo: 'Perfil consolidador',
    explicacao: 'Holding, multinacional ou empresa com aporte de fundo tendem a comprar. PROXY: o histórico real de aquisições não é público.',
    pesoPadrao: 5,
    fonte: 'Proxy: perfil societário CVM (não é histórico de aquisições)',
    proxy: true,
    nota: (candidata) => {
      if (candidata.perfil === 'Holding de participações') return 1;
      if (candidata.perfil === 'Multinacional') return 0.8;
      if (candidata.rodadaRecente === true) return 0.7;
      return 0.3;
    },
    descrever: (candidata) => `Perfil: ${candidata.perfil || 'não informado'}`,
  },
};

/* ---- 2. EXCLUSÕES ----------------------------------------------------------
 * Duas razões para uma candidata sair da lista antes de qualquer cálculo.
 * -------------------------------------------------------------------------- */

/** Raiz do CNPJ (8 primeiros dígitos) — identifica empresas do mesmo grupo. */
function _raizCnpj(empresa) {
  const cnpj = empresa.cvm && empresa.cvm.cnpj;
  if (!cnpj) return null;
  const digitos = String(cnpj).replace(/\D/g, '');
  return digitos.length >= 8 ? digitos.slice(0, 8) : null;
}

/**
 * A própria empresa e as do mesmo grupo econômico saem da lista.
 * Sem isso, "Raízen S.A." apareceria como compradora de "Raízen Energia S.A." —
 * são CNPJs distintos e subsegmentos distintos na classificação da CVM, o que
 * engana o critério de proximidade e produz a recomendação mais constrangedora
 * possível numa reunião.
 */
function _mesmoGrupo(a, b) {
  if (a.id === b.id) return true;
  const raizA = _raizCnpj(a);
  const raizB = _raizCnpj(b);
  return Boolean(raizA && raizB && raizA === raizB);
}

/* ---- 3. MOTOR DE MATCHMAKING ---------------------------------------------- */

function _pontuar(candidata, alvo, criterios, pesos) {
  const contribuicoes = [];
  let soma = 0;
  let pesoAplicado = 0;

  for (const chave in criterios) {
    const criterio = criterios[chave];
    const peso = pesos[chave] !== undefined ? Number(pesos[chave]) : criterio.pesoPadrao;
    if (!peso) continue;

    const nota = criterio.nota(candidata, alvo);
    if (nota === null || nota === undefined) {
      contribuicoes.push({ chave, rotulo: criterio.rotulo, peso, nota: null, semDado: true,
        descricao: criterio.descrever(candidata, alvo) });
      continue;
    }

    soma += nota * peso;
    pesoAplicado += peso;
    contribuicoes.push({
      chave, rotulo: criterio.rotulo, peso, nota,
      pontos: Math.round(nota * peso),
      descricao: criterio.descrever(candidata, alvo),
      proxy: Boolean(criterio.proxy),
    });
  }

  contribuicoes.sort((a, b) => (b.pontos || 0) - (a.pontos || 0));

  return {
    aderencia: pesoAplicado > 0 ? Math.round((soma / pesoAplicado) * 100) : 0,
    contribuicoes,
    pesoAplicado,
    /* Quantos critérios ficaram sem dado — a interface usa para avisar que a
       aderência foi calculada sobre base incompleta. */
    criteriosSemDado: contribuicoes.filter((c) => c.semDado).length,
  };
}

/**
 * Módulo 6, sell-side: dada uma empresa mandatada, quem pode comprá-la.
 *
 * `opcoes.criteriosAdicionais` aceita critérios declarativos do painel de
 * configuração (configuracao.js), permitindo restringir a busca na hora —
 * "só compradores do Sudeste", "só quem converte mais de 80% do EBITDA".
 */
function compradoresPara(alvo, avaliadas, opcoes) {
  const config = opcoes || {};
  const pesos = config.pesos || {};
  const limite = config.limite || 20;
  const adicionais = config.criteriosAdicionais || [];

  const candidatas = [];
  const descartadasPorCriterio = [];

  for (const candidata of avaliadas) {
    if (_mesmoGrupo(candidata, alvo)) continue;

    /* Critérios ad hoc funcionam como filtro duro aqui, não como peso: quando o
       usuário diz "só Sudeste", ele está recortando o universo, não
       expressando preferência. */
    let reprovada = null;
    for (const criterio of adicionais) {
      const resultado = window.CONFIGURACAO
        ? window.CONFIGURACAO.avaliarCriterio(candidata, criterio)
        : null;
      if (resultado !== true) {
        reprovada = {
          empresa: candidata,
          criterio: window.CONFIGURACAO ? window.CONFIGURACAO.descreverCriterio(criterio) : criterio.campo,
          motivo: resultado === null ? 'dado não publicado' : 'não atende',
        };
        break;
      }
    }
    if (reprovada) { descartadasPorCriterio.push(reprovada); continue; }

    const pontuacao = _pontuar(candidata, alvo, CRITERIOS_COMPRADOR, pesos);
    candidatas.push({ ...candidata, ...pontuacao });
  }

  candidatas.sort((a, b) => b.aderencia - a.aderencia);

  return {
    alvo,
    sentido: 'sell-side',
    candidatas: candidatas.slice(0, limite),
    totalAvaliadas: avaliadas.length,
    totalQualificadas: candidatas.length,
    descartadasPorCriterio,
    /* "dado não publicado" é a razão mais comum de descarte e a mais enganosa:
       a empresa pode atender e ninguém saber. Separado para a interface poder
       oferecer "ver as que ficaram de fora por falta de dado". */
    descartadasPorFaltaDeDado: descartadasPorCriterio.filter((d) => d.motivo === 'dado não publicado').length,
    pesos: _pesosEfetivos(CRITERIOS_COMPRADOR, pesos),
    limitacoes: LIMITACOES,
  };
}

/**
 * Módulo 6, buy-side: dado um comprador mandatado, quais alvos fazem sentido.
 *
 * Não é o inverso mecânico do sell-side. Aqui entram o índice de ALVO calculado
 * pelo motor e a faixa consolidável; a capacidade de absorção troca de lado
 * (o alvo precisa ser menor que o comprador, não maior).
 */
function alvosPara(comprador, avaliadas, opcoes) {
  const config = opcoes || {};
  const limite = config.limite || 20;
  const adicionais = config.criteriosAdicionais || [];
  const faixa = config.faixaReceita || { min: 30, max: 250 };

  const criterios = {
    proximidade: CRITERIOS_COMPRADOR.proximidade,
    porteAbsorvivel: {
      rotulo: 'Porte absorvível',
      explicacao: 'O alvo precisa caber no comprador. Acima de 1/3 da receita dele, a operação deixa de ser aquisição e vira fusão.',
      pesoPadrao: 25,
      fonte: 'CVM · conta 3.01 de ambas',
      nota: (alvoCandidato, compradorRef) => {
        if (!alvoCandidato.receita || !compradorRef.receita) return null;
        const fracao = alvoCandidato.receita / compradorRef.receita;
        if (fracao > 0.5) return 0;
        if (fracao <= 0.05) return 0.5;      // pequeno demais para mover o ponteiro
        if (fracao <= 0.33) return 1;
        return 1 - (fracao - 0.33) / 0.17;
      },
      descrever: (alvoCandidato, compradorRef) => {
        if (!alvoCandidato.receita || !compradorRef.receita) return 'Receita não publicada';
        return `Representa ${((alvoCandidato.receita / compradorRef.receita) * 100).toFixed(0)}% da receita do comprador`;
      },
    },
    indiceAlvo: {
      rotulo: 'Índice de alvo',
      explicacao: 'O score do papel "possível alvo de aquisição" calculado pelo motor.',
      pesoPadrao: 25,
      fonte: 'Motor de scoring · papel alvo',
      nota: (a) => (a.papeis && a.papeis.alvo ? a.papeis.alvo.score / 100 : null),
      descrever: (a) => (a.papeis && a.papeis.alvo ? `Índice de alvo ${a.papeis.alvo.score}/100` : 'Não avaliado'),
    },
    faixaConsolidavel: {
      rotulo: 'Faixa consolidável',
      explicacao: 'Receita entre R$ 30 e 250 mi — o recorte que a GHT4 trata como alvo típico.',
      pesoPadrao: 20,
      fonte: 'Derivado da receita (conta 3.01)',
      nota: (a) => {
        if (!a.receita) return null;
        return a.receita >= faixa.min && a.receita <= faixa.max ? 1 : 0.2;
      },
      descrever: (a) => (a.receita ? `Receita de R$ ${a.receita.toLocaleString('pt-BR')} mi` : 'Receita não publicada'),
    },
  };

  const candidatos = [];
  const descartadosPorCriterio = [];

  for (const candidato of avaliadas) {
    if (_mesmoGrupo(candidato, comprador)) continue;

    let reprovado = null;
    for (const criterio of adicionais) {
      const resultado = window.CONFIGURACAO
        ? window.CONFIGURACAO.avaliarCriterio(candidato, criterio)
        : null;
      if (resultado !== true) {
        reprovado = {
          empresa: candidato,
          criterio: window.CONFIGURACAO ? window.CONFIGURACAO.descreverCriterio(criterio) : criterio.campo,
          motivo: resultado === null ? 'dado não publicado' : 'não atende',
        };
        break;
      }
    }
    if (reprovado) { descartadosPorCriterio.push(reprovado); continue; }

    const pontuacao = _pontuar(candidato, comprador, criterios, config.pesos || {});
    candidatos.push({ ...candidato, ...pontuacao });
  }

  candidatos.sort((a, b) => b.aderencia - a.aderencia);

  return {
    alvo: comprador,
    sentido: 'buy-side',
    candidatas: candidatos.slice(0, limite),
    totalAvaliadas: avaliadas.length,
    totalQualificadas: candidatos.length,
    descartadasPorCriterio: descartadosPorCriterio,
    descartadasPorFaltaDeDado: descartadosPorCriterio.filter((d) => d.motivo === 'dado não publicado').length,
    pesos: _pesosEfetivos(criterios, config.pesos || {}),
    limitacoes: LIMITACOES,
  };
}

function _pesosEfetivos(criterios, sobrescritos) {
  const saida = {};
  for (const chave in criterios) {
    saida[chave] = sobrescritos[chave] !== undefined
      ? Number(sobrescritos[chave])
      : criterios[chave].pesoPadrao;
  }
  return saida;
}

/* ---- 4. LIMITAÇÕES DECLARADAS ---------------------------------------------- */
const LIMITACOES = [
  {
    titulo: 'Capacidade não é apetite',
    texto: 'A lista ordena por capacidade de comprar — porte, caixa, proximidade. Apetite declarado, tese de aquisição e mandato de fundo com prazo para alocar não são dados públicos e não entram no cálculo.',
    viaDeObtencao: 'Base proprietária da GHT4 e Módulo 4 (rede de conexões).',
  },
  {
    titulo: 'Histórico de aquisições ausente',
    texto: 'O documento pede "histórico de aquisições realizadas" como critério (seção 4.1). Não existe registro público consolidado disso no Brasil. O que está no lugar é o perfil societário, declarado como proxy.',
    viaDeObtencao: 'Capital IQ ou EMIS — transações precedentes por adquirente.',
  },
  {
    titulo: 'Só companhias abertas',
    texto: 'Compradores estratégicos de capital fechado e fundos de private equity não estão na base CVM. Numa lista real de compradores, eles são parte relevante — e aqui não aparecem.',
    viaDeObtencao: 'EMIS, associações setoriais e a rede da GHT4.',
  },
];

window.MATCHMAKING = {
  CRITERIOS_COMPRADOR, LIMITACOES,
  compradoresPara, alvosPara,
};
