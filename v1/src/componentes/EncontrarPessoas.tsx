import { useEffect, useRef, useState, type FormEvent } from 'react'
import { IconeRede } from './IconeRede'
import { PlanoAcesso } from './PlanoAcesso'
import { ErroApi } from '../agente/api'
import { ROTULO_JULGAMENTO, type Julgamento } from '../agente/acesso'
import {
  encontrarApi, GRUPOS, ROTULO_GRUPO, ACESSO_PEDIDO, EXEMPLOS_ENCONTRAR, resumoResultado, ondeEsta,
  resumoDaLembrada, type Grupo, type PessoaEncontrada, type ResultadoEncontrar, type Lacuna, type PesquisaDoFind, type MemoriaBuscas,
} from '../agente/encontrar'
import '../agente/pesquisa.css'
import '../agente/acesso.css'
import '../agente/encontrar.css'

/* Encontrar quem decide: o "/find" do agente. O pedido vira papel, acesso e
   critérios da empresa; o resultado são as pessoas que a casa já mapeou, com o
   juízo de cada uma e o caminho pela rede, e as empresas onde ainda falta alguém.
   Nada de contato pessoal: a conversa começa pelo plano de acesso. */

const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir.'
const ICONE: Record<Julgamento, 'certo' | 'aproximado' | 'duvida' | 'xis'> = { atende: 'certo', indicio: 'aproximado', indeterminado: 'duvida', nao_atende: 'xis' }
const numero = (n: number) => n.toLocaleString('pt-BR')
const ORIGEM: Record<string, string> = { cadastro_publico: 'Quadro societário público', importacao: 'Lista da equipe', manual: 'Registrado pela casa' }

