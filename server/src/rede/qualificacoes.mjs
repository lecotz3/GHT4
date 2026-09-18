/* =============================================================================
 *  GHT4 · qualificação do sócio (Receita Federal) → senioridade da rede
 * -----------------------------------------------------------------------------
 *  O arquivo de Sócios dos Dados Públicos CNPJ traz, para cada pessoa no quadro,
 *  um código de qualificação. Nas distribuidoras químicas fechadas de médio porte
 *  — que são o alvo da casa — esse código é a melhor descrição pública de quem
 *  decide: o sócio-administrador É o dono e É quem toca o negócio.
 *
 *  A TABELA É DECLARADA, NÃO ADIVINHADA
 *  Código que não estiver aqui vira `outro` e entra com o rótulo cru, nunca um
 *  palpite de cargo. A tabela oficial vem no layout publicado junto com os dados;
 *  quando a RFB acrescentar um código, o efeito é um registro sem senioridade
 *  — conservador e visível — em vez de uma classificação inventada.
 *
 *  QUEM NÃO ENTRA
 *  Menor de idade e pessoa incapaz saem da importação inteira. Não é filtro de
 *  qualidade: é que uma lista de prospecção comercial não é lugar para um menor,
 *  e o fato de o dado ser público não torna o uso adequado. O mesmo vale para
 *  procurador e para cotas em tesouraria, que não são decisores.
 * ========================================================================== */

/** Códigos cujo titular nunca é importado, qualquer que seja o resto. */
export const QUALIFICACOES_EXCLUIDAS = Object.freeze(new Map([
  ['29', 'Sócio incapaz ou relativamente incapaz'],
  ['30', 'Sócio menor, assistido ou representado'],
  ['58', 'Sócio comanditário incapaz'],
  ['67', 'Titular pessoa física incapaz ou relativamente incapaz'],
  ['17', 'Procurador'],
  ['63', 'Cotas em tesouraria'],
  ['20', 'Sociedade consorciada'],
]));

/* Senioridade na escala da rede. `conselho` e `ceo` pesam igual, então a
   distinção entre os dois é de rótulo, não de pontuação — o que reduz o dano de
   um enquadramento discutível. */
const TABELA = Object.freeze(new Map([
  ['05', ['Administrador', 'ceo']],
  ['08', ['Conselheiro de administração', 'conselho']],
  ['10', ['Diretor', 'diretoria']],
  ['16', ['Presidente', 'ceo']],
  ['22', ['Sócio', 'conselho']],
  ['23', ['Sócio capitalista', 'conselho']],
  ['24', ['Sócio comanditado', 'conselho']],
  ['25', ['Sócio comanditário', 'conselho']],
  ['26', ['Sócio de indústria', 'conselho']],
  ['28', ['Sócio-gerente', 'ceo']],
  ['31', ['Sócio ostensivo', 'conselho']],
  ['37', ['Sócio pessoa jurídica domiciliado no exterior', 'outro']],
  ['38', ['Sócio pessoa física residente no exterior', 'conselho']],
  ['39', ['Diretor não empregado e administrador', 'diretoria']],
  ['47', ['Sócio pessoa física residente no Brasil', 'conselho']],
  ['48', ['Sócio pessoa jurídica domiciliado no Brasil', 'outro']],
  ['49', ['Sócio-administrador', 'ceo']],
  ['52', ['Sócio com capital', 'conselho']],
  ['53', ['Sócio sem capital', 'conselho']],
  ['54', ['Fundador', 'conselho']],
  ['55', ['Sócio comanditado residente no exterior', 'conselho']],
  ['59', ['Produtor rural', 'conselho']],
  ['65', ['Titular pessoa física residente no Brasil', 'ceo']],
  ['66', ['Titular pessoa física residente no exterior', 'ceo']],
  ['70', ['Administrador residente no exterior', 'ceo']],
  ['71', ['Conselheiro de administração residente no exterior', 'conselho']],
  ['72', ['Diretor residente no exterior', 'diretoria']],
  ['73', ['Presidente residente no exterior', 'ceo']],
]));

/* -----------------------------------------------------------------------------
 *  CARGO ESTATUTÁRIO × POSIÇÃO SOCIETÁRIA
 *
 *  Estes são os códigos cujo rótulo nomeia um CARGO da companhia — presidente,
 *  diretor, conselheiro. Todos os outros descrevem uma POSIÇÃO no contrato
 *  social: sócio, administrador, titular. A diferença importa porque o cadastro
 *  da Receita não distingue o presidente de uma companhia de R$ 500 milhões do
 *  dono de uma distribuidora de dois sócios: os dois são "sócio-administrador",
 *  código 49, e ele sozinho responde por 74% das pessoas físicas do quadro.
 *
 *  Tratar essa maioria como "ceo" encheria o topo da fila de reconhecimento com
 *  gente cuja senioridade o produto não apurou — e a fila existe justamente para
 *  mostrar primeiro quem decide. A casa decidiu em 2026-09-18 importar só os
 *  cargos estatutários: menos nome de terceiro no banco, e o que entra é o que a
 *  fonte de fato afirma.
 *
 *  O custo está registrado e é grande: no quadro de 2026-08, a restrição alcança
 *  2.477 das 35.690 empresas com quadro. As demais têm dono, e o dono decide —
 *  ele só não é nomeável a partir do dado público. Essas empresas ficam para o
 *  caminho de recall, em que alguém da casa informa o cargo real.
 * -------------------------------------------------------------------------- */
export const QUALIFICACOES_ESTATUTARIAS = Object.freeze(new Set([
  '08', // Conselheiro de administração
  '10', // Diretor
  '16', // Presidente
  '39', // Diretor não empregado e administrador
  '71', // Conselheiro de administração residente no exterior
  '72', // Diretor residente no exterior
  '73', // Presidente residente no exterior
]));

const codigo = (v) => String(v ?? '').trim().padStart(2, '0');

/** O titular desta qualificação pode ser importado? */
export function importavel(qualificacao) {
  return !QUALIFICACOES_EXCLUIDAS.has(codigo(qualificacao));
}

/** O rótulo desta qualificação nomeia um cargo da companhia, e não uma cota? */
export function estatutaria(qualificacao) {
  return QUALIFICACOES_ESTATUTARIAS.has(codigo(qualificacao));
}

/**
 * Cargo e senioridade para um código de qualificação.
 *
 * @returns {{cargo: string, senioridade: string, conhecida: boolean}}
 */
export function qualificacao(bruto) {
  const c = codigo(bruto);
  const achado = TABELA.get(c);
  if (!achado) return { cargo: `Qualificação ${c} no cadastro`, senioridade: 'outro', conhecida: false };
  const [cargo, senioridade] = achado;
  return { cargo, senioridade, conhecida: true };
}

export const CODIGOS_CONHECIDOS = Object.freeze([...TABELA.keys()]);
