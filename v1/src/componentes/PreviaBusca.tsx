import { useRef, useState } from 'react'
import { api, type Conversa, type Turno, type Contexto } from '../agente/api'
const nomes: Record<string, string> = { frente: 'Frente', busca: 'Nome, cidade ou CNPJ', uf: 'Estado', cnae: 'CNAE principal', incluirPossiveis: 'Incluir possíveis' }
const valor = (v: unknown) => typeof v === 'boolean' ? v ? 'Sim' : 'Não' : v ? String(v) : 'Todos / sem filtro'
const filtros = (c: Contexto) => JSON.stringify([c.frente || 'venda', c.busca || '', c.uf || '', c.cnae || '', c.incluirPossiveis || false])
export function PreviaBusca({ turno, conversa, contextoAtual, bloqueado, aoAplicar, aoOcupar, aoFalhar }: { turno: Turno; conversa: Conversa; contextoAtual: Contexto; bloqueado: boolean; aoAplicar: (c: Conversa) => void; aoOcupar: (v: boolean) => void; aoFalhar: (e: unknown) => void }) {
  const [revisado, setRevisado] = useState(false), [ocupado, setOcupado] = useState(false), [aplicada, setAplicada] = useState(false)
  const envio = useRef<{ chave: string; versao: number } | null>(null)
  const p = turno.resultado.propostaBusca
  if (!p) return null
  const mudou = filtros(contextoAtual) !== filtros(p.filtrosAtuais)
  async function aplicar() {
    if (!revisado || ocupado || bloqueado || mudou || !p?.aplicavel) return
    setOcupado(true); aoOcupar(true)
    if (!envio.current || envio.current.versao !== conversa.versao) envio.current = { chave: crypto.randomUUID(), versao: conversa.versao }
    try {
      const r = await api<{ conversa: Conversa }>(`/api/agente/conversas/${conversa.id}/propostas/${turno.id}/aplicar`, 'POST', { ...envio.current, revisado: true })
      aoAplicar(r.conversa); setAplicada(true); setRevisado(false)
    } catch (e) { aoFalhar(e) } finally { setOcupado(false); aoOcupar(false) }
  }
  return <section className="mt-4 space-y-3 rounded-ficha border border-fio bg-papel-2 p-4" aria-label="Prévia de filtros para revisão">
    <p className="text-sm font-semibold">{p.modo === 'ia' ? 'Proposta da IA para revisão' : 'Proposta por regras locais, sem IA'}</p>
    <p className="text-xs text-suave">Somente os cinco filtros abaixo podem ser usados nesta consulta cadastral. Critérios não alterados são preservados. Aplicar a prévia salva os filtros; a pesquisa continua sendo uma ação separada.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Critério</th><th className="p-2">Antes</th><th className="p-2">Proposta</th><th className="p-2">Trecho identificado</th></tr></thead><tbody>{Object.entries(nomes).map(([campo, nome]) => <tr className="border-t border-fio" key={campo}><th className="p-2 font-medium">{nome}</th><td className="p-2">{valor(p.filtrosAtuais[campo as keyof Contexto])}</td><td className="p-2">{valor(p.filtrosPropostos[campo as keyof Contexto])}</td><td className="p-2 text-xs">{p.alteracoes.find(a => a.campo === campo)?.trecho || 'Preservado'}</td></tr>)}</tbody></table></div>
    {!!p.pendencias.length && <div className="rounded-ficha border border-alerta-fio bg-alerta-fundo p-3 text-sm"><p className="font-semibold">Ajuste o pedido antes de aplicar</p><ul className="mt-2 list-disc space-y-1 pl-5">{p.pendencias.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
    {aplicada ? <p className="text-sm" role="status">Filtros salvos no trabalho. Use Encontrar empresas para executar a pesquisa.</p> : mudou ? <p className="text-sm">Os filtros do formulário mudaram desde esta prévia. Prepare outra para preservar suas alterações.</p> : p.aplicavel && <>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={revisado} onChange={e => setRevisado(e.target.checked)} disabled={ocupado || bloqueado} />Conferi a proposta e os critérios que serão usados na pesquisa.</label>
      <button type="button" className="rounded-ficha bg-tinta px-4 py-2 text-sm font-semibold text-papel disabled:opacity-50" disabled={!revisado || ocupado || bloqueado} onClick={() => void aplicar()}>{ocupado ? 'Salvando filtros…' : 'Aplicar filtros revisados'}</button>
    </>}
  </section>
}
