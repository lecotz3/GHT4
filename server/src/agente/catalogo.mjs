import { normalizarMunicipio } from './filtros.mjs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { classificar, forcaDoEstado } from '../../../packages/domain/classificacao.mjs';
import { atributosDe, contarDominios, lerPegadaIbama } from './atributos.mjs';

export const SUBSETOR = 'Distribuição e trading químico';
const ARQUIVO = fileURLToPath(new URL('../../../data-quimicos.js', import.meta.url));
const ARQUIVO_IBAMA = fileURLToPath(new URL('../../../data-ibama.js', import.meta.url));
/** Teto do recorte entregue à revisão: o subsetor inteiro, com possíveis, cabe com folga. */
export const LIMITE_RECORTE = 10000;
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
    if (classificacao.estado === 'excluida' || classificacao.subsetor !== SUBSETOR) return null;
    atributos.set(e.id, atributosDe(e, apoio));
    // Campos financeiros ausentes e contatos pessoais não são completados nem propagados.
    return {
      id: e.id, nome: e.nome, razaoSocial: e.razaoSocial, cnpjRaiz: e.cnpjRaiz,
      cidade: e.cidade, uf: e.uf, cnaePrincipal: e.cnaePrincipal,
      estado: classificacao.estado, motivo: classificacao.motivo,
      receita: null, intencaoDeTransacao: 'Não apurada', referencia,
    };
  }).filter(Boolean).sort((a, b) => forcaDoEstado(b.estado) - forcaDoEstado(a.estado)
    || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
  return { empresas, atributos, referencia, hash, totalOrigem: linhas.length };
}

/** Filtro comum às duas origens do catálogo (arquivo e banco). */
function filtrar(empresas, { busca = '', uf = '', municipio = '', comEvento = false, incluirPossiveis = false, cnae = '' }) {
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
  const ufs = uf ? uf.split(',') : [], cidade = normalizarMunicipio(municipio);
  // Eventos só existem no catálogo em banco: no arquivo, "com evento" não encontra nada.
  return empresas.filter((e) => (incluirPossiveis || e.estado !== 'possivel')
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
    async buscar({ busca = '', uf = '', municipio = '', comEvento = false, incluirPossiveis = false, limite = 12, offset = 0, catalogoHash, cnae = '' } = {}) {
      const base = await carregar();
      if (catalogoHash && catalogoHash !== base.hash) { const e = new Error('O catálogo foi atualizado. Inicie uma nova busca.'); e.codigo = 'base_atualizada'; throw e; }
      const filtradas = filtrar(base.empresas, { busca, uf, municipio, comEvento, incluirPossiveis, cnae });
      return {
        empresas: filtradas.slice(offset, offset + limite).map((e) => ({ ...e, eventos: [] })), total: filtradas.length, offset, limite,
        proximoOffset: offset + limite < filtradas.length ? offset + limite : null,
        cobertura: { receitaApurada: 0, intencaoApurada: 0, classificacao: filtradas.length, universo: filtradas.length },
        referencia: base.referencia, hash: base.hash, totalOrigem: base.totalOrigem,
        fonte: 'Receita Federal · CNPJ', subsetor: SUBSETOR,
      };
    },
    async obter(id) { return (await carregar()).empresas.find((e) => e.id === id) ?? null; },
    /** Universo de uma pesquisa por tese: cartão + atributos públicos, na ordem do catálogo. */
    async recorte(filtros = {}) {
      const base = await carregar();
      const filtradas = filtrar(base.empresas, filtros);
      return { empresas: filtradas.slice(0, LIMITE_RECORTE).map((e) => ({ ...e, atributos: base.atributos.get(e.id) ?? null })),
        total: filtradas.length, truncado: filtradas.length > LIMITE_RECORTE,
        referencia: base.referencia, hash: base.hash, fonte: 'Receita Federal · CNPJ', subsetor: SUBSETOR };
    },
  };
}
