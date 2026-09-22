import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ErroApi } from '../agente/api'
import { Operacao } from './Operacao'
import { IconeRede } from './IconeRede'

const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm focus:outline-comprador'
const botao = 'rounded-ficha bg-tinta px-4 py-2.5 text-sm font-semibold text-papel disabled:opacity-50'
const secundario = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm hover:bg-papel-2 disabled:opacity-50'
const aba = (ativa: boolean) => `rounded-ficha px-3 py-1.5 text-sm ${ativa ? 'bg-tinta font-semibold text-papel' : 'border border-fio-forte bg-papel hover:bg-papel-2'}`
const papeis: Record<string, string> = { admin: 'Administrador', socio: 'Sócio', analista: 'Analista', leitura: 'Somente leitura' }
type Membro = { id: string; nome: string; email: string; papel: string; ativo: boolean }
type Espaco = { id: string; rotulo: string; situacao: string }
export type Convite = { id: string; nome: string; email: string; papel: string; expira_em: string }
type Dados = { usuarios: Membro[]; espacos: Espaco[]; membros: { mandato_id: string; usuario_id: string }[]; convites: Convite[] }
const data = (valor: string) => new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/* Alfanumérica de propósito. Uma senha destas acaba viajando por connection
   string e campo de formulário, e caractere reservado de URL (`@`, `:`, `/`)
   quebra os dois de um jeito que só aparece muito depois. 16 caracteres de
   [A-Za-z0-9] dão ~95 bits, folgado para o uso. */
function gerarSenha() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('')
}

