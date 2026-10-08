import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ErroApi } from '../agente/api'
import { dataCurta } from '../agente/prospeccao'
import { NOMES_ETAPA } from '../agente/empresa'
import { pesquisaApi } from '../agente/pesquisa'
import { IconeRede } from './IconeRede'

interface Inicio {
  hoje: string
  compromissos: { atrasados: number; hoje: number; semana: number; itens: { oportunidade_id: string; titulo: string; descricao: string; prazo: string; tipo: string; empresa: string }[] } | null
  semProximoPasso: { total: number; itens: { id: string; titulo: string; etapa: string; empresa: string }[] } | null
  rede: { naRede: boolean; perguntasPendentes: number; vinculosParaConfirmar: number } | null
  teses?: { monitoradas: number; itens: { pesquisaId: string; titulo: string; tese: string; novas: number; eventos: number; detectadoEm: string; exemplos: string[]; ateId: number; parcial?: boolean }[] } | null
}
const TIPOS: Record<string, string> = { pesquisa: 'Pesquisa', contato: 'Contato', reuniao: 'Reunião', documento: 'Documento', interno: 'Tarefa interna' }

/** O que depende de quem está logado hoje. Recarrega sempre que o Início volta a ficar visível.
 *  Falha numa recarga não some atrás da consulta anterior: o aviso diz de quando são os dados. */
