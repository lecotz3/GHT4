import { useCallback, useEffect, useState } from 'react'
import { api, type FilaReconhecimento, type PendenteReconhecimento, type PessoaRede } from '../agente/api'

const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm focus:outline-comprador'
const botao = 'rounded-ficha bg-tinta px-4 py-2.5 text-sm font-semibold text-papel disabled:opacity-50'
const secundario = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm hover:bg-papel-2 disabled:opacity-50'

/**
 * Passada de reconhecimento.
 *
 * A rede não enche pedindo à casa que a mapeie. "Liste quem você conhece no
 * setor" é um esforço de memória sem âncora, e ninguém responde. Mostrar o nome
 * e perguntar se reconhece é barato — e é por isso que esta tela existe com uma
 * pessoa por vez, quatro botões, e nada mais na frente.
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

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const busca = new URLSearchParams()
      if (quemId) busca.set('pessoaGht4Id', quemId)
      if (empresa.trim()) busca.set('empresa', empresa.trim())
      const [f, c] = await Promise.all([
        api<FilaReconhecimento>(`/api/rede/reconhecimento?${busca}`),
        api<{ pessoas: PessoaRede[] }>('/api/rede/pessoas?lado=ght4&limite=200'),
      ])
      setFila(f); setCasa(c.pessoas)
      if (!quemId && f.quem) setQuemId(f.quem.id)
    } catch (e) { aoFalhar(e) } finally { setCarregando(false) }
  }, [quemId, empresa, aoFalhar])

  useEffect(() => { void carregar() }, [carregar])

  async function responder(alvo: PendenteReconhecimento, resposta: string, positiva: boolean) {
    if (positiva && !abrindo) { setAbrindo({ alvo, resposta }); setEvidencia(''); setObservacao(''); return }
    if (ocupado) return
    setOcupado(true)
    try {
      await api('/api/rede/reconhecimento', 'POST', {
        id: crypto.randomUUID(), pessoaGht4Id: quemId || undefined, pessoaAlvoId: alvo.id,
        resposta, observacao, evidencia: positiva ? evidencia : '', forca,
      })
      setAbrindo(null); setEvidencia(''); setObservacao('')
      setAviso(`${alvo.nome}: respondido.`)
      aoMudar()
      await carregar()
    } catch (e) { aoFalhar(e) } finally { setOcupado(false) }
  }

  if (carregando && !fila) return <p role="status" className="text-sm">Montando a fila…</p>
  if (!fila) return null

  const atual = fila.pendentes[0]
  return <section className="space-y-4" aria-label="Passada de reconhecimento">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">Respondendo por
        <select className={`${campo} mt-1`} value={quemId} onChange={(e) => { setQuemId(e.target.value); setAbrindo(null) }} disabled={ocupado}>
          <option value="">— escolha uma pessoa da GHT4 —</option>
          {casa.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ''}</option>)}
        </select></label>
      <label className="block text-sm">Filtrar por empresa <span className="text-suave">(opcional)</span>
        <input className={`${campo} mt-1`} value={empresa} onChange={(e) => { setEmpresa(e.target.value); setAbrindo(null) }}
          maxLength={160} disabled={ocupado} placeholder="Escreva o nome como está cadastrado" /></label>
    </div>

    {fila.aviso && <p className="rounded-ficha border border-fio bg-papel-2 p-4 text-sm">{fila.aviso}</p>}
    {aviso && <p role="status" className="text-sm text-suave">{aviso}</p>}

    {fila.quem && <div className="rounded-ficha border border-fio bg-papel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-suave">{fila.respondidas} de {fila.total} respondidas</p>
        <p className="text-sm font-semibold">{fila.cobertura}% apurado</p>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-ficha bg-papel-2">
        <div className="h-1.5 rounded-ficha bg-tinta" style={{ width: `${fila.cobertura}%` }} />
      </div>
    </div>}

    {!atual && fila.quem && <p className="rounded-ficha border border-dashed border-fio p-5 text-sm text-suave">
      {fila.total
        ? `Tudo perguntado para ${fila.quem.nome} neste recorte. Troque a pessoa ou o filtro de empresa para continuar.`
        : 'Nenhuma pessoa de empresa cadastrada neste recorte. Cadastre quem manda nas empresas-alvo antes de rodar a passada.'}
    </p>}

    {atual && <article className="rounded-ficha border border-fio bg-papel p-5">
      <p className="text-xs text-suave">{atual.organizacao || 'Empresa não informada'}</p>
      <h4 className="mt-1 text-xl font-semibold">{atual.nome}</h4>
      <p className="mt-1 text-sm text-suave">{atual.cargo || 'Cargo não informado'}</p>
      {atual.origem === 'cadastro_publico' && <p className="mt-2 text-xs text-suave">
        Do quadro societário público · {atual.origem_referencia}
      </p>}

      {!abrindo && <>
        <p className="mt-4 text-sm">Você conhece esta pessoa?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {fila.respostas.map((r) => <button key={r.id} className={r.gera ? botao : secundario} disabled={ocupado}
            onClick={() => void responder(atual, r.id, Boolean(r.gera))}>{r.rotulo}</button>)}
        </div>
        <p className="mt-3 text-xs text-suave">
          "Não conheço" também é resposta útil: fecha a pergunta, evita que outra pessoa da casa a repita, e é o que
          separa "ainda não apuramos" de "apuramos e não há caminho".
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
          <button className={botao} disabled={ocupado || evidencia.trim().length < 10}>{ocupado ? 'Salvando…' : 'Salvar resposta'}</button>
          <button type="button" className={secundario} onClick={() => setAbrindo(null)} disabled={ocupado}>Cancelar</button>
        </div>
      </form>}
    </article>}

    {fila.pendentes.length > 1 && <p className="text-xs text-suave">
      Depois desta, faltam {fila.pendentes.length - 1} neste recorte. A fila vem por poder de decisão: quem aprova a
      transação aparece antes de quem não aprova.
    </p>}
  </section>
}
