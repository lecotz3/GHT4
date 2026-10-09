import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { IconeRede } from './IconeRede'
import { ErroApi } from '../agente/api'
import {
  acessoApi, ROTULO_JULGAMENTO, RESPOSTAS_RAPIDAS, rotuloResposta, resumoCobertura,
  type Julgamento, type PessoaPlano, type Plano, type Passo, type RespostaReconhecimento,
  type Diligencia as DiligenciaPlano, type RegistroSancao,
} from '../agente/acesso'
import '../agente/pesquisa.css'
import '../agente/acesso.css'

/* Plano de acesso a quem decide numa empresa-alvo: quem decide, como a casa chega,
   por onde falar e a primeira mensagem (rascunho). Nada é enviado daqui. */

const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir.'
const ICONE: Record<Julgamento, 'certo' | 'aproximado' | 'duvida' | 'xis'> = { atende: 'certo', indicio: 'aproximado', indeterminado: 'duvida', nao_atende: 'xis' }
const ETAPA: Record<string, string> = {
  identificada: 'identificada', qualificada: 'qualificada', contatada: 'contatada', conversa_realizada: 'conversa realizada',
  oportunidade_mandato: 'oportunidade de mandato', proposta_enviada: 'proposta enviada', negociacao: 'negociação',
  mandato_assinado: 'mandato assinado', nutricao: 'nutrição', perdida: 'perdida',
}
const dataBr = (d: string) => d ? d.slice(0, 10).split('-').reverse().join('/') : ''

export function PlanoAcesso({ empresaId, pesquisaId, aoExpirar }: { empresaId: string; pesquisaId?: string; aoExpirar?: () => void }) {
  const [plano, setPlano] = useState<Plano | null>(null)
  const [falha, setFalha] = useState('')
  const [leitura, setLeitura] = useState(0)
  const expirar = useRef(aoExpirar)
  useEffect(() => { expirar.current = aoExpirar })
  const tratar = useCallback((e: unknown, mostrar: (m: string) => void) => {
    if (e instanceof ErroApi && e.status === 401) expirar.current?.()
    else mostrar(mensagem(e))
  }, [])
  useEffect(() => {
    let vivo = true
    setFalha('')
    acessoApi.plano(empresaId, pesquisaId)
      .then((p) => { if (vivo) setPlano(p) })
      .catch((e) => { if (vivo) tratar(e, setFalha) })
    return () => { vivo = false }
  }, [empresaId, pesquisaId, leitura, tratar])
  const recarregar = useCallback(() => setLeitura((n) => n + 1), [])

  if (falha && !plano) return <section className="acesso" aria-label="Plano de acesso">
    <p className="pesquisa-alerta" role="alert">Não foi possível montar o plano de acesso. {falha} <button type="button" className="agente-link" onClick={recarregar}>Tentar de novo</button></p>
  </section>
  if (!plano) return <section className="acesso" aria-label="Plano de acesso" aria-busy="true"><p className="pesquisa-fonte" role="status">Montando o plano de acesso…</p></section>

  const p = plano
  const bloqueado = p.passo.acao === 'nao_contatar'
  return <section className="acesso" aria-label={`Plano de acesso — ${p.empresa.nome}`}>
    <header className="acesso-cabeca">
      <span className="acesso-icone"><IconeRede nome="alvo" /></span>
      <div><h4>Chegar a quem decide</h4><p>{resumoCobertura(p.cobertura)}</p></div>
    </header>
    <PassoPlano passo={p.passo} />
    {falha && <p className="pesquisa-alerta" role="alert">{falha}</p>}
    {!bloqueado && p.restricoesOutras.length > 0 && <p className="pesquisa-alerta">Há restrição de contato em outro espaço: {p.restricoesOutras.map((r) => `${r.motivo}${r.espaco ? ` (${r.espaco})` : ''}`).join('; ')}. Fale com o responsável antes de abordar.</p>}
    <div className="acesso-blocos">
      <section aria-label="Quem decide">
        <h5><span>1</span>Quem decide</h5>
        <p className="acesso-leitura">{p.estrutura.leitura}</p>
        {p.estrutura.sinais.map((s) => <p key={s} className="acesso-sinal"><IconeRede nome="atencao" /><span>{s}</span></p>)}
        {p.estrutura.fonte && <p className="pesquisa-fonte">{p.estrutura.fonte}</p>}
        {p.pessoas.length > 0 && <ul className="acesso-pessoas">{p.pessoas.map((pessoa) =>
          <PessoaDecisora key={pessoa.id} pessoa={pessoa} podeResponder={p.eu.naRede && !bloqueado} aoMudar={recarregar} aoFalhar={(e) => tratar(e, setFalha)} />)}</ul>}
        {p.pessoas.length > 0 && !p.eu.naRede && <p className="pesquisa-fonte">Para responder “você conhece?”, cadastre-se na rede como pessoa da GHT4 (tela Rede).</p>}
        {!bloqueado && (p.podeRegistrar
          ? <RegistrarDecisor plano={p} pesquisaId={pesquisaId} aberto={p.passo.acao === 'registrar_decisor'} aoRegistrar={recarregar} aoExpirar={() => expirar.current?.()} />
          : <p className="pesquisa-fonte">Registrar quem decide é tarefa de sócio ou administrador: peça a um deles, dizendo de onde vem a informação.</p>)}
      </section>
      <section aria-label="Como chegar">
        <h5><span>2</span>Como chegar</h5>
        {p.caminhos.length ? <ol className="acesso-caminhos">{p.caminhos.map((c) => <li key={c.rota}>
          <b>{c.rota}</b>
          <small>{c.categoriaRotulo}: {c.categoriaDescricao}</small>
          {c.ressalvas.length > 0 && <ul>{c.ressalvas.map((r) => <li key={r}>{r}</li>)}</ul>}
        </li>)}</ol>
          : <p className="pesquisa-fonte">{bloqueado ? 'Nenhum caminho é sugerido enquanto a restrição estiver ativa.' : 'Nenhum caminho utilizável até agora.'}</p>}
      </section>
      <section aria-label="Por onde falar">
        <h5><span>3</span>Por onde falar</h5>
        {p.canais.length ? <ul className="acesso-canais">{p.canais.map((c) => <li key={c.url}>
          <a className="agente-link" href={c.url} target="_blank" rel="noreferrer noopener">{c.rotulo}<IconeRede nome="externo" /></a>
          <small>{c.dica ?? c.fonte}</small>
        </li>)}</ul> : <p className="pesquisa-fonte">Sem site corporativo no cadastro.</p>}
        <p className="pesquisa-fonte">Telefone e e-mail do cadastro não aparecem aqui: costumam ser do escritório contábil.</p>
      </section>
      <section aria-label="Diligência">
        <h5><span>4</span>Diligência</h5>
        <Diligencia d={p.diligencia} />
      </section>
      {p.oportunidades.length > 0 && <section aria-label="Na carteira">
        <h5><span>5</span>Na carteira</h5>
        <ul className="acesso-oportunidades">{p.oportunidades.map((o) => <li key={o.id}>
          <b>{o.titulo}</b> · {ETAPA[o.etapa] ?? o.etapa}{o.espaco ? ` · ${o.espaco}` : ''}
          <small>Próxima ação: {o.proximaAcao}{o.prazo ? ` até ${dataBr(o.prazo)}` : ''} · {o.responsavel}</small>
        </li>)}</ul>
      </section>}
    </div>
    <details className="acesso-limites"><summary>Limites deste plano</summary><ul>{p.limitacoes.map((l) => <li key={l}>{l}</li>)}</ul></details>
  </section>
}

