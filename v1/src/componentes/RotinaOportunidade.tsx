import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../agente/api'
import { botao, campo, secundario, dataCurta, hojeLocal, type FichaOportunidade } from '../agente/prospeccao'

interface Tarefa { id: string; descricao: string; tipo: string; prazo: string; concluida: boolean; responsavel_id: string; responsavel_nome: string }
interface Restricao { ativa: boolean; categoria: string; motivo: string; versao: number }
interface Rotina { tarefas: Tarefa[]; restricao: Restricao | null }
const categorias: Record<string,string> = { solicitacao_da_empresa: 'Solicitação da empresa', conflito_de_interesse: 'Conflito de interesse', exclusividade: 'Exclusividade', sem_aderencia: 'Sem aderência', outro: 'Outro motivo' }
const tipos: Record<string,string> = { pesquisa: 'Pesquisa', contato: 'Contato', reuniao: 'Reunião', documento: 'Documento', interno: 'Tarefa interna' }

export function RotinaOportunidade({ ficha, aoSalvar, aoFalhar }: { ficha: FichaOportunidade; aoSalvar: () => Promise<void>; aoFalhar: (e: unknown) => void }) {
  const [dados, setDados] = useState<Rotina | null>(null)
  const [form, setForm] = useState({ descricao: '', tipo: 'pesquisa', prazo: hojeLocal(), responsavelId: ficha.oportunidade.responsavel_id })
  const [restricao, setRestricao] = useState({ ativa: true, categoria: 'solicitacao_da_empresa', motivo: '' })
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const envio = useRef<{ hash: string; chave: string; id: string } | null>(null)
  const id = ficha.oportunidade.id, versao = ficha.oportunidade.versao
  useEffect(() => {
    let ativa = true
    api<Rotina>(`/api/crm/oportunidades/${id}/rotina`).then((r) => { if (ativa) { setDados(r); if (r.restricao) setRestricao(r.restricao) } }).catch((e) => { if (ativa) aoFalhar(e) })
    return () => { ativa = false }
  }, [id, versao, aoFalhar])
  async function salvar(tipo: 'tarefa' | 'restricao', tarefa?: Tarefa) {
    if (ocupado || !dados) return; setOcupado(true); setAviso('')
    const corpo = tipo === 'restricao' ? { ativa: restricao.ativa, categoria: restricao.categoria, motivo: restricao.motivo, versaoRestricao: dados.restricao?.versao || 0, versao }
      : tarefa ? { descricao: tarefa.descricao, tipo: tarefa.tipo, prazo: tarefa.prazo, responsavelId: tarefa.responsavel_id, concluida: !tarefa.concluida, versao }
        : { ...form, concluida: false, versao }
    const hash = JSON.stringify({ tipo, tarefa: tarefa?.id || editando, corpo })
    if (envio.current?.hash !== hash) envio.current = { hash, chave: crypto.randomUUID(), id: tarefa?.id || editando || crypto.randomUUID() }
    try {
      await api(`/api/crm/oportunidades/${id}/${tipo === 'restricao' ? 'restricao' : `tarefas/${envio.current.id}`}`, 'PUT', { ...corpo, chave: envio.current.chave })
      if (tipo === 'tarefa' && !tarefa) { setForm({ ...form, descricao: '' }); setEditando(null) }
      envio.current = null; await aoSalvar(); setAviso('Alteração salva no acompanhamento.')
    } catch (e) { aoFalhar(e) } finally { setOcupado(false) }
  }
  return <section className="space-y-5 rounded-ficha border border-fio bg-papel p-5" aria-label="Agenda e restrições">
    <h3 className="text-lg font-semibold">Agenda e restrições de abordagem</h3>
    {dados?.restricao?.ativa && <div role="status" className="rounded-ficha border border-alerta-fio bg-alerta-fundo p-4 text-sm"><b>Não contatar esta empresa neste espaço.</b><p className="mt-1">{categorias[dados.restricao.categoria]}: {dados.restricao.motivo}</p><p className="mt-1 text-xs">Aplica-se às oportunidades de compra e venda da mesma empresa neste espaço. Uma restrição privada vale para os seus registros privados.</p></div>}
    {!dados ? <p role="status" className="text-sm text-suave">Carregando agenda…</p> : <>
      <ul className="divide-y divide-fio">{dados.tarefas.map((t) => <li className="flex gap-3 py-3" key={t.id}><input aria-label={`Concluir ${t.descricao}`} type="checkbox" checked={t.concluida} disabled={ocupado || !ficha.permissoes.editar || (dados.restricao?.ativa && t.tipo === 'contato')} onChange={() => void salvar('tarefa',t)} /><div><p className={`text-sm ${t.concluida ? 'line-through text-suave' : ''}`}>{t.descricao}</p><p className={`mt-1 text-xs ${!t.concluida && t.prazo < hojeLocal() ? 'text-alerta' : 'text-suave'}`}>{dataCurta(t.prazo)} · {t.responsavel_nome} · {tipos[t.tipo]}{dados.restricao?.ativa && t.tipo === 'contato' ? ' · Bloqueada pela restrição' : ''}</p></div></li>)}</ul>
      {ficha.permissoes.editar && dados.tarefas.length > 0 && <label className="block text-sm">Reprogramar uma tarefa existente<select className={`${campo} mt-1`} value={editando || ''} disabled={ocupado} onChange={(e) => {
        const t = dados.tarefas.find((t) => t.id === e.target.value); setEditando(t?.id || null)
        if (t) setForm({ descricao: t.descricao, tipo: t.tipo, prazo: t.prazo, responsavelId: t.responsavel_id })
        else setForm({ descricao: '', tipo: 'pesquisa', prazo: hojeLocal(), responsavelId: ficha.oportunidade.responsavel_id })
      }}><option value="">Adicionar uma nova tarefa</option>{dados.tarefas.map((t) => <option value={t.id} key={t.id}>{t.descricao}</option>)}</select></label>}
      {!dados.tarefas.length && <p className="text-sm text-suave">Adicione os compromissos além do próximo passo principal.</p>}
      {ficha.permissoes.editar && <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); void salvar('tarefa') }}>
        <label className="block text-sm">Nova tarefa<input className={`${campo} mt-1`} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} minLength={3} maxLength={2000} required /></label>
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Tipo<select className={`${campo} mt-1`} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{Object.entries(tipos).map(([k,v]) => <option key={k} value={k} disabled={k === 'contato' && dados.restricao?.ativa}>{v}</option>)}</select></label>
          <label className="text-sm">Prazo<input className={`${campo} mt-1`} type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} required /></label>
          <label className="text-sm">Responsável<select className={`${campo} mt-1`} value={form.responsavelId} onChange={(e) => setForm({ ...form, responsavelId: e.target.value })} required>{ficha.responsaveis.map((r) => <option value={r.id} key={r.id}>{r.nome}</option>)}</select></label></div>
        <button className={botao} disabled={ocupado}>{editando ? 'Salvar tarefa como pendente' : 'Adicionar tarefa'}</button>
      </form>}
      {ficha.permissoes.editar && <details className="border-t border-fio pt-4"><summary className="cursor-pointer text-sm font-medium">Definir ou revisar restrição de contato</summary>
        <form className="mt-4 space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); void salvar('restricao') }}>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={restricao.ativa} disabled={ocupado || !ficha.permissoes.mover} onChange={(e) => setRestricao({ ...restricao, ativa: e.target.checked })} />Não contatar</label>
          <label className="block text-sm">Categoria<select className={`${campo} mt-1`} value={restricao.categoria} onChange={(e) => setRestricao({ ...restricao, categoria: e.target.value })}>{Object.entries(categorias).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block text-sm">Justificativa<textarea className={`${campo} mt-1`} value={restricao.motivo} onChange={(e) => setRestricao({ ...restricao, motivo: e.target.value })} required minLength={10} maxLength={1000} /></label>
          <p className="text-xs text-suave">Um analista pode registrar a restrição. A retirada exige sócio ou administrador com permissão neste espaço.</p>
          <button className={secundario} disabled={ocupado || (!restricao.ativa && !ficha.permissoes.mover)}>Salvar restrição</button>
        </form></details>}
    </>}{aviso && <p role="status" className="text-sm">{aviso}</p>}
  </section>
}

