import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ErroApi, type PessoaRede } from '../agente/api'
import { Reconhecimento } from './Reconhecimento'
import { ImportacaoRede } from './ImportacaoRede'
import { VinculosRede } from './VinculosRede'
import { empresaDoCsv } from '../agente/csv-rede'
import { IconeRede } from './IconeRede'
import { VisaoGeralRede, type AbaRede, type ResumoRede } from './VisaoGeralRede'

const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm focus:outline-comprador'
const botao = 'rounded-ficha bg-tinta px-4 py-2.5 text-sm font-semibold text-papel disabled:opacity-50'
const secundario = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm hover:bg-papel-2 disabled:opacity-50'

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
  resumo: ResumoRede
  podeEditar: boolean; veContatos: boolean
}

const mensagem = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível concluir esta ação.'
const vazio = { nome: '', cargo: '', senioridade: 'outro', organizacao: '', empresaId: '', email: '', telefone: '', linkedin: '', observacoes: '', usuarioId: '' }

/**
 * Rede de relacionamento da casa.
 *
 * O cadastro e os lotes fornecem pessoas; respostas e evidências fornecem
 * relacionamentos. A interface mantém essas duas etapas distintas.
 *
 * As três abas são as três posições de um caminho: começa na GHT4, pode passar
 * por um intermediário e termina em quem decide na empresa. Cadastrar pessoas
 * sem ligar ninguém a ninguém produz uma agenda, não uma rede — e é o vínculo
 * que responde à pergunta que interessa.
 */
