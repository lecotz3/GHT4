import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ErroApi, type FilaReconhecimento, type PendenteReconhecimento, type PessoaRede } from '../agente/api'
import { IconeRede } from './IconeRede'

const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm focus:outline-comprador'
const botao = 'rounded-ficha bg-tinta px-4 py-2.5 text-sm font-semibold text-papel disabled:opacity-50'
const secundario = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm hover:bg-papel-2 disabled:opacity-50'
const explicacoes: Record<string, string> = {
  posso_apresentar: 'Conheço e aceito avaliar a aproximação.',
  conheco: 'Tenho uma relação, sem confirmar a apresentação.',
  talvez: 'Há um ponto em comum que precisa ser conferido.',
  nao_conheco: 'Não tenho uma relação com esta pessoa.',
  nao_intermediar: 'Prefiro não participar desta aproximação.',
  desatualizado: 'O cargo, a empresa ou a relação mudou.',
}

/**
 * Passada de reconhecimento.
 *
 * A rede não enche pedindo à casa que a mapeie. "Liste quem você conhece no
 * setor" é um esforço de memória sem âncora, e ninguém responde. Mostrar o nome
 * e perguntar se reconhece é barato — e é por isso que esta tela existe com uma
 * pessoa por vez, com respostas curtas e a evidência quando necessária.
 *
 * O "não conheço" é o registro mais importante daqui. Sem ele o produto não
 * distingue "a rede não foi consultada" de "foi consultada e não há caminho",
 * e essas duas respostas levam a decisões opostas.
 */
