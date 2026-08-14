/* =============================================================================
 *  GHT4 · CRM / PIPELINE DE PROSPECÇÃO  (Módulo 7)
 * -----------------------------------------------------------------------------
 *  O documento trata este módulo como "vertical separada da solução, que
 *  eventualmente se integrará ao modelo de IA, recebendo automaticamente dados
 *  das pesquisas" (seção 8). A integração já é possível aqui: a empresa entra no
 *  funil a partir de qualquer tela — mapa, ranking ou lista de compradores —
 *  carregando junto o índice, a classificação e o subsegmento do momento em que
 *  entrou.
 *
 *  POR QUE GUARDAR O ÍNDICE NO MOMENTO DA ENTRADA
 *  Porque ele muda. O sócio ajusta pesos, a base é reimportada, e seis meses
 *  depois ninguém consegue responder "por que a gente abordou essa empresa?".
 *  O registro congela o número e a régua que o produziram — é a mesma lógica da
 *  trilha de auditoria da triagem, aplicada à decisão comercial.
 *
 *  O QUE ESTA IMPLEMENTAÇÃO NÃO É
 *  É monousuário e local: os dados ficam no navegador de quem usou. O documento
 *  pede "agendas de prospecção de CADA colaborador" e tracking por colaborador,
 *  o que pressupõe várias pessoas vendo o mesmo funil — e isso exige servidor.
 *  O campo `responsavel` já existe e o funil já separa por pessoa, então a troca
 *  do armazenamento local por uma API não muda o formato do dado nem as telas.
 *  Ver LIMITACOES_CRM.
 * ========================================================================== */

/* ---- 1. O FUNIL ------------------------------------------------------------
 * As etapas são exatamente as da seção 8 do documento, na ordem em que ele as
 * lista. `recusada` fica fora da sequência de propósito: recusa não é uma etapa
 * mais avançada que "proposta enviada", é uma saída — e tratá-la como etapa
 * final inflaria qualquer métrica de progresso do funil.
 * -------------------------------------------------------------------------- */
const ESTADOS_FUNIL = [
  { chave: 'identificada', rotulo: 'Identificada', ordem: 1,
    descricao: 'Empresa priorizada pela ferramenta, ainda sem contato.' },
  { chave: 'contatada', rotulo: 'Contatada', ordem: 2,
    descricao: 'Primeira abordagem feita — e-mail, telefone ou apresentação.' },
  { chave: 'conversa_inicial', rotulo: 'Conversa inicial', ordem: 3,
    descricao: 'Houve conversa. A descrição da call fica no registro.' },
  { chave: 'proposta_enviada', rotulo: 'Proposta enviada', ordem: 4,
    descricao: 'Proposta de mandato formalizada.' },
  { chave: 'mandato_fechado', rotulo: 'Mandato fechado', ordem: 5,
    descricao: 'Mandato assinado.' },
  { chave: 'recusada', rotulo: 'Recusada', ordem: 0, saida: true,
    descricao: 'Não avançou. O motivo e a resposta específica ficam registrados.' },
];

function estadoDe(chave) {
  return ESTADOS_FUNIL.find((e) => e.chave === chave) || ESTADOS_FUNIL[0];
}

/* Motivos de recusa: lista fechada para as métricas serem agregáveis, mais um
   campo livre para a resposta específica — que é o que o documento pede
   ("comentários sobre o motivo e respostas específicas"). Texto livre sozinho
   não permite responder "por que perdemos os mandatos deste trimestre?". */
const MOTIVOS_RECUSA = [
  { chave: 'sem_interesse', rotulo: 'Sem interesse em transacionar' },
  { chave: 'momento_errado', rotulo: 'Momento errado — talvez adiante' },
  { chave: 'ja_assessorada', rotulo: 'Já tem assessor' },
  { chave: 'preco_expectativa', rotulo: 'Expectativa de preço incompatível' },
  { chave: 'sem_retorno', rotulo: 'Não respondeu' },
  { chave: 'conflito', rotulo: 'Conflito de interesse' },
  { chave: 'outro', rotulo: 'Outro' },
];

