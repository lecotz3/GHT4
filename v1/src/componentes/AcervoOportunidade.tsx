import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type Conversa } from '../agente/api'
import { botao, campo, secundario, hojeLocal, type FichaOportunidade } from '../agente/prospeccao'

type Valores = Record<string,string | number | null>
interface Campo { id:string; rotulo:string; tipo:string; opcoes?:string[] }
interface Registro { id:string; serie_id:string; tipo:string; versao:number; dados:Valores; revisado:boolean; autor:string; criado_em:string; contatosOmitidos?:boolean }
interface Acervo { registros:Registro[]; formularios:Record<string,{ titulo:string; campos:Campo[] }>; permissoes:{ editar:Record<string,boolean>; revisar:boolean; contatos:boolean }; comparaveis:{ id:string; empresa:string; evReceita:number|null; evEbitda:number|null; limite:string }[] }
interface Documento { id:string; nome:string; estado:string; tamanho:number; hash:string; trechos?:{ local:string; texto:string }[] }
const abas:Record<string,string> = { evidencia:'Evidências',documentos:'Documentos',relacao:'Relações',tese:'Teses e contrapartes',comparavel:'Comparáveis',noticia:'Notícias',passagem:'Execução' }
const labelOpcao = (s:string) => s.replaceAll('_',' ')
interface Props { ficha:FichaOportunidade; aoFalhar:(e:unknown)=>void; aoAbrirTrabalho:(id:string)=>void; aoAbrirOportunidade:(id:string)=>void; aoAtualizar:()=>Promise<void> }

