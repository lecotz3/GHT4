/* =============================================================================
 *  GHT4 · Agente de Prospecção M&A — CAMADA DE EVIDÊNCIA (DEMONSTRATIVA)
 * -----------------------------------------------------------------------------
 *  ATENÇÃO: Todas as fontes abaixo são FICTÍCIAS. Veículos, títulos, datas e
 *  trechos foram inventados para demonstrar o CONCEITO de rastreabilidade.
 *  Nenhuma reportagem, registro público ou comunicado aqui existe de verdade.
 *
 *  POR QUE ESTE ARQUIVO EXISTE
 *  --------------------------
 *  A pesquisa Datasite/FT ("The New Deal Team", 2026) mostra que a citação até a
 *  fonte virou o padrão do mercado: 58% dos dealmakers aplicam revisão humana aos
 *  outputs e 43% exigem transparência sobre COMO o output foi gerado. Os dois
 *  casos citados no relatório (Freshfields Lab e Blueflame AI) implementam a
 *  mesma interface: a afirmação de um lado, o documento original do outro.
 *
 *  "Se estamos te dizendo o lucro operacional do ano passado, mostramos o trecho
 *   exato de onde aquilo veio, e te levamos até o documento."
 *                                        — Raj Bakhru, General Manager, Blueflame AI
 *
 *  TRÊS NATUREZAS DE EVIDÊNCIA
 *  ---------------------------
 *  O sistema distingue explicitamente de onde vem cada sinal. Isso é deliberado:
 *  um sinal lido numa notícia não tem o mesmo peso probatório de um número de
 *  balanço, e o usuário precisa enxergar essa diferença.
 *
 *    documental  -> veio de um documento externo (imprensa, registro público,
 *                   comunicado ao mercado). Tem veículo, data e trecho citável.
 *    estruturado -> veio de um indicador da própria ficha da empresa (receita,
 *                   crescimento, margem). A fonte é o registro financeiro.
 *    cadastral   -> veio do perfil societário (quadro de sócios, controle).
 *
 *  Quando não há fonte documental para um sinal que a exigiria, o sistema mostra
 *  isso como LACUNA — não esconde. Ver `evidenciaDe()` no fim do arquivo.
 * ========================================================================== */

/* ---- 1. EVIDÊNCIA SETORIAL -------------------------------------------------
 * O sinal "mercado fragmentado" é uma afirmação sobre o setor, não sobre a
 * empresa. Por isso a fonte é compartilhada por todas as empresas do setor.
 * -------------------------------------------------------------------------- */
const EVIDENCIA_SETORIAL = {
  'Saúde': {
    tipo: 'Estudo setorial',
    veiculo: 'Panorama de Consolidação em Saúde (estudo fictício)',
    titulo: 'Serviços de saúde seguem pulverizados fora dos grandes centros',
    data: '2026-04-02',
    confianca: 'Média',
    trecho: 'Os cinco maiores grupos respondem por menos de 18% do faturamento do setor de serviços de saúde no país. O restante está distribuído entre operadores regionais de capital fechado, a maioria com faturamento abaixo de R$ 150 milhões — configuração clássica de mercado consolidável.',
  },
  'Tecnologia': {
    tipo: 'Estudo setorial',
    veiculo: 'Mapa de Software Empresarial Brasil (estudo fictício)',
    titulo: 'Nichos verticais de software concentram centenas de operações subescala',
    data: '2026-03-18',
    confianca: 'Média',
    trecho: 'Segmentos verticais de software (logística, saúde, indústria) reúnem mais de 400 empresas com receita entre R$ 20 mi e R$ 100 mi. A ausência de um consolidador claro em cada vertical mantém o mercado fragmentado e sustenta teses de buy-and-build.',
  },
  'Varejo': {
    tipo: 'Estudo setorial',
    veiculo: 'Anuário do Varejo Regional (estudo fictício)',
    titulo: 'Redes regionais ainda dominam formatos de vizinhança',
    data: '2026-02-25',
    confianca: 'Média',
    trecho: 'Nos formatos de vizinhança e especializados, redes regionais de controle familiar detêm participação majoritária. A pressão de margem e a necessidade de investimento em digitalização vêm empurrando esses ativos para a mesa de negociação.',
  },
  'Energia': {
    tipo: 'Estudo setorial',
    veiculo: 'Boletim de Geração Distribuída (estudo fictício)',
    titulo: 'Geração distribuída e serviços de energia permanecem atomizados',
    data: '2026-05-06',
    confianca: 'Média',
    trecho: 'O elo de integração e serviços de energia reúne milhares de operadores locais, quase todos com faturamento inferior a R$ 50 milhões. A consolidação começou pelos maiores integradores, mas segue em estágio inicial.',
  },
};

