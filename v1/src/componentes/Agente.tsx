import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { MarcaGHT4 } from './MarcaGHT4'
import { Equipe } from './Equipe'
import { AceitarConvite } from './AceitarConvite'
import { Oportunidades } from './Oportunidades'
import { SelecaoEmpresas } from './SelecaoEmpresas'
import { ModelosBusca } from './ModelosBusca'
import type { EscolhaEmpresa } from '../agente/prospeccao'
import { api, ErroApi, type Acao, type Contexto, type Conversa, type Empresa, type EstadoAgente, type Resultado, type Tarefa, type Trabalho, type Turno, type Usuario } from '../agente/api'

const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm outline-offset-2 focus:outline-comprador'
const botao = 'rounded-ficha border border-tinta bg-tinta px-4 py-2.5 text-sm font-semibold text-papel transition hover:bg-tinta-2 disabled:cursor-not-allowed disabled:opacity-50'
const secundario = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm font-medium hover:bg-papel-2 disabled:opacity-50'
const ESTADOS = ['', 'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const ROTULOS: Record<Tarefa, string> = { conversar: 'Conversar com o agente', pesquisar_web: 'Pesquisar fontes públicas', buscar_empresas: 'Encontrar empresas', preparar_reuniao: 'Preparar reunião', registrar_passo: 'Registrar próximo passo', ver_pendencias: 'Rever pendências' }
const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir esta ação.'

export function Agente({ aoExplorar, convite, aoLimparConvite }: { aoExplorar: () => void; convite: string | null; aoLimparConvite: () => void }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [fase, setFase] = useState<'carregando' | 'login' | 'configurar' | 'offline'>('carregando')
  const [erro, setErro] = useState('')
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [equipe, setEquipe] = useState(false)
  const [versaoEquipe, setVersaoEquipe] = useState(0)
  const [crm, setCrm] = useState<{ id: string | null } | null>(null)
  const [trabalhoExterno, setTrabalhoExterno] = useState<string | null>(null)
  const conviteInicial = useRef(convite)
  const aoExpirar = useCallback(() => { setUsuario(null); setEquipe(false); setCrm(null); setFase('login'); setErro('Sua sessão expirou. Faça login para retomar seus trabalhos.') }, [])

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
    try { await api('/api/sessao', 'DELETE'); setUsuario(null); setEquipe(false); setCrm(null); setSenha(''); setFase('login') }
    catch (falha) { setErro(mensagem(falha)) }
    finally { setOcupado(false) }
  }

  return <div className="min-h-screen bg-papel-2">
    <header className="flex flex-wrap items-center gap-4 border-b border-fio bg-papel px-5 py-5 md:px-8">
      <MarcaGHT4 />
      <div><p className="text-xs font-semibold text-suave">GHT4 Advisory</p><h1 className="text-xl font-semibold">Agente de M&amp;A</h1></div>
      <div className="ml-auto flex items-center gap-3 text-sm">
        {usuario && !convite && <><span>{usuario.nome}</span>{!equipe && !crm && <button className={secundario} onClick={() => setCrm({ id: null })}>Oportunidades</button>}{usuario.papel === 'admin' && !equipe && !crm && <button className={secundario} onClick={() => setEquipe(true)}>Equipe</button>}<button className={secundario} onClick={() => void sair()} disabled={ocupado}>Sair</button></>}
        {!convite && <button className="text-xs text-suave underline underline-offset-4" onClick={aoExplorar}>Explorar demonstração</button>}
      </div>
    </header>
    {convite ? <AceitarConvite token={convite} aoEntrar={(u) => { setUsuario(u); setEquipe(false); aoLimparConvite() }} aoLogin={() => { aoLimparConvite(); setUsuario(null); setFase('login'); setErro('') }} /> : usuario ? <>
      {erro && <p role="alert" className="mx-5 mt-3 text-sm text-alerta">{erro}</p>}
      {equipe && <Equipe aoExpirar={aoExpirar} aoVoltar={() => { setEquipe(false); setVersaoEquipe((v) => v + 1) }} />}
      {crm && <Oportunidades inicialId={crm.id} aoVoltar={() => setCrm(null)} aoExpirar={aoExpirar} aoAbrirTrabalho={(id) => { setTrabalhoExterno(id); setCrm(null) }} />}
      <div hidden={equipe || Boolean(crm)}><EspacoDoAgente key={usuario.id} usuario={usuario} aoExpirar={aoExpirar} versaoEquipe={versaoEquipe} trabalhoExterno={trabalhoExterno} aoAbrirCrm={(id) => setCrm({ id })} /></div>
    </> : <main className="mx-auto max-w-lg px-5 py-14">
      {fase === 'carregando' ? <p role="status">Abrindo seu espaço de trabalho…</p>
        : fase === 'offline' ? <section className="space-y-5"><h2 className="text-2xl font-semibold">Vamos conectar o agente</h2>
          <p role="alert" className="text-sm text-suave">{erro}</p><p className="text-sm">Abra o iniciador do agente nesta máquina e tente novamente.</p>
          <button className={botao} onClick={() => void iniciar()}>Tentar novamente</button></section>
        : <form onSubmit={entrar} className="space-y-5 rounded-ficha border border-fio bg-papel p-7">
          <div><h2 className="text-2xl font-semibold">{fase === 'configurar' ? 'Configure seu primeiro acesso' : 'Entre para continuar'}</h2>
            <p className="mt-2 text-sm text-suave">{fase === 'configurar' ? 'Crie o administrador deste ambiente. Seus trabalhos serão salvos aqui.' : 'Retome suas pesquisas, reuniões e próximos passos.'}</p></div>
          {fase === 'configurar' && <label className="block text-sm font-medium">Seu nome<input className={`${campo} mt-1`} value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" /></label>}
          <label className="block text-sm font-medium">E-mail<input className={`${campo} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
          <label className="block text-sm font-medium">Senha<input className={`${campo} mt-1`} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={fase === 'configurar' ? 12 : 1} maxLength={256} autoComplete={fase === 'configurar' ? 'new-password' : 'current-password'} />
            {fase === 'configurar' && <span className="mt-1 block text-xs font-normal text-suave">Use pelo menos 12 caracteres.</span>}</label>
          {erro && <p role="alert" className="text-sm text-alerta">{erro}</p>}
          <button className={`${botao} w-full`} disabled={ocupado}>{ocupado ? 'Aguarde…' : fase === 'configurar' ? 'Criar acesso e começar' : 'Entrar'}</button>
        </form>}
    </main>}
  </div>
}

function EspacoDoAgente({ usuario, aoExpirar, versaoEquipe, aoAbrirCrm, trabalhoExterno }: { usuario: Usuario; aoExpirar: () => void; versaoEquipe: number; aoAbrirCrm: (id: string) => void; trabalhoExterno: string | null }) {
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
      setRevisao(null)
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
    setRevisao(null)
  }
  function preparar(e: Empresa) {
    setContexto((c) => ({ ...c, empresaId: e.id })); setTarefa('preparar_reuniao'); setTexto(''); envioPendente.current = null
    document.getElementById('pedido-agente')?.focus()
  }
  async function enviar(e?: FormEvent, contextoPedido = contexto, tarefaPedido = tarefa, textoPedido = texto) {
    e?.preventDefault(); if (enviando || carregando || !podeUsar) return
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
      setTexto(''); envioPendente.current = null
      setConversas((cs) => [r.conversa, ...cs.filter((item) => item.id !== r.conversa.id)])
      setTimeout(() => ultimaResposta.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (falha) { falhou(falha) }
    finally { setEnviando(false) }
  }
  async function marcar(a: Acao) {
    if (!ativa || salvandoAcao) return
    setSalvandoAcao(a.id); setErro('')
    try { const r = await api<{ acoes: Acao[] }>(`/api/agente/conversas/${ativa.id}/acoes/${a.id}`, 'PATCH', { concluida: !a.concluida }); setAcoes(r.acoes) }
    catch (e) { falhou(e) }
    finally { setSalvandoAcao('') }
  }
  const empresaEscolhida = turnos.flatMap((t) => t.resultado.empresas).find((e) => e.id === contexto.empresaId)

  return <main className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 md:grid-cols-[235px_minmax(0,1fr)] md:px-8">
    <aside className="space-y-6">
      <button className={`${botao} w-full`} onClick={novo} disabled={enviando || !podeUsar}>+ Novo trabalho</button>
      <section aria-label="Trabalhos recentes"><h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-suave">Trabalhos recentes</h2>
        {!conversas.length && <p className="text-sm text-suave">Seu primeiro trabalho aparecerá aqui. O histórico fica salvo no servidor.</p>}
        <ul className="space-y-2">{conversas.map((c) => <li key={c.id}><button className={`w-full rounded-ficha border p-3 text-left text-sm ${ativa?.id === c.id ? 'border-comprador bg-comprador-fundo' : 'border-fio bg-papel hover:border-fio-forte'}`} onClick={() => void abrir(c.id)} disabled={enviando}>
          <span className="block font-medium">{c.titulo}</span><span className="mt-1 block text-xs text-suave">{new Date(c.atualizado_em).toLocaleDateString('pt-BR')} · {c.contexto.frente === 'compra' ? 'Compra' : 'Venda'}</span>
        </button></li>)}</ul>
      </section>
      {!!acoes.length && <section aria-label="Próximos passos"><h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-suave">Próximos passos</h2>
        <ul className="space-y-3">{acoes.map((a) => <li key={a.id}><label className="flex gap-2 text-sm"><input type="checkbox" className="mt-1 shrink-0" checked={a.concluida} disabled={!podeUsar || Boolean(salvandoAcao) || enviando} onChange={() => void marcar(a)} />
          <span className={a.concluida ? 'text-suave line-through' : ''}>{a.descricao}</span></label></li>)}</ul>
      </section>}
      <p className="text-xs leading-relaxed text-suave">Seus trabalhos são privados. Quando vinculados a um espaço, também dependem do seu acesso a ele.</p>
    </aside>
    <div className="min-w-0 space-y-5">
      <section><p className="text-xs font-semibold uppercase tracking-wider text-comprador">Distribuição e trading químico</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{ativa ? ativa.titulo : 'O que vamos avançar hoje?'}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-suave">Consulte empresas, prepare reuniões e acompanhe ações no mesmo trabalho.</p>
        {estado && <p className="mt-2 text-xs text-suave">{estado.iaConfigurada ? `IA disponível para revisão${estado.ia ? ` · ${estado.ia.modelo} · até ${estado.ia.pedidosUsuarioDia} pedidos por pessoa/dia` : ''}.` : 'Tarefas assistidas disponíveis. Conversa livre por IA aguarda a configuração do provedor.'}</p>}
      </section>
      {erro && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-ficha border border-alerta-fio bg-alerta-fundo p-4 text-sm"><p className="flex-1">{erro}</p>
        {ativa && <button className={secundario} onClick={() => void abrir(ativa.id)} disabled={enviando}>Reabrir trabalho</button>}
        {!estado && <button className={secundario} onClick={() => void carregar()}>Tentar novamente</button>}</div>}
      {carregando && <p role="status" className="text-sm text-suave">Carregando seus trabalhos…</p>}
      {estado && <>
        {!estado.base.disponivel && <p className="rounded-ficha border border-alerta-fio bg-alerta-fundo p-3 text-sm">{estado.base.mensagem}</p>}
        {!ativa && <div className="grid gap-4 rounded-ficha border border-fio bg-papel p-5 md:grid-cols-2">
          <label className="text-sm font-medium">Nome do trabalho <span className="font-normal text-suave">(opcional)</span><input className={`${campo} mt-1`} maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: distribuidores em São Paulo" disabled={enviando} /></label>
          <label className="text-sm font-medium">Espaço de trabalho<select className={`${campo} mt-1`} value={mandatoId} onChange={(e) => { setMandatoId(e.target.value); setContexto(c => ({ ...c, modeloBusca: null })) }} disabled={enviando}><option value="">Meu trabalho privado</option>{mandatos.map((m) => <option value={m.id} key={m.id}>{m.rotulo}</option>)}</select></label>
        </div>}
        {ativa && <p className="text-xs text-suave">{mandatos.find((m) => m.id === ativa.mandato_id)?.rotulo || 'Meu trabalho privado'} · {turnos.length ? 'Histórico salvo' : 'Trabalho criado'}{ativa.versao > 50 ? ' · Exibindo as últimas 50 tarefas' : ''}</p>}
        {contexto.oportunidadeId && <p className="text-sm">Contexto: oportunidade vinculada · {contexto.documentoIds?.length || 0} documentos selecionados. <button className="text-comprador underline" onClick={() => aoAbrirCrm(contexto.oportunidadeId!)} disabled={enviando}>Conferir documentos e oportunidade</button></p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{estado.tarefas.map((t) => <button key={t.id} className={`rounded-ficha border p-4 text-left transition ${tarefa === t.id ? 'border-comprador bg-comprador-fundo' : 'border-fio bg-papel hover:border-fio-forte'}`} onClick={() => { setTarefa(t.id); envioPendente.current = null }} disabled={enviando || carregando || !podeUsar} aria-pressed={tarefa === t.id}>
          <span className="block text-sm font-semibold">{t.titulo}</span><span className="mt-1 block text-xs leading-relaxed text-suave">{t.descricao}</span></button>)}</div>
        <form onSubmit={enviar} className="space-y-4 rounded-ficha border border-fio bg-papel p-5">
          <div className="flex flex-wrap items-center gap-3"><h3 className="mr-auto font-semibold">{ROTULOS[tarefa]}</h3><label className="flex items-center gap-2 text-sm">Frente<select className="rounded-ficha border border-fio-forte bg-papel px-2 py-1.5" value={contexto.frente || 'venda'} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, frente: e.target.value as 'compra' | 'venda' })} disabled={enviando}><option value="venda">Venda</option><option value="compra">Compra</option></select></label></div>
          {tarefa === 'buscar_empresas' && <>
            <div className="grid gap-3 sm:grid-cols-[1fr_130px]"><label className="text-sm">Nome, cidade ou raiz do CNPJ<input className={`${campo} mt-1`} value={contexto.busca || ''} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, busca: e.target.value, offset: 0, catalogoHash: undefined })} maxLength={120} disabled={enviando} placeholder="Ex.: Campinas" /></label>
              <label className="text-sm">Estado<select className={`${campo} mt-1`} value={contexto.uf || ''} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, uf: e.target.value, offset: 0, catalogoHash: undefined })} disabled={enviando}>{ESTADOS.map((uf) => <option key={uf} value={uf}>{uf || 'Todos'}</option>)}</select></label></div>
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={contexto.incluirPossiveis || false} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, incluirPossiveis: e.target.checked, offset: 0, catalogoHash: undefined })} disabled={enviando} /><span>Incluir enquadramentos possíveis <span className="block text-xs text-suave">Empresas com evidência cadastral mais fraca, que exigem revisão adicional.</span></span></label>
            <label className="block text-sm">CNAE principal <span className="text-suave">(opcional, sete dígitos)</span><input className={`${campo} mt-1`} value={contexto.cnae || ''} onChange={(e) => setContexto({ ...contexto, modeloBusca: null, cnae: e.target.value, offset: 0, catalogoHash: undefined })} pattern="[0-9]{7}|" maxLength={7} disabled={enviando} /></label>
            <p className="text-xs text-suave">Busca no snapshot cadastral de {estado.base.referencia || 'referência indisponível'}. Faturamento e intenção de transação ainda não apurados.</p>
            {contexto.modeloBusca && <p className="text-xs text-suave">Modelo aplicado · versão {contexto.modeloBusca.versao}. A versão será registrada na fonte da pesquisa. <button type="button" className="underline" disabled={enviando} onClick={() => setContexto(c => ({ ...c, modeloBusca: null }))}>Usar estes filtros como pesquisa personalizada</button></p>}
          </>}
          {tarefa === 'preparar_reuniao' && <p className="text-sm">{contexto.empresaId ? `Empresa: ${empresaEscolhida?.nome || contexto.empresaId}` : 'Primeiro encontre uma empresa e selecione “Preparar reunião” no resultado.'}</p>}
          {tarefa === 'preparar_reuniao' && contexto.objetivo && <p className="text-xs leading-relaxed text-suave">Objetivo salvo: {contexto.objetivo}</p>}
          {['conversar','pesquisar_web'].includes(tarefa) && <p className="rounded-ficha bg-papel-2 p-3 text-sm">{!estado.iaConfigurada ? 'A integração está preparada. O administrador precisa configurar provedor, modelo e credencial no servidor para ativar esta tarefa.' : tarefa === 'pesquisar_web' ? estado.ia?.web ? 'Escreva somente informações públicas. Esta consulta será enviada ao serviço de pesquisa; as notas e o histórico do trabalho ficam fora da busca.' : 'A pesquisa web ainda está desabilitada na configuração do servidor.' : 'Seu pedido, a empresa selecionada e as últimas quatro tarefas serão enviados ao provedor. A resposta propõe ações para você revisar.'}</p>}
          {tarefa !== 'ver_pendencias' && <label className="block text-sm">{tarefa === 'registrar_passo' ? 'Qual é o próximo passo?' : tarefa === 'conversar' ? 'Como o agente pode ajudar?' : tarefa === 'pesquisar_web' ? 'O que pesquisar nas fontes públicas?' : 'Objetivo ou observações para este trabalho (opcional)'}
            <textarea id="pedido-agente" className={`${campo} mt-1 min-h-24 resize-y`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} required={tarefa === 'registrar_passo'} disabled={enviando} placeholder={tarefa === 'registrar_passo' ? 'Ex.: confirmar a carteira de fornecedores com o responsável até sexta-feira.' : 'Ex.: entender a atuação em especialidades e preparar uma primeira conversa.'} />
            {tarefa === 'buscar_empresas' && <span className="mt-1 block text-xs text-suave">As observações ficam no histórico. Nesta versão, a busca usa os filtros acima.</span>}
          </label>}
          <div className="flex flex-wrap items-center gap-3"><button className={botao} disabled={enviando || carregando || !podeUsar || (tarefa === 'preparar_reuniao' && !contexto.empresaId) || (['conversar','pesquisar_web'].includes(tarefa) && (!estado.iaConfigurada || texto.trim().length < 10)) || (tarefa === 'pesquisar_web' && !estado.ia?.web)}>{enviando ? 'Preparando e salvando…' : ROTULOS[tarefa]}</button><span role="status" className="text-xs text-suave">{enviando ? 'Seu pedido está em andamento.' : 'O resultado e o contexto serão salvos neste trabalho.'}</span></div>
          {!podeUsar && <p className="text-sm text-suave">Seu acesso permite apenas consulta.</p>}
        </form>
        {tarefa === 'buscar_empresas' && <ModelosBusca key={mandatoId || 'casa'} contexto={contexto} mandatoId={mandatoId || null} bloqueado={enviando || carregando || !podeUsar} podeEditar={podeUsar} aoAplicar={c => { setContexto(c); envioPendente.current = null }} aoFalhar={falhou} />}
        {ativa && <SelecaoEmpresas key={`${ativa.id}-${versaoSelecao}`} conversaId={ativa.id} versao={ativa.versao} espaco={ativa.mandato_id ? mandatos.find((m) => m.id === ativa.mandato_id)?.rotulo || 'Espaço selecionado' : null}
          podeEditar={podeUsar && !enviando && !carregando} escolha={revisao} aoEscolher={setRevisao} aoAbrirCrm={aoAbrirCrm} aoExpirar={aoExpirar} />}
        <section className="space-y-5" aria-label="Histórico do trabalho">{[...turnos].reverse().map((t, i) => <div key={t.id} ref={i === 0 ? ultimaResposta : undefined} className="scroll-mt-5 rounded-ficha border border-fio bg-papel p-5 md:p-6">
          <p className="text-xs font-medium text-suave">Tarefa {t.numero} · {ROTULOS[t.pedido.tarefa]} · {t.pedido.contexto.frente === 'compra' ? 'Compra' : 'Venda'}</p>
          {t.pedido.texto && <p className="mt-2 whitespace-pre-wrap border-l-2 border-fio pl-3 text-sm text-suave">{t.pedido.texto}</p>}
          <Resposta resultado={t.resultado} aoPreparar={preparar} aoRevisar={(empresa) => setRevisao({ empresa, turnoId: t.id, frente: t.pedido.contexto.frente === 'compra' ? 'compra' : 'venda' })} desabilitado={enviando || !podeUsar || carregando} />
          {ativa && !!t.resultado.empresas.length && podeUsar && <LoteDoResultado turno={t} conversaId={ativa.id} desabilitado={enviando || carregando} aoSalvar={() => setVersaoSelecao((v) => v + 1)} aoFalhar={falhou} />}
          {t.resultado.paginacao?.proximoOffset != null && <button className={`${secundario} mt-4`} disabled={enviando || carregando || !podeUsar} onClick={() => void enviar(undefined,
            { ...t.pedido.contexto, offset: t.resultado.paginacao!.proximoOffset!, catalogoHash: t.resultado.catalogoHash }, 'buscar_empresas', '')}>Carregar próximas empresas</button>}
        </div>)}</section>
      </>}
    </div>
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

function Resposta({ resultado: r, aoPreparar, aoRevisar, desabilitado }: { resultado: Resultado; aoPreparar: (e: Empresa) => void; aoRevisar: (e: Empresa) => void; desabilitado: boolean }) {
  return <div className="mt-4 space-y-4">
    <div><h3 className="text-lg font-semibold">{r.titulo}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.resumo}</p></div>
    {!!r.empresas.length && <ul className="divide-y divide-fio rounded-ficha border border-fio">{r.empresas.map((e) => <li key={e.id} className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{e.nome}</p><p className="mt-1 text-xs text-suave">{e.cidade} · {e.uf} · Raiz CNPJ {e.cnpjRaiz}</p>
        <p className="mt-1 text-xs text-suave">{e.estado === 'provavel' ? 'Enquadramento provável' : e.estado === 'possivel' ? 'Enquadramento possível' : 'Enquadramento confirmado'}</p>
        <details className="mt-2 text-xs text-suave"><summary className="cursor-pointer">Ver cadastro e evidência</summary><p className="mt-2">{e.razaoSocial} · CNAE {e.cnaePrincipal}</p><p className="mt-1">{e.motivo}</p></details></div>
      <button className={secundario} onClick={() => aoPreparar(e)} disabled={desabilitado}>Preparar reunião</button>
      <button className={secundario} onClick={() => aoRevisar(e)} disabled={desabilitado}>Revisar empresa</button>
    </li>)}</ul>}
    {r.blocos.map((b) => <section key={b.titulo}><h4 className="text-sm font-semibold">{b.titulo}</h4><ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{b.itens.map((s, i) => <li key={i} className="whitespace-pre-wrap">{s}</li>)}</ul></section>)}
    {r.complementoIA && <section><h4 className="text-sm font-semibold">Análise de IA para revisão</h4><TextoComFontes texto={r.complementoIA} citacoes={r.citacoesIA || []} />{r.modeloIA && <p className="mt-2 text-xs text-suave">Modelo: {r.modeloIA} · As conclusões exigem revisão humana.</p>}</section>}
    {r.avisoIA && <p className="text-sm text-suave">{r.avisoIA}</p>}
    {!!r.fontes.length && <details className="border-t border-fio pt-3 text-xs text-suave"><summary className="cursor-pointer font-semibold">Fontes e limites desta entrega</summary>{r.fontes.map((f) => <p key={`${f.titulo}-${f.referencia}-${f.url}`} className="mt-2 leading-relaxed">{f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="underline">{f.titulo}</a> : <b>{f.titulo}</b>} · {f.referencia}. {f.descricao}</p>)}</details>}
  </div>
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