interface Painel { hoje: string; metodologia: string; funil: { frente: string; etapa: string; quantidade: number }[]; pendencias: { oportunidade_id: string; titulo: string; descricao: string; prazo: string; responsavel_nome: string }[] }
export function PainelComercial({ aoAbrir, aoFalhar }: { aoAbrir: (id: string) => void; aoFalhar: (e: unknown) => void }) {
  const [dados, setDados] = useState<Painel | null>(null)
  const [soAtrasadas, setSoAtrasadas] = useState(false)
  const carregar = useCallback(() => { void api<Painel>('/api/crm/painel').then(setDados).catch(aoFalhar) }, [aoFalhar])
  useEffect(carregar, [carregar])
  if (!dados) return null
  return <section className="space-y-3 rounded-ficha border border-fio bg-papel p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Agenda da equipe e carteira atual</h3><button className={secundario} onClick={carregar}>Atualizar agenda</button></div>
    <div className="flex gap-5 text-sm">{['compra','venda'].map((frente) => <p key={frente}><b>{frente === 'compra' ? 'Compra' : 'Venda'}</b>: {dados.funil.filter((f) => f.frente === frente).reduce((s,f) => s + f.quantidade,0)} oportunidades</p>)}</div>
    <p className="text-xs text-suave">{dados.metodologia}</p>
    <details><summary className="cursor-pointer text-sm">Ver compromissos ({dados.pendencias.length})</summary><label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={soAtrasadas} onChange={(e) => setSoAtrasadas(e.target.checked)} />Somente atrasados</label>
      <ul className="mt-3 divide-y divide-fio">{dados.pendencias.filter((p) => !soAtrasadas || p.prazo < dados.hoje).map((p,i) => <li key={`${p.oportunidade_id}-${i}`} className="flex flex-wrap items-center gap-3 py-3 text-sm"><div className="flex-1"><p>{p.descricao}</p><p className={`mt-1 text-xs ${p.prazo < dados.hoje ? 'text-alerta' : 'text-suave'}`}>{dataCurta(p.prazo)} · {p.responsavel_nome} · {p.titulo}</p></div><button className={secundario} onClick={() => aoAbrir(p.oportunidade_id)}>Abrir</button></li>)}</ul>
    </details>
  </section>
}
