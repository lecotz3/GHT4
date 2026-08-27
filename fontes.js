/* =============================================================================
 *  GHT4 · CATÁLOGO DE BASES DE DADOS DO SETOR QUÍMICO
 * -----------------------------------------------------------------------------
 *  O protótipo provou uma coisa desconfortável: a base pública que ele usava
 *  (CVM, 537 companhias abertas) tem SETE empresas no setor químico. Sete. Não é
 *  base pequena — é ausência de base. Filtrar sete registros não é originação.
 *
 *  Este arquivo é a resposta: o mapa das bases que cobrem o setor químico
 *  brasileiro de verdade, cada uma com o que entrega, o que NÃO entrega, quanto
 *  custa e por onde se acessa. Mesmo padrão do resto do projeto — a régua fica à
 *  mostra, e o que falta é declarado em vez de omitido.
 *
 *  O DESENHO EM UMA FRASE
 *  Uma base dá o UNIVERSO (quem existe), outra dá o PORTE (quanto fatura), uma
 *  terceira dá o EVENTO (o que mudou) e uma quarta dá o PREÇO (por quanto se
 *  negocia). Nenhuma dá as quatro. O agente vale exatamente pelo cruzamento.
 *
 *  A DESCOBERTA QUE MUDA O PROJETO
 *  O README registra como limitação estrutural que "dado público brasileiro
 *  publica números, não eventos" — e que rodada, mudança de controle e expansão
 *  geográfica não existiriam em fonte aberta. Isso é verdade para a CVM e falso
 *  para o CNPJ: o cadastro é republicado todo mês, e a DIFERENÇA entre dois
 *  meses é um registro de eventos societários. Entrada e saída de sócio é
 *  mudança de controle. Abertura de filial em outra UF é expansão geográfica.
 *  Aumento de capital social é aporte. Ver `delta_cnpj` — é a fonte de maior
 *  retorno sobre esforço do catálogo inteiro, e é gratuita.
 *
 *  E não é preciso esperar para colher: a Receita mantém os meses anteriores
 *  publicados. Havia 40 meses no repositório na verificação desta sessão, de
 *  2023-05 a 2026-08. Três anos de eventos societários do setor químico podem
 *  ser reconstruídos numa tarde.
 * ========================================================================== */

/* Papéis que uma fonte pode cumprir no pipeline. Uma fonte pode ter mais de um,
   mas a maioria só faz bem um deles — e confundir os papéis é o erro clássico:
   base de descoberta usada como base de porte produz lista com faturamento
   inventado. */
const PAPEIS = {
  universo:      'Define quem existe. É de onde a lista nasce.',
  porte:         'Diz o tamanho. Receita, funcionários, capacidade.',
  evento:        'Diz o que mudou. É o que antecipa transação.',
  qualificacao:  'Confirma que a empresa é mesmo o que o cadastro diz.',
  comparaveis:   'Dá preço: múltiplos, transações precedentes.',
  dimensionamento: 'Dá o tamanho do mercado, não da empresa. Serve para tese, não para lista.',
};

