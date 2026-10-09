import { SUBSETORES_ALVO, type InicialPesquisa } from '../agente/pesquisa'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { MarcaGHT4 } from './MarcaGHT4'
import { Equipe } from './Equipe'
import { Rede } from './Rede'
import { AceitarConvite } from './AceitarConvite'
import { Oportunidades } from './Oportunidades'
import { SelecaoEmpresas } from './SelecaoEmpresas'
import { ModelosBusca } from './ModelosBusca'
import { PreviaBusca } from './PreviaBusca'
import { EstruturaAgente, GuiaDeUso, type SecaoAgente } from './EstruturaAgente'
import { InicioAgente } from './InicioAgente'
import { PesquisaTese } from './PesquisaTese'
import { EncontrarPessoas } from './EncontrarPessoas'
import type { PesquisaDoFind } from '../agente/encontrar'
import { EscolherEmpresaAgente } from './EscolherEmpresaAgente'
import { IconeRede } from './IconeRede'
import { SeletorUfs } from './SeletorUfs'
import { FichaEmpresaGaveta } from './FichaEmpresaGaveta'
import { SinaisEmpresa } from './SinaisEmpresa'
import { FichaContexto, useAbrirFicha } from '../agente/fichaContexto'
import { impedimentoDaTarefa, orientacoes } from '../agente/orientacao'
import '../agente/visual.css'
import type { EscolhaEmpresa } from '../agente/prospeccao'
import { api, ErroApi, type Acao, type Contexto, type Conversa, type Empresa, type EstadoAgente, type Resultado, type Tarefa, type Trabalho, type Turno, type Usuario } from '../agente/api'

const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm outline-offset-2 focus:outline-comprador'
const botao = 'rounded-ficha border border-tinta bg-tinta px-4 py-2.5 text-sm font-semibold text-papel transition hover:bg-tinta-2 disabled:cursor-not-allowed disabled:opacity-50'
const secundario = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm font-medium hover:bg-papel-2 disabled:opacity-50'
const ROTULOS: Record<Tarefa, string> = { interpretar_busca: 'Preparar filtros pelo pedido', conversar: 'Conversar com o agente', pesquisar_web: 'Pesquisar fontes públicas', buscar_empresas: 'Encontrar empresas', preparar_reuniao: 'Preparar reunião', mapear_acesso: 'Abrir caminho até a liderança', registrar_passo: 'Registrar próximo passo', ver_pendencias: 'Rever pendências', pesquisar_tese: 'Pesquisa por tese' }
const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir esta ação.'