export function EncontrarPessoas({ aoPesquisar, aoExpirar, pesquisa = null, aoSairDaPesquisa }: {
  aoPesquisar: (tese: string) => void; aoExpirar: () => void
  /** Dentro de uma pesquisa por tese, a busca fica nas aderentes e prováveis dela. */
  pesquisa?: PesquisaDoFind | null; aoSairDaPesquisa?: () => void
}) {
  const [pedido, setPedido] = useState('')
  const [resultado, setResultado] = useState<ResultadoEncontrar | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')
  // Um plano aberto por vez: chave `pessoa:<id>` ou `lacuna:<empresaId>`.
  const [plano, setPlano] = useState<string | null>(null)
  const pedidoAtual = useRef(0)
  // Memória das buscas: auxiliar. Falha ao ler não atrapalha o find; a lista só não aparece.
  const [memoria, setMemoria] = useState<MemoriaBuscas | null>(null)
  const [esquecendo, setEsquecendo] = useState('')
  const lerMemoria = () => { encontrarApi.memoria().then(setMemoria, () => {}) }
  useEffect(lerMemoria, [])
  async function esquecer(chave: string | null) {
    if (esquecendo) return
    setEsquecendo(chave ?? 'todas')
    try { setMemoria(chave ? await encontrarApi.esquecer(chave) : await encontrarApi.apagarTodas()) }
    catch (falha) { if (falha instanceof ErroApi && falha.status === 401) aoExpirar(); else setErro(mensagem(falha)) }
    finally { setEsquecendo('') }
  }

  // Vindo da pesquisa, o pedido começa pronto: o recorte já são as empresas dela.
  useEffect(() => {
    pedidoAtual.current++
    setResultado(null); setErro(''); setPlano(null); setBuscando(false)
    if (pesquisa) setPedido((p) => p.trim() ? p : 'Quem decide')
  }, [pesquisa?.id]) // oxlint-disable-line react-hooks/exhaustive-deps

  async function buscar(e?: FormEvent, repetido?: string) {
    e?.preventDefault()
    const texto = (repetido ?? pedido).trim()
    if (texto.length < 3 || buscando) return
    if (repetido) setPedido(repetido)
    const n = ++pedidoAtual.current
    setBuscando(true); setErro(''); setPlano(null)
    try {
      const r = await encontrarApi.buscar(texto, pesquisa?.id)
      if (n === pedidoAtual.current) setResultado(r)
      if (!pesquisa) lerMemoria()
    } catch (falha) {
      if (falha instanceof ErroApi && falha.status === 401) aoExpirar()
      else if (n === pedidoAtual.current) setErro(mensagem(falha))
    } finally { if (n === pedidoAtual.current) setBuscando(false) }
  }
  const alternar = (chave: string) => setPlano((p) => p === chave ? null : chave)

  return <main className="agente-pagina pesquisa encontrar">
    <section className="pesquisa-compositor encontrar-compositor" aria-labelledby="titulo-encontrar">
      <span className="agente-sobretitulo">Encontrar quem decide</span>
      <h2 id="titulo-encontrar">Diga quem você procura.</h2>
      <p className="pesquisa-sub">Cargo, empresa (descrita, pelo nome ou pelo CNPJ) e, se quiser, só quem a casa alcança. O agente procura entre as pessoas que a GHT4 já mapeou: o quadro societário público, as listas da equipe e quem alguém da casa registrou com a fonte. Cada pessoa vem com o juízo de cada exigência e o caminho pela rede.</p>
      {pesquisa && <p className="encontrar-escopo" role="note">
        <IconeRede nome="alvo" /><span>Nas empresas da pesquisa <b>“{pesquisa.tese}”</b>: {numero(pesquisa.boas)} {pesquisa.boas === 1 ? 'aderente ou provável' : 'aderentes ou prováveis'}.</span>
        {aoSairDaPesquisa && <button type="button" className="agente-link" onClick={aoSairDaPesquisa} disabled={buscando}>Procurar em todas as empresas</button>}
      </p>}
      <form onSubmit={buscar} className="pesquisa-caixa">
        <label htmlFor="pedido-encontrar" className="sr-only">Quem você procura</label>
        <textarea id="pedido-encontrar" value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={2000} disabled={buscando}
          placeholder="Ex.: Quem decide nas distribuidoras de SP com mais de 20 anos que a casa conhece"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void buscar() }} />
        <div className="pesquisa-caixa-rodape">
          <span className="pesquisa-fonte">Sem telefone nem e-mail: o contato começa pelo plano de acesso.</span>
          <button className="agente-btn-primario" disabled={buscando || pedido.trim().length < 3}>{buscando ? 'Procurando…' : 'Encontrar'}<IconeRede nome="busca" /></button>
        </div>
      </form>
      {erro && <p role="alert" className="pesquisa-erro">{erro}</p>}
      {!resultado && <div className="pesquisa-exemplos" aria-label="Exemplos de pedido">
        {EXEMPLOS_ENCONTRAR.map((x) => <button key={x.rotulo} type="button" onClick={() => setPedido(x.texto)} disabled={buscando}><span>{x.rotulo}</span>{x.texto}</button>)}
      </div>}
      {!resultado && !pesquisa && memoria && (memoria.buscas.length > 0 || !memoria.ativa) && <section className="encontrar-memoria" aria-labelledby="titulo-memoria-buscas">
        <div className="encontrar-memoria-cabeca"><h3 id="titulo-memoria-buscas">Suas buscas recentes</h3>
          {memoria.buscas.length > 0 && <button type="button" className="agente-link text-xs" onClick={() => void esquecer(null)} disabled={Boolean(esquecendo) || buscando}>{esquecendo === 'todas' ? 'Apagando…' : 'Apagar todas'}</button>}</div>
        {!memoria.ativa && <p className="pesquisa-fonte">Sua memória está pausada: buscas novas não ficam guardadas. Retome em Pesquisar por tese, no painel "Sua memória".</p>}
        <ul>{memoria.buscas.map((b) => <li key={b.chave}>
          <button type="button" className="encontrar-memoria-pedido" onClick={() => void buscar(undefined, b.pedido)} disabled={buscando}>{b.pedido}<small>{resumoDaLembrada(b)}</small></button>
          <button type="button" className="encontrar-memoria-esquecer" aria-label={`Esquecer a busca: ${b.pedido}`} title="Esquecer esta busca" onClick={() => void esquecer(b.chave)} disabled={Boolean(esquecendo) || buscando}><IconeRede nome="fechar" /></button>
        </li>)}</ul>
        <p className="pesquisa-fonte">Só você vê esta lista. Fica o pedido e quantas pessoas ele trouxe, nunca os nomes.</p>
      </section>}
    </section>

    {resultado && <div className="encontrar-resultado" aria-busy={buscando}>
      <p className="encontrar-resumo" role="status">{resumoResultado(resultado)}</p>
      <Leitura r={resultado} />
      <Funil r={resultado} />
      {GRUPOS.map((g) => <GrupoPessoas key={g} grupo={g} r={resultado} plano={plano} aoPlano={alternar} aoExpirar={aoExpirar}
        aoPesquisar={() => aoPesquisar(resultado.leitura.tese || resultado.leitura.pedido)} />)}
      <Lacunas r={resultado} plano={plano} aoPlano={alternar} aoExpirar={aoExpirar} />
      <details className="acesso-limites"><summary>Limites desta busca</summary><ul>{resultado.limitacoes.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="pesquisa-fonte">{resultado.fonte}{resultado.referencia ? `, referência ${resultado.referencia}` : ''}.</p></details>
    </div>}
  </main>
}

