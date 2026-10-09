import type { Categoria, Criterio, CriterioMemoria, DetalhePesquisa, EventoPesquisa, Funil, ItemPesquisa } from './pesquisa'

/* Regras puras da tela da pesquisa por tese (sem React), para teste em node. */

export const CATEGORIAS: Categoria[] = ['aderente', 'provavel', 'a_confirmar', 'nao_aderente']

/**
 * Continuação de um grupo além da primeira resposta. Vale só para a pesquisa e a lista em que
 * foi pedida, identificada pela marca do servidor (o número de revisadas é só o fallback de
 * compatibilidade): quando a lista muda, a continuação antiga é descartada (basta pedir de novo).
 */
/** `proximo`: cursor devolvido pelo servidor; null = acabou; ausente = nada carregado ainda.
 *  `pedido`: dono do pedido em voo; só ele finaliza (itens, cursor, botão). */
export interface Continuacao { itens: ItemPesquisa[]; proximo?: number | null; carregando: boolean; pedido?: number }
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

/** Marca o pedido `pedido` em voo. Devolve null se já há um pedido desse grupo (clique repetido). */
export function pedirMais(p: Paginas, chave: string, grupo: Categoria, pedido = 0): Paginas | null {
  const atual = p.chave === chave ? p : paginasVazias(chave)
  const c = atual.grupos[grupo]
  if (c?.carregando) return null
  return { chave, grupos: { ...atual.grupos, [grupo]: { itens: c?.itens ?? [], proximo: c?.proximo, carregando: true, pedido } } }
}

/**
 * Finaliza o pedido `pedido`: só se ainda é a mesma lista E ele ainda é o dono do grupo. Resposta
 * de pedido superado (tela reaberta, outro pedido em voo) não aplica itens, cursor nem libera o
 * botão. `r` null = sem resposta aproveitável: só libera o botão do próprio pedido.
 */
