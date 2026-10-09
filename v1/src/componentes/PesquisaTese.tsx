import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { IconeRede } from './IconeRede'
import { PlanoAcesso } from './PlanoAcesso'
import { ErroApi, type Usuario } from '../agente/api'
import {
  pesquisaApi, memoriaApi, type Memoria, type CriterioMemoria, ATALHOS_CADASTRO, DESCRICAO_CATEGORIA, EXEMPLOS_TESE, ROTULO_CATEGORIA, ROTULO_VEREDITO,
  type Categoria, type Criterio, type DetalhePesquisa, type Filtros, type Funil, type IAInfo, type ItemPesquisa, type Previa, type ResumoPesquisa, type Veredito, type VereditoCriterio, type RevisaoVeredito, type PedidoRevisao, type EventoPesquisa, type Monitoramento, type InicialPesquisa, SUBSETORES_ALVO, SUBSETOR_ORIGINAL, rotuloSubsetor, TETO_VARREDURA,
} from '../agente/pesquisa'
import { montarGrupos, paginasVazias, sugerirRelaxamento, adicionarDaMemoria, sugestoesDaMemoria, PREFIXO_MEMORIA, descreverEvento, type Paginas, type Relaxamento } from '../agente/pesquisa-tela'
import { criarFluxos, type Rascunho } from '../agente/pesquisa-fluxos'
import '../agente/pesquisa.css'

const UFS = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const AMOSTRA = 10
const ICONE: Record<Veredito, 'certo' | 'aproximado' | 'duvida' | 'xis'> = { atende: 'certo', indicio: 'aproximado', indeterminado: 'duvida', nao_atende: 'xis' }
const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir esta ação.'
const numero = (n: number | undefined) => (n ?? 0).toLocaleString('pt-BR')
const funilValido = (f: DetalhePesquisa['pesquisa']['funil']): f is Funil => typeof (f as Funil).recorte === 'number'