/** Como o pedido foi lido: papel, acesso, recorte e critérios da empresa, com as notas. */
function Leitura({ r }: { r: ResultadoEncontrar }) {
  const l = r.leitura
  const citadas = (l.empresas ?? []).flatMap((n) => n.empresas)
  const recorte = l.pesquisa ? ['Só as empresas da pesquisa', l.recorte.uf || null].filter(Boolean).join(' · ')
    : citadas.length ? ['Só as empresas citadas', l.recorte.uf || null].filter(Boolean).join(' · ')
    : [l.recorte.subsetor && l.recorte.subsetor !== 'todos' ? l.recorte.subsetor : 'Todos os setores-alvo', l.recorte.uf || null, l.recorte.cnae ? `CNAE ${l.recorte.cnae}` : null].filter(Boolean).join(' · ')
  return <section className="agente-superficie encontrar-leitura" aria-labelledby="titulo-leitura">
    <h3 id="titulo-leitura">Como li o pedido</h3>
    <dl>
      <div><dt>Quem</dt><dd>{l.papel.rotulo}{l.papel.padrao && <small> (o pedido não disse o cargo)</small>}</dd></div>
      <div><dt>Acesso</dt><dd>{l.acesso.exigido ? `${ACESSO_PEDIDO[l.acesso.exigido]}${l.acesso.obrigatorio ? '' : ' (de preferência)'}` : 'Qualquer um; o caminho aparece quando existe'}</dd></div>
      {l.pesquisa && <div><dt>Empresa</dt><dd>{l.pesquisa.empresas === 1 ? 'A aderente ou provável' : `As ${numero(l.pesquisa.empresas)} aderentes e prováveis`} da pesquisa “{l.pesquisa.tese}”</dd></div>}
      {!l.pesquisa && (l.empresas ?? []).length > 0 && <div><dt>Empresa</dt><dd>{citadas.length ? <ul className="encontrar-criterios">{citadas.map((e) => <li key={e.id}>
        {e.nome}<small>{e.cidade ? `${e.cidade}${e.uf ? `/${e.uf}` : ''}` : 'catálogo'}</small></li>)}</ul> : 'Nenhuma do catálogo com esse CNPJ'}</dd></div>}
      <div><dt>Recorte</dt><dd>{recorte}</dd></div>
      <div><dt>Na empresa</dt><dd>{l.criterios.length ? <ul className="encontrar-criterios">{l.criterios.map((c) => <li key={c.id} className={c.obrigatorio ? '' : 'is-opcional'}>
        {c.texto}<small>{c.tipo === 'pesquisa' ? 'site oficial' : 'cadastro'}{c.obrigatorio ? '' : ' · opcional'}</small></li>)}</ul> : 'Nenhum critério além do recorte'}</dd></div>
    </dl>
    {l.notas.length > 0 && <details className="encontrar-notas"><summary>{l.notas.length === 1 ? '1 observação sobre a leitura' : `${l.notas.length} observações sobre a leitura`}</summary>
      <ul>{l.notas.map((n) => <li key={n}>{n}</li>)}</ul></details>}
  </section>
}

function Funil({ r }: { r: ResultadoEncontrar }) {
  const f = r.funil
  const etapas = [
    { rotulo: 'Empresas no recorte', valor: f.recorte, nota: f.truncado ? `lidas as primeiras ${numero(f.lidas)}` : undefined },
    { rotulo: 'Nos critérios da empresa', valor: f.nosCriterios },
    { rotulo: 'Com alguém mapeado', valor: f.comPessoas },
    { rotulo: 'Pessoas avaliadas', valor: f.pessoas, nota: f.foraDosCriterios ? `mais ${numero(f.foraDosCriterios)} em empresas fora dos critérios` : undefined },
    { rotulo: 'Atendem ao pedido', valor: f.forte },
  ]
  const maximo = Math.max(1, f.recorte)
  return <section className="pesquisa-funil" aria-label="Funil da busca">
    {etapas.map((e) => <div key={e.rotulo} className="pesquisa-funil-etapa">
      <span className="pesquisa-funil-valor">{numero(e.valor)}</span>
      <span className="pesquisa-funil-rotulo">{e.rotulo}</span>
      <span className="pesquisa-funil-trilho" aria-hidden="true"><span style={{ width: `${e.valor ? Math.max(2, Math.round((100 * e.valor) / maximo)) : 0}%` }} /></span>
      {e.nota && <span className="pesquisa-funil-nota">{e.nota}</span>}
    </div>)}
  </section>
}

