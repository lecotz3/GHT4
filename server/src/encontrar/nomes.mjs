import { normalizar } from '../agente/catalogo.mjs';
import { NOMES_UF, UFS } from '../pesquisa/criterios.mjs';

/* =============================================================================
 *  GHT4 · empresa pelo nome no pedido ("quem decide na Química Alfa")
 * -----------------------------------------------------------------------------
 *  Sem isto, o nome da empresa virava critério do site e ninguém saía em
 *  "Atendem". Aqui o pedido só PROPÕE trechos que parecem nome de empresa, e o
 *  catálogo decide: vira empresa o trecho que corresponde, por palavras inteiras
 *  do nome ou da razão social, a no máximo 20 empresas. O que não corresponde
 *  segue para o leitor da tese como antes, com uma nota. CNPJ é exato: fora do
 *  catálogo, o recorte fica vazio em vez de virar "todas as empresas".
 * ========================================================================== */

export const MAX_EMPRESAS_POR_NOME = 20;
const MAX_CANDIDATOS = 3;
const MAX_PALAVRAS = 6;
const LIMITE_CONSULTA = 500;

/* Palavras que não identificam uma empresa sozinhas: tipo, setor, forma jurídica. */
const COMUNS = new Set(('quimica quimicas quimico quimicos distribuidora distribuidoras distribuidor distribuidores distribuicao '
  + 'industria industrias industrial industriais comercio comercial importadora importadoras importacao exportacao exportadora '
  + 'produtos produto brasil brasileira grupo companhia cia empresa empresas ltda sa eireli me epp holding participacoes '
  + 'trading tradings tintas resinas solventes fertilizantes defensivos aditivos especialidades gases representacoes servicos').split(' '));
const CONECTORES = /^(?:de|do|da|dos|das|e|d)$/;
/* Onde o trecho deixa de ser nome: começo de outra oração ou outra preposição de lugar. */
const FIM = /^(?:que|com|sem|onde|cujo|cuja|cujos|cujas|ou|para|por|em|nas|nos|na|no|a|o|as|os|mas|ate|desde|ha|preferencialmente|idealmente)$/;
/* Começos que descrevem lugar ou estrutura, não uma empresa ("na região de", "no setor de", "na casa"). */
const LUGAR = /^(?:cidade|regiao|estado|municipio|rede|casa|setor|area|mercado|segmento|sede|capital|interior|litoral|grande|zona|polo|parte|lista|base|catalogo|ght4|cnpj)$/;
const REGIOES = new Set(['sul', 'norte', 'sudeste', 'nordeste', 'centro-oeste', 'centro oeste']);
const ESTADOS = new Set(NOMES_UF.map(([nome]) => nome));
/* CNPJ completo, ou a raiz de oito dígitos depois da palavra "CNPJ" (sozinho, "10.000.000" é valor). */
const CNPJ = /(?:\bcnpj(?:\s+raiz)?\s*:?\s*)?(?<![\d.])\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)|\bcnpj(?:\s+raiz)?\s*:?\s*\d{2}\.?\d{3}\.?\d{3}(?![\d/])/gi;

const identifica = (w) => !COMUNS.has(w) && !CONECTORES.test(w) && w.length >= 2;

/**
 * Trechos do pedido que podem ser nome de empresa: depois de artigo no singular ("na", "no",
 * "da", "do", "pela", "pelo") em qualquer grafia, ou depois de "em"/"de" com inicial maiúscula;
 * e CNPJ, completo ou raiz. Nome de estado, região, sigla de UF e município do catálogo ficam de
 * fora: são lugar, e o leitor da tese cuida deles.
 *
 * @param {string} original o pedido
 * @param {string} n o pedido normalizado com o mesmo comprimento
 * @param {(ini: number, fim: number) => boolean} livre se o trecho ainda não foi lido (papel, acesso)
 * @param {Set<string>|null} municipios
 * @returns {{ ini: number, fim: number, palavras: {t: string, ini: number, fim: number}[], maiuscula: boolean, cnpj: string|null }[]}
 */