const FONTES = {

  /* =========================================================================
   *  A ESPINHA DORSAL
   * ====================================================================== */
  cnpj_rfb: {
    rotulo: 'Cadastro Nacional da Pessoa Jurídica — dados abertos',
    orgao: 'Receita Federal do Brasil',
    tipo: 'aberta',
    papel: ['universo', 'evento'],
    prioridade: 1,
    cobertura: 'Todas as pessoas jurídicas do país, ativas e baixadas — dezenas de milhões de estabelecimentos. No recorte químico do escopo, a ordem de grandeza esperada é de 20 a 30 mil CNPJs ativos (a contagem exata sai na primeira ingestão).',
    entrega: [
      'CNPJ, razão social e nome fantasia',
      'CNAE principal e TODOS os secundários — o secundário é o que revela o distribuidor que se cadastrou como comércio geral',
      'Endereço completo, município e UF, por estabelecimento (matriz e filiais)',
      'Data de início de atividade e situação cadastral com data e motivo',
      'Capital social e porte declarado',
      'Natureza jurídica (Ltda., S.A. fechada, S.A. aberta, Eireli)',
      'Quadro societário: nome do sócio, qualificação, data de entrada, faixa etária e representante legal',
      'Opção pelo Simples Nacional e MEI, com datas',
      'Telefone e e-mail de contato declarados',
    ],
    naoEntrega: [
      'Faturamento — em nenhuma forma',
      'EBITDA, margem, endividamento',
      'Número de funcionários',
    ],
    porQueImporta: 'É a única fonte que enxerga capital fechado, que é o cliente típico de uma boutique. A faixa etária dos sócios é o dado mais subestimado do arquivo: sócio único, acima de 60 anos, empresa com mais de 25 anos, sem herdeiro no quadro é o retrato de sucessão — o gatilho de venda mais comum no middle market industrial brasileiro.',
    custo: 'Gratuito.',
    atualizacao: 'Mensal.',
    volume: 'Vários GB compactados (4,7 GB / 17 GB descompactados na medição de 2021, hoje maior). Processamento em streaming, sem carregar em memória.',
    acesso: 'https://dados.gov.br/dados/conjuntos-dados/cadastro-nacional-da-pessoa-juridica---cnpj · layout em https://www.gov.br/receitafederal/dados/cnpj-metadados.pdf',
    lgpd: 'Contém nome de pessoa física (sócios). Tratar como o projeto já trata o nome do DRI na CVM: coletado só quando há decisão consciente de quem opera, nunca por padrão na exportação.',
    implementacao: 'ferramentas/importar-cnpj.mjs',
  },

  delta_cnpj: {
    rotulo: 'Eventos societários por diferença entre dois meses do CNPJ',
    orgao: 'Derivada — Receita Federal',
    tipo: 'derivada',
    papel: ['evento'],
    prioridade: 2,
    cobertura: 'Mesma do CNPJ: universo inteiro.',
    entrega: [
      'Entrada e saída de sócio → sinal de mudança de controle, com data',
      'Troca de todos os sócios no mesmo mês → aquisição consumada',
      'Entrada de sócio pessoa jurídica estrangeira → comprador estratégico chegou antes de a imprensa noticiar',
      'Entrada de sócio PJ com natureza de fundo → rodada ou entrada de private equity',
      'Aumento relevante de capital social → aporte',
      'Abertura de filial em nova UF → expansão geográfica',
      'Mudança de situação cadastral → baixa, cisão, incorporação',
    ],
    naoEntrega: [
      'O valor da transação',
      'A intenção: saída de sócio pode ser venda, herança ou briga. O sistema marca o fato e nomeia a ambiguidade.',
    ],
    porQueImporta: 'Resolve a lacuna que o README declara como estrutural. Os quatro sinais que o motor de scoring mais valoriza — rodada, mudança de controle, expansão, sucessão — deixam de ser "não avaliado · sem fonte disponível" e passam a ter lastro documental, com data e registro público por trás. Nenhum concorrente que compre só base enriquecida tem isso, porque as bases comerciais entregam o estado atual, não o histórico de mudanças.',
    custo: 'Gratuito.',
    atualizacao: 'Mensal.',
    historicoDisponivel: 'A RFB mantém os meses anteriores publicados — 40 meses na verificação desta sessão, de 2023-05 a 2026-08. Isso significa que NÃO é preciso esperar: os três anos de eventos podem ser reconstruídos hoje, de uma vez. É a diferença entre "daqui a um ano teremos histórico" e "temos histórico".',
    limitacao: 'A diferença mostra o FATO, nunca a INTENÇÃO nem o VALOR. Saída de sócio pode ser venda, herança, briga ou reorganização fiscal — o registro afirma que o quadro mudou e nomeia a ambiguidade. Aumento de capital pode ser dinheiro novo ou capitalização de lucro. Interpretar continua sendo trabalho de gente.',
    acesso: 'Mesma fonte do `cnpj_rfb`, mês a mês. `node ferramentas/importar-cnpj.mjs --listar-meses` lista o que está publicado.',
    implementacao: 'ferramentas/importar-cnpj.mjs (--arquivar) + ferramentas/eventos-cnpj.mjs',
  },

  /* =========================================================================
   *  PORTE — o que o CNPJ não dá
   * ====================================================================== */
  econodata: {
    rotulo: 'Econodata (ou Neoway / BigData Corp)',
    orgao: 'Privado',
    tipo: 'paga',
    papel: ['porte', 'qualificacao'],
    prioridade: 3,
    cobertura: 'Universo CNPJ inteiro, enriquecido.',
    entrega: [
      'Faturamento estimado por empresa',
      'Número de funcionários',
      'Decisores com cargo e contato',
      'Marcação de importadora e exportadora',
      'Mais de 100 campos por CNPJ, via API REST com chave e consulta em lote',
    ],
    naoEntrega: [
      'Demonstração financeira auditada — é ESTIMATIVA, e o sistema tem de exibir como tal',
      'EBITDA e margem',
    ],
    porQueImporta: 'É a peça que falta para o filtro de receita funcionar sobre capital fechado. Sem ela, o agente sabe que a empresa existe e não sabe se ela tem R$ 5 mi ou R$ 500 mi — e a faixa consolidável, que é o filtro mais importante do produto, fica inoperante.',
    ressalva: 'Faturamento estimado entra na ficha com `origem: Estimativa` e `confianca: Média`, e NUNCA sustenta um sinal documental. O cálculo de lastro tem de classificá-lo como indicador estruturado, igual ao tratamento dado a critério ad hoc.',
    custo: 'Assinatura de baixo custo relativo; API cobrada por consulta ou por lote.',
    atualizacao: 'Contínua.',
    acesso: 'https://contrate.econodata.com.br/prospectar-api',
    decisao: 'Selecionada pela diretoria como fonte paga do escopo, junto com o Capital IQ.',
  },

  comex_empresas: {
    rotulo: 'Empresas brasileiras exportadoras e importadoras + Comex Stat',
    orgao: 'MDIC / SECEX',
    tipo: 'aberta',
    papel: ['porte', 'qualificacao', 'dimensionamento'],
    prioridade: 4,
    cobertura: 'Fluxo de comércio exterior por NCM, mês, país e município do domicílio fiscal. NÃO cobre empresa nomeada.',
    entrega: [
      'Comex Stat: valor e volume por NCM, mês, país e município — os capítulos 28, 29, 31, 32, 34, 38 e 39 cobrem a química',
      'Recorte por município do exportador/importador, no nível SH4',
    ],
    naoEntrega: [
      'CNPJ ou razão social. O MDIC DESPUBLICOU a lista de empresas exportadoras e importadoras e removeu também os anos anteriores, invocando sigilo de informação econômico-financeira.',
      'Faixa de valor por empresa — caiu junto com a lista',
    ],
    porQueImporta: 'Serve para dimensionar o subsetor e localizar as praças onde a importação química se concentra — não para identificar empresa. Como proxy de porte por empresa, esta fonte MORREU: era a aposta original desta linha e não existe mais.',
    custo: 'Gratuito.',
    atualizacao: 'Comex Stat mensal.',
    acesso: 'https://comexstat.mdic.gov.br · https://www.gov.br/mdic/pt-br/assuntos/comercio-exterior/estatisticas',
    statusVerificacao: 'Verificado em 20/08/2026. A URL da lista de empresas responde 404 e a nota metodológica do MDIC confirma a despublicação. Se alguém no time lembrar dessa lista, ela existiu — e não existe mais. A alternativa com dado por empresa é paga e vem de manifesto de carga (Panjiva, ImportGenius), fora do escopo desta rodada.',
  },

  /* =========================================================================
   *  QUALIFICAÇÃO REGULATÓRIA — a peculiaridade do setor químico
   * ====================================================================== */
  ibama_ctf: {
    rotulo: 'Pessoas jurídicas inscritas no CTF/APP',
    orgao: 'IBAMA',
    tipo: 'aberta',
    papel: ['universo', 'qualificacao'],
    prioridade: 5,
    cobertura: 'Vinte e três formulários do RAPP, cada um com a relação das PJ que o entregaram. Medido em 20/08/2026 no formulário de Resíduos Sólidos — Gerador: 5.723 empresas distintas (raiz de CNPJ) na categoria "Indústria Química", das quais 3.946 reportaram em 2023 ou 2024 e 3.758 estão com cadastro Ativo. Mais 37.573 empresas na categoria "Transporte, Terminais, Depósitos e Comércio", onde mora a distribuição.',
    entrega: [
      'CNPJ do estabelecimento (com sufixo de filial) e razão social',
      'Município e UF',
      'Categoria de atividade e DETALHE — e o detalhe mapeia quase 1 para 1 nos nossos subsetores',
      'Situação cadastral e ano de referência, de 2012 em diante — dá série histórica',
    ],
    naoEntrega: ['Porte', 'Financeiro', 'Quadro societário'],
    porQueImporta: 'Duas funções, e a segunda é a que justifica a prioridade alta. Qualifica: CNPJ com CNAE químico e sem CTF costuma ser cadastro morto. E DESCOBRE: a categoria é declarada pela empresa e independe do CNAE, então o RAPP revela operadores químicos registrados na Receita como comércio geral — exatamente os que o filtro de CNAE perde, e exatamente o teste que separa os 25.650 CNPJs que entraram no nosso universo só por CNAE secundário. O detalhe da atividade também resolve uma ambiguidade que o CNAE não resolve: separa fabricante de fertilizante de fabricante de defensivo, e domissanitário de cosmético.',
    custo: 'Gratuito.',
    atualizacao: 'Anual — entrega entre 1º de fevereiro e 31 de março, com dados do ano anterior.',
    acesso: 'Catálogo CKAN: https://dadosabertos.ibama.gov.br/api/3/action/package_search?fq=tags:rapp · CSV direto: https://dadosabertos.ibama.gov.br/dados/RAPP/residuoSolidosGerador/relatorio.csv',
    statusVerificacao: 'VERIFICADO em 20/08/2026. CSV de 826 MB baixado e lido do início ao fim. Delimitador ";", encoding UTF-8 — NÃO latin1. Os arquivos da RFB são latin1 e estes não são; errar isso quebra os acentos e o filtro por categoria devolve zero sem dar erro.',
    distribuicaoPorSubsetor: {
      'Inorgânicos, orgânicos e especialidades': 1413,
      'Domissanitários e limpeza': 956,
      'Tintas, vernizes e revestimentos': 786,
      'Fertilizantes e defensivos': 577,
      'Resinas, elastômeros e fibras': 197,
      'Recuperação de solventes': 119,
      'Aromas e fragrâncias': 88,
      'Cosmético acabado (fora do escopo)': 881,
      'Farma e veterinário (fora do escopo)': 505,
    },
  },

  anvisa_saneantes: {
    rotulo: 'Produtos saneantes regularizados',
    orgao: 'ANVISA',
    tipo: 'aberta',
    papel: ['qualificacao', 'porte'],
    prioridade: 6,
    cobertura: 'Subsetor de domissanitários e limpeza. Medido em 20/08/2026: 143.411 registros de produto sobre 3.988 empresas (raiz de CNPJ) no arquivo de saneantes, e 8.329 empresas com Autorização de Funcionamento ATIVA para saneantes no arquivo de empresas.',
    entrega: [
      'CNPJ e razão social da detentora, produto a produto, com número de registro, validade e situação',
      'Do arquivo de empresas: nome fantasia, endereço completo, município, UF e CEP',
      'ATIVIDADES declaradas — separa Fabricar de Distribuir, de Importar, de Transportar. É o que distingue indústria de distribuidor dentro do mesmo subsetor',
      'Contato direto: 1.639 empresas com site e 1.842 com telefone de SAC',
    ],
    naoEntrega: ['Faturamento por produto', 'Quadro societário'],
    porQueImporta: 'Três coisas. Contar registros vivos por empresa mede a largura da linha de produtos — proxy de porte que não depende de estimativa nenhuma, e ativo que se transfere na transação. As ATIVIDADES resolvem fabricante versus distribuidor sem depender do CNAE. E o site e o SAC são o único contato direto que apareceu em fonte aberta nesta busca: a base CNPJ traz e-mail, mas de qualidade irregular.',
    custo: 'Gratuito.',
    atualizacao: 'Carga diária — o arquivo carrega o campo DT_CARGA_ETL.',
    acesso: 'Produtos: https://dados.anvisa.gov.br/dados/CONSULTAS/PRODUTOS/TA_CONSULTA_SANEANTES.CSV · Empresas: https://dados.anvisa.gov.br/dados/CONSULTAS/EMPRESA_FISCALIZACAO_PRODUTO/TA_CONSULTA_FUNCIONAMENTO_EMPRESA_NACIONAL.CSV',
    statusVerificacao: 'VERIFICADO em 20/08/2026. Encoding latin1, delimitador ";", e campos entre aspas COM ";" e quebra de linha dentro (os endereços) — split simples corrompe o arquivo, precisa de parser que respeite as aspas. O campo ATIVO vale "SIM"/"NAO", não "S"/"N". Armadilha: DADOS_ABERTOS_REGISTROS_SANEANTES.CSV, na raiz do portal, é uma amostra de 13 linhas — não é a base.',
    topUf: 'SP 2.420 · PR 647 · MG 647 · SC 591 · RS 529 · RJ 510 · GO 498 · BA 305',
  },

  ibama_transporte: {
    rotulo: 'RAPP — Transporte de Produtos Químicos Perigosos ou Combustíveis',
    orgao: 'IBAMA',
    tipo: 'aberta',
    papel: ['universo', 'qualificacao'],
    prioridade: 6,
    cobertura: '3.929.301 linhas, 1999 a 2024. 24.583 empresas distintas (raiz de CNPJ) em 30.732 estabelecimentos. Em 2024: 9.985 empresas reportaram, 9.513 com cadastro Ativo, 797 presentes em mais de uma UF.',
    entrega: [
      'CNPJ e razão social de quem transporta ou armazena produto químico',
      'PRODUTO transportado, com nome químico — o portfólio real, não o CNAE declarado',
      'UF e município de ORIGEM e de DESTINO — a malha logística, rota a rota',
      'Tipo de transporte e de armazenamento, e se há plano de emergência',
    ],
    naoEntrega: [
      'Volume utilizável. As quantidades são declaratórias e sem validação de unidade: 1,39 milhão de linhas em "Litro", 1,37 milhão em "kilogramas", 373 mil em "Tonelada", e ainda "Caixa", "Pacote", "Lata", "Galão", "Militro". Somar dá absurdo físico — a maior declarante aparece com 49 bilhões de toneladas de GLP num ano.',
      'Financeiro',
    ],
    porQueImporta: 'É a melhor fonte aberta de PEGADA GEOGRÁFICA que existe para o setor. Origem e destino por município reconstroem a área de atuação real de um distribuidor — que é o ativo que o comprador estratégico compra, e que nenhuma outra base pública dá. O nome do produto também qualifica: distingue quem move solvente de quem move fertilizante, dentro do mesmo CNAE de transporte.',
    custo: 'Gratuito.',
    atualizacao: 'Anual. O ano corrente sai praticamente vazio — use o último ano fechado (hoje, 2024).',
    acesso: 'https://dadosabertos.ibama.gov.br/dados/RAPP/transpProdQuiPerigCombustivel/relatorio.csv',
    statusVerificacao: 'VERIFICADO em 20/08/2026. CSV de 908 MB, delimitador ";", UTF-8. Lido do início ao fim.',
    limitacao: 'Use a lista de empresas, os produtos e as rotas. NÃO use as quantidades — nem como proxy de porte, nem como sinal de crescimento. Testado: o ranking por volume devolve variações de +50.000.000%, que são erro de digitação de unidade, não expansão.',
  },

  mapa_sipeagro: {
    rotulo: 'AGROFIT e SIPEAGRO — registros de defensivos e fertilizantes',
    orgao: 'Ministério da Agricultura e Pecuária',
    tipo: 'aberta',
    papel: ['qualificacao', 'porte'],
    prioridade: 7,
    cobertura: 'Subsetores de defensivos agrícolas e fertilizantes.',
    entrega: ['Estabelecimentos registrados', 'Produtos registrados por titular, com ingrediente ativo e cultura'],
    naoEntrega: ['Financeiro'],
    porQueImporta: 'Em defensivos, o portfólio de registros É o ativo da transação — leva anos e milhões para construir. Contar registros por titular é medir diretamente aquilo que o comprador está comprando.',
    custo: 'Gratuito.',
    acesso: 'AGROFIT (defensivos) e SIPEAGRO (fertilizantes e estabelecimentos).',
  },

  pf_controlados: {
    rotulo: 'Registro e licença de produtos químicos controlados',
    orgao: 'Polícia Federal — SIPROQUIM2',
    tipo: 'aberta-restrita',
    papel: ['qualificacao'],
    prioridade: 8,
    cobertura: 'Quem opera com precursores de droga ilícita — inclui solventes correntes.',
    entrega: ['Validação de CRC e CLF por CNPJ'],
    naoEntrega: ['Lista em massa. Não há varredura possível.'],
    porQueImporta: 'Qualifica alvo já selecionado: a licença delimita quem pode operar a linha de solventes e afeta a estrutura da transação. Não serve para descobrir alvo.',
    custo: 'Gratuito, mas exige certificado digital e consulta um a um.',
    acesso: 'https://www.gov.br/pf/pt-br/assuntos/produtos-quimicos',
    limitacao: 'Consulta individual com certificado digital. Entra na etapa de dossiê, não na de triagem.',
  },

  exercito_sfpc: {
    rotulo: 'Produtos controlados pelo Exército',
    orgao: 'Exército Brasileiro — SFPC',
    tipo: 'aberta-restrita',
    papel: ['qualificacao'],
    prioridade: 12,
    cobertura: 'Subsetor de explosivos e pirotecnia.',
    entrega: ['Situação de registro por CNPJ'],
    naoEntrega: ['Lista em massa'],
    porQueImporta: 'A licença é o ativo escasso do subsetor.',
    custo: 'Gratuito, consulta pontual.',
    acesso: 'Sistemas de fiscalização de produtos controlados do Exército.',
  },

  /* =========================================================================
   *  LISTAS-SEMENTE — pequenas, precisas, e é por elas que se começa
   * ====================================================================== */
  associquim: {
    rotulo: 'ASSOCIQUIM/SINCOQUIM — empresas certificadas',
    orgao: 'Associação Brasileira dos Distribuidores de Produtos Químicos e Petroquímicos',
    tipo: 'associativa',
    papel: ['universo', 'qualificacao'],
    prioridade: 3,
    cobertura: '92 distribuidores certificados, verificado nesta sessão.',
    entrega: ['Razão social', 'Cidade e UF', 'Site', 'Número, data e validade do certificado'],
    naoEntrega: ['CNPJ', 'Financeiro'],
    porQueImporta: 'É a lista mais precisa que existe do subsetor prioritário. Noventa e dois nomes conferidos por uma associação valem mais, para começar, do que dez mil CNPJs por filtrar: dá para cruzar com o CNPJ por razão social e UF, marcar os certificados na base grande e usar esse conjunto como referência para calibrar os filtros antes de soltá-los no universo inteiro.',
    custo: 'Gratuito.',
    acesso: 'https://www.associquim.org.br/empresas-certificadas/',
    nota: 'A certificação em si é sinal de M&A: distribuidor certificado tem processo auditado, o que reduz risco de diligência e sustenta múltiplo.',
  },

  abiquim: {
    rotulo: 'ABIQUIM — empresas associadas',
    orgao: 'Associação Brasileira da Indústria Química',
    tipo: 'associativa',
    papel: ['universo'],
    prioridade: 9,
    cobertura: 'Cerca de 130 a 140 associadas, entre indústrias químicas de todos os portes e operadores logísticos.',
    entrega: ['Razão social', 'Site'],
    naoEntrega: ['CNPJ', 'Cidade/UF', 'Segmento', 'Financeiro'],
    porQueImporta: 'Delimita quem o próprio setor reconhece como indústria química relevante. Também publica estatísticas setoriais que servem de base para o dimensionamento de mercado do Módulo 5.2.',
    custo: 'Gratuito o diretório; relatórios setoriais são pagos.',
    acesso: 'https://abiquim.org.br/abiquim/associadas',
  },

  abrafati: {
    rotulo: 'ABRAFATI — fabricantes de tintas',
    orgao: 'Associação Brasileira dos Fabricantes de Tintas',
    tipo: 'associativa',
    papel: ['universo', 'dimensionamento'],
    prioridade: 10,
    cobertura: 'Subsetor de tintas e revestimentos.',
    entrega: ['Associadas', 'Estatísticas de volume e faturamento do segmento'],
    naoEntrega: ['Dado por empresa'],
    porQueImporta: 'Dá o denominador do subsetor de tintas — sem ele não há participação de mercado nem cálculo de fragmentação confiável.',
    custo: 'Gratuito o essencial.',
    acesso: 'abrafati.com.br',
  },

  abisolo: {
    rotulo: 'ABISOLO — nutrição vegetal',
    orgao: 'Associação Brasileira das Indústrias de Tecnologia em Nutrição Vegetal',
    tipo: 'associativa',
    papel: ['universo', 'dimensionamento'],
    prioridade: 11,
    cobertura: 'Subsetor de fertilizantes especiais e nutrição vegetal.',
    entrega: ['Associadas', 'Estatísticas do segmento'],
    naoEntrega: ['Dado por empresa'],
    porQueImporta: 'Separa nutrição vegetal especial de fertilizante commodity — duas teses de M&A muito diferentes dentro do mesmo CNAE.',
    custo: 'Gratuito o essencial.',
    acesso: 'abisolo.com.br',
  },

  /* =========================================================================
   *  FINANCEIRO E PREÇO
   * ====================================================================== */
  cvm: {
    rotulo: 'Demonstrações financeiras de companhias abertas',
    orgao: 'CVM — Portal de Dados Abertos',
    tipo: 'aberta',
    papel: ['porte', 'comparaveis'],
    prioridade: 6,
    cobertura: 'No recorte químico: sete companhias em "Petroquímicos e Borracha" e oito em "Farmacêutico e Higiene", das 537 da base. Medido no data-real.js atual.',
    entrega: ['DRE, balanço e fluxo de caixa auditados, com citação da conta contábil exata', 'Controle acionário', 'Histórico de dois exercícios'],
    naoEntrega: ['Capital fechado — que é 99,9% do universo químico brasileiro'],
    porQueImporta: 'Deixa de ser a base do agente e passa a ser duas coisas menores e ainda úteis: o padrão de qualidade contra o qual as estimativas são comparadas, e o conjunto de comparáveis locais listados.',
    custo: 'Gratuito.',
    atualizacao: 'Anual (DFP) e trimestral (ITR).',
    acesso: 'https://dados.cvm.gov.br/dados/CIA_ABERTA/',
    implementacao: 'ferramentas/importar-cvm.mjs',
    rebaixamento: 'Era a base principal do protótipo. Com o foco em químicos, sete registros não sustentam originação — a decisão da diretoria foi substituí-la pelo CNPJ como base primária.',
  },

  capital_iq: {
    rotulo: 'S&P Capital IQ',
    orgao: 'S&P Global',
    tipo: 'paga',
    papel: ['comparaveis', 'porte'],
    prioridade: 4,
    cobertura: 'Companhias listadas globalmente e transações divulgadas.',
    entrega: [
      'Trading comps e transações precedentes do setor químico global',
      'Múltiplos praticados por subsetor — o critério que o Módulo 2 hoje declara sem fonte',
      'Perfil e histórico de aquisições dos consolidadores globais, que é a lista buy-side do Módulo 6',
    ],
    naoEntrega: ['Empresa brasileira de capital fechado com faturamento abaixo de R$ 500 mi'],
    porQueImporta: 'É o que transforma a lista de alvos em conversa de preço, e o que dá lastro real à lista de compradores estrangeiros que hoje está no `setores.js` marcada como conhecimento de mercado a confirmar.',
    custo: 'Já assinada pela GHT4.',
    limitacao: 'O acesso é login web, sem API contratada. O caminho continua sendo importar a exportação da plataforma — mesma conclusão do Módulo 5.1.',
    acesso: 'Plataforma web da S&P.',
  },
};

