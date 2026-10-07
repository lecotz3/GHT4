import type { Categoria, Criterio, DetalhePesquisa, Filtros, ItemPesquisa } from './pesquisa'
import { chavePaginas, criarVigencia, paginasVazias, pedirMais, receberMais, type Paginas } from './pesquisa-tela.ts'

/*
 * Fluxos assíncronos da tela da pesquisa por tese, sem React: o componente só liga os efeitos
 * ao estado. Regras:
 * - cada operação guarda a vigência ao COMEÇAR e confere depois de CADA await, antes de qualquer
 *   efeito visual (detalhe, aviso, erro, ocupado);
 * - a chave de retry de cada envio é do próprio pedido: uma resposta antiga só limpa a chave se
 *   ela ainda for a dela, nunca a de um pedido mais novo;
 * - o laço de revisão usa como ficha a geração em que o SEU pedido rodou (`execucaoLote`); a pausa
 *   automática leva essa ficha e não desfaz a retomada de outra aba. A pausa humana não leva ficha.
 */

export type DetalheLote = DetalhePesquisa & { execucaoLote?: number | null }
export interface RespostaItens { itens: ItemPesquisa[]; total: number; proximoOffset: number | null; marca?: string }

export interface ApiFluxos {
  obter(id: string): Promise<DetalhePesquisa>
  criar(corpo: { id: string; tese: string; frente: 'compra' | 'venda' | null }): Promise<DetalhePesquisa>
  editar(id: string, corpo: { versao: number; criterios?: Criterio[]; filtros?: Filtros; meta?: number; limiteWeb?: number }): Promise<DetalhePesquisa>
  iniciar(id: string, versao: number): Promise<DetalhePesquisa>
  avancar(id: string, quantidade: number, execucao?: number): Promise<DetalheLote>
  pausar(id: string, execucao?: number): Promise<DetalhePesquisa>
  ajustar(id: string, novo: string): Promise<DetalhePesquisa>
  registrar(id: string, chave: string, empresas: string[]): Promise<{ conversa: { id: string } }>
  itens(id: string, grupo: Categoria, offset: number, marca?: string): Promise<RespostaItens>
}

export interface EfeitosFluxos {
  /** Põe o detalhe na tela (e os campos editáveis do rascunho). */
  mostrar(d: DetalhePesquisa): void
  /** Ao trocar de pesquisa: erro, aviso, entrega, seleção, linha aberta e prévia. */
  limparTela(): void
  rodando(v: boolean): void
  ocupado(v: boolean): void
  erro(e: unknown): void
  aviso(texto: string): void
  limparPrevia(): void
  limparSelecao(): void
  entregue(v: { conversaId: string; n: number }): void
  paginas(p: Paginas): void
  recarregarLista(): void
}

export interface Rascunho { detalhe: DetalhePesquisa; criterios: Criterio[]; filtros: Filtros; meta: number; limiteWeb: number }

export const AVISO_AMOSTRA = (n: number) => `Amostra de ${n} empresas revisada. Confira os vereditos; se estiverem bons, continue até a meta.`
export const AVISO_AJUSTE = 'Nova rodada criada a partir dos critérios anteriores. Ajuste e rode de novo; a rodada anterior continua no histórico.'
export const AVISO_LISTA = 'A lista mudou com novas revisões e foi recarregada. Peça mais de novo se precisar.'

const status = (e: unknown) => (e as { status?: number } | null)?.status

