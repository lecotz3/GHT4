/* =============================================================================
 *  GHT4 · classificação de enquadramento em quatro estados
 * -----------------------------------------------------------------------------
 *  Do plano, §8.3. A distinção existe porque enquadrar por CNAE secundário e
 *  enquadrar por certificado de associação são graus de certeza muito
 *  diferentes, e tratá-los igual enche a lista de falso positivo — que é o
 *  jeito mais rápido de perder a confiança dos sócios.
 *
 *    confirmada  certificado de associação, OU CNAE principal do subsetor com
 *                evidência operacional forte (RAPP vivo, licença, site)
 *    provavel    CNAE principal do subsetor, sem contradição
 *    possivel    só CNAE secundário, ou texto comercial ambíguo
 *    excluida    atividade principal fora do recorte, sem atividade empresarial
 *                relevante, ou cadastro sem operação alvo no Brasil
 *
 *  TODA CLASSIFICAÇÃO DEVOLVE MOTIVO. É requisito de aceite — "100% dos
 *  registros têm motivo de inclusão ou exclusão" — e é o que permite a um sócio
 *  discordar de um caso específico sem precisar auditar o algoritmo inteiro.
 *
 *  O QUE ESTE MÓDULO NÃO FAZ
 *  Não decide sozinho o que vira lista. Ele classifica enquadramento: se a
 *  empresa É do subsetor. Se ela INTERESSA — porte, timing, acesso — é score, e
 *  mora em scoring.mjs. Misturar os dois foi o erro do protótipo, onde
 *  "é distribuidora" e "é boa alvo" viravam o mesmo número.
 * ========================================================================== */

import * as TAXONOMIA from './taxonomia.mjs';

/* Naturezas jurídicas que não são alvo de M&A de boutique. Os códigos saem da
   tabela oficial da RFB — a mesma que ferramentas/naturezas-rfb.csv versiona. */
const NATUREZA_SEM_FINS = new Set(['3069', '3131', '3212', '3220', '3999']);
const NATUREZA_ESTATAL = new Set(['2011', '2038']);
const NATUREZA_EXTERIOR_SEM_OPERACAO = new Set(['2216']); // Empresa Domiciliada no Exterior

/* Situação cadastral da RFB. O arquivo de dados abertos traz o CÓDIGO ("02"),
   não o rótulo — e comparar direto com a string "ativa" faz o universo inteiro
   sair excluído em silêncio. Aconteceu: a primeira execução sobre os 38.583
   registros classificou 100% como "situação não ativa".

   Aceita as duas formas de propósito: fontes diferentes normalizam de jeitos
   diferentes, e a que vier do banco já vem com rótulo. */
const SITUACAO_RFB = Object.freeze({
  '01': 'nula', '02': 'ativa', '03': 'suspensa', '04': 'inapta', '08': 'baixada',
});

export function normalizarSituacao(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const bruto = String(valor).trim();
  return SITUACAO_RFB[bruto] ?? bruto.toLowerCase();
}

export const ESTADOS = Object.freeze(['confirmada', 'provavel', 'possivel', 'excluida']);

/** Ordem de certeza, para comparar e para ordenar fila de revisão. */
const FORCA = Object.freeze({ excluida: 0, possivel: 1, provavel: 2, confirmada: 3 });

export function forcaDoEstado(estado) {
  return FORCA[estado] ?? -1;
}

/**
 * Classifica uma empresa quanto ao enquadramento no subsetor.
 *
 * @param {object} empresa
 * @param {string} empresa.cnaePrincipal
 * @param {string[]} [empresa.cnaeSecundarias]
 * @param {string} [empresa.situacaoCadastral]  'ativa' e outras
 * @param {string} [empresa.naturezaJuridica]   código de 4 dígitos da RFB
 * @param {object} [evidencias]
 * @param {boolean} [evidencias.rappVivo]            RAPP/IBAMA declarado e recente
 * @param {boolean} [evidencias.certificadoAssociacao] ASSOCIQUIM/PRODIR
 * @param {boolean} [evidencias.licencaControlados]  cadastro na PF
 * @param {string}  [evidencias.subsetorAlvo]        limita a um subsetor
 *
 * @returns {{estado, subsetor, motivo, sinais, confianca}}
 */
