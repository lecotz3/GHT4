import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { IconeRede } from './IconeRede'
import { ErroApi, type Usuario } from '../agente/api'
import {
  pesquisaApi, ATALHOS_CADASTRO, DESCRICAO_CATEGORIA, EXEMPLOS_TESE, ROTULO_CATEGORIA, ROTULO_VEREDITO,
  type Categoria, type Criterio, type DetalhePesquisa, type Filtros, type Funil, type IAInfo, type ItemPesquisa, type Previa, type ResumoPesquisa, type Veredito,
} from '../agente/pesquisa'
import '../agente/pesquisa.css'

const UFS = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
const AMOSTRA = 10
const CATEGORIAS: Categoria[] = ['aderente', 'provavel', 'a_confirmar', 'nao_aderente']
const ICONE: Record<Veredito, 'certo' | 'aproximado' | 'duvida' | 'xis'> = { atende: 'certo', indicio: 'aproximado', indeterminado: 'duvida', nao_atende: 'xis' }
const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir esta ação.'
const numero = (n: number | undefined) => (n ?? 0).toLocaleString('pt-BR')
const funilValido = (f: DetalhePesquisa['pesquisa']['funil']): f is Funil => typeof (f as Funil).recorte === 'number'

export function PesquisaTese({ usuario, inicial, aoConsumirInicial, aoAbrirTrabalho, aoExpirar }: {
  usuario: Usuario
  inicial: { tese?: string; pesquisaId?: string } | null
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
  const [rodando, setRodando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [entregue, setEntregue] = useState<{ conversaId: string; n: number } | null>(null)
  const [novoCriterio, setNovoCriterio] = useState('')
  const [atalho, setAtalho] = useState('')
  const [parametro, setParametro] = useState(0)
  const parar = useRef(false)
  // Pesquisa exibida e geração da execução na tela: resposta de outra pesquisa ou de um laço
  // antigo não sobrescreve a que está aberta, e só a última abertura vale.
  const ativa = useRef<string | null>(null)
  const execucaoTela = useRef(0)
  const envio = useRef<{ id: string; tese: string } | null>(null)
  // A tese escrita no Início já é um pedido: monta os critérios sem exigir outro clique.
  const autoEnviar = useRef<string | null>(null)
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
  /** Mostra `d` se for a pesquisa aberta; `trocar` é para quem escolhe abrir outra. Devolve se aplicou. */
  const aplicar = useCallback((d: DetalhePesquisa, trocar = false) => {
    if (!trocar && d.pesquisa.id !== ativa.current) return false
    ativa.current = d.pesquisa.id
    setDetalhe(d); setCriterios(d.pesquisa.criterios); setFiltros(d.pesquisa.filtros); setMeta(d.pesquisa.meta); setLimiteWeb(d.pesquisa.limite_web)
    if (d.ia !== undefined) setIa(d.ia)
    return true
  }, [])
  const abrir = useCallback(async (id: string) => {
    const minha = ++execucaoTela.current
    // O laço da pesquisa anterior deixa de ser desta tela: ele pausa a pesquisa dele sozinho.
    parar.current = true; setRodando(false); setErro(''); setAviso(''); setEntregue(null); setSelecionadas(new Set()); setAberto(null); setPrevia(null)
    try { const d = await pesquisaApi.obter(id); if (execucaoTela.current === minha) aplicar(d, true) } catch (e) { falhou(e) }
  }, [aplicar, falhou])

  useEffect(() => { void recarregarLista() }, [recarregarLista])
  useEffect(() => {
    if (!inicial) return
    if (inicial.pesquisaId) void abrir(inicial.pesquisaId)
    else if (inicial.tese) { ativa.current = null; ++execucaoTela.current; setRodando(false); setDetalhe(null); setTese(inicial.tese); autoEnviar.current = inicial.tese }
    aoConsumirInicial()
  }, [inicial, abrir, aoConsumirInicial])
  useEffect(() => () => { parar.current = true }, [])
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
    setOcupado(true); setErro(''); setAviso('')
    try {
      if (!envio.current || envio.current.tese !== texto) envio.current = { id: crypto.randomUUID(), tese: texto }
      const minha = ++execucaoTela.current
      const d = await pesquisaApi.criar({ id: envio.current.id, tese: texto, frente })
      envio.current = null
      if (execucaoTela.current === minha) { aplicar(d, true); setPrevia(null) }
      void recarregarLista()
    } catch (falha) { falhou(falha) } finally { setOcupado(false) }
  }

  async function salvarRascunho() {
    if (!p) return null
    const mudou = JSON.stringify(criterios) !== JSON.stringify(p.criterios) || JSON.stringify(filtros) !== JSON.stringify(p.filtros)
      || meta !== p.meta || limiteWeb !== p.limite_web
    if (!mudou) return detalhe
    const d = await pesquisaApi.editar(p.id, { versao: p.versao, criterios, filtros, meta, limiteWeb })
    aplicar(d); return d
  }

  async function revisar(ate: 'amostra' | 'meta', base?: DetalhePesquisa) {
    let d = base ?? detalhe
    if (!d) return
    const minha = ++execucaoTela.current
    const vigente = () => execucaoTela.current === minha
    parar.current = false; setRodando(true); setErro(''); setAviso('')
    const alvo = Math.min(AMOSTRA, d.contagens.total)
    try {
      while (!parar.current && vigente()) {
        d = await pesquisaApi.avancar(d.pesquisa.id, 2)
        if (!vigente() || !aplicar(d)) break
        if (d.pesquisa.estado !== 'em_andamento') break
        if (ate === 'amostra' && d.contagens.revisadas >= alvo) {
          d = await pesquisaApi.pausar(d.pesquisa.id); aplicar(d)
          setAviso(`Amostra de ${d.contagens.revisadas} empresas revisada. Confira os vereditos; se estiverem bons, continue até a meta.`)
          break
        }
      }
      // Parou por pedido ou porque outra pesquisa foi aberta: pausa ESTA pesquisa, sem mexer na tela da outra.
      if ((parar.current || !vigente()) && d.pesquisa.estado === 'em_andamento') { d = await pesquisaApi.pausar(d.pesquisa.id); if (vigente()) aplicar(d) }
    } catch (e) { if (vigente()) falhou(e) } finally { if (vigente()) setRodando(false); void recarregarLista() }
  }

  async function iniciar(ate: 'amostra' | 'meta') {
    if (!p || ocupado) return
    setOcupado(true); setErro('')
    try {
      const salvo = await salvarRascunho()
      if (!salvo) return
      const d = await pesquisaApi.iniciar(salvo.pesquisa.id, salvo.pesquisa.versao)
      aplicar(d); setOcupado(false)
      if (d.pesquisa.estado === 'pronta') await revisar(ate, d)
    } catch (e) { falhou(e) } finally { setOcupado(false) }
  }

  async function ajustarLimites(campos: { meta?: number; limiteWeb?: number }) {
    if (!p) return
    try { aplicar(await pesquisaApi.editar(p.id, { versao: p.versao, ...campos })) } catch (e) { falhou(e) }
  }

  // Chave e corpo de cada envio ficam guardados até a confirmação: uma resposta perdida,
  // repetida, devolve o mesmo resultado em vez de criar outra rodada ou outro turno.
  const envioAjuste = useRef<{ origem: string; id: string } | null>(null)
  const envioRegistro = useRef<{ corpo: string; chave: string } | null>(null)
  async function ajustar() {
    if (!p || ocupado) return
    setOcupado(true); setErro('')
    if (envioAjuste.current?.origem !== p.id) envioAjuste.current = { origem: p.id, id: crypto.randomUUID() }
    try { const d = await pesquisaApi.ajustar(p.id, envioAjuste.current.id); envioAjuste.current = null; ++execucaoTela.current; aplicar(d, true); setPrevia(null); setSelecionadas(new Set()); setAviso('Nova rodada criada a partir dos critérios anteriores. Ajuste e rode de novo; a rodada anterior continua no histórico.'); void recarregarLista() }
    catch (e) { falhou(e) } finally { setOcupado(false) }
  }

  async function registrar() {
    if (!p || !selecionadas.size || ocupado) return
    setOcupado(true); setErro('')
    const empresas = [...selecionadas].sort()
    const corpo = JSON.stringify([p.id, empresas])
    if (envioRegistro.current?.corpo !== corpo) envioRegistro.current = { corpo, chave: crypto.randomUUID() }
    try {
      const r = await pesquisaApi.registrar(p.id, envioRegistro.current.chave, empresas)
      envioRegistro.current = null
      setEntregue({ conversaId: r.conversa.id, n: empresas.length }); setSelecionadas(new Set())
    } catch (e) { falhou(e) } finally { setOcupado(false) }
  }

  function alternar(id: string, campo: 'obrigatorio') { setCriterios((cs) => cs.map((c) => c.id === id ? { ...c, [campo]: !c[campo] } : c)) }
  function remover(id: string) { setCriterios((cs) => cs.length > 1 ? cs.filter((c) => c.id !== id) : cs) }
  function adicionarPesquisa(e: FormEvent) {
    e.preventDefault()
    const texto = novoCriterio.trim()
    if (texto.length < 3 || criterios.length >= 12 || criterios.filter((c) => c.tipo === 'pesquisa').length >= 5) return
    setCriterios((cs) => [...cs, { id: `u_${Date.now().toString(36)}`, texto: texto.slice(0, 200), obrigatorio: true, tipo: 'pesquisa', regra: null, trecho: null, origem: 'usuario' }])
    setNovoCriterio('')
  }
  function adicionarCadastro() {
    const a = ATALHOS_CADASTRO.find((x) => x.campo === atalho)
    if (!a || criterios.length >= 12) return
    const v = a.parametro ? Math.min(a.parametro.max, Math.max(a.parametro.min, parametro || a.parametro.padrao)) : 0
    setCriterios((cs) => [...cs.filter((c) => c.regra?.campo !== a.campo), { id: `u_${a.campo}_${Date.now().toString(36)}`, texto: a.texto(v), obrigatorio: true, tipo: 'cadastro', regra: { campo: a.campo, valor: a.valor(v) }, trecho: null, origem: 'usuario' }])
    setAtalho('')
  }

  // Itens além da primeira resposta, por grupo; a lista do servidor vem antes e não se repete.
  const [mais, setMais] = useState<{ pesquisaId: string; itens: ItemPesquisa[] }>({ pesquisaId: '', itens: [] })
  const grupos = useMemo(() => {
    const base = detalhe?.itens ?? []
    const vistos = new Set(base.map((i) => i.empresa_id))
    const extras = mais.pesquisaId === detalhe?.pesquisa.id ? mais.itens.filter((i) => !vistos.has(i.empresa_id)) : []
    const itens = [...base, ...extras]
    return { revisadas: CATEGORIAS.map((c) => ({ categoria: c, itens: itens.filter((i) => i.etapa === 'revisada' && i.categoria === c) })), fila: itens.filter((i) => i.etapa !== 'revisada') }
  }, [detalhe, mais])
  async function mostrarMais(grupo: Categoria, carregados: number) {
    if (!detalhe) return
    const id = detalhe.pesquisa.id
    try {
      const r = await pesquisaApi.itens(id, grupo, carregados)
      setMais((m) => ({ pesquisaId: id, itens: [...(m.pesquisaId === id ? m.itens : []), ...r.itens] }))
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar mais empresas.') }
  }
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
      <Lateral lista={lista} ia={ia} aoAbrir={abrir} atual={null} />
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
          <button className="agente-btn-secundario" onClick={() => { parar.current = true; ativa.current = null; ++execucaoTela.current; setDetalhe(null); setTese(''); setPrevia(null); setErro(''); setAviso('') }} disabled={rodando}><IconeRede nome="mais" />Nova pesquisa</button>
        </header>
        {erro && <p role="alert" className="pesquisa-erro">{erro}</p>}
        {aviso && <p role="status" className="pesquisa-aviso">{aviso}</p>}

        <FunilPesquisa funil={funil} revisadas={rascunho ? undefined : revisadas} boas={rascunho ? undefined : boas} meta={meta} calculando={calculando} temPesquisa={temPesquisa} />

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
                    {c.trecho && <> · de “{c.trecho.slice(0, 60)}{c.trecho.length > 60 ? '…' : ''}”</>}</p>
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
          <details className="pesquisa-recorte"><summary>Recorte, meta e limite · {filtros.uf || 'todas as UFs'} · meta {meta} · até {limiteWeb} sites</summary>
            <div className="grid gap-4 sm:grid-cols-4">
              <label className="text-sm">UF da sede<select className="agente-input mt-1 w-full" value={filtros.uf} onChange={(e) => setFiltros({ ...filtros, uf: e.target.value })}>{UFS.map((u) => <option key={u} value={u}>{u || 'Todas'}</option>)}</select></label>
              <label className="text-sm">Meta de aderentes<input type="number" min={1} max={200} className="agente-input mt-1 w-full" value={meta} onChange={(e) => setMeta(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} /></label>
              <label className="text-sm">Limite de sites lidos<input type="number" min={0} max={500} className="agente-input mt-1 w-full" value={limiteWeb} onChange={(e) => setLimiteWeb(Math.max(0, Math.min(500, Number(e.target.value) || 0)))} /></label>
              <label className="flex items-start gap-2 self-end text-sm"><input type="checkbox" className="mt-1" checked={filtros.incluirPossiveis} onChange={(e) => setFiltros({ ...filtros, incluirPossiveis: e.target.checked })} />Incluir enquadramentos possíveis</label>
            </div>
          </details>
          <div className="pesquisa-acoes">
            <button className="agente-btn-primario" onClick={() => void iniciar(temPesquisa ? 'amostra' : 'meta')} disabled={ocupado || rodando || !podeUsar || !criterios.length}>
              {temPesquisa ? `Revisar as ${Math.min(AMOSTRA, funil?.aprovadasCadastro ?? AMOSTRA) || AMOSTRA} primeiras` : 'Aplicar critérios'}<IconeRede nome="seta" /></button>
            {temPesquisa && <button className="agente-btn-secundario" onClick={() => void iniciar('meta')} disabled={ocupado || rodando || !podeUsar}>Revisar até a meta</button>}
            <span className="text-xs text-suave">{temPesquisa ? 'A amostra mostra se os critérios estão certos antes do gasto maior.' : 'Só critérios de cadastro: o resultado sai na hora.'}</span>
          </div>
        </section> : <>
          <section className="pesquisa-controle" aria-label="Andamento da revisão">
            <div className="pesquisa-progresso"><div><strong>{numero(revisadas)}</strong> de {numero(total)} revisadas · <strong>{numero(boas)}</strong> aderentes ou prováveis · meta {p.meta}</div>
              <div className="pesquisa-barra" aria-hidden="true"><span style={{ width: `${total ? Math.round((100 * revisadas) / total) : 0}%` }} /></div></div>
            <div className="pesquisa-controle-botoes">
              {rodando ? <button className="agente-btn-secundario" onClick={() => { parar.current = true }}><IconeRede nome="pausa" />Pausar</button>
                : ['pronta', 'pausada', 'em_andamento'].includes(p.estado) && <button className="agente-btn-primario" onClick={() => void revisar('meta')} disabled={!podeUsar}><IconeRede nome="continuar" />Continuar até a meta</button>}
              {p.estado === 'concluida' && (detalhe?.contagens.pendentes ?? 0) > 0 && <button className="agente-btn-secundario" onClick={() => void ajustarLimites({ meta: p.meta + 10 })} disabled={rodando}>Ampliar meta (+10)</button>}
              {p.estado === 'pausada' && /Limite de/.test(p.motivo_estado || '') && <button className="agente-btn-secundario" onClick={() => void ajustarLimites({ limiteWeb: p.limite_web + 40 })} disabled={rodando}>Ler mais 40 sites</button>}
              <button className="agente-btn-secundario" onClick={() => void ajustar()} disabled={rodando || ocupado || !podeUsar}><IconeRede nome="funil" />Ajustar critérios</button>
            </div>
          </section>
          <Legenda criterios={p.criterios} />
          {entregue && <p role="status" className="pesquisa-aviso">{entregue.n} {entregue.n === 1 ? 'empresa enviada' : 'empresas enviadas'} ao trabalho. <button className="agente-link" onClick={() => aoAbrirTrabalho(entregue.conversaId)}>Abrir trabalho<IconeRede nome="seta" /></button></p>}
          <section className="pesquisa-resultados" aria-label="Empresas revisadas">
            {!revisadas && !rodando && <div className="agente-vazio-compacto agente-superficie"><IconeRede nome="alvo" /><p>Nenhuma empresa revisada ainda.</p><span>{total ? 'Clique em continuar para revisar a fila.' : 'Nenhuma empresa passou nos critérios de cadastro. Use “Ajustar critérios” e torne algum opcional.'}</span></div>}
            {grupos.revisadas.filter((g) => g.itens.length).map((g) => <details key={g.categoria} className={`pesquisa-grupo ${g.categoria}`} open={g.categoria !== 'nao_aderente'}>
              <summary><span className="pesquisa-grupo-ponto" />{ROTULO_CATEGORIA[g.categoria]} <b>{numero(detalhe?.contagens[g.categoria] ?? g.itens.length)}</b><small>{DESCRICAO_CATEGORIA[g.categoria]}</small></summary>
              <div className="pesquisa-tabela-rolagem"><table className="pesquisa-tabela">
                <thead><tr><th scope="col" className="w-8"><span className="sr-only">Selecionar</span></th><th scope="col">Empresa</th><th scope="col">Aderência</th>{p.criterios.map((c, k) => <th key={c.id} scope="col" title={c.texto}>C{k + 1}</th>)}</tr></thead>
                <tbody>{g.itens.map((i) => <Fragment key={i.empresa_id}>
                  <tr className={aberto === i.empresa_id ? 'is-aberta' : ''}>
                    <td><input type="checkbox" aria-label={`Selecionar ${i.empresa.nome}`} checked={selecionadas.has(i.empresa_id)} disabled={!podeUsar || (!selecionadas.has(i.empresa_id) && selecionadas.size >= 30)}
                      onChange={() => setSelecionadas((s) => { const n = new Set(s); if (n.has(i.empresa_id)) n.delete(i.empresa_id); else n.add(i.empresa_id); return n })} /></td>
                    <td><button className="pesquisa-empresa" onClick={() => setAberto(aberto === i.empresa_id ? null : i.empresa_id)} aria-expanded={aberto === i.empresa_id}>
                      <strong>{i.empresa.nome}</strong><small>{i.empresa.cidade}/{i.empresa.uf}{i.site?.dominio ? ` · ${i.site.dominio}` : ''}</small></button></td>
                    <td><Aderencia valor={i.aderencia} /></td>
                    {p.criterios.map((c, k) => <td key={c.id} data-c={`C${k + 1}`}><Simbolo v={i.vereditos[k]?.veredito ?? 'indeterminado'} titulo={`${c.texto}: ${i.vereditos[k]?.resumo ?? ''}`} /></td>)}
                  </tr>
                  {aberto === i.empresa_id && <tr className="pesquisa-detalhe-linha"><td colSpan={3 + p.criterios.length}><Detalhe item={i} criterios={p.criterios} /></td></tr>}
                </Fragment>)}</tbody>
              </table></div>
              {(detalhe?.contagens[g.categoria] ?? 0) > g.itens.length && <button className="agente-link mt-2 text-xs" onClick={() => void mostrarMais(g.categoria, g.itens.length)}>
                Mostrar mais ({numero((detalhe?.contagens[g.categoria] ?? 0) - g.itens.length)} restantes)<IconeRede nome="seta" /></button>}
            </details>)}
            {(detalhe?.contagens.pendentes ?? 0) > 0 && <p className="pesquisa-fila"><IconeRede nome="tempo" />{numero(detalhe?.contagens.pendentes ?? 0)} {detalhe?.contagens.pendentes === 1 ? 'empresa aguarda' : 'empresas aguardam'} pesquisa no site.</p>}
            {funilValido(p.funil) && p.funil.aprovadasCadastro > total && <p className="pesquisa-fila"><IconeRede nome="atencao" />{numero(p.funil.aprovadasCadastro)} empresas passaram no cadastro; a pesquisa guarda as primeiras {numero(total)} na ordem do funil. Para ver as demais, torne os critérios mais específicos.</p>}
          </section>
          {selecionadas.size > 0 && <div className="pesquisa-barra-selecao" role="region" aria-label="Empresas selecionadas">
            <span><strong>{selecionadas.size}</strong> selecionada{selecionadas.size > 1 ? 's' : ''}</span>
            <button className="agente-btn-secundario" onClick={() => setSelecionadas(new Set())}>Limpar</button>
            <button className="agente-btn-primario" onClick={() => void registrar()} disabled={ocupado}>{ocupado ? 'Enviando…' : 'Levar para o trabalho'}<IconeRede nome="seta" /></button>
          </div>}
        </>}
      </div>
      <Lateral lista={lista} ia={ia} aoAbrir={abrir} atual={p.id} />
    </div>
  </main>
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
    <p>{(['atende', 'indicio', 'indeterminado', 'nao_atende'] as Veredito[]).map((v) => <span key={v}><Simbolo v={v} titulo={ROTULO_VEREDITO[v]} />{ROTULO_VEREDITO[v]}</span>)}</p>
  </details>
}

function Simbolo({ v, titulo }: { v: Veredito; titulo: string }) {
  return <span className={`pesquisa-simbolo ${v}`} title={titulo}><IconeRede nome={ICONE[v]} /><span className="sr-only">{titulo}</span></span>
}

function Aderencia({ valor }: { valor: number }) {
  return <span className="pesquisa-aderencia"><span className="pesquisa-aderencia-trilho" aria-hidden="true"><span style={{ width: `${valor}%` }} /></span>{valor}%</span>
}

function Detalhe({ item, criterios }: { item: ItemPesquisa; criterios: Criterio[] }) {
  const e = item.empresa
  return <div className="pesquisa-detalhe">
    <div className="pesquisa-detalhe-cabeca">
      <div><strong>{e.razaoSocial}</strong><small>Raiz CNPJ {e.cnpjRaiz} · CNAE {e.cnaePrincipal}{e.dataAbertura ? ` · aberta em ${e.dataAbertura.split('-').reverse().join('/')}` : ''}</small></div>
      {item.site?.dominio && <a className="agente-link text-xs" href={`https://${item.site.dominio}`} target="_blank" rel="noreferrer">{item.site.dominio}<IconeRede nome="externo" /></a>}
    </div>
    {item.site && item.site.estado === 'lido' && item.site.identidade === 'dominio' && <p className="pesquisa-alerta">O site não cita o nome nem o CNPJ da empresa. Confirme que é o site certo antes de usar as evidências.</p>}
    <ul>{criterios.map((c, k) => {
      const v = item.vereditos[k]
      if (!v) return null
      return <li key={c.id} className={`pesquisa-veredito ${v.veredito}`}>
        <Simbolo v={v.veredito} titulo={ROTULO_VEREDITO[v.veredito]} />
        <div className="min-w-0">
          <p><b>{c.texto}</b> · {ROTULO_VEREDITO[v.veredito]}{v.resumo ? ` — ${v.resumo}` : ''}</p>
          <p className="pesquisa-justificativa">{v.justificativa}{v.lastro === 'ia' && v.modelo ? ` (julgado por ${v.modelo})` : ''}</p>
          {v.evidencias.filter((ev) => ev.trecho || ev.url).map((ev, n) => <blockquote key={n}>{ev.trecho && <p>“{ev.trecho}”</p>}{ev.url && <a href={ev.url} target="_blank" rel="noreferrer">{new URL(ev.url).pathname === '/' ? ev.url.replace(/^https?:\/\//, '') : ev.url.replace(/^https?:\/\/(www\.)?/, '')}<IconeRede nome="externo" /></a>}</blockquote>)}
          {v.lastro === 'cadastro' && v.evidencias[0] && <p className="pesquisa-fonte">{v.evidencias[0].fonte} · referência {v.evidencias[0].referencia}</p>}
        </div>
      </li>
    })}</ul>
  </div>
}

function Lateral({ lista, ia, aoAbrir, atual }: { lista: ResumoPesquisa[]; ia: IAInfo | null; aoAbrir: (id: string) => void; atual: string | null }) {
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
  </aside>
}