export function PesquisaTese({ usuario, inicial, aoConsumirInicial, aoAbrirTrabalho, aoExpirar, aoEncontrar }: {
  usuario: Usuario
  /** "Quem decide nestas empresas": abre o find só nas aderentes e prováveis desta pesquisa. */
  aoEncontrar?: (p: { id: string; tese: string; boas: number }) => void
  inicial: InicialPesquisa | null
  aoConsumirInicial: () => void
  aoAbrirTrabalho: (conversaId: string) => void
  aoExpirar: () => void
}) {
  const [lista, setLista] = useState<ResumoPesquisa[]>([])
  const [ia, setIa] = useState<IAInfo | null>(null)
  const [detalhe, setDetalhe] = useState<DetalhePesquisa | null>(null)
  const [tese, setTese] = useState('')
  const [frente, setFrente] = useState<'venda' | 'compra' | null>(null)
  const [criterios, setCriterios] = useState<Criterio[]>([])
  const [filtros, setFiltros] = useState<Filtros>({ uf: '', busca: '', cnae: '', incluirPossiveis: false })
  const [meta, setMeta] = useState(20)
  const [limiteWeb, setLimiteWeb] = useState(40)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  // Outra pesquisa abrindo: as ações da que ainda aparece ficam bloqueadas até a resposta.
  const [abrindo, setAbrindo] = useState(false)
  const bloqueado = ocupado || abrindo
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [entregue, setEntregue] = useState<{ conversaId: string; n: number } | null>(null)
  const [novoCriterio, setNovoCriterio] = useState('')
  const [atalho, setAtalho] = useState('')
  const [parametro, setParametro] = useState(0)
  const [paginas, setPaginas] = useState<Paginas>(paginasVazias())
  // A tese escrita no Início já é um pedido: monta os critérios sem exigir outro clique.
  const autoEnviar = useRef<string | null>(null)
  // Aberta por um aviso do Meu dia: as novidades só contam como vistas depois que a pesquisa
  // carregou, e só até a última que o aviso mostrou. Falhou ao abrir, o aviso continua lá.
  const vistaPendente = useRef<{ id: string; ateId: number } | null>(null)
  const podeUsar = usuario.papel !== 'leitura'
  const p = detalhe?.pesquisa
  const rascunho = p?.estado === 'rascunho'

  const falhou = useCallback((e: unknown) => {
    if (e instanceof ErroApi && e.status === 401) aoExpirar()
    else setErro(mensagem(e))
  }, [aoExpirar])
  const recarregarLista = useCallback(async () => {
    try { const r = await pesquisaApi.listar(); setLista(r.pesquisas); setIa(r.ia) } catch (e) { falhou(e) }
  }, [falhou])
  // Fluxos assíncronos (vigência, chaves de retry, ficha do laço) ficam em pesquisa-fluxos.ts;
  // aqui só ligamos os efeitos ao estado. Refs mantêm os efeitos estáveis entre renderizações.
  const efeitosVivos = useRef({ falhou, recarregarLista })
  efeitosVivos.current = { falhou, recarregarLista }
  const fluxos = useRef<ReturnType<typeof criarFluxos> | null>(null)
  fluxos.current ??= criarFluxos(pesquisaApi, {
    mostrar: (d) => { setDetalhe(d); setCriterios(d.pesquisa.criterios); setFiltros(d.pesquisa.filtros); setMeta(d.pesquisa.meta); setLimiteWeb(d.pesquisa.limite_web); if (d.ia !== undefined) setIa(d.ia) },
    limparTela: () => { setErro(''); setAviso(''); setEntregue(null); setSelecionadas(new Set()); setAberto(null); setPrevia(null) },
    rodando: setRodando, ocupado: setOcupado, abrindo: setAbrindo, aviso: setAviso,
    erro: (e) => efeitosVivos.current.falhou(e),
    limparPrevia: () => setPrevia(null), limparSelecao: () => setSelecionadas(new Set()),
    entregue: setEntregue, paginas: setPaginas,
    recarregarLista: () => { void efeitosVivos.current.recarregarLista() },
  })
  const f = fluxos.current
  const abrir = useCallback((id: string) => f.abrir(id), [f])

  useEffect(() => { void recarregarLista() }, [recarregarLista])
  // Memória do membro: acessória. Recarrega ao trocar de pesquisa e quando ela é iniciada (é quando grava).
  const [memoria, setMemoria] = useState<Memoria | null>(null)
  useEffect(() => { let vivo = true; memoriaApi.ler().then((m) => { if (vivo) setMemoria(m) }).catch(() => {}); return () => { vivo = false } }, [detalhe?.pesquisa.id, detalhe?.pesquisa.estado])
  const painelMemoria = <PainelMemoria memoria={memoria} aoMudar={setMemoria} />
  useEffect(() => {
    if (!inicial) return
    if (inicial.pesquisaId && inicial.novidadesAte) vistaPendente.current = { id: inicial.pesquisaId, ateId: inicial.novidadesAte }
    if (inicial.pesquisaId) void abrir(inicial.pesquisaId)
    else if (inicial.tese) { f.esvaziar(); setDetalhe(null); setTese(inicial.tese); autoEnviar.current = inicial.tese }
    aoConsumirInicial()
  }, [inicial, abrir, aoConsumirInicial, f])
  useEffect(() => () => f.desmontar(), [f])
  useEffect(() => {
    const v = vistaPendente.current
    if (!v || detalhe?.pesquisa.id !== v.id) return
    vistaPendente.current = null
    void pesquisaApi.marcarNovidadesVistas(v.id, v.ateId).catch(() => {})
  }, [detalhe])
  useEffect(() => {
    if (!autoEnviar.current || autoEnviar.current !== tese) return
    autoEnviar.current = null
    void montar(undefined, tese)
  })

  // Funil ao vivo enquanto o rascunho é editado.
  useEffect(() => {
    if (!p || !rascunho || !criterios.length) return
    let vivo = true
    const t = setTimeout(async () => {
      setCalculando(true)
      try { const r = await pesquisaApi.previa(p.id, criterios, filtros); if (vivo) setPrevia(r) }
      catch (e) { if (vivo) falhou(e) }
      finally { if (vivo) setCalculando(false) }
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
  }, [p, rascunho, criterios, filtros, falhou])

  async function montar(e?: FormEvent, pedido = tese) {
    e?.preventDefault()
    const texto = pedido.trim()
    if (texto.length < 10 || ocupado) { setErro('Descreva a tese com pelo menos 10 caracteres.'); return }
    setErro('')
    await f.montar(texto, frente)
  }
  const rascunhoAtual = (): Rascunho | null => detalhe ? { detalhe, criterios, filtros, meta, limiteWeb } : null
  async function iniciar(ate: 'amostra' | 'meta') {
    const r = rascunhoAtual()
    if (!r || bloqueado) return
    setErro('')
    await f.iniciar(ate, r)
  }
  function revisar(ate: 'amostra' | 'meta') { if (detalhe) { setErro(''); void f.revisar(ate, detalhe) } }
  function ajustarLimites(campos: { meta?: number; limiteWeb?: number }) { if (detalhe) void f.ajustarLimites(detalhe, campos) }
  function ajustar(opcionais: string[] = []) { if (detalhe && !bloqueado) { setErro(''); void f.ajustar(detalhe, opcionais) } }
  function registrar() { if (detalhe && selecionadas.size && !bloqueado) { setErro(''); void f.registrar(detalhe, selecionadas) } }

  function alternar(id: string, campo: 'obrigatorio') { setCriterios((cs) => cs.map((c) => c.id === id ? { ...c, [campo]: !c[campo] } : c)) }
  function remover(id: string) { setCriterios((cs) => cs.length > 1 ? cs.filter((c) => c.id !== id) : cs) }
  function adicionarPesquisa(e: FormEvent) {
    e.preventDefault()
    const texto = novoCriterio.trim()
    if (texto.length < 3 || criterios.length >= 12 || criterios.filter((c) => c.tipo === 'pesquisa').length >= 5) return
    setCriterios((cs) => [...cs, { id: `u_${Date.now().toString(36)}`, texto: texto.slice(0, 200), obrigatorio: true, tipo: 'pesquisa', regra: null, trecho: null, origem: 'usuario' }])
    setNovoCriterio('')
  }
  function usarDaMemoria(m: CriterioMemoria) { setCriterios((cs) => adicionarDaMemoria(cs, m) ?? cs) }
  function adicionarCadastro() {
    const a = ATALHOS_CADASTRO.find((x) => x.campo === atalho)
    if (!a || criterios.length >= 12) return
    const v = a.parametro ? Math.min(a.parametro.max, Math.max(a.parametro.min, parametro || a.parametro.padrao)) : 0
    setCriterios((cs) => [...cs.filter((c) => c.regra?.campo !== a.campo), { id: `u_${a.campo}_${Date.now().toString(36)}`, texto: a.texto(v), obrigatorio: true, tipo: 'cadastro', regra: { campo: a.campo, valor: a.valor(v) }, trecho: null, origem: 'usuario' }])
    setAtalho('')
  }

  // Continuação por grupo além da primeira resposta: um pedido por vez, cursor do servidor,
  // sem repetir empresa, e recusada pelo servidor quando a lista mudou desde a página de origem.
  const grupos = useMemo(() => montarGrupos(detalhe, paginas), [detalhe, paginas])
  function mostrarMais(grupo: Categoria, offset: number) { if (detalhe) void f.mostrarMais(detalhe, grupo, offset) }
  const funil = rascunho ? previa?.funil : p && funilValido(p.funil) ? p.funil : undefined
  const temPesquisa = criterios.some((c) => c.tipo === 'pesquisa')

  /* ---- composição da tese ---- */
  if (!p) return <main className="agente-pagina pesquisa">
    <div className="pesquisa-layout">
      <section className="pesquisa-compositor" aria-labelledby="titulo-pesquisa">
        <span className="agente-sobretitulo">Pesquisa por tese</span>
        <h2 id="titulo-pesquisa">Descreva as empresas que você procura.</h2>
        <p className="pesquisa-sub">O agente transforma a tese em critérios verificáveis, confere cada empresa do catálogo no cadastro da Receita e pesquisa no site oficial o que o cadastro não responde. Você revisa os critérios antes de rodar.</p>
        <form onSubmit={montar} className="pesquisa-caixa">
          <label htmlFor="tese" className="sr-only">Tese da pesquisa</label>
          <textarea id="tese" value={tese} onChange={(e) => setTese(e.target.value)} maxLength={2000} disabled={ocupado || !podeUsar}
            placeholder="Ex.: Distribuidoras químicas em SP com mais de 20 anos, sem sócio estrangeiro, que representem fabricantes multinacionais"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void montar() }} />
          <div className="pesquisa-caixa-rodape">
            <div className="pesquisa-segmentos" role="group" aria-label="Frente do mandato">
              {([['venda', 'Venda'], ['compra', 'Compra'], [null, 'Detectar']] as const).map(([v, r]) => <button key={r} type="button" aria-pressed={frente === v} onClick={() => setFrente(v)} disabled={ocupado}>{r}</button>)}
            </div>
            <button className="agente-btn-primario" disabled={ocupado || !podeUsar || tese.trim().length < 10}>{ocupado ? 'Montando critérios…' : 'Montar critérios'}<IconeRede nome="seta" /></button>
          </div>
        </form>
        {!podeUsar && <p className="mt-3 text-sm text-suave">Seu perfil permite consultar pesquisas existentes, não criar novas.</p>}
        {erro && <p role="alert" className="pesquisa-erro">{erro}</p>}
        <div className="pesquisa-exemplos" aria-label="Exemplos de tese">
          {EXEMPLOS_TESE.map((x) => <button key={x.rotulo} type="button" onClick={() => setTese(x.texto)} disabled={ocupado}><span>{x.rotulo}</span>{x.texto}</button>)}
        </div>
        <ol className="pesquisa-etapas">
          {[['01', 'Critérios', 'A tese vira critérios obrigatórios e opcionais, que você edita.'], ['02', 'Funil cadastral', 'Todo o recorte é conferido na Receita, sem custo, em segundos.'],
            ['03', 'Evidência pública', 'O site oficial de cada empresa é lido para o que o cadastro não responde.'], ['04', 'Entrega', 'As escolhidas seguem para o trabalho, reunião e oportunidade.']]
            .map(([n, t, d]) => <li key={n}><span>{n}</span><strong>{t}</strong><p>{d}</p></li>)}
        </ol>
      </section>
      <Lateral lista={lista} ia={ia} aoAbrir={abrir} atual={null} extra={painelMemoria} />
    </div>
  </main>

  /* ---- rascunho e resultado ---- */
  const revisadas = detalhe?.contagens.revisadas ?? 0
  const total = detalhe?.contagens.total ?? 0
  const boas = (detalhe?.contagens.aderente ?? 0) + (detalhe?.contagens.provavel ?? 0)
  return <main className="agente-pagina pesquisa">
    <div className="pesquisa-layout">
      <div className="min-w-0 space-y-5">
        <header className="pesquisa-cabecalho">
          <div className="min-w-0">
            <span className="agente-sobretitulo">Pesquisa por tese · {p.frente === 'compra' ? 'mandato de compra' : 'mandato de venda'}</span>
            <h2>{p.tese}</h2>
            <p><EstadoPill estado={p.estado} rodando={rodando} /> {p.motivo_estado && !rodando && <span className="text-suave">{p.motivo_estado}</span>}</p>
          </div>
          <button className="agente-btn-secundario" onClick={() => { f.esvaziar(); setDetalhe(null); setTese(''); setPrevia(null); setErro(''); setAviso('') }} disabled={rodando}><IconeRede nome="mais" />Nova pesquisa</button>
        </header>
        {erro && <p role="alert" className="pesquisa-erro">{erro}</p>}
        {aviso && <p role="status" className="pesquisa-aviso">{aviso}</p>}

        <FunilPesquisa funil={funil} revisadas={rascunho ? undefined : revisadas} boas={rascunho ? undefined : boas} meta={meta} calculando={calculando} temPesquisa={temPesquisa} />
        {rascunho && funil && funil.aprovadasCadastro < meta && <SugestaoRelaxamento sugestoes={sugerirRelaxamento(criterios, funil, meta)} meta={meta} aprovadas={funil.aprovadasCadastro}
          aoAplicar={(id) => alternar(id, 'obrigatorio')} desabilitado={calculando || !podeUsar} />}

        {rascunho ? <section className="agente-superficie pesquisa-criterios" aria-labelledby="titulo-criterios">
          <div className="agente-linha-titulo"><h3 id="titulo-criterios">Critérios desta pesquisa</h3><span>{p.modo === 'regras' ? 'Propostos por regras locais' : `Propostos com ${p.modo.replace('ia:', '')}`}</span></div>
          {!!p.notas.length && <ul className="pesquisa-notas">{p.notas.map((n) => <li key={n}><IconeRede nome="brilho" />{n}</li>)}</ul>}
          <ul className="pesquisa-lista-criterios">
            {criterios.map((c) => {
              const elimina = funil?.eliminadasPor[c.id], volta = funil?.exclusivas[c.id]
              return <li key={c.id} className={c.obrigatorio ? '' : 'is-opcional'}>
                <span className={`pesquisa-tipo ${c.tipo}`} title={c.tipo === 'cadastro' ? 'Conferido no cadastro da Receita Federal' : 'Pesquisado no site oficial da empresa'}><IconeRede nome={c.tipo === 'cadastro' ? 'documento' : 'globo'} /></span>
                <div className="min-w-0 flex-1">
                  <p className="pesquisa-criterio-texto">{c.texto}</p>
                  <p className="pesquisa-criterio-meta">{c.tipo === 'cadastro' ? 'Cadastro RFB · sem custo' : 'Site oficial · evidência pública'}
                    {c.obrigatorio && !!elimina && <> · elimina {numero(elimina)}{volta ? <>; tornar opcional recupera <strong>{numero(volta)}</strong></> : null}</>}
                    {c.trecho && <> · de “{c.trecho.slice(0, 60)}{c.trecho.length > 60 ? '…' : ''}”</>}{c.id.startsWith(PREFIXO_MEMORIA) && <> · da sua memória</>}</p>
                </div>
                <div className="pesquisa-segmentos pequeno" role="group" aria-label={`Peso de ${c.texto}`}>
                  <button type="button" aria-pressed={c.obrigatorio} onClick={() => !c.obrigatorio && alternar(c.id, 'obrigatorio')}>Obrigatório</button>
                  <button type="button" aria-pressed={!c.obrigatorio} onClick={() => c.obrigatorio && alternar(c.id, 'obrigatorio')}>Opcional</button>
                </div>
                <button type="button" className="pesquisa-remover" aria-label={`Remover ${c.texto}`} onClick={() => remover(c.id)} disabled={criterios.length <= 1}><IconeRede nome="lixo" /></button>
              </li>
            })}
          </ul>
          <div className="pesquisa-adicionar">
            <form onSubmit={adicionarPesquisa}><label className="sr-only" htmlFor="novo-criterio">Novo critério de pesquisa</label>
              <input id="novo-criterio" className="agente-input" value={novoCriterio} onChange={(e) => setNovoCriterio(e.target.value)} maxLength={200} placeholder="Novo critério para o site, ex.: atende a indústria de tintas" />
              <button className="agente-btn-secundario" disabled={novoCriterio.trim().length < 3}><IconeRede nome="globo" />Adicionar</button></form>
            <div className="pesquisa-atalho">
              <label className="sr-only" htmlFor="atalho">Critério de cadastro</label>
              <select id="atalho" className="agente-input" value={atalho} onChange={(e) => { setAtalho(e.target.value); setParametro(ATALHOS_CADASTRO.find((x) => x.campo === e.target.value)?.parametro?.padrao ?? 0) }}>
                <option value="">Adicionar critério de cadastro…</option>
                {ATALHOS_CADASTRO.map((a) => <option key={a.campo} value={a.campo}>{a.rotulo}</option>)}
              </select>
              {ATALHOS_CADASTRO.find((x) => x.campo === atalho)?.parametro && <label className="pesquisa-parametro"><input type="number" className="agente-input" value={parametro} onChange={(e) => setParametro(Number(e.target.value))} />{ATALHOS_CADASTRO.find((x) => x.campo === atalho)!.parametro!.rotulo}</label>}
              <button type="button" className="agente-btn-secundario" onClick={adicionarCadastro} disabled={!atalho}><IconeRede nome="documento" />Adicionar</button>
            </div>
          </div>
          {memoria?.ativa && <SugestoesMemoria sugestoes={sugestoesDaMemoria(criterios, memoria.criterios)} aoUsar={usarDaMemoria} />}
          <details className="pesquisa-recorte"><summary>Recorte, meta e limite · {rotuloSubsetor(filtros.subsetor ?? SUBSETOR_ORIGINAL)} · {filtros.uf || 'todas as UFs'} · meta {meta} · até {limiteWeb} sites</summary>
            <div className="grid gap-4 sm:grid-cols-4">
              <label className="text-sm sm:col-span-4">Subsetor<select className="agente-input mt-1 w-full" value={filtros.subsetor ?? SUBSETOR_ORIGINAL} onChange={(e) => setFiltros({ ...filtros, subsetor: e.target.value })}>
                <option value="todos">Todos os setores-alvo ({SUBSETORES_ALVO.length} subsetores químicos)</option>
                {SUBSETORES_ALVO.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></label>
              <label className="text-sm">UF da sede<select className="agente-input mt-1 w-full" value={filtros.uf} onChange={(e) => setFiltros({ ...filtros, uf: e.target.value })}>{UFS.map((u) => <option key={u} value={u}>{u || 'Todas'}</option>)}</select></label>
              <label className="text-sm">Meta de aderentes<input type="number" min={1} max={200} className="agente-input mt-1 w-full" value={meta} onChange={(e) => setMeta(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} /></label>
              <label className="text-sm">Limite de sites lidos<input type="number" min={0} max={500} className="agente-input mt-1 w-full" value={limiteWeb} onChange={(e) => setLimiteWeb(Math.max(0, Math.min(500, Number(e.target.value) || 0)))} /></label>
              <label className="flex items-start gap-2 self-end text-sm"><input type="checkbox" className="mt-1" checked={filtros.incluirPossiveis} onChange={(e) => setFiltros({ ...filtros, incluirPossiveis: e.target.checked })} />Incluir enquadramentos possíveis</label>
            </div>
          </details>
          <div className="pesquisa-acoes">
            <button className="agente-btn-primario" onClick={() => void iniciar(temPesquisa ? 'amostra' : 'meta')} disabled={bloqueado || rodando || !podeUsar || !criterios.length}>
              {temPesquisa ? `Revisar as ${Math.min(AMOSTRA, funil?.aprovadasCadastro ?? AMOSTRA) || AMOSTRA} primeiras` : 'Aplicar critérios'}<IconeRede nome="seta" /></button>
            {temPesquisa && <button className="agente-btn-secundario" onClick={() => void iniciar('meta')} disabled={bloqueado || rodando || !podeUsar}>Revisar até a meta</button>}
            <span className="text-xs text-suave">{temPesquisa ? 'A amostra mostra se os critérios estão certos antes do gasto maior.' : 'Só critérios de cadastro: o resultado sai na hora.'}</span>
          </div>
        </section> : <>
          <section className="pesquisa-controle" aria-label="Andamento da revisão">
            <div className="pesquisa-progresso"><div><strong>{numero(revisadas)}</strong> de {numero(total)} revisadas · <strong>{numero(boas)}</strong> aderentes ou prováveis · meta {p.meta}</div>
              <div className="pesquisa-barra" aria-hidden="true"><span style={{ width: `${total ? Math.round((100 * revisadas) / total) : 0}%` }} /></div></div>
            <div className="pesquisa-controle-botoes">
              {rodando ? <button className="agente-btn-secundario" onClick={() => f.pausar()}><IconeRede nome="pausa" />Pausar</button>
                : ['pronta', 'pausada', 'em_andamento'].includes(p.estado) && <button className="agente-btn-primario" onClick={() => void revisar('meta')} disabled={bloqueado || !podeUsar}><IconeRede nome="continuar" />Continuar até a meta</button>}
              {p.estado === 'concluida' && (detalhe?.contagens.pendentes ?? 0) > 0 && <button className="agente-btn-secundario" onClick={() => void ajustarLimites({ meta: p.meta + 10 })} disabled={rodando || bloqueado}>Ampliar meta (+10)</button>}
              {p.estado === 'pausada' && /Limite de/.test(p.motivo_estado || '') && <button className="agente-btn-secundario" onClick={() => void ajustarLimites({ limiteWeb: p.limite_web + 40 })} disabled={rodando || bloqueado}>Ler mais 40 sites</button>}
              <button className="agente-btn-secundario" onClick={() => void ajustar()} disabled={rodando || bloqueado || !podeUsar}><IconeRede nome="funil" />Ajustar critérios</button>
              {aoEncontrar && boas > 0 && <button className="agente-btn-secundario" onClick={() => aoEncontrar({ id: p.id, tese: p.tese, boas })} disabled={rodando}><IconeRede nome="pessoas" />Quem decide nestas empresas</button>}
            </div>
          </section>
          {p.estado === 'concluida' && boas < p.meta && !(detalhe?.contagens.pendentes ?? 0) && funilValido(p.funil) && <SugestaoRelaxamento rodada
            sugestoes={sugerirRelaxamento(p.criterios, p.funil, p.meta)} meta={p.meta} aprovadas={p.funil.aprovadasCadastro} boas={boas}
            aoAplicar={(id) => ajustar([id])} desabilitado={rodando || bloqueado || !podeUsar} />}
          <MonitorarTese pesquisaId={p.id} monitoramento={detalhe?.monitoramento ?? null} podeUsar={podeUsar}
            aoMudar={(m) => setDetalhe((d) => d && d.pesquisa.id === p.id ? { ...d, monitoramento: m } : d)} aoFalhar={falhou} />
          <Legenda criterios={p.criterios} />
          <RegistroExecucao pesquisaId={p.id} marcador={`${p.versao}:${detalhe?.marca ?? ''}:${revisadas}`} />
          {entregue && <p role="status" className="pesquisa-aviso">{entregue.n} {entregue.n === 1 ? 'empresa enviada' : 'empresas enviadas'} ao trabalho. <button className="agente-link" onClick={() => aoAbrirTrabalho(entregue.conversaId)}>Abrir trabalho<IconeRede nome="seta" /></button></p>}
          <section className="pesquisa-resultados" aria-label="Empresas revisadas">
            {!revisadas && !rodando && <div className="agente-vazio-compacto agente-superficie"><IconeRede nome="alvo" /><p>Nenhuma empresa revisada ainda.</p><span>{total ? 'Clique em continuar para revisar a fila.' : 'Nenhuma empresa passou nos critérios de cadastro. Use “Ajustar critérios” e torne algum opcional.'}</span></div>}
            {grupos.map((g) => <details key={g.categoria} className={`pesquisa-grupo ${g.categoria}`} open={g.categoria !== 'nao_aderente'}>
              <summary><span className="pesquisa-grupo-ponto" />{ROTULO_CATEGORIA[g.categoria]} <b>{numero(g.total)}</b><small>{DESCRICAO_CATEGORIA[g.categoria]}</small></summary>
              {!g.itens.length && <p className="pesquisa-fila">Nenhuma empresa deste grupo veio na primeira lista.</p>}
              {g.itens.length > 0 && <>
              <div className="pesquisa-tabela-rolagem"><table className="pesquisa-tabela">
                <caption className="sr-only">{ROTULO_CATEGORIA[g.categoria]}: {numero(g.total)} {g.total === 1 ? 'empresa' : 'empresas'}{g.itens.length < g.total ? `, ${numero(g.itens.length)} exibidas` : ''}</caption>
                {/* "C1" na tela; o leitor de tela ouve também o critério, que cada célula da coluna herda. */}
                <thead><tr><th scope="col" className="w-8"><span className="sr-only">Selecionar</span></th><th scope="col">Empresa</th><th scope="col">Aderência</th>{p.criterios.map((c, k) => <th key={c.id} scope="col" title={c.texto}>C{k + 1}<span className="sr-only">: {c.texto}</span></th>)}</tr></thead>
                <tbody>{g.itens.map((i) => <Fragment key={i.empresa_id}>
                  <tr className={aberto === i.empresa_id ? 'is-aberta' : ''}>
                    <td><input type="checkbox" aria-label={`Selecionar ${i.empresa.nome}`} checked={selecionadas.has(i.empresa_id)} disabled={!podeUsar || (!selecionadas.has(i.empresa_id) && selecionadas.size >= 30)}
                      onChange={() => setSelecionadas((s) => { const n = new Set(s); if (n.has(i.empresa_id)) n.delete(i.empresa_id); else n.add(i.empresa_id); return n })} /></td>
                    <td><button className="pesquisa-empresa" onClick={() => setAberto(aberto === i.empresa_id ? null : i.empresa_id)} aria-expanded={aberto === i.empresa_id}>
                      <strong>{i.empresa.nome}</strong><small>{i.empresa.cidade}/{i.empresa.uf}{i.site?.dominio ? ` · ${i.site.dominio}` : ''}</small></button></td>
                    <td><Aderencia valor={i.aderencia} /></td>
                    {p.criterios.map((c, k) => <td key={c.id} data-c={`C${k + 1}`}><Simbolo v={i.vereditos[k]?.veredito ?? 'indeterminado'} humano={i.vereditos[k]?.lastro === 'humano'} titulo={`${ROTULO_VEREDITO[i.vereditos[k]?.veredito ?? 'indeterminado']}${i.vereditos[k]?.lastro === 'humano' ? ', revisão humana' : ''}: ${i.vereditos[k]?.resumo ?? ''}`} dica={`${c.texto}: ${i.vereditos[k]?.resumo ?? ''}${i.vereditos[k]?.lastro === 'humano' ? ' (revisão humana)' : ''}`} /></td>)}
                  </tr>
                  {aberto === i.empresa_id && <tr className="pesquisa-detalhe-linha"><td colSpan={3 + p.criterios.length}><Detalhe pesquisaId={p.id} item={i} criterios={p.criterios} aoExpirar={aoExpirar}
                    podeRevisar={podeUsar} aoRevisado={() => { if (detalhe) void f.recarregar(detalhe) }} /></td></tr>}
                </Fragment>)}</tbody>
              </table></div></>}
              {g.restantes > 0 && g.offset < g.total && <button className="agente-link mt-2 text-xs" onClick={() => void mostrarMais(g.categoria, g.offset)} disabled={g.carregando || abrindo} aria-busy={g.carregando}>
                {g.carregando ? 'Carregando…' : <>{g.itens.length ? 'Mostrar mais' : 'Mostrar empresas'} ({numero(g.restantes)} {g.itens.length ? 'restantes' : 'no grupo'})<IconeRede nome="seta" /></>}</button>}
            </details>)}
            {(detalhe?.contagens.pendentes ?? 0) > 0 && <p className="pesquisa-fila"><IconeRede nome="tempo" />{numero(detalhe?.contagens.pendentes ?? 0)} {detalhe?.contagens.pendentes === 1 ? 'empresa aguarda' : 'empresas aguardam'} pesquisa no site.</p>}
            {funilValido(p.funil) && p.funil.aprovadasCadastro > total && <p className="pesquisa-fila"><IconeRede nome="atencao" />{numero(p.funil.aprovadasCadastro)} empresas passaram no cadastro; a pesquisa guarda as primeiras {numero(total)} na ordem do funil. Para ver as demais, torne os critérios mais específicos.</p>}
          </section>
          {selecionadas.size > 0 && <div className="pesquisa-barra-selecao" role="region" aria-label="Empresas selecionadas">
            <span><strong>{selecionadas.size}</strong> selecionada{selecionadas.size > 1 ? 's' : ''}</span>
            <button className="agente-btn-secundario" onClick={() => setSelecionadas(new Set())}>Limpar</button>
            <button className="agente-btn-primario" onClick={() => void registrar()} disabled={bloqueado}>{ocupado ? 'Enviando…' : 'Levar para o trabalho'}<IconeRede nome="seta" /></button>
          </div>}
        </>}
      </div>
      <Lateral lista={lista} ia={ia} aoAbrir={abrir} atual={p.id} extra={painelMemoria} />
    </div>
  </main>
}

/** Sugestão de relaxamento, nunca automática. No rascunho, um clique torna o critério opcional e o funil
 *  ao vivo recalcula; numa rodada concluída abaixo da meta, abre uma nova rodada com ele opcional. */
function SugestaoRelaxamento({ sugestoes, meta, aprovadas, boas = 0, rodada = false, aoAplicar, desabilitado }: {
  sugestoes: Relaxamento[]; meta: number; aprovadas: number; boas?: number; rodada?: boolean; aoAplicar: (id: string) => void; desabilitado: boolean
}) {
  if (!sugestoes.length) return null
  return <section className="pesquisa-relaxar" aria-labelledby="titulo-relaxar">
    <div className="pesquisa-relaxar-cabeca"><span className="agente-icone-bloco"><IconeRede nome="funil" /></span><div className="min-w-0">
      <h3 id="titulo-relaxar">{rodada ? `A rodada terminou com ${numero(boas)} de ${numero(meta)} aderentes ou prováveis` : `Só ${numero(aprovadas)} ${aprovadas === 1 ? 'empresa passa' : 'empresas passam'} no cadastro para uma meta de ${numero(meta)}`}</h3>
      <p>{rodada ? 'Uma nova rodada com um destes critérios opcional leva mais empresas à revisão. Esta rodada fica no histórico.' : 'Estes são os critérios que mais restringem.'} Como opcional, o critério deixa de eliminar empresas e continua contando na aderência.</p>
    </div></div>
    <ul>{sugestoes.map((s) => <li key={s.id}>
      <div className="min-w-0"><strong>{s.texto}</strong><small>Opcional, recupera {numero(s.recupera)} {s.recupera === 1 ? 'empresa' : 'empresas'} · {numero(s.total)} no cadastro{s.basta ? ' · alcança a meta' : ''}</small></div>
      <button type="button" className="agente-btn-secundario" onClick={() => aoAplicar(s.id)} disabled={desabilitado}>{rodada ? 'Nova rodada com ele opcional' : 'Tornar opcional'}</button>
    </li>)}</ul>
  </section>
}

function EstadoPill({ estado, rodando }: { estado: string; rodando: boolean }) {
  const r = rodando ? 'Revisando…' : ({ rascunho: 'Rascunho', pronta: 'Pronta', em_andamento: 'Em andamento', pausada: 'Pausada', concluida: 'Concluída' } as Record<string, string>)[estado]
  return <span className={`pesquisa-estado ${rodando ? 'rodando' : estado}`}>{rodando && <span className="pesquisa-pulso" />}{r}</span>
}

function FunilPesquisa({ funil, revisadas, boas, meta, calculando, temPesquisa }: { funil?: Funil; revisadas?: number; boas?: number; meta: number; calculando: boolean; temPesquisa: boolean }) {
  const etapas: { rotulo: string; valor?: number; nota?: string }[] = [
    { rotulo: 'No recorte', valor: funil?.recorte, nota: funil?.truncado ? 'limitado às primeiras 10 mil' : undefined },
    { rotulo: 'Passam no cadastro', valor: funil?.aprovadasCadastro, nota: funil?.semAtributos ? `${numero(funil.semAtributos)} sem dados cadastrais completos` : undefined },
    ...(temPesquisa ? [{ rotulo: 'Com site oficial', valor: funil?.comSite }] : []),
    ...(revisadas !== undefined ? [{ rotulo: 'Revisadas', valor: revisadas }, { rotulo: `Aderentes (meta ${meta})`, valor: boas }] : []),
  ]
  const maximo = Math.max(1, funil?.recorte ?? 1)
  return <section className={`pesquisa-funil ${calculando ? 'is-calculando' : ''}`} aria-label="Funil da pesquisa" aria-busy={calculando}>
    {etapas.map((e) => <div key={e.rotulo} className="pesquisa-funil-etapa">
      <span className="pesquisa-funil-valor">{e.valor === undefined ? '—' : numero(e.valor)}</span>
      <span className="pesquisa-funil-rotulo">{e.rotulo}</span>
      <span className="pesquisa-funil-trilho" aria-hidden="true"><span style={{ width: `${e.valor ? Math.max(2, Math.round((100 * e.valor) / maximo)) : 0}%` }} /></span>
      {e.nota && <span className="pesquisa-funil-nota">{e.nota}</span>}
    </div>)}
  </section>
}

function Legenda({ criterios }: { criterios: Criterio[] }) {
  return <details className="pesquisa-legenda" open>
    <summary>Critérios e legenda</summary>
    <ol>{criterios.map((c, k) => <li key={c.id}><b>C{k + 1}</b> {c.texto} <span>{c.obrigatorio ? 'obrigatório' : 'opcional'} · {c.tipo === 'cadastro' ? 'cadastro' : 'site'}</span></li>)}</ol>
    <p>{(['atende', 'indicio', 'indeterminado', 'nao_atende'] as Veredito[]).map((v) => <span key={v}><Simbolo v={v} titulo="" />{ROTULO_VEREDITO[v]}</span>)}</p>
  </details>
}

/** Ícone do veredito. `titulo` é o que o leitor de tela ouve (vazio quando o texto visível ao lado já diz);
 *  `dica` é o balão para quem passa o mouse. */
function Simbolo({ v, titulo, dica, humano = false }: { v: Veredito; titulo: string; dica?: string; humano?: boolean }) {
  return <span className={`pesquisa-simbolo ${v}${humano ? ' humano' : ''}`} title={dica ?? (titulo || undefined)}><IconeRede nome={ICONE[v]} />{titulo && <span className="sr-only">{titulo}</span>}</span>
}

function Aderencia({ valor }: { valor: number }) {
  return <span className="pesquisa-aderencia"><span className="pesquisa-aderencia-trilho" aria-hidden="true"><span style={{ width: `${valor}%` }} /></span>{valor}%</span>
}

const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Liga ou desliga o monitoramento semanal e mostra o resultado da última verificação. */
function MonitorarTese({ pesquisaId, monitoramento: m, podeUsar, aoMudar, aoFalhar }: {
  pesquisaId: string; monitoramento: Monitoramento | null; podeUsar: boolean; aoMudar: (m: Monitoramento | null) => void; aoFalhar: (e: unknown) => void
}) {
  const [salvando, setSalvando] = useState(false)
  // Região de status sempre presente: a troca do texto é anunciada pelo leitor de tela.
  const [anuncio, setAnuncio] = useState('')
  const ativo = Boolean(m?.ativo), u = m?.ultimoResultado
  const alternar = async () => {
    setSalvando(true); setAnuncio('')
    try {
      const novo = (await pesquisaApi.monitorar(pesquisaId, !ativo)).monitoramento
      aoMudar(novo)
      setAnuncio(novo?.ativo ? `Monitoramento ligado. Próxima verificação a partir de ${dataBr(novo.proximaEm)}.` : 'Monitoramento desligado.')
    } catch (e) { aoFalhar(e) } finally { setSalvando(false) }
  }
  return <section className="agente-superficie flex flex-wrap items-start justify-between gap-3 p-4" aria-labelledby={`monitor-${pesquisaId}`}>
    <div className="min-w-0 flex-1 space-y-1">
      <h3 id={`monitor-${pesquisaId}`} className="text-sm font-semibold">Monitoramento semanal {ativo ? '· ligado' : '· desligado'}</h3>
      <p className="text-sm text-suave">{ativo && m
        ? `Próxima verificação a partir de ${dataBr(m.proximaEm)}, ao abrir o Meu dia. O funil cadastral é refeito no catálogo vigente (sem ler sites) e o Meu dia avisa sobre empresas novas e eventos societários.`
        : 'Toda semana, o Meu dia avisa sobre empresas que passarem a atender aos critérios cadastrais e sobre eventos societários das empresas desta pesquisa.'}</p>
      {m?.cobertura && !m.cobertura.completa && <p className="pesquisa-alerta text-xs">Cobertura parcial: a última verificação avaliou {m.cobertura.avaliadas.toLocaleString('pt-BR')} de {m.cobertura.recorte.toLocaleString('pt-BR')} empresas do recorte, e empresas fora dessa parte não geraram aviso. {m.cobertura.recorte > TETO_VARREDURA
        ? `O recorte passa do teto de ${TETO_VARREDURA.toLocaleString('pt-BR')} empresas por verificação: para cobrir tudo, restrinja o recorte (subsetor ou UF) com "Ajustar critérios".`
        : 'A próxima verificação lê o recorte inteiro.'}</p>}
      {ativo && m?.falhaEm && <p className="pesquisa-alerta text-xs">A última tentativa de verificação falhou ({dataBr(m.falhaEm)}). {m.emAndamento ? 'Uma nova tentativa está em andamento.' : `Nova tentativa automática a partir de ${dataBr(m.proximaEm)}, ao abrir o Meu dia.`}</p>}
      {u?.aConferir ? <p className="pesquisa-alerta text-xs">Verificação de transição: este monitoramento foi ligado numa versão anterior, que não acompanhava o recorte inteiro, e a versão do catálogo em que a pesquisa foi calculada não está disponível. {u.aConferir === 1 ? 'A empresa listada como nova pode' : `As ${u.aConferir} empresas listadas como novas podem`} já atender à tese desde antes do monitoramento: confira.</p> : null}
      {u && <p className="text-xs text-suave">Última verificação em {dataBr(u.verificadoEm)}{u.cobertura && !u.cobertura.completa ? ' (parcial)' : ''}: {plural(u.totalNovas, 'empresa nova', 'empresas novas')}{u.novas.length ? ` (${u.novas.map((x) => x.nome).join(', ')}${u.totalNovas > u.novas.length ? '…' : ''})` : ''} · {plural(u.totalEventos, 'com evento societário', 'com evento societário')}{u.eventos.length ? ` (${u.eventos.map((x) => x.nome).join(', ')})` : ''}.{u.totalNovas ? ' Para revisar as novas no site, use "Ajustar critérios" (nova rodada).' : ''}</p>}
    </div>
    <button className="agente-btn-secundario" onClick={() => void alternar()} disabled={salvando || !podeUsar}>{salvando ? 'Salvando…' : ativo ? 'Parar de monitorar' : 'Monitorar toda semana'}</button>
    <p role="status" className="sr-only">{anuncio}</p>
  </section>
}

/** A lista vem leve; ao abrir a empresa, busca o item completo (justificativas e trechos citados).
 *  Em empresa revisada, cada veredito aceita revisão humana (confirmar, contestar, deixar em aberto). */
function Detalhe({ pesquisaId, item: resumo, criterios, aoExpirar, podeRevisar = false, aoRevisado }: {
  pesquisaId: string; item: ItemPesquisa; criterios: Criterio[]; aoExpirar: () => void; podeRevisar?: boolean; aoRevisado?: () => void
}) {
  const [completo, setCompleto] = useState<ItemPesquisa | null>(null)
  const [revisoes, setRevisoes] = useState<RevisaoVeredito[]>([])
  const [editando, setEditando] = useState<string | null>(null)
  const [erroRevisao, setErroRevisao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [acesso, setAcesso] = useState(false)
  // Sessão expirada vai ao fluxo de login do pai; a referência evita refazer a busca se o pai recriar a função.
  const expirar = useRef(aoExpirar)
  useEffect(() => { expirar.current = aoExpirar })
  const [falha, setFalha] = useState('')
  const [tentativa, setTentativa] = useState(0)
  // Busca de novo só quando a empresa ou o resultado dela muda, não a cada lote da revisão.
  const empresaId = resumo.empresa_id, precisa = Boolean(resumo.resumido)
  const versaoItem = `${resumo.categoria}:${resumo.aderencia}:${resumo.etapa}`
  useEffect(() => {
    if (!precisa) return
    let vivo = true
    setCompleto(null); setFalha('')
    pesquisaApi.item(pesquisaId, empresaId)
      .then((r) => { if (vivo) { setCompleto(r.item); setRevisoes(r.revisoes ?? []) } })
      .catch((e) => {
        if (!vivo) return
        if (e instanceof ErroApi && e.status === 401) expirar.current()
        else setFalha(mensagem(e))
      })
    return () => { vivo = false }
  }, [pesquisaId, empresaId, precisa, versaoItem, tentativa])
  const carregando = precisa && !completo && !falha
  const item = (precisa ? completo : null) ?? resumo
  const e = item.empresa
  // A revisão humana pede o item completo (o veredito atual vai junto, para recusar se mudou em outra aba).
  const revisavel = podeRevisar && item.etapa === 'revisada' && (!precisa || Boolean(completo))
  const aplicarRevisao = async (acao: () => Promise<{ item: ItemPesquisa; revisoes: RevisaoVeredito[] }>) => {
    setSalvando(true); setErroRevisao('')
    try {
      const r = await acao()
      setCompleto(r.item); setRevisoes(r.revisoes); setEditando(null)
      aoRevisado?.()
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 401) expirar.current()
      else setErroRevisao(mensagem(erro))
    } finally { setSalvando(false) }
  }
  const textoCriterio = (id: string) => criterios.find((c) => c.id === id)?.texto ?? id
  return <div className="pesquisa-detalhe" aria-busy={carregando}>
    <div className="pesquisa-detalhe-cabeca">
      <div><strong>{e.razaoSocial}</strong><small>Raiz CNPJ {e.cnpjRaiz} · CNAE {e.cnaePrincipal}{e.dataAbertura ? ` · aberta em ${e.dataAbertura.split('-').reverse().join('/')}` : ''}</small></div>
      {item.site?.dominio && <a className="agente-link text-xs" href={`https://${item.site.dominio}`} target="_blank" rel="noreferrer">{item.site.dominio}<IconeRede nome="externo" /></a>}
    </div>
    {item.site && item.site.estado === 'lido' && item.site.identidade === 'dominio' && <p className="pesquisa-alerta">O site não cita o nome nem o CNPJ da empresa. Confirme que é o site certo antes de usar as evidências.</p>}
    {carregando && <p className="pesquisa-fonte" role="status">Carregando evidências…</p>}
    {falha && <p className="pesquisa-alerta" role="alert">Não foi possível carregar as evidências. {falha} <button className="agente-link" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</button></p>}
    <ul>{criterios.map((c, k) => {
      const v = item.vereditos[k]
      if (!v) return null
      return <li key={c.id} className={`pesquisa-veredito ${v.veredito}`}>
        <Simbolo v={v.veredito} titulo={ROTULO_VEREDITO[v.veredito]} />
        <div className="min-w-0">
          <p><b>{c.texto}</b> · {ROTULO_VEREDITO[v.veredito]}{v.resumo ? ` — ${v.resumo}` : ''}</p>
          {v.justificativa && <p className="pesquisa-justificativa">{v.justificativa}{v.lastro === 'ia' && v.modelo ? ` (julgado por ${v.modelo})` : ''}</p>}
          {(v.evidencias ?? []).filter((ev) => ev.trecho || ev.url).map((ev, n) => <blockquote key={n}>{ev.trecho && <p>“{ev.trecho}”</p>}{ev.url && <a href={ev.url} target="_blank" rel="noreferrer">{new URL(ev.url).pathname === '/' ? ev.url.replace(/^https?:\/\//, '') : ev.url.replace(/^https?:\/\/(www\.)?/, '')}<IconeRede nome="externo" /></a>}</blockquote>)}
          {v.lastro === 'cadastro' && v.evidencias?.[0] && <p className="pesquisa-fonte">{v.evidencias[0].fonte} · referência {v.evidencias[0].referencia}</p>}
          {v.lastro === 'humano' && <p className="pesquisa-humano"><IconeRede nome="verificar" /><span>Revisão humana · {v.revisao?.autor.nome ?? 'equipe'}{v.revisao?.em ? ` · ${dataBr(v.revisao.em)}` : ''}
            {v.revisao?.fonte ? ` · fonte: ${v.revisao.fonte.descricao}` : ''}. Travada: a revisão automática não altera esta decisão.</span></p>}
          {revisavel && editando !== c.id && <div className="pesquisa-revisao-acoes">
            <button type="button" className="agente-link text-xs" onClick={() => { setEditando(c.id); setErroRevisao('') }} disabled={salvando}>{v.lastro === 'humano' ? 'Rever decisão' : 'Revisar'}<span className="sr-only">: {c.texto}</span></button>
            {v.lastro === 'humano' && <button type="button" className="agente-link text-xs" onClick={() => void aplicarRevisao(() => pesquisaApi.desfazerRevisao(pesquisaId, empresaId, c.id))} disabled={salvando}>
              Desfazer<span className="sr-only"> a revisão de {c.texto}</span></button>}
          </div>}
          {revisavel && editando === c.id && <FormRevisao criterio={c} atual={v} salvando={salvando} erro={erroRevisao} aoCancelar={() => setEditando(null)}
            aoSalvar={(corpo) => void aplicarRevisao(() => pesquisaApi.revisar(pesquisaId, empresaId, corpo))} />}
        </div>
      </li>
    })}</ul>
    {erroRevisao && editando === null && <p className="pesquisa-alerta" role="alert">{erroRevisao}</p>}
    {!!revisoes.length && <details className="pesquisa-historico"><summary>Histórico de revisões humanas ({revisoes.length})</summary>
      <ol>{revisoes.map((r) => <li key={r.id}>{dataBr(r.em)} · {r.autor} {r.acao === 'revisar' ? 'revisou' : 'desfez a revisão de'} <b>{textoCriterio(r.criterioId)}</b>: {ROTULO_VEREDITO[r.antes.veredito] ?? '—'} → {ROTULO_VEREDITO[r.depois.veredito] ?? '—'}{r.acao === 'revisar' && r.depois.justificativa ? ` (“${r.depois.justificativa}”)` : ''}</li>)}</ol>
    </details>}
    <div className="pesquisa-revisao-acoes">
      <button type="button" className="agente-link text-xs" aria-expanded={acesso} onClick={() => setAcesso((v) => !v)}>
        <IconeRede nome="rede" />{acesso ? 'Fechar o plano de acesso' : 'Chegar a quem decide'}<span className="sr-only"> em {e.razaoSocial}</span></button>
    </div>
    {acesso && <PlanoAcesso empresaId={empresaId} pesquisaId={pesquisaId} aoExpirar={() => expirar.current()} />}
  </div>
}

/** Decisão humana sobre um critério: veredito, justificativa obrigatória e fonte opcional. */
function FormRevisao({ criterio, atual, salvando, erro, aoSalvar, aoCancelar }: {
  criterio: Criterio; atual: VereditoCriterio; salvando: boolean; erro: string; aoSalvar: (corpo: PedidoRevisao) => void; aoCancelar: () => void
}) {
  const [veredito, setVeredito] = useState<PedidoRevisao['veredito']>(atual.veredito === 'indicio' ? 'atende' : atual.veredito)
  const [justificativa, setJustificativa] = useState('')
  const [fonte, setFonte] = useState('')
  const [url, setUrl] = useState('')
  const base = `rev-${criterio.id}`
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (justificativa.trim().length < 10) return
    aoSalvar({ criterioId: criterio.id, veredito, justificativa: justificativa.trim(), anterior: { veredito: atual.veredito, lastro: atual.lastro ?? null },
      ...(fonte.trim().length >= 3 ? { fonte: { descricao: fonte.trim(), ...(url.trim() ? { url: url.trim() } : {}) } } : {}) })
  }
  return <form className="pesquisa-revisao-form" onSubmit={enviar} aria-label={`Revisar: ${criterio.texto}`}>
    <fieldset><legend>Sua decisão</legend>
      {([['atende', 'Atende'], ['nao_atende', 'Não atende'], ['indeterminado', 'Sem evidência']] as const).map(([valor, rotulo]) =>
        <label key={valor}><input type="radio" name={`${base}-veredito`} value={valor} checked={veredito === valor} onChange={() => setVeredito(valor)} />{rotulo}</label>)}
    </fieldset>
    <label htmlFor={`${base}-just`}>Justificativa <span className="text-suave">(obrigatória, vai para o histórico e para a entrega)</span></label>
    <textarea id={`${base}-just`} className="agente-input" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={600} required minLength={10}
      placeholder="Ex.: Confirmado em conversa com o diretor comercial em 05/10." autoFocus />
    <div className="pesquisa-revisao-fonte">
      <label>Fonte <span className="text-suave">(opcional)</span><input className="agente-input" value={fonte} onChange={(e) => setFonte(e.target.value)} maxLength={200} placeholder="Ex.: ata da reunião de 05/10" /></label>
      <label>Endereço <span className="text-suave">(opcional)</span><input className="agente-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://" disabled={fonte.trim().length < 3} /></label>
    </div>
    {erro && <p role="alert" className="pesquisa-erro">{erro}</p>}
    <div className="pesquisa-revisao-botoes">
      <button className="agente-btn-primario" disabled={salvando || justificativa.trim().length < 10}>{salvando ? 'Salvando…' : 'Salvar decisão'}</button>
      <button type="button" className="agente-btn-secundario" onClick={aoCancelar} disabled={salvando}>Cancelar</button>
    </div>
  </form>
}

function Lateral({ lista, ia, aoAbrir, atual, extra }: { lista: ResumoPesquisa[]; ia: IAInfo | null; aoAbrir: (id: string) => void; atual: string | null; extra?: ReactNode }) {
  return <aside className="pesquisa-lateral">
    <section className={`pesquisa-ia ${ia ? 'com-ia' : ''}`}>
      <span className="agente-icone-bloco"><IconeRede nome={ia ? 'brilho' : 'documento'} /></span>
      <h3>{ia ? `Julgamento com ${ia.provedor === 'gemini' ? 'Gemini' : ia.provedor === 'groq' ? 'Groq' : ia.provedor}` : 'Modo sem IA'}</h3>
      <p>{ia ? `${ia.modelo}${ia.gratuito ? ' · camada gratuita' : ''}. A IA só pode citar trechos que existem no site; sem trecho, o veredito fica em aberto.`
        : 'Cadastro conferido por regras e sites lidos por busca de termos (indícios). Com uma chave gratuita do Gemini ou Groq, os critérios de site passam a ter julgamento.'}</p>
    </section>
    <section aria-label="Pesquisas recentes"><h3 className="mb-3 text-sm font-semibold">Pesquisas recentes</h3>
      {!lista.length && <p className="text-xs leading-relaxed text-suave">Suas pesquisas aparecem aqui, com o andamento salvo.</p>}
      <ul className="space-y-2">{lista.map((r) => <li key={r.id}><button className={`pesquisa-recente ${atual === r.id ? 'is-atual' : ''}`} onClick={() => aoAbrir(r.id)} aria-current={atual === r.id ? 'true' : undefined}>
        <span className="pesquisa-recente-tese">{r.tese}</span>
        <span className="pesquisa-recente-meta">{({ rascunho: 'Rascunho', pronta: 'Pronta', em_andamento: 'Em andamento', pausada: 'Pausada', concluida: 'Concluída' } as Record<string, string>)[r.estado]}{r.estado !== 'rascunho' ? ` · ${r.boas} aderentes` : ''} · {new Date(r.atualizado_em).toLocaleDateString('pt-BR')}</span>
      </button></li>)}</ul>
    </section>
    {extra}
  </aside>
}

/** Critérios da memória que ainda não estão no rascunho: um clique acrescenta (nunca entram sozinhos). */
function SugestoesMemoria({ sugestoes, aoUsar }: { sugestoes: CriterioMemoria[]; aoUsar: (m: CriterioMemoria) => void }) {
  if (!sugestoes.length) return null
  return <div className="pesquisa-memoria-sugestoes" role="group" aria-label="Critérios da sua memória">
    <span>Da sua memória</span>
    {sugestoes.map((m) => <button key={m.chave} type="button" onClick={() => aoUsar(m)} title={`Usado em ${m.usos} ${m.usos === 1 ? 'pesquisa' : 'pesquisas'}`}>
      <IconeRede nome={m.tipo === 'cadastro' ? 'documento' : 'globo'} />{m.texto}<span className="sr-only">: acrescentar aos critérios</span></button>)}
  </div>
}

/** O que o agente lembra desta pessoa: visível, pausável e apagável, como a memória do Lessie. */
function PainelMemoria({ memoria, aoMudar }: { memoria: Memoria | null; aoMudar: (m: Memoria) => void }) {
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const apagarTudo = useRef<HTMLButtonElement>(null)
  if (!memoria) return null
  const agir = async (acao: () => Promise<Memoria>) => {
    setOcupado(true); setErro('')
    try { aoMudar(await acao()) } catch (e) { setErro(mensagem(e)) } finally { setOcupado(false); setConfirmando(false) }
  }
  const n = memoria.criterios.length
  return <section className="pesquisa-memoria" aria-labelledby="titulo-memoria">
    <h3 id="titulo-memoria">Sua memória{memoria.ativa ? '' : ' · pausada'}</h3>
    <p>O agente guarda os critérios que você confirma ao iniciar uma pesquisa e os sugere nas próximas. Só você vê. Trabalhos em mandato confidencial não entram.</p>
    {n ? <details><summary>{n} {n === 1 ? 'critério guardado' : 'critérios guardados'}</summary>
      <ul>{memoria.criterios.map((c) => <li key={c.chave}><span className="min-w-0"><span className="block truncate">{c.texto}</span><small>{c.usos} {c.usos === 1 ? 'uso' : 'usos'} · {c.tipo === 'cadastro' ? 'cadastro' : 'site'}</small></span>
        <button type="button" onClick={() => void agir(() => memoriaApi.esquecer(c.chave))} disabled={ocupado} aria-label={`Esquecer ${c.texto}`} title="Esquecer"><IconeRede nome="lixo" /></button></li>)}</ul>
    </details> : <p className="text-xs text-suave">Nada guardado ainda.</p>}
    <div className="pesquisa-memoria-acoes">
      <button type="button" className="agente-link text-xs" onClick={() => void agir(() => memoriaApi.definir(!memoria.ativa))} disabled={ocupado}>{memoria.ativa ? 'Pausar memória' : 'Retomar memória'}</button>
      {n > 0 && (confirmando
        ? <span role="group" aria-label="Apagar toda a memória?" onKeyDown={(e) => { if (e.key === 'Escape') { setConfirmando(false); apagarTudo.current?.focus() } }}>
            <button type="button" className="is-perigo" onClick={() => void agir(memoriaApi.apagarTudo)} disabled={ocupado}>{ocupado ? 'Apagando…' : 'Apagar tudo'}</button>
            <button type="button" onClick={() => { setConfirmando(false); setTimeout(() => apagarTudo.current?.focus(), 0) }} disabled={ocupado} autoFocus>Cancelar</button>
          </span>
        : <button type="button" ref={apagarTudo} className="agente-link text-xs" onClick={() => setConfirmando(true)} disabled={ocupado}>Apagar tudo</button>)}
    </div>
    {erro && <p role="alert" className="pesquisa-erro">{erro}</p>}
  </section>
}

/** Registro da execução (o "o que o agente fez" do Lessie): passos tipados lidos por cursor, que
 *  crescem a cada lote enquanto a revisão roda. Fechado por padrão; o mais recente primeiro. */
function RegistroExecucao({ pesquisaId, marcador }: { pesquisaId: string; marcador: string }) {
  const [eventos, setEventos] = useState<EventoPesquisa[]>([])
  const ultimo = useRef(0)
  const atual = useRef(pesquisaId)
  if (atual.current !== pesquisaId) { atual.current = pesquisaId; ultimo.current = 0 }
  useEffect(() => { setEventos([]) }, [pesquisaId])
  useEffect(() => {
    let vivo = true
    const de = pesquisaId
    pesquisaApi.eventos(de, ultimo.current).then((r) => {
      if (!vivo || atual.current !== de || !r.eventos.length) return
      ultimo.current = Math.max(ultimo.current, r.ultimo)
      setEventos((es) => { const vistos = new Set(es.map((e) => e.id)); return [...es, ...r.eventos.filter((e) => !vistos.has(e.id))].slice(-200) })
    }).catch(() => { /* registro é acessório: a falha não interrompe a pesquisa */ })
    return () => { vivo = false }
  }, [pesquisaId, marcador])
  if (!eventos.length) return null
  const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return <details className="pesquisa-registro">
    <summary>Registro da execução <small>{eventos.length} {eventos.length === 1 ? 'passo' : 'passos'}</small></summary>
    <ol>{[...eventos].reverse().map((e) => <li key={e.id} className={e.ator}>
      <span className="pesquisa-registro-quem">{e.ator === 'agente' ? 'Agente' : (e.autor ?? 'Equipe')}</span>
      <span className="min-w-0">{descreverEvento(e)}</span>
      <time dateTime={e.em}>{hora(e.em)}</time>
    </li>)}</ol>
  </details>
}
