import { useEffect, useState } from 'react'
import { api } from '../agente/api'
import { dataCurta } from '../agente/prospeccao'
import { NOMES_ETAPA } from '../agente/empresa'
import { IconeRede } from './IconeRede'

interface Inicio {
  hoje: string
  compromissos: { atrasados: number; hoje: number; semana: number; itens: { oportunidade_id: string; titulo: string; descricao: string; prazo: string; tipo: string; empresa: string }[] } | null
  semProximoPasso: { total: number; itens: { id: string; titulo: string; etapa: string; empresa: string }[] } | null
  rede: { naRede: boolean; perguntasPendentes: number; vinculosParaConfirmar: number } | null
}
const TIPOS: Record<string, string> = { pesquisa: 'Pesquisa', contato: 'Contato', reuniao: 'Reunião', documento: 'Documento', interno: 'Tarefa interna' }

/** O que depende de quem está logado hoje. Recarrega sempre que o Início volta a ficar visível. */
export function MeuDia({ visivel, aoAbrirCrm, aoRede, aoOportunidades }: { visivel: boolean; aoAbrirCrm: (id: string) => void; aoRede: () => void; aoOportunidades: () => void }) {
  const [dados, setDados] = useState<Inicio | null>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    if (!visivel) return
    let ativo = true
    api<Inicio>('/api/inicio').then((d) => { if (ativo) { setDados(d); setFalhou(false) } }).catch(() => { if (ativo) setFalhou(true) })
    return () => { ativo = false }
  }, [visivel])
  if (falhou && !dados) return <p className="agente-nota-base">Sua agenda não pôde ser carregada agora. As tarefas abaixo continuam disponíveis.</p>
  if (!dados) return <section className="agente-meu-dia is-carregando" aria-busy="true" aria-label="Meu dia"><div /><div /><div /></section>
  const c = dados.compromissos, s = dados.semProximoPasso, r = dados.rede
  const redePendente = r ? r.perguntasPendentes + r.vinculosParaConfirmar : 0
  const nada = (!c || c.atrasados + c.hoje + c.semana === 0) && !s?.total && !redePendente
  return <section className="agente-meu-dia" aria-labelledby="titulo-meu-dia">
    <div className="agente-linha-titulo"><h3 id="titulo-meu-dia">Meu dia</h3><span>{new Date(`${dados.hoje}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
    {c && <div className="agente-meu-dia-contagens">
      <span className={c.atrasados ? 'is-alerta' : ''}><strong>{c.atrasados}</strong>vencidos</span>
      <span className={c.hoje ? 'is-hoje' : ''}><strong>{c.hoje}</strong>para hoje</span>
      <span><strong>{c.semana}</strong>nos próximos 7 dias</span>
    </div>}
    {nada ? <div className="agente-meu-dia-livre"><IconeRede nome="certo" /><p>Nada pendente com você agora.<span>Comece uma pesquisa acima ou confira a carteira da equipe.</span></p></div> : <div className="agente-meu-dia-grade">
      {!!c?.itens.length && <ul className="agente-meu-dia-lista" aria-label="Seus próximos compromissos">{c.itens.map((i, n) => {
        const quando = i.prazo < dados.hoje ? 'Vencido' : i.prazo === dados.hoje ? 'Hoje' : dataCurta(i.prazo)
        return <li key={`${i.oportunidade_id}-${n}`}><button onClick={() => aoAbrirCrm(i.oportunidade_id)}>
          <span className={`agente-meu-dia-prazo ${i.prazo < dados.hoje ? 'is-alerta' : i.prazo === dados.hoje ? 'is-hoje' : ''}`}>{quando}</span>
          <span className="min-w-0 flex-1"><strong>{i.descricao}</strong><small>{TIPOS[i.tipo] || i.tipo} · {i.empresa}</small></span><IconeRede nome="seta" /></button></li>
      })}</ul>}
      <div className="space-y-3">
        {!!s?.total && <div className="agente-meu-dia-cartao"><h4>{s.total === 1 ? '1 oportunidade precisa de novo próximo passo' : `${s.total} oportunidades precisam de novo próximo passo`}</h4>
          <p>O próximo passo registrado já foi concluído e a oportunidade continua aberta.</p>
          <ul>{s.itens.map((o) => <li key={o.id}><button className="agente-link text-xs" onClick={() => aoAbrirCrm(o.id)}>{o.empresa} · {NOMES_ETAPA[o.etapa] || o.etapa}<IconeRede nome="seta" /></button></li>)}</ul>
          {s.total > s.itens.length && <button className="agente-link mt-2 text-xs" onClick={aoOportunidades}>Ver todas<IconeRede nome="seta" /></button>}</div>}
        {r && redePendente > 0 && <div className="agente-meu-dia-cartao azul"><h4>Sua rede espera por você</h4>
          <p>{[r.perguntasPendentes ? `${r.perguntasPendentes} ${r.perguntasPendentes === 1 ? 'pessoa' : 'pessoas'} para dizer se conhece` : '', r.vinculosParaConfirmar ? `${r.vinculosParaConfirmar} ${r.vinculosParaConfirmar === 1 ? 'relação' : 'relações'} para confirmar` : ''].filter(Boolean).join(' · ')}.</p>
          <button className="agente-link mt-2 text-xs" onClick={aoRede}>Responder agora<IconeRede nome="seta" /></button></div>}
        {r && !r.naRede && <div className="agente-meu-dia-cartao"><h4>Você ainda não está na rede</h4><p>Peça ao administrador para vincular sua conta a uma pessoa da GHT4. Assim seus contatos passam a abrir caminhos.</p></div>}
      </div>
    </div>}
  </section>
}
