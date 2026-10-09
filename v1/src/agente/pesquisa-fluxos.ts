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
  ajustar(id: string, novo: string, opcionais?: string[]): Promise<DetalhePesquisa>
  registrar(id: string, chave: string, empresas: string[]): Promise<{ conversa: { id: string } }>
  itens(id: string, grupo: Categoria, offset: number, marca?: string): Promise<RespostaItens>
}

export interface EfeitosFluxos {
  /** Põe o detalhe na tela (e os campos editáveis do rascunho). */
  mostrar(d: DetalhePesquisa): void
  /** Ao trocar de pesquisa: erro, aviso, entrega, seleção, linha aberta e prévia. */
  limparTela(): void
  /** Abertura de outra pesquisa em curso: as ações da pesquisa ainda exibida ficam bloqueadas. */
  abrindo(v: boolean): void
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
  // Dois estados distintos: a última pesquisa efetivamente exibida (sobrevive a aberturas que
  // falham) e a abertura em curso (bloqueio transitório; só a vigente o encerra).
  let mostrada: string | null = null
  let abrindo: number | null = null
  let parar = false
  let envioCriar: { id: string; tese: string } | null = null
  let envioAjuste: { origem: string; assinatura: string; id: string } | null = null
  let envioRegistro: { corpo: string; chave: string } | null = null
  let paginas = paginasVazias()
  let pedidos = 0
  const definirPaginas = (p: Paginas) => { paginas = p; ef.paginas(p) }
  const definirAbrindo = (g: number | null) => { abrindo = g; ef.abrindo(g !== null) }
  /** Ações valem só para a pesquisa exibida e fora de uma abertura em curso. */
  const exibida = (d: DetalhePesquisa) => abrindo === null && mostrada !== null && d.pesquisa.id === mostrada

  /** Mostra `d` se for a pesquisa exibida; `trocar` é para quem escolhe abrir outra. */
  function aplicar(d: DetalhePesquisa, trocar = false) {
    if (!trocar && (abrindo !== null || d.pesquisa.id !== mostrada)) return false
    if (trocar) {
      // Troca de tela (inclusive reabrir a mesma): continuação anterior não volta, e a abertura termina.
      definirPaginas(paginasVazias())
      if (abrindo !== null) definirAbrindo(null)
    }
    mostrada = d.pesquisa.id
    ef.mostrar(d)
    return true
  }

  /** Deixa a tela sem pesquisa (nova tese): o laço em curso perde a vigência e pausa a própria geração. */
  function esvaziar() {
    parar = true; mostrada = null; tela.tomar(); definirPaginas(paginasVazias())
    ef.rodando(false); ef.ocupado(false); definirAbrindo(null)
  }

  async function abrir(id: string) {
    const g = tela.tomar()
    // Até a resposta, as ações da pesquisa ainda visível ficam bloqueadas (herdariam a vigência
    // desta abertura). A identidade dela (`mostrada`) não muda: aberturas sobrepostas não a perdem.
    definirAbrindo(g)
    parar = true; ef.rodando(false); ef.ocupado(false); ef.limparTela()
    try { const d = await api.obter(id); if (tela.vigente(g)) aplicar(d, true) }
    catch (e) {
      // Só a abertura vigente encerra o bloqueio: a pesquisa que ficou na tela volta a aceitar
      // ações; operações dela que estavam em curso já perderam a vigência.
      if (tela.vigente(g)) { definirAbrindo(null); ef.erro(e) }
    }
  }

  async function montar(texto: string, frente: 'compra' | 'venda' | null) {
    ef.ocupado(true); ef.aviso('')
    const g = tela.tomar()
    // Criar supera uma abertura em curso; sem isso o bloqueio dela ficaria preso.
    if (abrindo !== null) definirAbrindo(null)
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
    if (!exibida(base)) return
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
    if (!exibida(r.detalhe)) return
    ef.ocupado(true)
    const g = tela.observar()
    try {
      const salvo = await salvarRascunho(r, g)
      if (!tela.vigente(g)) return
      const d = await api.iniciar(salvo.pesquisa.id, salvo.pesquisa.versao)
      // Outra pesquisa (ou a mesma, reaberta) entrou na tela: esta fica "pronta" no histórico, sem laço.
      // O laço só começa se a resposta foi de fato aceita na tela.
      if (!tela.vigente(g) || !aplicar(d)) return
      ef.ocupado(false)
      if (d.pesquisa.estado === 'pronta') await revisar(ate, d)
    } catch (e) { if (tela.vigente(g)) ef.erro(e) } finally { if (tela.vigente(g)) ef.ocupado(false) }
  }