export function classificar(empresa, evidencias = {}) {
  const sinais = [];
  const cnae = empresa?.cnaePrincipal ?? null;
  const secundarias = empresa?.cnaeSecundarias ?? [];

  /* ---- 1. exclusões que independem do CNAE ------------------------------- */

  const situacao = normalizarSituacao(empresa?.situacaoCadastral);
  if (situacao && situacao !== 'ativa') {
    return excluida(`situação cadastral "${situacao}" — não é empresa em operação`, ['situacao_nao_ativa']);
  }

  const natureza = empresa?.naturezaJuridica ?? '';
  if (NATUREZA_SEM_FINS.has(natureza)) {
    return excluida('entidade sem fins lucrativos — associação ou fundação não é alvo de aquisição', ['natureza_sem_fins']);
  }
  if (NATUREZA_ESTATAL.has(natureza)) {
    return excluida('empresa pública ou de economia mista — fora do recorte de boutique', ['natureza_estatal']);
  }
  if (NATUREZA_EXTERIOR_SEM_OPERACAO.has(natureza)) {
    return excluida('empresa domiciliada no exterior sem operação alvo no Brasil', ['natureza_exterior']);
  }

  /* ---- 2. o CNAE principal enquadra? -------------------------------------- */

  const porPrincipal = cnae ? TAXONOMIA.subsetorDeCnae(cnae) : null;
  const tabela = TAXONOMIA.tabelaSubsetorPorCnae();
  const principalEnquadra = Boolean(cnae && tabela[cnae]);

  /* Adjacência é fronteira declarada, não escopo: combustível, cosmético
     acabado, plástico transformado. Excluir com o nome da adjacência é melhor
     que um "fora do escopo" genérico — quem revisa entende na hora. */
  const adjacencia = (TAXONOMIA.ADJACENCIAS ?? []).find((a) => (a.cnae ?? []).includes(cnae));
  if (adjacencia) {
    return excluida(
      `CNAE principal ${cnae} é de "${adjacencia.rotulo}" — adjacência declarada, não escopo`,
      ['adjacencia'],
    );
  }

  /* ---- 3. enquadrado pelo principal --------------------------------------- */

  if (principalEnquadra) {
    const subsetor = tabela[cnae];
    sinais.push('cnae_principal');

    if (evidencias.certificadoAssociacao) {
      sinais.push('certificado_associacao');
      return {
        estado: 'confirmada', subsetor, sinais, confianca: 0.98,
        motivo: `certificado de associação setorial e CNAE principal ${cnae}`,
      };
    }

    const operacionais = [];
    if (evidencias.rappVivo) { sinais.push('rapp_vivo'); operacionais.push('RAPP/IBAMA vivo'); }
    if (evidencias.licencaControlados) { sinais.push('licenca_pf'); operacionais.push('cadastro de controlados na PF'); }

    if (operacionais.length > 0) {
      return {
        estado: 'confirmada', subsetor, sinais, confianca: 0.92,
        motivo: `CNAE principal ${cnae} e evidência operacional: ${operacionais.join(', ')}`,
      };
    }

    return {
      estado: 'provavel', subsetor, sinais, confianca: 0.75,
      motivo: `CNAE principal ${cnae} compatível, sem contradição, mas sem evidência operacional confirmando`,
    };
  }

  /* ---- 4. enquadrado só pelo secundário ----------------------------------- */

  const secundariaQueEnquadra = secundarias.find((c) => tabela[c]);
  if (secundariaQueEnquadra) {
    sinais.push('cnae_secundario');
    const subsetor = tabela[secundariaQueEnquadra];

    /* Mesmo com RAPP vivo, secundário não vira 'confirmada': o RAPP confirma que
       a empresa opera com químico, não que o negócio PRINCIPAL dela seja este
       subsetor. Uma indústria de alimentos tem RAPP e não é distribuidora. */
    if (evidencias.rappVivo) sinais.push('rapp_vivo');

    return {
      estado: 'possivel', subsetor, sinais,
      confianca: evidencias.rappVivo ? 0.55 : 0.4,
      motivo: `enquadrada apenas pelo CNAE secundário ${secundariaQueEnquadra}; ` +
              `o principal é ${cnae ?? 'não informado'}`,
    };
  }

  /* CNAE de descoberta levanta candidato e nunca enquadra sozinho. Fica em
     'possivel' com confiança baixa, esperando revisão. */
  const descoberta = TAXONOMIA.cnaesDeDescoberta();
  const porDescoberta = [cnae, ...secundarias].find((c) => descoberta.includes(c));
  if (porDescoberta) {
    return {
      estado: 'possivel', subsetor: null, sinais: ['cnae_descoberta'], confianca: 0.2,
      motivo: `CNAE ${porDescoberta} é genérico demais para enquadrar — levanta candidato, ` +
              `precisa de confirmação por site, associação ou licença`,
    };
  }

  /* ---- 5. fora ------------------------------------------------------------ */

  return excluida(
    cnae
      ? `CNAE principal ${cnae} não pertence à taxonomia do setor foco`
      : 'sem CNAE principal informado — não há como enquadrar',
    ['fora_da_taxonomia'],
  );

  function excluida(motivo, sinaisDaExclusao) {
    return { estado: 'excluida', subsetor: null, motivo, sinais: sinaisDaExclusao, confianca: 0.9 };
  }
}

/**
 * Classifica em lote e devolve o resumo por estado.
 *
 * `evidenciasDe` recebe a empresa e devolve as evidências dela — é assim que a
 * ingestão injeta o cruzamento com IBAMA sem este módulo saber de banco.
 */
export function classificarLote(empresas, evidenciasDe = () => ({})) {
  const resultados = [];
  const resumo = { confirmada: 0, provavel: 0, possivel: 0, excluida: 0 };

  for (const empresa of empresas) {
    const r = classificar(empresa, evidenciasDe(empresa));
    resumo[r.estado]++;
    resultados.push({ empresa, ...r });
  }

  return { resultados, resumo, total: empresas.length };
}

/**
 * Quais estados contam como "dentro do subsetor" para uma dada exigência.
 *
 * O padrão é confirmada + provável. `possivel` fica de fora de propósito: é
 * candidato a revisar, não empresa a apresentar ao sócio.
 */
export function dentroDoSubsetor(estado, { incluirPossivel = false } = {}) {
  if (estado === 'confirmada' || estado === 'provavel') return true;
  return incluirPossivel && estado === 'possivel';
}
