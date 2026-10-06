import { useEffect, useRef } from 'react'

const REGIOES: [string, string[]][] = [
  ['Sudeste', ['ES', 'MG', 'RJ', 'SP']], ['Sul', ['PR', 'RS', 'SC']], ['Centro-Oeste', ['DF', 'GO', 'MS', 'MT']],
  ['Nordeste', ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']], ['Norte', ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO']],
]

/** Várias UFs num campo só. O valor trafega como "PR,SP", o mesmo formato normalizado pelo servidor. */
export function SeletorUfs({ valor, aoMudar, desabilitado }: { valor: string; aoMudar: (v: string) => void; desabilitado?: boolean }) {
  const escolhidas = valor ? valor.split(',') : []
  const caixa = useRef<HTMLDetailsElement>(null)
  // Fecha ao clicar fora, como um menu.
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (caixa.current?.open && !caixa.current.contains(e.target as Node)) caixa.current.open = false }
    document.addEventListener('click', fora); return () => document.removeEventListener('click', fora)
  }, [])
  const definir = (lista: string[]) => aoMudar([...new Set(lista)].sort().join(','))
  const alternar = (uf: string) => definir(escolhidas.includes(uf) ? escolhidas.filter((u) => u !== uf) : [...escolhidas, uf])
  const resumo = !escolhidas.length ? 'Todos os estados' : escolhidas.length <= 4 ? escolhidas.join(', ') : `${escolhidas.length} estados`
  return <details ref={caixa} className="agente-seletor-uf" onKeyDown={(e) => { if (e.key === 'Escape' && caixa.current) { caixa.current.open = false; caixa.current.querySelector('summary')?.focus() } }}>
    <summary aria-disabled={desabilitado} onClick={(e) => { if (desabilitado) e.preventDefault() }}><span>{resumo}</span></summary>
    <fieldset disabled={desabilitado}><legend className="sr-only">Estados da busca</legend>
      {REGIOES.map(([regiao, ufs]) => {
        const todas = ufs.every((u) => escolhidas.includes(u))
        return <div key={regiao} className="agente-seletor-regiao">
          <button type="button" onClick={() => definir(todas ? escolhidas.filter((u) => !ufs.includes(u)) : [...escolhidas, ...ufs])} aria-pressed={todas}>{regiao}</button>
          <div>{ufs.map((uf) => <label key={uf} className={escolhidas.includes(uf) ? 'is-marcada' : ''}><input type="checkbox" checked={escolhidas.includes(uf)} onChange={() => alternar(uf)} />{uf}</label>)}</div>
        </div>
      })}
      <div className="agente-seletor-rodape"><span>{escolhidas.length ? `${escolhidas.length} selecionado${escolhidas.length > 1 ? 's' : ''}` : 'Nenhum filtro de estado'}</span>{!!escolhidas.length && <button type="button" className="agente-link" onClick={() => definir([])}>Limpar</button>}</div>
    </fieldset>
  </details>
}