export function candidatosANome(original, n, livre, municipios = null) {
  const achados = [];
  for (const m of original.matchAll(CNPJ)) {
    if (achados.length >= MAX_CANDIDATOS || !livre(m.index, m.index + m[0].length)) continue;
    const digitos = m[0].replace(/\D/g, '');
    achados.push({ ini: m.index, fim: m.index + m[0].length, palavras: [], maiuscula: true, cnpj: digitos.slice(0, 8) });
  }
  // Apóstrofo só dentro da palavra ("d'Oeste"): o que fecha uma citação ('Alfa') não gruda no nome.
  const tokens = [...n.matchAll(/[a-z0-9](?:[a-z0-9&-]|'(?=[a-z]))*/g)].map((m) => ({ t: m[0], ini: m.index, fim: m.index + m[0].length }));
  // Entre a preposição e o nome cabem aspas (na "Química Alfa"); dentro do nome, ponto e "&" de
  // abreviatura ("Mario A. Lussari & Cia."). Vírgula, ponto e vírgula e aspas fecham o nome.
  const abre = (a, b) => /^[\s"'“”‘’«»]+$/.test(n.slice(a.fim, b.ini)) && /\s/.test(n.slice(a.fim, b.ini));
  const colado = (a, b) => /^[\s.&]+$/.test(n.slice(a.fim, b.ini));
  const maiuscula = (x) => { const c = original[x.ini]; return c !== c.toLowerCase(); };
  // Candidatos a nome podem se sobrepor ("Alfa e da Beta Química" e "Beta Química"): o catálogo
  // escolhe o trecho de cada um. Só o CNPJ, exato, tira as palavras da disputa.
  const ocupado = (x) => !livre(x.ini, x.fim) || achados.some((a) => a.cnpj && x.ini < a.fim && x.fim > a.ini);
  for (let i = 0; i < tokens.length - 1 && achados.length < MAX_CANDIDATOS; i++) {
    const artigo = /^(?:na|no|da|do|pela|pelo)$/.test(tokens[i].t);
    if (!artigo && !/^(?:em|de)$/.test(tokens[i].t)) continue;
    // "cidade de Campinas", "sediadas em Santos": o que vem depois é lugar.
    if (i > 0 && (LUGAR.test(tokens[i - 1].t) || /^(?:sediad|localizad|situad)/.test(tokens[i - 1].t))) continue;
    const primeiro = tokens[i + 1];
    if (!abre(tokens[i], primeiro) || ocupado(tokens[i]) || ocupado(primeiro) || (!artigo && !maiuscula(primeiro))) continue;
    const palavras = [primeiro];
    for (let j = i + 2; j < tokens.length && palavras.length < MAX_PALAVRAS; j++) {
      // "A." de "Mario A. Lussari" é inicial, não o artigo que abriria outra oração.
      const inicial = tokens[j].t.length === 1 && maiuscula(tokens[j]) && n[tokens[j].fim] === '.';
      if (!colado(tokens[j - 1], tokens[j]) || (FIM.test(tokens[j].t) && !inicial) || ocupado(tokens[j])) break;
      palavras.push(tokens[j]);
    }
    while (palavras.length && CONECTORES.test(palavras.at(-1).t)) palavras.pop();
    if (!palavras.length || LUGAR.test(palavras[0].t) || !palavras.some((x) => identifica(x.t))) continue;
    if (UFS.includes(original.slice(primeiro.ini, primeiro.fim))) continue;
    const lugar = palavras.some((_, k) => {
      const nome = palavras.slice(0, k + 1).map((x) => x.t).join(' ');
      return ESTADOS.has(nome) || REGIOES.has(nome) || Boolean(municipios?.has(nome));
    });
    if (lugar) continue;
    // Sem pular o trecho: o catálogo pode aceitar só o começo dele, e o resto ("e da Beta") ainda é lido.
    achados.push({ ini: primeiro.ini, fim: palavras.at(-1).fim, palavras, maiuscula: maiuscula(primeiro), cnpj: null });
  }
  return achados.sort((a, b) => a.ini - b.ini);
}

/**
 * Confere os candidatos no catálogo, uma consulta por candidato. Um candidato vira empresa
 * quando um prefixo dele corresponde, por palavras inteiras do nome ou da razão social, a entre
 * 1 e 20 empresas: primeiro com todas as palavras do prefixo, depois só com as que identificam
 * ("Grupo Alfa" acha "Alfa Química"). Mais de 20: genérico demais, segue como descrição.
 *
 * @returns {Promise<{ nomes: { ini: number, fim: number, empresas: object[], motivo: 'fora'|'demais'|null, maiuscula: boolean, cnpj: boolean }[], referencia: string|null }>}
 */
export async function resolverNomes(catalogo, candidatos) {
  const nomes = [];
  let referencia = null;
  for (const c of candidatos) {
    // Começa dentro de um nome já aceito ("Alfa do Brasil" → "do Brasil"): não é outro nome.
    if (nomes.some((x) => x.empresas.length && c.ini >= x.ini && c.ini < x.fim)) continue;
    if (c.cnpj) {
      const r = await catalogo.recorte({ busca: c.cnpj, incluirPossiveis: true }, { limite: LIMITE_CONSULTA });
      referencia ??= r.referencia ?? null;
      const empresas = r.empresas.filter((e) => e.cnpjRaiz === c.cnpj);
      nomes.push({ ini: c.ini, fim: c.fim, empresas, motivo: empresas.length ? null : 'fora', maiuscula: true, cnpj: true });
      continue;
    }
    const chave = c.palavras.map((x) => x.t).filter(identifica).sort((a, b) => b.length - a.length)[0];
    const r = await catalogo.recorte({ busca: chave, incluirPossiveis: true }, { limite: LIMITE_CONSULTA });
    referencia ??= r.referencia ?? null;
    const palavrasDe = new Map(r.empresas.map((e) => [e.id, new Set(normalizar(`${e.nome} ${e.razaoSocial ?? ''}`).split(/[^a-z0-9&]+/))]));
    let achado = null, demais = false;
    procura: for (const soAsQueIdentificam of [false, true]) {
      for (let k = c.palavras.length; k >= 1; k--) {
        const prefixo = c.palavras.slice(0, k);
        if (CONECTORES.test(prefixo.at(-1).t)) continue;
        const exigidas = prefixo.map((x) => x.t).filter((w) => !CONECTORES.test(w) && (!soAsQueIdentificam || identifica(w)));
        if (!exigidas.some(identifica)) continue;
        const empresas = r.empresas.filter((e) => exigidas.every((w) => palavrasDe.get(e.id).has(w)));
        if (empresas.length > MAX_EMPRESAS_POR_NOME) { demais = true; break procura; }
        if (empresas.length) { achado = { fim: prefixo.at(-1).fim, empresas }; break procura; }
      }
    }
    nomes.push(achado
      ? { ini: c.ini, fim: achado.fim, empresas: achado.empresas, motivo: null, maiuscula: c.maiuscula, cnpj: false }
      : { ini: c.ini, fim: c.fim, empresas: [], motivo: demais ? 'demais' : 'fora', maiuscula: c.maiuscula, cnpj: false });
  }
  return { nomes, referencia };
}

const FORMA_JURIDICA = /^(?:ltda|sa|s|a|eireli|me|epp|cia|limitada|anonima|sociedade)$/;

/**
 * Empresas do catálogo parecidas com um nome escrito à mão ("Química Alfa Ltda."), para sugerir
 * o CNPJ de quem a rede só conhece pelo nome da organização. Exige, por palavras inteiras do nome
 * ou da razão social, todas as palavras que identificam o texto; ordena pelo nome igual, depois
 * pelas palavras em comum. CNPJ ou raiz no texto vai direto à empresa. Só sugere: quem vincula é
 * um membro, porque homônimo de empresa existe.
 *
 * @returns {Promise<{ empresas: object[], total: number, identifica: boolean }>}
 */
export async function empresasParecidas(catalogo, texto, { limite = 8 } = {}) {
  const digitos = String(texto ?? '').replace(/\D/g, '');
  if (/^\s*[\d./-]+\s*$/.test(String(texto ?? '')) && (digitos.length === 14 || digitos.length === 8)) {
    const raiz = digitos.slice(0, 8);
    const r = await catalogo.recorte({ busca: raiz, incluirPossiveis: true }, { limite: LIMITE_CONSULTA });
    const empresas = r.empresas.filter((e) => e.cnpjRaiz === raiz);
    return { empresas, total: empresas.length, identifica: true };
  }
  const normal = normalizar(texto).replace(/[^a-z0-9&]+/g, ' ').trim();
  const palavras = normal.split(' ').filter(Boolean);
  const identificam = palavras.filter(identifica).filter((w) => !FORMA_JURIDICA.test(w));
  if (!identificam.length) return { empresas: [], total: 0, identifica: false };
  const chave = [...identificam].sort((a, b) => b.length - a.length)[0];
  const r = await catalogo.recorte({ busca: chave, incluirPossiveis: true }, { limite: LIMITE_CONSULTA });
  const alvo = palavras.filter((w) => !CONECTORES.test(w) && !FORMA_JURIDICA.test(w));
  const semForma = (s) => normalizar(s).replace(/[^a-z0-9&]+/g, ' ').split(' ').filter((w) => w && !FORMA_JURIDICA.test(w)).join(' ');
  const pontuadas = [];
  for (const e of r.empresas) {
    const doNome = new Set(normalizar(`${e.nome} ${e.razaoSocial ?? ''}`).split(/[^a-z0-9&]+/));
    if (!identificam.every((w) => doNome.has(w))) continue;
    const igual = semForma(e.nome) === alvo.join(' ') || semForma(e.razaoSocial ?? '') === alvo.join(' ');
    pontuadas.push({ e, nota: (igual ? 1000 : 0) + 10 * alvo.filter((w) => doNome.has(w)).length - semForma(e.nome).split(' ').length });
  }
  pontuadas.sort((a, b) => b.nota - a.nota || a.e.nome.localeCompare(b.e.nome, 'pt-BR') || a.e.id.localeCompare(b.e.id));
  return { empresas: pontuadas.slice(0, limite).map((x) => x.e), total: pontuadas.length, identifica: true };
}