const SITUACAO_SANCAO: Record<RegistroSancao['situacao'], string> = { vigente: 'Vigente', encerrada: 'Encerrada', sem_data_final: 'Sem data final informada' }

/** Sanções públicas (CEIS e CNEP) da empresa: só o que a lista diz, com a data de referência. */
function Diligencia({ d }: { d: DiligenciaPlano | null }) {
  if (!d || !d.consultada) return <p className="pesquisa-fonte">A lista de sanções públicas (CEIS e CNEP) não está carregada neste servidor.</p>
  const fonte = <p className="pesquisa-fonte">{d.fonte}, referência {dataBr(d.referencia ?? '')}. Ausência na lista não prova idoneidade. <a className="agente-link" href={d.url} target="_blank" rel="noreferrer noopener">Consultar no portal<IconeRede nome="externo" /></a></p>
  if (!d.registros.length) return <><p className="acesso-leitura">Nenhuma sanção registrada no CEIS ou no CNEP para esta raiz de CNPJ.</p>{fonte}</>
  return <>
    <ul className="acesso-sancoes">{d.registros.map((r) => <li key={`${r.cadastro}-${r.codigo}`} className={r.situacao}>
      <b>{r.cadastro} · {r.categoria}</b>
      <small>{SITUACAO_SANCAO[r.situacao]}{r.inicio ? ` · desde ${dataBr(r.inicio)}` : ''}{r.fim ? ` · até ${dataBr(r.fim)}` : ''} · {r.orgao}{r.uf && !r.orgao.includes(`(${r.uf})`) ? ` (${r.uf})` : ''}{r.abrangencia && r.abrangencia !== 'Sem Informação' ? ` · ${r.abrangencia}` : ''}</small>
    </li>)}</ul>
    {fonte}
  </>
}

