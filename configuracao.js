/* =============================================================================
 *  GHT4 · CONFIGURAÇÃO EM TEMPO DE USO
 * -----------------------------------------------------------------------------
 *  Atende ao princípio central do documento de requisitos (seção 1):
 *
 *    "os critérios de análise e ranqueamento mudam a cada situação, e o usuário
 *     precisa poder definir/ajustar filtros e pesos no momento da consulta"
 *
 *  Até aqui, os pesos viviam fixos em `CONFIG_PAPEIS` (scoring.js) e só mudavam
 *  editando código. Este arquivo abre três coisas ao usuário, sem reprogramação:
 *
 *    1. PESOS      — mover o peso de cada sinal já existente, por papel.
 *    2. CRITÉRIOS  — criar critérios novos na hora, sobre qualquer campo da
 *                    ficha da empresa, com operador, valor e peso próprios.
 *    3. TEMPLATES  — salvar a combinação inteira com um nome e reaplicá-la
 *                    ("screening padrão agro", "screening consolidadores").
 *
 *  POR QUE CRITÉRIO DECLARATIVO E NÃO PROMPT LIVRE
 *  O documento pede que o usuário "escreva um prompt livre criando novos
 *  filtros". Prompt livre exige um modelo de linguagem traduzindo texto em
 *  regra — camada que este repositório ainda não tem. O que existe aqui é o
 *  destino dessa tradução: uma regra explícita, audível e reproduzível. Quando
 *  a camada de LLM entrar, ela emite ESTA estrutura, e o resto continua igual.
 *  A vantagem de já ter o formato: o usuário vê a regra que está sendo aplicada
 *  em vez de confiar que o modelo entendeu o pedido.
 *
 *  DADO AUSENTE NÃO É CRITÉRIO ATENDIDO
 *  `avaliarCriterio` devolve `null` — não `false` — quando a empresa não publicou
 *  o campo. Quem consome distingue "não atende" de "não sei", que é a mesma
 *  regra dos chips de exigência do protótipo. Tratar ausência como aprovação é
 *  a forma mais comum de uma triagem gerar falso positivo.
 * ========================================================================== */

/* ---- 1. CAMPOS DISPONÍVEIS --------------------------------------------------
 * Catálogo do que pode virar critério. Cada campo declara de onde sai o número:
 * `fonte` é exibido na interface junto do critério, para manter o padrão
 * "afirmação de um lado, documento do outro" também nos critérios ad hoc.
 *
 * `natureza` alimenta o cálculo de lastro em scoring.js. Nenhum critério ad hoc
 * é 'documental': todos saem de indicador ou de cadastro. Isso é deliberado —
 * um critério inventado na hora não pode elevar o lastro documental do índice.
 * -------------------------------------------------------------------------- */
