/* =============================================================================
 *  GHT4 · pesquisa por tese — critérios
 * -----------------------------------------------------------------------------
 *  Uma tese em linguagem natural vira uma lista de CRITÉRIOS que podem ser
 *  conferidos empresa a empresa:
 *
 *    cadastro  verificado contra o dado público da Receita Federal (e o IBAMA),
 *              sem custo e sem IA. Veredito exato, com o campo como evidência.
 *    pesquisa  não existe no cadastro ("representa fabricantes multinacionais").
 *              Exige evidência de fonte pública — o site da empresa — e fica
 *              "indeterminado" quando ela não aparece. Ausência de evidência
 *              nunca vira "não atende".
 *
 *  Cada critério é obrigatório ou opcional. Obrigatório reprovado elimina a
 *  empresa; opcional só pesa na aderência. O membro edita a lista antes de
 *  rodar: o agente propõe, a equipe decide.
 * ========================================================================== */

import { z } from 'zod';
import { normalizar } from '../agente/catalogo.mjs';

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const Uf = z.enum(UFS);
const PORTES = { ME: '01', EPP: '03', DEMAIS: '05' };
const NATUREZAS = {
  ltda: ['2062', '2240'], sa: ['2054', '2046'], sa_aberta: ['2046'], cooperativa: ['2143', '2330'],
  individual: ['2135', '2305', '2313', '2348'],
};
const NOME_NATUREZA = { ltda: 'limitada', sa: 'sociedade anônima', sa_aberta: 'S.A. de capital aberto', cooperativa: 'cooperativa', individual: 'empresário individual ou unipessoal' };
const NOME_PORTE = { ME: 'microempresa', EPP: 'empresa de pequeno porte', DEMAIS: 'porte "demais" (acima de EPP)' };
const NOME_IBAMA = { industria: 'indústria química', transporte: 'transporte de produto perigoso', comercio: 'comércio, depósito ou terminal' };

/** Campos verificáveis no cadastro e o formato do valor de cada um. */
export const REGRAS = {
  uf: z.array(Uf).min(1).max(27),
  municipio: z.string().trim().min(2).max(60),
  // Sede em qualquer um ("em Campinas ou Osasco") e sede fora de todos ("fora de Campinas").
  municipios: z.array(z.string().trim().min(2).max(60)).min(2).max(10),
  municipio_fora: z.array(z.string().trim().min(2).max(60)).min(1).max(10),
  atua_em_uf: z.array(Uf).min(1).max(27),
  idade_min: z.number().int().min(1).max(150),
  idade_max: z.number().int().min(1).max(150),
  capital_min: z.number().positive().max(1e13),
  capital_max: z.number().positive().max(1e13),
  porte: z.array(z.enum(['ME', 'EPP', 'DEMAIS'])).min(1).max(3),
  estabelecimentos_min: z.number().int().min(2).max(5000),
  ufs_atuacao_min: z.number().int().min(2).max(27),
  socio_estrangeiro: z.boolean(),
  sem_socio_pj: z.literal(true),
  socios_max: z.number().int().min(1).max(500),
  natureza: z.array(z.enum(Object.keys(NATUREZAS))).min(1).max(5),
  ibama: z.array(z.enum(['industria', 'transporte', 'comercio'])).min(1).max(3),
  filial_recente_anos: z.number().int().min(1).max(20),
  cnae_secundario: z.array(z.string().regex(/^\d{7}$/)).min(1).max(10),
};
export const CAMPOS_REGRA = Object.keys(REGRAS);

const Regra = z.object({ campo: z.enum(CAMPOS_REGRA), valor: z.unknown() }).strict()
  .transform((r, ctx) => {
    const v = REGRAS[r.campo].safeParse(r.valor);
    if (!v.success) { ctx.addIssue({ code: 'custom', message: `Valor inválido para ${r.campo}.` }); return z.NEVER; }
    return { campo: r.campo, valor: v.data };
  });

export const Criterio = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  texto: z.string().trim().min(3).max(200),
  obrigatorio: z.boolean(),
  tipo: z.enum(['cadastro', 'pesquisa']),
  regra: Regra.nullable(),
  trecho: z.string().trim().max(300).nullable().default(null),
  origem: z.enum(['regras', 'ia', 'usuario']),
}).strict().superRefine((c, ctx) => {
  if (c.tipo === 'cadastro' && !c.regra) ctx.addIssue({ code: 'custom', message: 'Critério cadastral precisa de regra.' });
  if (c.tipo === 'pesquisa' && c.regra) ctx.addIssue({ code: 'custom', message: 'Critério de pesquisa não tem regra cadastral.' });
});
export const MAX_CRITERIOS = 12;
export const MAX_PESQUISA = 5;
export const ListaCriterios = z.array(Criterio).min(1).max(MAX_CRITERIOS).superRefine((l, ctx) => {
  if (new Set(l.map((c) => c.id)).size !== l.length) ctx.addIssue({ code: 'custom', message: 'Critérios repetidos.' });
  if (l.filter((c) => c.tipo === 'pesquisa').length > MAX_PESQUISA) ctx.addIssue({ code: 'custom', message: `No máximo ${MAX_PESQUISA} critérios de pesquisa por vez.` });
});

/* ---- verificação cadastral ---------------------------------------------- */

const FONTE_RFB = 'Receita Federal · CNPJ';
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const anosEntre = (de, ate) => {
  const a = new Date(`${de}T00:00:00Z`), b = new Date(`${ate}T00:00:00Z`);
  let anos = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) anos--;
  return anos;
};
const v = (veredito, resumo, justificativa, campo, referencia, fonte = FONTE_RFB) =>
  ({ veredito, resumo, justificativa, lastro: 'cadastro', evidencias: [{ fonte, referencia, campo }] });
const semDado = (campo, referencia) => ({ veredito: 'indeterminado', resumo: 'Dado não disponível',
  justificativa: 'O campo não consta neste snapshot do catálogo. Reimporte o catálogo para verificar este critério.',
  lastro: 'cadastro', evidencias: [{ fonte: FONTE_RFB, referencia, campo }] });

/**
 * Confere um critério cadastral. `empresa` é o cartão do catálogo com
 * `atributos`; `referencia` é o mês do snapshot (AAAA-MM), base das idades.
 */
