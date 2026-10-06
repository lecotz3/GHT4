import type { Etapa, Oportunidade } from '../agente/prospeccao'
import { dataCurta } from '../agente/prospeccao'
import { IconeRede } from './IconeRede'

export type Visao = 'cartoes' | 'lista' | 'quadro'
const FORA = ['nutricao', 'perdida']
const iniciais = (nome: string) => nome.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('')

function situacaoDe(o: Oportunidade, hoje: string) {
  const encerrada = ['mandato_assinado', 'perdida'].includes(o.etapa)
  const atrasada = !encerrada && !o.acao_concluida && o.prazo < hoje
  return o.acao_concluida ? { texto: 'Ação concluída', classe: 'is-ok' } : encerrada ? { texto: 'Encerrada', classe: '' } : atrasada ? { texto: 'Prazo vencido', classe: 'is-alerta' } : { texto: 'No prazo', classe: 'is-ok' }
}

export function SeletorVisao({ visao, aoMudar }: { visao: Visao; aoMudar: (v: Visao) => void }) {
  return <div className="agente-visoes" role="group" aria-label="Forma de exibir">{([['cartoes', 'Cartões'], ['lista', 'Lista'], ['quadro', 'Quadro']] as const).map(([v, nome]) =>
    <button key={v} aria-pressed={visao === v} onClick={() => aoMudar(v)}>{nome}</button>)}</div>
}

export function VisoesOportunidades({ visao, oportunidades, etapas, hoje, total, aoAbrir }: { visao: Visao; oportunidades: Oportunidade[]; etapas: Etapa[]; hoje: string; total: number; aoAbrir: (id: string) => void }) {
  const fluxo = etapas.filter((e) => !FORA.includes(e.id))
  const nome = (id: string) => etapas.find((e) => e.id === id)?.nome || id
  if (visao === 'lista') return <div className="agente-tabela-rolagem"><table className="agente-tabela">
    <caption className="sr-only">Oportunidades desta página</caption>
    <thead><tr><th scope="col">Empresa</th><th scope="col">Frente</th><th scope="col">Etapa</th><th scope="col">Próxima ação</th><th scope="col">Prazo</th><th scope="col">Responsável</th></tr></thead>
    <tbody>{oportunidades.map((o) => { const s = situacaoDe(o, hoje); return <tr key={o.id}>
      <th scope="row"><button className="agente-link text-left" onClick={() => aoAbrir(o.id)}>{o.empresa.nome}</button><small>{o.espaco || 'Privada'}</small></th>
      <td><span className={`agente-etiqueta ${o.frente}`}>{o.frente === 'compra' ? 'Compra' : 'Venda'}</span></td>
      <td>{nome(o.etapa)}</td><td className="agente-tabela-acao">{o.proxima_acao}</td>
      <td><span className={`agente-situacao ${s.classe}`}>{dataCurta(o.prazo)}</span></td><td>{o.responsavel_nome}</td></tr> })}</tbody>
  </table></div>
  if (visao === 'quadro') return <>{total > oportunidades.length && <p className="text-xs text-suave">O quadro mostra as {oportunidades.length} oportunidades desta página, de {total}. Para ver uma etapa inteira, clique nela na carteira acima.</p>}<div className="agente-quadro" aria-label="Oportunidades por etapa">{[...fluxo, ...etapas.filter((e) => FORA.includes(e.id))].map((e) => {
    const daEtapa = oportunidades.filter((o) => o.etapa === e.id)
    return <section key={e.id} className={`agente-quadro-coluna ${FORA.includes(e.id) ? 'is-fora' : ''}`} aria-label={`${e.nome}: ${daEtapa.length}`}>
      <header><span>{e.nome}</span><b>{daEtapa.length}</b></header>
      <ul>{daEtapa.map((o) => { const s = situacaoDe(o, hoje); return <li key={o.id}><button onClick={() => aoAbrir(o.id)}>
        <span className="flex items-center justify-between gap-2"><span className={`agente-etiqueta ${o.frente}`}>{o.frente === 'compra' ? 'Compra' : 'Venda'}</span><span className={`agente-situacao ${s.classe}`}>{dataCurta(o.prazo)}</span></span>
        <strong>{o.empresa.nome}</strong><small>{o.proxima_acao}</small>
        <span className="agente-quadro-resp"><span className="agente-avatar-mini" aria-hidden="true">{iniciais(o.responsavel_nome)}</span>{o.responsavel_nome}</span></button></li> })}</ul>
    </section>
  })}</div></>
  return <div className="grid gap-4 md:grid-cols-2">{oportunidades.map((o) => {
    const posicao = fluxo.findIndex((e) => e.id === o.etapa)
    const s = situacaoDe(o, hoje)
    return <article key={o.id} className="agente-cartao-oportunidade">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className={`agente-etiqueta ${o.frente === 'compra' ? 'compra' : 'venda'}`}>{o.frente === 'compra' ? 'Compra' : 'Venda'}</span><span className={`agente-situacao ${s.classe}`}>{s.texto}</span></div>
      <div><h3 className="text-base font-semibold leading-snug">{o.titulo}</h3><p className="mt-1 text-xs text-suave">{o.empresa.nome} · {o.espaco || 'Privada'}</p></div>
      <div><p className="text-xs font-medium">{nome(o.etapa)}{posicao >= 0 ? <span className="text-suave"> · etapa {posicao + 1} de {fluxo.length}</span> : <span className="text-suave"> · fora do fluxo</span>}</p>
        {posicao >= 0 && <ol className="agente-trilha" aria-hidden="true">{fluxo.map((e, i) => <li key={e.id} className={i < posicao ? 'is-feita' : i === posicao ? 'is-atual' : ''} />)}</ol>}</div>
      <div className="agente-cartao-acao"><span>Próxima ação · {dataCurta(o.prazo)}</span><p className="whitespace-pre-wrap">{o.proxima_acao}</p></div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-fio pt-3"><span className="flex items-center gap-2 text-xs text-suave"><span className="agente-avatar-mini" aria-hidden="true">{iniciais(o.responsavel_nome)}</span>{o.responsavel_nome}{!o.responsavel_ativo ? ' (acesso suspenso)' : ''}</span>
        <button className="agente-link text-xs" onClick={() => aoAbrir(o.id)}>Abrir oportunidade<IconeRede nome="seta" /></button></div>
    </article>
  })}</div>
}
