import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ErroApi } from '../agente/api'
import { botao, campo, secundario, hojeLocal, type EscolhaEmpresa, type Selecao, type Oportunidade } from '../agente/prospeccao'

const estados = { investigar: 'Investigar', priorizar: 'Priorizar', descartar: 'Descartar' }
interface Props { conversaId: string; espaco: string | null; podeEditar: boolean; escolha: EscolhaEmpresa | null
  aoEscolher: (e: EscolhaEmpresa | null) => void; aoAbrirCrm: (id: string) => void; aoExpirar: () => void }

export function SelecaoEmpresas({ conversaId, espaco, podeEditar, escolha, aoEscolher, aoAbrirCrm, aoExpirar }: Props) {
  const [selecao, setSelecao] = useState<Selecao[]>([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [criando, setCriando] = useState<Selecao | null>(null)
  const painel = useRef<HTMLElement>(null)
  const falhou = useCallback((e: unknown) => {
    if (e instanceof ErroApi && e.status === 401) aoExpirar()
    else setErro(e instanceof Error ? e.message : 'Não foi possível abrir a seleção.')
  }, [aoExpirar])
  const carregar = useCallback(async () => {
    setCarregando(true)
    try { const r = await api<{ selecao: Selecao[] }>(`/api/agente/conversas/${conversaId}/selecao`); setSelecao(r.selecao); setErro('') }
    catch (e) { falhou(e) }
    finally { setCarregando(false) }
  }, [conversaId, falhou])
  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => { if (escolha || criando) painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [escolha, criando])
  const anterior = selecao.find((s) => s.empresa_id === escolha?.empresa.id && s.frente === escolha.frente)

  return <section ref={painel} className="scroll-mt-5 space-y-4 rounded-ficha border border-fio bg-papel p-5" aria-label="Lista revisada de empresas">
    <div><h3 className="text-lg font-semibold">Sua lista revisada</h3><p className="mt-1 text-sm text-suave">Registre por que investigar, priorizar ou descartar uma empresa. A decisão fica separada para compra e venda.</p></div>
    {erro && <p role="alert" className="text-sm text-alerta">{erro} <button className="underline" onClick={() => void carregar()}>Atualizar seleção</button></p>}
    {aviso && <p role="status" className="text-sm">{aviso}</p>}
    {carregando ? <p role="status" className="text-sm text-suave">Carregando seleção…</p> : <>
      {escolha && podeEditar && <Revisar key={`${escolha.empresa.id}-${escolha.frente}-${anterior?.versao || 0}`} escolha={escolha} anterior={anterior} conversaId={conversaId}
        aoCancelar={() => aoEscolher(null)} aoSalvar={async () => { aoEscolher(null); setAviso('Decisão salva na lista.'); await carregar() }} aoFalhar={falhou} />}
      {criando && <CriarOportunidade key={criando.id} selecao={criando} espaco={espaco} aoCancelar={() => setCriando(null)} aoFalhar={falhou}
        aoCriar={async (id) => { setCriando(null); await carregar(); aoAbrirCrm(id) }} />}
      {selecao.length === 0 && !escolha && <p className="text-sm text-suave">Use “Revisar empresa” em um resultado para começar sua seleção.</p>}
      <ul className="divide-y divide-fio">{selecao.map((s) => <li key={s.id} className="space-y-2 py-4">
        <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold">{s.empresa.nome}</h4><span className="rounded border border-fio px-2 py-0.5 text-xs">{s.frente === 'compra' ? 'Compra' : 'Venda'} · {estados[s.estado]}</span></div>
        <p className="text-xs text-suave">{s.empresa.cidade}/{s.empresa.uf} · CNPJ raiz {s.empresa.cnpjRaiz} · Cadastro {s.empresa.referencia}</p>
        <p className="whitespace-pre-wrap text-sm">{s.justificativa}</p>
        <div className="flex flex-wrap gap-2">
          {podeEditar && <button className={secundario} onClick={() => { setCriando(null); aoEscolher({ empresa: s.empresa, turnoId: s.turno_id, frente: s.frente }) }}>Rever decisão</button>}
          {s.oportunidade_id ? <button className={secundario} onClick={() => aoAbrirCrm(s.oportunidade_id!)}>Abrir oportunidade</button>
            : s.estado === 'priorizar' && podeEditar && <button className={botao} onClick={() => { aoEscolher(null); setCriando(s) }}>Criar oportunidade</button>}
        </div>
      </li>)}</ul>
    </>}
  </section>
}

function Revisar({ escolha, anterior, conversaId, aoCancelar, aoSalvar, aoFalhar }: { escolha: EscolhaEmpresa; anterior?: Selecao; conversaId: string; aoCancelar: () => void; aoSalvar: () => Promise<void>; aoFalhar: (e: unknown) => void }) {
  const [estado, setEstado] = useState<Selecao['estado']>(anterior?.estado || 'investigar')
  const [justificativa, setJustificativa] = useState(anterior?.justificativa || '')
  const [ocupado, setOcupado] = useState(false)
  async function salvar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    setOcupado(true)
    try { await api(`/api/agente/conversas/${conversaId}/selecao/${escolha.empresa.id}`, 'PUT', { turnoId: escolha.turnoId, versao: anterior?.versao || 0, estado, justificativa }); await aoSalvar() }
    catch (falha) { aoFalhar(falha) }
    finally { setOcupado(false) }
  }
  return <form onSubmit={salvar} className="space-y-3 rounded-ficha border border-comprador bg-comprador-fundo p-4">
    <h4 className="font-semibold">Revisar {escolha.empresa.nome} · {escolha.frente === 'compra' ? 'Compra' : 'Venda'}</h4>
    <label className="block text-sm">Decisão<select className={`${campo} mt-1`} value={estado} onChange={(e) => setEstado(e.target.value as Selecao['estado'])}>{Object.entries(estados).map(([id,nome]) => <option value={id} key={id}>{nome}</option>)}</select></label>
    <label className="block text-sm">Motivo da decisão<textarea className={`${campo} mt-1 min-h-20`} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} required minLength={3} maxLength={2000} placeholder="Ex.: atuação geográfica aderente; confirmar fabricantes representados." /></label>
    {anterior?.oportunidade_id && <p className="text-xs text-suave">Esta empresa já tem uma oportunidade. Rever a seleção não altera a etapa no CRM.</p>}
    <div className="flex gap-2"><button className={botao} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar decisão'}</button><button type="button" className={secundario} onClick={aoCancelar} disabled={ocupado}>Cancelar</button></div>
  </form>
}

