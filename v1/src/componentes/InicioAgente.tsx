import { useState, type FormEvent } from 'react'
import type { Conversa, EstadoAgente, Tarefa, Usuario } from '../agente/api'
import { EXEMPLOS_TESE } from '../agente/pesquisa'
import { IconeRede } from './IconeRede'
import { MeuDia } from './MeuDia'

export function InicioAgente({ usuario, estado, conversas, aoComecar, aoRetomar, aoRede, aoAjuda, aoPesquisar, bloqueado, visivel, aoAbrirCrm, aoOportunidades, aoExpirar, aoExcluir }: {
  usuario: Usuario; estado: EstadoAgente; conversas: Conversa[]; aoComecar: (t: Tarefa) => void; aoRetomar: (id: string) => void; aoRede: () => void; aoAjuda: () => void
  aoPesquisar: (tese: string) => void; bloqueado: boolean
  visivel: boolean; aoAbrirCrm: (id: string) => void; aoOportunidades: () => void; aoExpirar: () => void; aoExcluir: (id: string) => Promise<void>
}) {
  const [tese, setTese] = useState('')
  // Excluir pede confirmação no próprio item: um clique solto não some com o trabalho.
  const [confirmando, setConfirmando] = useState('')
  const [excluindo, setExcluindo] = useState('')
  const excluir = async (id: string) => { setExcluindo(id); try { await aoExcluir(id) } finally { setExcluindo(''); setConfirmando('') } }
  const podeUsar = usuario.papel !== 'leitura'
  const enviar = (e?: FormEvent) => { e?.preventDefault(); if (tese.trim().length >= 10) aoPesquisar(tese.trim()) }
  return <div className="agente-inicio space-y-8">
    <section className="inicio-tese" aria-labelledby="inicio-titulo">
      <span className="agente-sobretitulo">Seu próximo movimento</span>
      <h2 id="inicio-titulo">Olá, {usuario.nome.split(' ')[0]}. Que empresas você procura?</h2>
      <p>Descreva a tese em uma frase. O agente monta os critérios, confere o cadastro de cada empresa e busca evidência no site oficial.</p>
      <form className="pesquisa-caixa" onSubmit={enviar}>
        <label htmlFor="inicio-tese-campo" className="sr-only">Descreva as empresas que você procura</label>
        <textarea id="inicio-tese-campo" value={tese} onChange={(e) => setTese(e.target.value)} maxLength={2000} disabled={!podeUsar}
          placeholder="Ex.: Distribuidoras químicas em SP com mais de 20 anos, sem sócio estrangeiro, que representem fabricantes multinacionais"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar() }} />
        <div className="pesquisa-caixa-rodape">
          <span className="text-xs text-suave">{podeUsar ? 'Você revisa os critérios antes de rodar.' : 'Seu perfil permite consultar pesquisas existentes.'}</span>
          <button className="agente-btn-primario" disabled={!podeUsar || tese.trim().length < 10}>Montar critérios<IconeRede nome="seta" /></button>
        </div>
      </form>
      <div className="inicio-exemplos" aria-label="Exemplos de tese">
        {EXEMPLOS_TESE.map((x) => <button key={x.rotulo} type="button" onClick={() => setTese(x.texto)} disabled={!podeUsar}><span>{x.rotulo}</span>{x.texto}</button>)}
      </div>
      <button className="agente-link mt-5 text-xs" onClick={aoAjuda}><IconeRede nome="ajuda" />Primeira vez? Veja como funciona</button>
    </section>
    <MeuDia visivel={visivel} aoAbrirCrm={aoAbrirCrm} aoRede={aoRede} aoOportunidades={aoOportunidades} aoExpirar={aoExpirar} />
    <section aria-labelledby="escolha-tarefa"><div className="agente-linha-titulo"><h3 id="escolha-tarefa">Ou vá direto a uma tarefa</h3><span>Atalhos do dia a dia</span></div><div className="agente-acoes-iniciais compactas">{[
      { id: 'buscar_empresas', icone: 'busca', titulo: 'Buscar por nome ou região', texto: 'Ache uma empresa específica no catálogo.', acao: 'Abrir busca', cor: 'laranja' },
      { id: 'mapear_acesso', icone: 'rede', titulo: 'Abrir um caminho', texto: 'Veja quem da GHT4 alcança a liderança.', acao: 'Escolher empresa', cor: 'azul' },
      { id: 'preparar_reuniao', icone: 'agenda', titulo: 'Preparar uma reunião', texto: 'Contexto e perguntas antes da conversa.', acao: 'Preparar roteiro', cor: 'neutra' },
    ].map(a => <button key={a.id} className={`agente-acao-inicial ${a.cor}`} onClick={() => aoComecar(a.id as Tarefa)} disabled={bloqueado || !podeUsar}><span className="agente-icone-bloco"><IconeRede nome={a.icone as 'busca' | 'rede' | 'agenda'} /></span><div><h4>{a.titulo}</h4><p>{a.texto}</p></div><span className="agente-acao-rodape"><IconeRede nome="seta" /><span className="sr-only">{a.acao}</span></span></button>)}</div></section>
    <div className="agente-inicio-inferior"><section className="agente-superficie p-6"><div className="agente-linha-titulo"><h3>Continue de onde parou</h3><IconeRede nome="tempo" className="text-suave" /></div>{conversas.length ? <ul className="agente-recentes">{conversas.slice(0, 4).map(c => <li key={c.id}><button onClick={() => aoRetomar(c.id)} disabled={bloqueado || excluindo === c.id}><span className="agente-icone-menor"><IconeRede nome={c.titulo.startsWith('Pesquisa ·') ? 'alvo' : 'pasta'} /></span><span><strong>{c.titulo}</strong><small>{new Date(c.atualizado_em).toLocaleDateString('pt-BR')} · {c.contexto.frente === 'compra' ? 'Compra' : 'Venda'}</small></span><IconeRede nome="seta" /></button>{podeUsar && (confirmando === c.id ? <span className="agente-recentes-confirmar" role="group" aria-label={`Excluir ${c.titulo}?`}><button className="is-perigo" onClick={() => void excluir(c.id)} disabled={excluindo === c.id}>{excluindo === c.id ? 'Excluindo…' : 'Excluir'}</button><button onClick={() => setConfirmando('')} disabled={excluindo === c.id}>Cancelar</button></span> : <button className="agente-recentes-excluir" onClick={() => setConfirmando(c.id)} disabled={bloqueado} aria-label={`Excluir ${c.titulo}`} title="Excluir da lista"><IconeRede nome="lixeira" /></button>)}</li>)}</ul> : <div className="agente-vazio-compacto"><IconeRede nome="pasta" /><p>Seu primeiro trabalho começa com uma tese acima.</p><span>Os resultados ficam salvos aqui para você retomar.</span></div>}</section>
      <section className="agente-convite-rede"><span className="agente-icone-bloco"><IconeRede nome="pessoas" /></span><h3>O acesso começa com quem você conhece.</h3><p>Ajude a construir a rede da casa. Confirme suas relações, uma pessoa por vez.</p><button className="agente-link" onClick={aoRede}>Explorar relacionamentos<IconeRede nome="seta" /></button></section></div>
    {estado.base.disponivel ? <section className="agente-base-real" aria-label="Base de empresas disponível"><div><span className="agente-sobretitulo"><span className="agente-ponto" />Base de empresas</span><h3>{estado.base.subsetor || 'Catálogo de empresas'}</h3><p><strong>{(estado.base.total ?? 0).toLocaleString('pt-BR')} {estado.base.total === 1 ? 'empresa' : 'empresas'}</strong> no recorte inicial · referência {estado.base.referencia?.split('-').reverse().join('/') || 'não informada'}</p></div><details><summary>De onde vêm os dados?</summary><p>{estado.base.fonte || 'Base cadastral configurada'}{estado.base.totalOrigem !== undefined ? ` · ${estado.base.totalOrigem.toLocaleString('pt-BR')} registros na base química de origem` : ''}. A pesquisa por tese confere cada critério no cadastro da Receita Federal e, para o que o cadastro não responde, lê o site oficial da empresa (domínio declarado no CNPJ). Sem evidência, o critério fica “sem evidência”, nunca “não atende”. Os dados não confirmam faturamento nem interesse em vender; a equipe apura essas informações.</p></details></section> : <p className="agente-nota-base">Base cadastral temporariamente indisponível. Você pode continuar pelos trabalhos salvos.</p>}
  </div>
}
