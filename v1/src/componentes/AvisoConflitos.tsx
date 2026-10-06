import { NOMES_ETAPA, useSituacaoEmpresa } from '../agente/empresa'
import { IconeRede } from './IconeRede'
import { useAbrirFicha } from '../agente/fichaContexto'
import { dataCurta } from '../agente/prospeccao'

/** Avisa, antes de agir, que a casa já trabalha a empresa ou que há "não contatar". Não impede a ação. */
export function AvisoConflitos({ empresaId, ignorar, aoAbrirCrm }: { empresaId: string; ignorar?: string; aoAbrirCrm?: (id: string) => void }) {
  const s = useSituacaoEmpresa(empresaId)
  const abrirFicha = useAbrirFicha()
  if (!s) return null
  const outras = s.oportunidades.filter((o) => o.id !== ignorar)
  if (!outras.length && !s.restricoes.length) return null
  return <section className="agente-aviso-conflito" aria-label="Atenção antes de continuar">
    <IconeRede nome="atencao" />
    <div className="min-w-0 flex-1 space-y-2">
      {!!s.restricoes.length && <div><h4>Não contatar</h4>{s.restricoes.map((r, i) => <p key={i}>{r.espaco ? `Espaço ${r.espaco}` : 'Sua restrição pessoal'} · {r.motivo}</p>)}</div>}
      {!!outras.length && <div><h4>{outras.length === 1 ? 'A casa já tem uma oportunidade com esta empresa' : `A casa já tem ${outras.length} oportunidades com esta empresa`}</h4>
        <ul>{outras.map((o) => <li key={o.id}><span>{o.frente === 'compra' ? 'Compra' : 'Venda'} · {NOMES_ETAPA[o.etapa] || o.etapa} · {o.responsavel_nome}{o.espaco ? ` · ${o.espaco}` : ' · privada'} · próximo passo {dataCurta(o.prazo)}</span>
          {aoAbrirCrm && <button type="button" className="agente-link text-xs" onClick={() => aoAbrirCrm(o.id)}>Abrir<IconeRede nome="seta" /></button>}</li>)}</ul></div>}
      <p className="text-xs text-suave">Mostra só o que você pode acessar. Combine com os responsáveis antes de abordar. <button type="button" className="agente-link" onClick={() => abrirFicha(empresaId)}>Ver ficha da empresa</button></p>
    </div>
  </section>
}
