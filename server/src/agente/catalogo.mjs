import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { classificar, forcaDoEstado } from '../../../packages/domain/classificacao.mjs';

export const SUBSETOR = 'Distribuição e trading químico';
const ARQUIVO = fileURLToPath(new URL('../../../data-quimicos.js', import.meta.url));
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

export function lerCatalogo(texto) {
  const colunas = literal(texto, 'COLUNAS_QUIMICOS');
  const linhas = literal(texto, 'LINHAS_QUIMICOS');
  const referencia = literal(texto, 'REFERENCIA_QUIMICOS');
  if (!Array.isArray(colunas) || !Array.isArray(linhas) || !/^\d{4}-\d{2}$/.test(referencia)) {
    throw new Error('Formato de catálogo inválido.');
  }
  const hash = createHash('sha256').update(texto).digest('hex');
  const empresas = linhas.map((linha) => {
    const e = Object.fromEntries(colunas.map((c, i) => [c, linha[i]]));
    const classificacao = classificar(e);
    if (classificacao.estado === 'excluida' || classificacao.subsetor !== SUBSETOR) return null;
    // Campos financeiros ausentes e contatos pessoais não são completados nem propagados.
    return {
      id: e.id, nome: e.nome, razaoSocial: e.razaoSocial, cnpjRaiz: e.cnpjRaiz,
      cidade: e.cidade, uf: e.uf, cnaePrincipal: e.cnaePrincipal,
      estado: classificacao.estado, motivo: classificacao.motivo,
      receita: null, intencaoDeTransacao: 'Não apurada', referencia,
    };
  }).filter(Boolean).sort((a, b) => forcaDoEstado(b.estado) - forcaDoEstado(a.estado)
    || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
  return { empresas, referencia, hash, totalOrigem: linhas.length };
}

export function criarCatalogo({ arquivo = ARQUIVO } = {}) {
  let cache = null;
  let assinatura = null;
  async function carregar() {
    const info = await stat(arquivo);
    const nova = `${info.size}:${info.mtimeMs}`;
    if (assinatura !== nova || !cache) {
      const proximo = lerCatalogo(await readFile(arquivo, 'utf8'));
      cache = proximo;
      assinatura = nova;
    }
    return cache;
  }
  return {
    async buscar({ busca = '', uf = '', incluirPossiveis = false, limite = 12 } = {}) {
      const base = await carregar();
      const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
      const filtradas = base.empresas.filter((e) => (incluirPossiveis || e.estado !== 'possivel')
        && (!uf || e.uf === uf)
        && termos.every((t) => normalizar(`${e.nome} ${e.razaoSocial} ${e.cnpjRaiz} ${e.cidade}`).includes(t)));
      return {
        empresas: filtradas.slice(0, limite), total: filtradas.length,
        referencia: base.referencia, hash: base.hash, totalOrigem: base.totalOrigem,
      };
    },
    async obter(id) { return (await carregar()).empresas.find((e) => e.id === id) ?? null; },
  };
}