export function Equipe({ aoVoltar, aoExpirar }: { aoVoltar: () => void; aoExpirar: () => void }) {
  const [abaEquipe, setAbaEquipe] = useState('membros')
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [modo, setModo] = useState<'direto' | 'convite'>('direto')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState('analista')
  const [senha, setSenha] = useState('')
  const [espacos, setEspacos] = useState<string[]>([])
  const [rotulo, setRotulo] = useState('')
  const [link, setLink] = useState<{ url: string; convite: Convite } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null)
  const [redefinindo, setRedefinindo] = useState<string | null>(null)
  const [senhaRedef, setSenhaRedef] = useState('')
  const [atual, setAtual] = useState('')
  const [minhaNova, setMinhaNova] = useState('')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

  const falhou = useCallback((e: unknown) => {
    if (e instanceof ErroApi && e.status === 401) aoExpirar()
    else setErro(e instanceof Error ? e.message : 'Não foi possível atualizar a equipe.')
  }, [aoExpirar])
  const carregar = useCallback(async () => { setDados(await api<Dados>('/api/equipe')) }, [])
  useEffect(() => { void carregar().catch(falhou) }, [carregar, falhou])

  async function executar(acao: () => Promise<void>) {
    if (ocupado) return
    setOcupado(true); setErro(''); setAviso('')
    try { await acao(); await carregar() }
    catch (e) { falhou(e) }
    finally { setOcupado(false) }
  }
  async function adicionar(e: FormEvent) {
    e.preventDefault()
    await executar(async () => {
      if (modo === 'direto') {
        await api<Membro>('/api/equipe/usuarios', 'POST', { nome, email, papel, senha, espacos })
        setCriada({ email, senha }); setLink(null); setCopiado(false)
        setAviso('Conta criada. Entregue a senha à pessoa — ela some desta tela quando você sair.')
      } else {
        const r = await api<{ convite: Convite; token: string }>('/api/equipe/convites', 'POST', { nome, email, papel, espacos })
        setLink({ convite: r.convite, url: `${window.location.origin}${window.location.pathname}#convite=${r.token}` })
        setCopiado(false); setCriada(null)
        setAviso('Convite criado. Compartilhe o link com a pessoa convidada.')
      }
      setNome(''); setEmail(''); setSenha('')
    })
  }
  async function criarEspaco(e: FormEvent) {
    e.preventDefault()
    await executar(async () => { await api('/api/equipe/espacos', 'POST', { rotulo }); setRotulo(''); setAviso('Espaço criado. Na aba Membros, escolha quem terá acesso.') })
  }
  async function trocarMinhaSenha(e: FormEvent) {
    e.preventDefault()
    await executar(async () => {
      await api('/api/eu/senha', 'POST', { atual, nova: minhaNova })
      setAtual(''); setMinhaNova('')
      setAviso('Sua senha foi trocada. As outras sessões desta conta foram encerradas.')
    })
  }
  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(true) }
    catch { setAviso('Selecione o texto no campo e copie manualmente.') }
  }

  return <main className="agente-pagina space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="agente-sobretitulo">A casa conectada</span><h2 className="mt-3 text-3xl font-semibold tracking-tight">Equipe e acessos</h2><p className="mt-3 text-sm text-suave">Organize as pessoas e os espaços de trabalho da GHT4.</p></div><button className="agente-btn-primario" onClick={() => setAbaEquipe('adicionar')} disabled={ocupado}><IconeRede nome="mais" />Adicionar membro</button></div>
    {erro && <p role="alert" className="text-sm text-alerta">{erro} <button className="underline" onClick={() => void carregar().catch(falhou)}>Atualizar a lista</button></p>}
    {aviso && <p role="status" className="agente-motivo-bloqueio">{aviso}</p>}
    {!dados ? <p role="status">Carregando equipe…</p> : <>
      <nav className="agente-secoes" aria-label="Gestão da equipe">{[{id:'membros',nome:'Membros',total:dados.usuarios.length},{id:'adicionar',nome:'Adicionar e convidar'},{id:'espacos',nome:'Espaços',total:dados.espacos.length},{id:'conta',nome:'Minha conta'},{id:'operacao',nome:'Operação'}].map(a => <button key={a.id} aria-pressed={abaEquipe === a.id} onClick={() => setAbaEquipe(a.id)}>{a.nome}{a.total !== undefined ? ' · ' + a.total : ''}</button>)}</nav>
      <div hidden={abaEquipe !== 'membros'} className="space-y-6"><section className="space-y-3" aria-label="Membros da equipe">
        <h3 className="text-lg font-semibold">Membros da equipe</h3>
        <p className="text-sm text-suave">O espaço controla o acesso ao mandato. Os históricos do agente continuam pessoais nesta versão.</p>
        {dados.usuarios.map((u) => <article key={u.id} className="rounded-ficha border border-fio bg-papel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><h4 className="font-semibold">{u.nome} {!u.ativo && <span className="text-sm font-normal text-alerta">· Acesso suspenso</span>}</h4><p className="break-words text-sm text-suave">{u.email} · {papeis[u.papel]}</p></div>
            {u.papel !== 'admin' && <div className="flex flex-wrap gap-2">
              <button className={secundario} disabled={ocupado} aria-label={`Redefinir senha de ${u.nome}`} onClick={() => { setRedefinindo(redefinindo === u.id ? null : u.id); setSenhaRedef('') }}>Redefinir senha</button>
              <button className={secundario} disabled={ocupado} aria-label={`${u.ativo ? 'Suspender' : 'Reativar'} acesso de ${u.nome}`} onClick={() => void executar(async () => {
                await api(`/api/equipe/usuarios/${u.id}`, 'PATCH', { ativo: !u.ativo }); setAviso(u.ativo ? `Acesso de ${u.nome} suspenso. As sessões abertas foram encerradas.` : `Acesso de ${u.nome} reativado. A pessoa já pode entrar novamente.`)
              })}>{u.ativo ? 'Suspender acesso' : 'Reativar acesso'}</button>
            </div>}
          </div>
          {redefinindo === u.id && <form className="mt-4 flex flex-wrap items-end gap-2 rounded-ficha border border-comprador bg-papel-2 p-4" onSubmit={(e) => {
            e.preventDefault()
            void executar(async () => {
              await api(`/api/equipe/usuarios/${u.id}/senha`, 'POST', { senha: senhaRedef })
              setCriada({ email: u.email, senha: senhaRedef }); setRedefinindo(null); setSenhaRedef('')
              setAviso(`Senha de ${u.nome} redefinida. As sessões abertas foram encerradas.`)
            })
          }}>
            <label className="flex-1 text-sm font-medium">Nova senha de {u.nome}
              <div className="mt-1 flex gap-2">
                <input className={`${campo} font-mono`} value={senhaRedef} onChange={(e) => setSenhaRedef(e.target.value)} required minLength={12} maxLength={256} autoComplete="new-password" spellCheck={false} />
                <button type="button" className={secundario} onClick={() => setSenhaRedef(gerarSenha())}>Gerar</button>
              </div>
            </label>
            <button className={botao} disabled={ocupado}>Redefinir</button>
            <button type="button" className={secundario} disabled={ocupado} onClick={() => setRedefinindo(null)}>Cancelar</button>
          </form>}
          {u.papel === 'admin' ? <p className="mt-3 text-xs text-suave">Acesso de administração a todos os espaços. Para trocar a senha desta conta, use a aba “Minha conta”, logado nela.</p> : <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Gerenciar espaços de {u.nome}</summary>
            <fieldset className="mt-3 space-y-2" disabled={ocupado}><legend className="sr-only">Espaços de {u.nome}</legend>
              {dados.espacos.filter((s) => s.situacao === 'ativo').map((s) => <label key={s.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-tinta" checked={dados.membros.some((m) => m.usuario_id === u.id && m.mandato_id === s.id)} onChange={(e) => {
                const participa = e.target.checked
                void executar(async () => { await api(`/api/equipe/espacos/${s.id}/membros/${u.id}`, 'PUT', { participa }); setAviso(`Acesso de ${u.nome} ao espaço ${s.rotulo} ${participa ? 'concedido' : 'retirado'}.`) })
              }} />{s.rotulo}</label>)}
            </fieldset>
          </details>}
        </article>)}
      </section>