export function Agente({ aoExplorar, convite, aoLimparConvite }: { aoExplorar: () => void; convite: string | null; aoLimparConvite: () => void }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [fase, setFase] = useState<'carregando' | 'login' | 'configurar' | 'offline'>('carregando')
  const [erro, setErro] = useState('')
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [secao, setSecao] = useState<SecaoAgente>('inicio')
  const [versaoEquipe, setVersaoEquipe] = useState(0)
  const [crm, setCrm] = useState<{ id: string | null } | null>(null)
  const [trabalhoExterno, setTrabalhoExterno] = useState<string | null>(null)
  const [pesquisaInicial, setPesquisaInicial] = useState<InicialPesquisa | null>(null)
  const consumirPesquisa = useCallback(() => setPesquisaInicial(null), [])
  // "Quem decide nestas empresas", vindo de uma pesquisa por tese: o find procura só nas aderentes dela.
  const [pesquisaDoFind, setPesquisaDoFind] = useState<PesquisaDoFind | null>(null)
  const conviteInicial = useRef(convite)
  const aoExpirar = useCallback(() => { setUsuario(null); setSecao('inicio'); setCrm(null); setFase('login'); setErro('Sua sessão expirou. Faça login para retomar seus trabalhos.') }, [])

  async function iniciar() {
    setFase('carregando'); setErro('')
    try { setUsuario(await api<Usuario>('/api/eu')) }
    catch (e) {
      if (e instanceof ErroApi && e.status === 401) {
        try { const r = await api<{ disponivel: boolean }>('/api/instalacao'); setFase(r.disponivel ? 'configurar' : 'login') }
        catch (falha) { setErro(mensagem(falha)); setFase('offline') }
      } else { setErro(mensagem(e)); setFase('offline') }
    }
  }
  useEffect(() => { if (!conviteInicial.current) void iniciar() }, [])

  async function entrar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    setOcupado(true); setErro('')
    try {
      if (fase === 'configurar') {
        await api('/api/instalacao', 'POST', { nome, email, senha })
        setFase('login')
      }
      const u = await api<Usuario>('/api/sessao', 'POST', { email, senha })
      setSenha(''); setUsuario(u)
    } catch (falha) { setErro(mensagem(falha)) }
    finally { setOcupado(false) }
  }
  async function sair() {
    setOcupado(true); setErro('')
    try { await api('/api/sessao', 'DELETE'); setUsuario(null); setSecao('inicio'); setCrm(null); setSenha(''); setFase('login') }
    catch (falha) { setErro(mensagem(falha)) }
    finally { setOcupado(false) }
  }

  const [ficha, setFicha] = useState<string | null>(null)
  function navegar(s: SecaoAgente) {
    if (secao === 'equipe' && s !== 'equipe') setVersaoEquipe(v => v + 1)
    if (s === 'crm') setCrm({ id: null })
    // Pelo menu, o find procura em todas as empresas; o recorte da pesquisa vem só pelo botão dela.
    if (s === 'encontrar') setPesquisaDoFind(null)
    setSecao(s)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function abrirCrm(id: string) { setCrm({ id }); setSecao('crm'); window.scrollTo({ top: 0, behavior: 'instant' }) }
  function pesquisar(inicial: InicialPesquisa) { setPesquisaInicial(inicial); navegar('pesquisa') }
  function encontrarNaPesquisa(p: PesquisaDoFind) { navegar('encontrar'); setPesquisaDoFind(p) }

  if (usuario && !convite) return <FichaContexto.Provider value={setFicha}><EstruturaAgente usuario={usuario} secao={secao} aoNavegar={navegar} aoSair={() => void sair()} saindo={ocupado}>
    {erro && <p role="alert" className="mx-5 mt-3 text-sm text-alerta">{erro}</p>}
    {secao === 'equipe' && <Equipe aoExpirar={aoExpirar} aoVoltar={() => navegar('agente')} />}
    {secao === 'rede' && <Rede aoExpirar={aoExpirar} aoVoltar={() => navegar('agente')} />}
    {secao === 'crm' && <Oportunidades key={crm?.id ?? 'lista'} inicialId={crm?.id ?? null} aoVoltar={() => navegar('agente')} aoExpirar={aoExpirar} aoAbrirTrabalho={(id) => { setTrabalhoExterno(id); navegar('agente') }} />}
    {secao === 'ajuda' && <GuiaDeUso aoNavegar={navegar} aoExplorar={aoExplorar} />}
    {secao === 'encontrar' && <EncontrarPessoas aoPesquisar={(tese) => pesquisar({ tese })} aoExpirar={aoExpirar} pesquisa={pesquisaDoFind} aoSairDaPesquisa={() => setPesquisaDoFind(null)} />}
    {secao === 'pesquisa' && <PesquisaTese usuario={usuario} inicial={pesquisaInicial} aoConsumirInicial={consumirPesquisa} aoAbrirTrabalho={(id) => { setTrabalhoExterno(id); navegar('agente') }} aoExpirar={aoExpirar} aoEncontrar={encontrarNaPesquisa} />}
    <div hidden={secao !== 'inicio' && secao !== 'agente'}><EspacoDoAgente key={usuario.id} usuario={usuario} inicio={secao === 'inicio'} aoOportunidades={() => navegar('crm')} aoTrabalhar={() => navegar('agente')} aoRede={() => navegar('rede')} aoAjuda={() => navegar('ajuda')} aoExpirar={aoExpirar} versaoEquipe={versaoEquipe} trabalhoExterno={trabalhoExterno} aoAbrirCrm={abrirCrm} aoPesquisar={pesquisar} /></div>
    <FichaEmpresaGaveta empresaId={ficha} aoFechar={() => setFicha(null)} aoAbrirCrm={abrirCrm} podeExportar={usuario.papel !== 'leitura'} />
  </EstruturaAgente></FichaContexto.Provider>

  return <div className="agente-app agente-acesso">
    <aside className="agente-acesso-marca"><MarcaGHT4 className="h-14" /><div><span className="agente-sobretitulo">GHT4 Advisory · M&amp;A</span><h1>Boas conexões.<br />Novas possibilidades.</h1><p>Um espaço para descobrir empresas, reunir contexto e transformar relações em oportunidades.</p></div><ol><li><span>01</span>Descubra o mercado</li><li><span>02</span>Encontre um caminho</li><li><span>03</span>Avance a conversa</li></ol><small>Inteligência a serviço das suas relações.</small></aside>
    <div className="agente-acesso-formulario">
    {convite ? <AceitarConvite token={convite} aoEntrar={(u) => { setUsuario(u); setSecao('inicio'); aoLimparConvite() }} aoLogin={() => { aoLimparConvite(); setUsuario(null); setFase('login'); setErro('') }} /> : <main className="w-full max-w-md">
      {fase === 'carregando' ? <p role="status">Abrindo seu espaço de trabalho…</p>
        : fase === 'offline' ? <section className="space-y-5"><h2 className="text-2xl font-semibold">Vamos conectar o agente</h2>
          <p role="alert" className="text-sm text-suave">{erro}</p><p className="text-sm">Não foi possível conectar. Tente novamente; se continuar, avise o responsável pela instalação.</p>
          <button className={botao} onClick={() => void iniciar()}>Tentar novamente</button></section>
        : <form onSubmit={entrar} className="space-y-5">
          <div className="mb-8"><span className="agente-sobretitulo">Bem-vindo à GHT4</span><h2 className="mt-3 text-3xl font-semibold tracking-tight">{fase === 'configurar' ? 'Vamos começar.' : 'Seu próximo movimento começa aqui.'}</h2>
            <p className="mt-3 text-sm leading-relaxed text-suave">{fase === 'configurar' ? 'Crie o administrador deste ambiente para começar.' : 'Entre com seu e-mail e senha para acessar seus trabalhos.'}</p></div>
          {fase === 'configurar' && <label className="block text-sm font-medium">Seu nome<input className={`${campo} mt-1`} value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" /></label>}
          <label className="block text-sm font-medium">E-mail<input className={`${campo} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
          <label className="block text-sm font-medium">Senha<input className={`${campo} mt-1`} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={fase === 'configurar' ? 12 : 1} maxLength={256} autoComplete={fase === 'configurar' ? 'new-password' : 'current-password'} />
            {fase === 'configurar' && <span className="mt-1 block text-xs font-normal text-suave">Use pelo menos 12 caracteres.</span>}</label>
          {erro && <p role="alert" className="text-sm text-alerta">{erro}</p>}
          <button className="agente-btn-primario w-full" disabled={ocupado}>{ocupado ? 'Entrando…' : fase === 'configurar' ? 'Criar acesso e começar' : 'Entrar no meu espaço'}<IconeRede nome="seta" /></button>
          <p className="text-xs leading-relaxed text-suave">Precisa de acesso ou esqueceu a senha? Fale com o administrador da GHT4.</p>
        </form>}
    </main>}
    {!convite && <button className="agente-link mt-8 text-xs" onClick={aoExplorar}>Conhecer a demonstração<IconeRede nome="seta" /></button>}
    </div>
  </div>
}

function EspacoDoAgente({ usuario, inicio, aoOportunidades, aoTrabalhar, aoRede, aoAjuda, aoExpirar, versaoEquipe, aoAbrirCrm, trabalhoExterno, aoPesquisar }: { usuario: Usuario; inicio: boolean; aoOportunidades: () => void; aoTrabalhar: () => void; aoRede: () => void; aoAjuda: () => void; aoExpirar: () => void; versaoEquipe: number; aoAbrirCrm: (id: string) => void; trabalhoExterno: string | null; aoPesquisar: (inicial: InicialPesquisa) => void }) {
  const [estado, setEstado] = useState<EstadoAgente | null>(null)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [mandatos, setMandatos] = useState<{ id: string; rotulo: string }[]>([])
  const [ativa, setAtiva] = useState<Conversa | null>(null)
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [acoes, setAcoes] = useState<Acao[]>([])
  const [titulo, setTitulo] = useState('')
  const [mandatoId, setMandatoId] = useState('')
  const [contexto, setContexto] = useState<Contexto>({ frente: 'venda', uf: '', busca: '', incluirPossiveis: false })
  const [tarefa, setTarefa] = useState<Tarefa>('buscar_empresas')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [salvandoAcao, setSalvandoAcao] = useState('')
  const [revisao, setRevisao] = useState<EscolhaEmpresa | null>(null)
  const [versaoSelecao, setVersaoSelecao] = useState(0)
  const [empresaManual, setEmpresaManual] = useState<Empresa | null>(null)
  const [abaTrabalho, setAbaTrabalho] = useState<'resultados' | 'selecao'>('resultados')
  const [focoPedido, setFocoPedido] = useState(0)
  const compositor = useRef<HTMLFormElement>(null)
  const ultimaResposta = useRef<HTMLDivElement>(null)
  const requisicao = useRef(0)
  const envioPendente = useRef<{ id: string; corpo: unknown } | null>(null)
  const podeUsar = usuario.papel !== 'leitura'

  const falhou = useCallback((e: unknown) => {
    if (e instanceof ErroApi && e.status === 401) aoExpirar()
    else setErro(mensagem(e))
  }, [aoExpirar])
  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const [s, c, m] = await Promise.all([api<EstadoAgente>('/api/agente'), api<{ conversas: Conversa[] }>('/api/agente/conversas'), api<{ mandatos: { id: string; rotulo: string }[] }>('/api/mandatos')])
      setEstado(s); setConversas(c.conversas); setMandatos(m.mandatos)
    } catch (e) { falhou(e) }
    finally { setCarregando(false) }
  }, [falhou])
  useEffect(() => { void carregar() }, [carregar, versaoEquipe])
  useEffect(() => {
    if (focoPedido && !inicio && compositor.current) {
      const topo = compositor.current.getBoundingClientRect().top
      if (topo < 85 || topo > window.innerHeight - 180) compositor.current.scrollIntoView({ block: 'start', behavior: 'instant' })
      compositor.current.focus({ preventScroll: true })
    }
  }, [focoPedido, inicio])

  const abrir = useCallback(async (id: string) => {
    if (enviando) return
    const n = ++requisicao.current
    setCarregando(true); setErro('')
    try {
      const r = await api<Trabalho>(`/api/agente/conversas/${id}`)
      if (requisicao.current !== n) return
      setAtiva(r.conversa); setContexto(r.conversa.contexto); setTitulo(r.conversa.titulo)
      setMandatoId(r.conversa.mandato_id || ''); setTurnos(r.turnos); setAcoes(r.acoes)
      setTexto(r.conversa.contexto.documentoIds?.length ? 'Resuma os documentos selecionados, com referências por página ou parágrafo, divergências e próximos passos.' : ''); setTarefa(r.conversa.contexto.documentoIds?.length ? 'conversar' : 'ver_pendencias'); envioPendente.current = null
      setRevisao(null); setEmpresaManual(null); setAbaTrabalho('resultados')
    } catch (e) { if (requisicao.current === n) falhou(e) }
    finally { if (requisicao.current === n) setCarregando(false) }
  }, [enviando, falhou])
  const externoConsumido = useRef<string | null>(null)
  useEffect(() => { if (trabalhoExterno && trabalhoExterno !== externoConsumido.current && !enviando) {
    externoConsumido.current = trabalhoExterno; void abrir(trabalhoExterno); void carregar()
  } }, [trabalhoExterno, enviando, abrir, carregar])
  function novo() {
    if (enviando) return
    requisicao.current++; setAtiva(null); setTurnos([]); setAcoes([]); setTitulo(''); setMandatoId('')
    setContexto({ frente: 'venda', uf: '', busca: '', incluirPossiveis: false }); setTexto(''); setTarefa('buscar_empresas')
    setErro(''); setCarregando(false); envioPendente.current = null
    setRevisao(null); setEmpresaManual(null); setAbaTrabalho('resultados')
  }
  function escolherTarefa(t: Tarefa) { setTarefa(t); envioPendente.current = null; setFocoPedido(n => n + 1) }
  function comecar(t: Tarefa) { novo(); escolherTarefa(t); aoTrabalhar() }
  function preparar(e: Empresa) {
    setContexto((c) => ({ ...c, empresaId: e.id })); setEmpresaManual(e); escolherTarefa('preparar_reuniao'); setTexto('')
  }
  function mapear(e: Empresa) {
    setContexto((c) => ({ ...c, empresaId: e.id })); setEmpresaManual(e); escolherTarefa('mapear_acesso'); setTexto('')
  }
  async function enviar(e?: FormEvent, contextoPedido = contexto, tarefaPedido = tarefa, textoPedido = texto) {
    e?.preventDefault(); if (enviando || carregando || !podeUsar) return
    const motivo = impedimentoDaTarefa(tarefaPedido, contextoPedido, textoPedido, estado, podeUsar)
    if (motivo) { setErro(motivo); return }
    setEnviando(true); setErro('')
    try {
      let c = ativa
      if (!c) {
        const id = envioPendente.current?.id ?? crypto.randomUUID()
        envioPendente.current = { id, corpo: null }
        const r = await api<{ conversa: Conversa }>('/api/agente/conversas', 'POST', { id, titulo: titulo.trim() || `${ROTULOS[tarefa]} · ${contexto.frente === 'compra' ? 'compra' : 'venda'}`, mandatoId: mandatoId || null, contexto })
        c = r.conversa; setAtiva(c); setTitulo(c.titulo)
        setConversas((cs) => [r.conversa, ...cs.filter((item) => item.id !== r.conversa.id)])
      }
      const candidato = { versao: c.versao, tarefa: tarefaPedido, texto: textoPedido, contexto: contextoPedido }
      const anterior = envioPendente.current?.corpo as (typeof candidato & { chave: string }) | null
      const corpo = anterior && JSON.stringify({ ...anterior, chave: undefined }) === JSON.stringify(candidato)
        ? anterior : { ...candidato, chave: crypto.randomUUID() }
      envioPendente.current = { id: c.id, corpo }
      const r = await api<{ conversa: Conversa; turno: Turno; acoes: Acao[] }>(`/api/agente/conversas/${c.id}/mensagens`, 'POST', corpo)
      setAtiva(r.conversa); setContexto(r.conversa.contexto); setAcoes(r.acoes)
      setTurnos((ts) => [...ts.filter((t) => t.id !== r.turno.id), r.turno].sort((a, b) => a.numero - b.numero))
      setTexto(''); envioPendente.current = null; setAbaTrabalho('resultados')
      setConversas((cs) => [r.conversa, ...cs.filter((item) => item.id !== r.conversa.id)])
      setTimeout(() => ultimaResposta.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }), 50)
    } catch (falha) { falhou(falha) }
    finally { setEnviando(false) }
  }
  /** Tira o trabalho da lista; o servidor guarda o histórico. Devolve se removeu (a falha já aparece aqui). */
  async function excluir(id: string) {
    setErro('')
    try {
      await api<{ excluido: boolean }>(`/api/agente/conversas/${id}`, 'DELETE')
      setConversas((cs) => cs.filter((c) => c.id !== id))
      if (ativa?.id === id) { setAtiva(null); setTurnos([]); setAcoes([]) }
      return true
    } catch (e) { falhou(e); return false }
  }
  async function marcar(a: Acao) {
    if (!ativa || salvandoAcao) return
    setSalvandoAcao(a.id); setErro('')
    try { const r = await api<{ acoes: Acao[] }>(`/api/agente/conversas/${ativa.id}/acoes/${a.id}`, 'PATCH', { concluida: !a.concluida }); setAcoes(r.acoes) }
    catch (e) { falhou(e) }
    finally { setSalvandoAcao('') }
  }
  const empresaEscolhida = empresaManual || turnos.flatMap((t) => t.resultado.empresas).find((e) => e.id === contexto.empresaId)
  const impedimento = impedimentoDaTarefa(tarefa, contexto, texto, estado, podeUsar)
  const bloqueado = enviando || carregando
  const orientacao = orientacoes[tarefa]
  const campoTexto = <label className="block text-sm font-medium">{tarefa === 'interpretar_busca' ? 'Descreva os critérios da pesquisa' : tarefa === 'registrar_passo' ? 'Qual é o próximo passo?' : tarefa === 'conversar' ? 'Como o agente pode ajudar?' : tarefa === 'pesquisar_web' ? 'O que pesquisar?' : 'Objetivo ou observações (opcional)'}
    <textarea id="pedido-agente" className={`${campo} mt-2 min-h-24 resize-y font-normal`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} required={['registrar_passo', 'interpretar_busca', 'conversar', 'pesquisar_web'].includes(tarefa)} disabled={bloqueado} placeholder={tarefa === 'interpretar_busca' ? 'Ex.: Distribuidoras em SP para compra; incluir possíveis.' : tarefa === 'registrar_passo' ? 'Ex.: confirmar a carteira de fornecedores até sexta-feira.' : 'Conte o que você precisa descobrir ou preparar.'} />
    {tarefa === 'buscar_empresas' && <span className="mt-1 block text-xs font-normal text-suave">As observações ficam no histórico. A pesquisa usa os filtros acima.</span>}
  </label>

  if (inicio) return <main className="agente-pagina">
    {erro && <p role="alert" className="mb-5 text-sm text-alerta">{erro} <button className="underline" onClick={() => void carregar()}>Tentar novamente</button></p>}
    {estado ? <InicioAgente usuario={usuario} estado={estado} conversas={conversas} aoComecar={comecar} aoRetomar={(id) => { aoTrabalhar(); void abrir(id) }} aoRede={aoRede} aoAjuda={aoAjuda} aoPesquisar={(tese) => aoPesquisar({ tese })} aoAbrirPesquisa={(id, ateId) => aoPesquisar({ pesquisaId: id, novidadesAte: ateId })} bloqueado={bloqueado} visivel={inicio} aoAbrirCrm={aoAbrirCrm} aoOportunidades={aoOportunidades} aoExpirar={aoExpirar} aoExcluir={excluir} /> : <p role="status">Preparando seu espaço…</p>}
  </main>

  return <main className="agente-pagina space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="agente-sobretitulo">Da pesquisa ao próximo passo</span><h2 className="mt-3 text-2xl font-semibold tracking-tight">{ativa ? ativa.titulo : 'Comece um trabalho'}</h2><p className="mt-2 text-sm text-suave">Escolha uma tarefa. Cada resultado fica salvo para você retomar.</p></div><button className="agente-btn-secundario" onClick={() => comecar('buscar_empresas')} disabled={enviando || !podeUsar}><IconeRede nome="mais" />Novo trabalho</button></div>
    {erro && <p role="alert" className="rounded-ficha border border-alerta-fio bg-alerta-fundo p-4 text-sm">{erro} {!estado && <button className="underline" onClick={() => void carregar()}>Tentar novamente</button>}</p>}
    {carregando && <p role="status" className="text-sm text-suave">Carregando seu trabalho…</p>}
    <div className="agente-trabalho"><div className="min-w-0 space-y-5">
      {estado && <>
        <form ref={compositor} tabIndex={-1} aria-label="Preparar tarefa" onSubmit={enviar} className="agente-compositor space-y-5">
          <label className="block text-xs font-semibold text-suave">O que você quer fazer agora?<select className={`${campo} mt-2 font-medium text-tinta`} aria-label="Tarefa do agente" value={tarefa} onChange={(e) => { setTarefa(e.target.value as Tarefa); envioPendente.current = null }} disabled={bloqueado}>{estado.tarefas.map(t => <option key={t.id} value={t.id}>{ROTULOS[t.id]}</option>)}</select></label>
          <div className="agente-passo-atual"><span><IconeRede nome={tarefa === 'buscar_empresas' ? 'busca' : tarefa === 'mapear_acesso' ? 'rede' : tarefa === 'preparar_reuniao' ? 'agenda' : 'brilho'} /></span><div><h3>{orientacao.titulo}</h3><p>{orientacao.ajuda}</p></div></div>
          {contexto.oportunidadeId && <p className="text-xs text-suave">Este trabalho usa {contexto.documentoIds?.length || 0} documentos de uma oportunidade. <button type="button" className="agente-link" onClick={() => aoAbrirCrm(contexto.oportunidadeId!)} disabled={enviando}>Conferir contexto</button></p>}
          {tarefa === 'buscar_empresas' && <>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">Nome, cidade ou raiz do CNPJ<input className={`${campo} mt-2 font-normal`} value={contexto.busca || ''} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, busca: e.target.value, offset: 0, catalogoHash: undefined })} maxLength={120} disabled={bloqueado} placeholder="Ex.: Adequim ou 12345678" /></label>
              <div className="text-sm font-medium"><span id="rotulo-estados">Estados</span><div className="mt-2" role="group" aria-labelledby="rotulo-estados"><SeletorUfs valor={contexto.uf || ''} desabilitado={bloqueado} aoMudar={(uf) => setContexto({ ...contexto, modeloBusca: null, uf, offset: 0, catalogoHash: undefined })} /></div></div>
              <label className="text-sm font-medium">Município (exato)<input className={`${campo} mt-2 font-normal`} value={contexto.municipio || ''} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, municipio: e.target.value, offset: 0, catalogoHash: undefined })} maxLength={80} disabled={bloqueado} placeholder="Ex.: Campinas" /></label>
              <label className="text-sm font-medium sm:col-span-2">Ordem dos resultados<select className={`${campo} mt-2 font-normal`} value={contexto.ordem || 'enquadramento'} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, ordem: e.target.value as 'enquadramento' | 'prioridade', offset: 0, catalogoHash: undefined })} disabled={bloqueado}><option value="enquadramento">Enquadramento e nome</option><option value="prioridade">Por onde começar: evento recente, relação confirmada, pessoas mapeadas</option></select></label></div>
            <details className="agente-opcoes"><summary>Mais filtros e observações</summary><div className="space-y-4">
              <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={contexto.incluirPossiveis || false} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, incluirPossiveis: e.target.checked, offset: 0, catalogoHash: undefined })} disabled={bloqueado} /><span>Incluir enquadramentos possíveis<span className="mt-1 block text-xs text-suave">Evidência cadastral mais fraca, que exige revisão adicional.</span></span></label>
              <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={contexto.comEvento || false} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, comEvento: e.target.checked, offset: 0, catalogoHash: undefined })} disabled={bloqueado} /><span>Só com evento societário nos últimos 12 meses<span className="mt-1 block text-xs text-suave">Troca de sócios, entrada de sócio estrangeiro, aumento de capital ou filial em nova UF, detectados no CNPJ. É fato do registro, não intenção de vender.</span></span></label>
              <label className="block text-sm">Subsetor<select className={`${campo} mt-1`} value={contexto.subsetor || 'todos'} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, subsetor: e.target.value, offset: 0, catalogoHash: undefined })} disabled={bloqueado}>
                <option value="todos">Todos os setores-alvo</option>
                {SUBSETORES_ALVO.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></label>
              <label className="block text-sm">CNAE principal (opcional, sete dígitos)<input className={`${campo} mt-1`} value={contexto.cnae || ''} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, cnae: e.target.value, offset: 0, catalogoHash: undefined })} pattern="[0-9]{7}|" maxLength={7} disabled={bloqueado} /></label>{campoTexto}
            </div></details>
            {contexto.modeloBusca && <p className="text-xs text-suave">Modelo aplicado · versão {contexto.modeloBusca.versao}. <button type="button" className="agente-link" disabled={bloqueado} onClick={() => setContexto(c => ({ ...c, modeloBusca: null }))}>Usar como pesquisa personalizada</button></p>}
          </>}
          {['preparar_reuniao', 'mapear_acesso'].includes(tarefa) && <EscolherEmpresaAgente empresaId={contexto.empresaId || undefined} nome={empresaEscolhida?.nome} aoEscolher={(e) => { setEmpresaManual(e); setContexto(c => ({ ...c, empresaId: e?.id ?? null })); envioPendente.current = null }} bloqueado={bloqueado} aoFalhar={falhou} />}
          {!['buscar_empresas', 'ver_pendencias', 'mapear_acesso'].includes(tarefa) && campoTexto}
          {tarefa === 'mapear_acesso' && <p className="text-xs leading-relaxed text-suave">Nomes do quadro societário não comprovam relacionamento. A pessoa da GHT4 precisa confirmar cada apresentação.</p>}
          {tarefa === 'interpretar_busca' && <p className="text-xs leading-relaxed text-suave">{estado.iaConfigurada ? 'O pedido e os filtros serão enviados ao provedor de IA. Documentos e histórico ficam fora desta interpretação.' : 'Regras locais disponíveis, sem IA. Você verá o que foi entendido e o que precisa ajustar.'}</p>}
          {tarefa === 'conversar' && estado.iaConfigurada && <p className="text-xs leading-relaxed text-suave">A IA recebe o pedido, a empresa selecionada, os documentos selecionados e as últimas quatro tarefas. Revise as conclusões antes de usá-las.</p>}
          <details className="agente-opcoes"><summary>Organizar trabalho · {contexto.frente === 'compra' ? 'Compra' : 'Venda'} · {mandatos.find(m => m.id === mandatoId)?.rotulo || 'Pessoal'}</summary><div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">Frente<select className={`${campo} mt-1`} value={contexto.frente || 'venda'} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, frente: e.target.value as 'compra' | 'venda' })} disabled={bloqueado}><option value="venda">Venda</option><option value="compra">Compra</option></select></label>
            <label className="text-sm">Espaço<select className={`${campo} mt-1`} value={mandatoId} onChange={(e) => setMandatoId(e.target.value)} disabled={!!ativa || bloqueado}><option value="">Trabalho pessoal</option>{mandatos.map(m => <option key={m.id} value={m.id}>{m.rotulo}</option>)}</select></label>
            <label className="text-sm sm:col-span-2">Nome do trabalho<input className={`${campo} mt-1`} value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={!!ativa || bloqueado} maxLength={120} placeholder="Opcional: damos um nome a partir da primeira tarefa" /></label>
            {ativa && <p className="text-xs text-suave sm:col-span-2">Nome e espaço foram definidos na criação. Para usar outro espaço, comece um novo trabalho.</p>}
          </div></details>
          {impedimento && <p id="motivo-tarefa" className="agente-motivo-bloqueio" role="status">{impedimento}</p>}
          <div className="flex flex-wrap items-center gap-3"><button className="agente-btn-primario" disabled={bloqueado || !!impedimento} aria-describedby={impedimento ? 'motivo-tarefa' : undefined}>{enviando ? 'Preparando e salvando…' : orientacao.acao}<IconeRede nome="seta" /></button><span role="status" className="text-xs text-suave">{enviando ? 'Seu pedido está em andamento.' : 'Salvo automaticamente ao concluir.'}</span></div>
        </form>
        {tarefa === 'buscar_empresas' && <ModelosBusca key={mandatoId || 'casa'} contexto={contexto} mandatoId={mandatoId || null} bloqueado={bloqueado || !podeUsar} podeEditar={podeUsar} aoAplicar={c => { setContexto(c); envioPendente.current = null; setFocoPedido(n => n + 1) }} aoFalhar={falhou} />}
        {ativa && <nav className="agente-secoes" aria-label="Conteúdo do trabalho"><button aria-pressed={abaTrabalho === 'resultados'} onClick={() => setAbaTrabalho('resultados')}>Resultados · {turnos.length}</button><button aria-pressed={abaTrabalho === 'selecao'} onClick={() => setAbaTrabalho('selecao')}>Empresas em análise</button></nav>}
        {ativa && abaTrabalho === 'selecao' && <SelecaoEmpresas key={`${ativa.id}-${versaoSelecao}`} conversaId={ativa.id} versao={ativa.versao} espaco={ativa.mandato_id ? mandatos.find((m) => m.id === ativa.mandato_id)?.rotulo || 'Espaço selecionado' : null} podeEditar={podeUsar && !bloqueado} escolha={revisao} aoEscolher={setRevisao} aoAbrirCrm={aoAbrirCrm} aoExpirar={aoExpirar} />}
        {abaTrabalho === 'resultados' && <section className="space-y-4" aria-label="Resultados do trabalho">{[...turnos].reverse().map((t, i) => {
          const conteudo = <><header className="text-xs font-medium text-comprador">Tarefa {t.numero} · {ROTULOS[t.pedido.tarefa]} · {t.pedido.contexto.frente === 'compra' ? 'Compra' : 'Venda'}</header>
            {t.pedido.texto && <details className="mt-3 text-xs text-suave"><summary>Seu pedido</summary><p className="mt-2 whitespace-pre-wrap">{t.pedido.texto}</p></details>}
            {t.pedido.contexto.pesquisaId && <button className="agente-link mt-3 text-xs" onClick={() => aoPesquisar({ pesquisaId: t.pedido.contexto.pesquisaId })}><IconeRede nome="alvo" />Abrir a pesquisa com as evidências de cada critério</button>}
            <Resposta resultado={t.resultado} aoPreparar={preparar} aoMapear={mapear} aoRevisar={(empresa) => { setRevisao({ empresa, turnoId: t.id, frente: t.pedido.contexto.frente === 'compra' ? 'compra' : 'venda' }); setAbaTrabalho('selecao') }} desabilitado={bloqueado || !podeUsar} />
            {ativa && t.resultado.propostaBusca && <PreviaBusca turno={t} conversa={ativa} contextoAtual={contexto} bloqueado={bloqueado || !podeUsar} aoOcupar={setEnviando} aoFalhar={falhou} aoAplicar={c => { setAtiva(c); setContexto(c.contexto); escolherTarefa('buscar_empresas'); setTexto(''); setConversas(cs => [c, ...cs.filter(x => x.id !== c.id)]) }} />}
            {ativa && !!t.resultado.empresas.length && podeUsar && <LoteDoResultado turno={t} conversaId={ativa.id} desabilitado={bloqueado} aoSalvar={() => setVersaoSelecao((v) => v + 1)} aoFalhar={falhou} />}
            {t.resultado.paginacao?.proximoOffset != null && <button className={`${secundario} mt-4`} disabled={bloqueado || !podeUsar} onClick={() => void enviar(undefined, { ...t.pedido.contexto, offset: t.resultado.paginacao!.proximoOffset!, catalogoHash: t.resultado.catalogoHash }, 'buscar_empresas', '')}>Carregar próximas empresas</button>}
          </>
          return i === 0 ? <div key={t.id} ref={ultimaResposta} className="agente-resultado">{conteudo}</div> : <details key={t.id} className="agente-superficie p-5"><summary className="text-sm font-medium">{t.numero}. {t.resultado.titulo}</summary><div className="mt-4">{conteudo}</div></details>
        })}</section>}
      </>}
    </div><aside className="agente-historico-lateral space-y-5">
      <section aria-label="Trabalhos recentes"><h3 className="mb-3 text-sm font-semibold">Trabalhos recentes</h3>{!conversas.length && <p className="text-xs leading-relaxed text-suave">Seu primeiro resultado aparecerá aqui. Comece com o formulário ao lado.</p>}<ul className="space-y-2">{conversas.map(c => <li key={c.id}><button className={`w-full rounded-ficha p-3 text-left text-xs ${ativa?.id === c.id ? 'bg-comprador-fundo text-comprador' : 'hover:bg-papel-2'}`} onClick={() => void abrir(c.id)} disabled={enviando} aria-current={ativa?.id === c.id ? 'true' : undefined}><span className="block font-medium">{c.titulo}</span><span className="mt-2 block text-[10px] text-suave">{new Date(c.atualizado_em).toLocaleDateString('pt-BR')}</span></button></li>)}</ul></section>
      {!!acoes.length && <section aria-label="Próximos passos"><h3 className="mb-3 text-sm font-semibold">Próximos passos</h3><ul className="space-y-3">{acoes.map(a => <li key={a.id}><label className="flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" className="mt-1 shrink-0" checked={a.concluida} disabled={!podeUsar || Boolean(salvandoAcao) || enviando} onChange={() => void marcar(a)} /><span className={a.concluida ? 'text-suave line-through' : ''}>{a.descricao}</span></label></li>)}</ul></section>}
      <section><h3 className="text-sm font-semibold">Um passo de cada vez</h3><p className="mt-2 text-xs leading-relaxed text-suave">Encontre uma empresa, revise o resultado e escolha entre preparar uma reunião ou explorar as relações.</p><button className="agente-link mt-3 text-xs" onClick={aoAjuda}>Abrir guia de uso<IconeRede nome="seta" /></button></section>
    </aside></div>
  </main>
}
function LoteDoResultado({ turno, conversaId, desabilitado, aoSalvar, aoFalhar }: { turno: Turno; conversaId: string; desabilitado: boolean; aoSalvar: () => void; aoFalhar: (e: unknown) => void }) {
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  async function salvar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return; setOcupado(true)
    try { const r = await api<{ adicionadas: number }>(`/api/agente/conversas/${conversaId}/selecao/lote`, 'POST', { turnoId: turno.id, empresas: turno.resultado.empresas.map((e) => e.id), justificativa: motivo });
      setAviso(`${r.adicionadas} empresas adicionadas. Decisões anteriores foram preservadas.`); aoSalvar() }
    catch (e) { aoFalhar(e) } finally { setOcupado(false) }
  }
  return <details className="mt-4 border-t border-fio pt-3 text-sm"><summary className="cursor-pointer font-medium">Investigar as {turno.resultado.empresas.length} empresas desta página</summary>
    <form className="mt-3 space-y-3" onSubmit={salvar}><label className="block">Motivo da investigação<input className={`${campo} mt-1`} value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} maxLength={2000} /></label>
      <button className={secundario} disabled={desabilitado || ocupado}>{ocupado ? 'Salvando…' : 'Adicionar página à lista de investigação'}</button>{aviso && <p role="status">{aviso}</p>}</form></details>
}

function Resposta({ resultado: r, aoPreparar, aoMapear, aoRevisar, desabilitado }: { resultado: Resultado; aoPreparar: (e: Empresa) => void; aoMapear: (e: Empresa) => void; aoRevisar: (e: Empresa) => void; desabilitado: boolean }) {
  const abrirFicha = useAbrirFicha()
  return <div className="mt-4 space-y-4">
    <div><h3 className="text-lg font-semibold">{r.titulo}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.resumo}</p></div>
    {!!r.empresas.length && <ul>{r.empresas.map((e) => <li key={e.id} className="agente-empresa-resultado">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-[15px] font-semibold leading-snug">{e.nome}</p>
          <span className={`agente-enquadramento ${e.estado === 'possivel' ? 'is-possivel' : e.estado === 'provavel' ? 'is-provavel' : 'is-confirmado'}`}>{e.estado === 'provavel' ? 'Enquadramento provável' : e.estado === 'possivel' ? 'Enquadramento possível' : 'Enquadramento confirmado'}</span></div>
        <p className="agente-empresa-meta"><span><IconeRede nome="local" />{e.cidade} · {e.uf}</span><span>Raiz CNPJ <span className="tabular-nums">{e.cnpjRaiz}</span></span>{e.aderencia !== undefined && <span>Aderência à tese <span className="tabular-nums">{e.aderencia}%</span></span>}</p>
        <SinaisEmpresa empresa={e} />
        <details className="mt-2 text-xs text-suave"><summary className="cursor-pointer">Ver cadastro e evidência</summary><p className="mt-2">{e.razaoSocial}{e.subsetor ? ` · ${e.subsetor}` : ''} · CNAE {e.cnaePrincipal}</p><p className="mt-1">{e.motivo}</p></details></div>
      <div className="agente-empresa-acoes"><button className={secundario} onClick={() => abrirFicha(e.id)}>Ver ficha</button><button className={secundario} onClick={() => aoPreparar(e)} disabled={desabilitado}>Preparar reunião</button>
      <button className={secundario} onClick={() => aoMapear(e)} disabled={desabilitado}>Abrir caminho</button>
      <button className={secundario} onClick={() => aoRevisar(e)} disabled={desabilitado}>Revisar empresa</button></div>
    </li>)}</ul>}
    {r.caminhos && <MapaDeAcessoPainel mapa={r.caminhos} />}
    {r.blocos.map((b) => /antes|restri|limita|alerta|bloque/i.test(b.titulo)
      ? <section key={b.titulo} className="agente-bloco-aviso" aria-label={b.titulo}><IconeRede nome="atencao" /><div><h4>{b.titulo}</h4><ul className="agente-itens">{b.itens.map((s, i) => <li key={i} className="whitespace-pre-wrap">{s}</li>)}</ul></div></section>
      : <details key={b.titulo} className="agente-bloco" open><summary>{b.titulo}<span>{b.itens.length} {b.itens.length === 1 ? 'item' : 'itens'}</span></summary><ul className="agente-itens">{b.itens.map((s, i) => <li key={i} className="whitespace-pre-wrap">{s}</li>)}</ul></details>)}
    {r.complementoIA && <section><h4 className="text-sm font-semibold">Análise de IA para revisão</h4><TextoComFontes texto={r.complementoIA} citacoes={r.citacoesIA || []} />{r.modeloIA && <p className="mt-2 text-xs text-suave">Modelo: {r.modeloIA} · As conclusões exigem revisão humana.</p>}</section>}
    {r.avisoIA && <p className="text-sm text-suave">{r.avisoIA}</p>}
    {!!r.fontes.length && <details className="border-t border-fio pt-3 text-xs text-suave"><summary className="cursor-pointer font-semibold">Fontes e limites desta entrega</summary>{r.fontes.map((f) => <p key={`${f.titulo}-${f.referencia}-${f.url}`} className="mt-2 leading-relaxed">{f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="underline">{f.titulo}</a> : <b>{f.titulo}</b>} · {f.referencia}. {f.descricao}</p>)}</details>}
  </div>
}

/**
 * Cada caminho mostra a conta inteira: a rota de ponta a ponta, o que sustenta
 * cada ligação e o que ainda desmente a confiança nela. Um número solto valeria
 * pouco aqui — quem vai fazer a ligação precisa poder discordar lendo.
 *
 * Caminhos que o titular barrou continuam na lista, apagados e separados. Some-los
 * faria alguém recadastrar a mesma relação semanas depois e bater na mesma porta.
 */
function MapaDeAcessoPainel({ mapa }: { mapa: NonNullable<Resultado['caminhos']> }) {
  if (mapa.restricao?.ativa) return null
  if (!mapa.caminhos.length && !mapa.semCaminho.length) return null
  const uteis = mapa.caminhos.filter((c) => c.recomendavel)
  const barrados = mapa.caminhos.filter((c) => !c.recomendavel)
  return <section aria-label="Caminhos de acesso">
    <h4 className="text-sm font-semibold">Quem alcança quem</h4>
    <ul className="mt-2 space-y-3">
      {[...uteis, ...barrados].map((c) => <li key={c.ligacoes.map((l) => l.id).join('-')}
        className={`rounded-ficha border p-3 ${c.recomendavel ? 'border-fio' : 'border-dashed border-fio opacity-70'}`}>
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-sm font-semibold">{c.rota}</p>
          <span className="rounded-ficha border border-fio-forte px-2 py-0.5 text-xs">{c.categoriaRotulo}</span>
          <span className="text-xs text-suave">{c.alvo.senioridadeRotulo}</span>
          {c.saltos > 1 && <span className="text-xs text-suave">uma ponte no meio</span>}
        </div>
        <p className="mt-2 text-xs text-suave">{c.categoriaDescricao}</p>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
          {c.ligacoes.map((l) => <li key={l.id} className="border-l-2 border-fio pl-3">
            <span className="font-medium">{l.de} → {l.para}</span> · {l.tipoRotulo}, vínculo {l.forcaRotulo.toLowerCase()}
            {l.periodo ? ` (${l.periodo})` : ''} · {l.confirmadoEm
              ? `${l.disposicaoRotulo.toLowerCase()}, registrado por ${l.confirmadoPor ?? 'alguém da casa'} em ${l.confirmadoEm}`
              : l.disposicaoRotulo.toLowerCase()}
            <span className="mt-0.5 block text-xs text-suave">{l.evidencia}</span>
          </li>)}
        </ul>
        <p className="mt-2 text-xs text-suave">
          Ordenação {c.pontuacao} = cargo {c.parcelas.senioridade} + elo mais fraco {c.parcelas.vinculo}
          {' '}+ confirmação {c.parcelas.confirmacao}{c.parcelas.ligacoes ? ` ${c.parcelas.ligacoes} pela ponte` : ''}
        </p>
        {c.alvo.camposOmitidos.length
          ? <p className="mt-1 text-xs text-suave">Contato registrado ({c.alvo.camposOmitidos.join(', ')}), oculto para o seu acesso.</p>
          : [c.alvo.email, c.alvo.telefone, c.alvo.linkedin].filter(Boolean).length
            ? <p className="mt-1 text-xs text-suave">Contato: {[c.alvo.email, c.alvo.telefone, c.alvo.linkedin].filter(Boolean).join(' · ')}</p>
            : null}
        {!!c.ressalvas.length && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-suave">{c.ressalvas.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      </li>)}
      {mapa.semCaminho.map((p) => <li key={p.id} className="rounded-ficha border border-dashed border-fio p-3">
        <p className="text-sm font-semibold">{p.nome}{p.cargo ? ` · ${p.cargo}` : ''}</p>
        <p className="mt-1 text-xs text-suave">{p.senioridadeRotulo} · mapeado, sem ninguém da GHT4 que alcance.</p>
      </li>)}
    </ul>
    <details className="mt-3 text-xs text-suave"><summary className="cursor-pointer">O que esta leitura não alcança</summary>
      <p className="mt-2 leading-relaxed">Consultado: {mapa.cobertura.fontesConectadas.join(', ')}. Sem conexão com: {mapa.cobertura.fontesNaoConectadas.join(', ')}.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">{mapa.limitacoes.map((s, i) => <li key={i} className="leading-relaxed">{s}</li>)}</ul></details>
  </section>
}

function TextoComFontes({ texto, citacoes }: { texto: string; citacoes: NonNullable<Resultado['citacoesIA']> }) {
  let fim = 0
  const partes = citacoes.slice().sort((a,b) => a.inicio - b.inicio).flatMap((c, i) => {
    if (c.inicio < fim || c.fim > texto.length || !/^https?:\/\//.test(c.url)) return []
    const antes = texto.slice(fim, c.inicio); fim = c.fim
    return [<span key={`texto-${i}`}>{antes}</span>, <a key={`fonte-${i}`} href={c.url} title={c.titulo} target="_blank" rel="noreferrer" className="text-comprador underline">{texto.slice(c.inicio,c.fim) || c.titulo}</a>]
  })
  return <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{partes}{texto.slice(fim)}</p>
}