/* ---- 2. EVIDÊNCIA POR EMPRESA ----------------------------------------------
 * Chaveada por id da empresa e depois pelo campo que a evidência sustenta.
 * Campos sustentados aqui: rodadaRecente, mudancaControle, expansaoGeografica.
 * -------------------------------------------------------------------------- */
const EVIDENCIA_EMPRESA = {
  /* ----------------------------- SAÚDE ----------------------------- */
  sa01: {
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Diário Regional de Campinas (fictício)', titulo: 'Vitalux abre duas unidades no interior paulista', data: '2026-04-28', confianca: 'Média',
      trecho: 'A rede inaugurou unidades em Piracicaba e Limeira no primeiro trimestre, elevando para nove o número de clínicas próprias. A diretora-geral afirmou que a companhia avalia "mais duas praças fora da região metropolitana" até o fim do ano.' },
  },
  sa02: {
    rodadaRecente: { tipo: 'Comunicado ao mercado', veiculo: 'Assessoria NovaSaúde Gestão (fictício)', titulo: 'NovaSaúde recebe aporte para acelerar plano de add-ons', data: '2026-05-20', confianca: 'Alta',
      trecho: 'O fundo controlador aprovou aporte adicional destinado exclusivamente a aquisições complementares. Segundo o comunicado, a companhia mapeou "entre seis e oito alvos regionais" em gestão hospitalar.' },
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Caderno de Negócios MG (fictício)', titulo: 'NovaSaúde assume gestão de hospital no Espírito Santo', data: '2026-05-29', confianca: 'Alta',
      trecho: 'O contrato marca a entrada do grupo mineiro no Espírito Santo, terceiro estado da operação. A empresa opera hoje 14 unidades em MG, BA e ES.' },
  },
  sa03: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Portal de Startups PR (fictício)', titulo: 'OdontoMais capta rodada Série A para dobrar rede de franquias', data: '2026-03-30', confianca: 'Baixa',
      trecho: 'A rede curitibana anunciou captação com fundo de venture capital nacional. O valor não foi divulgado. O fundador afirmou que o recurso será usado para "abrir 60 unidades em 24 meses". A informação não foi confirmada por fonte independente.' },
  },
  sa04: {
    mudancaControle: { tipo: 'Registro público', veiculo: 'Junta Comercial de Pernambuco (fictício)', titulo: 'Alteração contratual — redistribuição de quotas', data: '2026-02-14', confianca: 'Média',
      trecho: 'Averbada alteração do quadro societário com a saída de dois sócios da primeira geração e o ingresso de três herdeiros. A cláusula de administração passou a exigir deliberação conjunta, sinalizando arranjo sucessório ainda não estabilizado.' },
  },
  sa05: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Coluna de Tecnologia e Investimentos (fictício)', titulo: 'MedTech Prime fecha Série B de R$ 120 milhões', data: '2026-06-11', confianca: 'Alta',
      trecho: 'A rodada foi liderada pelo fundo já presente no capital, com participação de um investidor estrangeiro. A companhia informou que os recursos vão para expansão comercial e para a base tecnológica do produto.' },
    expansaoGeografica: { tipo: 'Site institucional', veiculo: 'medtechprime.com.br — sala de imprensa (fictício)', titulo: 'MedTech Prime abre escritório comercial no Sul', data: '2026-06-24', confianca: 'Média',
      trecho: 'Nota institucional informa a abertura de operação em Porto Alegre para atender operadoras da região Sul. É a segunda praça da empresa fora de São Paulo.' },
  },
  sa06: {
    expansaoGeografica: { tipo: 'Comunicado ao mercado', veiculo: 'Fato relevante — Grupo CuidarBem (fictício)', titulo: 'Aquisição de operação de home care no Paraná', data: '2026-05-22', confianca: 'Alta',
      trecho: 'A companhia comunica a aquisição da totalidade das quotas de operadora de atendimento domiciliar sediada em Londrina. É a quarta aquisição do grupo em 18 meses e a primeira fora da Região Sul imediata.' },
  },
  sa07: {
    mudancaControle: { tipo: 'Imprensa', veiculo: 'Economia Centro-Oeste (fictício)', titulo: 'Disputa entre herdeiros trava decisões na Farmácias Reviva', data: '2026-02-11', confianca: 'Baixa',
      trecho: 'Fontes próximas à família relatam impasse sobre a sucessão do fundador, com dois blocos de herdeiros divergindo sobre a abertura de capital. A empresa não comentou. Informação não confirmada por registro público.' },
  },

  /* --------------------------- TECNOLOGIA --------------------------- */
  tec01: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Portal de Venture Capital (fictício)', titulo: 'CloudNexo levanta rodada para consolidar ERPs verticais', data: '2026-05-30', confianca: 'Alta',
      trecho: 'A empresa paulista captou junto ao fundo controlador e a um novo investidor. Em entrevista, a CEO afirmou que parte relevante do recurso é destinada a "comprar players de nicho com base instalada".' },
    expansaoGeografica: { tipo: 'Site institucional', veiculo: 'cloudnexo.com.br — blog (fictício)', titulo: 'CloudNexo inaugura operação em Recife', data: '2026-06-09', confianca: 'Média',
      trecho: 'Post institucional anuncia novo centro de operações no Nordeste, com meta declarada de atender indústrias de médio porte da região.' },
  },
  tec02: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Caderno de Fintechs (fictício)', titulo: 'PagaFácil capta para acelerar expansão em PMEs', data: '2026-06-19', confianca: 'Média',
      trecho: 'A adquirente anunciou captação com investidores existentes. O valor não foi confirmado oficialmente; duas fontes de mercado indicam faixa entre R$ 200 mi e R$ 250 mi.' },
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Caderno de Fintechs (fictício)', titulo: 'PagaFácil chega ao Nordeste com operação própria', data: '2026-06-19', confianca: 'Média',
      trecho: 'Junto com a captação, a companhia informou a abertura de operação comercial em Fortaleza e Salvador, saindo do modelo exclusivamente remoto nessas praças.' },
  },
  tec04: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Boletim de Inovação Campinas (fictício)', titulo: 'DataForge recebe aporte semente de fundo regional', data: '2026-06-14', confianca: 'Baixa',
      trecho: 'A startup teria recebido aporte de fundo de estágio inicial, segundo relato do próprio fundador em evento do setor. Não houve comunicado formal nem confirmação do investidor.' },
  },
  tec05: {
    mudancaControle: { tipo: 'Registro público', veiculo: 'Junta Comercial do Rio de Janeiro (fictício)', titulo: 'Alteração de acordo de acionistas', data: '2026-05-07', confianca: 'Média',
      trecho: 'Registrada alteração no acordo de acionistas com inclusão de cláusula de arrastamento (drag-along) e definição de janela de liquidez para o investidor financeiro a partir do segundo semestre — indicativo típico de fim de ciclo de investimento.' },
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Segurança Digital Brasil (fictício)', titulo: 'SegNet abre segundo SOC, agora em São Paulo', data: '2026-05-19', confianca: 'Média',
      trecho: 'A companhia carioca inaugurou centro de operações de segurança na capital paulista, dobrando a capacidade de monitoramento e aproximando-se de clientes corporativos do eixo SP.' },
  },
  /* tec07 (EduPlay) — LACUNA PROPOSITAL.
     A ficha marca `mudancaControle: true`, mas nenhuma fonte foi anexada. Como
     esse sinal vale 35 pontos no papel "candidata a venda", a empresa aparece
     na lista com lastro FRÁGIL e alerta explícito. É o caso que os sócios
     precisam ver: uma classificação forte apoiada em afirmação não documentada.
     Não preencher. Existe para demonstrar o comportamento diante da ausência. */
  tec08: {
    expansaoGeografica: { tipo: 'Comunicado ao mercado', veiculo: 'Comunicado ao mercado — IndUS Software (fictício)', titulo: 'IndUS anuncia centro de desenvolvimento no México', data: '2026-06-01', confianca: 'Alta',
      trecho: 'A companhia comunicou a abertura de unidade em Monterrey para atender a indústria automotiva mexicana. É o primeiro movimento internacional do grupo e integra o plano de crescimento anunciado ao mercado.' },
  },

  /* ----------------------------- VAREJO ----------------------------- */
  var01: {
    mudancaControle: { tipo: 'Imprensa', veiculo: 'Caderno de Varejo (fictício)', titulo: 'Família Bernardes contrata assessoria para reorganização societária', data: '2026-04-22', confianca: 'Média',
      trecho: 'A rede paulista contratou assessoria financeira para estudar a profissionalização da gestão e a eventual venda de participação minoritária. A presidente confirmou o estudo, mas negou processo de venda de controle.' },
  },
  /* var02 (MercaBom) — LACUNA PROPOSITAL em `expansaoGeografica`.
     Gap leve: o sinal pesa 10 pontos no papel "alvo". Serve para mostrar que
     nem toda lacuna é grave — o sistema sinaliza sem alarmar. Não preencher. */
  var03: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Portal de Varejo & Consumo (fictício)', titulo: 'PetLar capta com fundo para dobrar número de lojas', data: '2026-06-17', confianca: 'Alta',
      trecho: 'A rede de Campinas anunciou captação destinada à abertura de lojas e à integração da operação de e-commerce. A fundadora afirmou que a companhia avalia "aquisições de redes locais de três a cinco lojas".' },
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Portal de Varejo & Consumo (fictício)', titulo: 'PetLar entra em Minas Gerais', data: '2026-06-17', confianca: 'Alta',
      trecho: 'Com a captação, a rede confirmou a abertura das primeiras unidades em Belo Horizonte e Uberlândia, saindo do estado de São Paulo pela primeira vez.' },
  },
  var04: {
    mudancaControle: { tipo: 'Registro público', veiculo: 'Junta Comercial do Rio Grande do Sul (fictício)', titulo: 'Alteração contratual — administração', data: '2026-02-20', confianca: 'Incompleto',
      trecho: 'Registrada substituição de administrador e alteração da cláusula de representação. O documento não detalha redistribuição de quotas; a leitura de mudança de controle é inferência da equipe e requer confirmação.' },
  },
  var05: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Portal de Varejo & Consumo (fictício)', titulo: 'NutriMarket recebe aporte para plano de expansão nacional', data: '2026-05-28', confianca: 'Média',
      trecho: 'O fundo controlador aportou recursos para financiar a abertura de lojas próprias fora do estado de São Paulo. A companhia projeta triplicar a rede em três anos.' },
    expansaoGeografica: { tipo: 'Site institucional', veiculo: 'nutrimarket.com.br — imprensa (fictício)', titulo: 'NutriMarket chega ao Rio de Janeiro e a Brasília', data: '2026-06-04', confianca: 'Média',
      trecho: 'Nota institucional confirma a inauguração das primeiras unidades fora de São Paulo, em shoppings do Rio de Janeiro e do Distrito Federal.' },
  },
  var07: {
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Economia Centro-Oeste (fictício)', titulo: 'BeloAtacado inaugura três unidades em Mato Grosso', data: '2026-05-26', confianca: 'Alta',
      trecho: 'A rede de atacarejo, controlada por fundo de private equity, abriu três lojas em Cuiabá e Rondonópolis. A direção informou que o plano prevê "entrada em dois novos estados até 2027".' },
  },
  var08: {
    mudancaControle: { tipo: 'Imprensa', veiculo: 'Coluna de Moda e Negócios (fictício)', titulo: 'Fundadora da Boutique Aurora estuda venda para grupo de luxo', data: '2026-04-03', confianca: 'Baixa',
      trecho: 'Segundo relato de uma fonte do setor, a fundadora teria mantido conversas preliminares com dois grupos internacionais de moda. A marca não comentou. Nenhum registro público confirma tratativas.' },
  },

  /* ----------------------------- ENERGIA ----------------------------- */
  ene01: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Boletim de Energia Renovável (fictício)', titulo: 'SolarPrime capta para consolidar integradores no Nordeste', data: '2026-06-10', confianca: 'Alta',
      trecho: 'A integradora cearense anunciou captação com o fundo controlador. O CEO afirmou que a estratégia é "comprar integradores locais de porte médio", com quatro operações já em negociação.' },
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Boletim de Energia Renovável (fictício)', titulo: 'SolarPrime abre filiais em três capitais', data: '2026-06-10', confianca: 'Alta',
      trecho: 'Junto com a captação, a empresa confirmou operações próprias em Recife, Salvador e Teresina, ampliando a cobertura para seis estados do Nordeste.' },
  },
  ene02: {
    expansaoGeografica: { tipo: 'Comunicado ao mercado', veiculo: 'Fato relevante — VentoNorte (fictício)', titulo: 'Aquisição de complexo eólico na Bahia', data: '2026-05-08', confianca: 'Alta',
      trecho: 'A companhia comunica a aquisição de participação majoritária em complexo eólico no oeste baiano. A operação amplia a capacidade instalada em 18% e marca a entrada da empresa no estado.' },
  },
  ene03: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Agro & Energia (fictício)', titulo: 'BioGera capta para novas plantas de biometano', data: '2026-06-16', confianca: 'Média',
      trecho: 'A empresa mineira anunciou captação junto a fundo de infraestrutura para viabilizar duas novas plantas junto a usinas parceiras. O valor não foi divulgado.' },
  },
  ene04: {
    mudancaControle: { tipo: 'Registro público', veiculo: 'Junta Comercial do Paraná (fictício)', titulo: 'Alteração contratual — cessão de quotas entre sócios', data: '2026-02-26', confianca: 'Incompleto',
      trecho: 'Averbada cessão de quotas entre membros da família controladora, com concentração da participação em dois sócios. O registro não esclarece se há terceiros envolvidos; a leitura de desinvestimento é hipótese da equipe.' },
  },
  /* ene05 (ComerLuz) — LACUNA PROPOSITAL em `expansaoGeografica`.
     A empresa é classificada como potencial COMPRADOR, papel em que esse sinal
     vale 15 pontos. Demonstra que a lacuna também afeta o lado comprador, não
     só os alvos. Não preencher. */
  ene07: {
    mudancaControle: { tipo: 'Imprensa', veiculo: 'Economia Campinas (fictício)', titulo: 'Grupo Trindade avalia venda do controle da GNVLog', data: '2026-02-05', confianca: 'Média',
      trecho: 'O grupo familiar contratou assessoria para avaliar a venda do controle da distribuidora, segundo duas fontes com conhecimento do processo. A empresa confirmou apenas que "estuda alternativas de capitalização".' },
  },
  ene08: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Portal de Deep Tech (fictício)', titulo: 'StorageX capta rodada para primeira linha de produção', data: '2026-06-30', confianca: 'Baixa',
      trecho: 'A empresa de São José dos Campos teria captado com um fundo de tecnologia climática, segundo relato em evento setorial. Não houve comunicado formal. Valor e investidor não confirmados.' },
  },
};