/* ---- COMO AS FONTES SE ENCAIXAM -------------------------------------------
 * A ordem importa e não é negociável: filtrar antes de enriquecer. Enriquecer o
 * universo inteiro custa caro e não muda o resultado — o que muda é enriquecer
 * os poucos milhares que sobreviveram ao recorte de CNAE, porte e evento.
 * -------------------------------------------------------------------------- */
const PIPELINE = [
  { etapa: 1, nome: 'Universo',     fonte: ['cnpj_rfb'],
    saida: 'Todos os CNPJs ativos nos CNAEs do escopo químico, com sócios, filiais e datas.',
    corte: 'CNAE do escopo + situação cadastral ativa.' },
  { etapa: 2, nome: 'Limpeza',      fonte: ['cnpj_rfb'],
    saida: 'Universo sem ruído.',
    corte: 'Fora: optantes do Simples e MEI (porte abaixo do alvo), CNPJs com menos de 3 anos, filiais (consolidadas na matriz).' },
  { etapa: 3, nome: 'Qualificação', fonte: ['ibama_ctf', 'associquim', 'anvisa_saneantes', 'mapa_sipeagro'],
    saida: 'Universo com marca de operação real e de licença.',
    corte: 'Nenhum corte automático — vira coluna. Ausência de licença é sinal, não sentença.' },
  { etapa: 4, nome: 'Porte',        fonte: ['comex_empresas', 'econodata', 'cvm'],
    saida: 'Receita estimada, funcionários e faixa de importação.',
    corte: 'Faixa consolidável DO SUBSETOR — ver `setores.js`, não a faixa única de antes.' },
  { etapa: 5, nome: 'Evento',       fonte: ['delta_cnpj'],
    saida: 'Mudança de controle, aporte, expansão e sucessão, com data e registro.',
    corte: 'Nenhum. É o que ordena a lista.' },
  { etapa: 6, nome: 'Preço',        fonte: ['capital_iq'],
    saida: 'Múltiplos e precedentes por subsetor.',
    corte: 'Nenhum. Entra no dossiê e no ranking de subsegmentos do Módulo 2.' },
];