  /** Relê a pesquisa exibida sem trocar de tela (contagens e grupos depois de uma revisão humana). */
  async function recarregar(d: DetalhePesquisa) {
    if (!exibida(d)) return
    const g = tela.observar()
    try { const n = await api.obter(d.pesquisa.id); if (tela.vigente(g)) aplicar(n) }
    catch (e) { if (tela.vigente(g)) ef.erro(e) }
  }

  async function ajustarLimites(d: DetalhePesquisa, campos: { meta?: number; limiteWeb?: number }) {
    if (!exibida(d)) return
    const g = tela.observar()
    try { const n = await api.editar(d.pesquisa.id, { versao: d.pesquisa.versao, ...campos }); if (tela.vigente(g)) aplicar(n) }
    catch (e) { if (tela.vigente(g)) ef.erro(e) }
  }

  /** `opcionais`: critérios que a nova rodada recebe como opcionais (sugestão de relaxamento aceita). */
  async function ajustar(d: DetalhePesquisa, opcionais: string[] = []) {
    if (!exibida(d)) return
    const id = d.pesquisa.id
    ef.ocupado(true)
    // A chave de idempotência vale para a mesma origem E os mesmos opcionais: outro pedido, outra chave.
    const assinatura = [...opcionais].sort().join(',')
    if (envioAjuste?.origem !== id || envioAjuste.assinatura !== assinatura) envioAjuste = { origem: id, assinatura, id: uuid() }
    const meu = envioAjuste
    // A vigência é tomada ao pedir: se outra pesquisa abrir durante o pedido, a nova rodada fica só no histórico.
    const g = tela.tomar()
    try {
      const n = opcionais.length ? await api.ajustar(id, meu.id, opcionais) : await api.ajustar(id, meu.id)
      if (envioAjuste === meu) envioAjuste = null
      ef.recarregarLista()
      if (!tela.vigente(g)) return
      aplicar(n, true); ef.limparPrevia(); ef.limparSelecao(); ef.aviso(AVISO_AJUSTE)
    } catch (e) { if (tela.vigente(g)) ef.erro(e) } finally { if (tela.vigente(g)) ef.ocupado(false) }
  }

  async function registrar(d: DetalhePesquisa, selecionadas: Iterable<string>) {
    if (!exibida(d)) return
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
    if (!exibida(d)) return
    const id = d.pesquisa.id
    const chave = chavePaginas(d)
    const meu = ++pedidos
    const marcado = pedirMais(paginas, chave, grupo, meu)
    if (!marcado) return
    definirPaginas(marcado)
    const g = tela.observar()
    let r: RespostaItens | null = null
    try { r = await api.itens(id, grupo, offset, d.marca) }
    catch (e) {
      if (tela.vigente(g) && exibida(d)) {
        if (status(e) !== 409) ef.erro(e)
        else {
          // A lista mudou desde a página de origem: recarrega em vez de misturar ordenações.
          try { const n = await api.obter(id); if (tela.vigente(g)) { aplicar(n); ef.aviso(AVISO_LISTA) } }
          catch (e2) { if (tela.vigente(g)) ef.erro(e2) }
        }
      }
    }
    // Só o dono do pedido finaliza: pedido superado (tela reaberta, outro em voo) não toca em nada.
    // Dono com tela superada só libera o próprio botão.
    const final = receberMais(paginas, chave, grupo, tela.vigente(g) && exibida(d) ? r : null, meu)
    if (final !== paginas) definirPaginas(final)
  }

  return {
    aplicar, esvaziar, abrir, montar, revisar, iniciar, recarregar, ajustarLimites, ajustar, registrar, mostrarMais,
    /** Botão Pausar: decisão humana; o laço pausa a execução ao terminar o lote em curso. */
    pausar: () => { parar = true },
    /** Componente desmontado: o laço perde a vigência e faz só a pausa automática com ficha. */
    desmontar: () => { parar = true; tela.tomar() },
  }
}