/* ---- 3. RESOLUÇÃO DE EVIDÊNCIA ---------------------------------------------
 * Dado um sinal e uma empresa, devolve a evidência que o sustenta — ou uma
 * lacuna explícita. Nunca devolve nada silenciosamente.
 * -------------------------------------------------------------------------- */

/** Formata um valor em reais vindo da CVM (que publica em unidades). */
function reais(v) {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `R$ ${(v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`;
  if (abs >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/* ---- evidência da base REAL (CVM) ------------------------------------------
 * Aqui a citação deixa de ser fictícia: aponta a conta contábil exata da
 * demonstração financeira entregue à CVM, com o valor publicado. É o mesmo
 * padrão do Blueflame ("mostramos o trecho exato de onde aquilo veio"), só que
 * o documento é uma DFP auditada em vez de uma notícia.
 * -------------------------------------------------------------------------- */
function evidenciaCvm(empresa, chave) {
  const c = empresa.cvm;
  const base = {
    natureza: 'estruturado',
    tipo: 'Demonstração financeira (DFP)',
    veiculo: `CVM · Dados Abertos — DFP consolidada, código CVM ${c.codigo}`,
    data: empresa.dataAtualizacao,
    confianca: empresa.confianca,
  };

  switch (chave) {
    case 'crescimento_relevante':
    case 'retracao_receita':
      return { ...base, escopo: 'empresa',
        titulo: 'Conta 3.01 — Receita de Venda de Bens e/ou Serviços',
        trecho: `Exercício encerrado em ${c.exercicio}: ${reais(c.receitaValor)}. `
              + `Exercício anterior: ${reais(c.receitaAnterior)}. `
              + `Variação de ${empresa.crescimento > 0 ? '+' : ''}${empresa.crescimento}%.` };

    case 'margem_baixa':
    case 'margem_alta':
    case 'prejuizo_operacional':
      return { ...base, escopo: 'empresa',
        titulo: 'Contas 3.05 e 7.04.01 — EBIT e depreciação/amortização',
        trecho: `EBIT (3.05, "Resultado Antes do Resultado Financeiro e dos Tributos"): ${reais(c.ebitValor)}. `
              + `Depreciação e amortização (DVA 7.04.01): ${reais(c.daValor)}. `
              + `EBITDA = ${reais((c.ebitValor || 0) + (c.daValor || 0))}, `
              + `sobre receita de ${reais(c.receitaValor)} → ${empresa.margemEbitda}%.` };

    case 'escala':
    case 'porte_medio':
      return { ...base, escopo: 'empresa',
        titulo: 'Conta 3.01 e Formulário de Referência',
        trecho: `Receita de ${reais(c.receitaValor)} no exercício ${c.exercicio}`
              + (empresa.funcionarios !== null && empresa.funcionarios !== undefined
                  ? `, com ${empresa.funcionarios.toLocaleString('pt-BR')} empregados declarados no Formulário de Referência.`
                  : '. Número de empregados não declarado no Formulário de Referência.') };

    case 'situacao_especial':
      return { ...base,
        natureza: 'documental', escopo: 'empresa',
        tipo: 'Registro público',
        veiculo: 'CVM · Cadastro de Companhias Abertas — campo SIT_EMISSOR',
        titulo: 'Situação do emissor',
        data: empresa.dataSituacaoEspecial || empresa.dataAtualizacao,
        trecho: `O regulador registra a companhia como "${empresa.situacaoEspecial}"`
              + (empresa.dataSituacaoEspecial ? `, situação iniciada em ${empresa.dataSituacaoEspecial}.` : '.') };

    case 'sucessao_familiar':
    case 'backing_pe':
      return { ...base, natureza: 'cadastral',
        tipo: 'Cadastro societário',
        veiculo: 'CVM · Cadastro de Companhias Abertas — campo CONTROLE_ACIONARIO',
        titulo: 'Estrutura de controle',
        trecho: `Controle acionário registrado como "${c.controle}". `
              + 'Companhia de capital aberto: não há janela de sucessão familiar nem ciclo de saída de fundo no sentido usado pelo modelo.' };

    default:
      return lacuna('Sinal sem regra de evidência definida para a base da CVM.');
  }
}

/** Evidência estruturada: o próprio registro financeiro da empresa. */
function evidenciaEstruturada(empresa, campos) {
  return {
    natureza: 'estruturado',
    tipo: 'Indicador estruturado',
    veiculo: `Ficha da empresa — ${empresa.origem.toLowerCase()}`,
    titulo: 'Registro de indicadores financeiros',
    data: empresa.dataAtualizacao,
    confianca: empresa.confianca,
    trecho: campos.map(c => c.rotulo + ': ' + c.valor).join(' · '),
  };
}

/** Evidência cadastral: o perfil societário registrado. */
function evidenciaCadastral(empresa) {
  return {
    natureza: 'cadastral',
    tipo: 'Cadastro societário',
    veiculo: 'Ficha da empresa — quadro societário',
    titulo: 'Perfil de controle',
    data: empresa.dataAtualizacao,
    confianca: empresa.confianca,
    trecho: `Controle classificado como "${empresa.perfil}".`,
  };
}

/** Lacuna: o sinal está ativo mas nada externo o documenta. */
function lacuna(motivo) {
  return {
    natureza: 'lacuna',
    tipo: 'Sem fonte documental',
    veiculo: '—',
    titulo: 'Lacuna de evidência',
    data: null,
    confianca: 'Incompleto',
    trecho: motivo,
  };
}

/**
 * Devolve a evidência que sustenta um sinal para uma empresa.
 * @param {object} empresa  registro da empresa
 * @param {string} chave    chave do sinal em SINAIS (scoring.js)
 */
function evidenciaDe(empresa, chave) {
  /* Base real: a proveniência vem da própria DFP, não do catálogo fictício. */
  if (empresa.fonteBase === 'cvm') {
    /* Os sinais de EVENTO não têm fonte pública aberta no Brasil. Em vez de
       fingir que o dado não existe, o sistema diz por que não existe — é a
       informação mais acionável desta tela para a decisão dos sócios. */
    if (chave === 'mercado_fragmentado')
      return lacuna('Não há fonte pública aberta que classifique concentração setorial. '
                  + 'Exigiria estudo setorial contratado ou base paga.');
    if (chave === 'rodada_investimento' || chave === 'mudanca_controle' || chave === 'expansao_geografica')
      return lacuna('Evento de mercado sem fonte pública estruturada. Dado aberto brasileiro '
                  + 'publica demonstrações financeiras, não acontecimentos societários — '
                  + 'esta é a camada que precisaria ser comprada ou construída.');
    return evidenciaCvm(empresa, chave);
  }

  const porEmpresa = EVIDENCIA_EMPRESA[empresa.id] || {};

  switch (chave) {
    case 'mercado_fragmentado': {
      const s = EVIDENCIA_SETORIAL[empresa.setor];
      return s
        ? { natureza: 'documental', escopo: 'setorial', ...s }
        : lacuna('Não há estudo setorial cadastrado para este setor.');
    }

    case 'rodada_investimento':
      return porEmpresa.rodadaRecente
        ? { natureza: 'documental', escopo: 'empresa', ...porEmpresa.rodadaRecente }
        : lacuna('O indicador de rodada recente está marcado na ficha, mas nenhuma fonte externa foi anexada. Confirmar antes de usar.');

    case 'mudanca_controle':
      return porEmpresa.mudancaControle
        ? { natureza: 'documental', escopo: 'empresa', ...porEmpresa.mudancaControle }
        : lacuna('O indicador de mudança de controle está marcado na ficha, mas nenhuma fonte externa foi anexada. Confirmar antes de usar.');

    case 'expansao_geografica':
      return porEmpresa.expansaoGeografica
        ? { natureza: 'documental', escopo: 'empresa', ...porEmpresa.expansaoGeografica }
        : lacuna('O indicador de expansão geográfica está marcado na ficha, mas nenhuma fonte externa foi anexada. Confirmar antes de usar.');

    case 'sucessao_familiar':
    case 'backing_pe':
      return evidenciaCadastral(empresa);

    case 'crescimento_relevante':
      return evidenciaEstruturada(empresa, [{ rotulo: 'Crescimento de receita', valor: empresa.crescimento + '% a.a.' }]);

    case 'margem_baixa':
    case 'margem_alta':
    case 'prejuizo_operacional':
      return evidenciaEstruturada(empresa, [{ rotulo: 'Margem EBITDA', valor: empresa.margemEbitda + '%' }]);

    case 'escala':
    case 'porte_medio':
      return evidenciaEstruturada(empresa, [
        { rotulo: 'Receita estimada', valor: 'R$ ' + empresa.receita + ' mi' },
        { rotulo: 'Funcionários', valor: String(empresa.funcionarios) },
      ]);

    default:
      return lacuna('Sinal sem regra de evidência definida.');
  }
}

/* ---- 4. O QUE A BASE NÃO CONSEGUE AVALIAR ----------------------------------
 * Um sinal desligado é ambíguo: pode significar "verifiquei e não há" ou
 * "não tenho como verificar". A diferença é decisiva para a GHT4 — a segunda
 * é uma lacuna de FONTE, não um fato sobre a empresa, e é ela que define qual
 * camada de dados precisa ser comprada ou construída.
 * -------------------------------------------------------------------------- */
const SINAIS_SEM_FONTE_PUBLICA = {
  mercado_fragmentado: 'Concentração setorial não é publicada por nenhuma fonte aberta. '
    + 'Exigiria estudo setorial contratado ou base paga.',
  rodada_investimento: 'Captações de empresas fechadas não têm registro público obrigatório.',
  mudanca_controle: 'Alterações societárias ficam em juntas comerciais estaduais, sem base '
    + 'nacional consolidada e consultável em massa.',
  expansao_geografica: 'Abertura de filial só apareceria em imprensa ou no cadastro de CNPJ, '
    + 'nenhum dos dois estruturado como evento.',
};

/**
 * Para uma empresa, quais sinais o sistema não teve como avaliar por ausência
 * de fonte — distinto dos sinais que avaliou e deu negativo.
 */
function sinaisIndisponiveis(empresa) {
  if (empresa.fonteBase !== 'cvm') return [];
  return Object.entries(SINAIS_SEM_FONTE_PUBLICA).map(([chave, motivo]) => ({ chave, motivo }));
}

/** Resumo de cobertura: quantos sinais ativos têm fonte documental. */
function coberturaEvidencia(empresa, sinaisAtivos) {
  let documentados = 0, estruturados = 0, lacunas = 0;
  for (const s of sinaisAtivos) {
    const ev = evidenciaDe(empresa, s.chave);
    if (ev.natureza === 'documental') documentados++;
    else if (ev.natureza === 'lacuna') lacunas++;
    else estruturados++;
  }
  return { documentados, estruturados, lacunas, total: sinaisAtivos.length };
}

window.EVIDENCIA = {
  EVIDENCIA_SETORIAL, EVIDENCIA_EMPRESA, SINAIS_SEM_FONTE_PUBLICA,
  evidenciaDe, coberturaEvidencia, sinaisIndisponiveis,
};