/** O próximo passo, com o rascunho para copiar (nunca enviar daqui). */
function PassoPlano({ passo }: { passo: Passo }) {
  const [copiado, setCopiado] = useState<number | null>(null)
  const copiar = async (texto: string, n: number) => {
    try { await navigator.clipboard?.writeText(texto); setCopiado(n) } catch { setCopiado(null) }
  }
  return <div className={`acesso-passo ${passo.acao}`} role="status">
    <p className="acesso-passo-rotulo">Próximo passo</p>
    <p className="acesso-passo-titulo">{passo.titulo}</p>
    {passo.alerta && <p className="acesso-passo-alerta"><IconeRede nome="atencao" /><span>{passo.alerta}</span></p>}
    <p>{passo.texto}</p>
    {passo.rascunhos.length > 0 && <div className="acesso-rascunhos">
      {passo.rascunhos.map((r, n) => <div key={n} className="acesso-rascunho">
        <label htmlFor={`rascunho-${n}`}>Rascunho para {r.para} <span className="text-suave">(revise antes de enviar)</span></label>
        <textarea id={`rascunho-${n}`} className="agente-input" readOnly value={r.texto} rows={4} />
        <button type="button" className="agente-link text-xs" onClick={() => void copiar(r.texto, n)}>{copiado === n ? 'Copiado' : 'Copiar texto'}</button>
      </div>)}
      <ul className="acesso-regras">{passo.regras.map((r) => <li key={r}>{r}</li>)}</ul>
    </div>}
  </div>
}

/** Uma pessoa da empresa: posição na decisão, juízo com fonte e o "você conhece?" do membro. */
function PessoaDecisora({ pessoa, podeResponder, aoMudar, aoFalhar }: {
  pessoa: PessoaPlano; podeResponder: boolean; aoMudar: () => void; aoFalhar: (e: unknown) => void
}) {
  const [mudando, setMudando] = useState(false)
  const [escolha, setEscolha] = useState<RespostaReconhecimento | null>(null)
  const [evidencia, setEvidencia] = useState('')
  const [salvando, setSalvando] = useState(false)
  const perguntar = podeResponder && (!pessoa.minhaResposta || mudando)
  const enviar = async (resposta: RespostaReconhecimento, texto = '') => {
    setSalvando(true)
    try { await acessoApi.responder(pessoa.id, resposta, texto); setEscolha(null); setEvidencia(''); setMudando(false); aoMudar() }
    catch (e) { aoFalhar(e) }
    finally { setSalvando(false) }
  }
  const confirmar = (e: FormEvent) => { e.preventDefault(); if (escolha && evidencia.trim().length >= 10) void enviar(escolha, evidencia.trim()) }
  return <li className="acesso-pessoa">
    <div className="acesso-pessoa-cabeca">
      <div><b>{pessoa.nome}</b><small>{pessoa.cargo || pessoa.senioridadeRotulo}</small></div>
      <span className={`acesso-posicao ${pessoa.posicao.id}`}>{pessoa.posicao.rotulo}</span>
    </div>
    {/* Grade com papéis de tabela, e não <table>: o plano vive dentro da tabela de resultados da
        pesquisa, cujas regras de tr/td (inclusive as do celular) vazariam para cá. */}
    <div className="acesso-juizo" role="table" aria-label={`Juízo sobre ${pessoa.nome}`}>
      <div className="acesso-juizo-linha acesso-juizo-titulos" role="row">
        <span role="columnheader">Requisito</span><span role="columnheader">Julgamento</span><span role="columnheader">Informação</span><span role="columnheader">Fonte</span>
      </div>
      {pessoa.juizo.map((j) => <div key={j.requisito} className="acesso-juizo-linha" role="row">
        <span role="rowheader" className="acesso-juizo-requisito">{j.requisito}</span>
        <span role="cell"><span className={`acesso-julgamento ${j.julgamento}`}><IconeRede nome={ICONE[j.julgamento]} />{ROTULO_JULGAMENTO[j.julgamento]}</span></span>
        <span role="cell" className="acesso-juizo-info">{j.informacao}</span>
        <span role="cell" className="acesso-juizo-fonte">{j.fonte ?? '—'}</span>
      </div>)}
    </div>
    {pessoa.minhaResposta && !mudando && <p className="pesquisa-fonte">Sua resposta: {rotuloResposta(pessoa.minhaResposta)}.{podeResponder && <> <button type="button" className="agente-link text-xs" onClick={() => setMudando(true)}>Mudar resposta</button></>}</p>}
    {perguntar && <div className="acesso-pergunta">
      <p>Você conhece {pessoa.nome}?</p>
      <div className="acesso-respostas">{RESPOSTAS_RAPIDAS.map((r) => <button key={r.id} type="button" className={escolha === r.id ? 'agente-btn-primario' : 'agente-btn-secundario'} disabled={salvando}
        onClick={() => r.pedeEvidencia ? setEscolha(r.id) : void enviar(r.id)}>{r.rotulo}</button>)}</div>
      {escolha && <form className="acesso-evidencia" onSubmit={confirmar}>
        <label htmlFor={`evid-${pessoa.id}`}>De onde vocês se conhecem? <span className="text-suave">(aparece como base da conversa)</span></label>
        <input id={`evid-${pessoa.id}`} className="agente-input" value={evidencia} onChange={(e) => setEvidencia(e.target.value)} maxLength={2000} minLength={10} required
          placeholder="Ex.: trabalhamos juntos na Química Beta até 2019" autoFocus />
        <button className="agente-btn-primario" disabled={salvando || evidencia.trim().length < 10}>{salvando ? 'Salvando…' : 'Confirmar'}</button>
      </form>}
    </div>}
  </li>
}

