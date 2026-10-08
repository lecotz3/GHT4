import { normalizarMunicipio, SUBSETORES_ALVO, TODOS_SUBSETORES } from './filtros.mjs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { classificar, forcaDoEstado } from '../../../packages/domain/classificacao.mjs';
import { atributosDe, contarDominios, lerPegadaIbama } from './atributos.mjs';

/** Subsetor do escopo original. Pesquisas gravadas sem `subsetor` nos filtros continuam nele. */
export const SUBSETOR = 'Distribuição e trading químico';
export { SUBSETORES_ALVO, TODOS_SUBSETORES };
/** Subsetores consultados: um deles, ou todos os acionáveis (`todos`, vazio ou ausente). */
export function escopoSubsetores(subsetor) {
  if (!subsetor || subsetor === TODOS_SUBSETORES) return SUBSETORES_ALVO;
  if (!SUBSETORES_ALVO.includes(subsetor)) throw Object.assign(new Error('Subsetor fora do escopo.'), { codigo: 'subsetor_invalido' });
  return [subsetor];
}
export const rotuloEscopo = (escopo) => escopo.length === 1 ? escopo[0] : `Químicos · ${escopo.length} subsetores`;
const ARQUIVO = fileURLToPath(new URL('../../../data-quimicos.js', import.meta.url));
const ARQUIVO_IBAMA = fileURLToPath(new URL('../../../data-ibama.js', import.meta.url));
/** Página do recorte. A pesquisa (prévia e revisão) usa só a primeira: com os 9 setores-alvo o
 *  escopo amplo passa disso (12 mil sem possíveis, 36 mil com) e o funil marca `truncado`.
 *  O monitoramento lê as páginas seguintes (`apos` = `proximo` da anterior) até
 *  `LIMITE_VARREDURA`; acima disso grava cobertura parcial. */
export const LIMITE_RECORTE = 10000;
export const LIMITE_VARREDURA = 100000;
/** Página pedida: até `LIMITE_RECORTE` empresas, depois do cursor `apos` (inteiro ≥ 0) se houver. */
export function validarPagina(apos, limite) {
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_RECORTE || (apos !== null && (!Number.isInteger(apos) || apos < 0))) {
    throw new Error('Paginação inválida.');
  }
}
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Lê apenas literais JSON. Não executa o JavaScript de arquivos de dados.
function literal(texto, nome) {
  const inicio = texto.indexOf(`const ${nome} = `);
  if (inicio < 0) throw new Error(`Constante ausente: ${nome}`);
  const de = inicio + `const ${nome} = `.length;
  const fim = nome === 'LINHAS_QUIMICOS' ? texto.indexOf('\n];', de) + 2 : texto.indexOf(';', de);
  if (fim < de) throw new Error(`Literal inválido: ${nome}`);
  return JSON.parse(texto.slice(de, fim));
}

export function lerFonteCatalogo(texto) {
  const colunas = literal(texto, 'COLUNAS_QUIMICOS');
  const linhas = literal(texto, 'LINHAS_QUIMICOS');
  const referencia = literal(texto, 'REFERENCIA_QUIMICOS');
  if (!Array.isArray(colunas) || !Array.isArray(linhas) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(referencia)) {
    throw new Error('Formato de catálogo inválido.');
  }
  const hash = createHash('sha256').update(texto).digest('hex');
  return { colunas, linhas, referencia, hash };
}

