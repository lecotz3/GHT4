import { useCallback, useEffect, useState } from 'react'
import { api } from '../agente/api'
type Vinculo = { id:string;a_nome:string;b_nome:string;forca:string;periodo:string;evidencia:string;disposicao:string;disposicaoRotulo:string;ativo:boolean;versao:number;podeEditar:boolean }
const campo='w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm'
const botao='rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm disabled:opacity-50'
export function VinculosRede({pessoaId,disposicoes,forcas,aoFalhar,aoMudar}:{pessoaId:string;disposicoes:{id:string;rotulo:string}[];forcas:{id:string;rotulo:string}[];aoFalhar:(e:unknown)=>void;aoMudar:()=>void}) {
  const [vinculos,setVinculos]=useState<Vinculo[]>([]),[editar,setEditar]=useState<Vinculo|null>(null),[ocupado,setOcupado]=useState(false)
  const carregar=useCallback(async()=>{try{setVinculos((await api<{vinculos:Vinculo[]}>(`/api/rede/pessoas/${pessoaId}/vinculos`)).vinculos)}catch(e){aoFalhar(e)}},[pessoaId,aoFalhar])
  useEffect(()=>{void carregar()},[carregar])
  async function salvar(){if(!editar||ocupado)return;setOcupado(true);try{
    const {versao,forca,periodo,evidencia,disposicao,ativo}=editar
    await api(`/api/rede/vinculos/${editar.id}`,'PATCH',{versao,forca,periodo,evidencia,disposicao,ativo})
    setEditar(null);await carregar();aoMudar()
  }catch(e){aoFalhar(e)}finally{setOcupado(false)}}
  return <div className="mt-4 space-y-3 border-t border-fio pt-4">
    {!vinculos.length&&<p className="text-sm">Nenhum vínculo registrado para esta pessoa.</p>}
    {vinculos.map(v=><article key={v.id} className="rounded border border-fio p-3 text-sm"><b>{v.a_nome} ↔ {v.b_nome}</b><p>{v.ativo?v.disposicaoRotulo:'Retirado dos caminhos'}</p><p className="mt-1 whitespace-pre-wrap">{v.evidencia}</p>
      {v.podeEditar&&<button className={`${botao} mt-2`} disabled={ocupado} onClick={()=>setEditar(v)}>Revisar vínculo</button>}
      {editar?.id===v.id&&<form className="mt-3 space-y-3" onSubmit={e=>{e.preventDefault();void salvar()}}>
        <label className="block">Resposta do titular<select className={campo} value={editar.disposicao} onChange={e=>setEditar({...editar,disposicao:e.target.value})}>{disposicoes.map(d=><option key={d.id} value={d.id}>{d.rotulo}</option>)}</select></label>
        <label className="block">Quanto alcança<select className={campo} value={editar.forca} onChange={e=>setEditar({...editar,forca:e.target.value})}>{forcas.map(f=><option key={f.id} value={f.id}>{f.rotulo}</option>)}</select></label>
        <label className="block">Evidência<textarea className={campo} value={editar.evidencia} minLength={10} maxLength={2000} required onChange={e=>setEditar({...editar,evidencia:e.target.value})}/></label>
        <label className="flex gap-2"><input type="checkbox" checked={editar.ativo} onChange={e=>setEditar({...editar,ativo:e.target.checked})}/>Vínculo ativo na rede</label>
        <button className={botao} disabled={ocupado||editar.evidencia.trim().length<10}>Salvar revisão</button>{' '}<button type="button" className={botao} disabled={ocupado} onClick={()=>setEditar(null)}>Cancelar</button>
      </form>}
    </article>)}
  </div>
}