function GrupoPessoas({ grupo, r, plano, aoPlano, aoExpirar, aoPesquisar }: {
  grupo: Grupo; r: ResultadoEncontrar; plano: string | null; aoPlano: (chave: string) => void; aoExpirar: () => void; aoPesquisar: () => void
}) {
  const pessoas = r.grupos[grupo]
  const total = r.funil[grupo]
  if (!total) return null
  const rotulo = ROTULO_GRUPO[grupo]
  const lista = <>
    {grupo === 'revisar' && pessoas.some((p) => p.pedePesquisa) && <p className="pesquisa-alerta encontrar-dica">
      Algumas exigências só o site oficial responde. <button type="button" className="agente-link" onClick={aoPesquisar}>Rodar a pesquisa por tese com este pedido<IconeRede nome="seta" /></button></p>}
    <ul className="encontrar-pessoas">{pessoas.map((p) => <CartaoPessoa key={p.id} p={p} pesquisaId={r.leitura.pesquisa?.id} aberto={plano === `pessoa:${p.id}`} aoPlano={() => aoPlano(`pessoa:${p.id}`)} aoExpirar={aoExpirar} />)}</ul>
    {total > pessoas.length && <p className="pesquisa-fonte">Mostrando {numero(pessoas.length)} de {numero(total)}. Estreite o pedido para ver as demais.</p>}
  </>
  const titulo = <><span className={`encontrar-grupo-marca ${grupo}`} aria-hidden="true" />{rotulo.titulo}<span className="encontrar-grupo-n">{numero(total)}</span></>
  // "Fora do pedido" fica recolhido: serve para conferir, não para trabalhar. Sem título dentro
  // do <summary>, que o leitor de tela anuncia como botão.
  if (grupo === 'excluido') return <details className="encontrar-grupo excluido">
    <summary><span className="encontrar-grupo-titulo">{titulo}</span><small>{rotulo.descricao}</small></summary>{lista}
  </details>
  return <section className={`encontrar-grupo ${grupo}`} aria-labelledby={`grupo-${grupo}`}>
    <header><h3 id={`grupo-${grupo}`}>{titulo}</h3><small>{rotulo.descricao}</small></header>{lista}
  </section>
}

/** `pesquisaId`: a busca foi feita dentro de uma pesquisa por tese, e o plano segue nela (mandato, cadastro e site guardados). */
function CartaoPessoa({ p, pesquisaId, aberto, aoPlano, aoExpirar }: { p: PessoaEncontrada; pesquisaId?: string; aberto: boolean; aoPlano: () => void; aoExpirar: () => void }) {
  const [juizo, setJuizo] = useState(false)
  const idJuizo = `juizo-${p.id}`
  return <li className={`encontrar-pessoa ${p.grupo}`}>
    <div className="encontrar-pessoa-cabeca">
      <div>
        <b>{p.nome}</b>
        <small>{p.cargo || p.senioridadeRotulo} · {ondeEsta(p)}</small>
      </div>
      <span className={`acesso-posicao ${p.posicao.id}`}>{p.posicao.rotulo}</span>
    </div>
    <p className="encontrar-caminho">{p.caminho
      ? <><IconeRede nome="rede" /><span><b>{p.caminho.categoriaRotulo}:</b> {p.caminho.rota}</span></>
      : <><IconeRede nome="duvida" /><span>{p.grupo === 'excluido' && p.motivo?.startsWith('Não contatar') ? 'Nenhum caminho sugerido: restrição ativa.' : 'Sem caminho pela rede até agora.'}</span></>}</p>
    {p.motivo && <p className="encontrar-motivo">{p.motivo}</p>}
    {(p.avisos ?? []).map((a) => <p key={a} className="pesquisa-alerta encontrar-aviso">{a}</p>)}
    {p.pendencias.length > 0 && <p className="encontrar-pendencias">A revisar: {p.pendencias.join(' · ')}</p>}
    <div className="encontrar-acoes">
      <button type="button" className="agente-link" aria-expanded={juizo} aria-controls={idJuizo} onClick={() => setJuizo(!juizo)}>{juizo ? 'Esconder o juízo' : 'Ver o juízo'}</button>
      <button type="button" className="agente-link" aria-expanded={aberto} onClick={aoPlano}><IconeRede nome="alvo" />{aberto ? 'Fechar o plano de acesso' : 'Plano de acesso'}</button>
      <span className="pesquisa-fonte">{ORIGEM[p.origem ?? 'manual'] ?? 'Rede'}</span>
    </div>
    {juizo && <div id={idJuizo} className="acesso-juizo" role="table" aria-label={`Juízo sobre ${p.nome}`}>
      <div className="acesso-juizo-linha acesso-juizo-titulos" role="row">
        <span role="columnheader">Requisito</span><span role="columnheader">Julgamento</span><span role="columnheader">Informação</span><span role="columnheader">Fonte</span>
      </div>
      {p.juizo.map((j) => <div key={j.requisito} className={`acesso-juizo-linha ${j.obrigatorio ? '' : 'is-informativa'}`} role="row">
        <span role="rowheader" className="acesso-juizo-requisito">{j.requisito}{!j.obrigatorio && <small> (informativo)</small>}</span>
        <span role="cell"><span className={`acesso-julgamento ${j.julgamento}`}><IconeRede nome={ICONE[j.julgamento]} />{ROTULO_JULGAMENTO[j.julgamento]}</span></span>
        <span role="cell" className="acesso-juizo-info">{j.informacao}</span>
        <span role="cell" className="acesso-juizo-fonte">{j.fonte ?? '—'}</span>
      </div>)}
    </div>}
    {aberto && <PlanoAcesso empresaId={p.empresa.id} pesquisaId={pesquisaId} aoExpirar={aoExpirar} />}
  </li>
}