export function criarFluxos(api: ApiFluxos, ef: EfeitosFluxos, { uuid = () => crypto.randomUUID(), amostra = 10 } = {}) {
  const tela = criarVigencia()
  let ativa: string | null = null
  let parar = false
  let envioCriar: { id: string; tese: string } | null = null
  let envioAjuste: { origem: string; id: string } | null = null
  let envioRegistro: { corpo: string; chave: string } | null = null
  let paginas = paginasVazias()
  const definirPaginas = (p: Paginas) => { paginas = p; ef.paginas(p) }

  /** Mostra `d` se for a pesquisa aberta; `trocar` é para quem escolhe abrir outra. */
  function aplicar(d: DetalhePesquisa, trocar = false) {
    if (!trocar && d.pesquisa.id !== ativa) return false
    // Troca de tela (inclusive reabrir a mesma): continuação anterior não volta.
    if (trocar) definirPaginas(paginasVazias())
    ativa = d.pesquisa.id
    ef.mostrar(d)
    return true
  }

  /** Deixa a tela sem pesquisa (nova tese): o laço em curso perde a vigência e pausa a própria geração. */
  function esvaziar() {
    parar = true; ativa = null; tela.tomar(); definirPaginas(paginasVazias())
    ef.rodando(false); ef.ocupado(false)
  }

  async function abrir(id: string) {
    const g = tela.tomar()
    parar = true; ef.rodando(false); ef.ocupado(false); ef.limparTela()
    try { const d = await api.obter(id); if (tela.vigente(g)) aplicar(d, true) }
    catch (e) { if (tela.vigente(g)) ef.erro(e) }
  }

  async function montar(texto: string, frente: 'compra' | 'venda' | null) {
    ef.ocupado(true); ef.aviso('')
    const g = tela.tomar()
    if (!envioCriar || envioCriar.tese !== texto) envioCriar = { id: uuid(), tese: texto }
    const meu = envioCriar
    try {
      const d = await api.criar({ id: meu.id, tese: texto, frente })
      if (envioCriar === meu) envioCriar = null
      ef.recarregarLista()
      if (tela.vigente(g)) { aplicar(d, true); ef.limparPrevia() }
    } catch (e) { if (tela.vigente(g)) ef.erro(e) } finally { if (tela.vigente(g)) ef.ocupado(false) }
  }

  /** Grava o rascunho se mudou; só põe na tela se a operação `g` ainda vale. */
  async function salvarRascunho(r: Rascunho, g: number) {
    const p = r.detalhe.pesquisa
    const mudou = JSON.stringify(r.criterios) !== JSON.stringify(p.criterios) || JSON.stringify(r.filtros) !== JSON.stringify(p.filtros)
      || r.meta !== p.meta || r.limiteWeb !== p.limite_web
    if (!mudou) return r.detalhe
    const d = await api.editar(p.id, { versao: p.versao, criterios: r.criterios, filtros: r.filtros, meta: r.meta, limiteWeb: r.limiteWeb })
    if (tela.vigente(g)) aplicar(d)
    return d
  }

  async function revisar(ate: 'amostra' | 'meta', base: DetalhePesquisa) {
    let d: DetalhePesquisa = base
    const id = base.pesquisa.id
    const g = tela.tomar()
    const vigente = () => tela.vigente(g)
    parar = false; ef.rodando(true); ef.aviso('')
    const alvo = Math.min(amostra, base.contagens.total)
    // Ficha deste laço: a geração em que o PRIMEIRO pedido dele rodou.
    let ficha: number | undefined
    try {
      while (!parar && vigente()) {
        const r = await api.avancar(id, 2, ficha)
        d = r
        // Não rodou (pausa, conclusão ou retomada mais nova): a decisão mais recente vale; sem pausa automática.
        if (r.execucaoLote == null) { if (vigente()) aplicar(r); return }
        ficha = r.execucaoLote
        if (!vigente() || !aplicar(r)) break
        if (r.pesquisa.estado !== 'em_andamento') return
        if (ate === 'amostra' && r.contagens.revisadas >= alvo) {
          const pausada = await api.pausar(id, ficha)
          if (vigente()) { aplicar(pausada); ef.aviso(AVISO_AMOSTRA(pausada.contagens.revisadas)) }
          return
        }
      }
      if (ficha !== undefined && d.pesquisa.estado === 'em_andamento') {
        // Pausar clicado nesta tela é decisão humana (vale para a execução); o resto é limpeza
        // automática do laço, que só pausa a geração dele.
        const humano = parar && vigente()
        const pausada = await api.pausar(id, humano ? undefined : ficha)
        if (vigente()) aplicar(pausada)
      }
    } catch (e) { if (vigente()) ef.erro(e) } finally { if (vigente()) ef.rodando(false); ef.recarregarLista() }
  }

  async function iniciar(ate: 'amostra' | 'meta', r: Rascunho) {
    ef.ocupado(true)
    const g = tela.observar()
    try {
      const salvo = await salvarRascunho(r, g)
      if (!tela.vigente(g)) return
      const d = await api.iniciar(salvo.pesquisa.id, salvo.pesquisa.versao)
      // Outra pesquisa (ou a mesma, reaberta) entrou na tela: esta fica "pronta" no histórico, sem laço.
      if (!tela.vigente(g)) return
      aplicar(d); ef.ocupado(false)
      if (d.pesquisa.estado === 'pronta') await revisar(ate, d)
    } catch (e) { if (tela.vigente(g)) ef.erro(e) } finally { if (tela.vigente(g)) ef.ocupado(false) }
  }

  async function ajustarLimites(d: DetalhePesquisa, campos: { meta?: number; limiteWeb?: number }) {
    const g = tela.observar()
    try { const n = await api.editar(d.pesquisa.id, { versao: d.pesquisa.versao, ...campos }); if (tela.vigente(g)) aplicar(n) }
    catch (e) { if (tela.vigente(g)) ef.erro(e) }
  }

  async function ajustar(d: DetalhePesquisa) {
    const id = d.pesquisa.id
    ef.ocupado(true)
    if (envioAjuste?.origem !== id) envioAjuste = { origem: id, id: uuid() }
    const meu = envioAjuste
    // A vigência é tomada ao pedir: se outra pesquisa abrir durante o pedido, a nova rodada fica só no histórico.
    const g = tela.tomar()
    try {
      const n = await api.ajustar(id, meu.id)
      if (envioAjuste === meu) envioAjuste = null
      ef.recarregarLista()
      if (!tela.vigente(g)) return
      aplicar(n, true); ef.limparPrevia(); ef.limparSelecao(); ef.aviso(AVISO_AJUSTE)
    } catch (e) { if (tela.vigente(g)) ef.erro(e) } finally { if (tela.vigente(g)) ef.ocupado(false) }
  }

  async function registrar(d: DetalhePesquisa, selecionadas: Iterable<string>) {
    const id = d.pesquisa.id
    const empresas = [...selecionadas].sort()
    const corpo = JSON.stringify([id, empresas])
    ef.ocupado(true)
    if (envioRegistro?.corpo !== corpo) envioRegistro = { corpo, chave: uuid() }
    const meu = envioRegistro
    const g = tela.observar()
    try {
      const r = await api.registrar(id, meu.chave, empresas)
      if (envioRegistro === meu) envioRegistro = null
      // Entregue mesmo se a tela mudou; aviso e seleção só valem para a pesquisa em que foi pedido.
      if (tela.vigente(g)) { ef.entregue({ conversaId: r.conversa.id, n: empresas.length }); ef.limparSelecao() }
    } catch (e) { if (tela.vigente(g)) ef.erro(e) } finally { if (tela.vigente(g)) ef.ocupado(false) }
  }

  async function mostrarMais(d: DetalhePesquisa, grupo: Categoria, offset: number) {
    const id = d.pesquisa.id
    const chave = chavePaginas(d)
    const marcado = pedirMais(paginas, chave, grupo)
    if (!marcado) return
    definirPaginas(marcado)
    const g = tela.observar()
    let r: RespostaItens | null = null
    try { r = await api.itens(id, grupo, offset, d.marca) }
    catch (e) {
      if (tela.vigente(g) && ativa === id) {
        if (status(e) !== 409) ef.erro(e)
        else {
          // A lista mudou desde a página de origem: recarrega em vez de misturar ordenações.
          try { const n = await api.obter(id); if (tela.vigente(g)) { aplicar(n); ef.aviso(AVISO_LISTA) } }
          catch (e2) { if (tela.vigente(g)) ef.erro(e2) }
        }
      }
    }
    // Resposta de tela superada não entra; sem resposta, só libera o botão (mesma chave).
    definirPaginas(receberMais(paginas, chave, grupo, tela.vigente(g) && ativa === id ? r : null))
  }

  return {
    aplicar, esvaziar, abrir, montar, revisar, iniciar, ajustarLimites, ajustar, registrar, mostrarMais,
    /** Botão Pausar: decisão humana; o laço pausa a execução ao terminar o lote em curso. */
    pausar: () => { parar = true },
    /** Componente desmontado: o laço perde a vigência e faz só a pausa automática com ficha. */
    desmontar: () => { parar = true; tela.tomar() },
  }
}