/* ---- 2. ARMAZENAMENTO ------------------------------------------------------ */
const CHAVE_CRM = 'ght4.crm.v1';
let crmEmMemoria = null;

function lerCrm() {
  if (crmEmMemoria) return crmEmMemoria;
  try {
    const cru = window.localStorage.getItem(CHAVE_CRM);
    crmEmMemoria = cru ? JSON.parse(cru) : {};
  } catch {
    crmEmMemoria = {};
  }
  return crmEmMemoria;
}

function gravarCrm(dados) {
  crmEmMemoria = dados;
  try {
    window.localStorage.setItem(CHAVE_CRM, JSON.stringify(dados));
    return true;
  } catch {
    return false;
  }
}

function agora() { return new Date().toISOString(); }

/* ---- 3. REGISTROS ---------------------------------------------------------- */

function registros() {
  const dados = lerCrm();
  return Object.keys(dados).map((id) => dados[id]);
}

function registroDe(empresaId) {
  return lerCrm()[empresaId] || null;
}

/**
 * Coloca uma empresa no funil. `avaliada` é a empresa já pontuada pelo motor —
 * dela saem o retrato congelado e os dados de contato.
 *
 * Reentrada é idempotente: chamar duas vezes não zera o histórico de quem já
 * está no funil. Sem essa guarda, um clique repetido no botão "levar ao
 * pipeline" apagaria meses de trilha.
 */
function adicionar(avaliada, responsavel) {
  const dados = lerCrm();
  if (dados[avaliada.id]) return { registro: dados[avaliada.id], jaExistia: true, persistiu: true };

  const registro = {
    empresaId: avaliada.id,
    nome: avaliada.nome,
    setor: avaliada.setor,
    subsetor: avaliada.subsetor,
    uf: avaliada.uf,
    contato: avaliada.contato || null,
    responsavel: responsavel || 'Sem responsável',
    estado: 'identificada',
    criadoEm: agora(),
    /* Retrato do momento da entrada — ver o cabeçalho do arquivo. */
    retrato: {
      indice: avaliada.scorePrincipal,
      classificacao: avaliada.classificacao,
      receita: avaliada.receita,
      margemEbitda: avaliada.margemEbitda,
      lastro: avaliada.rotuloLastro ? avaliada.rotuloLastro.rotulo : null,
      origem: avaliada.origem,
      dataDoDado: avaliada.dataAtualizacao,
    },
    historico: [{
      de: null, para: 'identificada', quem: responsavel || 'Sem responsável',
      quando: agora(), nota: 'Entrou no funil a partir da priorização.',
    }],
    calls: [],
    recusa: null,
  };

  dados[avaliada.id] = registro;
  return { registro, jaExistia: false, persistiu: gravarCrm(dados) };
}

/**
 * Move a empresa de etapa. A trilha é append-only: nenhum movimento apaga o
 * anterior, pelo mesmo motivo que a triagem do protótipo não deixa apagar quem
 * aprovou o quê.
 */
function mover(empresaId, novoEstado, { quem, nota, motivoRecusa, respostaRecusa } = {}) {
  const dados = lerCrm();
  const registro = dados[empresaId];
  if (!registro) return { erro: 'Empresa não está no funil.' };

  const anterior = registro.estado;
  registro.estado = novoEstado;
  registro.historico.push({
    de: anterior, para: novoEstado,
    quem: quem || registro.responsavel,
    quando: agora(),
    nota: nota || '',
  });

  if (novoEstado === 'recusada') {
    registro.recusa = {
      motivo: motivoRecusa || 'outro',
      resposta: respostaRecusa || '',
      registradaEm: agora(),
    };
  }

  return { registro, persistiu: gravarCrm(dados) };
}

