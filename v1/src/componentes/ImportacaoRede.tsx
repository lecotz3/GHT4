import { useCallback, useEffect, useState } from 'react'
import { api, type PessoaRede } from '../agente/api'
import { camposRede, rotulosRede, lerCsvRede, mapearCabecalho, empresaDoCsv, type CampoRede } from '../agente/csv-rede'
import { IconeRede } from './IconeRede'
const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm'
const botao = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm disabled:opacity-50'
type Linha = { nome:string; cargo:string; organizacao:string; empresaId:string|null; email:string; telefone:string; linkedin:string; evidencia:string;
  acao:'nova'|'existente'|'ignorar'; pessoaId?:string; identidadeRevisada:boolean }
type Previa = { hash:string; selecionadas:number; linhas:{indice:number;nome:string;organizacao:string;erro:string|null;aviso:string|null;candidatos:PessoaRede[]}[] }
type Lote = { id:string;fonte:string;titular:string;pessoas:number;vinculos:number;retirado_em:string|null }
export function ImportacaoRede({ podeEditar, aoFalhar, aoMudar }: { podeEditar:boolean;aoFalhar:(e:unknown)=>void;aoMudar:()=>void }) {
  const [casa,setCasa] = useState<PessoaRede[]>([]), [lotes,setLotes] = useState<Lote[]>([])
  const [titular,setTitular] = useState(''), [fonte,setFonte] = useState(''), [autorizacao,setAutorizacao] = useState('')
  const [compartilhado,setCompartilhado] = useState(false), [ocupado,setOcupado] = useState(false), [aviso,setAviso] = useState('')
  const [texto,setTexto] = useState(''), [separador,setSeparador] = useState<','|';'>(','), [cabecalho,setCabecalho] = useState(0)
  const [tabela,setTabela] = useState<string[][]>([]), [mapa,setMapa] = useState<Record<CampoRede,number>>(mapearCabecalho([]))
  const [linhas,setLinhas] = useState<Linha[]>([]), [previa,setPrevia] = useState<Previa|null>(null), [id,setId] = useState(crypto.randomUUID())
  const [retirar,setRetirar] = useState(''), [motivo,setMotivo] = useState('')
  const carregar = useCallback(async () => {
    try {
      const [c,l] = await Promise.all([api<{pessoas:PessoaRede[]}>('/api/rede/pessoas?lado=ght4&limite=200'),api<{lotes:Lote[]}>('/api/rede/importacoes')])
      setCasa(c.pessoas);setLotes(l.lotes)
    } catch(e) { aoFalhar(e) }
  },[aoFalhar])
  useEffect(()=>{void carregar()},[carregar])
  function preparar(t:string,s:','|';',h:number) {
    setPrevia(null);setLinhas([])
    try { const dados=lerCsvRede(t,s);setTabela(dados);setMapa(mapearCabecalho(dados[h]??[])) }
    catch(e) { setTabela([]);aoFalhar(e) }
  }
  function montar() {
    if(mapa.nome<0) throw new Error('Selecione a coluna Nome.')
    const dados=tabela.slice(cabecalho+1)
    if(!dados.length || dados.length>500) throw new Error('Selecione entre 1 e 500 contatos por arquivo.')
    return dados.map((l,i):Linha=>{
      if(l.length!==(tabela[cabecalho]?.length??0)) throw new Error(`Linha ${i+cabecalho+2}: quantidade de colunas diferente do cabeçalho.`)
      const valor=(c:CampoRede)=>mapa[c]<0?'':l[mapa[c]]??''
      if(valor('nome').trim().length<2)throw new Error(`Linha ${i+cabecalho+2}: nome ausente ou curto demais.`)
      if(valor('email')&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor('email')))throw new Error(`Linha ${i+cabecalho+2}: confira o e-mail ou escolha não importar esta coluna.`)
      if(valor('linkedin')&&!/^https?:\/\/[^\s]+$/i.test(valor('linkedin')))throw new Error(`Linha ${i+cabecalho+2}: informe a URL completa do LinkedIn ou escolha não importar esta coluna.`)
      return {nome:[valor('nome'),valor('sobrenome')].filter(Boolean).join(' '),cargo:valor('cargo'),organizacao:valor('organizacao'),
        empresaId:empresaDoCsv(valor('empresaId')),email:valor('email'),telefone:valor('telefone'),linkedin:valor('linkedin'),
        evidencia:valor('evidencia') || `Contato disponibilizado por ${casa.find(c=>c.id===titular)?.nome ?? 'titular'} na fonte ${fonte}; relação ainda a confirmar.`,
        acao:'nova',identidadeRevisada:false}
    })
  }
  const corpo=(ls:Linha[])=>({id,pessoaGht4Id:titular,fonte,autorizacao,compartilhado,linhas:ls})
  async function conferir() {
    setOcupado(true);setAviso('')
    try { const ls=linhas.length?linhas:montar();setLinhas(ls);setPrevia(await api<Previa>('/api/rede/importacoes/previa','POST',corpo(ls))) }
    catch(e){aoFalhar(e)} finally{setOcupado(false)}
  }
  async function importar() {
    if(!previa)return
    setOcupado(true)
    try { const r=await api<{repetido:boolean;pessoas:number;vinculos:number}>('/api/rede/importacoes','POST',{...corpo(linhas),previaHash:previa.hash})
      setAviso(r.repetido?'Este lote já estava importado.':`${r.pessoas} pessoas e ${r.vinculos} vínculos a confirmar importados.`)
      setLinhas([]);setPrevia(null);setTabela([]);setTexto('');setId(crypto.randomUUID());await carregar();aoMudar()
    } catch(e){aoFalhar(e)}finally{setOcupado(false)}
  }
  async function retirarLote(){setOcupado(true);try{
    await api(`/api/rede/importacoes/${retirar}/retirar`,'POST',{motivo});setRetirar('');setMotivo('');setAviso('Lote retirado dos caminhos. Confirmações independentes da equipe permanecem.');await carregar();aoMudar()
  }catch(e){aoFalhar(e)}finally{setOcupado(false)}}
  function mudarLinha(i:number,valor:string){setLinhas(ls=>ls.map((l,n)=>n===i?{...l,acao:valor==='nova'?'nova':valor==='ignorar'?'ignorar':'existente',pessoaId:valor.length>10?valor:undefined,identidadeRevisada:valor==='nova'}:l));setPrevia(p=>p?{...p,hash:''}:null)}
  const etapa = !titular || fonte.trim().length < 3 || autorizacao.trim().length < 10 || !compartilhado ? 0 : texto ? 2 : 1
  return <section className="space-y-4" aria-label="Importar contatos">
    {podeEditar && <ol aria-label="Etapas da importação" className="grid gap-2 sm:grid-cols-3">{['Fonte e autorização', 'Arquivo e colunas', 'Prévia e revisão'].map((titulo, i) => <li key={titulo} aria-current={i === etapa ? 'step' : undefined} className={`flex items-center gap-3 rounded-lg border p-4 text-xs ${i === etapa ? 'border-comprador-fio bg-comprador-fundo text-comprador' : 'border-fio bg-papel text-suave'}`}><span className="font-mono font-semibold">0{i+1}</span><span className="font-medium">{titulo}</span></li>)}</ol>}
    <p className="text-xs leading-relaxed text-suave">Compartilhe a seleção autorizada pelo titular. Cada relação começa como “a confirmar”; a importação não confirma proximidade nem disponibilidade para apresentar.</p>
    {aviso&&<p role="status" className="rounded-lg border border-comprador-fio bg-comprador-fundo p-4 text-sm text-comprador">{aviso}</p>}
    {podeEditar&&<fieldset disabled={ocupado} className="space-y-5 rounded-xl border border-fio bg-papel p-5 text-sm sm:p-6">
      <legend className="px-2 font-semibold">Preparar uma seleção de contatos</legend>
      {!casa.length && <p className="rounded-lg bg-papel-2 p-3 text-sm">Cadastre primeiro o titular em Pessoas da GHT4. Depois, volte aqui para selecionar seus contatos.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label>Titular dos contatos<select className={campo} value={titular} onChange={e=>{setTitular(e.target.value);setPrevia(null)}}><option value="">Selecione</option>{casa.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label>Fonte<input className={campo} value={fonte} maxLength={160} onChange={e=>{setFonte(e.target.value);setPrevia(null)}} placeholder="Ex.: seleção de contatos profissionais, setembro/2026"/></label>
      </div>
      <label className="block">Registro da autorização do titular<input className={campo} value={autorizacao} maxLength={1000} onChange={e=>{setAutorizacao(e.target.value);setPrevia(null)}} placeholder="Quem autorizou, quando e para qual finalidade"/></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={compartilhado} onChange={e=>{setCompartilhado(e.target.checked);setPrevia(null)}}/>O titular autorizou compartilhar esta seleção com a equipe. Nomes e evidências ficarão visíveis aos usuários da rede; e-mail, telefone e LinkedIn somente a administradores e sócios.</label>
      <div className="rounded-xl border border-dashed border-fio-forte bg-papel-2 p-5">
        <div className="mb-4 flex items-start gap-3"><IconeRede nome="importar" className="mt-1 text-suave" /><div><p className="font-semibold">Escolha sua seleção de contatos</p><p className="mt-1 text-xs leading-relaxed text-suave">CSV de até 2 MB e 500 pessoas. O arquivo é lido no navegador; somente os campos escolhidos seguem para a prévia.</p></div></div>
        <label className="block text-xs font-medium">Arquivo CSV<input key={id} className={`${campo} mt-2 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-papel-2 file:px-3 file:py-1 file:text-xs file:text-tinta`} type="file" accept=".csv,text/csv" onChange={async e=>{const f=e.target.files?.[0];setPrevia(null);setLinhas([]);setTabela([]);setTexto('');if(!f)return;try{if(f.size>2_000_000)throw new Error('Use arquivos de até 2 MB.');const t=await f.text();setTexto(t);setCabecalho(0);preparar(t,separador,0)}catch(erro){aoFalhar(erro)}}}/></label>
        <a href="data:text/csv;charset=utf-8,%EF%BB%BFNome%2CCargo%2CEmpresa%2CCNPJ%2CEmail%2CTelefone%2CLinkedIn%2CEvidencia%0A" download="modelo-contatos-ght4.csv" className="mt-4 inline-block text-xs font-semibold text-comprador underline underline-offset-4">Baixar modelo de colunas</a>
      </div>
      {texto&&<><div className="grid gap-3 sm:grid-cols-2">
        <label>Separador<select className={campo} value={separador} onChange={e=>{const s=e.target.value as ','|';';setSeparador(s);preparar(texto,s,cabecalho)}}><option value=",">Vírgula</option><option value=";">Ponto e vírgula</option></select></label>
        <label>Linha do cabeçalho<select className={campo} value={cabecalho} onChange={e=>{const h=Number(e.target.value);setCabecalho(h);preparar(texto,separador,h)}}>{tabela.slice(0,15).map((r,i)=><option key={i} value={i}>{i+1}: {r.join(' · ').slice(0,100)}</option>)}</select></label>
      </div><div className="grid gap-3 sm:grid-cols-3">{camposRede.map(c=><label key={c} className="text-sm">{rotulosRede[c]}<select className={campo} value={mapa[c]} onChange={e=>{setMapa({...mapa,[c]:Number(e.target.value)});setLinhas([]);setPrevia(null)}}><option value={-1}>Não importar</option>{tabela[cabecalho]?.map((h,i)=><option key={i} value={i}>{h||`Coluna ${i+1}`}</option>)}</select></label>)}</div>
      <p className="text-xs text-suave">Primeiros registros: {tabela.slice(cabecalho+1,cabecalho+4).map(l=>l[mapa.nome]).join(' · ')}. Cargos importados precisam de revisão do nível de decisão; o programa não deduz senioridade.</p></>}
      <button className="rounded-lg bg-tinta px-4 py-3 text-sm font-semibold text-papel disabled:opacity-50" disabled={!texto||!titular||fonte.trim().length<3||autorizacao.trim().length<10||!compartilhado} onClick={()=>void conferir()}>{ocupado?'Conferindo…':'Conferir prévia'}</button>
      {previa&&<div className="space-y-3">
        <p>{previa.selecionadas} contatos selecionados. Confira nomes, empresas e possíveis duplicidades antes de gravar.</p>
        <div className="max-h-96 space-y-2 overflow-auto">{previa.linhas.map(l=><article key={l.indice} className="rounded border border-fio p-3 text-sm"><b>{l.nome}</b> · {l.organizacao||'Sem empresa'}
          <p>{[linhas[l.indice]?.cargo,linhas[l.indice]?.empresaId,linhas[l.indice]?.email,linhas[l.indice]?.telefone,linhas[l.indice]?.linkedin].filter(Boolean).join(' · ')}</p>
          <p className="whitespace-pre-wrap">{linhas[l.indice]?.evidencia}</p>
          {l.aviso&&<p>{l.aviso}</p>}{l.erro&&<p className="text-alerta">{l.erro}</p>}
          <select aria-label={`Destino de ${l.nome}`} className={campo} value={linhas[l.indice]?.acao==='existente'?linhas[l.indice].pessoaId:linhas[l.indice]?.acao} onChange={e=>mudarLinha(l.indice,e.target.value)}>
            <option value="nova">Cadastrar pessoa distinta</option><option value="ignorar">Ignorar esta linha</option>{l.candidatos.filter(c=>c.lado!=='ght4').map(c=><option key={c.id} value={c.id}>Usar {c.nome} · {c.organizacao} · {c.cargo}</option>)}
          </select>{l.candidatos.length>0&&linhas[l.indice]?.acao==='nova'&&<label className="flex gap-2"><input type="checkbox" checked={linhas[l.indice].identidadeRevisada} onChange={e=>{const ok=e.target.checked;setLinhas(ls=>ls.map((v,i)=>i===l.indice?{...v,identidadeRevisada:ok}:v));setPrevia({...previa,hash:''})}}/>Conferi: é outra pessoa.</label>}
        </article>)}</div>
        <button className={botao} onClick={()=>void conferir()}>Atualizar prévia</button>{' '}
        <button className={botao} disabled={!previa.hash||previa.linhas.some(l=>l.erro)||!previa.selecionadas} onClick={()=>void importar()}>Importar seleção revisada</button>
      </div>}
    </fieldset>}
    <h3 className="font-semibold">Lotes compartilhados</h3>
    {!lotes.length&&<p className="rounded-xl border border-dashed border-fio-forte p-6 text-sm text-suave">Seus lotes aparecerão aqui após a primeira importação, com a fonte e o titular de cada seleção.</p>}
    {lotes.map(l=><article key={l.id} className="rounded-xl border border-fio bg-papel p-5 text-sm"><b>{l.fonte}</b><p className="mt-2 text-xs text-suave">{l.titular} · {l.pessoas} pessoas · {l.vinculos} vínculos</p>
      {l.retirado_em?<p>Retirado da rede.</p>:<button className={`${botao} ml-3`} disabled={ocupado} onClick={()=>{setRetirar(l.id);setMotivo('')}}>Retirar lote</button>}
      {retirar===l.id&&<div className="mt-3 space-y-2"><p>Os vínculos sustentados só por este lote deixarão de aparecer nos caminhos. Cadastros usados por outras fontes e confirmações independentes permanecem.</p><label>Motivo<input className={campo} value={motivo} onChange={e=>setMotivo(e.target.value)} maxLength={1000}/></label><button className={botao} disabled={ocupado||motivo.trim().length<10} onClick={()=>void retirarLote()}>Confirmar retirada</button>{' '}<button className={botao} disabled={ocupado} onClick={()=>setRetirar('')}>Cancelar</button></div>}
    </article>)}
  </section>
}
