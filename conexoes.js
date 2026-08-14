/* =============================================================================
 *  GHT4 · ANÁLISE DE CONEXÕES DA REDE  (Módulo 4)
 * -----------------------------------------------------------------------------
 *  "qualquer conexão existente com uma companhia é um diferencial que aumenta
 *   significativamente a taxa de conversão em comparação a um cold call"
 *                                        — Documento de Requisitos, seção 5
 *
 *  ESCOPO DECIDIDO: SÓ MATERIAL INTERNO
 *  O documento admitia duas fontes: material que a GHT4 envia (currículos,
 *  listas de contatos) e busca pública automatizada (LinkedIn, notícias). Ficou
 *  decidido usar apenas a primeira. A segunda violaria os termos de uso do
 *  LinkedIn e criaria tratamento de dado pessoal em escala, que sob a LGPD exige
 *  base legal — decisão jurídica, não técnica. Este arquivo, portanto, NÃO
 *  raspa nada: ele cruza o que a casa já sabe.
 *
 *  O QUE FALTA DO OUTRO LADO DA PONTE
 *  Uma conexão tem duas pontas: alguém da GHT4 e alguém da companhia. A primeira
 *  ponta a casa tem. A SEGUNDA NÃO EXISTE EM DADO ABERTO — a base da CVM traz
 *  apenas o contato de Relações com Investidores, nunca o quadro de sócios,
 *  executivos e conselheiros. Por isso os vínculos que este módulo consegue
 *  afirmar hoje são os que partem do lado da GHT4 (passagem pela empresa,
 *  contato nomeado, cobertura setorial), e os que dependeriam de conhecer os
 *  executivos do alvo ficam declarados em LIMITACOES_REDE.
 *
 *  Consequência de produto: o módulo é honesto sobre ser um PONTO DE PARTIDA
 *  para a conversa — "fulano trabalhou lá entre 2015 e 2019" — e não um grafo
 *  de relacionamento completo.
 * ========================================================================== */

/* ---- 1. NORMALIZAÇÃO DE NOMES ---------------------------------------------
 * "RAÍZEN S.A.", "Raízen S/A" e "raizen sa" são a mesma empresa. Sem
 * normalizar, o cruzamento não encontra praticamente nada — e um módulo de
 * conexões que não encontra nada é indistinguível de um que não existe.
 * -------------------------------------------------------------------------- */
const SUFIXOS = /\b(s\.?\/?a\.?|ltda\.?|epp|me|eireli|s\/?c|participacoes|participacao|holding|do brasil|brasil|group|grupo|companhia|cia\.?)\b/g;

