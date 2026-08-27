/* =============================================================================
 *  GHT4 · Dado<T> — o contrato de um valor que sabe de onde veio
 * -----------------------------------------------------------------------------
 *  É o `DataValue<T>` da seção 1 do plano, com os nomes na língua do resto do
 *  código e os estados que o próprio plano usa nas seções 6.1 e 7.4
 *  (`reportado`, `estimado`, `proxy`, `inferido`).
 *
 *  POR QUE ISTO EXISTE
 *  O projeto já tinha a regra certa — dado ausente é `null`, nunca `false` — mas
 *  ela vivia como disciplina, não como tipo. Um número solto não diz se foi
 *  auditado numa DFP, estimado por proxy de capital social, ou chutado. Quando
 *  esse número vira linha de ranking, a diferença é tudo: é o que separa "esta
 *  empresa fatura R$ 300 mi" de "alguém inferiu R$ 300 mi e ninguém conferiu".
 *
 *  A regra que este módulo impõe: um valor só existe acompanhado do seu estado.
 *  Ausência é um estado declarado (`nao_apurado`) com motivo, não um buraco.
 *
 *  ESTADOS
 *    reportado    a própria empresa ou um registro oficial publicou. Auditado.
 *    estimado     terceiro calculou a partir de dado real, com método conhecido.
 *    proxy        outro indicador servindo de substituto. Rotulado como tal.
 *    inferido     dedução sem documento que a sustente. Nunca vira fato.
 *    nao_apurado  ninguém apurou. Diferente de zero e diferente de "não atende".
 * ========================================================================== */

export const ESTADOS = Object.freeze([
  'reportado',
  'estimado',
  'proxy',
  'inferido',
  'nao_apurado',
]);

/** Estados que sustentam uma afirmação factual sem ressalva. */
export const ESTADOS_COM_LASTRO = Object.freeze(['reportado', 'estimado']);

/**
 * Monta um Dado apurado.
 *
 * @param {*} valor        o valor em si. `null` aqui é erro: use naoApurado().
 * @param {object} meta
 * @param {string} meta.estado       um de ESTADOS, exceto 'nao_apurado'.
 * @param {string} [meta.fonte]      id da fonte em fontes.js. Obrigatório com lastro.
 * @param {string} [meta.observadoEm] data ISO do que o valor descreve.
 * @param {string} [meta.coletadoEm]  data ISO de quando foi coletado.
 * @param {number} [meta.confianca]   0..1.
 * @param {string} [meta.metodo]      como se chegou ao valor.
 * @param {string} [meta.unidade]     'BRL_milhoes', 'pct', 'pessoas'...
 * @param {string} [meta.periodo]     '2025', '2025-Q3', '2024-2025'.
 */
export function dado(valor, meta = {}) {
  const { estado } = meta;

  if (!ESTADOS.includes(estado)) {
    throw new TypeError(`dado(): estado inválido "${estado}". Use um de: ${ESTADOS.join(', ')}`);
  }
  if (estado === 'nao_apurado') {
    throw new TypeError('dado(): para ausência use naoApurado(motivo), que exige o motivo.');
  }
  if (valor === null || valor === undefined) {
    throw new TypeError('dado(): valor nulo com estado apurado. Ausência é naoApurado(motivo).');
  }
  if (ESTADOS_COM_LASTRO.includes(estado) && !meta.fonte) {
    throw new TypeError(`dado(): estado "${estado}" afirma lastro e exige fonte.`);
  }
  if (meta.confianca !== undefined && !(meta.confianca >= 0 && meta.confianca <= 1)) {
    throw new TypeError(`dado(): confiança fora de 0..1 (${meta.confianca}).`);
  }
  /* Número sem unidade e sem período é a porta de entrada do erro caro: R$ 300
     "mil ou milhões?", de "que ano?". A seção 7.4 do plano exige os dois. */
  if (typeof valor === 'number' && !meta.unidade) {
    throw new TypeError('dado(): valor numérico exige unidade.');
  }

  return Object.freeze({
    valor,
    estado,
    fonte: meta.fonte ?? null,
    observadoEm: meta.observadoEm ?? null,
    coletadoEm: meta.coletadoEm ?? null,
    confianca: meta.confianca ?? null,
    metodo: meta.metodo ?? null,
    unidade: meta.unidade ?? null,
    periodo: meta.periodo ?? null,
    motivo: null,
  });
}

/**
 * Monta a ausência declarada. O motivo é obrigatório de propósito: "não
 * apurado" sem motivo é indistinguível de esquecimento.
 */
export function naoApurado(motivo) {
  if (!motivo || typeof motivo !== 'string') {
    throw new TypeError('naoApurado(): o motivo é obrigatório. Por que não se sabe?');
  }
  return Object.freeze({
    valor: null,
    estado: 'nao_apurado',
    fonte: null,
    observadoEm: null,
    coletadoEm: null,
    confianca: null,
    metodo: null,
    unidade: null,
    periodo: null,
    motivo,
  });
}

/** É um Dado? Serve de fronteira: valor cru não passa por engano. */
export function ehDado(d) {
  return Boolean(d) && typeof d === 'object' && 'valor' in d && ESTADOS.includes(d.estado);
}

/** Foi apurado (qualquer estado que não seja ausência)? */
export function ehApurado(d) {
  return ehDado(d) && d.estado !== 'nao_apurado';
}

/**
 * Tem lastro — documento ou cálculo com fonte, não dedução?
 * É esta função que decide se um número pode entrar num ranking como fato.
 */
export function temLastro(d) {
  return ehDado(d) && ESTADOS_COM_LASTRO.includes(d.estado) && Boolean(d.fonte);
}

/**
 * O valor cru, ou `null` se não apurado.
 *
 * Use na ponta do cálculo, nunca para esconder o estado: quem exibe o número
 * tem de exibir também de onde ele veio.
 */
export function valorDe(d) {
  if (!ehDado(d)) return null;
  return d.estado === 'nao_apurado' ? null : d.valor;
}

/** Rótulo curto para a interface, no vocabulário que o usuário já vê na tela. */
export function rotuloDoEstado(estado) {
  return {
    reportado: 'Reportado',
    estimado: 'Estimado',
    proxy: 'Proxy',
    inferido: 'Inferido — sem documento',
    nao_apurado: 'Não apurado',
  }[estado] ?? estado;
}

/**
 * Cobertura de um conjunto de Dados: quanto se apoia em documento.
 *
 * Devolve `pctComLastro: null` quando não há nenhum campo — zero afirmaria
 * "nada tem lastro", e a verdade é "não há o que medir".
 */
export function cobertura(dados) {
  const lista = Object.values(dados ?? {}).filter(ehDado);
  if (lista.length === 0) {
    return { total: 0, comLastro: 0, apurados: 0, ausentes: 0, pctComLastro: null };
  }
  const comLastro = lista.filter(temLastro).length;
  const apurados = lista.filter(ehApurado).length;
  return {
    total: lista.length,
    comLastro,
    apurados,
    ausentes: lista.length - apurados,
    pctComLastro: Math.round((comLastro / lista.length) * 100),
  };
}
