/* =============================================================================
 *  GHT4 · atributos cadastrais públicos de cada empresa do catálogo
 * -----------------------------------------------------------------------------
 *  É o que a revisão por critério pode verificar sem custo e sem IA: dado da
 *  Receita Federal (CNPJ) e, quando houver, a declaração da empresa ao IBAMA.
 *
 *  O QUE ENTRA
 *    capital social, porte declarado, Simples, data de abertura, estabelecimentos
 *    ativos, UFs de atuação, natureza jurídica, CONTAGENS do quadro societário,
 *    presença de sócio estrangeiro, abertura recente de filial, CNAEs secundários,
 *    o DOMÍNIO do e-mail cadastral e a pegada no IBAMA.
 *
 *  O QUE NÃO ENTRA, de propósito
 *    nome, e-mail ou telefone de pessoa; faixa etária de sócio; os sinais
 *    inferidos pelo protótipo (sucessão provável, perfil "Familiar"). Do e-mail
 *    só sobra o domínio, e só quando ele é corporativo e exclusivo: webmail e
 *    domínio repetido em várias empresas (escritório contábil, grupo) não
 *    identificam o site da empresa e ficam fora.
 * ========================================================================== */

const WEBMAIL = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br',
  'live.com', 'live.com.br', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'ymail.com', 'uol.com.br', 'bol.com.br',
  'terra.com.br', 'ig.com.br', 'globo.com', 'globomail.com', 'icloud.com', 'me.com', 'aol.com', 'zipmail.com.br',
  'r7.com', 'oi.com.br', 'brturbo.com.br', 'superig.com.br', 'protonmail.com', 'proton.me', 'gmx.com', 'mail.com',
  'zoho.com', 'yandex.com', 'pop.com.br', 'click21.com.br', 'ibest.com.br', 'veloxmail.com.br', 'sercomtel.com.br',
  'tutanota.com', 'netsite.com.br', 'onda.com.br', 'itelefonica.com.br', 'bighost.com.br', 'email.com']);
/** Acima disto, o domínio é de terceiro (contabilidade, grupo), não da empresa. */
export const LIMITE_DOMINIO_COMPARTILHADO = 3;

export function dominioDoEmail(email) {
  if (typeof email !== 'string') return null;
  const d = email.trim().toLowerCase().split('@')[1]?.replace(/\.+$/, '');
  if (!d || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+$/.test(d) || d.length > 120) return null;
  if (WEBMAIL.has(d) || /^(gmail|hotmail|outlook|yahoo|live)\./.test(d)) return null;
  return d;
}

/** Conta quantas empresas usam cada domínio, para descartar os compartilhados. */
export function contarDominios(linhas, colunas) {
  const i = colunas.indexOf('contato');
  const contagem = new Map();
  if (i < 0) return contagem;
  for (const l of linhas) {
    const d = dominioDoEmail(l[i]?.email);
    if (d) contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  return contagem;
}

const numero = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const inteiro = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;
const data = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const lista = (v, re) => Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && re.test(x)))].slice(0, 60) : [];

/** Lê `data-ibama.js` sem executar o arquivo: só os literais JSON. */
export function lerPegadaIbama(texto) {
  if (!texto) return new Map();
  const literal = (nome, fim) => {
    const de = texto.indexOf(`const ${nome} =`);
    if (de < 0) throw new Error(`Constante ausente: ${nome}`);
    const inicio = texto.indexOf('[', de);
    // Termina no ']' do terminador, deixando o ';' de fora.
    return JSON.parse(texto.slice(inicio, texto.indexOf(fim, inicio) + fim.length - 1));
  };
  const colunas = literal('COLUNAS_IBAMA', '];');
  const linhas = literal('LINHAS_IBAMA', '\n];');
  const [raiz, grau, viva, ano] = ['raiz', 'grau', 'viva', 'ano'].map((c) => colunas.indexOf(c));
  if ([raiz, grau, viva].some((i) => i < 0)) throw new Error('Formato do IBAMA inválido.');
  const mapa = new Map();
  for (const l of linhas) {
    if (!/^\d{8}$/.test(l[raiz]) || !['industria', 'transporte', 'comercio', 'outra'].includes(l[grau])) continue;
    mapa.set(l[raiz], { grau: l[grau], viva: l[viva] === true, ano: inteiro(l[ano]) });
  }
  return mapa;
}

/**
 * Atributos públicos de uma linha do catálogo de origem.
 * `e` é o registro já montado por nome de coluna.
 */
export function atributosDe(e, { dominios = new Map(), ibama = new Map() } = {}) {
  const dominio = dominioDoEmail(e.contato?.email);
  return {
    capitalSocial: numero(e.capitalSocial),
    porte: ['01', '03', '05'].includes(e.porteDeclarado) ? e.porteDeclarado : null,
    optanteSimples: typeof e.optanteSimples === 'boolean' ? e.optanteSimples : null,
    dataAbertura: data(e.dataAbertura),
    estabelecimentosAtivos: inteiro(e.estabelecimentosAtivos),
    // Coluna ausente na fonte é desconhecido (null); lista vazia ou data vazia é ausência apurada.
    ufsAtuacao: Array.isArray(e.ufsAtuacao) ? lista(e.ufsAtuacao, /^[A-Z]{2}$/) : null,
    naturezaJuridica: typeof e.naturezaJuridica === 'string' && /^\d{4}$/.test(e.naturezaJuridica) ? e.naturezaJuridica : null,
    qtdSocios: inteiro(e.qtdSocios),
    qtdSociosPj: inteiro(e.qtdSociosPj),
    socioEstrangeiro: typeof e.socioEstrangeiro === 'boolean' ? e.socioEstrangeiro : null,
    filialRecente: 'aberturaFilialRecente' in e ? data(e.aberturaFilialRecente) ?? false : null,
    cnaesSecundarios: Array.isArray(e.cnaeSecundarias) ? lista(e.cnaeSecundarias, /^\d{7}$/) : null,
    dominio: dominio && (dominios.get(dominio) ?? 1) <= LIMITE_DOMINIO_COMPARTILHADO ? dominio : null,
    ibama: ibama.get(e.cnpjRaiz) ?? null,
  };
}