const CAMPOS = {
  receita: {
    rotulo: 'Receita líquida',
    grupo: 'Porte',
    tipo: 'numero',
    unidade: 'R$ mi',
    natureza: 'estruturado',
    fonte: 'CVM · DFP conta 3.01',
    ler: (e) => e.receita,
  },
  funcionarios: {
    rotulo: 'Funcionários',
    grupo: 'Porte',
    tipo: 'numero',
    unidade: 'pessoas',
    natureza: 'estruturado',
    fonte: 'Formulário cadastral CVM',
    ler: (e) => e.funcionarios,
  },
  receitaPorFuncionario: {
    rotulo: 'Receita por funcionário',
    grupo: 'Porte',
    tipo: 'numero',
    unidade: 'R$ mil',
    natureza: 'estruturado',
    fonte: 'Derivado: receita ÷ funcionários',
    ler: (e) => e.receitaPorFuncionario,
  },
  crescimento: {
    rotulo: 'Crescimento de receita',
    grupo: 'Desempenho',
    tipo: 'numero',
    unidade: '% a.a.',
    natureza: 'estruturado',
    fonte: 'CVM · conta 3.01, dois exercícios',
    ler: (e) => e.crescimento,
  },
  margemEbitda: {
    rotulo: 'Margem EBITDA',
    grupo: 'Desempenho',
    tipo: 'numero',
    unidade: '%',
    natureza: 'estruturado',
    fonte: 'CVM · contas 3.05 + 7.04.01',
    ler: (e) => e.margemEbitda,
  },
  variacaoMargem: {
    rotulo: 'Variação de margem',
    grupo: 'Desempenho',
    tipo: 'numero',
    unidade: 'p.p.',
    natureza: 'estruturado',
    fonte: 'CVM · contas 3.05 e 7.04.01, dois exercícios',
    ler: (e) => e.variacaoMargem,
  },
  alavancagem: {
    rotulo: 'Dívida líquida / EBITDA',
    grupo: 'Balanço',
    tipo: 'numero',
    unidade: '×',
    natureza: 'estruturado',
    fonte: 'CVM · 2.01.04 + 2.02.01 − 1.01.01 − 1.01.02',
    ler: (e) => e.alavancagem,
  },
  liquidezCorrente: {
    rotulo: 'Liquidez corrente',
    grupo: 'Balanço',
    tipo: 'numero',
    unidade: '×',
    natureza: 'estruturado',
    fonte: 'CVM · 1.01 ÷ 2.01',
    ler: (e) => e.liquidezCorrente,
  },
  conversaoCaixa: {
    rotulo: 'Conversão de caixa',
    grupo: 'Balanço',
    tipo: 'numero',
    unidade: '% do EBITDA',
    natureza: 'estruturado',
    fonte: 'CVM · conta 6.01',
    ler: (e) => e.conversaoCaixa,
  },
  intensidadeInvestimento: {
    rotulo: 'Intensidade de investimento',
    grupo: 'Balanço',
    tipo: 'numero',
    unidade: '% da receita',
    natureza: 'estruturado',
    fonte: 'CVM · conta 6.02 ÷ receita',
    ler: (e) => e.intensidadeInvestimento,
  },
  contingenciasSobrePl: {
    rotulo: 'Contingências / patrimônio',
    grupo: 'Balanço',
    tipo: 'numero',
    unidade: '%',
    natureza: 'estruturado',
    fonte: 'CVM · 2.01.01 + 2.01.03 + 2.01.06 + 2.02.04 ÷ 2.03',
    ler: (e) => e.contingenciasSobrePl,
  },
  patrimonioLiquidoNegativo: {
    rotulo: 'Patrimônio líquido negativo',
    grupo: 'Balanço',
    tipo: 'booleano',
    natureza: 'estruturado',
    fonte: 'CVM · conta 2.03',
    ler: (e) => e.patrimonioLiquidoNegativo,
  },
  setor: {
    rotulo: 'Setor',
    grupo: 'Atividade',
    tipo: 'categoria',
    natureza: 'cadastral',
    fonte: 'Classificação setorial CVM',
    ler: (e) => e.setor,
  },
  subsetor: {
    rotulo: 'Subsegmento',
    grupo: 'Atividade',
    tipo: 'categoria',
    natureza: 'cadastral',
    fonte: 'Classificação setorial CVM',
    ler: (e) => e.subsetor,
  },
  uf: {
    rotulo: 'UF',
    grupo: 'Atividade',
    tipo: 'categoria',
    natureza: 'cadastral',
    fonte: 'Formulário cadastral CVM',
    ler: (e) => e.uf,
  },
  perfil: {
    rotulo: 'Perfil societário',
    grupo: 'Controle',
    tipo: 'categoria',
    natureza: 'cadastral',
    fonte: 'Formulário cadastral CVM',
    ler: (e) => e.perfil,
  },
  controle: {
    rotulo: 'Natureza do controle',
    grupo: 'Controle',
    tipo: 'categoria',
    natureza: 'cadastral',
    fonte: 'CVM · campo de controle acionário',
    ler: (e) => (e.cvm ? e.cvm.controle : null),
  },

  /* ---- CAMPO DERIVADO: foco vs diversificação ------------------------------
   * O documento pede exatamente este eixo (seção 4.1 e 4.2): "se a companhia
   * atua exatamente no setor específico, se é diversificada, se atua em
   * múltiplos mercados".
   *
   * ESTE CAMPO É UM PROXY E PRECISA SER LIDO COMO TAL. Diversificação de
   * verdade se mede pela abertura de receita por segmento, que a DFP não
   * publica em formato comparável. O que dá para afirmar com dado aberto é
   * mais estreito: companhia registrada como holding de participações, ou
   * classificada pela CVM em "Emp. Adm. Part.", administra participações em
   * vez de operar um negócio único — indício de diversificação, não prova.
   *
   * Preferi um proxy declarado a deixar o eixo de fora: sem ele, o pedido mais
   * literal do documento não teria resposta nenhuma na ferramenta. Com ele, o
   * usuário filtra e vê, ao lado, de onde veio a classificação.
   * ---------------------------------------------------------------------- */
  indicioDiversificacao: {
    rotulo: 'Indício de diversificação',
    grupo: 'Atividade',
    tipo: 'categoria',
    natureza: 'cadastral',
    fonte: 'Proxy: perfil societário + classificação CVM (não é receita por segmento)',
    proxy: true,
    ler: (e) => {
      const ehHolding = e.perfil === 'Holding de participações'
        || (typeof e.subsetor === 'string' && e.subsetor.indexOf('Emp. Adm. Part.') === 0);
      return ehHolding ? 'Diversificada (indício)' : 'Foco único (indício)';
    },
  },
};