function CriarOportunidade({ selecao, espaco, aoCancelar, aoCriar, aoFalhar }: { selecao: Selecao; espaco: string | null; aoCancelar: () => void; aoCriar: (id: string) => Promise<void>; aoFalhar: (e: unknown) => void }) {
  const [id] = useState(() => crypto.randomUUID())
  const [titulo, setTitulo] = useState(`${selecao.empresa.nome} · ${selecao.frente === 'compra' ? 'Compra' : 'Venda'}`.slice(0,120))
  const [objetivo, setObjetivo] = useState('')
  const [proximaAcao, setProximaAcao] = useState('')
  const [prazo, setPrazo] = useState(hojeLocal())
  const [ocupado, setOcupado] = useState(false)
  async function criar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    setOcupado(true)
    try { const r = await api<{ oportunidade: Oportunidade }>('/api/crm/oportunidades', 'POST', { id, selecaoId: selecao.id, titulo, objetivo, proximaAcao, prazo }); await aoCriar(r.oportunidade.id) }
    catch (falha) { aoFalhar(falha) }
    finally { setOcupado(false) }
  }
  return <form onSubmit={criar} className="space-y-4 rounded-ficha border border-comprador bg-comprador-fundo p-4">
    <h4 className="font-semibold">Criar oportunidade de {selecao.frente === 'compra' ? 'compra' : 'venda'}</h4>
    <p className="text-sm">{espaco ? `Os dados abaixo e o cadastro de ${selecao.empresa.nome} ficarão disponíveis aos membros autorizados de “${espaco}”.` : 'Esta oportunidade ficará privada, acessível apenas por você.'} As notas do trabalho e da revisão continuam pessoais.</p>
    <label className="block text-sm">Nome da oportunidade<input className={`${campo} mt-1`} value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={3} maxLength={120} /></label>
    <label className="block text-sm">Objetivo comercial<textarea className={`${campo} mt-1 min-h-20`} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} required minLength={10} maxLength={4000} placeholder="Que necessidade de assessoria da GHT4 será investigada?" /></label>
    <label className="block text-sm">Próxima ação<input className={`${campo} mt-1`} value={proximaAcao} onChange={(e) => setProximaAcao(e.target.value)} required minLength={3} maxLength={2000} /></label>
    <label className="block text-sm">Prazo<input className={`${campo} mt-1`} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} required /></label>
    <p className="text-xs text-suave">Você será o responsável inicial. A oportunidade começa como “Identificada”, sem presumir interesse em uma transação.</p>
    <div className="flex gap-2"><button className={botao} disabled={ocupado}>{ocupado ? 'Criando…' : 'Salvar oportunidade'}</button><button type="button" className={secundario} onClick={aoCancelar} disabled={ocupado}>Cancelar</button></div>
  </form>
}