export function receberMais(p: Paginas, chave: string, grupo: Categoria, r: { itens: ItemPesquisa[]; proximoOffset: number | null } | null, pedido = 0): Paginas {
  if (p.chave !== chave) return p
  const c = p.grupos[grupo]
  if (!c?.carregando || c.pedido !== pedido) return p
  if (!r) return { chave, grupos: { ...p.grupos, [grupo]: { itens: c.itens, proximo: c.proximo, carregando: false } } }
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

/** Um obrigatório que, como opcional, deixaria de eliminar empresas no cadastro. */
export interface Relaxamento { id: string; texto: string; recupera: number; total: number; basta: boolean }

/**
 * Sugestão de relaxamento (o "relaxa primeiro os critérios de menor prioridade" do Lessie), sem
 * automatismo: quem decide é o membro. Candidatos são os obrigatórios que eliminam empresas SOZINHOS
 * no funil: `recupera` vem de `funil.exclusivas` (reprovadas só por ele) e `total` é quanto passaria
 * no cadastro com ele opcional. Como opcional ele continua pontuando na aderência. Mais recuperação
 * primeiro; no empate, o de menor prioridade (o último da lista). `basta`: o total alcança a meta.
 */
export function sugerirRelaxamento(criterios: Criterio[], funil: Partial<Funil> | null | undefined, meta: number, limite = 3): Relaxamento[] {
  if (!funil || typeof funil.aprovadasCadastro !== 'number') return []
  const aprovadas = funil.aprovadasCadastro
  return criterios.map((c, ordem) => ({ c, ordem, recupera: funil.exclusivas?.[c.id] ?? 0 }))
    .filter(({ c, recupera }) => c.obrigatorio && recupera > 0)
    .sort((a, b) => b.recupera - a.recupera || b.ordem - a.ordem)
    .slice(0, limite)
    .map(({ c, recupera }) => ({ id: c.id, texto: c.texto, recupera, total: aprovadas + recupera, basta: aprovadas + recupera >= meta }))
}

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** O mesmo critério, pelo que ele verifica: a regra cadastral, ou o texto de um critério de pesquisa. */
export function mesmoCriterio(a: Pick<Criterio, 'tipo' | 'regra' | 'texto'>, b: Pick<Criterio, 'tipo' | 'regra' | 'texto'>) {
  if (a.tipo !== b.tipo) return false
  if (a.tipo === 'cadastro') return a.regra?.campo === b.regra?.campo && JSON.stringify(a.regra?.valor) === JSON.stringify(b.regra?.valor)
  return normal(a.texto) === normal(b.texto)
}

/** Limites do editor (os mesmos do servidor): 12 critérios, 5 de pesquisa. */
export const MAX_CRITERIOS = 12
export const MAX_PESQUISA = 5
/** Prefixo do id de um critério que veio da memória: a tela diz de onde ele veio. */
export const PREFIXO_MEMORIA = 'mem_'

/**
 * Lista com o critério da memória acrescentado, ou null se ele já está na lista ou estoura um
 * limite. Como no atalho cadastral, uma regra do mesmo campo é substituída (não fica em dobro).
 */
export function adicionarDaMemoria(criterios: Criterio[], m: CriterioMemoria): Criterio[] | null {
  if (criterios.some((c) => mesmoCriterio(c, m))) return null
  const base = m.tipo === 'cadastro' && m.regra ? criterios.filter((c) => c.regra?.campo !== m.regra?.campo) : criterios
  if (base.length >= MAX_CRITERIOS || (m.tipo === 'pesquisa' && base.filter((c) => c.tipo === 'pesquisa').length >= MAX_PESQUISA)) return null
  return [...base, { id: `${PREFIXO_MEMORIA}${m.chave.slice(0, 12)}`, texto: m.texto, obrigatorio: m.obrigatorio, tipo: m.tipo, regra: m.regra, trecho: null, origem: 'usuario' }]
}

/** Sugestões da memória para o rascunho: as que ainda não estão na lista e cabem nela. */
export const sugestoesDaMemoria = (criterios: Criterio[], memoria: CriterioMemoria[], limite = 6) =>
  memoria.filter((m) => adicionarDaMemoria(criterios, m)).slice(0, limite)

const ROTULO_CATEGORIA_CURTO: Record<string, string> = { aderente: 'aderente', provavel: 'provável', a_confirmar: 'a confirmar', nao_aderente: 'não aderente' }
const ROTULO_VEREDITO_EVENTO: Record<string, string> = { atende: 'atende', indicio: 'indício', indeterminado: 'sem evidência', nao_atende: 'não atende' }
const contar = (n: number, um: string, varios: string) => `${(n ?? 0).toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

/** Frase de um passo do registro da execução (sem React, para teste em node). */
export function descreverEvento(e: Pick<EventoPesquisa, 'tipo' | 'dados'>): string {
  const d = (e.dados ?? {}) as Record<string, unknown>
  const num = (k: string) => Number(d[k] ?? 0)
  switch (e.tipo) {
    case 'criterios': return d.origem === 'ajuste'
      ? `Nova rodada a partir da anterior, com ${contar(num('total'), 'critério', 'critérios')}${num('opcionais') ? ` (${contar(num('opcionais'), 'tornado opcional', 'tornados opcionais')})` : ''}.`
      : `${contar(num('total'), 'critério proposto', 'critérios propostos')} ${d.modo === 'regras' ? 'por regras locais' : `com ${String(d.modo ?? '').replace('ia:', '')}`}: ${num('cadastro')} de cadastro e ${num('pesquisa')} de site.`
    case 'funil': return `Funil cadastral: ${num('aprovadasCadastro').toLocaleString('pt-BR')} de ${contar(num('recorte'), 'empresa passou', 'empresas passaram')}${d.truncado ? ' (primeira página do recorte)' : ''}.`
    case 'retomada': return d.primeira ? 'Revisão no site iniciada.' : 'Revisão retomada.'
    case 'lote': {
      const empresas = (d.empresas as unknown as { nome: string; categoria: string }[] | undefined) ?? []
      return `${contar(num('revisadas'), 'empresa revisada', 'empresas revisadas')}${empresas.length ? `: ${empresas.map((x) => `${x.nome} (${ROTULO_CATEGORIA_CURTO[x.categoria] ?? x.categoria})`).join(', ')}` : ''}.`
    }
    case 'pausa': return `Pausada${d.automatica ? ' pelo agente' : ''}: ${String(d.motivo ?? 'sem motivo registrado')}`
    case 'conclusao': return `Concluída: ${String(d.motivo ?? '')}`
    case 'revisao_humana': return `${d.acao === 'desfazer' ? 'Desfez a revisão de' : 'Revisou'} “${String(d.criterio ?? 'critério')}” em ${String(d.empresa ?? 'empresa')}: ${ROTULO_VEREDITO_EVENTO[String(d.veredito)] ?? String(d.veredito)}.`
    case 'ajuste': return `Nova rodada criada${num('opcionais') ? ` com ${contar(num('opcionais'), 'critério opcional', 'critérios opcionais')}` : ''}; esta continua no histórico.`
    case 'entrega': return `${contar(num('empresas'), 'empresa levada', 'empresas levadas')} ao trabalho.`
    case 'monitoramento': return `Monitoramento semanal ${d.ativo ? 'ligado' : 'desligado'}.`
    default: return String(e.tipo)
  }
}
