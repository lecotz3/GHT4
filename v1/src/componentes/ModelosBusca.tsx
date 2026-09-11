import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type Contexto } from '../agente/api'
type Filtros = Required<Pick<Contexto, 'frente' | 'busca' | 'uf' | 'cnae' | 'incluirPossiveis'>>
type Modelo = { id: string; nome: string; mandato_id: string | null; versao_atual: number }
type Versao = { versao: number; conteudo_hash: string; nota: string; configuracao: { buscaAgente?: Filtros } }
type Ficha = { template: Modelo; versoes: Versao[]; versaoAtual: Versao; podeEditar: boolean }
const filtros = (c: Contexto): Filtros => ({ frente: c.frente || 'venda', busca: c.busca || '', uf: c.uf || '', cnae: c.cnae || '', incluirPossiveis: c.incluirPossiveis || false })
const rotulos: Record<keyof Filtros, string> = { frente: 'Frente', busca: 'Nome, cidade ou CNPJ', uf: 'Estado', cnae: 'CNAE principal', incluirPossiveis: 'Incluir possíveis' }
const valor = (v: unknown) => typeof v === 'boolean' ? v ? 'Sim' : 'Não' : v ? String(v) : 'Todos / sem filtro'
const campo = 'mt-1 w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm'
const botao = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm disabled:opacity-50'
export function ModelosBusca({ contexto, mandatoId, bloqueado, podeEditar, aoAplicar, aoFalhar }: { contexto: Contexto; mandatoId: string | null; bloqueado: boolean; podeEditar: boolean; aoAplicar: (c: Contexto) => void; aoFalhar: (e: unknown) => void }) {
  const [modelos, setModelos] = useState<Modelo[]>([]), [id, setId] = useState(''), [ficha, setFicha] = useState<Ficha | null>(null)
  const [nome, setNome] = useState(''), [nota, setNota] = useState(''), [ocupado, setOcupado] = useState(false), [aviso, setAviso] = useState('')
  const [versao, setVersao] = useState(0)
  const pedido = useRef<{ corpo: string; chave: string } | null>(null)
  const carregar = useCallback(async () => { const r = await api<{ templates: Modelo[] }>('/api/templates'); setModelos(r.templates.filter(t => !t.mandato_id || t.mandato_id === mandatoId)) }, [mandatoId])
  useEffect(() => { void carregar().catch(aoFalhar) }, [carregar, aoFalhar])
  useEffect(() => {
    let atual = true
    if (id) void api<Ficha>(`/api/templates/${id}`).then(r => { if (atual) { setFicha(r); setVersao(r.versaoAtual.versao) } }).catch(aoFalhar)
    return () => { atual = false }
  }, [id, aoFalhar])
  async function salvar(e: FormEvent, nova: boolean) {
    e.preventDefault(); if (bloqueado || ocupado) return
    setOcupado(true); setAviso('')
    try {
      const configuracao = { buscaAgente: filtros(contexto) }
      const url = nova ? '/api/templates' : `/api/templates/${id}/versoes`
      const corpo = nova ? { nome, mandatoId, configuracao, nota } : { configuracao, nota, baseVersao: ficha!.versaoAtual.versao }
      const hash = JSON.stringify({ url, corpo })
      if (pedido.current?.corpo !== hash) pedido.current = { corpo: hash, chave: crypto.randomUUID() }
      const r = await api<{ template?: Modelo }>(url, 'POST', corpo, pedido.current.chave)
      const escolhido = r.template?.id || id
      const atual = await api<Ficha>(`/api/templates/${escolhido}`)
      setId(escolhido); setFicha(atual); setVersao(atual.versaoAtual.versao); await carregar(); pedido.current = null; setNota('')
      setAviso('Critérios salvos. Confira a versão e use “Aplicar aos filtros” antes de pesquisar.')
    } catch (e) { aoFalhar(e) } finally { setOcupado(false) }
  }
  const selecionada = ficha?.versoes.find(v => v.versao === versao), criterios = selecionada?.configuracao.buscaAgente
  async function aplicar() {
    if (!criterios || !selecionada || !ficha || bloqueado || ocupado) return
    setOcupado(true)
    try {
      await api(`/api/templates/${ficha.template.id}/versoes/${selecionada.versao}/usar`, 'POST')
      aoAplicar({ ...contexto, ...criterios, empresaId: null, offset: 0, catalogoHash: undefined, modeloBusca: { id: ficha.template.id, versao: selecionada.versao, hash: selecionada.conteudo_hash } })
      setAviso('Filtros aplicados. Confira acima e clique em Encontrar empresas para executar a pesquisa.')
    } catch (e) { aoFalhar(e) } finally { setOcupado(false) }
  }
  return <details className="rounded-ficha border border-fio bg-papel p-5"><summary className="cursor-pointer text-sm font-semibold">Modelos de pesquisa da equipe</summary>
    <div className="mt-4 space-y-4">
      <p className="text-sm text-suave">Reutilize frente, nome/cidade/CNPJ, estado, CNAE e tratamento de enquadramentos possíveis. Observações, documentos e conversas ficam fora do modelo. {mandatoId ? 'Novos modelos ficam neste espaço.' : 'Novos modelos ficam disponíveis para toda a boutique; não inclua termos confidenciais.'}</p>
      {aviso && <p className="text-sm" role="status">{aviso}</p>}
      <label className="block text-sm">Modelo salvo<select className={campo} value={id} disabled={bloqueado || ocupado} onChange={e => { setId(e.target.value); setFicha(null); setAviso('') }}><option value="">Escolher modelo</option>{modelos.map(m => <option value={m.id} key={m.id}>{m.nome} · {m.mandato_id ? 'deste espaço' : 'da boutique'}</option>)}</select></label>
      {ficha && <>
        <label className="block text-sm">Versão para comparar e usar<select className={campo} value={versao} onChange={e => setVersao(Number(e.target.value))} disabled={ocupado || bloqueado}>{ficha.versoes.map(v => <option key={v.versao} value={v.versao}>Versão {v.versao} · {v.nota || 'sem nota'}</option>)}</select></label>
        {criterios ? <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Critério</th><th className="p-2">No formulário</th><th className="p-2">Versão {versao}</th></tr></thead><tbody>{(Object.keys(rotulos) as (keyof Filtros)[]).map(k => <tr key={k} className="border-t border-fio"><th className="p-2 font-medium">{rotulos[k]}</th><td className="p-2">{valor(filtros(contexto)[k])}</td><td className="p-2">{valor(criterios[k])}</td></tr>)}</tbody></table></div><button type="button" className={botao} disabled={ocupado || bloqueado} onClick={() => void aplicar()}>Aplicar aos filtros</button></> : <p className="text-sm">Este modelo pertence à régua de triagem anterior e não contém os filtros do agente. Salve um novo modelo para este fluxo.</p>}
      </>}
      {podeEditar && <form className="space-y-3 border-t border-fio pt-3" onSubmit={e => void salvar(e, true)}>
        <label className="block text-sm">Nome do novo modelo<input className={campo} value={nome} onChange={e => setNome(e.target.value)} minLength={2} maxLength={120} required /></label>
        <label className="block text-sm">Motivo / nota desta versão<input className={campo} value={nota} onChange={e => setNota(e.target.value)} maxLength={500} /></label>
        <div className="flex flex-wrap gap-2"><button className={botao} disabled={bloqueado || ocupado}>Salvar filtros como novo modelo</button>{ficha?.podeEditar && ficha.versaoAtual.configuracao.buscaAgente && <button type="button" className={botao} disabled={bloqueado || ocupado} onClick={e => void salvar(e, false)}>Salvar filtros como próxima versão de {ficha.template.nome}</button>}</div>
      </form>}
    </div>
  </details>
}