export function verificarCadastro(regra, empresa, referencia) {
  const a = empresa.atributos;
  const ref = /^\d{4}-\d{2}$/.test(referencia || '') ? `${referencia}-01` : new Date().toISOString().slice(0, 10);
  const { campo, valor } = regra;
  if (campo === 'uf') {
    const ok = valor.includes(empresa.uf);
    return v(ok ? 'atende' : 'nao_atende', `Sede em ${empresa.uf}`, `A sede cadastral fica em ${empresa.cidade}/${empresa.uf}.`, 'uf', referencia);
  }
  if (campo === 'municipios' || campo === 'municipio_fora') {
    const na = valor.some((x) => normalizar(empresa.cidade) === normalizar(x));
    const ok = campo === 'municipios' ? na : !na;
    return v(ok ? 'atende' : 'nao_atende', `Sede em ${empresa.cidade}/${empresa.uf}`, `Município cadastral da sede: ${empresa.cidade}.`, 'municipio', referencia);
  }
  if (campo === 'municipio') {
    const ok = normalizar(empresa.cidade) === normalizar(valor);
    return v(ok ? 'atende' : 'nao_atende', `Sede em ${empresa.cidade}/${empresa.uf}`, `Município cadastral da sede: ${empresa.cidade}.`, 'municipio', referencia);
  }
  if (!a) return semDado(campo, referencia);
  switch (campo) {
    case 'atua_em_uf': {
      if (!a.ufsAtuacao?.length) return semDado('ufsAtuacao', referencia);
      const comuns = valor.filter((u) => a.ufsAtuacao.includes(u));
      return v(comuns.length ? 'atende' : 'nao_atende', `Estabelecimentos em ${a.ufsAtuacao.join(', ')}`,
        comuns.length ? `Há estabelecimento ativo em ${comuns.join(', ')}.` : 'Nenhum estabelecimento ativo nas UFs pedidas.', 'ufsAtuacao', referencia);
    }
    case 'idade_min': case 'idade_max': {
      if (!a.dataAbertura) return semDado('dataAbertura', referencia);
      const idade = anosEntre(a.dataAbertura, ref);
      const ok = campo === 'idade_min' ? idade >= valor : idade <= valor;
      return v(ok ? 'atende' : 'nao_atende', `${idade} anos (aberta em ${a.dataAbertura.split('-').reverse().join('/')})`,
        `Idade calculada pela data de abertura do CNPJ, na referência ${referencia}.`, 'dataAbertura', referencia);
    }
    case 'capital_min': case 'capital_max': {
      if (a.capitalSocial == null) return semDado('capitalSocial', referencia);
      const ok = campo === 'capital_min' ? a.capitalSocial >= valor : a.capitalSocial <= valor;
      return v(ok ? 'atende' : 'nao_atende', `Capital social ${brl(a.capitalSocial)}`,
        'Capital social declarado. Não é medida de faturamento nem de valor da empresa.', 'capitalSocial', referencia);
    }
    case 'porte': {
      if (!a.porte) return semDado('porte', referencia);
      const nome = Object.keys(PORTES).find((k) => PORTES[k] === a.porte);
      return v(valor.includes(nome) ? 'atende' : 'nao_atende', `Porte declarado: ${NOME_PORTE[nome]}`,
        'Porte autodeclarado no CNPJ (ME até R$ 360 mil; EPP até R$ 4,8 mi de receita anual; "demais" acima disso).', 'porte', referencia);
    }
    case 'estabelecimentos_min': {
      if (a.estabelecimentosAtivos == null) return semDado('estabelecimentosAtivos', referencia);
      return v(a.estabelecimentosAtivos >= valor ? 'atende' : 'nao_atende', `${a.estabelecimentosAtivos} estabelecimento(s) ativo(s)`,
        'Contagem de estabelecimentos ativos (matriz e filiais) no CNPJ.', 'estabelecimentosAtivos', referencia);
    }
    case 'ufs_atuacao_min': {
      if (!a.ufsAtuacao) return semDado('ufsAtuacao', referencia);
      return v(a.ufsAtuacao.length >= valor ? 'atende' : 'nao_atende', `Presença em ${a.ufsAtuacao.length} UF(s)`,
        a.ufsAtuacao.length ? `Estabelecimentos ativos em ${a.ufsAtuacao.join(', ')}.` : 'Sem estabelecimento ativo registrado.', 'ufsAtuacao', referencia);
    }
    case 'socio_estrangeiro': {
      if (a.socioEstrangeiro == null) return semDado('socioEstrangeiro', referencia);
      return v(a.socioEstrangeiro === valor ? 'atende' : 'nao_atende', a.socioEstrangeiro ? 'Há sócio estrangeiro no quadro' : 'Sem sócio estrangeiro no quadro',
        'Conferido pelo país dos sócios no quadro societário público.', 'socioEstrangeiro', referencia);
    }
    case 'sem_socio_pj': {
      if (a.qtdSociosPj == null) return semDado('qtdSociosPj', referencia);
      return v(a.qtdSociosPj === 0 ? 'atende' : 'nao_atende', a.qtdSociosPj === 0 ? 'Quadro só com pessoas físicas' : `${a.qtdSociosPj} sócio(s) pessoa jurídica`,
        'Ausência de holding, fundo ou outra empresa no quadro é indício de controle por pessoas físicas; não comprova controle familiar.', 'qtdSociosPj', referencia);
    }
    case 'socios_max': {
      if (a.qtdSocios == null) return semDado('qtdSocios', referencia);
      return v(a.qtdSocios <= valor ? 'atende' : 'nao_atende', `${a.qtdSocios} sócio(s) no quadro`, 'Contagem do quadro societário público.', 'qtdSocios', referencia);
    }
    case 'natureza': {
      if (!a.naturezaJuridica) return semDado('naturezaJuridica', referencia);
      const grupo = Object.keys(NATUREZAS).find((k) => NATUREZAS[k].includes(a.naturezaJuridica));
      const ok = valor.some((g) => NATUREZAS[g].includes(a.naturezaJuridica));
      return v(ok ? 'atende' : 'nao_atende', grupo ? `Natureza jurídica: ${NOME_NATUREZA[grupo]}` : `Natureza jurídica ${a.naturezaJuridica}`,
        `Código de natureza jurídica ${a.naturezaJuridica} no CNPJ.`, 'naturezaJuridica', referencia);
    }
    case 'ibama': {
      const i = a.ibama;
      if (!i) return { veredito: 'indeterminado', resumo: 'Sem declaração ao IBAMA localizada', lastro: 'cadastro',
        justificativa: 'A ausência no RAPP não prova que a empresa não opere: empresa pequena pode não ter a obrigação.',
        evidencias: [{ fonte: 'IBAMA · RAPP', referencia: 'cruzamento por raiz de CNPJ', campo: 'ibama' }] };
      const ok = valor.includes(i.grau);
      return { veredito: ok ? 'atende' : 'indeterminado', resumo: `IBAMA: ${NOME_IBAMA[i.grau] ?? 'categoria não química'}${i.viva ? ` · RAPP ${i.ano ?? 'recente'}` : ' · declaração antiga'}`, lastro: 'cadastro',
        justificativa: ok ? 'Declaração ao IBAMA confirma a atividade de forma independente do CNAE.' : 'A declaração existente é de outra categoria; não exclui a atividade pedida.',
        evidencias: [{ fonte: 'IBAMA · RAPP', referencia: i.ano ? `ano ${i.ano}` : 'cruzamento por raiz de CNPJ', campo: 'ibama' }] };
    }
    case 'filial_recente_anos': {
      // null: a fonte não trouxe a coluna (desconhecido); false: apurado que não há filial ativa.
      if (a.filialRecente == null) return semDado('filialRecente', referencia);
      if (a.filialRecente === false) return v('nao_atende', 'Sem filial ativa', 'O cadastro não registra estabelecimento ativo além da matriz.', 'filialRecente', referencia);
      const anos = anosEntre(a.filialRecente, ref);
      return v(anos <= valor ? 'atende' : 'nao_atende', `Filial aberta em ${a.filialRecente.split('-').reverse().join('/')}`,
        'Data de abertura do estabelecimento ativo mais recente.', 'filialRecente', referencia);
    }
    case 'cnae_secundario': {
      const todos = [empresa.cnaePrincipal, ...(a.cnaesSecundarios || [])].filter(Boolean);
      const comuns = valor.filter((c) => todos.includes(c));
      if (!comuns.length && a.cnaesSecundarios == null) return semDado('cnaesSecundarios', referencia);
      return v(comuns.length ? 'atende' : 'nao_atende', comuns.length ? `CNAE ${comuns.join(', ')} declarado` : 'CNAE pedido não declarado',
        'CNAEs principal e secundários do CNPJ.', 'cnaes', referencia);
    }
    default: return semDado(campo, referencia);
  }
}

