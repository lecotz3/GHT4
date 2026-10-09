import { useEffect, useRef, useState } from 'react'
import type { PessoaRede } from '../agente/api'
import { vinculoCnpjApi, raizFormatada, situacaoDasSugestoes, type EmpresaSugerida, type Sugestoes } from '../agente/vinculo-cnpj'

const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm focus:outline-comprador'
const secundario = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm hover:bg-papel-2 disabled:opacity-50'

/**
 * Liga ao CNPJ do catálogo quem a rede só conhece pelo nome da organização. O agente sugere
 * pelo nome escrito; o membro confere cidade e razão social e escolhe — homônimo de empresa
 * existe, então nada é ligado sozinho. Sem o vínculo, a pessoa não aparece em "Encontrar quem
 * decide". A rota muda só o CNPJ: contatos que o papel de quem liga não vê ficam intactos.
 */
export function VincularCnpj({ pessoa, aoLigar, aoFalhar }: {
  pessoa: PessoaRede; aoLigar: (texto: string) => void; aoFalhar: (e: unknown) => void
}) {
  const [busca, setBusca] = useState(pessoa.organizacao)
  const [sugestoes, setSugestoes] = useState<Sugestoes | null>(null)
  const [procurando, setProcurando] = useState(true)
  const [ligando, setLigando] = useState('')
  const pedido = useRef(0)

  async function procurar(texto?: string) {
    const n = ++pedido.current
    setProcurando(true)
    try {
      const r = await vinculoCnpjApi.sugerir(pessoa.id, texto)
      if (n === pedido.current) setSugestoes(r)
    } catch (e) { if (n === pedido.current) aoFalhar(e) } finally { if (n === pedido.current) setProcurando(false) }
  }
  // Abre já com as sugestões pelo nome escrito no cadastro; trocar de pessoa refaz a consulta.
  useEffect(() => { void procurar(); return () => { pedido.current++ } }, [pessoa.id]) // oxlint-disable-line react-hooks/exhaustive-deps

  async function ligar(e: EmpresaSugerida) {
    if (ligando) return
    setLigando(e.id)
    try {
      await vinculoCnpjApi.ligar(pessoa.id, e.id, pessoa.versao ?? 0)
      aoLigar(`Vínculo registrado: ${pessoa.nome} → ${e.nome} (CNPJ ${raizFormatada(e.cnpjRaiz)}). A pessoa agora aparece em Encontrar quem decide.`)
    } catch (erro) { aoFalhar(erro) } finally { setLigando('') }
  }

  return <section className="mt-3 rounded-lg border border-fio bg-papel-2 p-4" aria-label={`Ligar ${pessoa.nome} ao CNPJ`}>
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (busca.trim()) void procurar(busca.trim()) }}>
      <label className="min-w-0 flex-1 text-sm">Nome da empresa ou CNPJ
        <input className={`${campo} mt-1`} value={busca} maxLength={160} onChange={(e) => setBusca(e.target.value)} disabled={Boolean(ligando)} />
      </label>
      <button className={secundario} disabled={procurando || Boolean(ligando) || !busca.trim()}>Procurar</button>
    </form>
    <p role="status" className="mt-3 text-xs leading-relaxed text-suave">{procurando ? 'Procurando no catálogo…' : sugestoes ? situacaoDasSugestoes(sugestoes) : ''}</p>
    {!procurando && sugestoes && sugestoes.empresas.length > 0 && <ul className="mt-2 divide-y divide-fio rounded-lg border border-fio bg-papel">
      {sugestoes.empresas.map((e) => <li key={e.id} className="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{e.nome}</p>
          <p className="mt-0.5 text-xs text-suave">{[e.razaoSocial, `CNPJ ${raizFormatada(e.cnpjRaiz)}`, e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ''}` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <button className={secundario} disabled={Boolean(ligando)} aria-label={`Ligar ${pessoa.nome} a ${e.nome}`} onClick={() => void ligar(e)}>{ligando === e.id ? 'Ligando…' : 'Ligar a esta'}</button>
      </li>)}
    </ul>}
  </section>
}