/** "Caminho de recall": alguém da casa informa quem decide, sempre com a fonte. */
function RegistrarDecisor({ plano, pesquisaId, aberto, aoRegistrar, aoExpirar }: {
  plano: Plano; pesquisaId?: string; aberto: boolean; aoRegistrar: () => void; aoExpirar: () => void
}) {
  const institucional = plano.canais.find((c) => c.tipo === 'institucional')
  const [nome, setNome] = useState('')
  const [cargo, setCargo] = useState('')
  const [senioridade, setSenioridade] = useState('ceo')
  const [tipo, setTipo] = useState(institucional || plano.canais.length ? 'site_oficial' : 'conhecimento_da_casa')
  const [descricao, setDescricao] = useState('')
  const [url, setUrl] = useState(institucional?.url ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Mandato confidencial: a pessoa e a fonte vão para a rede de toda a casa, então quem registra confirma.
  const confirmar = plano.compartilhamento === 'confirmar'
  const [compartilhar, setCompartilhar] = useState(false)
  const envio = useRef<string | null>(null)
  const valido = nome.trim().length >= 2 && cargo.trim().length >= 2 && descricao.trim().length >= 5 && (!confirmar || compartilhar)
  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!valido) return
    setSalvando(true); setErro('')
    envio.current ??= crypto.randomUUID()
    try {
      await acessoApi.registrarDecisor(plano.empresa.id, { id: envio.current, nome: nome.trim(), cargo: cargo.trim(), senioridade,
        fonte: { tipo, descricao: descricao.trim(), ...(url.trim() ? { url: url.trim() } : {}) }, ...(pesquisaId ? { pesquisaId } : {}),
        ...(confirmar && compartilhar ? { compartilhar: true as const } : {}) })
      envio.current = null
      setNome(''); setCargo(''); setDescricao(''); setCompartilhar(false)
      aoRegistrar()
    } catch (falha) {
      if (falha instanceof ErroApi && falha.status === 401) aoExpirar()
      else { setErro(mensagem(falha)); if (falha instanceof ErroApi && falha.status === 409) envio.current = null }
    } finally { setSalvando(false) }
  }
  return <details className="acesso-registrar" open={aberto}>
    <summary>Registrar quem decide</summary>
    <form onSubmit={enviar} aria-label="Registrar quem decide">
      <div className="acesso-campos">
        <label>Nome<input className="agente-input" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required /></label>
        <label>Cargo<input className="agente-input" value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={120} required placeholder="Ex.: sócio-administrador" /></label>
        <label>Nível de decisão<select className="agente-input" value={senioridade} onChange={(e) => setSenioridade(e.target.value)}>
          {plano.senioridades.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}</select></label>
        <label>Fonte<select className="agente-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {plano.tiposFonte.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}</select></label>
        <label className="acesso-campo-largo">De onde vem a informação<input className="agente-input" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={300} required
          placeholder="Ex.: página Quem somos; contrato social na Junta; conversa com o diretor em 05/10" /></label>
        <label className="acesso-campo-largo">Endereço <span className="text-suave">(opcional)</span><input className="agente-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://" /></label>
      </div>
      <p className="pesquisa-fonte">Sem e-mail, telefone ou LinkedIn: o plano não monta contato pessoal. A pessoa entra na rede ligada a esta empresa, e a casa é perguntada se a conhece.</p>
      {confirmar && <label className="acesso-compartilhar">
        <input type="checkbox" checked={compartilhar} onChange={(e) => setCompartilhar(e.target.checked)} />
        <span>Esta pesquisa é de um mandato confidencial. Nome, cargo e fonte vão para a rede de toda a casa: confirmo que a fonte escrita não diz nada do mandato.</span>
      </label>}
      {erro && <p role="alert" className="pesquisa-erro">{erro}</p>}
      <button className="agente-btn-primario" disabled={salvando || !valido}>{salvando ? 'Salvando…' : 'Registrar'}</button>
    </form>
  </details>
}