/** Descrição de uma call — "descrições das calls", seção 8. */
function anotarCall(empresaId, { quem, data, descricao }) {
  const dados = lerCrm();
  const registro = dados[empresaId];
  if (!registro) return { erro: 'Empresa não está no funil.' };

  registro.calls.push({
    quem: quem || registro.responsavel,
    data: data || agora().slice(0, 10),
    descricao: descricao || '',
    registradaEm: agora(),
  });
  return { registro, persistiu: gravarCrm(dados) };
}

function trocarResponsavel(empresaId, responsavel) {
  const dados = lerCrm();
  const registro = dados[empresaId];
  if (!registro) return { erro: 'Empresa não está no funil.' };
  const antes = registro.responsavel;
  registro.responsavel = responsavel;
  registro.historico.push({
    de: registro.estado, para: registro.estado, quem: responsavel,
    quando: agora(), nota: `Responsável alterado de ${antes} para ${responsavel}.`,
  });
  return { registro, persistiu: gravarCrm(dados) };
}

function remover(empresaId) {
  const dados = lerCrm();
  delete dados[empresaId];
  return gravarCrm(dados);
}

/* ---- 4. MÉTRICAS ----------------------------------------------------------- */

function responsaveis() {
  const vistos = {};
  for (const r of registros()) vistos[r.responsavel] = true;
  return Object.keys(vistos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Funil de um colaborador (ou de todos). Devolve a contagem por etapa e as
 * taxas de conversão entre etapas consecutivas.
 *
 * A contagem por etapa é CUMULATIVA: quem chegou a "proposta enviada" passou
 * por "contatada" e continua contando lá. Sem isso, a taxa de conversão
 * compararia grupos disjuntos e daria números sem sentido — foi o erro que a
 * versão ingênua deste cálculo produziu.
 */
function funil(responsavel) {
  const lista = responsavel
    ? registros().filter((r) => r.responsavel === responsavel)
    : registros();

  const etapas = ESTADOS_FUNIL.filter((e) => !e.saida).sort((a, b) => a.ordem - b.ordem);
  const contagem = {};

  for (const etapa of etapas) {
    contagem[etapa.chave] = lista.filter((r) => {
      /* Alcançou a etapa se passou por ela em algum momento — a trilha responde
         isso mesmo depois de a empresa recusar mais adiante. */
      return r.historico.some((h) => h.para === etapa.chave);
    }).length;
  }

  const conversoes = [];
  for (let i = 1; i < etapas.length; i++) {
    const de = contagem[etapas[i - 1].chave];
    const para = contagem[etapas[i].chave];
    conversoes.push({
      de: etapas[i - 1].rotulo,
      para: etapas[i].rotulo,
      taxa: de > 0 ? Math.round((para / de) * 100) : null,
      absoluto: `${para} de ${de}`,
    });
  }

  const recusadas = lista.filter((r) => r.estado === 'recusada');
  const porMotivo = {};
  for (const r of recusadas) {
    const chave = r.recusa ? r.recusa.motivo : 'outro';
    porMotivo[chave] = (porMotivo[chave] || 0) + 1;
  }

  return {
    responsavel: responsavel || 'Todos',
    total: lista.length,
    contagem,
    conversoes,
    ativas: lista.filter((r) => r.estado !== 'recusada' && r.estado !== 'mandato_fechado').length,
    recusadas: recusadas.length,
    fechadas: lista.filter((r) => r.estado === 'mandato_fechado').length,
    motivosDeRecusa: Object.keys(porMotivo)
      .map((chave) => ({
        chave,
        rotulo: (MOTIVOS_RECUSA.find((m) => m.chave === chave) || { rotulo: chave }).rotulo,
        quantidade: porMotivo[chave],
      }))
      .sort((a, b) => b.quantidade - a.quantidade),
  };
}

/**
 * Agenda de prospecção — "agendas de prospecção de cada colaborador", seção 8.
 * Ordena pelo que está parado há mais tempo, que é a pergunta real de quem abre
 * a agenda: "de quem eu não cuido há mais tempo?".
 */
function agenda(responsavel) {
  const lista = registros()
    .filter((r) => r.estado !== 'recusada' && r.estado !== 'mandato_fechado')
    .filter((r) => !responsavel || r.responsavel === responsavel);

  const hoje = Date.now();
  return lista
    .map((r) => {
      const ultimo = r.historico[r.historico.length - 1];
      const dias = Math.floor((hoje - new Date(ultimo.quando).getTime()) / 86400000);
      return { ...r, diasParado: dias, ultimoMovimento: ultimo };
    })
    .sort((a, b) => b.diasParado - a.diasParado);
}

/* ---- 5. ENTRADA E SAÍDA ---------------------------------------------------- */

function exportarCrm() {
  return JSON.stringify({ registros: lerCrm(), exportadoEm: agora() }, null, 2);
}

function importarCrm(textoJson) {
  const lido = JSON.parse(textoJson);
  const dados = lido.registros || lido;
  if (typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error('Esperava um objeto de registros por id de empresa.');
  }
  return { quantidade: Object.keys(dados).length, persistiu: gravarCrm(dados) };
}

function limparCrm() { return gravarCrm({}); }

/** Linhas para a aba de CRM na exportação em Excel. */
function linhasParaPlanilha() {
  const linhas = [[
    'Empresa', 'Setor', 'Subsegmento', 'UF', 'Responsável', 'Etapa',
    'Índice na entrada', 'Classificação na entrada', 'Receita na entrada',
    'Entrou em', 'Último movimento', 'Dias desde o movimento',
    'Calls registradas', 'Motivo da recusa', 'Resposta específica',
  ]];

  const hoje = Date.now();
  for (const r of registros()) {
    const ultimo = r.historico[r.historico.length - 1];
    linhas.push([
      r.nome, r.setor, r.subsetor, r.uf, r.responsavel, estadoDe(r.estado).rotulo,
      r.retrato.indice, r.retrato.classificacao, r.retrato.receita,
      r.criadoEm.slice(0, 10), ultimo.quando.slice(0, 10),
      Math.floor((hoje - new Date(ultimo.quando).getTime()) / 86400000),
      r.calls.length,
      r.recusa ? (MOTIVOS_RECUSA.find((m) => m.chave === r.recusa.motivo) || {}).rotulo || r.recusa.motivo : '',
      r.recusa ? r.recusa.resposta : '',
    ]);
  }
  return linhas;
}

/* ---- 6. LIMITAÇÕES DECLARADAS ---------------------------------------------- */
const LIMITACOES_CRM = [
  {
    titulo: 'Monousuário e local',
    texto: 'Os registros ficam no navegador de quem os criou. O documento pede agenda e tracking por colaborador, o que pressupõe o time inteiro vendo o mesmo funil — isso exige servidor. O campo de responsável e a separação por pessoa já existem, então a troca do armazenamento não muda o formato do dado nem as telas.',
    viaDeObtencao: 'Decisão de infraestrutura: onde os dados residem (seção 12 do documento).',
  },
  {
    titulo: 'Sem integração com e-mail ou calendário',
    texto: 'Datas de call e descrições são digitadas. Puxá-las automaticamente exigiria acesso à caixa de e-mail do time, que é decisão de privacidade antes de ser de engenharia.',
    viaDeObtencao: 'Integração com Google Workspace ou Microsoft 365, se autorizada.',
  },
  {
    titulo: 'O retrato congela, a empresa não',
    texto: 'O índice guardado na entrada é o daquele momento. Se a base for reimportada ou os pesos mudarem, o número atual da empresa pode ser outro — e é justamente por isso que o retrato existe: para a decisão comercial poder ser explicada depois.',
    viaDeObtencao: '—',
  },
];

window.CRM = {
  ESTADOS_FUNIL, MOTIVOS_RECUSA, LIMITACOES: LIMITACOES_CRM,
  estadoDe, registros, registroDe, adicionar, mover, anotarCall,
  trocarResponsavel, remover, responsaveis, funil, agenda,
  exportarCrm, importarCrm, limparCrm, linhasParaPlanilha,
};