/* ---- O QUE CONTINUA SEM FONTE ---------------------------------------------
 * Mesmo padrão de CRITERIOS_SEM_FONTE em evidencias.js: declarar em vez de
 * omitir. Estes quatro NÃO são resolvidos por nenhuma base deste catálogo.
 * -------------------------------------------------------------------------- */
const AINDA_SEM_FONTE = [
  {
    criterio: 'EBITDA e margem de empresa de capital fechado',
    porQueImporta: 'É o denominador do múltiplo. Sem ele não há conversa de preço.',
    porQueFalta: 'Ltda. de capital fechado não publica demonstração. Faturamento estimado de base comercial não vira margem.',
    viaDeObtencao: 'Só na primeira reunião com o alvo, ou em balanço publicado quando a empresa é S.A. fechada.',
  },
  {
    criterio: 'Concentração de clientes',
    porQueImporta: 'Em distribuição química, um cliente com 30% da receita derruba o múltiplo. É o primeiro item da diligência.',
    porQueFalta: 'Nenhuma base pública abre receita por cliente.',
    viaDeObtencao: 'Alvo, em NDA.',
  },
  {
    criterio: 'Contrato de distribuição e exclusividade com o produtor',
    porQueImporta: 'O ativo de um distribuidor químico é a carta de distribuição de uma multinacional. Ela costuma ter cláusula de mudança de controle — o que pode fazer o ativo evaporar exatamente na venda.',
    porQueFalta: 'Contrato privado. Não existe registro público.',
    viaDeObtencao: 'Alvo, em NDA. É a pergunta número um da originação neste subsetor.',
  },
  {
    criterio: 'Passivo ambiental não provisionado',
    porQueImporta: 'Risco específico e caro do setor químico: solo e água contaminados em terreno próprio podem custar mais que o equity.',
    porQueFalta: 'O CTF diz que a empresa opera com risco ambiental, não que existe passivo. Autos de infração são consultáveis um a um, não em massa.',
    viaDeObtencao: 'Consulta a autos do IBAMA e do órgão estadual por CNPJ, mais diligência ambiental no alvo.',
  },
];

window.FONTES = { PAPEIS, FONTES, PIPELINE, AINDA_SEM_FONTE };
