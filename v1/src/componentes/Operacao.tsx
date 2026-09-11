import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ErroApi } from '../agente/api'
type Estado = { banco: string; backupLocal: boolean; iaConfigurada: boolean; ultimaCopia: string | null; uso: { pedidos: number; falhas: number; pendentes: number; entrada: number; saida: number }; migracoes: { nome: string }[] }
const campo = 'mt-1 w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm'
export function Operacao({ aoExpirar }: { aoExpirar: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [erro, setErro] = useState(''), [aviso, setAviso] = useState('')
  const [senhaAcesso, setSenhaAcesso] = useState(''), [senhaBackup, setSenhaBackup] = useState(''), [repeticao, setRepeticao] = useState('')
  const [aceito, setAceito] = useState(false), [ocupado, setOcupado] = useState(false)
  const carregar = useCallback(() => api<Estado>('/api/operacao').then(setEstado), [])
  const falhou = useCallback((e: unknown) => { if (e instanceof ErroApi && e.status === 401) aoExpirar(); else setErro(e instanceof Error ? e.message : 'Não foi possível concluir.') }, [aoExpirar])
  useEffect(() => { void carregar().catch(falhou) }, [carregar, falhou])
  async function baixar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return
    setErro(''); setAviso('')
    if (senhaBackup !== repeticao) { setErro('As senhas do backup não coincidem.'); return }
    setOcupado(true)
    try {
      const r = await fetch('/api/operacao/backup', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senhaAcesso, senhaBackup, incluiTrabalhosPrivados: aceito }), signal: AbortSignal.timeout(180000) })
      if (!r.ok) { const v = await r.json(); throw new ErroApi(r.status, v.mensagem || 'A cópia não foi concluída.') }
      const url = URL.createObjectURL(await r.blob()), a = document.createElement('a')
      a.href = url; a.download = `ght4-backup-${new Date().toISOString().slice(0, 10)}.ght4`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
      setSenhaAcesso(''); setSenhaBackup(''); setRepeticao(''); setAceito(false)
      setAviso('Arquivo preparado para download. Confira o arquivo salvo e guarde a senha em local separado. A recuperação deve ser ensaiada pelo responsável técnico.'); await carregar()
    } catch (e) { falhou(e) } finally { setOcupado(false) }
  }
  return <section className="space-y-4 rounded-ficha border border-fio bg-papel p-5" aria-label="Operação e continuidade">
    <h3 className="text-lg font-semibold">Operação e continuidade</h3>
    {erro && <p role="alert" className="text-sm text-alerta">{erro}</p>}{aviso && <p role="status" className="text-sm">{aviso}</p>}
    {estado && <>
      <p className="text-sm">{estado.banco === 'pglite' ? 'Banco local nesta máquina' : 'Banco compartilhado'} · IA {estado.iaConfigurada ? 'configurada' : 'aguardando configuração'}.</p>
      <p className="text-sm text-suave">Uso da IA hoje (horário de São Paulo): {estado.uso.pedidos} pedidos reservados · {estado.uso.falhas} falhas · {estado.uso.pendentes} sem conclusão · {estado.uso.entrada.toLocaleString('pt-BR')} tokens de entrada e {estado.uso.saida.toLocaleString('pt-BR')} de saída. Valores monetários dependem do provedor e do modelo.</p>
      <p className="text-sm text-suave">Última solicitação de cópia local: {estado.ultimaCopia ? new Date(estado.ultimaCopia).toLocaleString('pt-BR') : 'nenhuma registrada'}. A solicitação não confirma que o arquivo foi guardado ou restaurado.</p>
      {estado.backupLocal ? <details><summary className="cursor-pointer text-sm font-semibold">Preparar backup protegido por senha</summary>
        <form onSubmit={baixar} className="mt-4 max-w-xl space-y-3">
          <p className="text-sm">Esta cópia contém toda a instalação, incluindo conversas privadas, documentos e contas. Guarde o arquivo sob o mesmo controle de acesso do banco. Sem a senha do backup, ele não poderá ser recuperado.</p>
          <label className="block text-sm">Sua senha de acesso<input type="password" autoComplete="current-password" className={campo} value={senhaAcesso} onChange={e => setSenhaAcesso(e.target.value)} required maxLength={256} /></label>
          <label className="block text-sm">Senha para proteger o backup<input type="password" autoComplete="new-password" className={campo} value={senhaBackup} onChange={e => setSenhaBackup(e.target.value)} required minLength={12} maxLength={256} /></label>
          <label className="block text-sm">Repita a senha do backup<input type="password" autoComplete="new-password" className={campo} value={repeticao} onChange={e => setRepeticao(e.target.value)} required minLength={12} maxLength={256} /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={aceito} onChange={e => setAceito(e.target.checked)} required className="mt-1" />Estou ciente de que a cópia inclui os trabalhos privados e sou responsável por guardá-la.</label>
          <button disabled={ocupado} className="rounded-ficha bg-tinta px-4 py-2.5 text-sm font-semibold text-papel disabled:opacity-50">{ocupado ? 'Preparando cópia…' : 'Baixar backup'}</button>
        </form>
      </details> : <p className="text-sm">O responsável técnico deve executar e verificar o backup do banco compartilhado conforme o guia de implantação, incluindo uma cópia fora do servidor.</p>}
      <p className="text-sm text-suave">Esqueceu a senha de uma conta? Solicite a recuperação ao responsável pelo servidor. A redefinição encerra as sessões anteriores.</p>
      <details><summary className="cursor-pointer text-xs text-suave">Informações para suporte</summary><p className="mt-2 break-words text-xs text-suave">Atualizações do banco: {estado.migracoes.map(m => m.nome).join(', ')}</p></details>
    </>}
  </section>
}
