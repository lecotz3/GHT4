import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { api, ErroApi } from '../agente/api'
import { RotinaOportunidade, PainelComercial } from './RotinaOportunidade'
import { AcervoOportunidade } from './AcervoOportunidade'
import { ExportarEntrega } from './ExportarEntrega'
import { botao, campo, secundario, hojeLocal, dataCurta, type Oportunidade, type Etapa, type FichaOportunidade } from '../agente/prospeccao'

type Lista = { oportunidades: Oportunidade[]; total: number; offset: number; limite: number; hoje: string; etapas: Etapa[] }
type Filtros = { busca: string; frente: string; etapa: string; pendentes: string }
type Envio = { hash: string; chave: string } | null
function comChave<T extends object>(ref: RefObject<Envio>, corpo: T) {
  const hash = JSON.stringify(corpo)
  if (ref.current?.hash !== hash) ref.current = { hash, chave: crypto.randomUUID() }
  return { ...corpo, chave: ref.current!.chave }
}

export function Oportunidades({ inicialId, aoVoltar, aoExpirar, aoAbrirTrabalho }: { inicialId: string | null; aoVoltar: () => void; aoExpirar: () => void; aoAbrirTrabalho: (id:string) => void }) {
  const [id, setId] = useState(inicialId)
  const [lista, setLista] = useState<Lista | null>(null)
  const [ficha, setFicha] = useState<FichaOportunidade | null>(null)
  const [filtros, setFiltros] = useState<Filtros>({ busca: '', frente: '', etapa: '', pendentes: 'todas' })
  const [consulta, setConsulta] = useState(filtros)
  const [offset, setOffset] = useState(0)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const sequencia = useRef(0)
  const falhou = useCallback((e: unknown) => {
    if (e instanceof ErroApi && e.status === 401) aoExpirar()
    else setErro(e instanceof Error ? e.message : 'Não foi possível abrir as oportunidades.')
  }, [aoExpirar])
  const carregar = useCallback(async () => {
    const n = ++sequencia.current
    setCarregando(true); setErro('')
    try {
      if (id) {
        const r = await api<FichaOportunidade>(`/api/crm/oportunidades/${id}`)
        if (n === sequencia.current) setFicha(r)
      } else {
        const q = new URLSearchParams({ offset: String(offset), pendentes: consulta.pendentes })
        for (const chave of ['busca','frente','etapa'] as const) if (consulta[chave]) q.set(chave,consulta[chave])
        const r = await api<Lista>(`/api/crm/oportunidades?${q}`)
        if (n === sequencia.current) setLista(r)
      }
    } catch (e) { if (n === sequencia.current) { setFicha(null); setLista(null); falhou(e) } }
    finally { if (n === sequencia.current) setCarregando(false) }
  }, [id, offset, consulta, falhou])
  const invalidarConsulta = useCallback(() => { sequencia.current++ }, [])
  useEffect(() => { void carregar(); return invalidarConsulta }, [carregar, invalidarConsulta])
  function abrir(proxima: string | null) { setFicha(null); setId(proxima); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function filtrar(e: FormEvent) { e.preventDefault(); setOffset(0); setConsulta({ ...filtros }) }
  const etapaNome = (valor: string) => (ficha?.etapas || lista?.etapas || []).find((e) => e.id === valor)?.nome || valor

  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-7 md:px-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-2xl font-semibold">Oportunidades</h2><p className="mt-1 text-sm text-suave">Da empresa investigada à contratação da GHT4, com próximos passos e histórico.</p></div>
      <div className="flex gap-2">{id && <button className={secundario} onClick={() => abrir(null)}>Todas as oportunidades</button>}<button className={secundario} onClick={aoVoltar}>Voltar ao agente</button></div>
    </div>
    {erro && <p role="alert" className="rounded-ficha border border-alerta-fio bg-alerta-fundo p-4 text-sm">{erro} <button className="underline" onClick={() => void carregar()}>Reabrir registro</button></p>}
    {carregando && <p role="status" className="text-sm text-suave">Carregando oportunidades…</p>}
    {!id && <>
      <PainelComercial aoAbrir={abrir} aoFalhar={falhou} />
      <form onSubmit={filtrar} className="grid items-end gap-3 rounded-ficha border border-fio bg-papel p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">Empresa ou oportunidade<input className={`${campo} mt-1`} value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} maxLength={120} /></label>
        <label className="text-sm">Frente<select className={`${campo} mt-1`} value={filtros.frente} onChange={(e) => setFiltros({ ...filtros, frente: e.target.value })}><option value="">Compra e venda</option><option value="compra">Compra</option><option value="venda">Venda</option></select></label>
        <label className="text-sm">Etapa<select className={`${campo} mt-1`} value={filtros.etapa} onChange={(e) => setFiltros({ ...filtros, etapa: e.target.value })}><option value="">Todas as etapas</option>{lista?.etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
        <label className="text-sm">Próximos passos<select className={`${campo} mt-1`} value={filtros.pendentes} onChange={(e) => setFiltros({ ...filtros, pendentes: e.target.value })}><option value="todas">Todos os registros</option><option value="minhas">Minhas pendências</option><option value="atrasadas">Atrasados</option></select></label>
        <button className={botao} disabled={carregando}>Aplicar filtros</button>
      </form>
      {lista && <>
        <p role="status" className="text-sm text-suave">{lista.total} {lista.total === 1 ? 'oportunidade' : 'oportunidades'} neste recorte{lista.total > 0 ? ` · exibindo ${lista.offset + 1} a ${Math.min(lista.offset + lista.limite,lista.total)}` : ''}. Ordem por prazo.</p>
        {lista.total === 0 && <p className="rounded-ficha border border-fio bg-papel p-6 text-sm">Nenhuma oportunidade neste recorte. Ajuste os filtros para ver outros registros. Para começar uma oportunidade, revise uma empresa no agente, escolha “Priorizar” e depois “Criar oportunidade”.</p>}
        <div className="grid gap-4 md:grid-cols-2">{lista.oportunidades.map((o) => {
          const encerrada = ['mandato_assinado','perdida'].includes(o.etapa)
          const atrasada = !encerrada && !o.acao_concluida && o.prazo < lista.hoje
          return <article key={o.id} className="space-y-3 rounded-ficha border border-fio bg-papel p-5">
            <div><p className="text-xs font-semibold text-comprador">{o.frente === 'compra' ? 'Compra' : 'Venda'} · {etapaNome(o.etapa)}</p><h3 className="mt-1 font-semibold">{o.titulo}</h3><p className="mt-1 text-xs text-suave">{o.empresa.nome} · {o.espaco || 'Privada'}</p></div>
            <p className="whitespace-pre-wrap text-sm">{o.proxima_acao}</p>
            <p className={`text-xs ${atrasada ? 'font-semibold text-alerta' : 'text-suave'}`}>{o.acao_concluida ? 'Ação concluída' : encerrada ? 'Registro encerrado' : atrasada ? 'Prazo vencido' : 'Prazo'} · {dataCurta(o.prazo)} · {o.responsavel_nome}{!o.responsavel_ativo ? ' (acesso suspenso)' : ''}</p>
            <button className={secundario} onClick={() => abrir(o.id)}>Abrir oportunidade</button>
          </article>
        })}</div>
        <div className="flex gap-3"><button className={secundario} disabled={offset === 0 || carregando} onClick={() => setOffset(Math.max(0,offset - 30))}>Página anterior</button><button className={secundario} disabled={offset + lista.limite >= lista.total || carregando} onClick={() => setOffset(offset + 30)}>Próxima página</button></div>
      </>}
    </>}
    {id && ficha && <>
      {ficha.permissoes.editar && <ExportarEntrega origem={{ oportunidadeId:id,versao:ficha.oportunidade.versao }} aoFalhar={falhou} />}
      <section className="space-y-3 rounded-ficha border border-fio bg-papel p-5">
        <p className="text-xs font-semibold text-comprador">{ficha.oportunidade.frente === 'compra' ? 'Compra' : 'Venda'} · {etapaNome(ficha.oportunidade.etapa)}</p>
        <h3 className="text-xl font-semibold">{ficha.oportunidade.titulo}</h3>
        <p className="text-sm">{ficha.oportunidade.empresa.nome} · {ficha.oportunidade.empresa.cidade}/{ficha.oportunidade.empresa.uf} · CNPJ raiz {ficha.oportunidade.empresa.cnpjRaiz}</p>
        <p className="text-xs text-suave">{ficha.oportunidade.espaco ? `Compartilhada no espaço: ${ficha.oportunidade.espaco}` : 'Oportunidade privada'} · Responsável: {ficha.oportunidade.responsavel_nome}</p>
        <details className="text-xs text-suave"><summary className="cursor-pointer">Origem e limites dos dados</summary>{ficha.oportunidade.fontes.map((f,i) => <p key={i} className="mt-2">{f.titulo} · {f.referencia}. {f.descricao}</p>)}<p className="mt-2">A seleção vem de um resultado salvo do agente. O cadastro não demonstra intenção de compra ou venda. As atividades abaixo são registros declarados pela equipe.</p></details>
      </section>
      <RotinaOportunidade key={id} ficha={ficha} aoSalvar={carregar} aoFalhar={falhou} />
      <AcervoOportunidade key={`acervo-${id}`} ficha={ficha} aoFalhar={falhou} aoAbrirTrabalho={aoAbrirTrabalho} aoAbrirOportunidade={abrir} aoAtualizar={carregar} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <EditarOportunidade key={`editar-${id}-${ficha.oportunidade.versao}`} ficha={ficha} aoSalvar={carregar} aoFalhar={falhou} />
        <RegistrarAtividade key={`atividade-${id}-${ficha.oportunidade.versao}`} ficha={ficha} aoSalvar={carregar} aoFalhar={falhou} />
      </div>
      <section className="space-y-3" aria-label="Histórico da oportunidade"><h3 className="text-lg font-semibold">Histórico da oportunidade</h3>
        <p className="text-xs text-suave">Registros informados pela equipe. Referências de proposta e contrato não são verificadas automaticamente. Exibindo até 100 registros recentes.</p>
        {ficha.historico.map((h) => <article key={h.id} className="space-y-2 rounded-ficha border border-fio bg-papel p-4">
          <p className="text-xs text-suave">{dataCurta(h.ocorrido_em)} · {h.autor} · registrado em {new Date(h.criado_em).toLocaleString('pt-BR')}</p>
          <p className="whitespace-pre-wrap text-sm">{h.descricao}</p>
          {h.dados.etapa && <p className="text-xs font-medium">{h.dados.etapaAnterior && h.dados.etapaAnterior !== h.dados.etapa ? `${etapaNome(h.dados.etapaAnterior)} → ` : ''}{etapaNome(h.dados.etapa)}</p>}
          {h.dados.depois && <p className="whitespace-pre-wrap text-xs">Próxima ação: {h.dados.depois.proximaAcao} · {dataCurta(h.dados.depois.prazo)} · {h.dados.depois.acaoConcluida ? 'Concluída' : 'Pendente'}</p>}
          {h.dados.canal && <p className="text-xs">Canal: {h.dados.canal}</p>}{h.dados.participantes && <p className="text-xs">Participantes ou contato: {h.dados.participantes}</p>}
          {h.dados.referencia && <p className="break-words text-xs">Documento ou referência: {h.dados.referencia}</p>}{h.dados.motivo && <p className="text-xs">Motivo: {h.dados.motivo}</p>}
        </article>)}
      </section>
    </>}
  </main>
}

function EditarOportunidade({ ficha, aoSalvar, aoFalhar }: { ficha: FichaOportunidade; aoSalvar: () => Promise<void>; aoFalhar: (e: unknown) => void }) {
  const o = ficha.oportunidade
  const [form, setForm] = useState({ titulo: o.titulo, objetivo: o.objetivo, proximaAcao: o.proxima_acao, prazo: o.prazo, responsavelId: o.responsavel_id, acaoConcluida: o.acao_concluida })
  const [ocupado, setOcupado] = useState(false)
  const envio = useRef<Envio>(null)
  async function salvar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    setOcupado(true)
    try { await api(`/api/crm/oportunidades/${o.id}`, 'PATCH', comChave(envio, { ...form, versao: o.versao })); await aoSalvar() }
    catch (falha) { aoFalhar(falha) }
    finally { setOcupado(false) }
  }
  return <form onSubmit={salvar} className="space-y-4 rounded-ficha border border-fio bg-papel p-5">
    <h3 className="font-semibold">Objetivo e próximo passo</h3>
    <fieldset className="space-y-4" disabled={!ficha.permissoes.editar || ocupado}>
      <label className="block text-sm">Nome da oportunidade<input className={`${campo} mt-1`} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required minLength={3} maxLength={120} /></label>
      <label className="block text-sm">Objetivo comercial<textarea className={`${campo} mt-1 min-h-24`} value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} required minLength={10} maxLength={4000} /></label>
      <label className="block text-sm">Próxima ação<textarea className={`${campo} mt-1 min-h-20`} value={form.proximaAcao} onChange={(e) => setForm({ ...form, proximaAcao: e.target.value, acaoConcluida: false })} required minLength={3} maxLength={2000} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Prazo<input className={`${campo} mt-1`} type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} required /></label>
        <label className="text-sm">Responsável<select className={`${campo} mt-1`} value={form.responsavelId} onChange={(e) => setForm({ ...form, responsavelId: e.target.value })} required>
          {!ficha.responsaveis.some((u) => u.id === o.responsavel_id) && <option value={o.responsavel_id} disabled>{o.responsavel_nome} · acesso indisponível</option>}
          {ficha.responsaveis.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select></label></div>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.acaoConcluida} onChange={(e) => setForm({ ...form, acaoConcluida: e.target.checked })} />Próxima ação concluída</label>
      <button className={botao}>{ocupado ? 'Salvando…' : 'Salvar acompanhamento'}</button>
    </fieldset>
    {!ficha.permissoes.editar && <p className="text-xs text-suave">Seu perfil permite consultar esta oportunidade.</p>}
  </form>
}

