import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ErroApi, type PessoaRede } from '../agente/api'

const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm focus:outline-comprador'
const botao = 'rounded-ficha bg-tinta px-4 py-2.5 text-sm font-semibold text-papel disabled:opacity-50'
const secundario = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm hover:bg-papel-2 disabled:opacity-50'
const aba = (ativa: boolean) => `rounded-ficha px-3 py-1.5 text-sm ${ativa ? 'bg-tinta font-semibold text-papel' : 'border border-fio-forte bg-papel hover:bg-papel-2'}`

type Lado = 'ght4' | 'mercado' | 'externo'
type Opcao = { id: string; rotulo: string }
type Estado = {
  senioridades: (Opcao & { peso: number; lideranca: boolean })[]
  tipos: (Opcao & { frase: string })[]
  forcas: (Opcao & { peso: number; explicacao: string })[]
  disposicoes: (Opcao & { confirmada: boolean; utilizavel: boolean })[]
  categorias: (Opcao & { descricao: string })[]
  lados: (Opcao & { descricao: string })[]
  totais: { ght4: number; mercado: number; externo: number; vinculos: number }
  podeEditar: boolean; veContatos: boolean
}

const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir esta ação.'
const vazio = { nome: '', cargo: '', senioridade: 'outro', organizacao: '', empresaId: '', email: '', telefone: '', linkedin: '', observacoes: '' }

/**
 * Rede de relacionamento da casa.
 *
 * Esta tela é o único lugar de onde a habilidade "Abrir caminho até a
 * liderança" tira o que sabe. O cadastro público não traz uma pessoa sequer —
 * nem sócio, nem diretor, nem contato —, então uma empresa só tem caminho de
 * acesso depois que alguém da casa registrar aqui quem conhece lá dentro.
 *
 * As três abas são as três posições de um caminho: começa na GHT4, pode passar
 * por um intermediário e termina em quem decide na empresa. Cadastrar pessoas
 * sem ligar ninguém a ninguém produz uma agenda, não uma rede — e é o vínculo
 * que responde à pergunta que interessa.
 */