/* ---- aderência ---------------------------------------------------------- */

const PONTOS = { atende: 1, indicio: 0.6, indeterminado: 0, nao_atende: 0 };
/**
 * Aderência de 0 a 100 e a categoria da empresa.
 *   nao_aderente  algum obrigatório reprovado
 *   aderente      todos os obrigatórios atendidos com evidência
 *   provavel      obrigatórios atendidos, ao menos um só por indício textual
 *   a_confirmar   algum obrigatório sem evidência suficiente
 */
export function consolidar(criterios, vereditos) {
  let soma = 0, peso = 0;
  const obrig = [];
  criterios.forEach((c, i) => {
    const r = vereditos[i]?.veredito ?? 'indeterminado';
    const w = c.obrigatorio ? 2 : 1;
    soma += w * PONTOS[r]; peso += w;
    if (c.obrigatorio) obrig.push(r);
  });
  const aderencia = peso ? Math.round((100 * soma) / peso) : 0;
  const categoria = obrig.includes('nao_atende') ? 'nao_aderente'
    : obrig.every((r) => r === 'atende') ? 'aderente'
      : obrig.every((r) => r === 'atende' || r === 'indicio') ? 'provavel' : 'a_confirmar';
  return { aderencia, categoria };
}

/* ---- interpretação local da tese (sem IA) ------------------------------- */

export const NOMES_UF = [['distrito federal', 'DF'], ['mato grosso do sul', 'MS'], ['mato grosso', 'MT'], ['minas gerais', 'MG'],
  ['rio grande do norte', 'RN'], ['rio grande do sul', 'RS'], ['rio de janeiro', 'RJ'], ['espirito santo', 'ES'],
  ['santa catarina', 'SC'], ['sao paulo', 'SP'], ['parana', 'PR'], ['pernambuco', 'PE'], ['paraiba', 'PB'], ['piaui', 'PI'],
  ['alagoas', 'AL'], ['amapa', 'AP'], ['amazonas', 'AM'], ['bahia', 'BA'], ['ceara', 'CE'], ['goias', 'GO'],
  ['maranhao', 'MA'], ['rondonia', 'RO'], ['roraima', 'RR'], ['sergipe', 'SE'], ['tocantins', 'TO'], ['acre', 'AC']];