/** Empresas que se encaixam e onde ninguém mapeado serve ao pedido: o "caminho de recall". */
function Lacunas({ r, plano, aoPlano, aoExpirar }: { r: ResultadoEncontrar; plano: string | null; aoPlano: (chave: string) => void; aoExpirar: () => void }) {
  const l = r.lacunas
  if (!l.total) return null
  return <section className="encontrar-grupo lacunas" aria-labelledby="titulo-lacunas">
    <header><h3 id="titulo-lacunas"><span className="encontrar-grupo-marca lacuna" aria-hidden="true" />Onde falta quem decide<span className="encontrar-grupo-n">{numero(l.total)}</span></h3>
      <small>{l.ninguemMapeado === l.total ? 'Empresas que se encaixam no pedido sem ninguém mapeado.' : `Empresas que se encaixam no pedido: ${numero(l.ninguemMapeado)} sem ninguém mapeado, as demais sem alguém que sirva ao pedido.`} Abra o plano e registre quem decide, com a fonte.</small></header>
    <ul className="encontrar-lacunas">{l.empresas.map((x) => <ItemLacuna key={x.empresa.id} x={x} pesquisaId={r.leitura.pesquisa?.id} aberto={plano === `lacuna:${x.empresa.id}`} aoPlano={() => aoPlano(`lacuna:${x.empresa.id}`)} aoExpirar={aoExpirar} />)}</ul>
    {l.total > l.empresas.length && <p className="pesquisa-fonte">Mostrando {numero(l.empresas.length)} de {numero(l.total)}.</p>}
  </section>
}

function ItemLacuna({ x, pesquisaId, aberto, aoPlano, aoExpirar }: { x: Lacuna; pesquisaId?: string; aberto: boolean; aoPlano: () => void; aoExpirar: () => void }) {
  return <li className="encontrar-lacuna">
    <div className="encontrar-pessoa-cabeca">
      <div><b>{x.empresa.nome}</b><small>{[x.empresa.cidade && `${x.empresa.cidade}/${x.empresa.uf}`, x.empresa.subsetor].filter(Boolean).join(' · ')}</small></div>
      <span className="acesso-posicao">{x.mapeadas ? `${x.mapeadas} mapeada${x.mapeadas === 1 ? '' : 's'}, nenhuma serve` : 'Ninguém mapeado'}</span>
    </div>
    <p className="acesso-leitura">{x.estrutura}</p>
    {(x.avisos ?? []).map((a) => <p key={a} className="pesquisa-alerta encontrar-aviso">{a}</p>)}
    <div className="encontrar-acoes"><button type="button" className="agente-link" aria-expanded={aberto} onClick={aoPlano}><IconeRede nome="alvo" />{aberto ? 'Fechar o plano de acesso' : 'Abrir o plano e registrar quem decide'}</button></div>
    {aberto && <PlanoAcesso empresaId={x.empresa.id} pesquisaId={pesquisaId} aoExpirar={aoExpirar} />}
  </li>
}
