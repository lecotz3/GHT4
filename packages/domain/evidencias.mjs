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
/* Chaveado por SUBSETOR, não por setor. Com um único setor foco, a evidência
   setorial só é útil se descer ao subsetor — "o setor químico é fragmentado"
   não é afirmação verificável, e "a distribuição química é fragmentada" é. */
const EVIDENCIA_SETORIAL = {
  'Distribuição e trading químico': {
    tipo: 'Estudo setorial',
    veiculo: 'Panorama da Distribuição Química no Brasil (estudo fictício)',
    titulo: 'Distribuição química segue pulverizada fora do eixo Sudeste',
    data: '2026-05-14',
    confianca: 'Média',
    trecho: 'Os cinco maiores distribuidores respondem por menos de 30% do volume movimentado no país. O restante está distribuído entre mais de novecentos operadores regionais de capital fechado, a maioria com faturamento abaixo de R$ 150 milhões e um único centro de distribuição — configuração que sustentou dezenas de aquisições de consolidadores globais na última década.',
  },
  'Especialidades e aditivos': {
    tipo: 'Estudo setorial',
    veiculo: 'Mapa de Especialidades Químicas (estudo fictício)',
    titulo: 'Formuladores de nicho concentram centenas de operações subescala',
    data: '2026-04-22',
    confianca: 'Média',
    trecho: 'O elo de especialidades e aditivos reúne mais de seiscentas empresas com receita entre R$ 20 mi e R$ 250 mi, quase todas de controle familiar ou fundador. A margem média do grupo, de 18%, é a maior da cadeia química brasileira, e nenhum consolidador nacional detém participação de dois dígitos.',
  },
  'Tintas, vernizes e revestimentos': {
    tipo: 'Estudo setorial',
    veiculo: 'Anuário de Tintas e Revestimentos (estudo fictício)',
    titulo: 'Fora das quatro grandes, o segmento é regional e de marca própria',
    data: '2026-03-30',
    confianca: 'Média',
    trecho: 'As quatro maiores fabricantes concentram cerca de 60% do volume imobiliário. O restante pertence a fabricantes regionais com marca própria e penetração estadual, e ao segmento industrial de especificação técnica, onde a fragmentação é ainda maior.',
  },
  'Domissanitários e produtos de limpeza': {
    tipo: 'Estudo setorial',
    veiculo: 'Boletim de Saneantes e Limpeza Profissional (estudo fictício)',
    titulo: 'Limpeza profissional cresce acima do doméstico e permanece atomizada',
    data: '2026-05-02',
    confianca: 'Média',
    trecho: 'O canal profissional e institucional cresce acima do doméstico e reúne formuladores de pequeno porte com contrato recorrente. O canal doméstico de marca própria, ao contrário, opera com margem estrutural baixa e está exposto ao poder de compra do varejo.',
  },
  'Inorgânicos e gases industriais': {
    tipo: 'Estudo setorial',
    veiculo: 'Panorama de Gases Industriais (estudo fictício)',
    titulo: 'Gases industriais se organizam por praça, e a praça é comprável',
    data: '2026-04-11',
    confianca: 'Média',
    trecho: 'O raio econômico de entrega de gases envasados raramente ultrapassa 300 km, o que fragmenta o mercado geograficamente. Operadores regionais independentes mantêm participação relevante fora dos grandes centros, com contratos de fornecimento de longo prazo.',
  },
  'Fertilizantes e nutrição vegetal': {
    tipo: 'Estudo setorial',
    veiculo: 'Cadeia de Fertilizantes — leitura de estrutura (estudo fictício)',
    titulo: 'Matéria-prima concentrada, mistura e distribuição pulverizadas',
    data: '2026-05-20',
    confianca: 'Média',
    trecho: 'A oferta de matéria-prima é importada e concentrada em poucos grupos, mas as unidades de mistura e a distribuição regional somam centenas de operadores independentes próximos ao produtor rural. É nesse elo, e não na matéria-prima, que se concentram as transações de porte médio.',
  },
  'Defensivos agrícolas': {
    tipo: 'Estudo setorial',
    veiculo: 'Boletim de Defensivos Pós-Patente (estudo fictício)',
    titulo: 'Formuladores independentes ganham espaço no pós-patente',
    data: '2026-04-27',
    confianca: 'Média',
    trecho: 'A expiração de patentes de moléculas de grande volume abriu espaço para formuladores independentes com registro próprio. O custo e o prazo de obtenção do registro no órgão regulador funcionam como barreira de entrada e transformam a carteira de registros no principal ativo dessas empresas.',
  },
  'Resinas, elastômeros e fibras': {
    tipo: 'Estudo setorial',
    veiculo: 'Leitura do Ciclo Petroquímico (estudo fictício)',
    titulo: 'Segunda geração é intensiva em escala e sensível ao ciclo',
    data: '2026-03-12',
    confianca: 'Média',
    trecho: 'A produção de resinas exige escala mínima elevada e opera com margem oscilante conforme o spread da nafta e o câmbio. O número de produtores é pequeno, e a consolidação já ocorreu — resta espaço apenas em termofixos e compostos de nicho.',
  },
};