/* ---- 2. OPERADORES ---------------------------------------------------------
 * Cada operador declara quais tipos de campo aceita, para a interface não
 * oferecer "maior que" sobre um campo de texto.
 * -------------------------------------------------------------------------- */
const OPERADORES = {
  maior_igual: {
    rotulo: '≥', tipos: ['numero'], precisaValor: true,
    testar: (v, alvo) => v >= alvo,
    descrever: (campo, alvo) => `${campo.rotulo} ≥ ${alvo}${campo.unidade ? ' ' + campo.unidade : ''}`,
  },
  menor_igual: {
    rotulo: '≤', tipos: ['numero'], precisaValor: true,
    testar: (v, alvo) => v <= alvo,
    descrever: (campo, alvo) => `${campo.rotulo} ≤ ${alvo}${campo.unidade ? ' ' + campo.unidade : ''}`,
  },
  entre: {
    rotulo: 'entre', tipos: ['numero'], precisaValor: true, precisaValor2: true,
    testar: (v, a, b) => v >= a && v <= b,
    descrever: (campo, a, b) => `${campo.rotulo} entre ${a} e ${b}${campo.unidade ? ' ' + campo.unidade : ''}`,
  },
  igual: {
    rotulo: 'é', tipos: ['categoria'], precisaValor: true,
    testar: (v, alvo) => String(v) === String(alvo),
    descrever: (campo, alvo) => `${campo.rotulo} é "${alvo}"`,
  },
  diferente: {
    rotulo: 'não é', tipos: ['categoria'], precisaValor: true,
    testar: (v, alvo) => String(v) !== String(alvo),
    descrever: (campo, alvo) => `${campo.rotulo} não é "${alvo}"`,
  },
  contem: {
    rotulo: 'contém', tipos: ['categoria'], precisaValor: true,
    testar: (v, alvo) => String(v).toLowerCase().indexOf(String(alvo).toLowerCase()) !== -1,
    descrever: (campo, alvo) => `${campo.rotulo} contém "${alvo}"`,
  },
  verdadeiro: {
    rotulo: 'é verdadeiro', tipos: ['booleano'], precisaValor: false,
    testar: (v) => v === true,
    descrever: (campo) => `${campo.rotulo}: sim`,
  },
  falso: {
    rotulo: 'é falso', tipos: ['booleano'], precisaValor: false,
    testar: (v) => v === false,
    descrever: (campo) => `${campo.rotulo}: não`,
  },
};

