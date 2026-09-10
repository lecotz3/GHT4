import { useEffect, useState, type FormEvent } from 'react'
import { api, type Usuario } from '../agente/api'
import type { Convite } from './Equipe'

export function AceitarConvite({ token, aoEntrar, aoLogin }: { token: string; aoEntrar: (usuario: Usuario) => void; aoLogin: () => void }) {
  const [convite, setConvite] = useState<Convite | null>(null)
  const [erro, setErro] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    let ativa = true
    api<{ convite: Convite }>('/api/convites/consultar', 'POST', { token })
      .then((r) => { if (ativa) { setConvite(r.convite); setErro('') } })
      .catch((e: unknown) => { if (ativa) setErro(e instanceof Error ? e.message : 'Não foi possível abrir este convite.') })
      .finally(() => { if (ativa) setCarregando(false) })
    return () => { ativa = false }
  }, [token])
  async function aceitar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    if (senha !== confirmacao) { setErro('As senhas precisam ser iguais.'); return }
    setOcupado(true); setErro('')
    try { const u = await api<Usuario>('/api/convites/aceitar', 'POST', { token, senha }); setSenha(''); setConfirmacao(''); aoEntrar(u) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível criar o acesso.') }
    finally { setOcupado(false) }
  }
  const campo = 'mt-1 w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm focus:outline-comprador'
  return <main className="mx-auto max-w-lg px-5 py-14">
    <section className="space-y-5 rounded-ficha border border-fio bg-papel p-7">
      <h2 className="text-2xl font-semibold">Seu acesso à GHT4</h2>
      {carregando && <p role="status">Verificando convite…</p>}
      {convite && <form className="space-y-5" onSubmit={aceitar}>
        <p className="text-sm">Olá, {convite.nome}. Defina sua senha para entrar com <strong className="inline-block max-w-full break-words">{convite.email}</strong>.</p>
        <label className="block text-sm font-medium">Crie sua senha<input className={campo} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={12} maxLength={256} required autoComplete="new-password" /><span className="mt-1 block text-xs font-normal text-suave">Use pelo menos 12 caracteres.</span></label>
        <label className="block text-sm font-medium">Repita a senha<input className={campo} type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} minLength={12} maxLength={256} required autoComplete="new-password" /></label>
        <button className="w-full rounded-ficha bg-tinta px-4 py-2.5 text-sm font-semibold text-papel disabled:opacity-50" disabled={ocupado}>{ocupado ? 'Criando acesso…' : 'Criar meu acesso e entrar'}</button>
      </form>}
      {erro && <p role="alert" className="text-sm text-alerta">{erro}</p>}
      <button className="text-sm underline underline-offset-4" onClick={aoLogin} disabled={ocupado}>Já tenho acesso · Ir para login</button>
    </section>
  </main>
}
