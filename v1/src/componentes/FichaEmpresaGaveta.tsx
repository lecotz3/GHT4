import { useEffect, useRef, useState } from 'react'
import { api, ErroApi } from '../agente/api'
import { dataCurta } from '../agente/prospeccao'
import { NOMES_ETAPA, TIPOS_ACERVO, mesCurto, type FichaEmpresa } from '../agente/empresa'
import { IconeRede } from './IconeRede'

const ENQUADRAMENTO: Record<string, string> = { confirmado: 'Enquadramento confirmado', provavel: 'Enquadramento provável', possivel: 'Enquadramento possível' }

/** Ficha única da empresa: cadastro, situação na casa, pessoas, acesso e acervo, só com o que o usuário alcança. */
export function FichaEmpresaGaveta({ empresaId, aoFechar, aoAbrirCrm, podeExportar }: { empresaId: string | null; aoFechar: () => void; aoAbrirCrm: (id: string) => void; podeExportar: boolean }) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const [ficha, setFicha] = useState<FichaEmpresa | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    const d = dialogo.current
    if (!d) return
    if (empresaId && !d.open) d.showModal()
    if (!empresaId && d.open) d.close()
  }, [empresaId])
  useEffect(() => {
    if (!empresaId) return
    let ativo = true
    setFicha(null); setErro('')
    api<FichaEmpresa>(`/api/empresas/${empresaId}/ficha`).then((f) => { if (ativo) setFicha(f) })
      .catch((e) => { if (ativo) setErro(e instanceof ErroApi || e instanceof Error ? e.message : 'Não foi possível abrir a ficha.') })
    return () => { ativo = false }
  }, [empresaId])
  const abrirOportunidade = (id: string) => { aoFechar(); aoAbrirCrm(id) }
  const e = ficha?.empresa
  return <dialog ref={dialogo} className="agente-gaveta" aria-labelledby="titulo-ficha" onClose={aoFechar}
    onClick={(ev) => { if (ev.target === dialogo.current) aoFechar() }}>
    <div className="agente-gaveta-corpo">
      <header className="agente-gaveta-topo">
        <div className="min-w-0"><span className="agente-sobretitulo">Ficha da empresa</span><h2 id="titulo-ficha">{e?.nome ?? (erro ? 'Ficha indisponível' : 'Carregando…')}</h2>
          {e && <p>{e.razaoSocial} · {e.cidade}/{e.uf} · CNPJ raiz <span className="tabular-nums">{e.cnpjRaiz}</span></p>}</div>
        <button className="agente-gaveta-fechar" onClick={aoFechar} aria-label="Fechar ficha"><IconeRede nome="fechar" /></button>
      </header>
      {erro && <p role="alert" className="agente-motivo-bloqueio">{erro}</p>}
      {!ficha && !erro && <div className="agente-gaveta-esqueleto" aria-busy="true"><div /><div /><div /></div>}
      {ficha && e && <div className="agente-gaveta-secoes">
        <section><h3>Cadastro</h3>
          <dl className="agente-dados">
            <div><dt>Enquadramento</dt><dd><span className={`agente-enquadramento is-${e.estado}`}>{ENQUADRAMENTO[e.estado] || e.estado}</span></dd></div>
            <div><dt>CNAE principal</dt><dd className="tabular-nums">{e.cnaePrincipal || 'Não informado'}</dd></div>
            <div><dt>Referência</dt><dd>{e.referencia} · Receita Federal</dd></div>
          </dl>
          {e.motivo && <p className="mt-3 text-xs leading-relaxed text-suave">{e.motivo}</p>}
        </section>
        <section><h3>Sinais no registro público</h3>
          {ficha.eventos.length ? <ul className="agente-eventos">{ficha.eventos.map((ev, i) => <li key={i} className={`is-${ev.categoria}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2"><strong>{ev.rotulo}</strong><span>entre {mesCurto(ev.de)} e {mesCurto(ev.ate)}</span></div>
            <p>{ev.detalhe}</p><p className="agente-eventos-ressalva"><b>Atenção:</b> {ev.ambiguidade}</p></li>)}</ul>
            : <p className="agente-gaveta-vazio">Nenhum evento societário detectado nos meses comparados do CNPJ.</p>}
          {!!ficha.eventos.length && <p className="mt-2 text-xs text-suave">{ficha.eventos[0].fonte}. O registro mostra o fato, não a intenção.</p>}
        </section>
        {ficha.situacao && <section><h3>Na casa</h3>
          {!ficha.situacao.oportunidades.length && !ficha.situacao.restricoes.length && <p className="agente-gaveta-vazio">Nenhuma oportunidade ou restrição que você possa ver.</p>}
          {ficha.situacao.restricoes.map((r, i) => <p key={i} className="agente-aviso-conflito"><IconeRede nome="atencao" /><span><b>Não contatar</b> · {r.espaco ? `Espaço ${r.espaco}` : 'restrição pessoal'} · {r.motivo}</span></p>)}
          <ul className="agente-gaveta-lista">{ficha.situacao.oportunidades.map((o) => <li key={o.id}><button onClick={() => abrirOportunidade(o.id)}>
            <span className={`agente-etiqueta ${o.frente}`}>{o.frente === 'compra' ? 'Compra' : 'Venda'}</span>
            <span className="min-w-0 flex-1"><strong>{NOMES_ETAPA[o.etapa] || o.etapa}</strong><small>{o.responsavel_nome} · {o.espaco || 'privada'} · próximo passo {dataCurta(o.prazo)}</small></span><IconeRede nome="seta" /></button></li>)}</ul>
        </section>}
        {ficha.acesso && <section><h3>Acesso pela rede</h3>
          {ficha.acesso.melhor ? <div className="agente-cartao-acao"><span>{ficha.acesso.melhor.categoria} · {ficha.acesso.melhor.saltos === 1 ? 'direto' : `${ficha.acesso.melhor.saltos} saltos`}</span><p>{ficha.acesso.melhor.de} → {ficha.acesso.melhor.ate}{ficha.acesso.melhor.cargo ? `, ${ficha.acesso.melhor.cargo}` : ''}</p></div>
            : <p className="agente-gaveta-vazio">{ficha.acesso.descartados ? 'Há caminhos registrados, mas o titular não quer intermediar ou a informação está desatualizada.' : 'Nenhum caminho utilizável hoje.'}</p>}
          <p className="mt-2 text-xs text-suave">{ficha.acesso.utilizaveis} {ficha.acesso.utilizaveis === 1 ? 'caminho utilizável' : 'caminhos utilizáveis'} · {ficha.acesso.pessoasConhecidas} {ficha.acesso.pessoasConhecidas === 1 ? 'pessoa mapeada' : 'pessoas mapeadas'}, {ficha.acesso.lideresConhecidos} na liderança. Use “Abrir caminho” no agente para ver as ressalvas de cada elo.</p>
        </section>}
        {ficha.pessoas && <section><h3>Pessoas da empresa</h3>
          {ficha.pessoas.length ? <ul className="agente-gaveta-pessoas">{ficha.pessoas.map((p) => <li key={p.id}><span className="agente-avatar-mini" aria-hidden="true">{p.nome.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('')}</span><span><strong>{p.nome}</strong><small>{[p.cargo, p.senioridade].filter(Boolean).join(' · ')}</small></span></li>)}</ul>
            : <p className="agente-gaveta-vazio">Ninguém desta empresa cadastrado na rede.</p>}
        </section>}
        {ficha.acervo && <section><h3>Acervo</h3>
          {!ficha.acervo.registros.length && !ficha.acervo.documentos.length ? <p className="agente-gaveta-vazio">Sem teses, evidências, comparáveis, notícias ou documentos acessíveis.</p> : <>
            <ul className="agente-gaveta-lista">{ficha.acervo.registros.map((r, i) => <li key={i}><button onClick={() => abrirOportunidade(r.oportunidadeId)}>
              <span className="agente-etiqueta">{TIPOS_ACERVO[r.tipo] || r.tipo}</span>
              <span className="min-w-0 flex-1"><strong>{r.titulo}</strong><small>{r.revisado ? 'Revisado' : 'Aguardando revisão'} · versão {r.versao}{r.fonte ? ` · ${r.fonte}` : ''}</small></span><IconeRede nome="seta" /></button></li>)}</ul>
            {!!ficha.acervo.documentos.length && <p className="mt-2 text-xs text-suave">{ficha.acervo.documentos.length} {ficha.acervo.documentos.length === 1 ? 'documento' : 'documentos'}: {ficha.acervo.documentos.slice(0, 3).map((d) => d.nome).join(', ')}{ficha.acervo.documentos.length > 3 ? '…' : ''}</p>}
          </>}
        </section>}
        {podeExportar && <section className="agente-briefing"><h3>Briefing de reunião</h3><p>Uma página em PDF com cadastro, situação na casa, restrições, acesso, pessoas e o roteiro de perguntas da frente.</p>
          <div className="mt-3 flex flex-wrap gap-2">{(['venda', 'compra'] as const).map((f) => <a key={f} className="agente-btn-secundario" href={`/api/empresas/${e.id}/briefing?frente=${f}`} download><IconeRede nome="importar" className="rotate-180" />Frente de {f}</a>)}</div>
          <p className="mt-2 text-xs text-suave">O download fica registrado na auditoria. Trate o arquivo como confidencial.</p></section>}
        <p className="text-xs text-suave">O cadastro não informa faturamento nem intenção de transação. A ficha mostra só o que seu perfil e seus espaços permitem.</p>
      </div>}
    </div>
  </dialog>
}
