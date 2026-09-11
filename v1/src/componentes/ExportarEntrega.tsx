import { useRef, useState } from 'react'
import { api } from '../agente/api'
import { secundario } from '../agente/prospeccao'
export function ExportarEntrega({ origem,aoFalhar }:{ origem:{ oportunidadeId?:string;conversaId?:string;versao:number;selecao?:{id:string;versao:number}[] };aoFalhar:(e:unknown)=>void }) {
  const [ocupado,setOcupado]=useState(false),[exportacao,setExportacao]=useState<{id:string;hash:string}|null>(null)
  const envio=useRef<{hash:string;id:string}|null>(null)
  async function gerar() {
    if(ocupado)return;setOcupado(true)
    const hash=JSON.stringify(origem)
    if(envio.current?.hash!==hash)envio.current={hash,id:crypto.randomUUID()}
    try {const r=await api<{exportacao:{id:string;hash:string}}>('/api/exportacoes','POST',{...origem,id:envio.current.id});setExportacao(r.exportacao)}catch(e){aoFalhar(e)}finally{setOcupado(false)}
  }
  return <div className="space-y-3 rounded-ficha border border-fio bg-papel p-4"><div className="flex flex-wrap items-center gap-3"><button className={secundario} onClick={()=>void gerar()} disabled={ocupado}>{ocupado?'Gerando corte…':'Preparar exportação Excel / PDF'}</button><p className="text-xs text-suave">Gera uma versão fixa dos dados salvos. Rascunhos não salvos ficam fora da entrega.</p></div>
    {exportacao && <div className="space-y-2"><div className="flex flex-wrap gap-2">{['xlsx','pdf','json'].map((f)=><a className={secundario} key={f} href={`/api/exportacoes/${exportacao.id}/${f}`}>{f==='xlsx'?'Baixar Excel':f==='pdf'?'Baixar PDF':'Dados e metodologia'}</a>)}</div><p className="break-all text-xs text-suave">Versão: {exportacao.hash}. Os três arquivos usam o mesmo corte. Compartilhe somente com destinatários autorizados.</p></div>}
  </div>
}