const REGIOES = { sudeste: ['SP', 'RJ', 'MG', 'ES'], sul: ['PR', 'SC', 'RS'], nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'centro-oeste': ['DF', 'GO', 'MT', 'MS'], 'centro oeste': ['DF', 'GO', 'MT', 'MS'], norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'] };
const PREFERENCIA = /(de preferencia|preferencialmente|idealmente|se possivel|desejavel|seria bom|de prefer|melhor se|opcional|bonus|diferencial)/;
const GENERICAS = new Set(('quero busco buscar procuro procurar encontre encontrar liste listar mostre mostrar me preciso gostaria identifique identificar ' +
  'empresa empresas companhia companhias negocio negocios alvo alvos distribuidora distribuidoras distribuidor distribuidores ' +
  'quimica quimicas quimico quimicos trading tradings setor segmento mercado brasil brasileira brasileiras ' +
  'de da do das dos em no na nos nas para por com sem que e ou a o as os um uma uns umas ao aos sua seu suas seus ' +
  'sejam seja estejam esteja tenham tenha possuam possua atuem atue atuam atua sao ser estao for forem mais menos').split(' '));
const CONECTORES = /^(?:\s*(?:e|ou|que|com|mas|tambem|alem disso|sendo|preferencialmente|de preferencia|idealmente|se possivel)\b)+/;

/** Normaliza preservando o comprimento, para mapear trechos de volta ao original. */
function normalizarMesmoTamanho(texto) {
  return [...texto].map((c) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()[0] ?? c).join('');
}
function numeroBr(txt, unidade) {
  const limpo = txt.includes(',') ? txt.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(txt) ? txt.replace(/\./g, '') : txt);
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  const mult = /^(mil|k)$/.test(unidade || '') ? 1e3 : /^(mi|mm|milhao|milhoes)$/.test(unidade || '') ? 1e6 : /^(bi|bilhao|bilhoes)$/.test(unidade || '') ? 1e9 : 1;
  return n * mult;
}
const slug = (s) => normalizar(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'criterio';
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Converte a tese em proposta de critérios e recorte, só com regras locais.
 * Nada é descartado em silêncio: o que não vira regra cadastral vira critério
 * de pesquisa, e cada interpretação discutível vem com uma nota.
 */
/* Palavras que identificam cada subsetor acionável (texto normalizado, sem acento). */
const SUBSETOR_POR_PALAVRA = [
  ['Distribuição e trading químico', /\b(distribuidor\w*|distribuicao|tradings?|revendedor\w*|atacadist\w*)\b/],
  ['Especialidades e aditivos', /\b(especialidades? quimicas?|aditivos?)\b/],
  ['Tintas, vernizes e revestimentos', /\b(tintas?|vernizes?|revestimentos?)\b/],
  ['Domissanitários e produtos de limpeza', /\b(domissanitari\w*|produtos? de limpeza|saneantes?)\b/],
  ['Inorgânicos e gases industriais', /\b(inorganic\w*|gases? industriais?)\b/],
  ['Fertilizantes e nutrição vegetal', /\b(fertilizantes?|adubos?|nutricao vegetal)\b/],
  ['Defensivos agrícolas', /\b(defensivos?|agrotoxicos?|agroquimicos?)\b/],
  ['Explosivos e pirotecnia', /\b(explosiv\w*|pirotecni\w*|fogos de artificio)\b/],
  ['Resinas, elastômeros e fibras', /\b(resinas?|elastomeros?|fibras? sinteticas?|borrachas? sinteticas?)\b/],
];
/* Marcadores de exclusão. "Não só/apenas/somente" e "pelo/ao menos" não excluem (tratados abaixo). */
const EXCLUSAO = /\b(?:nao|nem|exceto|excetuando|excluindo|excluir|exclua|sem|salvo|tirando|fora|menos|evitar|evite|com excecao|a excecao)\b/g;
/* Fim do alcance de uma exclusão: fim da oração ou retomada afirmativa ("mas", ", procuro"). */
const RETOMADA = /[;.!?\n]|\b(?:mas|porem|contudo|entretanto|todavia|e sim)\b|,\s*(?:e\s+)?(?:procur|busc|prefer|prioriz|foc|quer[oe]|interess)\w*/g;
/* Tipos de empresa. Coordenados como alternativas ("distribuidoras ou fabricantes", "fabricantes e
   importadoras", "distribuidoras de produtos químicos ou fabricantes"), nenhum subsetor sozinho é
   seguro. */
const TIPO_EMPRESA = /^(?:distribuidor\w*|distribuicao|trading\w*|revendedor\w*|atacadist\w*|importador\w*|fabric\w*|produtor\w*|industri\w*|manufatur\w*|formulador\w*|envasador\w*|misturador\w*|empresas?|companhias?)$/;
const COORDENACAO = /^(?:ou|e|nem|,|\/)$/;
const LIGACAO = /^(?:as|os|a|o|de|do|da|dos|das|tambem|ainda)$/;
/**
 * Primeiro par de tipos de empresa coordenados na mesma frase: um tipo em qualquer ponto antes
 * da conjunção ("ou", "e", "nem", vírgula, barra) e outro logo depois dela (pulando artigos).
 * Sem janela de distância: a descrição do primeiro tipo pode ter qualquer tamanho. Devolve
 * [início, fim] no texto, ou null. "para fabricantes", "que representem fabricantes" não são
 * conjunções: cliente e representado não viram alternativa.
 */
function tiposCoordenados(n) {
  for (const frase of n.matchAll(/[^;.!?\n]+/g)) {
    const tokens = [...frase[0].matchAll(/[a-z]+|,|\//g)].map((t) => ({ t: t[0], ini: frase.index + t.index, fim: frase.index + t.index + t[0].length }));
    let primeiro = null;
    for (let i = 0; i < tokens.length; i++) {
      if (TIPO_EMPRESA.test(tokens[i].t)) { primeiro ??= tokens[i]; continue; }
      if (!primeiro || !COORDENACAO.test(tokens[i].t)) continue;
      let j = i + 1;
      while (j < tokens.length && (LIGACAO.test(tokens[j].t) || COORDENACAO.test(tokens[j].t))) j++;
      if (j < tokens.length && TIPO_EMPRESA.test(tokens[j].t)) return [primeiro.ini, tokens[j].fim];
    }
  }
  return null;
}
/* Alternativa entre produtos ou tipos ("resinas ou tintas", "e/ou", "nem"): depois do distribuidor,
   impede ler as menções seguintes como "produto vendido". */
const ALTERNATIVA = /\bou\b|\/|\bnem\b/;
/* "Distribuidoras de solventes": um produto só, logo depois do tipo de empresa, também descreve a
   tese (antes o trecho caía por ter uma palavra só). Vale só nesse molde e com a palavra em
   minúsculas: nome próprio ("de Campinas") não é produto. */
const PRODUTO_DO_TIPO = /\b(?:distribuidor\w*|distribuicao|trading\w*|revendedor\w*|atacadist\w*|importador\w*|fabric\w*|produtor\w*|industri\w*|empresas?)\s+(?:de|do|da|dos|das)\s+(?:produtos?\s+)?([a-z]{4,})\b/;
function produtoDoTipo(p, pn, palavras) {
  if (palavras.length !== 1 || /^produtos?$/.test(palavras[0])) return false;
  const m = PRODUTO_DO_TIPO.exec(pn);
  if (m?.[1] !== palavras[0]) return false;
  const inicial = p[m.index + m[0].length - m[1].length];
  return inicial === inicial.toLowerCase();
}
const NOMES_REGIAO = new Set(['sul', 'norte', 'sudeste', 'nordeste', 'centro-oeste', 'centro oeste']);
/**
 * Município sem "cidade de" ("distribuidoras em Campinas"), pela lista de municípios onde o
 * catálogo tem empresa. Depois de "em" vale também em minúsculas; depois de "no/na/de/do/da",
 * só com inicial maiúscula. Com inicial maiúscula, o nome tem de ser inteiro: "na Serra Gaúcha"
 * não é Serra. Nome de estado continua estado.
 *
 * Uma lista ("em Campinas, Osasco ou em Sorocaba", com "ou" ou "e") é um lugar só, qualquer um
 * deles: uma sede não fica em duas cidades. Negação logo antes ("fora de Campinas", "exceto em
 * Campinas") pede a sede fora delas. Devolve [{ ini, fim, nomes, negado }] (posições no texto, da
 * negação ou da preposição ao fim do último nome).
 */
const NEGACAO_LUGAR = /(?:^|[\s,;(])(fora|exceto|menos|nao|salvo|excluindo|tirando|sem ser)\s+$/;
function municipiosCitados(original, n, municipios) {
  const tokens = [...n.matchAll(/[a-z][a-z'-]*/g)].map((m) => ({ t: m[0], ini: m.index, fim: m.index + m[0].length }));
  const maiuscula = (k) => { const c = original[tokens[k].ini]; return c !== c.toLowerCase(); };
  const colado = (k) => /^\s+$/.test(n.slice(tokens[k - 1].fim, tokens[k].ini));
  // O município que começa no token k, com até seis palavras: o índice da última, ou -1.
  const nomeEm = (k) => {
    for (let j = Math.min(tokens.length - 1, k + 5); j >= k; j--) {
      if ([...Array(j - k)].some((_, x) => !colado(k + 1 + x))) continue;
      const nome = tokens.slice(k, j + 1).map((x) => x.t).join(' ');
      if (!municipios.has(nome) || NOMES_UF.some(([uf]) => uf === nome) || NOMES_REGIAO.has(nome)) continue;
      // Nome com maiúscula seguido de outra palavra com maiúscula: é parte de um nome maior.
      return maiuscula(k) && j + 1 < tokens.length && colado(j + 1) && maiuscula(j + 1) ? -1 : j;
    }
    return -1;
  };
  const achados = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!/^(?:em|no|na|de|do|da)$/.test(tokens[i].t) || !colado(i + 1)) continue;
    if (tokens[i].t !== 'em' && !maiuscula(i + 1)) continue;
    let ultimo = nomeEm(i + 1);
    if (ultimo < 0) continue;
    const nomes = [original.slice(tokens[i + 1].ini, tokens[ultimo].fim)];
    for (;;) {
      let k = ultimo + 1;
      if (k >= tokens.length) break;
      const entre = n.slice(tokens[ultimo].fim, tokens[k].ini);
      if (/^(?:ou|e)$/.test(tokens[k].t) && /^\s*,?\s*$/.test(entre)) k++;
      else if (!/^\s*,\s*$/.test(entre)) break;
      const preposicao = k < tokens.length && /^(?:em|no|na)$/.test(tokens[k].t);
      if (preposicao) k++;
      if (k >= tokens.length || !(preposicao && tokens[k - 1].t === 'em') && !maiuscula(k)) break;
      const fim = nomeEm(k);
      if (fim < 0) break;
      nomes.push(original.slice(tokens[k].ini, tokens[fim].fim));
      ultimo = fim;
    }
    const negacao = n.slice(Math.max(0, tokens[i].ini - 16), tokens[i].ini).match(NEGACAO_LUGAR);
    achados.push({ ini: negacao ? tokens[i].ini - negacao[0].replace(/^[\s,;(]/, '').length : tokens[i].ini, fim: tokens[ultimo].fim, nomes, negado: Boolean(negacao) });
    i = ultimo;
  }
  return achados;
}
const listaDe = (nomes, conjuncao) => nomes.length < 2 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} ${conjuncao} ${nomes.at(-1)}`;

/**
 * @param {string} tese
 * @param {{ referencia?: string, municipios?: Set<string> }} [opcoes] `municipios`: nomes
 *   normalizados (`normalizarMunicipio`) das sedes do catálogo. Sem eles, cidade só com "cidade de".
 */
export function interpretarTese(tese, { referencia, municipios } = {}) {
  const original = String(tese || '').slice(0, 2000);
  const n = normalizarMesmoTamanho(original);
  const usados = [];
  const criterios = [], notas = [];
  const filtros = { uf: '', busca: '', cnae: '', incluirPossiveis: false, subsetor: 'todos' };
  let frente = null;
  const clausulaDe = (pos) => {
    const ini = Math.max(n.lastIndexOf(',', pos - 1), n.lastIndexOf(';', pos - 1), n.lastIndexOf('.', pos - 1), n.lastIndexOf('\n', pos - 1)) + 1;
    const fins = [',', ';', '.', '\n'].map((s) => n.indexOf(s, pos)).filter((i) => i >= 0);
    return n.slice(ini, fins.length ? Math.min(...fins) : n.length);
  };
  const marcar = (m, desloc = 0) => { usados.push([m.index + desloc, m.index + desloc + m[0].length]); return original.slice(m.index + desloc, m.index + desloc + m[0].length).trim(); };
  const adicionar = (m, texto, regra, extra = {}) => {
    const trecho = marcar(m);
    const id = slug(`${regra.campo}_${criterios.length + 1}`);
    criterios.push({ id, texto, obrigatorio: !PREFERENCIA.test(clausulaDe(m.index)), tipo: 'cadastro', regra, trecho, origem: 'regras', ...extra });
  };
  const todos = (re) => [...n.matchAll(re)];

  // Frente do mandato.
  for (const m of todos(/\b(?:mandato|frente) de (compra|venda)\b|\bpara (compra|venda)\b|\b(comprador(?:es)?|alvos? de aquisicao|aquisicao)\b|\b(vendedor(?:es)?|para vender|candidat[ao]s? a venda)\b/g)) {
    frente = m[1] || m[2] || (m[3] ? 'compra' : 'venda'); marcar(m);
  }
  // Recorte: enquadramentos possíveis e CNAE principal.
  for (const m of todos(/\b(?:inclu(?:ir|a|indo)|ampli(?:ar|e)(?: o recorte)?(?: com| para)?)\s+(?:os\s+|as\s+)?(?:enquadramentos?\s+)?possive(?:l|is)\b/g)) { filtros.incluirPossiveis = true; marcar(m); }
  for (const m of todos(/\bcnae principal\s*:?\s*(\d{4})-?(\d)\/?(\d{2})\b/g)) { filtros.cnae = `${m[1]}${m[2]}${m[3]}`; marcar(m); }
  for (const m of todos(/\bcnae(?: secundario)?\s*:?\s*(\d{4})-?(\d)\/?(\d{2})\b/g)) {
    if (usados.some(([a, b]) => m.index >= a && m.index < b)) continue;
    adicionar(m, `Declara o CNAE ${m[1]}-${m[2]}/${m[3]}`, { campo: 'cnae_secundario', valor: [`${m[1]}${m[2]}${m[3]}`] });
  }

  /* Subsetor do recorte, só quando a leitura é segura (um recorte errado elimina empresas antes
     de qualquer critério; um recorte amplo só custa revisão). Na dúvida, todos os setores-alvo,
     com nota. Não consome o texto.
     - Exclusão: menção depois de "não", "nem", "exceto", "sem"... fica excluída até o fim da
       oração ou uma retomada afirmativa ("; procuro", "mas"), qualquer que seja a distância; e
       menção seguida de "excluídas". Excluída nunca vira recorte (e o recorte não a exclui).
     - Tipos de empresa coordenados como alternativas ("distribuidoras [de qualquer descrição] ou
       fabricantes"): todos, qualquer que seja o tamanho da descrição.
     - Um único subsetor afirmado: ele.
     - Distribuidor citado primeiro e produtos depois ("Distribuidoras ... de resinas"), sem tipos
       coordenados e sem "ou"/"nem"/"/" entre o distribuidor e o produto: distribuição; os
       produtos descrevem o que a distribuidora vende (ou a quem: "para fabricantes de tintas").
     - Qualquer outra combinação ("resinas ou tintas"): todos os setores-alvo. */
  const marcos = [
    ...[...n.matchAll(EXCLUSAO)].filter((m) => !(m[0] === 'menos' && /\b(?:pelo|ao|a)\s+$/.test(n.slice(Math.max(0, m.index - 5), m.index)))
      && !(m[0] === 'nao' && /^\s+(?:so|apenas|somente|necessariamente)\b/.test(n.slice(m.index + 3)))).map((m) => ({ pos: m.index, exclui: true })),
    ...[...n.matchAll(RETOMADA)].map((m) => ({ pos: m.index, exclui: false })),
  ].sort((a, b) => a.pos - b.pos);
  const excluidaEm = (pos, fim) => marcos.filter((k) => k.pos < pos).at(-1)?.exclui === true || /^\s+(?:excluid|excetuad)\w*/.test(n.slice(fim));
  const mencoes = SUBSETOR_POR_PALAVRA.flatMap(([rotulo, re]) => [...n.matchAll(new RegExp(re.source, 'g'))].map((m) => ({
    rotulo, pos: m.index, palavra: original.slice(m.index, m.index + m[0].length), negada: excluidaEm(m.index, m.index + m[0].length),
  }))).sort((a, b) => a.pos - b.pos);
  const positivas = mencoes.filter((x) => !x.negada);
  const distintos = [...new Set(positivas.map((x) => x.rotulo))];
  const negados = [...new Set(mencoes.filter((x) => x.negada).map((x) => x.rotulo))].filter((r) => !distintos.includes(r));
  const DISTRIBUICAO = 'Distribuição e trading químico';
  const coordenados = tiposCoordenados(n);
  // Produtos depois do distribuidor só são "produto vendido" sem alternativa no caminho.
  const produtoVendido = positivas[0]?.rotulo === DISTRIBUICAO && positivas.filter((x) => x.rotulo !== DISTRIBUICAO)
    .every((x) => !ALTERNATIVA.test(n.slice(positivas[0].pos + positivas[0].palavra.length, x.pos)));
  if (distintos.length && coordenados) {
    notas.push(`A tese coordena tipos de empresa como alternativas ("${original.slice(...coordenados)}"): o recorte cobre todos os setores-alvo. Escolha um em "Recorte" se a tese for só sobre um deles.`);
  } else if (distintos.length === 1 || (distintos.length > 1 && produtoVendido)) {
    filtros.subsetor = positivas[0].rotulo;
    notas.push(`Recorte no subsetor "${filtros.subsetor}" (pela palavra "${positivas[0].palavra}")${distintos.length > 1 ? `; ${distintos.slice(1).map((r) => `"${r}"`).join(', ')} foi lido como produto vendido, não como recorte` : ''}. Troque em "Recorte" para ver outros subsetores químicos.`);
  } else if (distintos.length > 1) {
    notas.push(`A tese cita mais de um subsetor (${distintos.map((r) => `"${r}"`).join(', ')}): o recorte cobre todos os setores-alvo. Escolha um em "Recorte" se a tese for só sobre um deles.`);
  } else if (negados.length) notas.push('A tese só cita subsetores excluídos: o recorte cobre todos os subsetores químicos acionáveis. Escolha um em "Recorte" para concentrar a revisão.');
  else notas.push('A tese não cita um subsetor: o recorte cobre todos os subsetores químicos acionáveis. Escolha um em "Recorte" para concentrar a revisão.');
  if (negados.length) notas.push(`${negados.map((r) => `"${r}"`).join(', ')} aparece negado na tese e não define o recorte; o recorte não exclui esse subsetor, confira na revisão.`);

  // Localização: cidade explícita, região, nomes de estado e siglas em maiúsculas.
  const ufs = new Set();
  for (const m of todos(/\b(na cidade d[eo]|cidade d[eo]|municipio d[eo]|sediadas? (?:em|n[ao])|com sede (?:em|n[ao]))\s+([a-z' ]{3,40}?)(?=\s*(?:[,;.\n]|\s-\s|\(|\/|$|\s(?:e|com|que|sem|de preferencia|preferencialmente)\b))/g)) {
    const nomeOriginal = original.slice(m.index + m[0].length - m[2].length, m.index + m[0].length).trim();
    const uf = NOMES_UF.find(([nome]) => nome === m[2].trim());
    if (uf && !/cidade|municipio/.test(m[1])) continue; // "sede em São Paulo" é ambíguo: tratado como estado abaixo, com nota
    // "Cidade de São Paulo"/"cidade do Rio de Janeiro": município da capital, dentro do seu estado.
    const negacao = n.slice(Math.max(0, m.index - 16), m.index).match(NEGACAO_LUGAR);
    if (negacao) {
      const ini = m.index - negacao[0].replace(/^[\s,;(]/, '').length;
      adicionar(Object.assign([n.slice(ini, m.index + m[0].length)], { index: ini }), `Sede fora de ${maiuscula(nomeOriginal)}`, { campo: 'municipio_fora', valor: [nomeOriginal] });
      continue;
    }
    if (uf) ufs.add(uf[1]);
    adicionar(m, `Sede em ${maiuscula(nomeOriginal)}`, { campo: 'municipio', valor: nomeOriginal });
  }
  if (municipios?.size) {
    for (const c of municipiosCitados(original, n, municipios)) {
      if (usados.some(([a, b]) => c.ini < b && c.fim > a)) continue;
      const nomes = c.nomes.map(maiuscula);
      const regra = c.negado ? { campo: 'municipio_fora', valor: c.nomes } : nomes.length > 1 ? { campo: 'municipios', valor: c.nomes } : { campo: 'municipio', valor: c.nomes[0] };
      adicionar(Object.assign([n.slice(c.ini, c.fim)], { index: c.ini }), c.negado ? `Sede fora de ${listaDe(nomes, 'e')}` : `Sede em ${listaDe(nomes, 'ou')}`, regra);
    }
  }
  for (const m of todos(/\b(?:regiao |no |na |do |da )?(sudeste|nordeste|centro[- ]oeste|sul|norte)\b(?! de)/g)) {
    if (!/regiao|no |na |do |da /.test(m[0])) continue;
    REGIOES[m[1]].forEach((u) => ufs.add(u)); marcar(m);
    notas.push(`Região ${m[1]} convertida nas UFs ${REGIOES[m[1]].join(', ')}.`);
  }
  for (const [nome, uf] of NOMES_UF) {
    for (const m of todos(new RegExp(`\\b${nome}\\b`, 'g'))) {
      if (usados.some(([a, b]) => m.index >= a && m.index < b)) continue;
      ufs.add(uf); marcar(m);
      if (uf === 'SP' || uf === 'RJ') notas.push(`"${original.slice(m.index, m.index + m[0].length)}" foi lido como estado (${uf}). Para a capital, escreva "cidade ${uf === 'RJ' ? 'do' : 'de'} ${original.slice(m.index, m.index + m[0].length)}".`);
    }
  }
  for (const m of original.matchAll(/(?<![A-Za-zÀ-ÿ])(?:em|no|na|de|do|da|e|,|\/|sede|UF|estado)\s+([A-Z]{2})(?![A-Za-zÀ-ÿ])/g)) {
    if (UFS.includes(m[1])) { ufs.add(m[1]); usados.push([m.index + m[0].length - 2, m.index + m[0].length]); }
  }
  if (/\bpar[aá]\b/.test(original) && /\b(?:estado do|no) pará\b/i.test(original)) ufs.add('PA');
  if (ufs.size === 1) filtros.uf = [...ufs][0];
  else if (ufs.size > 1) criterios.push({ id: 'uf', texto: `Sede em ${[...ufs].sort().join(', ')}`, obrigatorio: true, tipo: 'cadastro',
    regra: { campo: 'uf', valor: [...ufs].sort() }, trecho: null, origem: 'regras' });
  for (const m of todos(/\b(?:presenca|atuacao|operacao|filiais?|unidades?) (?:em|no|na)\s+(?:mais de\s+)?(\d{1,2})\s+estados\b/g)) {
    adicionar(m, `Estabelecimentos em pelo menos ${m[1]} UFs`, { campo: 'ufs_atuacao_min', valor: Math.max(2, Number(m[1])) });
  }
  for (const m of todos(/\b(?:atuacao|presenca) (nacional|em varios estados|em todo o brasil|multiestadual|interestadual)\b/g)) {
    const minimo = /nacional|todo o brasil/.test(m[1]) ? 5 : 3;
    adicionar(m, `Estabelecimentos em pelo menos ${minimo} UFs`, { campo: 'ufs_atuacao_min', valor: minimo });
    notas.push(`"${m[0]}" interpretado como estabelecimentos ativos em ${minimo} ou mais UFs.`);
  }

  // Idade.
  for (const m of todos(/\b(?:mais de|acima de|pelo menos|no minimo|minimo de|ha mais de|superior a|com)\s+(\d{1,3})\s+anos\b(?:\s+de\s+(?:mercado|atuacao|existencia|historia|fundacao|vida|operacao))?/g)) {
    adicionar(m, `Mais de ${m[1]} anos de fundação`, { campo: 'idade_min', valor: Number(m[1]) });
  }
  for (const m of todos(/\b(?:menos de|ate|no maximo|abaixo de)\s+(\d{1,3})\s+anos\b(?:\s+de\s+(?:mercado|atuacao|existencia|fundacao|vida))?/g)) {
    if (usados.some(([a, b]) => m.index >= a && m.index < b)) continue;
    adicionar(m, `Até ${m[1]} anos de fundação`, { campo: 'idade_max', valor: Number(m[1]) });
  }
  const ano = Number((referencia || new Date().toISOString()).slice(0, 4));
  for (const m of todos(/\b(?:fundadas?|abertas?|criadas?|constituidas?)\s+(?:antes de|ate)\s+((?:19|20)\d{2})\b/g)) {
    adicionar(m, `Fundada até ${m[1]}`, { campo: 'idade_min', valor: Math.max(1, ano - Number(m[1])) });
  }
  for (const m of todos(/\b(tradicionais|tradicional|maduras?|consolidadas?|longevas?)\b/g)) {
    if (usados.some(([a, b]) => m.index >= a && m.index < b) || criterios.some((c) => c.regra?.campo === 'idade_min')) continue;
    adicionar(m, 'Mais de 20 anos de fundação', { campo: 'idade_min', valor: 20 });
    notas.push(`"${m[1]}" interpretado como 20 anos ou mais desde a abertura do CNPJ. Ajuste se a tese pedir outro marco.`);
  }

  // Capital social.
  for (const m of todos(/\bcapital(?: social)?\s+(acima de|maior que|superior a|de pelo menos|minimo de|a partir de|acima|maior|abaixo de|menor que|inferior a|ate|de ate|no maximo)\s*(?:r\$\s*)?(\d[\d.,]*)\s*(mil|k|mi|mm|milhao|milhoes|bi|bilhao|bilhoes)?\b/g)) {
    const valor = numeroBr(m[2], m[3]);
    if (!valor) continue;
    const minimo = !/abaixo|menor|inferior|ate|maximo/.test(m[1]);
    adicionar(m, `Capital social ${minimo ? 'de pelo menos' : 'até'} ${brl(valor)}`, { campo: minimo ? 'capital_min' : 'capital_max', valor });
  }

  // Porte.
  const porte = new Set();
  for (const m of todos(/\b(medio|grande|pequeno) porte\b|\b(medias|grandes|pequenas) empresas\b|\bmiddle market\b|\b(epp)\b|\bmicro ?empresas?\b|\bpequenas e medias\b|\bmedias e grandes\b/g)) {
    const t = m[0];
    if (/pequenas e medias/.test(t)) { porte.add('EPP'); porte.add('DEMAIS'); }
    else if (/medio|medias|grande|middle/.test(t)) porte.add('DEMAIS');
    else if (/pequen|epp/.test(t)) porte.add('EPP');
    else porte.add('ME');
    marcar(m);
  }
  if (porte.size) {
    criterios.push({ id: 'porte', texto: `Porte declarado: ${[...porte].map((p) => NOME_PORTE[p]).join(' ou ')}`, obrigatorio: true, tipo: 'cadastro',
      regra: { campo: 'porte', valor: [...porte] }, trecho: null, origem: 'regras' });
    if (porte.has('DEMAIS')) notas.push('Porte "médio/grande" usa o porte declarado no CNPJ (acima de EPP). O cadastro não informa faturamento.');
  }

  // Estrutura: filiais, sócios, natureza, estrangeiro.
  for (const m of todos(/\b(?:com|possuam?|tenham?|que tenham|que possuam)\s+(?:mais de\s+(\d{1,3})\s+|pelo menos\s+(\d{1,3})\s+|(\d{1,3})\s+ou mais\s+)?(filiais|filial|unidades|estabelecimentos|centros de distribuicao)\b/g)) {
    const qtd = Number(m[1] || m[2] || m[3] || 0);
    const minimo = /filia/.test(m[4]) ? Math.max(2, qtd + (m[1] ? 2 : 1)) : Math.max(2, qtd + (m[1] ? 1 : 0));
    adicionar(m, `Pelo menos ${minimo} estabelecimentos ativos`, { campo: 'estabelecimentos_min', valor: minimo });
  }
  for (const m of todos(/\b(?:ate|no maximo|com ate)\s+(\d{1,3})\s+socios\b/g)) adicionar(m, `Até ${m[1]} sócios`, { campo: 'socios_max', valor: Number(m[1]) });
  for (const m of todos(/\b(?:sem|nenhum|nao (?:tenham|tenha|possuam?)) (?:socio|capital|acionista|controlador)e?s? estrangeir[oa]s?\b|\bcapital (?:100% )?nacional\b|\bcontrole nacional\b/g)) {
    adicionar(m, 'Sem sócio estrangeiro', { campo: 'socio_estrangeiro', valor: false });
  }
  for (const m of todos(/\b(?:com|tenham?|possuam?|controladas? por) (?:socio|capital|acionista|controlador)e?s? estrangeir[oa]s?\b|\bsubsidiarias? de multinaciona(?:l|is)\b/g)) {
    adicionar(m, 'Com sócio estrangeiro no quadro', { campo: 'socio_estrangeiro', valor: true });
  }
  for (const m of todos(/\b(?:empresas? )?familiar(?:es)?\b|\bde controle familiar\b|\bcontrolad[ao]s? por familias?\b|\bempresas? de dono\b|\bcontrole (?:por )?pessoas? fisicas?\b|\bsem (?:holding|fundo|private equity|socio pessoa juridica)\b|\bfounder[- ]led\b/g)) {
    if (criterios.some((c) => c.regra?.campo === 'sem_socio_pj')) { marcar(m); continue; }
    if (/familia/.test(m[0])) {
      // Família não está no cadastro, e família com holding também é familiar: o requisito fica para
      // a pesquisa, e a ausência de PJ entra só como preferência, que o membro pode tornar obrigatória.
      const trecho = marcar(m);
      criterios.push({ id: slug(`pesquisa_controle_familiar_${criterios.length + 1}`), texto: 'Controle familiar', obrigatorio: !PREFERENCIA.test(clausulaDe(m.index)),
        tipo: 'pesquisa', regra: null, trecho, origem: 'regras' });
      criterios.push({ id: slug(`sem_socio_pj_${criterios.length + 1}`), texto: 'Controle por pessoas físicas (sem empresa no quadro)', obrigatorio: false,
        tipo: 'cadastro', regra: { campo: 'sem_socio_pj', valor: true }, trecho, origem: 'regras' });
      notas.push('"Familiar" não consta no cadastro: virou critério de pesquisa. "Sem empresa no quadro" entrou como opcional, porque família com holding também é familiar; torne-o obrigatório só se fizer sentido para a tese.');
      continue;
    }
    adicionar(m, 'Controle por pessoas físicas (sem empresa no quadro)', { campo: 'sem_socio_pj', valor: true });
  }
  for (const m of todos(/\bsociedades? anonimas?\b|\bs\/a\b|(?<![a-z])s\.a\.?(?![a-z])/g)) adicionar(m, 'Sociedade anônima', { campo: 'natureza', valor: ['sa'] });
  for (const m of todos(/\b(?:sociedades? )?limitadas?\b|\bltda\b/g)) adicionar(m, 'Sociedade limitada', { campo: 'natureza', valor: ['ltda'] });

  // Sinais públicos de atividade e expansão.
  for (const m of todos(/\b(?:ibama|rapp|licenca ambiental|cadastro tecnico federal|transport(?:e|em|am|a|ar|ando) (?:de )?(?:produtos? )?(?:perigosos?|quimicos?)|produtos? perigosos?)\b/g)) {
    if (criterios.some((c) => c.regra?.campo === 'ibama')) { marcar(m); continue; }
    const transporte = /transport|perigos/.test(m[0]);
    adicionar(m, transporte ? 'Declara transporte de produto perigoso ao IBAMA' : 'Atividade química declarada ao IBAMA',
      { campo: 'ibama', valor: transporte ? ['transporte'] : ['comercio', 'transporte', 'industria'] });
  }
  for (const m of todos(/\b(?:abriu|abriram|abertura de|inaugurou|inauguraram) (?:uma |novas? )?(?:filia(?:l|is)|unidades?)(?: (?:recente(?:mente)?|nos ultimos (\d{1,2}) anos))?\b|\bem expansao\b|\bexpandindo\b/g)) {
    const anos = Number(m[1] || 3);
    adicionar(m, `Abriu filial nos últimos ${anos} anos`, { campo: 'filial_recente_anos', valor: anos });
    if (/expan/.test(m[0])) notas.push(`"${m[0]}" interpretado como filial aberta nos últimos ${anos} anos.`);
  }

  // O que sobrou vira critério de pesquisa, com o texto do próprio membro.
  let resto = '', excedentesPesquisa = 0;
  for (let i = 0; i < original.length; i++) resto += usados.some(([a, b]) => i >= a && i < b) ? '|' : original[i];
  const pedacos = resto.split(/[|;\n.]+|,(?![^(]*\))|\s+e\s+(?=que\b|com\b|sem\b|tenh|possu|atu|sej|represent|distribu|vend|revend|import|export|transport|fabri|produz|atend|ofere|prest)/i);
  for (const bruto of pedacos) {
    const p = bruto.replace(/\s+/g, ' ').trim();
    const pn = normalizarMesmoTamanho(p);
    const palavras = pn.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERICAS.has(w));
    if (palavras.length < 2 && !produtoDoTipo(p, pn, palavras)) {
      // Nome próprio solto no meio do trecho ("em Osasco") não some sem aviso.
      const onde = palavras.length === 1 ? pn.search(new RegExp(`\\b${palavras[0]}\\b`)) : -1;
      const solto = onde > 0 ? p.slice(onde, onde + palavras[0].length) : '';
      if (solto && solto[0] !== solto[0].toLowerCase()) {
        notas.push(`"${solto}" não virou critério. Se for a cidade da sede, escreva "cidade de ${solto}".`);
      }
      continue;
    }
    const texto = maiuscula(p.slice(pn.match(CONECTORES)?.[0]?.length ?? 0)
      .replace(/(?:\s+(?:e|ou|que|com|de|da|do|das|dos|em|a|o))+\s*$/i, '').replace(/^[\s,:-]+|[\s,:-]+$/g, '')).slice(0, 200);
    if (texto.length < 6) continue;
    if (criterios.filter((c) => c.tipo === 'pesquisa').length >= MAX_PESQUISA) { excedentesPesquisa++; continue; }
    criterios.push({ id: slug(`pesquisa_${palavras.slice(0, 3).join('_')}`), texto, obrigatorio: !PREFERENCIA.test(pn), tipo: 'pesquisa', regra: null, trecho: p.slice(0, 300), origem: 'regras' });
  }
  // Ids únicos e no máximo o limite, preservando a ordem de aparição.
  const vistos = new Set();
  const finais = criterios.filter((c) => c.texto).slice(0, MAX_CRITERIOS).map((c) => {
    let id = c.id, k = 2;
    while (vistos.has(id)) id = `${c.id.slice(0, 36)}_${k++}`;
    vistos.add(id);
    return { ...c, id };
  });
  if (excedentesPesquisa) notas.push(`${excedentesPesquisa} trecho(s) da tese passaram do limite de ${MAX_PESQUISA} critérios de pesquisa e não viraram critério. Divida a pesquisa.`);
  if (criterios.length > MAX_CRITERIOS) notas.push(`A tese gerou mais de ${MAX_CRITERIOS} critérios; os excedentes ficaram de fora. Divida a pesquisa.`);
  if (!finais.length) notas.push('Não identifiquei critérios verificáveis. Descreva porte, região, tempo de mercado, estrutura ou o que a empresa faz.');
  return { frente, filtros, criterios: finais, notas: [...new Set(notas)] };
}