/** Operadores válidos para um campo — a interface usa isto para montar o seletor. */
function operadoresPara(chaveCampo) {
  const campo = CAMPOS[chaveCampo];
  if (!campo) return [];
  const saida = [];
  for (const chave in OPERADORES) {
    if (OPERADORES[chave].tipos.indexOf(campo.tipo) !== -1) {
      saida.push({ chave, ...OPERADORES[chave] });
    }
  }
  return saida;
}

/** Valores distintos de um campo categórico na base — alimenta o seletor. */
function valoresDe(chaveCampo, empresas) {
  const campo = CAMPOS[chaveCampo];
  if (!campo || campo.tipo !== 'categoria') return [];
  const vistos = {};
  for (const e of empresas) {
    const v = campo.ler(e);
    if (v !== null && v !== undefined && v !== '') vistos[v] = true;
  }
  return Object.keys(vistos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/* ---- 3. AVALIAÇÃO ----------------------------------------------------------
 * Devolve true (atende), false (não atende) ou null (a empresa não publicou o
 * dado). O terceiro estado é o ponto: quem consome decide se ausência reprova,
 * e a interface consegue dizer "3 empresas sem o dado" em vez de escondê-las
 * entre as reprovadas.
 * -------------------------------------------------------------------------- */
function avaliarCriterio(empresa, criterio) {
  const campo = CAMPOS[criterio.campo];
  const operador = OPERADORES[criterio.operador];
  if (!campo || !operador) return null;

  const valor = campo.ler(empresa);
  if (valor === null || valor === undefined || valor === '') return null;

  return operador.testar(valor, criterio.valor, criterio.valor2) === true;
}

/** Texto legível do critério — vai para a interface, o CSV e o Excel. */
function descreverCriterio(criterio) {
  const campo = CAMPOS[criterio.campo];
  const operador = OPERADORES[criterio.operador];
  if (!campo || !operador) return 'Critério inválido';
  return operador.descrever(campo, criterio.valor, criterio.valor2);
}

/** Fonte do dado por trás do critério — para exibir ao lado da regra. */
function fonteCriterio(criterio) {
  const campo = CAMPOS[criterio.campo];
  return campo ? campo.fonte : null;
}

/**
 * Converte um critério do usuário no formato que scoring.js consome.
 * A chave recebe prefixo `adhoc:` para nunca colidir com um sinal do catálogo.
 */
function comoSinal(criterio) {
  const campo = CAMPOS[criterio.campo];
  return {
    chave: 'adhoc:' + criterio.id,
    rotulo: criterio.rotulo || descreverCriterio(criterio),
    tipo: 'positivo',
    natureza: campo ? campo.natureza : 'estruturado',
    peso: Number(criterio.peso) || 0,
    detalhe: descreverCriterio(criterio) + (campo && campo.proxy ? ' · proxy declarado' : ''),
    fonte: fonteCriterio(criterio),
    ativo: (e) => avaliarCriterio(e, criterio) === true,
  };
}

/* ---- 4. TEMPLATES (seção 4.3 do documento) ---------------------------------
 * "salvar configurações de critérios e pesos como templates reutilizáveis".
 *
 * Persistência em localStorage, com queda para memória. O protótipo roda por
 * duplo-clique em file://, e nessa origem alguns navegadores recusam
 * localStorage — sem a queda, o recurso quebraria exatamente no cenário de
 * demonstração que o projeto existe para atender.
 *
 * Limite conhecido: o template fica na máquina de quem salvou. Compartilhar
 * entre o time (que é o objetivo declarado — "padroniza a metodologia entre os
 * membros") exige servidor, e o repositório ainda não tem um. Por isso existe
 * exportar/importar: o arquivo JSON é o meio de circular um template hoje.
 * -------------------------------------------------------------------------- */
const CHAVE_ARMAZENAMENTO = 'ght4.templates.v1';
let memoriaLocal = null;

function lerArmazenamento() {
  if (memoriaLocal) return memoriaLocal;
  try {
    const cru = window.localStorage.getItem(CHAVE_ARMAZENAMENTO);
    memoriaLocal = cru ? JSON.parse(cru) : {};
  } catch {
    memoriaLocal = {};
  }
  return memoriaLocal;
}

function gravarArmazenamento(dados) {
  memoriaLocal = dados;
  try {
    window.localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(dados));
    return true;
  } catch {
    /* Sessão em file:// sem localStorage: o template vale enquanto a aba viver.
       Devolver false permite à interface avisar em vez de mentir que salvou. */
    return false;
  }
}

function listarTemplates() {
  const dados = lerArmazenamento();
  return Object.keys(dados)
    .map((id) => dados[id])
    .sort((a, b) => (b.salvoEm || '').localeCompare(a.salvoEm || ''));
}

function salvarTemplate(nome, configuracao) {
  const dados = lerArmazenamento();
  const id = 'tpl_' + Date.now().toString(36);
  dados[id] = {
    id,
    nome,
    salvoEm: new Date().toISOString(),
    configuracao: JSON.parse(JSON.stringify(configuracao)),
  };
  const persistiu = gravarArmazenamento(dados);
  return { template: dados[id], persistiu };
}

function removerTemplate(id) {
  const dados = lerArmazenamento();
  delete dados[id];
  return gravarArmazenamento(dados);
}

function exportarTemplate(template) {
  return JSON.stringify(template, null, 2);
}

function importarTemplate(textoJson) {
  const lido = JSON.parse(textoJson);
  if (!lido || !lido.configuracao) throw new Error('Arquivo não parece um template da GHT4.');
  return salvarTemplate(lido.nome || 'Template importado', lido.configuracao);
}

/* ---- 5. CONFIGURAÇÃO CORRENTE ----------------------------------------------
 * Formato único que circula entre interface, motor e exportação:
 *
 *   { pesos: { alvo: {chaveSinal: peso}, comprador: {...}, vendedora: {...} },
 *     criterios: [ {id, campo, operador, valor, valor2, peso, papel, rotulo} ] }
 *
 * `papel` no critério define em qual índice ele entra ('alvo' | 'comprador' |
 * 'vendedora'). Um critério ad hoc não faz sentido em todos os papéis ao mesmo
 * tempo: "quero empresas mais focadas" pesa na escolha do alvo, não na do
 * comprador que vou abordar depois.
 * -------------------------------------------------------------------------- */
function configuracaoPadrao() {
  const pesos = {};
  const papeis = window.MOTOR ? window.MOTOR.CONFIG_PAPEIS : {};
  for (const papel in papeis) {
    pesos[papel] = { ...papeis[papel].pesos };
  }
  return { pesos, criterios: [] };
}

/** Diferenças entre a configuração corrente e a padrão — a interface mostra o que foi mexido. */
function ajustesAplicados(config) {
  const padrao = configuracaoPadrao();
  const mudancas = [];
  for (const papel in config.pesos) {
    for (const sinal in config.pesos[papel]) {
      const de = padrao.pesos[papel] ? padrao.pesos[papel][sinal] : undefined;
      const para = config.pesos[papel][sinal];
      if (de !== para) {
        mudancas.push({
          papel,
          sinal,
          rotulo: window.MOTOR && window.MOTOR.SINAIS[sinal] ? window.MOTOR.SINAIS[sinal].rotulo : sinal,
          de: de === undefined ? 0 : de,
          para,
        });
      }
    }
  }
  return { pesos: mudancas, criterios: config.criterios ? config.criterios.length : 0 };
}

window.CONFIGURACAO = {
  CAMPOS, OPERADORES,
  operadoresPara, valoresDe,
  avaliarCriterio, descreverCriterio, fonteCriterio, comoSinal,
  listarTemplates, salvarTemplate, removerTemplate, exportarTemplate, importarTemplate,
  configuracaoPadrao, ajustesAplicados,
};
