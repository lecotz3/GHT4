import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { api, ErroApi } from '../agente/api'
import { RotinaOportunidade, PainelComercial } from './RotinaOportunidade'
import { AcervoOportunidade } from './AcervoOportunidade'
import { ExportarEntrega } from './ExportarEntrega'
import { IconeRede } from './IconeRede'
import { useAbrirFicha } from '../agente/fichaContexto'
import { SeletorVisao, VisoesOportunidades, type Visao } from './VisoesOportunidades'
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
  const abrirFicha = useAbrirFicha()
  // Preferência do próprio navegador; sem armazenamento disponível, volta aos cartões.
  const [visao, setVisao] = useState<Visao>(() => { try { const v = localStorage.getItem('ght4.visaoOportunidades'); return v === 'lista' || v === 'quadro' ? v : 'cartoes' } catch { return 'cartoes' } })
  const mudarVisao = (v: Visao) => { setVisao(v); try { localStorage.setItem('ght4.visaoOportunidades', v) } catch { /* sem armazenamento local */ } }
  const [abaFicha, setAbaFicha] = useState('acompanhamento')
  const [lista, setLista] = useState<Lista | null>(null)
  const [ficha, setFicha] = useState<FichaOportunidade | null>(null)
  const [filtros, setFiltros] = useState<Filtros>({ busca: '', frente: '', etapa: '', pendentes: 'todas' })
  const [consulta, setConsulta] = useState(filtros)
  const [offset, setOffset] = useState(0)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
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
      return n === sequencia.current
    } catch (e) { if (n === sequencia.current) { setFicha(null); setLista(null); falhou(e) } }
    finally { if (n === sequencia.current) setCarregando(false) }
  }, [id, offset, consulta, falhou])
  const invalidarConsulta = useCallback(() => { sequencia.current++ }, [])
  useEffect(() => { void carregar(); return invalidarConsulta }, [carregar, invalidarConsulta])
  async function salvo() { if (await carregar()) setAviso('Alteração salva. O registro está disponível no Histórico.') }
  function abrir(proxima: string | null) { setFicha(null); setId(proxima); setAviso(''); setAbaFicha('acompanhamento'); window.scrollTo({ top: 0, behavior: 'instant' }) }
  function filtrar(e: FormEvent) { e.preventDefault(); setOffset(0); setConsulta({ ...filtros }) }
  const etapaNome = (valor: string) => (ficha?.etapas || lista?.etapas || []).find((e) => e.id === valor)?.nome || valor

  return <main className="agente-pagina space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><span className="agente-sobretitulo">Conversas que avançam</span><h2 className="mt-3 text-3xl font-semibold tracking-tight">Oportunidades</h2><p className="mt-3 text-sm text-suave">Saiba quem acompanhar, o que fazer e quando dar o próximo passo.</p></div>
      <div className="flex gap-2">{id && <button className={secundario} onClick={() => abrir(null)}>Todas as oportunidades</button>}<button className={secundario} onClick={aoVoltar}>Voltar ao agente</button></div>
    </div>
    {erro && <p role="alert" className="rounded-ficha border border-alerta-fio bg-alerta-fundo p-4 text-sm">{erro} <button className="underline" onClick={() => void carregar()}>Reabrir registro</button></p>}
    {carregando && <p role="status" className="text-sm text-suave">Carregando oportunidades…</p>}
    {aviso && <div className="agente-feedback"><IconeRede nome="certo" /><p role="status">{aviso}</p><button aria-label="Fechar aviso" onClick={() => setAviso('')}><IconeRede nome="fechar" /></button></div>}
    {!id && <>
      <PainelComercial etapas={lista?.etapas ?? []} etapaAtiva={consulta.etapa} aoAbrir={abrir} aoFalhar={falhou}
        aoFiltrarEtapa={(etapa) => { setFiltros({ ...filtros, etapa }); setOffset(0); setConsulta({ ...consulta, etapa }) }} />
      <form onSubmit={filtrar} className="agente-superficie space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1">
        <label className="text-sm">Empresa ou oportunidade<input className={`${campo} mt-1`} value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} maxLength={120} /></label>
        </div><button className={botao} disabled={carregando}>Aplicar filtros</button></div>
        <details className="agente-opcoes"><summary>Filtrar por frente, etapa e prazo{[consulta.frente, consulta.etapa, consulta.pendentes !== 'todas' ? consulta.pendentes : ''].some(Boolean) ? ' · filtros ativos' : ''}</summary><div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Frente<select className={`${campo} mt-1`} value={filtros.frente} onChange={(e) => setFiltros({ ...filtros, frente: e.target.value })}><option value="">Compra e venda</option><option value="compra">Compra</option><option value="venda">Venda</option></select></label>
        <label className="text-sm">Etapa<select className={`${campo} mt-1`} value={filtros.etapa} onChange={(e) => setFiltros({ ...filtros, etapa: e.target.value })}><option value="">Todas as etapas</option>{lista?.etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
        <label className="text-sm">Próximos passos<select className={`${campo} mt-1`} value={filtros.pendentes} onChange={(e) => setFiltros({ ...filtros, pendentes: e.target.value })}><option value="todas">Todos os registros</option><option value="minhas">Minhas pendências</option><option value="atrasadas">Atrasados</option></select></label>
        </div></details>
      </form>
      {lista && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-suave">{lista.total} {lista.total === 1 ? 'oportunidade' : 'oportunidades'} neste recorte{lista.total > 0 ? ` · exibindo ${lista.offset + 1} a ${Math.min(lista.offset + lista.limite,lista.total)}` : ''}. Ordem por prazo.</p>{lista.total > 0 && <SeletorVisao visao={visao} aoMudar={mudarVisao} />}</div>
        {lista.total === 0 && <section className="agente-vazio-generoso agente-superficie"><span className="agente-icone-bloco"><IconeRede nome="empresa" /></span><h3>Nenhuma oportunidade neste recorte</h3><p>Ajuste os filtros ou comece por uma empresa. No resultado da pesquisa, use <strong>Revisar empresa → Priorizar → Criar oportunidade</strong>.</p><button className="agente-btn-primario" onClick={aoVoltar}>Ir ao agente<IconeRede nome="seta" /></button></section>}
        {lista.total > 0 && <VisoesOportunidades visao={visao} oportunidades={lista.oportunidades} etapas={lista.etapas} hoje={lista.hoje} total={lista.total} aoAbrir={abrir} />}
        {lista.total > lista.limite && <div className="flex gap-3"><button className={secundario} disabled={offset === 0 || carregando} onClick={() => setOffset(Math.max(0,offset - 30))}>Página anterior</button><button className={secundario} disabled={offset + lista.limite >= lista.total || carregando} onClick={() => setOffset(offset + 30)}>Próxima página</button></div>}
      </>}
    </>}
    {id && ficha && <>
      <section className="space-y-3 rounded-ficha border border-fio bg-papel p-5">
        <p className="text-xs font-semibold text-comprador">{ficha.oportunidade.frente === 'compra' ? 'Compra' : 'Venda'} · {etapaNome(ficha.oportunidade.etapa)}</p>
        <h3 className="text-xl font-semibold">{ficha.oportunidade.titulo}</h3>
        <p className="text-sm">{ficha.oportunidade.empresa.nome} · {ficha.oportunidade.empresa.cidade}/{ficha.oportunidade.empresa.uf} · CNPJ raiz {ficha.oportunidade.empresa.cnpjRaiz} <button className="agente-link ml-1 text-xs" onClick={() => abrirFicha(ficha.oportunidade.empresa.id)}>Ver ficha da empresa<IconeRede nome="seta" /></button></p>
        <p className="text-xs text-suave">{ficha.oportunidade.espaco ? `Compartilhada no espaço: ${ficha.oportunidade.espaco}` : 'Oportunidade privada'} · Responsável: {ficha.oportunidade.responsavel_nome}</p>
        <div className="agente-proximo-passo"><IconeRede nome="agenda" /><div><span>{ficha.oportunidade.acao_concluida ? 'Próximo passo concluído' : 'Próximo passo'} · {dataCurta(ficha.oportunidade.prazo)}</span><p>{ficha.oportunidade.proxima_acao}</p></div></div>
        <details className="text-sm"><summary>Objetivo desta oportunidade</summary><p className="mt-2 whitespace-pre-wrap leading-relaxed text-suave">{ficha.oportunidade.objetivo}</p></details>
        <details className="text-xs text-suave"><summary className="cursor-pointer">Origem e limites dos dados</summary>{ficha.oportunidade.fontes.map((f,i) => <p key={i} className="mt-2">{f.titulo} · {f.referencia}. {f.descricao}</p>)}<p className="mt-2">A seleção vem de um resultado salvo do agente. O cadastro não demonstra intenção de compra ou venda. As atividades abaixo são registros declarados pela equipe.</p></details>
      </section>
      <nav className="agente-secoes" aria-label="Conteúdo da oportunidade">{[{id:'acompanhamento',nome:'Acompanhamento'},{id:'atividade',nome:'Registrar atividade'},{id:'documentos',nome:'Documentos e entregas'},{id:'historico',nome:'Histórico'}].map(a => <button key={a.id} aria-pressed={abaFicha === a.id} onClick={() => setAbaFicha(a.id)}>{a.nome}</button>)}</nav>
      <div hidden={abaFicha !== 'acompanhamento'} className="space-y-5">
        <RotinaOportunidade key={id} ficha={ficha} aoSalvar={salvo} aoFalhar={falhou} />
        <details className="agente-superficie p-5"><summary className="text-sm font-semibold">Editar objetivo e próximo passo</summary><div className="mt-4"><EditarOportunidade key={`editar-${id}-${ficha.oportunidade.versao}`} ficha={ficha} aoSalvar={salvo} aoFalhar={falhou} /></div></details>
      </div>
      <div hidden={abaFicha !== 'atividade'} className="max-w-3xl">
        <RegistrarAtividade key={`atividade-${id}-${ficha.oportunidade.versao}`} ficha={ficha} aoSalvar={salvo} aoFalhar={falhou} />
      </div>
      {abaFicha === 'documentos' && <div className="space-y-5">{ficha.permissoes.editar && <ExportarEntrega origem={{ oportunidadeId:id,versao:ficha.oportunidade.versao }} aoFalhar={falhou} />}<AcervoOportunidade key={`acervo-${id}`} ficha={ficha} aoFalhar={falhou} aoAbrirTrabalho={aoAbrirTrabalho} aoAbrirOportunidade={abrir} aoAtualizar={salvo} /></div>}
      <section hidden={abaFicha !== 'historico'} className="space-y-3" aria-label="Histórico da oportunidade"><h3 className="text-lg font-semibold">Histórico da oportunidade</h3>
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