function normalizar(texto) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tira acento
    .replace(/[.,\-/]/g, ' ')
    .replace(SUFIXOS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Duas denominações se referem à mesma empresa?
 *
 * A regra é PREFIXO, não contenção em qualquer posição, e a diferença apareceu
 * num teste real: com contenção livre, "Vamos Comércio de Máquinas Linha
 * Amarela S.A." casava com o contato registrado na "Linha Amarela S/A" — duas
 * companhias sem relação nenhuma, uma revenda de máquinas e uma concessionária
 * de rodovia. Prefixo aceita "Raízen" ⊂ "Raízen Energia", que é o caso legítimo
 * que se quer capturar, e recusa o nome que apenas termina igual.
 *
 * Continua sendo possível errar — nome de fantasia genérico ainda casa — e por
 * isso todo vínculo carrega o texto que o originou, para conferência humana.
 */
function mesmaEmpresa(a, b) {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  /* Abaixo de 5 caracteres, sigla casa com meio mundo: "epr" pegaria qualquer
     coisa começada por EPR e o módulo passaria a inventar vínculo. */
  if (na.length < 5 || nb.length < 5) return false;

  const [curto, longo] = na.length <= nb.length ? [na, nb] : [nb, na];
  /* O caractere seguinte precisa ser separador: sem isso "vale" casaria com
     "valense", que é outra empresa. */
  return longo.startsWith(curto) && longo[curto.length] === ' ';
}

/* ---- 2. TIPOS DE VÍNCULO ---------------------------------------------------
 * Cada tipo declara quanto vale e por quê. A soma é limitada a 100.
 *
 * A escala não é opinião de quem programou: ela reflete o que o documento diz
 * ser o valor da conexão — encurtar a distância até uma conversa. Um contato
 * nomeado dentro da companhia rende uma ligação hoje; cobrir o setor rende, no
 * máximo, um assunto em comum.
 * -------------------------------------------------------------------------- */
const TIPOS_VINCULO = {
  contato_direto: {
    rotulo: 'Contato nomeado na companhia',
    peso: 45,
    forca: 'direta',
    explicacao: 'Alguém da GHT4 tem contato nominal dentro da companhia. É o vínculo que substitui o cold call.',
  },
  passagem_profissional: {
    rotulo: 'Passagem profissional pela companhia',
    peso: 40,
    forca: 'direta',
    explicacao: 'Um membro da casa trabalhou na companhia. Dá acesso e, sobretudo, contexto interno.',
  },
  contato_no_grupo: {
    rotulo: 'Contato no mesmo grupo econômico',
    peso: 25,
    forca: 'indireta',
    explicacao: 'O contato está em outra empresa da mesma raiz de CNPJ — porta de entrada lateral.',
  },
  formacao_comum: {
    rotulo: 'Formação em comum',
    peso: 15,
    forca: 'indireta',
    explicacao: 'Mesma instituição de ensino que um contato conhecido da companhia.',
  },
  cobertura_setorial: {
    rotulo: 'Cobertura do setor',
    peso: 10,
    forca: 'fraca',
    explicacao: 'O membro cobre o setor da companhia. Não é relacionamento, é repertório.',
  },
  mesma_praca: {
    rotulo: 'Mesma praça',
    peso: 5,
    forca: 'fraca',
    explicacao: 'Membro e companhia na mesma UF. Vale como facilitador de agenda, não como acesso.',
  },
};

const NIVEIS = [
  { min: 60, chave: 'forte', rotulo: 'Conexão direta' },
  { min: 35, chave: 'media', rotulo: 'Conexão indireta' },
  { min: 15, chave: 'fraca', rotulo: 'Conexão fraca' },
  { min: 1, chave: 'tenue', rotulo: 'Vínculo tênue' },
  { min: 0, chave: 'nenhuma', rotulo: 'Sem conexão mapeada' },
];

function nivelDe(forca) {
  for (const n of NIVEIS) if (forca >= n.min) return n;
  return NIVEIS[NIVEIS.length - 1];
}

/* ---- 3. A REDE -------------------------------------------------------------
 * Formato de um membro — é o que a importação recebe e o que a casa preenche:
 *
 *   { id, nome, cargo, uf,
 *     historico: [{ empresa, cargo, de, ate }],
 *     contatos:  [{ nome, empresa, cargo, relacao }],
 *     formacao:  [{ instituicao, curso, ano }],
 *     setores:   ['Transporte & Logística', ...] }
 *
 * "Cobrir todos os membros da GHT4 (grupo inteiro, não apenas a Advisory)" —
 * seção 5. Por isso o membro tem `area`, para distinguir de onde ele vem sem
 * excluir ninguém do cruzamento.
 * -------------------------------------------------------------------------- */
const CHAVE_REDE = 'ght4.rede.v1';
let redeEmMemoria = null;

function lerRede() {
  if (redeEmMemoria) return redeEmMemoria;
  try {
    const cru = window.localStorage.getItem(CHAVE_REDE);
    redeEmMemoria = cru ? JSON.parse(cru) : [];
  } catch {
    redeEmMemoria = [];
  }
  return redeEmMemoria;
}

function gravarRede(membros) {
  redeEmMemoria = membros;
  cacheAnalise = {};
  try {
    window.localStorage.setItem(CHAVE_REDE, JSON.stringify(membros));
    return true;
  } catch {
    return false;
  }
}

function membros() { return lerRede(); }

function adicionarMembro(membro) {
  const atual = lerRede();
  const novo = { id: 'm' + Date.now().toString(36), ...membro };
  const persistiu = gravarRede([...atual, novo]);
  return { membro: novo, persistiu };
}

function removerMembro(id) {
  return gravarRede(lerRede().filter((m) => m.id !== id));
}

/**
 * Importa a rede de um JSON. Aceita tanto `[{...}]` quanto `{ membros: [...] }`,
 * porque as duas formas aparecem quando alguém exporta de planilha.
 */
function importarRede(textoJson, substituir) {
  const lido = JSON.parse(textoJson);
  const lista = Array.isArray(lido) ? lido : lido.membros;
  if (!Array.isArray(lista)) throw new Error('Esperava uma lista de membros ou { membros: [...] }.');

  const normalizados = lista.map((m, i) => ({
    id: m.id || 'm' + Date.now().toString(36) + i,
    nome: m.nome || 'Sem nome',
    cargo: m.cargo || '',
    area: m.area || 'GHT4',
    uf: m.uf || '',
    historico: Array.isArray(m.historico) ? m.historico : [],
    contatos: Array.isArray(m.contatos) ? m.contatos : [],
    formacao: Array.isArray(m.formacao) ? m.formacao : [],
    setores: Array.isArray(m.setores) ? m.setores : [],
  }));

  const persistiu = gravarRede(substituir ? normalizados : [...lerRede(), ...normalizados]);
  return { quantidade: normalizados.length, persistiu };
}

function exportarRede() {
  return JSON.stringify({ membros: lerRede() }, null, 2);
}

function limparRede() { return gravarRede([]); }

/* ---- 4. ANÁLISE ------------------------------------------------------------
 * O cache não é otimização prematura: `analisar` roda para cada uma das 537
 * empresas a cada render da lista, e cada chamada percorre a rede inteira.
 * -------------------------------------------------------------------------- */
let cacheAnalise = {};

function _raizCnpjDaEmpresa(empresa) {
  const cnpj = empresa && empresa.cvm && empresa.cvm.cnpj;
  if (!cnpj) return null;
  const digitos = String(cnpj).replace(/\D/g, '');
  return digitos.length >= 8 ? digitos.slice(0, 8) : null;
}

/**
 * Analisa os vínculos entre a rede da GHT4 e uma companhia.
 * Devolve força 0–100, o nível e a lista de vínculos encontrados, cada um com
 * o membro, o tipo e o detalhe que sustenta a afirmação.
 */
function analisar(empresa) {
  if (!empresa) return { forca: 0, nivel: nivelDe(0), vinculos: [] };
  if (cacheAnalise[empresa.id]) return cacheAnalise[empresa.id];

  const rede = lerRede();
  const vinculos = [];
  const nomesDaEmpresa = [empresa.nome, empresa.cvm && empresa.cvm.razaoSocial].filter(Boolean);
  const raiz = _raizCnpjDaEmpresa(empresa);

  for (const membro of rede) {
    for (const passagem of membro.historico || []) {
      if (nomesDaEmpresa.some((n) => mesmaEmpresa(n, passagem.empresa))) {
        vinculos.push({
          tipo: 'passagem_profissional',
          membro: membro.nome,
          area: membro.area,
          detalhe: `${passagem.cargo || 'Passagem'} na companhia`
            + (passagem.de || passagem.ate ? ` (${passagem.de || '?'}–${passagem.ate || 'atual'})` : ''),
          fonte: 'Currículo enviado pela GHT4',
        });
      }
    }

    for (const contato of membro.contatos || []) {
      if (nomesDaEmpresa.some((n) => mesmaEmpresa(n, contato.empresa))) {
        vinculos.push({
          tipo: 'contato_direto',
          membro: membro.nome,
          area: membro.area,
          detalhe: `${contato.nome}${contato.cargo ? ` · ${contato.cargo}` : ''}`
            + `${contato.relacao ? ` — ${contato.relacao}` : ''}`,
          fonte: 'Lista de contatos enviada pela GHT4',
        });
      } else if (raiz && contato.cnpj && String(contato.cnpj).replace(/\D/g, '').slice(0, 8) === raiz) {
        vinculos.push({
          tipo: 'contato_no_grupo',
          membro: membro.nome,
          area: membro.area,
          detalhe: `${contato.nome} em ${contato.empresa} — mesmo grupo econômico`,
          fonte: 'Lista de contatos + raiz de CNPJ',
        });
      }
    }

    if ((membro.setores || []).includes(empresa.setor)) {
      vinculos.push({
        tipo: 'cobertura_setorial',
        membro: membro.nome,
        area: membro.area,
        detalhe: `Cobre ${empresa.setor}`,
        fonte: 'Cadastro interno da GHT4',
      });
    }

    if (membro.uf && empresa.uf && membro.uf === empresa.uf) {
      vinculos.push({
        tipo: 'mesma_praca',
        membro: membro.nome,
        area: membro.area,
        detalhe: `Ambos em ${empresa.uf}`,
        fonte: 'Cadastro interno da GHT4',
      });
    }
  }

  /* Um mesmo tipo de vínculo não soma duas vezes: dois sócios que cobrem o
     mesmo setor não dobram o acesso à companhia. Vale o vínculo mais forte de
     cada tipo, e os demais aparecem na lista sem pontuar. */
  const tiposContados = {};
  let forca = 0;
  for (const v of vinculos) {
    v.rotulo = TIPOS_VINCULO[v.tipo].rotulo;
    v.forcaVinculo = TIPOS_VINCULO[v.tipo].forca;
    if (!tiposContados[v.tipo]) {
      tiposContados[v.tipo] = true;
      forca += TIPOS_VINCULO[v.tipo].peso;
      v.pontuou = true;
    } else {
      v.pontuou = false;
    }
  }
  forca = Math.min(100, forca);

  const ordem = { direta: 0, indireta: 1, fraca: 2 };
  vinculos.sort((a, b) => ordem[a.forcaVinculo] - ordem[b.forcaVinculo]);

  const resultado = { forca, nivel: nivelDe(forca), vinculos, membrosNaRede: rede.length };
  cacheAnalise[empresa.id] = resultado;
  return resultado;
}

/** Atalho consumido pelo catálogo de critérios (configuracao.js). */
function forcaDe(empresa) {
  return analisar(empresa).forca;
}

/**
 * Existe vínculo que de fato encurta o caminho até uma conversa?
 *
 * A distinção não é acadêmica. Na primeira execução contra a base real, 479 das
 * 537 companhias apareciam "com conexão" — porque cobrir o setor e estar na
 * mesma UF casam com quase tudo. Um critério que aprova 89% da base não filtra
 * nada, e pior: dá ao sócio a impressão de que a casa tem entrada em todo
 * lugar. Só contam aqui os vínculos nomeáveis — contato dentro da companhia,
 * passagem profissional, contato no mesmo grupo. Praça e setor continuam
 * visíveis e continuam somando força, mas não fazem uma empresa passar por
 * "temos alguém lá dentro".
 */
function temVinculoRelevante(empresa) {
  return analisar(empresa).vinculos.some((v) => v.forcaVinculo !== 'fraca');
}

/** Empresas com alguma conexão, da mais forte para a mais fraca. */
function ranquearPorConexao(empresas) {
  return empresas
    .map((e) => ({ empresa: e, ...analisar(e) }))
    .filter((r) => r.forca > 0)
    .sort((a, b) => b.forca - a.forca);
}

/* ---- 5. LIMITAÇÕES DECLARADAS --------------------------------------------- */
const LIMITACOES_REDE = [
  {
    titulo: 'A outra ponta da conexão não é pública',
    texto: 'Sócios, executivos e conselheiros das companhias não constam da base aberta da CVM — o único contato que ela publica é o de Relações com Investidores. Os vínculos aqui partem do que a GHT4 sabe, não de quem está do outro lado.',
    viaDeObtencao: 'Formulário de Referência (item 12) para companhias abertas, ou base paga (EMIS, Capital IQ) para o quadro societário.',
  },
  {
    titulo: 'Sem varredura automatizada',
    texto: 'Por decisão do escopo, o módulo não consulta LinkedIn nem faz busca pública automatizada. Isso evita violar termos de uso e tratamento de dado pessoal em escala, e significa que a qualidade do módulo é exatamente a qualidade do material que a casa enviar.',
    viaDeObtencao: 'Currículos e listas de contatos mantidos atualizados pelo time.',
  },
  {
    titulo: 'Homônimos e nomes de fantasia',
    texto: 'O cruzamento normaliza razão social e nome de fantasia, mas empresa com denominação genérica pode gerar falso positivo. Todo vínculo mostra o texto que o originou, para conferência humana antes da abordagem.',
    viaDeObtencao: 'Conferência no momento da triagem — a trilha de auditoria já registra quem confirmou.',
  },
];

/* ---- 6. REDE DE DEMONSTRAÇÃO -----------------------------------------------
 * Pessoas FICTÍCIAS, para o módulo poder ser demonstrado antes de a GHT4 enviar
 * o material real. Os nomes de empresa apontam para companhias reais da base da
 * CVM de propósito: sem isso, nenhum vínculo apareceria na demonstração e a
 * tela pareceria quebrada. Carregada só sob pedido explícito na interface.
 * -------------------------------------------------------------------------- */
const REDE_DEMONSTRACAO = [
  {
    id: 'demo1', nome: 'Sócio A (fictício)', cargo: 'Sócio · Originação', area: 'GHT4 Advisory', uf: 'SP',
    setores: ['Transporte & Logística', 'Indústria de base'],
    historico: [{ empresa: 'Autopista Fernão Dias', cargo: 'Gerente de Planejamento', de: '2014', ate: '2018' }],
    contatos: [{ nome: 'Contato 1 (fictício)', empresa: 'Santos Brasil Participações', cargo: 'Diretor Financeiro', relacao: 'ex-colega' }],
    formacao: [{ instituicao: 'Instituição X', curso: 'Engenharia', ano: '2008' }],
  },
  {
    id: 'demo2', nome: 'Sócia B (fictícia)', cargo: 'Sócia · Execução', area: 'GHT4 Advisory', uf: 'RJ',
    setores: ['Energia'],
    historico: [],
    contatos: [{ nome: 'Contato 2 (fictício)', empresa: 'Linha Amarela', cargo: 'Conselheiro', relacao: 'conselho compartilhado' }],
    formacao: [],
  },
  {
    id: 'demo3', nome: 'Diretor C (fictício)', cargo: 'Diretor', area: 'Grupo GHT4 (não Advisory)', uf: 'SP',
    setores: ['Varejo', 'Alimentos & Agro'],
    historico: [{ empresa: 'Maestro Locadora de Veículos', cargo: 'Diretor de Operações', de: '2019', ate: '2023' }],
    contatos: [],
    formacao: [],
  },
];

function carregarRedeDemonstracao() {
  return gravarRede(REDE_DEMONSTRACAO.map((m) => ({ ...m })));
}

window.CONEXOES = {
  TIPOS_VINCULO, NIVEIS, REDE_DEMONSTRACAO,
  LIMITACOES: LIMITACOES_REDE,
  membros, adicionarMembro, removerMembro,
  importarRede, exportarRede, limparRede, carregarRedeDemonstracao,
  analisar, forcaDe, temVinculoRelevante, ranquearPorConexao,
  normalizar, mesmaEmpresa, nivelDe,
};
