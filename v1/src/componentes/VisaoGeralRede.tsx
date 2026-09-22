import { motion, useReducedMotion } from 'motion/react'
import { IconeRede } from './IconeRede'

export type AbaRede = 'visao' | 'ght4' | 'mercado' | 'externo' | 'reconhecimento' | 'importacao'
export type ResumoRede = { confirmadas: number; pendentes: number; bloqueadas: number; membrosSemConta: number; cargosRevisar: number; respondidas: number; perguntasPossiveis: number }
type Totais = { ght4: number; mercado: number; externo: number; vinculos: number }
const numero = (n: number) => n.toLocaleString('pt-BR')

export function VisaoGeralRede({ totais, resumo, podeEditar, aoNavegar, aoAgente }: {
  totais: Totais; resumo: ResumoRede; podeEditar: boolean; aoNavegar: (aba: AbaRede) => void; aoAgente: () => void
}) {
  const reduzir = useReducedMotion()
  const pendentes = Math.max(0, resumo.perguntasPossiveis - resumo.respondidas)
  const progresso = resumo.perguntasPossiveis ? Math.min(100, Math.round(100 * resumo.respondidas / resumo.perguntasPossiveis)) : 0
  const sugestoes: { titulo: string; descricao: string; aba: AbaRede; acao: string }[] = []
  if (!totais.ght4 || resumo.membrosSemConta) sugestoes.push({ titulo: !totais.ght4 ? 'Comece pelas pessoas da casa' : 'Conecte os membros às suas contas', descricao: !totais.ght4 ? 'Cadastre quem participa do piloto para dar início à rede.' : `${numero(resumo.membrosSemConta)} membro(s) precisam de uma conta ativa vinculada para responder por si.`, aba: 'ght4', acao: podeEditar ? 'Organizar equipe' : 'Ver participantes' })
  if (!totais.mercado) sugestoes.push({ titulo: 'Traga os primeiros contatos', descricao: 'Uma seleção autorizada já permite começar. Revise a prévia antes de compartilhar.', aba: 'importacao', acao: podeEditar ? 'Preparar importação' : 'Ver lotes' })
  if (pendentes) sugestoes.push({ titulo: 'Faça uma rodada por empresa', descricao: `${numero(pendentes)} perguntas entre membros e pessoas das empresas ainda não foram respondidas. Escolha uma empresa prioritária para começar.`, aba: 'reconhecimento', acao: 'Reconhecer pessoas' })
  if (resumo.cargosRevisar && podeEditar) sugestoes.push({ titulo: 'Revise quem tem poder de decisão', descricao: `${numero(resumo.cargosRevisar)} pessoa(s) estão sem nível de decisão definido. Confirme o cargo atual antes de priorizar.`, aba: 'mercado', acao: 'Revisar cadastros' })
  if (!sugestoes.length) sugestoes.push({ titulo: 'Mantenha as relações atuais', descricao: 'Revise as respostas quando houver mudança de cargo, empresa ou disponibilidade para apresentar.', aba: 'reconhecimento', acao: 'Revisar reconhecimento' })

  return <motion.div initial={reduzir ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
    <section className="rede-destaque grid gap-6 overflow-hidden rounded-xl bg-tinta p-6 text-papel sm:p-8 lg:grid-cols-[1.3fr_1fr]" aria-labelledby="rede-proposito">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-marca">Da relação à oportunidade</p>
        <h3 id="rede-proposito" className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-tight">A próxima conversa começa pela sua rede.</h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-fio-forte">Reúna as pessoas certas, confirme as relações e encontre caminhos até a liderança.</p>
        <button className="mt-6 inline-flex items-center gap-3 rounded-lg bg-marca px-4 py-3 text-sm font-semibold text-tinta transition hover:bg-papel" onClick={() => aoNavegar(totais.ght4 ? 'reconhecimento' : 'ght4')}>
          {totais.ght4 ? 'Iniciar reconhecimento' : 'Organizar participantes'}<IconeRede nome="seta" />
        </button>
      </div>
      <div className="self-center rounded-xl border border-tinta-2 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fio-forte">Como o acesso se constrói</p>
        <ol className="mt-5 space-y-5">
          {[
            ['01', 'Uma pessoa da GHT4', 'O ponto de partida de cada relação.'],
            ['02', 'Uma conexão confirmada', 'Direta ou por um intermediário.'],
            ['03', 'Quem decide na empresa', 'Com contexto para uma apresentação.'],
          ].map(([n, titulo, texto]) => <li key={n} className="flex items-start gap-3"><span className="pt-0.5 font-mono text-xs text-marca">{n}</span><div><p className="text-sm font-medium">{titulo}</p><p className="mt-1 text-xs leading-relaxed text-fio-forte">{texto}</p></div></li>)}
        </ol>
      </div>
    </section>

    <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        { titulo: 'Pessoas da GHT4', valor: totais.ght4, detalhe: 'Participantes cadastrados', icone: 'pessoas' as const },
        { titulo: 'Pessoas nas empresas', valor: totais.mercado, detalhe: 'Contatos e dirigentes', icone: 'empresa' as const },
        { titulo: 'Relações confirmadas', valor: resumo.confirmadas, detalhe: 'Entre pessoas ativas', icone: 'verificar' as const },
        { titulo: 'Relações a confirmar', valor: resumo.pendentes, detalhe: 'Ainda pedem confirmação', icone: 'tempo' as const },
      ].map(item => <div key={item.titulo} className="rounded-xl border border-fio bg-papel p-4 sm:p-5"><dt className="flex items-center justify-between gap-2 text-xs text-suave">{item.titulo}<IconeRede nome={item.icone} /></dt><dd className="mt-4 text-3xl font-semibold tracking-tight">{numero(item.valor)}</dd><dd className="mt-2 text-[11px] text-suave">{item.detalhe}</dd></div>)}
    </dl>

    <div className="grid items-start gap-5 xl:grid-cols-[1.45fr_1fr]">
      <section className="overflow-hidden rounded-xl border border-fio bg-papel" aria-labelledby="rede-sugestoes">
        <div className="border-b border-fio px-5 py-4"><h3 id="rede-sugestoes" className="font-semibold">Próximos passos sugeridos</h3><p className="mt-1 text-xs text-suave">A partir do estado atual da rede.</p></div>
        <ol className="divide-y divide-fio">{sugestoes.slice(0, 3).map((s, i) => <li key={s.titulo} className="flex gap-3 p-5"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-papel-2 text-xs font-semibold text-suave">{i + 1}</span><div className="min-w-0"><h4 className="text-sm font-semibold">{s.titulo}</h4><p className="mt-1.5 text-xs leading-relaxed text-suave">{s.descricao}</p><button className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-comprador hover:underline" onClick={() => aoNavegar(s.aba)}>{s.acao}<IconeRede nome="seta" className="size-4" /></button></div></li>)}</ol>
      </section>
      <div className="space-y-5">
        <section className="rounded-xl border border-fio bg-papel p-5" aria-labelledby="rede-cobertura">
          <div className="flex items-center justify-between gap-2"><h3 id="rede-cobertura" className="text-sm font-semibold">Rodada de reconhecimento</h3><IconeRede nome="verificar" className="text-suave" /></div>
          <p className="mt-5 text-3xl font-semibold">{progresso}<span className="text-lg text-suave">%</span></p>
          <progress className="rede-progresso mt-3 w-full" value={resumo.respondidas} max={resumo.perguntasPossiveis || 1} aria-label="Perguntas respondidas na rede" />
          <p className="mt-3 text-xs text-suave">{numero(resumo.respondidas)} de {numero(resumo.perguntasPossiveis)} perguntas respondidas.</p>
          <p className="mt-3 text-xs leading-relaxed text-suave">Cada pergunta é um par entre um membro e uma pessoa da empresa. Resposta recebida não significa relação confirmada.</p>
        </section>
        <section className="rounded-xl border border-comprador-fio bg-comprador-fundo p-5">
          <h3 className="text-sm font-semibold text-comprador">Pronto para procurar um caminho?</h3>
          <p className="mt-2 text-xs leading-relaxed text-comprador">No agente, escolha a empresa e a tarefa “Abrir caminho até a liderança”. Confira as evidências antes de abordar.</p>
          <button className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-comprador hover:underline" onClick={aoAgente}>Ir ao agente<IconeRede nome="seta" className="size-4" /></button>
        </section>
      </div>
    </div>
    <p className="text-xs leading-relaxed text-suave">{numero(totais.externo)} intermediário(s) · {numero(resumo.bloqueadas)} relação(ões) com recusa ou informação desatualizada. Os indicadores contam pares de pessoas, não apresentações disponíveis. Cada caminho é verificado na consulta da empresa.</p>
  </motion.div>
}