export function lerCatalogo(texto, { textoIbama = null } = {}) {
  const { colunas, linhas, referencia, hash } = lerFonteCatalogo(texto);
  const apoio = { dominios: contarDominios(linhas, colunas), ibama: lerPegadaIbama(textoIbama) };
  // Atributos ficam fora do objeto da empresa: a busca continua entregando só o cartão.
  const atributos = new Map();
  const empresas = linhas.map((linha) => {
    const e = Object.fromEntries(colunas.map((c, i) => [c, linha[i]]));
    const classificacao = classificar(e);
    if (classificacao.estado === 'excluida' || !SUBSETORES_ALVO.includes(classificacao.subsetor)) return null;
    atributos.set(e.id, atributosDe(e, apoio));
    // Campos financeiros ausentes e contatos pessoais não são completados nem propagados.
    return {
      id: e.id, nome: e.nome, razaoSocial: e.razaoSocial, cnpjRaiz: e.cnpjRaiz,
      cidade: e.cidade, uf: e.uf, cnaePrincipal: e.cnaePrincipal, subsetor: classificacao.subsetor,
      estado: classificacao.estado, motivo: classificacao.motivo,
      receita: null, intencaoDeTransacao: 'Não apurada', referencia,
    };
  }).filter(Boolean).sort((a, b) => forcaDoEstado(b.estado) - forcaDoEstado(a.estado)
    || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
  return { empresas, atributos, referencia, hash, totalOrigem: linhas.length };
}

/** Filtro comum às duas origens do catálogo (arquivo e banco). */
function filtrar(empresas, { busca = '', uf = '', municipio = '', comEvento = false, incluirPossiveis = false, cnae = '', subsetor }) {
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
  const escopo = escopoSubsetores(subsetor);
  const ufs = uf ? uf.split(',') : [], cidade = normalizarMunicipio(municipio);
  // Eventos só existem no catálogo em banco: no arquivo, "com evento" não encontra nada.
  return empresas.filter((e) => escopo.includes(e.subsetor) && (incluirPossiveis || e.estado !== 'possivel')
    && (!ufs.length || ufs.includes(e.uf))
    && (!cidade || normalizarMunicipio(e.cidade) === cidade)
    && (!cnae || e.cnaePrincipal === cnae)
    && !comEvento
    && termos.every((t) => normalizar(`${e.nome} ${e.razaoSocial} ${e.cnpjRaiz} ${e.cidade}`).includes(t)));
}

export function criarCatalogo({ arquivo = ARQUIVO, arquivoIbama = ARQUIVO_IBAMA } = {}) {
  let cache = null;
  let assinatura = null;
  async function carregar() {
    const info = await stat(arquivo);
    const nova = `${info.size}:${info.mtimeMs}`;
    if (assinatura !== nova || !cache) {
      const textoIbama = arquivoIbama ? await readFile(arquivoIbama, 'utf8').catch(() => null) : null;
      const proximo = lerCatalogo(await readFile(arquivo, 'utf8'), { textoIbama });
      cache = proximo;
      assinatura = nova;
    }
    return cache;
  }
  return {
    async buscar({ busca = '', uf = '', municipio = '', comEvento = false, incluirPossiveis = false, limite = 12, offset = 0, catalogoHash, cnae = '', subsetor } = {}) {
      const base = await carregar();
      const escopo = escopoSubsetores(subsetor);
      // A continuação também confere o escopo: outra lista de subsetores não pode continuar a página.
      const hashPaginacao = createHash('sha256').update(`${base.hash}|${escopo.join(',')}`).digest('hex');
      if (catalogoHash && catalogoHash !== hashPaginacao) { const e = new Error('O catálogo foi atualizado. Inicie uma nova busca.'); e.codigo = 'base_atualizada'; throw e; }
      const filtradas = filtrar(base.empresas, { busca, uf, municipio, comEvento, incluirPossiveis, cnae, subsetor });
      return {
        empresas: filtradas.slice(offset, offset + limite).map((e) => ({ ...e, eventos: [] })), total: filtradas.length, offset, limite,
        proximoOffset: offset + limite < filtradas.length ? offset + limite : null,
        cobertura: { receitaApurada: 0, intencaoApurada: 0, classificacao: filtradas.length, universo: filtradas.length },
        referencia: base.referencia, hash: base.hash, hashPaginacao, totalOrigem: base.totalOrigem,
        fonte: 'Receita Federal · CNPJ', subsetor: rotuloEscopo(escopo), subsetores: escopo,
      };
    },
    async obter(id) { return (await carregar()).empresas.find((e) => e.id === id) ?? null; },
    /** Universo de uma pesquisa por tese: cartão + atributos públicos, na ordem do catálogo, em
     *  páginas. `truncado`: há mais depois desta página; `proximo`: o `apos` da seguinte (aqui, a
     *  posição no recorte). O arquivo guarda só a versão atual: `hash` de outra versão devolve `null`. */
    async recorte(filtros = {}, { hash = null, apos = null, limite = LIMITE_RECORTE } = {}) {
      validarPagina(apos, limite);
      const base = await carregar();
      if (hash && hash !== base.hash) return null;
      const filtradas = filtrar(base.empresas, filtros);
      const inicio = apos ?? 0, fim = inicio + limite, mais = filtradas.length > fim;
      return { empresas: filtradas.slice(inicio, fim).map((e) => ({ ...e, atributos: base.atributos.get(e.id) ?? null })),
        total: filtradas.length, truncado: mais, proximo: mais ? fim : null,
        referencia: base.referencia, hash: base.hash, fonte: 'Receita Federal · CNPJ', subsetor: rotuloEscopo(escopoSubsetores(filtros.subsetor)) };
    },
  };
}
