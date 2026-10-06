import type { Empresa } from '../agente/api'
import { mesCurto } from '../agente/empresa'

/**
 * Por que a empresa merece atenção, em selos: eventos no registro público (laranja)
 * e acesso pela rede (azul). Os mesmos critérios da ordem "por onde começar",
 * para que a posição na lista nunca dependa de algo que a tela não mostra.
 */
export function SinaisEmpresa({ empresa, limite = 2 }: { empresa: Pick<Empresa, 'eventos' | 'relacaoConfirmada' | 'pessoasMapeadas'>; limite?: number }) {
  const sinais = (empresa.eventos || []).filter((e) => e.categoria !== 'outro')
  const pessoas = empresa.pessoasMapeadas || 0
  if (!sinais.length && !empresa.relacaoConfirmada && !pessoas) return null
  return <ul className="agente-sinais" aria-label="Sinais desta empresa">
    {sinais.slice(0, limite).map((e, i) => <li key={i} title={`${e.detalhe}. ${e.ambiguidade}`}>{e.rotulo}<span>até {mesCurto(e.ate)}</span></li>)}
    {sinais.length > limite && <li className="is-mais">+{sinais.length - limite}</li>}
    {empresa.relacaoConfirmada && <li className="is-rede" title="Alguém na rede confirmou que conhece ou pode apresentar uma pessoa desta empresa. Veja as ressalvas em “Abrir caminho”.">Relação confirmada na rede</li>}
    {pessoas > 0 && !empresa.relacaoConfirmada && <li className="is-rede is-fraco" title="Pessoas desta empresa cadastradas na rede, ainda sem relação confirmada.">{pessoas} {pessoas === 1 ? 'pessoa mapeada' : 'pessoas mapeadas'}</li>}
  </ul>
}