export function Rede({ aoVoltar, aoExpirar }: { aoVoltar: () => void; aoExpirar: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [pessoas, setPessoas] = useState<PessoaRede[]>([])
  const [aba, setAba] = useState<AbaRede>('visao')
  const cadastro = aba === 'mercado' || aba === 'ght4' || aba === 'externo'
  const lado: Lado = cadastro ? aba : 'mercado'
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(vazio)
  const [ligar, setLigar] = useState<PessoaRede | null>(null)
  const [editar, setEditar] = useState<PessoaRede | null>(null)
  const [verVinculos,setVerVinculos] = useState('')
  const [contas,setContas] = useState<{id:string;nome:string;email:string}[]>([])
  const [proximoOffset,setProximoOffset] = useState<number|null>(null)
  const [mostrarCadastro, setMostrarCadastro] = useState(false)
  const requisicao = useRef(0)
  const formulario = useRef<HTMLFormElement>(null)

  const falhou = useCallback((e: unknown) => {
    if (e instanceof ErroApi && e.status === 401) { aoExpirar(); return }
    setErro(mensagem(e))
  }, [aoExpirar])

  const carregar = useCallback(async () => {
    const n = ++requisicao.current
    setCarregando(true)
    try {
      const [e, p] = await Promise.all([
        api<Estado>('/api/rede'),
        cadastro ? api<{ pessoas: PessoaRede[]; proximoOffset:number|null }>(`/api/rede/pessoas?lado=${lado}&busca=${encodeURIComponent(busca)}`) : Promise.resolve({ pessoas: [], proximoOffset: null }),
      ])
      if (n !== requisicao.current) return
      setEstado(e); setPessoas(p.pessoas); setErro('')
      setProximoOffset(p.proximoOffset)
      if(e.podeEditar && lado === 'ght4') {
        const c = await api<{contas:{id:string;nome:string;email:string}[]}>('/api/rede/contas')
        if (n === requisicao.current) setContas(c.contas)
      }
    } catch (e) { if (n === requisicao.current) falhou(e) } finally { if (n === requisicao.current) setCarregando(false) }
  }, [lado, busca, cadastro, falhou])

  const invalidar = useCallback(() => { requisicao.current++ }, [])
  useEffect(() => { void carregar(); return invalidar }, [aba, carregar, invalidar])
  useEffect(() => { if (mostrarCadastro) formulario.current?.focus() }, [mostrarCadastro, editar])

  function navegar(proxima: AbaRede) {
    if (ocupado || proxima === aba) return
    requisicao.current++
    setAba(proxima); setBusca(''); setPessoas([]); setProximoOffset(null)
    setLigar(null); setEditar(null); setForm(vazio); setVerVinculos(''); setMostrarCadastro(false); setErro(''); setAviso('')
  }

  async function cadastrar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    setOcupado(true); setErro(''); setAviso('')
    try {
      await api(editar ? `/api/rede/pessoas/${editar.id}` : '/api/rede/pessoas', editar ? 'PATCH' : 'POST', {
        ...(editar ? {versao:editar.versao,ativo:true} : {id: crypto.randomUUID(), lado}),
        nome: form.nome, cargo: form.cargo,
        senioridade: lado === 'mercado' ? form.senioridade : 'outro',
        organizacao: lado === 'ght4' ? '' : form.organizacao,
        empresaId: lado === 'mercado' ? empresaDoCsv(form.empresaId) : null,
        email: form.email || null, telefone: form.telefone || null, linkedin: form.linkedin || null,
        observacoes: form.observacoes,
        usuarioId: lado === 'ght4' ? form.usuarioId || null : null,
      })
      setForm(vazio);setEditar(null); setMostrarCadastro(false); setAviso(`${form.nome}: cadastro salvo.`); await carregar()
    } catch (falha) { falhou(falha) } finally { setOcupado(false) }
  }

  async function mais() { if(proximoOffset===null||ocupado)return;const n = requisicao.current;setOcupado(true);try{
    const p=await api<{pessoas:PessoaRede[];proximoOffset:number|null}>(`/api/rede/pessoas?lado=${lado}&busca=${encodeURIComponent(busca)}&offset=${proximoOffset}`)
    if (n === requisicao.current) { setPessoas(ps=>[...ps,...p.pessoas]);setProximoOffset(p.proximoOffset) }
  }catch(e){falhou(e)}finally{setOcupado(false)} }
  async function desativar(p:PessoaRede) { setOcupado(true);try{
    await api(`/api/rede/pessoas/${p.id}`,'PATCH',{nome:p.nome,cargo:p.cargo,senioridade:p.senioridade,organizacao:p.organizacao,
      empresaId:p.empresaId,usuarioId:p.usuarioId??null,email:p.email??null,telefone:p.telefone??null,linkedin:p.linkedin??null,
      observacoes:p.observacoes??'',versao:p.versao,ativo:false})
    setEditar(null);setForm(vazio);setMostrarCadastro(false);setAviso('Pessoa retirada dos caminhos. O histórico foi preservado.');await carregar()
  }catch(e){falhou(e)}finally{setOcupado(false)} }

  if (!estado) return <main className="mx-auto max-w-6xl px-5 py-7"><p role={erro ? 'alert' : 'status'}>{erro || 'Abrindo a rede…'}</p>{erro && <button className={`${secundario} mt-4`} onClick={() => void carregar()}>Tentar novamente</button>}</main>

  const daCasa = lado === 'ght4'
  const doMercado = lado === 'mercado'
  const descricaoDoLado = estado?.lados.find((l) => l.id === lado)?.descricao ?? ''
  const navegacao = [
    { id: 'visao', titulo: 'Visão geral', icone: 'painel' },
    { id: 'reconhecimento', titulo: 'Reconhecimento', icone: 'verificar' },
    { id: 'importacao', titulo: 'Importar contatos', icone: 'importar' },
    { id: 'mercado', titulo: 'Pessoas nas empresas', icone: 'empresa' },
    { id: 'externo', titulo: 'Intermediários', icone: 'rede' },
    { id: 'ght4', titulo: 'Pessoas da GHT4', icone: 'pessoas' },
  ] as const
  return <main className="rede-ui agente-pagina space-y-6">
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto">
        <p className="agente-sobretitulo">Inteligência de relacionamento</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Rede de relacionamento</h2>
        <p className="mt-2 text-sm text-suave">Descubra quem conhece quem e confirme o caminho até a próxima conversa.</p>
      </div>
      <button className={`${secundario} inline-flex items-center gap-2`} onClick={aoVoltar} disabled={ocupado}><IconeRede nome="voltar" className="size-4" />Voltar ao agente</button>
    </div>

    <div className="grid items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
    <aside className="lg:sticky lg:top-6">
      <nav aria-label="Seções da rede" className="grid grid-cols-2 gap-1 rounded-xl border border-fio bg-papel p-2 sm:grid-cols-3 lg:grid-cols-1">
        {navegacao.map(n => <button key={n.id} aria-current={aba === n.id ? 'page' : undefined} className={`flex items-center gap-2.5 rounded-lg px-3 py-3 text-left text-xs transition lg:text-[13px] ${aba === n.id ? 'bg-tinta font-semibold text-papel' : 'text-tinta-2 hover:bg-papel-2'}`} disabled={ocupado} onClick={() => navegar(n.id)}><IconeRede nome={n.icone} className="size-[18px]" />{n.titulo}</button>)}
      </nav>
      <div className="mt-5 hidden px-3 lg:block"><p className="text-xs font-medium">Uma rede com evidência</p><p className="mt-2 text-xs leading-relaxed text-suave">Um nome cadastrado é um ponto de partida. A confirmação de quem conhece transforma o contato em relação.</p>{!estado.veContatos && <p className="mt-3 text-xs leading-relaxed text-suave">Seu acesso mantém os dados de contato direto ocultos.</p>}</div>
    </aside>
    <div className="min-w-0 space-y-5">
    {!estado.veContatos && <p className="text-xs text-suave">Seu acesso mantém os dados de contato direto ocultos.</p>}
    {erro && <p role="alert" className="rounded-lg border border-alerta-fio bg-alerta-fundo p-4 text-sm text-alerta">{erro}</p>}
    {aviso && <p role="status" className="rounded-lg border border-comprador-fio bg-comprador-fundo p-4 text-sm text-comprador">{aviso}</p>}
    {aba !== 'visao' && <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-xl font-semibold tracking-tight">{navegacao.find(n => n.id === aba)?.titulo}</h3><p className="mt-1 text-xs leading-relaxed text-suave">{cadastro ? descricaoDoLado : aba === 'reconhecimento' ? 'Uma pessoa por vez. Cada resposta deixa a rede mais precisa.' : 'Selecione, confira e compartilhe com autorização.'}</p></div>{cadastro && estado.podeEditar && <button className={`${botao} inline-flex items-center gap-2`} aria-expanded={mostrarCadastro} aria-controls="cadastro-rede" disabled={ocupado} onClick={() => { setMostrarCadastro(v => !v); setEditar(null); setForm(vazio) }}><IconeRede nome="mais" className="size-4" />{mostrarCadastro ? 'Fechar cadastro' : 'Adicionar pessoa'}</button>}</div>}

    {aba === 'visao' ? <VisaoGeralRede totais={estado.totais} resumo={estado.resumo} podeEditar={estado.podeEditar} aoNavegar={navegar} aoAgente={aoVoltar} /> : aba === 'reconhecimento'
      ? <Reconhecimento aoFalhar={falhou} aoMudar={() => void carregar()} />
      : aba === 'importacao' ? <ImportacaoRede podeEditar={Boolean(estado?.podeEditar)} aoFalhar={falhou} aoMudar={()=>void carregar()} />
      : <>
    {estado?.podeEditar && mostrarCadastro && <form id="cadastro-rede" ref={formulario} tabIndex={-1} onSubmit={cadastrar} className="space-y-4 rounded-xl border border-fio bg-papel p-5">
      <h3 className="font-semibold">{editar ? `Editar ${editar.nome}` : daCasa ? 'Cadastrar alguém da GHT4' : doMercado ? 'Cadastrar alguém de uma empresa' : 'Cadastrar um intermediário'}</h3>
      {daCasa && <label className="block text-sm">Conta de acesso desta pessoa<select className={`${campo} mt-1`} value={form.usuarioId} onChange={e=>setForm({...form,usuarioId:e.target.value})}><option value="">Ainda não tem conta</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome} · {c.email}</option>)}</select><span className="text-xs text-suave">Vincule a conta criada em Equipe para que o membro responda e revise suas próprias relações.</span></label>}
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
        {doMercado && <label className="block text-sm">CNPJ da empresa <span className="text-suave">(opcional, completo ou raiz de oito dígitos)</span>
          <input className={`${campo} mt-1`} value={form.empresaId} onChange={(e) => setForm({ ...form, empresaId: e.target.value })}
            maxLength={18} disabled={ocupado} placeholder="12.345.678/0001-90 ou 12345678" />
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
      <button className={botao} disabled={ocupado || form.nome.trim().length < 2}>{ocupado ? 'Salvando…' : editar ? 'Salvar cadastro' : 'Cadastrar na rede'}</button>
      {editar&&<><button type="button" className={`${secundario} ml-2`} disabled={ocupado} onClick={()=>{setEditar(null);setForm(vazio)}}>Cancelar edição</button><button type="button" className={`${secundario} ml-2`} disabled={ocupado} onClick={()=>void desativar(editar)}>Retirar pessoa dos caminhos</button></>}
    </form>}

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fio bg-papel p-3"><label className="flex min-w-0 flex-1 items-center gap-2 pl-1 text-suave"><IconeRede nome="busca" /><input className="w-full min-w-0 bg-transparent p-2 text-sm text-tinta" value={busca} disabled={ocupado} onChange={e => { requisicao.current++; setBusca(e.target.value); setPessoas([]); setCarregando(true) }} placeholder="Buscar nome, cargo ou empresa" maxLength={120} aria-label="Filtrar a rede" /></label><span className="px-2 text-xs text-suave" role="status">{carregando ? 'Atualizando…' : `${pessoas.length} pessoa(s) nesta lista`}</span></div>
    <section className="space-y-3" aria-label="Pessoas da rede" aria-busy={carregando}>
      {!carregando && !pessoas.length && <div className="rounded-xl border border-dashed border-fio-forte p-8 text-center"><IconeRede nome="pessoas" className="mx-auto mb-3 size-8 text-suave" /><p className="text-sm text-suave">
        {busca ? 'Nenhuma pessoa corresponde a este filtro.'
          : daCasa ? 'Ninguém da GHT4 cadastrado ainda. Sem isso, nenhum caminho pode começar.'
            : doMercado ? 'Nenhuma pessoa de empresa cadastrada ainda. Comece por quem você já conhece.'
              : 'Nenhum intermediário cadastrado. Entram aqui as pessoas que fazem a ponte sem ser da casa nem da empresa-alvo.'}
      </p>{busca && <button className={`${secundario} mt-4`} onClick={() => setBusca('')}>Limpar busca</button>}</div>}
      {pessoas.map((p) => <article key={p.id} className="rounded-xl border border-fio bg-papel p-4 transition hover:border-fio-forte">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-papel-2 text-sm font-semibold text-tinta-2" aria-hidden="true">{p.nome.split(' ').filter(Boolean).slice(0,2).map(n => n[0]).join('')}</span>
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
          <button className={secundario} onClick={()=>setVerVinculos(verVinculos===p.id?'':p.id)} disabled={ocupado}>Ver vínculos</button>
          {estado?.podeEditar&&<button className={secundario} disabled={ocupado} onClick={()=>{setEditar(p);setMostrarCadastro(true);setForm({nome:p.nome,cargo:p.cargo,senioridade:p.senioridade,organizacao:p.organizacao,empresaId:p.empresaId??'',email:p.email??'',telefone:p.telefone??'',linkedin:p.linkedin??'',observacoes:p.observacoes??'',usuarioId:p.usuarioId??''})}}>Editar cadastro</button>}
        </div>
        {p.origemReferencia&&<p className="mt-2 text-xs text-suave">Fonte: {p.origemReferencia}</p>}
        {verVinculos===p.id&&estado&&<VinculosRede pessoaId={p.id} disposicoes={estado.disposicoes} forcas={estado.forcas} aoFalhar={falhou} aoMudar={()=>void carregar()}/>}
        {ligar?.id === p.id && estado && <FormularioVinculo pessoa={p} estado={estado} aoFalhar={falhou}
          aoSalvar={(texto) => { setLigar(null); setAviso(texto); void carregar() }} />}
      </article>)}
    </section>
    {proximoOffset!==null&&<button className={secundario} disabled={ocupado} onClick={()=>void mais()}>Carregar próximas pessoas</button>}
    </>}
    </div>
    </div>
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
  const [buscaOutro,setBuscaOutro] = useState('')
  const [tipo, setTipo] = useState('trabalharam_juntos')
  const [forca, setForca] = useState('indireta')
  const [periodo, setPeriodo] = useState('')
  const [evidencia, setEvidencia] = useState('')
  const [disposicao, setDisposicao] = useState('nao_confirmado')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vivo = true
    setOutroId('')
    api<{ pessoas: PessoaRede[] }>(`/api/rede/pessoas?lado=${ladoOutro}&limite=200&busca=${encodeURIComponent(buscaOutro)}`)
      .then((r) => { if (!vivo) return
        const livres = r.pessoas.filter((c) => c.id !== pessoa.id)
        setCandidatos(livres); setOutroId(livres[0]?.id ?? '') })
      .catch(aoFalhar)
    return () => { vivo = false }
  }, [ladoOutro, pessoa.id, buscaOutro, aoFalhar])

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
    <label className="block text-sm">Buscar a outra pessoa<input className={campo} value={buscaOutro} maxLength={120} disabled={ocupado} onChange={e=>setBuscaOutro(e.target.value)} placeholder="Nome ou empresa"/></label>
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