function RegistrarAtividade({ ficha, aoSalvar, aoFalhar }: { ficha: FichaOportunidade; aoSalvar: () => Promise<void>; aoFalhar: (e: unknown) => void }) {
  const [form, setForm] = useState({ etapa: '', descricao: '', ocorridoEm: hojeLocal(), canal: '', participantes: '', referencia: '', motivo: '' })
  const [ocupado, setOcupado] = useState(false)
  const envio = useRef<Envio>(null)
  async function salvar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    setOcupado(true)
    try { await api(`/api/crm/oportunidades/${ficha.oportunidade.id}/atividades`, 'POST', comChave(envio, { ...form, etapa: form.etapa || null, versao: ficha.oportunidade.versao })); await aoSalvar() }
    catch (falha) { aoFalhar(falha) }
    finally { setOcupado(false) }
  }
  return <form onSubmit={salvar} className="space-y-4 rounded-ficha border border-fio bg-papel p-5">
    <h3 className="font-semibold">Registrar atividade</h3><p className="text-xs text-suave">Registre o que já aconteceu. Uma reunião agendada ou uma proposta em rascunho ainda não representam avanço concluído.</p>
    <fieldset className="space-y-4" disabled={!ficha.permissoes.editar || ocupado}>
      <label className="block text-sm">Data da atividade<input className={`${campo} mt-1`} type="date" required max={hojeLocal()} value={form.ocorridoEm} onChange={(e) => setForm({ ...form, ocorridoEm: e.target.value })} /></label>
      <label className="block text-sm">O que aconteceu e qual é a evidência?<textarea className={`${campo} mt-1 min-h-24`} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} minLength={10} maxLength={4000} required placeholder="Ex.: conversa realizada, necessidade declarada e decisão sobre o próximo passo." /></label>
      {ficha.permissoes.mover ? <label className="block text-sm">Etapa após esta atividade<select className={`${campo} mt-1`} value={form.etapa} onChange={(e) => setForm({ ...form, etapa: e.target.value })}><option value="">Manter etapa atual</option>{ficha.etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
        : <p className="text-xs text-suave">Você pode registrar atividades. Um sócio ou administrador com permissão neste espaço atualiza a etapa.</p>}
      <label className="block text-sm">Canal {form.etapa === 'contatada' ? '(obrigatório)' : '(opcional)'}<input className={`${campo} mt-1`} value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })} required={form.etapa === 'contatada'} minLength={form.etapa === 'contatada' ? 3 : undefined} maxLength={120} placeholder="Ex.: ligação, reunião, e-mail" /></label>
      <label className="block text-sm">Participantes ou contato<input className={`${campo} mt-1`} value={form.participantes} onChange={(e) => setForm({ ...form, participantes: e.target.value })} required={['qualificada','contatada','conversa_realizada','oportunidade_mandato'].includes(form.etapa)} minLength={['qualificada','contatada','conversa_realizada','oportunidade_mandato'].includes(form.etapa) ? 3 : undefined} maxLength={500} placeholder="Nome e papel na conversa" /></label>
      <label className="block text-sm">Documento ou referência<input className={`${campo} mt-1`} value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} required={['proposta_enviada','mandato_assinado'].includes(form.etapa)} minLength={['proposta_enviada','mandato_assinado'].includes(form.etapa) ? 3 : undefined} maxLength={1000} placeholder="Identifique o documento e sua versão, quando houver" /></label>
      {['nutricao','perdida'].includes(form.etapa) && <label className="block text-sm">Motivo da pausa ou perda<input className={`${campo} mt-1`} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} required minLength={3} maxLength={500} /></label>}
      <button className={botao}>{ocupado ? 'Registrando…' : 'Salvar atividade'}</button>
    </fieldset>
  </form>
}
