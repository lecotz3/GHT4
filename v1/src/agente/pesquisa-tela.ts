import type { Categoria, DetalhePesquisa, ItemPesquisa } from './pesquisa'

/* Regras puras da tela da pesquisa por tese (sem React), para teste em node. */

export const CATEGORIAS: Categoria[] = ['aderente', 'provavel', 'a_confirmar', 'nao_aderente']

/**
 * Continuação de um grupo além da primeira resposta. Vale só para a pesquisa e a "base"
 * (número de revisadas) em que foi pedida: quando um lote revisa mais empresas, categorias e
 * aderências podem mudar de lugar, e a continuação antiga é descartada (basta pedir de novo).
 */
/** `proximo`: cursor devolvido pelo servidor; null = acabou; ausente = nada carregado ainda. */
export interface Continuacao { itens: ItemPesquisa[]; proximo?: number | null; carregando: boolean }
export interface Paginas { chave: string; grupos: Partial<Record<Categoria, Continuacao>> }

// A marca vem do servidor, calculada no mesmo snapshot da página; sem ela, o número de revisadas.
export const chavePaginas = (d: DetalhePesquisa | null | undefined) => d ? `${d.pesquisa.id}:${d.marca ?? d.contagens.revisadas}` : ''
export const paginasVazias = (chave = ''): Paginas => ({ chave, grupos: {} })

export interface Grupo { categoria: Categoria; itens: ItemPesquisa[]; total: number; restantes: number; offset: number; carregando: boolean }

/**
 * Grupos pela CONTAGEM global, não pelo que veio carregado: uma categoria inteira fora da
 * primeira resposta continua visível, com a ação de carregar a partir do offset certo.
 * Itens repetidos (mesma empresa na base e na continuação) aparecem uma vez só.
 */
export function montarGrupos(d: DetalhePesquisa | null | undefined, paginas: Paginas): Grupo[] {
  if (!d) return []
  const valida = paginas.chave === chavePaginas(d)
  return CATEGORIAS.map((categoria) => {
    const base = d.itens.filter((i) => i.etapa === 'revisada' && i.categoria === categoria)
    const c = valida ? paginas.grupos[categoria] : undefined
    const vistos = new Set<string>()
    const itens = [...base, ...(c?.itens ?? [])].filter((i) => !vistos.has(i.empresa_id) && (vistos.add(i.empresa_id), true))
    const total = Math.max(d.contagens[categoria] ?? 0, itens.length)
    // O servidor ordena por categoria antes do corte: a base de cada grupo é um prefixo dele.
    const offset = c?.proximo === undefined ? base.length : (c.proximo ?? total)
    return { categoria, itens, total, restantes: Math.max(0, total - itens.length), offset, carregando: Boolean(c?.carregando) }
  }).filter((g) => g.total > 0)
}

/** Marca o pedido em voo. Devolve null se já há um pedido desse grupo (clique repetido). */
export function pedirMais(p: Paginas, chave: string, grupo: Categoria): Paginas | null {
  const atual = p.chave === chave ? p : paginasVazias(chave)
  const c = atual.grupos[grupo]
  if (c?.carregando) return null
  return { chave, grupos: { ...atual.grupos, [grupo]: { itens: c?.itens ?? [], proximo: c?.proximo, carregando: true } } }
}

/** Aplica a resposta só se ainda é a mesma pesquisa/base; o cursor é o que o servidor devolveu. */
export function receberMais(p: Paginas, chave: string, grupo: Categoria, r: { itens: ItemPesquisa[]; proximoOffset: number | null } | null): Paginas {
  if (p.chave !== chave) return p
  const c = p.grupos[grupo]
  if (!r) return { chave, grupos: { ...p.grupos, [grupo]: { itens: c?.itens ?? [], proximo: c?.proximo, carregando: false } } }
  const vistos = new Set((c?.itens ?? []).map((i) => i.empresa_id))
  const novos = r.itens.filter((i) => !vistos.has(i.empresa_id) && (vistos.add(i.empresa_id), true))
  return { chave, grupos: { ...p.grupos, [grupo]: { itens: [...(c?.itens ?? []), ...novos], proximo: r.proximoOffset, carregando: false } } }
}

/**
 * Vigência das operações da tela. Cada operação guarda a geração ao COMEÇAR; abrir outra
 * pesquisa (ou criar/ajustar) avança a geração. A resposta só mexe na tela se a geração
 * guardada ainda é a atual — receber uma resposta nunca avança a geração por conta própria.
 */
export function criarVigencia() {
  let geracao = 0
  return {
    /** Começa uma operação que troca a tela (abrir, criar, ajustar, revisar). */
    tomar: () => ++geracao,
    /** Começa uma operação que só atualiza a tela atual. */
    observar: () => geracao,
    vigente: (g: number) => g === geracao,
  }
}