export function MeuDia({ visivel, aoAbrirCrm, aoRede, aoOportunidades, aoExpirar, aoAbrirPesquisa }: { visivel: boolean; aoAbrirCrm: (id: string) => void; aoRede: () => void; aoOportunidades: () => void; aoExpirar: () => void; aoAbrirPesquisa?: (id: string, ateId?: number) => void }) {
  const [dados, setDados] = useState<Inicio | null>(null)
  const [consultadoEm, setConsultadoEm] = useState<Date | null>(null)
  const [falhou, setFalhou] = useState(false)
  // Recarga em voo: os números na tela são da consulta anterior até a resposta chegar.
  const [atualizando, setAtualizando] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), [])
  // Ref: uma função nova a cada render do pai não pode disparar outra consulta.
  const expirar = useRef(aoExpirar)
  useEffect(() => { expirar.current = aoExpirar }, [aoExpirar])
  useEffect(() => {
    if (!visivel) return
    let ativo = true
    setAtualizando(true)
    api<Inicio>('/api/inicio').then((d) => { if (ativo) { setDados(d); setConsultadoEm(new Date()); setFalhou(false) } })
      .catch((e) => {
        if (!ativo) return
        if (e instanceof ErroApi && e.status === 401) { expirar.current(); return }
        setFalhou(true)
      })
      .finally(() => { if (ativo) setAtualizando(false) })
    return () => { ativo = false }
  }, [visivel, tentativa])
  // Teses monitoradas: a verificação semanal vencida roda aqui, ao abrir o Meu dia; se algo foi
  // verificado, recarrega para mostrar as novidades. Falha aqui não derruba a agenda, mas aparece
  // num aviso próprio: sem ele, "nada pendente" esconderia teses que não foram verificadas.
  const [monitorFalhou, setMonitorFalhou] = useState(false)
  const [tentativaMonitor, setTentativaMonitor] = useState(0)
  useEffect(() => {
    if (!visivel) return
    let ativo = true
    pesquisaApi.verificarMonitoramentos().then((r) => {
      if (!ativo) return
      setMonitorFalhou(r.falhas > 0 && r.verificados === 0)
      if (r.verificados > 0) tentarDeNovo()
    }).catch((e) => {
      if (!ativo) return
      if (e instanceof ErroApi && e.status === 401) { expirar.current(); return }
      setMonitorFalhou(true)
    })
    return () => { ativo = false }
  }, [visivel, tentarDeNovo, tentativaMonitor])
  // As novidades são marcadas como vistas pela tela da pesquisa, depois que ela carrega.
  const abrirTese = (id: string, ateId: number) => aoAbrirPesquisa?.(id, ateId)
  if (falhou && !dados) return <p className="agente-nota-base" role="alert">Sua agenda não pôde ser carregada agora. <button className="agente-link" onClick={tentarDeNovo}>Tentar de novo</button> As tarefas abaixo continuam disponíveis.</p>
  if (!dados) return <section className="agente-meu-dia is-carregando" aria-busy="true" aria-label="Meu dia"><div /><div /><div /></section>
  const aviso = falhou && consultadoEm ? <p className="agente-meu-dia-aviso" role="alert"><IconeRede nome="atencao" /><span>Não foi possível atualizar agora. Os números abaixo são da consulta das {consultadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{consultadoEm.toDateString() !== new Date().toDateString() ? ` de ${consultadoEm.toLocaleDateString('pt-BR')}` : ''} e podem estar desatualizados.</span><button className="agente-link" onClick={tentarDeNovo}>Tentar de novo</button></p> : null
  const c = dados.compromissos, s = dados.semProximoPasso, r = dados.rede
  const redePendente = r ? r.perguntasPendentes + r.vinculosParaConfirmar : 0
  const teses = dados.teses?.itens ?? []
  const avisoMonitor = monitorFalhou && (dados.teses?.monitoradas ?? 0) > 0
    ? <p className="agente-meu-dia-aviso" role="status"><IconeRede nome="atencao" /><span>Não foi possível verificar suas teses monitoradas agora. As novidades abaixo podem estar desatualizadas.</span><button className="agente-link" onClick={() => setTentativaMonitor((n) => n + 1)}>Verificar de novo</button></p> : null
  const nada = (!c || c.atrasados + c.hoje + c.semana === 0) && !s?.total && !redePendente && !teses.length
  // Fora da rede é um cadastro pendente, não ausência de pendências: aparece em qualquer caso.
  const foraDaRede = r && !r.naRede ? <div className="agente-meu-dia-cartao"><h4>Você ainda não está na rede</h4><p>Peça ao administrador para vincular sua conta a uma pessoa da GHT4. Assim seus contatos passam a abrir caminhos.</p></div> : null
  return <section className="agente-meu-dia" aria-labelledby="titulo-meu-dia" aria-busy={atualizando}>
    <div className="agente-linha-titulo"><h3 id="titulo-meu-dia">Meu dia</h3><span>{new Date(`${dados.hoje}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}{atualizando && <span role="status"> · atualizando…</span>}</span></div>
    {aviso}
    {avisoMonitor}
    {c && <div className="agente-meu-dia-contagens">
      <span className={c.atrasados ? 'is-alerta' : ''}><strong>{c.atrasados}</strong>vencidos</span>
      <span className={c.hoje ? 'is-hoje' : ''}><strong>{c.hoje}</strong>para hoje</span>
      <span><strong>{c.semana}</strong>nos próximos 7 dias</span>
    </div>}
    {nada ? <><div className="agente-meu-dia-livre"><IconeRede nome="certo" /><p>{falhou || atualizando ? 'Nada pendente na última consulta.' : 'Nada pendente com você agora.'}<span>Comece uma pesquisa acima ou confira a carteira da equipe.</span></p></div>{foraDaRede}</> : <div className="agente-meu-dia-grade">
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
        {teses.length > 0 && <div className="agente-meu-dia-cartao"><h4>{teses.length === 1 ? 'Novidade numa tese monitorada' : `Novidades em ${teses.length} teses monitoradas`}</h4>
          <ul>{teses.map((x) => <li key={x.pesquisaId}><button className="agente-link text-left text-xs" onClick={() => abrirTese(x.pesquisaId, x.ateId)} disabled={!aoAbrirPesquisa}>
            <span><strong>{x.tese}</strong>{' · '}{[x.novas ? `${x.novas} ${x.novas === 1 ? 'empresa nova' : 'empresas novas'}` : '', x.eventos ? `${x.eventos} com evento societário` : ''].filter(Boolean).join(' · ')}{x.exemplos.length ? ` (${x.exemplos.join(', ')})` : ''}{x.parcial ? ' · verificação parcial do recorte' : ''}</span><IconeRede nome="seta" /></button></li>)}</ul></div>}
        {r && redePendente > 0 && <div className="agente-meu-dia-cartao azul"><h4>Sua rede espera por você</h4>
          <p>{[r.perguntasPendentes ? `${r.perguntasPendentes} ${r.perguntasPendentes === 1 ? 'pessoa' : 'pessoas'} para dizer se conhece` : '', r.vinculosParaConfirmar ? `${r.vinculosParaConfirmar} ${r.vinculosParaConfirmar === 1 ? 'relação' : 'relações'} para confirmar` : ''].filter(Boolean).join(' · ')}.</p>
          <button className="agente-link mt-2 text-xs" onClick={aoRede}>Responder agora<IconeRede nome="seta" /></button></div>}
        {foraDaRede}
      </div>
    </div>}
  </section>
}