<section className="space-y-3" aria-label="Convites pendentes"><h3 className="text-lg font-semibold">Convites pendentes</h3>
        {dados.convites.length === 0 && <p className="text-sm text-suave">Nenhum convite pendente.</p>}
        {dados.convites.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-ficha border border-fio bg-papel p-4">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{c.nome} · {c.email}</p><p className="text-xs text-suave">{papeis[c.papel]} · válido até {data(c.expira_em)}</p></div>
          <button className={secundario} disabled={ocupado} aria-label={`Cancelar convite de ${c.nome}`} onClick={() => void executar(async () => {
            await api(`/api/equipe/convites/${c.id}`, 'DELETE'); if (link?.convite.id === c.id) setLink(null); setAviso(`Convite de ${c.nome} cancelado.`)
          })}>Cancelar convite</button>
        </div>)}
      </section>
</div>
      <div hidden={abaEquipe !== 'adicionar'} className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]"><form onSubmit={adicionar} className="space-y-4 rounded-ficha border border-fio bg-papel p-5">
          <h3 className="text-lg font-semibold">Adicionar membro</h3>
          <div className="flex gap-2" role="group" aria-label="Como adicionar">
            <button type="button" className={aba(modo === 'direto')} onClick={() => setModo('direto')}>Cadastrar agora</button>
            <button type="button" className={aba(modo === 'convite')} onClick={() => setModo('convite')}>Enviar convite</button>
          </div>
          <p className="text-sm text-suave">{modo === 'direto'
            ? 'A conta já nasce pronta para entrar, com a senha que você definir. Como você fica sabendo dessa senha, peça que a pessoa a troque no primeiro acesso.'
            : 'A pessoa define a própria senha ao abrir o link, e só ela a conhece. Nenhum e-mail é enviado pelo agente: você entrega o link.'}</p>
          <label className="block text-sm font-medium">Nome<input className={`${campo} mt-1`} value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={120} autoComplete="off" /></label>
          <label className="block text-sm font-medium">E-mail do membro<input className={`${campo} mt-1`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="off" /></label>
          {modo === 'direto' && <label className="block text-sm font-medium">Senha inicial
            <div className="mt-1 flex gap-2">
              <input className={`${campo} font-mono`} value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={12} maxLength={256} autoComplete="new-password" spellCheck={false} />
              <button type="button" className={secundario} onClick={() => setSenha(gerarSenha())}>Gerar</button>
            </div>
            <span className="mt-1 block text-xs text-suave">Mínimo de 12 caracteres. O botão gera uma sem acento nem símbolo, que não quebra ao ser copiada.</span>
          </label>}
          <label className="block text-sm font-medium">Perfil<select className={`${campo} mt-1`} value={papel} onChange={(e) => setPapel(e.target.value)}><option value="analista">Analista</option><option value="socio">Sócio</option><option value="leitura">Somente leitura</option></select></label>
          <p className="text-xs text-suave">Sócios e analistas executam tarefas. Somente leitura permite consultar os módulos disponíveis, sem criar trabalhos no agente. Administrador não se cria por aqui.</p>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Espaços autorizados</legend>
            {dados.espacos.filter((s) => s.situacao === 'ativo').map((s) => <label key={s.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-tinta" checked={espacos.includes(s.id)} onChange={(e) => setEspacos((xs) => e.target.checked ? [...xs, s.id] : xs.filter((x) => x !== s.id))} />{s.rotulo}</label>)}
            {espacos.length === 0 && <p className="text-xs text-suave">Sem espaço selecionado, o membro poderá começar trabalhos pessoais, se seu perfil permitir.</p>}
          </fieldset>
          <button className={botao} disabled={ocupado}>{ocupado ? 'Aguarde…' : modo === 'direto' ? 'Criar conta' : 'Criar convite'}</button>
        </form><aside className="agente-convite-rede"><IconeRede nome="pessoas" /><h3>Cada pessoa, com o acesso certo.</h3><p>1. Informe nome e e-mail.<br />2. Escolha o perfil e os espaços.<br />3. Crie a conta ou entregue um link de convite.</p><p>Analistas e sócios executam tarefas. O perfil de leitura acompanha os registros sem alterá-los.</p>{local && <details className="mt-4 text-xs"><summary>Convites neste ambiente local</summary><p>Os links só abrem nesta máquina. Para a equipe entrar de outros dispositivos, use o ambiente publicado.</p></details>}</aside></div>
      {criada && <section className="space-y-3 rounded-ficha border border-comprador bg-papel p-5" aria-label="Conta criada">
            <h3 className="font-semibold">Conta criada</h3>
            <p className="break-words text-sm">{criada.email} já pode entrar.</p>
            <label className="block text-sm font-medium">Senha inicial<input className={`${campo} mt-1 font-mono`} readOnly value={criada.senha} onFocus={(e) => e.target.select()} /></label>
            <button type="button" className={secundario} onClick={() => void copiar(criada.senha)}>{copiado ? 'Senha copiada' : 'Copiar senha'}</button>
            <p className="text-xs text-suave">Esta é a única vez que a senha aparece: o banco guarda só a derivação dela. Se perder, use “Redefinir senha” na aba Membros.</p>
          </section>}
          {link && <section className="space-y-3 rounded-ficha border border-comprador bg-papel p-5" aria-label="Link do convite">
            <h3 className="font-semibold">Convite para {link.convite.nome}</h3>
            <p className="break-words text-sm">{link.convite.email} · válido até {data(link.convite.expira_em)}.</p>
            <label className="block text-sm font-medium">Link de uso único<textarea className={`${campo} mt-1 break-all font-mono text-xs`} readOnly value={link.url} rows={3} onFocus={(e) => e.target.select()} /></label>
            <button type="button" className={secundario} onClick={() => void copiar(link.url)}>{copiado ? 'Link copiado' : 'Copiar link'}</button>
            <p className="text-xs text-suave">Guarde o link antes de sair desta tela. Para recuperá-lo depois, crie um novo convite; o anterior será cancelado.</p>
          </section>}
      <div hidden={abaEquipe !== 'espacos'} className="grid items-start gap-6 lg:grid-cols-2"><form onSubmit={criarEspaco} className="space-y-4 rounded-ficha border border-fio bg-papel p-5">
            <h3 className="text-lg font-semibold">Novo espaço de trabalho</h3>
            <p className="text-sm text-suave">Use um espaço por tese, oportunidade ou mandato. O acesso é restrito aos membros escolhidos e aos administradores.</p>
            <label className="block text-sm font-medium">Nome do espaço<input className={`${campo} mt-1`} placeholder="Ex.: Compra · Distribuição química SP" value={rotulo} onChange={(e) => setRotulo(e.target.value)} required minLength={2} maxLength={120} /></label>
            <button className={botao} disabled={ocupado}>Criar espaço</button>
          </form><section className="agente-superficie p-5"><h3 className="font-semibold">Espaços da casa</h3>{dados.espacos.length ? <ul className="mt-3 divide-y divide-fio">{dados.espacos.map(s => <li key={s.id} className="py-3 text-sm"><strong className="font-medium">{s.rotulo}</strong><span className="mt-1 block text-xs text-suave">{s.situacao === 'ativo' ? 'Ativo' : 'Encerrado'} · {dados.membros.filter(m => m.mandato_id === s.id).length} membros vinculados</span></li>)}</ul> : <p className="mt-3 text-sm text-suave">Crie o primeiro espaço para reunir os acessos de uma tese ou mandato.</p>}<button className="agente-link mt-4 text-sm" onClick={() => setAbaEquipe('membros')}>Gerenciar acesso dos membros<IconeRede nome="seta" /></button></section></div>
      <div hidden={abaEquipe !== 'conta'} className="max-w-xl"><form onSubmit={trocarMinhaSenha} className="space-y-4 rounded-ficha border border-fio bg-papel p-5">
            <h3 className="text-lg font-semibold">Minha senha</h3>
            <p className="text-sm text-suave">Trocar aqui encerra as outras sessões desta conta e mantém esta aberta.</p>
            <label className="block text-sm font-medium">Senha atual<input className={`${campo} mt-1`} type="password" value={atual} onChange={(e) => setAtual(e.target.value)} required maxLength={256} autoComplete="current-password" /></label>
            <label className="block text-sm font-medium">Nova senha<input className={`${campo} mt-1`} type="password" value={minhaNova} onChange={(e) => setMinhaNova(e.target.value)} required minLength={12} maxLength={256} autoComplete="new-password" /></label>
            <button className={botao} disabled={ocupado}>Trocar minha senha</button>
          </form></div>
      {abaEquipe === 'operacao' && <><p className="text-sm text-suave">Disponibilidade das integrações e entregas. Consulte aqui quando uma tarefa depender de configuração.</p><Operacao aoExpirar={aoExpirar} /></>}
    </>}
    <button className="agente-link text-xs" onClick={aoVoltar} disabled={ocupado}>Ir aos meus trabalhos<IconeRede nome="seta" /></button>
  </main>
}