export function AcervoOportunidade({ ficha, aoFalhar, aoAbrirTrabalho, aoAbrirOportunidade, aoAtualizar }:Props) {
  const [acervo,setAcervo]=useState<Acervo|null>(null)
  const [aba,setAba]=useState('evidencia')
  const [editando,setEditando]=useState<Registro|null|'novo'>(null)
  const [versoes,setVersoes]=useState<Registro[]>([])
  const id=ficha.oportunidade.id
  const carregar=useCallback(async()=>{ const r=await api<Acervo>(`/api/crm/oportunidades/${id}/acervo`); setAcervo(r) },[id])
  useEffect(()=>{ void carregar().catch(aoFalhar) },[carregar,aoFalhar])
  async function verVersoes(r:Registro) { try { setVersoes((await api<{ versoes:Registro[] }>(`/api/crm/oportunidades/${id}/acervo/${r.serie_id}/versoes`)).versoes) } catch(e) { aoFalhar(e) } }
  return <section className="space-y-4 rounded-ficha border border-fio bg-papel p-5" aria-label="Acervo da oportunidade"><h3 className="text-lg font-semibold">Conhecimento e materiais da oportunidade</h3>
    <p className="text-sm text-suave">Reúna as fontes e decisões que sustentam o trabalho. Cada alteração mantém a versão anterior.</p>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Materiais">{Object.entries(abas).map(([k,v])=><button role="tab" aria-selected={aba===k} className={aba===k?botao:secundario} key={k} onClick={()=>{ setAba(k);setEditando(null);setVersoes([]) }}>{v}</button>)}</div>
    {aba==='documentos' ? <Documentos ficha={ficha} aoFalhar={aoFalhar} aoAbrirTrabalho={aoAbrirTrabalho} aoAtualizar={aoAtualizar}/> : acervo && <>
      {acervo.permissoes.editar[aba] && <button className={secundario} onClick={()=>setEditando('novo')}>+ {acervo.formularios[aba].titulo}</button>}
      {editando && <EditarRegistro key={editando==='novo'?`novo-${aba}`:editando.id} tipo={aba} formulario={acervo.formularios[aba]} anterior={editando==='novo'?null:editando}
        podeRevisar={acervo.permissoes.revisar} id={id} aoFalhar={aoFalhar} aoCancelar={()=>setEditando(null)} aoSalvar={async()=>{ setEditando(null);await carregar();await aoAtualizar() }}/>} 
      {!acervo.registros.some((r)=>r.tipo===aba) && <p className="text-sm text-suave">Nenhum registro nesta categoria. Use dados públicos ou materiais que a equipe pode utilizar; campos desconhecidos permanecem sem valor.</p>}
      {acervo.registros.filter((r)=>r.tipo===aba).map((r)=><article className="space-y-2 border-t border-fio pt-4" key={r.id}>
        <h4 className="font-semibold">{r.dados.titulo}</h4><p className="text-xs text-suave">Versão {r.versao} · {r.autor} · {r.revisado?'Revisado pela equipe':'Aguardando revisão'} · {new Date(r.criado_em).toLocaleString('pt-BR')}</p>
        <p className="whitespace-pre-wrap text-sm">{r.dados.descricao || r.dados.vinculo || r.dados.escopo}</p>
        <p className="text-xs text-suave">Fonte: {r.dados.fonte} · {r.dados.referencia} · {r.dados.data}</p>
        <details className="text-sm"><summary className="cursor-pointer">Ver dados e lacunas</summary><ValoresDoRegistro r={r} campos={acervo.formularios[r.tipo].campos}/></details>
        <div className="flex gap-2">{acervo.permissoes.editar[r.tipo] && <button className={secundario} onClick={()=>setEditando(r)}>Revisar / corrigir</button>}<button className={secundario} onClick={()=>void verVersoes(r)}>Comparar versões</button></div>
      </article>)}
      {!!versoes.length && <div className="rounded-ficha bg-papel-2 p-4"><div className="flex justify-between"><h4 className="font-semibold">Histórico de versões</h4><button className={secundario} onClick={()=>setVersoes([])}>Fechar</button></div>{versoes.map((r)=><details className="mt-3" key={r.id} open><summary className="cursor-pointer text-sm font-medium">Versão {r.versao} · {r.autor} · {r.revisado?'Revisada':'A revisar'}</summary><ValoresDoRegistro r={r} campos={acervo.formularios[r.tipo].campos}/></details>)}</div>}
      {aba==='comparavel' && acervo.comparaveis.length>0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Empresa</th><th className="p-2">EV/Receita</th><th className="p-2">EV/EBITDA</th></tr></thead><tbody>{acervo.comparaveis.map((c)=><tr key={c.id}><td className="p-2">{c.empresa}</td><td className="p-2">{c.evReceita===null?'Não calculado':`${c.evReceita.toFixed(2)}x`}</td><td className="p-2">{c.evEbitda===null?'Não calculado':`${c.evEbitda.toFixed(2)}x`}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-suave">{acervo.comparaveis[0].limite}</p></div>}
      {aba==='tese' && <Encaixes id={id} aoFalhar={aoFalhar} aoAbrir={aoAbrirOportunidade}/>}
      {aba==='passagem' && <p className="text-xs text-suave">A passagem depende do registro de contrato assinado. Assinatura do mandato e fechamento da transação são eventos distintos. Use a agenda para acompanhar os marcos de execução.</p>}
    </>}
  </section>
}
function ValoresDoRegistro({ r,campos }:{ r:Registro;campos:Campo[] }) {
  return <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{campos.map((c)=><div key={c.id}><dt className="text-xs text-suave">{c.rotulo}</dt><dd className="whitespace-pre-wrap break-words">{r.contatosOmitidos && ['email','telefone'].includes(c.id)?'Acesso restrito':r.dados[c.id]===null || r.dados[c.id]==='' || r.dados[c.id]===undefined?'Não apurado':String(r.dados[c.id])}</dd></div>)}</dl>
}
function EditarRegistro({ tipo,formulario,anterior,podeRevisar,id,aoSalvar,aoCancelar,aoFalhar }:{ tipo:string;formulario:{ titulo:string;campos:Campo[] };anterior:Registro|null;podeRevisar:boolean;id:string;aoSalvar:()=>Promise<void>;aoCancelar:()=>void;aoFalhar:(e:unknown)=>void }) {
  const [dados,setDados]=useState<Valores>(()=>anterior?.dados || Object.fromEntries(formulario.campos.map((c)=>[c.id,c.tipo==='data'?hojeLocal():c.opcoes?.[0] || ''])))
  const [revisado,setRevisado]=useState(false)
  const [ocupado,setOcupado]=useState(false)
  const envio=useRef<{ hash:string;id:string }|null>(null)
  async function salvar(e:FormEvent) {
    e.preventDefault();if(ocupado)return;setOcupado(true)
    const corpo={ serieId:anterior?.serie_id || null,versao:anterior?.versao || 0,tipo,dados,revisado },hash=JSON.stringify(corpo)
    if(envio.current?.hash!==hash)envio.current={ hash,id:crypto.randomUUID() }
    try { await api(`/api/crm/oportunidades/${id}/acervo`,'POST',{ ...corpo,id:envio.current.id });await aoSalvar() } catch(e){aoFalhar(e)}finally{setOcupado(false)}
  }
  return <form onSubmit={salvar} className="space-y-4 rounded-ficha border border-comprador bg-comprador-fundo p-4"><h4 className="font-semibold">{anterior?`Nova versão de ${formulario.titulo}`:formulario.titulo}</h4>
    <fieldset disabled={ocupado} className="grid gap-3 sm:grid-cols-2">{formulario.campos.map((c)=><label className={`text-sm ${c.tipo==='longo'?'sm:col-span-2':''}`} key={c.id}>{c.rotulo}
      {c.tipo==='opcao'?<select className={`${campo} mt-1`} value={String(dados[c.id]??'')} onChange={(e)=>setDados({ ...dados,[c.id]:e.target.value })}>{c.opcoes?.map((v)=><option key={v} value={v}>{labelOpcao(v)}</option>)}</select>
        :c.tipo==='longo'?<textarea className={`${campo} mt-1 min-h-24`} value={String(dados[c.id]??'')} onChange={(e)=>setDados({ ...dados,[c.id]:e.target.value })} maxLength={4000}/>
          :<input className={`${campo} mt-1`} type={c.tipo==='numero'?'number':c.tipo==='data'?'date':'text'} step={c.tipo==='numero'?'any':undefined} value={String(dados[c.id]??'')} onChange={(e)=>setDados({ ...dados,[c.id]:e.target.value })} maxLength={4000} required={['titulo','fonte','referencia','data'].includes(c.id)}/>}
    </label>)}</fieldset>
    {podeRevisar && <label className="flex gap-2 text-sm"><input type="checkbox" checked={revisado} onChange={(e)=>setRevisado(e.target.checked)}/>Revisei a fonte e os dados desta versão</label>}
    <p className="text-xs text-suave">Uma correção cria nova versão e exige nova revisão. Nenhum contato será enviado.</p><div className="flex gap-2"><button className={botao} disabled={ocupado}>Salvar versão</button><button type="button" className={secundario} disabled={ocupado} onClick={aoCancelar}>Cancelar</button></div>
  </form>
}
function Documentos({ ficha,aoFalhar,aoAbrirTrabalho,aoAtualizar }:Pick<Props,'ficha'|'aoFalhar'|'aoAbrirTrabalho'|'aoAtualizar'>) {
  const [documentos,setDocumentos]=useState<Documento[]>([]),[aberto,setAberto]=useState<Documento|null>(null),[selecionados,setSelecionados]=useState<string[]>([])
  const [ocupado,setOcupado]=useState(false),[autorizado,setAutorizado]=useState(false),[aviso,setAviso]=useState('')
  const input=useRef<HTMLInputElement>(null),envio=useRef<string|null>(null),trabalho=useRef<string|null>(null),id=ficha.oportunidade.id
  const carregar=useCallback(async()=>{setDocumentos((await api<{ documentos:Documento[] }>(`/api/crm/oportunidades/${id}/documentos`)).documentos)},[id])
  useEffect(()=>{void carregar().catch(aoFalhar)},[carregar,aoFalhar])
  async function enviar(e:FormEvent) {
    e.preventDefault();const arquivo=input.current?.files?.[0];if(!arquivo || ocupado)return
    if(arquivo.size>2*1024*1024){aoFalhar(new Error('O limite é de 2 MB por arquivo.'));return}
    setOcupado(true)
    try { const base64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(arquivo)})
      envio.current ||= crypto.randomUUID()
      const r=await api<{ documento:Documento }>(`/api/crm/oportunidades/${id}/documentos`,'POST',{id:envio.current,nome:arquivo.name,base64,autorizado})
      setAviso(r.documento.estado==='extraido'?'Documento salvo com texto para conferência.':'Arquivo salvo. Não foi possível obter texto utilizável; confira o original ou envie transcrição.');envio.current=null
      if(input.current)input.current.value='';await carregar();await aoAtualizar()
    }catch(e){aoFalhar(e)}finally{setOcupado(false)}
  }
  async function analisar() {
    if(ocupado)return;setOcupado(true)
    try { trabalho.current ||= crypto.randomUUID();const o=ficha.oportunidade
      const r=await api<{ conversa:Conversa }>('/api/agente/conversas','POST',{id:trabalho.current,titulo:`Análise de documentos · ${o.empresa.nome}`.slice(0,120),mandatoId:o.mandato_id,
        contexto:{ frente:o.frente,oportunidadeId:id,documentoIds:selecionados,empresaId:o.empresa.id }})
      aoAbrirTrabalho(r.conversa.id)
    }catch(e){aoFalhar(e)}finally{setOcupado(false)}
  }
  return <div className="space-y-4"><p className="text-xs text-suave">PDF, DOCX, TXT e MD, até 2 MB e 100 páginas. Digitalizações precisam de transcrição. Cada conteúdo mantém hash e original; a extração não valida assinatura ou conteúdo.</p>
    {ficha.permissoes.editar && <form onSubmit={enviar} className="space-y-3"><input ref={input} type="file" accept=".pdf,.docx,.txt,.md" required aria-label="Documento da oportunidade" onChange={()=>{envio.current=null}}/><label className="flex gap-2 text-sm"><input type="checkbox" checked={autorizado} onChange={(e)=>setAutorizado(e.target.checked)} required/>Tenho autorização para usar este material neste espaço</label><button className={botao} disabled={ocupado}>{ocupado?'Processando…':'Adicionar documento'}</button></form>}
    {aviso && <p role="status" className="text-sm">{aviso}</p>}
    <ul className="divide-y divide-fio">{documentos.map((d)=><li key={d.id} className="flex flex-wrap items-center gap-3 py-3"><input type="checkbox" aria-label={`Selecionar ${d.nome} para análise`} checked={selecionados.includes(d.id)} disabled={d.estado!=='extraido' || ocupado || (!selecionados.includes(d.id) && selecionados.length>=4)} onChange={(e)=>{setSelecionados(e.target.checked?[...selecionados,d.id]:selecionados.filter((id)=>id!==d.id));trabalho.current=null}}/><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{d.nome}</p><p className="text-xs text-suave">{Math.ceil(d.tamanho/1024)} KB · {labelOpcao(d.estado)}</p></div>
      <button className={secundario} onClick={()=>{void api<{documento:Documento}>(`/api/crm/oportunidades/${id}/documentos/${d.id}`).then((r)=>setAberto(r.documento)).catch(aoFalhar)}}>Conferir texto</button>
      <a className={secundario} href={`/api/crm/oportunidades/${id}/documentos/${d.id}?baixar=1`}>Baixar original</a></li>)}</ul>
    {ficha.permissoes.editar && <button className={botao} disabled={!selecionados.length || ocupado} onClick={()=>void analisar()}>Preparar análise dos documentos no agente</button>}
    <p className="text-xs text-suave">Selecione até quatro arquivos. Na conversa, você revisa o pedido antes de enviar texto ao provedor configurado.</p>
    {aberto && <div className="max-h-96 space-y-3 overflow-auto rounded-ficha bg-papel-2 p-4"><div className="flex justify-between"><h4 className="font-semibold">{aberto.nome}</h4><button className={secundario} onClick={()=>setAberto(null)}>Fechar texto</button></div>{aberto.trechos?.map((p,i)=><div key={i}><p className="text-xs font-bold text-suave">{p.local}</p><p className="whitespace-pre-wrap text-sm">{p.texto}</p></div>)}</div>}
  </div>
}
function Encaixes({ id,aoFalhar,aoAbrir }:{id:string;aoFalhar:(e:unknown)=>void;aoAbrir:(id:string)=>void}) {
  const [dados,setDados]=useState<{metodologia:string;resultados:{tese:string;contraparte:string;aderencia:number;cobertura:number;fonte:string;referencia:string;oportunidadeId:string;criterios:{criterio:string;resultado:string}[]}[]}|null>(null)
  const [ocupado,setOcupado]=useState(false)
  async function comparar(){setOcupado(true);try{setDados(await api(`/api/crm/oportunidades/${id}/encaixes`))}catch(e){aoFalhar(e)}finally{setOcupado(false)}}
  return <div className="space-y-3 border-t border-fio pt-4"><button className={botao} disabled={ocupado} onClick={()=>void comparar()}>Comparar com perfis revisados da equipe</button>{dados && <><p className="text-xs text-suave">{dados.metodologia}</p>{!dados.resultados.length && <p className="text-sm">Não há pares revisados e acessíveis. Cadastre e revise os perfis de comprador e alvo em oportunidades distintas.</p>}{dados.resultados.map((r,i)=><article className="rounded-ficha bg-papel-2 p-4 text-sm" key={i}><b>{r.contraparte}</b><p className="mt-1">Tese: {r.tese} · Aderência: {Math.round(r.aderencia*100)}% · Cobertura: {Math.round(r.cobertura*100)}%</p><p className="mt-1 text-xs">{r.criterios.map((c)=>`${c.criterio}: ${c.resultado}`).join(' · ')}</p><p className="my-2 text-xs text-suave">{r.fonte} · {r.referencia}</p><button className={secundario} onClick={()=>aoAbrir(r.oportunidadeId)}>Abrir contraparte</button></article>)}</>}</div>
}