export function Rede({ aoVoltar, aoExpirar }: { aoVoltar: () => void; aoExpirar: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [pessoas, setPessoas] = useState<PessoaRede[]>([])
  const [lado, setLado] = useState<Lado>('mercado')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(vazio)
  const [ligar, setLigar] = useState<PessoaRede | null>(null)

  const falhou = useCallback((e: unknown) => {
    if (e instanceof ErroApi && e.status === 401) { aoExpirar(); return }
    setErro(mensagem(e))
  }, [aoExpirar])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [e, p] = await Promise.all([
        api<Estado>('/api/rede'),
        api<{ pessoas: PessoaRede[] }>(`/api/rede/pessoas?lado=${lado}&busca=${encodeURIComponent(busca)}`),
      ])
      setEstado(e); setPessoas(p.pessoas); setErro('')
    } catch (e) { falhou(e) } finally { setCarregando(false) }
  }, [lado, busca, falhou])

  useEffect(() => { void carregar() }, [carregar])

  async function cadastrar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    setOcupado(true); setErro(''); setAviso('')
    try {
      await api('/api/rede/pessoas', 'POST', {
        id: crypto.randomUUID(), lado,
        nome: form.nome, cargo: form.cargo,
        senioridade: lado === 'mercado' ? form.senioridade : 'outro',
        organizacao: lado === 'ght4' ? '' : form.organizacao,
        empresaId: lado === 'mercado' && form.empresaId ? form.empresaId : null,
        email: form.email || null, telefone: form.telefone || null, linkedin: form.linkedin || null,
        observacoes: form.observacoes,
      })
      setForm(vazio); setAviso(`${form.nome} entrou na rede.`); await carregar()
    } catch (falha) { falhou(falha) } finally { setOcupado(false) }
  }

  if (carregando && !estado) return <main className="mx-auto max-w-6xl px-5 py-7"><p role="status">Abrindo a rede…</p></main>

  const daCasa = lado === 'ght4'
  const doMercado = lado === 'mercado'
  const descricaoDoLado = estado?.lados.find((l) => l.id === lado)?.descricao ?? ''
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-7 md:px-8">
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto">
        <h2 className="text-2xl font-semibold">Rede de relacionamento</h2>
        <p className="mt-1 text-sm text-suave">
          {estado ? `${estado.totais.ght4} da GHT4 · ${estado.totais.mercado} das empresas · ${estado.totais.externo} intermediários · ${estado.totais.vinculos} vínculos ativos` : ''}
        </p>
      </div>
      <button className={secundario} onClick={aoVoltar} disabled={ocupado}>Voltar ao agente</button>
    </div>

    <p className="rounded-ficha border border-fio bg-papel p-4 text-sm leading-relaxed">
      O cadastro público não informa dirigentes nem contatos. Tudo o que o agente usa para abrir caminho até a liderança de uma
      empresa é o que a casa registrar aqui — e cada vínculo exige a evidência que o sustenta, porque um caminho que ninguém
      consegue justificar termina numa ligação constrangedora. A busca vai até duas ligações: da GHT4, opcionalmente por um
      intermediário, até quem decide.
      {estado && !estado.veContatos && ' Seu acesso não exibe e-mail e telefone: você vê que existem, não os valores.'}
    </p>

    {erro && <p role="alert" className="text-sm text-alerta">{erro}</p>}
    {aviso && <p role="status" className="text-sm">{aviso}</p>}

    <div className="flex flex-wrap items-center gap-2">
      {(['mercado', 'externo', 'ght4'] as Lado[]).map((l) => <button key={l} className={aba(lado === l)}
        onClick={() => { setLado(l); setLigar(null) }} disabled={ocupado}>
        {l === 'mercado' ? 'Quem decide nas empresas' : l === 'externo' ? 'Intermediários' : 'Pessoas da GHT4'}
      </button>)}
      <input className={`${campo} ml-auto max-w-xs`} value={busca} onChange={(e) => setBusca(e.target.value)}
        placeholder="Filtrar por nome, cargo ou empresa" maxLength={120} aria-label="Filtrar a rede" />
    </div>
    <p className="text-xs text-suave">{descricaoDoLado}</p>

    {estado?.podeEditar && <form onSubmit={cadastrar} className="space-y-4 rounded-ficha border border-fio bg-papel p-5">
      <h3 className="font-semibold">{daCasa ? 'Cadastrar alguém da GHT4' : doMercado ? 'Cadastrar alguém de uma empresa' : 'Cadastrar um intermediário'}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Nome<input className={`${campo} mt-1`} value={form.nome} required minLength={2} maxLength={120}
          onChange={(e) => setForm({ ...form, nome: e.target.value })} disabled={ocupado} /></label>
        <label className="block text-sm">Cargo<input className={`${campo} mt-1`} value={form.cargo} maxLength={120}
          onChange={(e) => setForm({ ...form, cargo: e.target.value })} disabled={ocupado} placeholder={daCasa ? 'Ex.: Sócio' : 'Ex.: Diretor financeiro'} /></label>
      </div>
      {!daCasa && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">{doMercado ? 'Empresa' : 'Onde está hoje'}
            <input className={`${campo} mt-1`} value={form.organizacao} maxLength={160}
              onChange={(e) => setForm({ ...form, organizacao: e.target.value })} disabled={ocupado}
              placeholder={doMercado ? 'Escreva como aparece no cadastro' : 'Ex.: Logística Beta'} />
            {doMercado && <span className="mt-1 block text-xs text-suave">O agente encontra a empresa pelo nome escrito igual. Grafias diferentes não se juntam sozinhas.</span>}
          </label>
          {doMercado && <label className="block text-sm">Nível de decisão
            <select className={`${campo} mt-1`} value={form.senioridade} onChange={(e) => setForm({ ...form, senioridade: e.target.value })} disabled={ocupado}>
              {estado.senioridades.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
            </select>
            <span className="mt-1 block text-xs text-suave">É o que decide se esta pessoa aprova a transação ou é a porta de entrada para quem aprova.</span>
          </label>}
        </div>
        {doMercado && <label className="block text-sm">Raiz do CNPJ no catálogo <span className="text-suave">(opcional, formato cnpj12345678)</span>
          <input className={`${campo} mt-1`} value={form.empresaId} onChange={(e) => setForm({ ...form, empresaId: e.target.value })}
            pattern="cnpj[0-9]{8}|" maxLength={12} disabled={ocupado} />
          <span className="mt-1 block text-xs text-suave">Com o vínculo ao catálogo, o agente encontra esta pessoa mesmo que o nome da empresa esteja escrito de outro jeito. A raiz agrupa matriz e filiais.</span>
        </label>}
      </>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">E-mail<input className={`${campo} mt-1`} type="email" value={form.email} maxLength={200}
          onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={ocupado} /></label>
        <label className="block text-sm">Telefone<input className={`${campo} mt-1`} value={form.telefone} maxLength={200}
          onChange={(e) => setForm({ ...form, telefone: e.target.value })} disabled={ocupado} /></label>
        <label className="block text-sm">LinkedIn<input className={`${campo} mt-1`} value={form.linkedin} maxLength={200}
          onChange={(e) => setForm({ ...form, linkedin: e.target.value })} disabled={ocupado} /></label>
      </div>
      <p className="text-xs text-suave">Deixe em branco o que você não souber. E-mail ausente pode continuar ausente: uma apresentação pelo próprio membro dispensa o endereço, e montar um por padrão de domínio é chute.</p>
      <label className="block text-sm">Observações<textarea className={`${campo} mt-1 min-h-16 resize-y`} value={form.observacoes} maxLength={2000}
        onChange={(e) => setForm({ ...form, observacoes: e.target.value })} disabled={ocupado} /></label>
      <button className={botao} disabled={ocupado || form.nome.trim().length < 2}>{ocupado ? 'Salvando…' : 'Cadastrar na rede'}</button>
    </form>}

    <section className="space-y-3" aria-label="Pessoas da rede">
      {!pessoas.length && <p className="rounded-ficha border border-dashed border-fio p-5 text-sm text-suave">
        {busca ? 'Nenhuma pessoa corresponde a este filtro.'
          : daCasa ? 'Ninguém da GHT4 cadastrado ainda. Sem isso, nenhum caminho pode começar.'
            : doMercado ? 'Nenhuma pessoa de empresa cadastrada ainda. Comece por quem você já conhece.'
              : 'Nenhum intermediário cadastrado. Entram aqui as pessoas que fazem a ponte sem ser da casa nem da empresa-alvo.'}
      </p>}
      {pessoas.map((p) => <article key={p.id} className="rounded-ficha border border-fio bg-papel p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{p.nome}{p.cargo ? ` · ${p.cargo}` : ''}</p>
            <p className="mt-1 text-xs text-suave">
              {daCasa ? 'GHT4' : p.organizacao || 'Organização não informada'}
              {doMercado && ` · ${p.senioridadeRotulo}`}
              {p.empresaId ? ` · ${p.empresaId}` : ''}
            </p>
            <p className="mt-1 text-xs text-suave">
              {p.camposOmitidos.length
                ? `Contato registrado (${p.camposOmitidos.join(', ')}), oculto para o seu acesso.`
                : [p.email, p.telefone, p.linkedin].filter(Boolean).join(' · ') || 'Sem dados de contato registrados.'}
            </p>
            {p.observacoes && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-suave">{p.observacoes}</p>}
          </div>
          {estado?.podeEditar && <button className={secundario} onClick={() => { setLigar(ligar?.id === p.id ? null : p); setAviso('') }} disabled={ocupado}>
            {ligar?.id === p.id ? 'Fechar' : 'Registrar vínculo'}
          </button>}
        </div>
        {ligar?.id === p.id && estado && <FormularioVinculo pessoa={p} estado={estado} aoFalhar={falhou}
          aoSalvar={(texto) => { setLigar(null); setAviso(texto); void carregar() }} />}
      </article>)}
    </section>
  </main>
}

/* Um vínculo liga duas pessoas quaisquer, não necessariamente uma da casa e uma
   da empresa: o elo entre o intermediário e o diretor não toca a GHT4, e sem ele
   o caminho de duas pontas seria impossível de cadastrar. */
function FormularioVinculo({ pessoa, estado, aoSalvar, aoFalhar }: {
  pessoa: PessoaRede; estado: Estado; aoSalvar: (aviso: string) => void; aoFalhar: (e: unknown) => void
}) {
  const sugerido: Lado = pessoa.lado === 'ght4' ? 'mercado' : 'ght4'
  const [ladoOutro, setLadoOutro] = useState<Lado>(sugerido)
  const [candidatos, setCandidatos] = useState<PessoaRede[]>([])
  const [outroId, setOutroId] = useState('')
  const [tipo, setTipo] = useState('trabalharam_juntos')
  const [forca, setForca] = useState('indireta')
  const [periodo, setPeriodo] = useState('')
  const [evidencia, setEvidencia] = useState('')
  const [disposicao, setDisposicao] = useState('nao_confirmado')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vivo = true
    setOutroId('')
    api<{ pessoas: PessoaRede[] }>(`/api/rede/pessoas?lado=${ladoOutro}&limite=200`)
      .then((r) => { if (!vivo) return
        const livres = r.pessoas.filter((c) => c.id !== pessoa.id)
        setCandidatos(livres); setOutroId(livres[0]?.id ?? '') })
      .catch(aoFalhar)
    return () => { vivo = false }
  }, [ladoOutro, pessoa.id, aoFalhar])

  async function salvar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    setOcupado(true)
    try {
      await api('/api/rede/vinculos', 'POST', { id: crypto.randomUUID(), pessoaAId: pessoa.id, pessoaBId: outroId, tipo, forca, periodo, evidencia, disposicao })
      aoSalvar(`Vínculo registrado para ${pessoa.nome}.`)
    } catch (falha) { aoFalhar(falha) } finally { setOcupado(false) }
  }

  const explicacao = estado.forcas.find((f) => f.id === forca)?.explicacao ?? ''
  const escolhida = estado.disposicoes.find((d) => d.id === disposicao)
  return <form onSubmit={salvar} className="mt-4 space-y-3 border-t border-fio pt-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">Ligar {pessoa.nome} a alguém de
        <select className={`${campo} mt-1`} value={ladoOutro} onChange={(e) => setLadoOutro(e.target.value as Lado)} disabled={ocupado}>
          <option value="ght4">GHT4</option><option value="externo">Intermediários</option><option value="mercado">Empresas</option>
        </select></label>
      <label className="block text-sm">Quem
        <select className={`${campo} mt-1`} value={outroId} onChange={(e) => setOutroId(e.target.value)} disabled={ocupado || !candidatos.length} required>
          {candidatos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ''}{c.organizacao ? ` — ${c.organizacao}` : ''}</option>)}
        </select></label>
    </div>
    {!candidatos.length && <p className="text-sm text-suave">Ninguém cadastrado desse lado ainda. Um vínculo liga sempre duas pessoas.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">Que relação
        <select className={`${campo} mt-1`} value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={ocupado}>
          {estado.tipos.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
        </select></label>
      <label className="block text-sm">Quanto alcança
        <select className={`${campo} mt-1`} value={forca} onChange={(e) => setForca(e.target.value)} disabled={ocupado}>
          {estado.forcas.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
        </select></label>
    </div>
    <p className="text-xs text-suave">{explicacao} É esse julgamento, e não o programa, que decide a ordem dos caminhos. Um caminho vale o seu elo mais fraco.</p>
    <label className="block text-sm">Período <span className="text-suave">(opcional)</span>
      <input className={`${campo} mt-1`} value={periodo} onChange={(e) => setPeriodo(e.target.value)} maxLength={120} disabled={ocupado} placeholder="Ex.: de 2012 a 2016" /></label>
    <label className="block text-sm">Como a casa sabe disso
      <textarea className={`${campo} mt-1 min-h-16 resize-y`} value={evidencia} onChange={(e) => setEvidencia(e.target.value)}
        required minLength={10} maxLength={2000} disabled={ocupado} placeholder="Ex.: dividiram a diretoria comercial da Nordeste Química." />
      <span className="mt-1 block text-xs text-suave">Vai aparecer inteira no resultado do agente, como base da conversa. Trabalhar na mesma empresa não prova que duas pessoas se conhecem.</span></label>
    <label className="block text-sm">O que o titular da relação respondeu
      <select className={`${campo} mt-1`} value={disposicao} onChange={(e) => setDisposicao(e.target.value)} disabled={ocupado}>
        {estado.disposicoes.map((d) => <option key={d.id} value={d.id}>{d.rotulo}</option>)}
      </select>
      <span className="mt-1 block text-xs text-suave">
        {escolhida && !escolhida.utilizavel
          ? 'O vínculo continua registrado e o caminho deixa de ser oferecido — assim ninguém recadastra a mesma relação daqui a um mês.'
          : escolhida?.confirmada
            ? 'Fica registrado com a data e com o seu nome como quem anotou a resposta, e melhora a posição do caminho.'
            : 'Sem confirmação, o caminho entra como "a confirmar" e o agente pede que se pergunte antes de prometer a apresentação.'}
      </span></label>
    <button className={botao} disabled={ocupado || !outroId || evidencia.trim().length < 10}>{ocupado ? 'Salvando…' : 'Registrar vínculo'}</button>
  </form>
}