export function Reconhecimento({ aoFalhar, aoMudar }: { aoFalhar: (e: unknown) => void; aoMudar: () => void }) {
  const [fila, setFila] = useState<FilaReconhecimento | null>(null)
  const [casa, setCasa] = useState<PessoaRede[]>([])
  const [quemId, setQuemId] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const [abrindo, setAbrindo] = useState<{ alvo: PendenteReconhecimento; resposta: string } | null>(null)
  const [evidencia, setEvidencia] = useState('')
  const [forca, setForca] = useState('indireta')
  const [observacao, setObservacao] = useState('')
  const [revisao,setRevisao] = useState(false)
  const [revisaoOffset,setRevisaoOffset] = useState(0)
  const requisicao = useRef(0)

  const carregar = useCallback(async () => {
    const n = ++requisicao.current
    setCarregando(true)
    try {
      const busca = new URLSearchParams()
      if (quemId) busca.set('pessoaGht4Id', quemId)
      if (empresa.trim()) busca.set('empresa', empresa.trim())
      busca.set('revisao',String(revisao))
      busca.set('offset',String(revisaoOffset))
      const [f, c] = await Promise.all([
        api<FilaReconhecimento>(`/api/rede/reconhecimento?${busca}`),
        api<{ pessoas: PessoaRede[] }>('/api/rede/pessoas?lado=ght4&limite=200'),
      ])
      if (n !== requisicao.current) return
      setFila(f); setCasa(c.pessoas)
      if (!quemId && f.quem) setQuemId(f.quem.id)
    } catch (e) { if (n === requisicao.current) { setFila(null); aoFalhar(e) } } finally { if (n === requisicao.current) setCarregando(false) }
  }, [quemId, empresa, revisao, revisaoOffset, aoFalhar])

  const invalidar = useCallback(() => { requisicao.current++ }, [])
  useEffect(() => { void carregar(); return invalidar }, [carregar, invalidar])

  function mudarRecorte() {
    requisicao.current++; setCarregando(true); setAbrindo(null); setRevisaoOffset(0); setAviso('')
  }

  async function responder(alvo: PendenteReconhecimento, resposta: string, positiva: boolean) {
    if (ocupado || carregando || !fila?.podeResponder || fila.quem?.id !== quemId) return
    if (positiva && !abrindo) { setAbrindo({ alvo, resposta }); setEvidencia(''); setObservacao(''); setForca('indireta'); return }
    setOcupado(true)
    try {
      await api('/api/rede/reconhecimento', 'POST', {
        id: crypto.randomUUID(), pessoaGht4Id: fila.quem.id, pessoaAlvoId: alvo.id,
        resposta, observacao, evidencia: positiva ? evidencia : '', forca,
        versao: alvo.resposta_versao,
      })
      setAbrindo(null); setEvidencia(''); setObservacao('')
      setAviso(`${alvo.nome}: respondido.`)
      aoMudar()
      await carregar()
    } catch (e) {
      aoFalhar(e)
      if (e instanceof ErroApi && e.status === 409) { setAbrindo(null); await carregar() }
    } finally { setOcupado(false) }
  }

  if (carregando && !fila) return <p role="status" className="text-sm">Montando a fila…</p>
  if (!fila) return <button className={secundario} onClick={() => void carregar()}>Tentar carregar a rodada novamente</button>

  const atual = fila.pendentes[0]
  return <section className="space-y-4" aria-label="Passada de reconhecimento">
    <div className="grid gap-4 rounded-xl border border-fio bg-papel p-5 sm:grid-cols-2">
      <label className="block text-sm">Respondendo por
        <select className={`${campo} mt-1`} value={quemId} onChange={(e) => { mudarRecorte(); setQuemId(e.target.value) }} disabled={ocupado}>
          <option value="">— escolha uma pessoa da GHT4 —</option>
          {casa.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ''}</option>)}
        </select></label>
      <label className="block text-sm">Filtrar por empresa <span className="text-suave">(opcional)</span>
        <input className={`${campo} mt-1`} value={empresa} onChange={(e) => { mudarRecorte(); setEmpresa(e.target.value) }}
          maxLength={160} disabled={ocupado} placeholder="Escreva o nome como está cadastrado" /></label>
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={revisao} disabled={ocupado} onChange={e=>{mudarRecorte();setRevisao(e.target.checked)}}/>Revisar respostas já registradas</label>
    {revisao&&<div className="flex flex-wrap gap-2"><button className={secundario} disabled={ocupado||carregando||revisaoOffset===0} onClick={()=>{requisicao.current++;setCarregando(true);setRevisaoOffset(n=>n-1);setAbrindo(null)}}>Resposta anterior</button><button className={secundario} disabled={ocupado||carregando||revisaoOffset>=fila.respondidas-1} onClick={()=>{requisicao.current++;setCarregando(true);setRevisaoOffset(n=>n+1);setAbrindo(null)}}>Próxima resposta</button></div>}

    {fila.aviso && <p className="rounded-ficha border border-fio bg-papel-2 p-4 text-sm">{fila.aviso}</p>}
    {fila.quem&&!fila.podeResponder&&<p className="text-sm">Você pode consultar esta fila. Para responder, selecione sua própria pessoa da GHT4 ou peça ao administrador que vincule sua conta ao cadastro.</p>}
    {aviso && <p role="status" className="flex items-center gap-2 rounded-lg border border-comprador-fio bg-comprador-fundo p-3 text-sm text-comprador"><IconeRede nome="certo" />{aviso}</p>}
    {carregando && <p role="status" className="rounded-xl border border-fio bg-papel p-6 text-sm text-suave">Atualizando a rodada…</p>}

    {!carregando && fila.quem && <div className="rounded-xl border border-fio bg-papel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-suave">{fila.respondidas} de {fila.total} respondidas</p>
        <p className="text-sm font-semibold">{fila.cobertura}% apurado</p>
      </div>
      <progress className="rede-progresso mt-3 w-full" value={fila.respondidas} max={fila.total || 1} aria-label="Respostas recebidas neste recorte" />
    </div>}

    {!carregando && !atual && fila.quem && <p className="rounded-xl border border-dashed border-fio-forte p-8 text-center text-sm text-suave">
      {fila.total
        ? `Tudo perguntado para ${fila.quem.nome} neste recorte. Troque a pessoa ou o filtro de empresa para continuar.`
        : 'Nenhuma pessoa de empresa cadastrada neste recorte. Cadastre quem manda nas empresas-alvo antes de rodar a passada.'}
    </p>}

    {!carregando && atual && <article className="overflow-hidden rounded-xl border border-fio bg-papel p-5 sm:p-7">
      <p className="mb-5 inline-flex items-center gap-2 rounded-md bg-papel-2 px-3 py-1.5 text-[11px] font-medium text-suave"><IconeRede nome="empresa" className="size-4" />{atual.organizacao || 'Empresa não informada'}</p>
      <h4 className="text-2xl font-semibold tracking-tight">{atual.nome}</h4>
      <p className="mt-1 text-sm text-suave">{atual.cargo || 'Cargo não informado'}</p>
      {atual.resposta_anterior&&<p className="mt-2 text-sm">Resposta atual: {fila.respostas.find(r=>r.id===atual.resposta_anterior)?.rotulo}</p>}
      {atual.origem === 'cadastro_publico' && <p className="mt-2 text-xs text-suave">
        Do quadro societário público · {atual.origem_referencia}
      </p>}

      {!abrindo && <>
        <p className="mt-6 border-t border-fio pt-5 text-sm font-semibold">Você conhece esta pessoa?</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {fila.respostas.map((r) => <button key={r.id} className={`rounded-lg border p-4 text-left transition disabled:opacity-50 ${r.id === 'posso_apresentar' ? 'border-comprador-fio bg-comprador-fundo text-comprador hover:border-comprador' : 'border-fio bg-papel hover:border-fio-forte hover:bg-papel-2'}`} disabled={ocupado || carregando || !fila.podeResponder}
            onClick={() => void responder(atual, r.id, Boolean(r.gera))}><span className="block text-sm font-semibold">{r.rotulo}</span><span className={`mt-2 block text-xs leading-relaxed ${r.id === 'posso_apresentar' ? 'text-comprador' : 'text-suave'}`}>{explicacoes[r.id]}</span></button>)}
        </div>
        <p className="mt-3 text-xs text-suave">
          “Não conheço” também ajuda: registra que esta pergunta já foi feita a você. Cada membro responde pelas próprias relações.
        </p>
      </>}

      {abrindo?.alvo.id === atual.id && <form className="mt-4 space-y-3 border-t border-fio pt-4"
        onSubmit={(e) => { e.preventDefault(); void responder(atual, abrindo.resposta, true) }}>
        <label className="block text-sm">De onde vocês se conhecem
          <textarea className={`${campo} mt-1 min-h-16 resize-y`} value={evidencia} onChange={(e) => setEvidencia(e.target.value)}
            required minLength={10} maxLength={2000} disabled={ocupado}
            placeholder="Ex.: dividimos a diretoria comercial da Nordeste Química entre 2012 e 2016." />
          <span className="mt-1 block text-xs text-suave">Aparece inteira no resultado do agente, como base da conversa.</span></label>
        <label className="block text-sm">Quanto você alcança essa pessoa
          <select className={`${campo} mt-1`} value={forca} onChange={(e) => setForca(e.target.value)} disabled={ocupado}>
            <option value="direta">Direta — falamos hoje, uma mensagem resolve</option>
            <option value="indireta">Indireta — nos conhecemos, mas a aproximação pede contexto</option>
            <option value="fraca">Fraca — há um ponto em comum, não um relacionamento</option>
          </select></label>
        <label className="block text-sm">Observação <span className="text-suave">(opcional)</span>
          <input className={`${campo} mt-1`} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} disabled={ocupado} /></label>
        <div className="flex flex-wrap gap-2">
          <button className={botao} aria-describedby={evidencia.trim().length < 10 ? 'evidencia-minima-rede' : undefined} disabled={ocupado || carregando || evidencia.trim().length < 10}>{ocupado ? 'Salvando…' : 'Salvar resposta'}</button>
          <button type="button" className={secundario} onClick={() => setAbrindo(null)} disabled={ocupado}>Cancelar</button>
        </div>
        {evidencia.trim().length < 10 && <p id="evidencia-minima-rede" className="text-xs text-suave">Conte de onde se conhecem em pelo menos 10 caracteres para salvar a resposta.</p>}
      </form>}
    </article>}

    {fila.pendentes.length > 1 && <p className="text-xs text-suave">
      {revisao ? 'Revisando respostas registradas.' : `Depois desta, faltam ${Math.max(0,fila.total-fila.respondidas-1)} neste recorte.`} A fila vem por poder de decisão: quem aprova a
      transação aparece antes de quem não aprova.
    </p>}
  </section>
}