/* ---- 2. EVIDÊNCIA POR EMPRESA ----------------------------------------------
 * Chaveada por id da empresa e depois pelo campo que a evidência sustenta.
 * Campos sustentados aqui: rodadaRecente, mudancaControle, expansaoGeografica.
 *
 * NOTA SOBRE OS VEÍCULOS: em química, os documentos que sustentam evento
 * societário são diferentes dos de outros setores. Junta comercial, licença
 * ambiental, registro no MAPA e comunicado de fornecedor sobre carta de
 * distribuição valem mais do que imprensa de negócios — o setor quase não sai
 * no jornal. As fontes abaixo refletem isso, mesmo sendo fictícias.
 * -------------------------------------------------------------------------- */
const EVIDENCIA_EMPRESA = {
  /* ------------------- DISTRIBUIÇÃO E TRADING QUÍMICO ------------------- */
  dis01: {
    mudancaControle: { tipo: 'Registro público', veiculo: 'Junta Comercial de São Paulo (fictício)', titulo: 'Alteração contratual — administração e cláusula de sucessão', data: '2026-05-28', confianca: 'Média',
      trecho: 'Averbada alteração que institui administração conjunta e cláusula de preferência entre os quotistas em caso de alienação. O sócio fundador, único administrador desde 1987, deixa de figurar como administrador isolado. Nenhum herdeiro consta do quadro societário.' },
  },
  dis03: {
    expansaoGeografica: { tipo: 'Registro público', veiculo: 'Cadastro CNPJ — Receita Federal (fictício)', titulo: 'Abertura de estabelecimento filial em Curitiba (PR)', data: '2026-06-16', confianca: 'Alta',
      trecho: 'Registrada inscrição de estabelecimento filial com CNAE principal 4684-2/99 em Curitiba. É a primeira unidade da empresa fora do Rio Grande do Sul, e a data de início de atividade consta como 02/06/2026.' },
  },
  dis04: {
    rodadaRecente: { tipo: 'Registro público', veiculo: 'Junta Comercial de São Paulo (fictício)', titulo: 'Aumento de capital social com ingresso de sócio investidor', data: '2026-06-24', confianca: 'Alta',
      trecho: 'Averbado aumento de capital social de R$ 42 mi para R$ 118 mi, com subscrição integral por fundo de investimento em participações já presente no quadro. A destinação declarada é "aquisição de participações societárias em empresas do mesmo ramo".' },
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Boletim Logístico Portuário (fictício)', titulo: 'Polimix arrenda armazém alfandegado em Itajaí', data: '2026-06-30', confianca: 'Alta',
      trecho: 'A trading assinou contrato de arrendamento de área alfandegada no complexo portuário de Itajaí, segunda base após Santos. A direção informou que a unidade atenderá clientes do Sul sem passar por São Paulo.' },
  },
  dis06: {
    expansaoGeografica: { tipo: 'Registro público', veiculo: 'Cadastro CNPJ — Receita Federal (fictício)', titulo: 'Abertura de estabelecimento filial em São José dos Pinhais (PR)', data: '2026-06-11', confianca: 'Alta',
      trecho: 'Inscrito estabelecimento filial com atividade de comércio atacadista de produtos químicos. É a terceira unidade do grupo e a primeira fora de Santa Catarina.' },
  },
  /* dis07 (Interquímica) — LACUNA PROPOSITAL.
     A ficha marca `mudancaControle: true`, mas nenhuma fonte foi anexada. Como
     esse sinal vale 35 pontos no papel "candidata a venda", a empresa aparece
     na lista com lastro FRÁGIL e alerta explícito. É o caso que a diretoria
     precisa ver: uma classificação forte apoiada em afirmação não documentada.
     Não preencher. Existe para demonstrar o comportamento diante da ausência. */

  /* ---------------------- ESPECIALIDADES E ADITIVOS --------------------- */
  esp02: {
    rodadaRecente: { tipo: 'Imprensa', veiculo: 'Caderno de Inovação Industrial (fictício)', titulo: 'Catalix recebe aporte de fundo de tecnologia industrial', data: '2026-06-18', confianca: 'Média',
      trecho: 'A empresa de Paulínia anunciou captação junto a fundo especializado em tecnologia industrial. O valor não foi divulgado. A fundadora afirmou que o recurso será aplicado na ampliação da planta-piloto e no depósito de duas novas patentes.' },
  },
  esp03: {
    expansaoGeografica: { tipo: 'Comunicado ao mercado', veiculo: 'Comunicado — Adminas Aditivos (fictício)', titulo: 'Adminas conclui aquisição de formulador em Recife', data: '2026-06-27', confianca: 'Alta',
      trecho: 'A companhia comunica a conclusão da aquisição da totalidade das quotas de formulador de aditivos sediado em Recife. É a terceira aquisição em 20 meses e a primeira no Nordeste, ampliando a operação para cinco estados.' },
  },
  esp04: {
    mudancaControle: { tipo: 'Registro público', veiculo: 'Junta Comercial do Rio Grande do Sul (fictício)', titulo: 'Alteração contratual — redistribuição de quotas entre herdeiros', data: '2026-04-09', confianca: 'Média',
      trecho: 'Averbada redistribuição de quotas com a saída da sócia fundadora da administração e o ingresso de três herdeiros com participações iguais. A cláusula de administração passou a exigir deliberação conjunta, arranjo que costuma anteceder impasse ou venda.' },
  },
  /* esp05 (Tecnoquímica) — LACUNA PROPOSITAL em `expansaoGeografica`.
     Gap leve: o sinal pesa 10 pontos no papel "alvo". Serve para mostrar que
     nem toda lacuna é grave — o sistema sinaliza sem alarmar. Não preencher. */

  /* ------------------ TINTAS, VERNIZES E REVESTIMENTOS ------------------ */
  tin01: {
    mudancaControle: { tipo: 'Imprensa', veiculo: 'Economia Bahia (fictício)', titulo: 'Família Nascimento contrata assessoria para avaliar venda de participação', data: '2026-05-07', confianca: 'Média',
      trecho: 'A controladora da Coralina contratou assessoria financeira para estudar a venda de participação minoritária e a profissionalização da gestão. O presidente confirmou o estudo e negou processo de venda de controle.' },
  },
  tin02: {
    expansaoGeografica: { tipo: 'Site institucional', veiculo: 'revestsul.com.br — sala de imprensa (fictício)', titulo: 'RevestSul abre centro de distribuição em Cuiabá', data: '2026-06-13', confianca: 'Média',
      trecho: 'Nota institucional informa a abertura de centro de distribuição em Cuiabá para atender fabricantes de implementos agrícolas do Centro-Oeste. É a primeira operação da empresa fora da Região Sul.' },
  },

  /* --------------- DOMISSANITÁRIOS E PRODUTOS DE LIMPEZA --------------- */
  dom01: {
    /* LACUNA PROPOSITAL em `rodadaRecente`: a ficha marca o sinal, e nenhuma
       fonte o sustenta. Terceira e última lacuna deliberada da base. Aqui ela
       atinge uma empresa classificada como COMPRADORA — mostra que a ausência
       de evidência também degrada o lado buy-side, não só a lista de alvos.
       Não preencher. */
    expansaoGeografica: { tipo: 'Registro público', veiculo: 'Cadastro CNPJ — Receita Federal (fictício)', titulo: 'Abertura de estabelecimento filial em Goiânia (GO)', data: '2026-06-05', confianca: 'Alta',
      trecho: 'Inscrito estabelecimento filial com atividade de fabricação de produtos de limpeza e polimento em Goiânia. É a segunda unidade fabril do grupo e a primeira fora do estado de São Paulo.' },
  },

  /* ------------------ INORGÂNICOS E GASES INDUSTRIAIS ------------------ */
  gas01: {
    mudancaControle: { tipo: 'Registro público', veiculo: 'Junta Comercial do Rio de Janeiro (fictício)', titulo: 'Alteração de acordo de quotistas — cláusula de arrastamento', data: '2026-05-31', confianca: 'Média',
      trecho: 'Registrada alteração do acordo de quotistas com inclusão de cláusula de arrastamento (drag-along) e definição de janela de liquidez a partir do segundo semestre de 2027 — arranjo típico de preparação para venda de controle.' },
  },
  gas02: {
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Diário do Centro-Oeste (fictício)', titulo: 'OxiCentro inaugura base de envase em Palmas', data: '2026-05-21', confianca: 'Média',
      trecho: 'A empresa goiana inaugurou base de envase e distribuição em Palmas, ampliando o raio de atendimento para o Tocantins e o sul do Pará. A diretora-geral afirmou que a unidade "reduz em 400 km a distância média de entrega" na região.' },
  },

  /* ----------------- FERTILIZANTES E NUTRIÇÃO VEGETAL ------------------ */
  fer01: {
    expansaoGeografica: { tipo: 'Imprensa', veiculo: 'Agro Notícias MT (fictício)', titulo: 'NutriCampo inaugura unidade de mistura em Balsas (MA)', data: '2026-06-29', confianca: 'Alta',
      trecho: 'A misturadora de Rondonópolis inaugurou unidade em Balsas, no Maranhão, para atender a fronteira agrícola do Matopiba. É a primeira operação da empresa fora do Mato Grosso e a quarta unidade de mistura do grupo.' },
  },
  fer02: {
    rodadaRecente: { tipo: 'Registro público', veiculo: 'Junta Comercial de Goiás (fictício)', titulo: 'Aumento de capital social com ingresso de fundo', data: '2026-06-20', confianca: 'Alta',
      trecho: 'Averbado aumento de capital de R$ 28 mi para R$ 96 mi, subscrito por fundo de investimento em participações. O instrumento declara como destinação a "aquisição de unidades de mistura de fertilizantes no Centro-Oeste".' },
  },

  /* ------------------------ DEFENSIVOS AGRÍCOLAS ----------------------- */
  def01: {
    mudancaControle: { tipo: 'Imprensa', veiculo: 'Canal Agro & Insumos (fictício)', titulo: 'Sócios da Defenza negociam entrada de investidor', data: '2026-06-04', confianca: 'Média',
      trecho: 'Duas fontes com conhecimento do processo relatam que os sócios da formuladora paranaense negociam a venda de participação relevante a um grupo asiático interessado na carteira de registros. A empresa informou apenas que "avalia alternativas de capitalização".' },
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
    /* Consolidada e individual não descrevem o mesmo perímetro econômico: a
       primeira soma as controladas, a segunda não. Quem lê o dossiê precisa
       saber qual das duas está sustentando o número. */
    veiculo: `CVM · Dados Abertos — DFP ${c.demonstrativo || 'consolidada'}, código CVM ${c.codigo}`,
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

    /* ---- critérios de triagem: cada um cita a conta que o sustenta -------- */
    case 'balanco_desalavancado':
    case 'alavancagem_elevada':
    case 'caixa_liquido':
      return { ...base, escopo: 'empresa',
        titulo: `Contas ${c.dividaContas} e ${c.caixaContas} — endividamento e caixa`,
        trecho: `Empréstimos e financiamentos (${c.dividaContas}): ${reais(c.dividaBrutaValor)}. `
              + `Caixa e aplicações financeiras (${c.caixaContas}): ${reais(c.caixaValor)}. `
              + `Dívida líquida: ${reais(c.dividaLiquidaValor)}, `
              + `equivalente a ${empresa.alavancagem}× o EBITDA do exercício.` };

    case 'aperto_liquidez':
      return { ...base, escopo: 'empresa',
        titulo: `Contas ${c.circulanteContas} — ativo e passivo circulantes`,
        trecho: `Ativo circulante (1.01): ${reais(c.ativoCirculante)}. `
              + `Passivo circulante (2.01): ${reais(c.passivoCirculante)}. `
              + `Liquidez corrente de ${empresa.liquidezCorrente}.` };

    case 'conversao_caixa_alta':
      return { ...base, escopo: 'empresa',
        titulo: `Conta ${c.fcoConta} — Caixa Líquido das Atividades Operacionais`,
        trecho: `Caixa gerado pela operação: ${reais(c.fcoValor)}, `
              + `contra EBITDA de ${reais((c.ebitValor || 0) + (c.daValor || 0))} `
              + `→ ${empresa.conversaoCaixa}% de conversão.` };

    case 'capital_intensivo':
      return { ...base, escopo: 'empresa',
        titulo: `Conta ${c.investimentoConta} — Caixa Líquido das Atividades de Investimento`,
        trecho: `Investimento líquido de ${reais(Math.abs(c.investimentoValor || 0))} `
              + `sobre receita de ${reais(c.receitaValor)} → ${empresa.intensidadeInvestimento}%. `
              + 'A conta 6.02 agrega imobilizado, intangível, aquisições e aplicações financeiras: '
              + 'é intensidade de investimento, não capex isolado.' };

    case 'contingencias_relevantes':
      return { ...base, escopo: 'empresa',
        titulo: `Contas ${c.contingenciasContas} sobre ${c.plConta}`,
        trecho: `Obrigações sociais e trabalhistas, obrigações fiscais e provisões somam `
              + `${reais(c.contingenciasValor)}, contra patrimônio líquido de ${reais(c.plValor)} `
              + `→ ${empresa.contingenciasSobrePl}%. `
              + 'Atenção ao alcance: o balanço registra o que já foi provisionado. '
              + 'Passivo trabalhista e fiscal ainda não reconhecido não aparece em nenhuma conta — '
              + 'é exatamente o que a due diligence vai procurar.' };

    case 'patrimonio_negativo':
      return { ...base, escopo: 'empresa',
        titulo: `Conta ${c.plConta} — Patrimônio Líquido`,
        trecho: `Patrimônio líquido de ${reais(c.plValor)} no exercício ${c.exercicio}: negativo.` };

    case 'margem_em_expansao':
    case 'margem_em_deterioracao':
      return { ...base, escopo: 'empresa',
        titulo: 'Contas 3.05 e 7.04.01 — dois exercícios',
        trecho: `Margem EBITDA de ${empresa.margemEbitda}% no exercício ${c.exercicio}, `
              + `contra ${(empresa.margemEbitda - empresa.variacaoMargem).toFixed(1)}% no anterior `
              + `→ variação de ${empresa.variacaoMargem > 0 ? '+' : ''}${empresa.variacaoMargem} p.p. `
              + 'Ambos os exercícios saem da mesma DFP, na mesma base de consolidação.' };

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
      /* Subsetor primeiro, setor como fallback. Com um setor foco único, a
         evidência que vale é sempre a do subsetor — dizer que "o setor químico
         é fragmentado" mistura distribuição, que é pulverizada, com petroquímica
         básica, que tem três donos. */
      const s = EVIDENCIA_SETORIAL[empresa.subsetor] || EVIDENCIA_SETORIAL[empresa.setor];
      return s
        ? { natureza: 'documental', escopo: 'setorial', ...s }
        : lacuna('Não há estudo setorial cadastrado para este subsetor.');
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

/* ---- 4b. CRITÉRIOS DE TRIAGEM QUE NENHUMA BASE PÚBLICA RESPONDE ------------
 * Os quatro abaixo aparecem em praticamente toda descrição de screening de
 * boutique e de private equity — e nenhum deles existe em fonte aberta, nem
 * mesmo para companhia de capital aberto. Diferem dos sinais de EVENTO acima:
 * aqueles faltam por ausência de registro público de acontecimentos; estes
 * faltam porque são informação interna, que só chega via data room, entrevista
 * com o controlador ou base proprietária.
 *
 * O agente os exibe declarados, com o motivo e a via de obtenção. Um critério
 * silenciado parece critério atendido — e é assim que uma triagem gera falso
 * positivo. Esta lista é, na prática, a pauta da primeira reunião com o alvo.
 * -------------------------------------------------------------------------- */
const CRITERIOS_SEM_FONTE = [
  {
    chave: 'concentracao_clientes',
    rotulo: 'Concentração de clientes',
    peso: 'Cliente único acima de 10% da receita é sinalizado como risco em '
        + 'quality of earnings; acima de 25% costuma travar ou redesenhar o deal.',
    motivo: 'A DFP não abre receita por cliente. A nota explicativa de segmentos, quando existe, '
          + 'agrupa por linha de negócio ou geografia — nunca por cliente.',
    via: 'Data room: relatório de faturamento por cliente dos últimos 24 meses.',
  },
  {
    chave: 'receita_recorrente',
    rotulo: 'Receita recorrente e retenção',
    peso: 'Receita contratada/recorrente acima de 60% muda o múltiplo pago. '
        + 'Churn e renovação são o que sustenta a projeção do comprador.',
    motivo: 'A conta 3.01 traz receita total, sem separar contrato recorrente de venda avulsa. '
          + 'Não há conta padronizada para isso.',
    via: 'Data room: carteira de contratos, prazo médio, taxa de renovação e churn.',
  },
  {
    chave: 'dependencia_fundador',
    rotulo: 'Dependência do fundador',
    peso: 'Operação que gira em torno de uma pessoa vira risco de execução no '
        + 'pós-transação e costuma virar cláusula de earn-out ou lock-up.',
    motivo: 'O cadastro da CVM traz o nome do DRI, não o grau de dependência operacional. '
          + 'Nenhum campo público mede isso.',
    via: 'Entrevista com o controlador e mapeamento da segunda linha de gestão.',
  },
  {
    chave: 'passivo_oculto',
    rotulo: 'Passivo trabalhista e fiscal não provisionado',
    peso: 'Apontado como o principal "deal killer" do middle market brasileiro: '
        + 'aparece na diligência e é descontado direto do preço.',
    motivo: 'O balanço registra o que já foi provisionado (contas 2.01.01, 2.01.03, 2.01.06 e '
          + '2.02.04 — o agente calcula esse pedaço). O não provisionado, por definição, não está lá.',
    via: 'Diligência trabalhista e fiscal: certidões, processos ativos, parcelamentos '
       + '(REFIS/PERT), FGTS e INSS dos últimos 5 anos.',
  },
];

/**
 * Critérios de triagem que o agente reconhece como relevantes e declara não ter
 * como avaliar. Valem para as duas bases: a fictícia também não os modela.
 */
function criteriosNaoAvaliados() {
  return CRITERIOS_SEM_FONTE;
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

export {
  EVIDENCIA_SETORIAL, EVIDENCIA_EMPRESA, SINAIS_SEM_FONTE_PUBLICA, CRITERIOS_SEM_FONTE,
  evidenciaDe, coberturaEvidencia, sinaisIndisponiveis, criteriosNaoAvaliados,
};
