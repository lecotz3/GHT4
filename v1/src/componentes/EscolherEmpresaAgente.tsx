import { useEffect, useRef, useState } from 'react'
import { api, type Empresa } from '../agente/api'
import { IconeRede } from './IconeRede'

export function EscolherEmpresaAgente({ empresaId, nome, aoEscolher, bloqueado, aoFalhar }: { empresaId?: string | null; nome?: string; aoEscolher: (e: Empresa | null) => void; bloqueado: boolean; aoFalhar: (e: unknown) => void }) {
  const [busca, setBusca] = useState(''), [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(false), [consultou, setConsultou] = useState(false)
  const sequencia = useRef(0)
  useEffect(() => { const controle = sequencia; return () => { controle.current++ } }, [])
  async function consultar() {
    if (carregando || bloqueado || busca.trim().length < 2) return
    const n = ++sequencia.current; setCarregando(true); setConsultou(false); setEmpresas([])
    try {
      const r = await api<{ empresas: Empresa[] }>(`/api/agente/empresas?busca=${encodeURIComponent(busca.trim())}&limite=6`)
      if (n === sequencia.current) { setEmpresas(r.empresas); setConsultou(true) }
    } catch (e) { if (n === sequencia.current) aoFalhar(e) } finally { if (n === sequencia.current) setCarregando(false) }
  }
  if (empresaId) return <div className="agente-empresa-escolhida"><IconeRede nome="empresa" /><div><small>Empresa escolhida</small><strong>{nome || empresaId}</strong></div><button type="button" className="agente-link" disabled={bloqueado} onClick={() => { sequencia.current++; setEmpresas([]); setConsultou(false); aoEscolher(null) }}>Trocar</button></div>
  return <section className="agente-escolher-empresa" aria-label="Escolher empresa">
    <label htmlFor="empresa-da-tarefa" className="block text-sm font-semibold">Qual empresa você quer alcançar?</label><p className="mt-1 text-sm text-suave">Busque no catálogo e selecione uma empresa para continuar.</p>
    <div className="mt-3 flex flex-wrap gap-2"><input id="empresa-da-tarefa" className="agente-input min-w-0 flex-1" placeholder="Nome, cidade ou raiz do CNPJ" value={busca} disabled={bloqueado || carregando} maxLength={120} onChange={e => { setBusca(e.target.value); setConsultou(false); setEmpresas([]) }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void consultar() } }} /><button type="button" className="agente-btn-secundario" disabled={bloqueado || carregando || busca.trim().length < 2} onClick={() => void consultar()}>{carregando ? 'Buscando…' : 'Buscar no catálogo'}</button></div>
    <p role="status" className="mt-2 text-xs text-suave">{carregando ? 'Consultando empresas…' : consultou ? empresas.length ? 'Selecione a empresa abaixo.' : 'Nenhuma empresa encontrada. Tente outro nome ou cidade.' : 'Digite pelo menos 2 caracteres.'}</p>
    {!!empresas.length && <ul className="agente-escolhas">{empresas.map(e => <li key={e.id}><button type="button" disabled={bloqueado} onClick={() => { aoEscolher(e); setEmpresas([]) }}><span><strong>{e.nome}</strong><small>{e.cidade} · {e.uf} · CNPJ {e.cnpjRaiz}</small></span><IconeRede nome="mais" /></button></li>)}</ul>}
  </section>
}
