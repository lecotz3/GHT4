/* =============================================================================
 *  GHT4 · ARQUIVO GERADO. NÃO EDITAR.
 * -----------------------------------------------------------------------------
 *  Fonte: packages/domain/taxonomia.mjs
 *  Gerado por: node ferramentas/gerar-globais.mjs
 *
 *  Editar aqui é trabalho perdido: a próxima geração sobrescreve. Mexa na
 *  fonte e rode o gerador. A CI confere que os dois estão em dia
 *  (`node ferramentas/gerar-globais.mjs --conferir`).
 *
 *  Este arquivo existe para o index.html poder carregá-lo por <script> em
 *  file://, onde módulo ES não funciona. O comentário original da fonte segue
 *  abaixo, íntegro.
 * ========================================================================== */
(function () {
'use strict';
/* =============================================================================
 *  GHT4 · TAXONOMIA DO SETOR FOCO — QUÍMICOS
 * -----------------------------------------------------------------------------
 *  Decisão de negócio (reunião com a diretoria): o agente passa a atacar um
 *  objetivo por vez, e o PRIMEIRO é setor/subsetor. O grande setor escolhido é
 *  QUÍMICOS. Os setores anteriores (Saúde, Tecnologia, Varejo, Energia) saíram
 *  da base — não estão comentados nem desligados por flag: foram removidos.
 *
 *  POR QUE ESTE ARQUIVO EXISTE
 *  Até aqui, "setor" e "subsetor" eram apenas dois campos de texto na ficha da
 *  empresa: o que existisse no dado virava categoria. Isso serve para demonstrar
 *  a mecânica, e não serve para originar. Originação exige o inverso — a casa
 *  decide o recorte ANTES e o dado se encaixa nele, porque é o recorte que define
 *  onde a boutique tem tese, contato e mandato.
 *
 *  Este módulo é esse recorte, declarado:
 *    · o perímetro do setor em CNAE, conferido contra a API oficial do IBGE;
 *    · a tese de M&A de cada subsetor (o que faz dele um alvo, ou não);
 *    · a faixa consolidável ESPECÍFICA de cada subsetor — não a faixa única de
 *      R$ 30–250 mi que o protótipo usava para todos;
 *    · a barreira regulatória, que em química é ativo de M&A e não burocracia;
 *    · quais bases de dados cobrem cada subsetor (ver `fontes.js`).
 *
 *  A RÉGUA À MOSTRA
 *  Dois subsetores estão declarados SEM alvo de boutique (`faixaConsolidavel:
 *  null`), com o motivo escrito. Petroquímica básica não tem middle market: a
 *  escala mínima de um cracker é bilionária e os ativos pertencem a três grupos.
 *  Fingir que existe alvo ali produziria lista bonita e reunião vazia.
 *
 *  ADJACÊNCIAS
 *  Farmoquímicos, cosmético acabado, combustíveis e transformação de plástico
 *  ficam em ADJACENCIAS: são fronteira do setor, não escopo. Entram ligando o
 *  subsetor, decisão de quem opera — não default silencioso. Cosméticos merecem
 *  nota: a CNAE 2063100 mora dentro da divisão 20, então "divisão 20 inteira"
 *  incluiria cosmético acabado. A diretoria excluiu; a exclusão está aqui, à
 *  vista, em vez de virar um filtro escondido no importador.
 *  FONTE ÚNICA DA TAXONOMIA (desde a Fase 1)
 *  Este arquivo é a fonte. `setores.js`, na raiz, é GERADO a partir dele por
 *  `node ferramentas/gerar-setores.mjs` — não edite o gerado. A ingestão em
 *  `ferramentas/importar-cnpj.mjs` importa este módulo direto.
 *
 *  A duplicação existia porque o navegador bloqueia módulo ES em file://, e é o
 *  duplo-clique no index.html que faz a demonstração rodar sem servidor. Gerar o
 *  script global a partir do módulo mantém as duas coisas: uma verdade só, e a
 *  demo offline de pé.
 * ========================================================================== */

const SETOR_FOCO = 'Químicos';

/* ---- 1. SUBSETORES ---------------------------------------------------------
 * `cnae` usa a subclasse de 7 dígitos, sem pontuação — o mesmo formato do campo
 * CNAE_FISCAL_PRINCIPAL dos dados abertos do CNPJ, para o cruzamento ser direto.
 * Códigos conferidos em servicodados.ibge.gov.br/api/v2/cnae (CNAE 2.3).
 * -------------------------------------------------------------------------- */
const SUBSETORES = [
  {
    chave: 'distribuicao',
    rotulo: 'Distribuição e trading químico',
    prioridade: 1,
    cnae: ['4684201', '4684202', '4684299'],
    cnaeSecundario: ['4689399'],
    oQueE: 'Compra a granel do produtor, fraciona, formula, armazena, transporta e vende para a indústria. Não fabrica molécula: entrega serviço de suprimento.',
    tese: 'Buy-and-build de manual. Mercado pulverizado de distribuidores regionais familiares, comprador estratégico global com mandato aberto e histórico de dezenas de aquisições no Brasil, e sinergia real na compra (o consolidador ganha desconto de escala no mesmo fornecedor).',
    porQuePrimeiro: 'É o único elo do setor que reúne as três condições ao mesmo tempo: alvo em faixa de boutique, comprador identificável e ativo, e universo grande o bastante para o agente ter o que filtrar.',
    faixaConsolidavel: { min: 40, max: 600 },
    ressalvaFaixa: 'Distribuidor é revenda: margem EBITDA típica de 4–10%. Receita de R$ 400 mi aqui não equivale a receita de R$ 400 mi em especialidades — o ticket da transação sai do EBITDA, não do topo da DRE. Filtrar só por receita superestima o alvo.',
    perfilTipico: 'Familiar de 1ª ou 2ª geração, 30–250 funcionários, um a três centros de distribuição, dependência forte do fundador na relação com fornecedor.',
    barreiraRegulatoria: ['pf_controlados', 'ibama_ctf', 'anvisa_saneantes'],
    fontes: ['cnpj_rfb', 'associquim', 'comex_empresas', 'econodata', 'ibama_ctf', 'pf_controlados'],
  },
  {
    chave: 'especialidades',
    rotulo: 'Especialidades e aditivos',
    prioridade: 2,
    cnae: ['2091600', '2093200', '2094100', '2099101', '2099199'],
    oQueE: 'Adesivos e selantes, aditivos de uso industrial, catalisadores e preparados químicos diversos. Vende desempenho — o cliente compra o efeito no processo dele, não o produto.',
    tese: 'É o coração do middle market químico. Formulação própria e carteira técnica sustentam margem de 15–25%, o que gera múltiplo de especialidade e não de commodity. Empresa pequena com nicho defendido é exatamente o ativo que o estratégico não consegue construir e prefere comprar.',
    faixaConsolidavel: { min: 20, max: 250 },
    perfilTipico: 'Founder-led ou familiar, base técnica (o dono costuma ser o químico), 20–150 funcionários, concentração alta de clientes.',
    barreiraRegulatoria: ['ibama_ctf'],
    fontes: ['cnpj_rfb', 'abiquim', 'comex_empresas', 'econodata', 'ibama_ctf'],
  },
  {
    chave: 'tintas',
    rotulo: 'Tintas, vernizes e revestimentos',
    prioridade: 3,
    cnae: ['2071100', '2072000', '2073800'],
    oQueE: 'Tintas imobiliárias e industriais, tintas de impressão, impermeabilizantes e solventes.',
    tese: 'Segmento com marca e canal de distribuição próprios, o que sustenta múltiplo acima do resto da química. Fragmentação relevante fora do eixo das quatro grandes, com fabricantes regionais fortes em revenda de bairro e em tinta industrial de nicho.',
    faixaConsolidavel: { min: 30, max: 400 },
    perfilTipico: 'Familiar regional, marca própria com penetração estadual, 50–300 funcionários.',
    barreiraRegulatoria: ['ibama_ctf', 'pf_controlados'],
    fontes: ['cnpj_rfb', 'abrafati', 'comex_empresas', 'econodata', 'ibama_ctf'],
  },
  {
    chave: 'domissanitarios',
    rotulo: 'Domissanitários e produtos de limpeza',
    prioridade: 4,
    cnae: ['2052500', '2061400', '2062200'],
    oQueE: 'Desinfestantes domissanitários, sabões e detergentes sintéticos, produtos de limpeza e polimento — inclui a linha profissional (limpeza institucional).',
    tese: 'Universo grande e muito pulverizado, com dois perfis distintos que o filtro precisa separar: fabricante de marca própria para varejo (margem baixa, escala) e formulador para limpeza profissional B2B (margem melhor, contrato recorrente). O segundo é o alvo de boutique.',
    ressalvaFaixa: 'Aqui mora a maior parte dos falsos positivos do setor: milhares de CNPJs minúsculos de fabricação de produto de limpeza. Sem piso de receita e de funcionários, a lista vira lista telefônica.',
    faixaConsolidavel: { min: 25, max: 300 },
    perfilTipico: 'Familiar, forte concentração em SP/MG/PR, muitos optantes do Simples — o que por si só já indica porte abaixo do alvo.',
    barreiraRegulatoria: ['anvisa_saneantes', 'ibama_ctf'],
    fontes: ['cnpj_rfb', 'anvisa_saneantes', 'econodata', 'ibama_ctf'],
  },
  {
    chave: 'inorganicos_gases',
    rotulo: 'Inorgânicos e gases industriais',
    prioridade: 5,
    cnae: ['2011800', '2014200', '2019399'],
    oQueE: 'Cloro e álcalis, gases industriais (oxigênio, nitrogênio, acetileno, CO₂) e demais inorgânicos.',
    tese: 'Gases industriais é negócio de densidade logística: o raio de entrega econômico é curto, então o mercado se organiza em praças e o consolidador compra praça. Há operadores regionais independentes com contrato de longo prazo — ativo previsível, que é o que o comprador estratégico paga bem.',
    faixaConsolidavel: { min: 30, max: 400 },
    perfilTipico: 'Familiar regional em gases; em cloro-álcalis o ativo é de grande porte e o universo é curto.',
    barreiraRegulatoria: ['ibama_ctf', 'pf_controlados'],
    fontes: ['cnpj_rfb', 'abiquim', 'econodata', 'ibama_ctf'],
    excluirCnae: ['2019301'],
    motivoExclusao: 'CNAE 2019301 (combustíveis nucleares) é monopólio estatal — não existe transação privada.',
  },
  {
    chave: 'fertilizantes',
    rotulo: 'Fertilizantes e nutrição vegetal',
    prioridade: 6,
    /* 2013400 é o código de CLASSE ("Fabricação de adubos e fertilizantes"), sem
       a quebra em subclasse. Ele não existe na tabela de subclasses do IBGE, mas
       existe na tabela de CNAEs da Receita Federal e há estabelecimentos
       cadastrados nele. Omiti-lo perderia empresas reais do subsetor. */
    cnae: ['2012600', '2013400', '2013401', '2013402'],
    cnaeSecundario: ['4683400'],
    oQueE: 'Intermediários para fertilizantes, adubos organominerais e não organominerais, e o atacado de fertilizantes e corretivos.',
    tese: 'Cadeia partida em dois mundos. A matéria-prima é importada e concentrada em poucos grupos; a mistura (blending) e a distribuição regional são pulverizadas e ficam perto do produtor rural. O alvo de boutique está no blending e nos especialistas em nutrição — não na matéria-prima.',
    faixaConsolidavel: { min: 50, max: 800 },
    ressalvaFaixa: 'Receita alta com margem fina e capital de giro pesado (safra). Alavancagem e ciclo de caixa importam mais aqui do que em qualquer outro subsetor do escopo.',
    perfilTipico: 'Familiar ligado ao agro, forte em MT/GO/PR/RS, sazonalidade acentuada.',
    barreiraRegulatoria: ['mapa_sipeagro', 'ibama_ctf'],
    fontes: ['cnpj_rfb', 'mapa_sipeagro', 'comex_empresas', 'econodata', 'abisolo'],
  },
  {
    chave: 'defensivos',
    rotulo: 'Defensivos agrícolas',
    prioridade: 7,
    cnae: ['2051700'],
    cnaeSecundario: ['4683400'],
    oQueE: 'Fabricação e formulação de defensivos agrícolas (herbicidas, fungicidas, inseticidas), incluindo os pós-patente.',
    tese: 'O registro de produto no MAPA é o ativo — leva anos e custa caro, então quem tem portfólio registrado é comprado por isso. Formuladores independentes de pós-patente e distribuidores agro especializados formam um universo de alvos com barreira de entrada real.',
    faixaConsolidavel: { min: 50, max: 600 },
    perfilTipico: 'Founder-led ou braço de trading agrícola; concentração em SP, PR e MT.',
    barreiraRegulatoria: ['mapa_sipeagro', 'ibama_ctf', 'anvisa_saneantes'],
    fontes: ['cnpj_rfb', 'mapa_sipeagro', 'comex_empresas', 'econodata'],
  },
  {
    chave: 'explosivos',
    rotulo: 'Explosivos e pirotecnia',
    prioridade: 8,
    cnae: ['2092401', '2092402', '2092403'],
    oQueE: 'Pólvoras, explosivos e detonantes, artigos pirotécnicos e fósforos de segurança.',
    tese: 'Nicho pequeno e travado por licença do Exército, o que mantém o número de operadores estável há décadas. Universo curto, mas cada ativo é escasso — a licença não se compra fora da empresa.',
    faixaConsolidavel: { min: 30, max: 300 },
    perfilTipico: 'Familiar, cliente final em mineração e construção pesada.',
    barreiraRegulatoria: ['exercito_sfpc', 'pf_controlados', 'ibama_ctf'],
    fontes: ['cnpj_rfb', 'exercito_sfpc', 'econodata'],
  },
  {
    chave: 'resinas',
    rotulo: 'Resinas, elastômeros e fibras',
    prioridade: 9,
    cnae: ['2031200', '2032100', '2033900', '2040100'],
    oQueE: 'Resinas termoplásticas e termofixas, elastômeros e fibras artificiais e sintéticas.',
    tese: 'Commodity de segunda geração: escala manda, margem oscila com o ciclo petroquímico e com o câmbio. O middle market existe só nas resinas termofixas e em compostos de nicho — o resto do universo é de grande porte.',
    faixaConsolidavel: { min: 150, max: 1500 },
    ressalvaFaixa: 'Faixa deslocada para cima de propósito: abaixo de R$ 150 mi o ativo raramente tem escala mínima operacional neste elo. É o subsetor em que a faixa única de R$ 30–250 mi do protótipo mais distorcia o resultado.',
    perfilTipico: 'Capital aberto, multinacional ou braço industrial de grupo — pouco alvo familiar.',
    barreiraRegulatoria: ['ibama_ctf'],
    fontes: ['cnpj_rfb', 'cvm', 'abiquim', 'comex_empresas'],
  },
  {
    chave: 'petroquimica_basica',
    rotulo: 'Petroquímica básica e intermediários',
    prioridade: 10,
    cnae: ['2021500', '2022300', '2029100'],
    oQueE: 'Eteno, propeno, aromáticos e intermediários para plastificantes, resinas e fibras — a primeira e a segunda geração da cadeia.',
    tese: null,
    faixaConsolidavel: null,
    semAlvoDeBoutique: 'A escala mínima de um cracker é bilionária e os ativos brasileiros pertencem a um punhado de grupos. Transação aqui é operação de banco de investimento full-service, com processo competitivo internacional — não é mandato de boutique. O subsetor fica no mapa porque é onde estão os FORNECEDORES dos alvos: entender a primeira geração é o que explica a margem da terceira.',
    perfilTipico: 'Capital aberto e multinacional.',
    barreiraRegulatoria: ['ibama_ctf'],
    fontes: ['cvm', 'abiquim', 'capital_iq', 'comex_empresas'],
    papelNoMapa: 'contexto',
  },
];

/* ---- 2. ADJACÊNCIAS --------------------------------------------------------
 * Fronteira do setor. Ficam listadas para que a decisão de excluir seja visível
 * e reversível — e para que ninguém redescubra em três meses que "faltou farma".
 * -------------------------------------------------------------------------- */
const ADJACENCIAS = [
  {
    chave: 'cosmeticos',
    rotulo: 'Cosméticos, perfumaria e higiene pessoal',
    cnae: ['2063100', '4646001', '4646002'],
    dentroDaDivisao20: true,
    porQueFora: 'Mora na divisão 20 da CNAE, mas a tese é de consumo e marca, não de química: o comprador é do universo de bens de consumo e o driver de valor é o canal. Misturar contamina a mediana de margem de todo o setor.',
    quandoLigar: 'Se a casa quiser cobrir a cadeia de HPC (home & personal care) junto com domissanitários, que compartilham fornecedor e formulador.',
  },
  {
    chave: 'farmoquimicos',
    rotulo: 'Farmoquímicos e farmacêuticos',
    cnae: ['2110600', '2121101', '2121102', '2121103', '2122000', '2123800', '4644301', '4644302'],
    porQueFora: 'Ciclo regulatório da ANVISA, propriedade intelectual e formação de preço próprios. É um setor foco em si, não um subsetor de químicos.',
    quandoLigar: 'Só se o farmoquímico (2110600, o insumo farmacêutico ativo) for tratado como especialidade química — é o único elo com lógica industrial comum.',
  },
  {
    chave: 'combustiveis',
    rotulo: 'Combustíveis, lubrificantes e GLP',
    cnae: ['4681801', '4681802', '4681803', '4681804', '4681805', '4682600'],
    porQueFora: 'Distribuição de combustível é regulada pela ANP, tem lógica de rede de postos e margem regulada. Nada em comum com distribuição química além da palavra "distribuição".',
    quandoLigar: 'Se a casa abrir a vertical de downstream de energia — aí é setor próprio.',
  },
  {
    chave: 'transformados',
    rotulo: 'Borracha e plástico transformados (divisão 22)',
    cnae: ['22'],
    porQueFora: 'É cliente da química, não química. O driver é conversão e molde, e o comprador é do universo de embalagem e autopeças.',
    quandoLigar: 'Em teses de integração vertical, quando o alvo é o cliente do produtor de resina.',
  },
];

/* ---- 3. BARREIRAS REGULATÓRIAS ---------------------------------------------
 * Em química, licença não é custo de conformidade: é ativo. Um distribuidor com
 * CRC/CLF da Polícia Federal pode movimentar produtos controlados que o
 * concorrente sem licença não pode tocar, e a licença não se transfere sozinha
 * numa compra de ativos — o que muda a ESTRUTURA da transação (compra de quotas
 * em vez de ativos). Por isso a barreira entra na ficha da empresa, e não numa
 * nota de rodapé de due diligence.
 * -------------------------------------------------------------------------- */
const BARREIRAS = {
  pf_controlados: {
    rotulo: 'Licença da Polícia Federal (produtos químicos controlados)',
    orgao: 'Polícia Federal — Divisão de Controle de Produtos Químicos (SIPROQUIM2)',
    base: 'Lei 10.357/2001',
    oQueE: 'Registro (CRC) e licença de funcionamento (CLF) para quem fabrica, distribui, importa, transporta ou usa produtos que podem servir de precursor de droga ilícita — inclui solventes correntes como acetona, tolueno e ácido sulfúrico.',
    porQueImportaEmMA: 'Delimita quem pode operar a linha inteira de solventes. Vira barreira de entrada e, na transação, força a discussão de compra de quotas versus compra de ativos.',
    consultaEmMassa: false,
    comoObter: 'Validação por CNPJ no portal da PF, uma empresa por vez, com certificado digital. Não há lista pública para varredura — serve para qualificar alvo, não para descobrir alvo.',
  },
  ibama_ctf: {
    rotulo: 'Cadastro Técnico Federal (CTF/APP)',
    orgao: 'IBAMA',
    oQueE: 'Cadastro obrigatório de pessoas jurídicas que exercem atividades potencialmente poluidoras ou usam recursos ambientais. Praticamente toda operação química está inscrita.',
    porQueImportaEmMA: 'É a lista pública mais próxima de um censo de quem de fato opera com químicos — inclusive empresas cujo CNAE principal não é químico. Serve para achar alvo fora do filtro de CNAE.',
    consultaEmMassa: true,
    comoObter: 'Download aberto em dadosabertos.ibama.gov.br (conjunto "Pessoas jurídicas inscritas no CTF/APP"), com CNPJ, município/UF, categoria de atividade e situação cadastral.',
  },
  anvisa_saneantes: {
    rotulo: 'Regularização de saneantes',
    orgao: 'ANVISA',
    oQueE: 'Notificação ou registro de produtos saneantes (desinfetantes, detergentes, desinfestantes) e autorização de funcionamento da empresa.',
    porQueImportaEmMA: 'O portfólio regularizado é ativo transferível e mensurável: dá para contar quantos produtos a empresa tem vivos e há quanto tempo. Proxy direto de tamanho de linha.',
    consultaEmMassa: true,
    comoObter: 'Dados abertos da ANVISA e consulta ao banco de produtos saneantes.',
  },
  mapa_sipeagro: {
    rotulo: 'Registro de estabelecimento e de produto (fertilizantes e defensivos)',
    orgao: 'Ministério da Agricultura e Pecuária — SIPEAGRO / AGROFIT',
    oQueE: 'Registro obrigatório do estabelecimento produtor e de cada produto de fertilizante, corretivo, inoculante ou defensivo agrícola.',
    porQueImportaEmMA: 'Em defensivos, o registro do produto é o principal ativo da transação — leva anos para obter. Contar registros por empresa é medir o ativo diretamente.',
    consultaEmMassa: true,
    comoObter: 'AGROFIT (defensivos) e SIPEAGRO (fertilizantes e estabelecimentos), ambos com consulta pública.',
  },
  exercito_sfpc: {
    rotulo: 'Certificado de Registro (produtos controlados pelo Exército)',
    orgao: 'Exército Brasileiro — Serviço de Fiscalização de Produtos Controlados',
    oQueE: 'Registro e licença para fabricar, comercializar e transportar explosivos e outros produtos controlados pelo Exército.',
    porQueImportaEmMA: 'Licença escassa e intransferível — é o que mantém o número de operadores de explosivos estável e o ativo caro.',
    consultaEmMassa: false,
    comoObter: 'Consulta pontual por CNPJ nos sistemas do Exército.',
  },
};

/* ---- 4. CONSOLIDADORES CONHECIDOS ------------------------------------------
 * Lista de compradores para o Módulo 6 (matchmaking), no lado buy-side.
 *
 * RESSALVA DE PROCEDÊNCIA, e ela é séria: os nomes abaixo são conhecimento
 * público de mercado, NÃO saída de fonte verificada pelo sistema. Enquanto não
 * houver Capital IQ ligado, cada linha entra na interface com `origem` e
 * `confianca: 'A confirmar'`, exatamente como qualquer outro dado sem lastro no
 * projeto. Nenhuma delas deve ser apresentada ao cliente como mandato aberto.
 * -------------------------------------------------------------------------- */
const CONSOLIDADORES = [
  { nome: 'Brenntag', origemCapital: 'Alemanha', subsetores: ['distribuicao'],
    perfil: 'Maior distribuidora química do mundo, com operação própria no Brasil e histórico longo de aquisições de distribuidores regionais.' },
  { nome: 'IMCD', origemCapital: 'Países Baixos', subsetores: ['distribuicao', 'especialidades'],
    perfil: 'Distribuidora de especialidades; cresce quase exclusivamente por aquisição de distribuidores locais com carteira técnica.' },
  { nome: 'Azelis', origemCapital: 'Bélgica', subsetores: ['distribuicao', 'especialidades'],
    perfil: 'Distribuidora de especialidades com programa declarado de M&A em mercados emergentes.' },
  { nome: 'Univar Solutions', origemCapital: 'Estados Unidos', subsetores: ['distribuicao'],
    perfil: 'Distribuidora global de químicos e ingredientes, presente na América do Sul.' },
  { nome: 'GTM / Grupo Transmerquim', origemCapital: 'Costa Rica', subsetores: ['distribuicao'],
    perfil: 'Consolidador latino-americano de distribuição química.' },
  { nome: 'Nexa / grupos nacionais de distribuição', origemCapital: 'Brasil', subsetores: ['distribuicao'],
    perfil: 'Distribuidores nacionais de médio porte que compram concorrentes regionais para ganhar praça.' },
  { nome: 'Sherwin-Williams', origemCapital: 'Estados Unidos', subsetores: ['tintas'],
    perfil: 'Consolidador global de tintas, com histórico de aquisição de marcas regionais.' },
  { nome: 'Fundos de private equity de middle market', origemCapital: 'Brasil', subsetores: ['distribuicao', 'especialidades', 'tintas', 'domissanitarios'],
    perfil: 'Compradores financeiros com tese de plataforma + add-ons. Costumam entrar comprando o maior independente da praça.' },
];

/* ---- 5. FUNÇÕES DE APOIO --------------------------------------------------- */

/** Índice CNAE → subsetor. Construído uma vez, consultado em O(1). */
const _INDICE_CNAE = (() => {
  const mapa = {};
  for (const s of SUBSETORES) {
    for (const c of s.cnae) mapa[c] = { chave: s.chave, rotulo: s.rotulo, principal: true };
    for (const c of (s.cnaeSecundario || [])) {
      if (!mapa[c]) mapa[c] = { chave: s.chave, rotulo: s.rotulo, principal: false };
    }
  }
  return mapa;
})();

/* CNAEs secundários que servem para DESCOBRIR candidatos e nunca para confirmar
   enquadramento sozinhos. O 4689399 é "comércio atacadista especializado em
   outros produtos não especificados": um distribuidor químico pode estar ali,
   mas metade do atacado brasileiro também. Enquadrar por ele encheria a base de
   falso positivo. O 4683400, em contraste, é atacado de adubo e defensivo — diz
   o que a empresa faz, e por isso enquadra.

   A distinção é a mesma da seção 8.2 do plano: "CNAE secundário admitido como
   descoberta, mas nunca como confirmação isolada". Fica declarada aqui em vez de
   virar um `if` escondido no importador. */
const CNAE_APENAS_DESCOBERTA = new Set(['4689399']);

/**
 * Tabela CNAE → rótulo do subsetor, no formato que a ingestão consome.
 *
 * É a fonte única do que era `SUBSETOR_POR_CNAE` em `ferramentas/importar-cnpj.mjs`.
 * Inclui os CNAEs principais e os secundários que enquadram; deixa de fora os
 * marcados como só-descoberta e os excluídos pelo próprio subsetor.
 *
 * Quando o mesmo código serve dois subsetores (o 4683400 é secundário de
 * fertilizantes e de defensivos), vence o que aparece primeiro em SUBSETORES —
 * que é a ordem de prioridade declarada.
 */
function tabelaSubsetorPorCnae() {
  const fora = new Set(SUBSETORES.flatMap((s) => s.excluirCnae || []));
  const tabela = {};
  for (const [cnae, info] of Object.entries(_INDICE_CNAE)) {
    if (fora.has(cnae)) continue;
    if (CNAE_APENAS_DESCOBERTA.has(cnae)) continue;
    tabela[cnae] = info.rotulo;
  }
  return tabela;
}

/** CNAEs que só servem para levantar candidato, nunca para enquadrar sozinhos. */
function cnaesDeDescoberta() {
  return [...CNAE_APENAS_DESCOBERTA].sort();
}

/** Todos os CNAEs do escopo, sem os excluídos. */
function cnaesDoEscopo() {
  const fora = new Set(SUBSETORES.flatMap((s) => s.excluirCnae || []));
  return Object.keys(_INDICE_CNAE).filter((c) => !fora.has(c)).sort();
}

/** Dado um CNAE de 7 dígitos, devolve o subsetor — ou null se está fora do escopo. */
function subsetorDeCnae(cnae) {
  const limpo = String(cnae || '').replace(/\D/g, '').padStart(7, '0');
  return _INDICE_CNAE[limpo] || null;
}

/** Busca a definição completa de um subsetor pela chave ou pelo rótulo. */
function subsetor(chaveOuRotulo) {
  return SUBSETORES.find((s) => s.chave === chaveOuRotulo || s.rotulo === chaveOuRotulo) || null;
}

/**
 * A faixa consolidável do subsetor da empresa — e não a faixa única do projeto.
 * Devolve null quando o subsetor foi declarado sem alvo de boutique, e quem
 * chama precisa tratar isso como "não se aplica", nunca como "não atende".
 */
function faixaDe(chaveOuRotulo) {
  const s = subsetor(chaveOuRotulo);
  return s ? s.faixaConsolidavel : null;
}

/** A empresa está na faixa consolidável do PRÓPRIO subsetor? */
function naFaixaConsolidavel(empresa) {
  const faixa = faixaDe(empresa.subsetor);
  if (!faixa) return null;                       // não se aplica ≠ não atende
  if (empresa.receita === null || empresa.receita === undefined) return null;
  return empresa.receita >= faixa.min && empresa.receita <= faixa.max;
}

/** Subsetores que valem originação — exclui os de papel apenas contextual. */
function subsetoresAcionaveis() {
  return SUBSETORES.filter((s) => s.papelNoMapa !== 'contexto' && s.faixaConsolidavel);
}

/** Compradores plausíveis para um subsetor (buy-side do Módulo 6). */
function consolidadoresDe(chave) {
  return CONSOLIDADORES.filter((c) => c.subsetores.includes(chave));
}

/** Barreiras regulatórias que incidem sobre um subsetor, já resolvidas. */
function barreirasDe(chave) {
  const s = subsetor(chave);
  if (!s) return [];
  return (s.barreiraRegulatoria || []).map((b) => ({ chave: b, ...BARREIRAS[b] }));
}

window.SETORES = {
  SETOR_FOCO, SUBSETORES, ADJACENCIAS, BARREIRAS,
  CONSOLIDADORES, cnaesDoEscopo, subsetorDeCnae, subsetor,
  faixaDe, naFaixaConsolidavel, subsetoresAcionaveis, consolidadoresDe,
  barreirasDe, tabelaSubsetorPorCnae, cnaesDeDescoberta,
};
})();
