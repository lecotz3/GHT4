import { useMemo, useState } from 'react'
import { crm } from '../dominio'
import type { EmpresaAvaliada, RegistroCrm } from '../dominio/tipos'
import { milhoes } from '../formato'

/**
 * Módulo 7 — CRM / pipeline de prospecção.
 *
 * A tela abre pelo FUNIL, não pela lista. A pergunta que um sócio faz ao abrir o
 * pipeline não é "quais empresas estão aqui?" — é "onde está travando?". A lista
 * vem depois, ordenada pelo que está parado há mais tempo, que é a segunda
 * pergunta: "de quem eu não cuido há mais tempo?".
 *
 * Cada registro carrega o RETRATO do momento em que entrou: índice,
 * classificação e receita de então. Seis meses depois, é o que permite
 * responder "por que a gente abordou essa empresa?" mesmo que a régua tenha
 * mudado desde lá.
 */

const CORES_ETAPA: Record<string, string> = {
  identificada: 'border-fio-forte text-suave',
  contatada: 'border-comprador/45 bg-comprador-fundo text-comprador-tinta',
  conversa_inicial: 'border-comprador/45 bg-comprador-fundo text-comprador-tinta',
  proposta_enviada: 'border-vendedora/50 text-vendedora-tinta',
  mandato_fechado: 'border-alvo/45 bg-alvo-fundo text-alvo-tinta',
  recusada: 'border-lacre/40 bg-lacre/10 text-lacre',
}

export function Crm({
  avaliadas,
  aoAbrirEmpresa,
}: {
  avaliadas: EmpresaAvaliada[]
  aoAbrirEmpresa: (e: EmpresaAvaliada) => void
}) {
  /* `versao` existe para avisar o React de que o estado guardado em crm.js
     mudou — mesmo padrão de `temReal` em App.tsx. Todo comando do módulo
     incrementa este contador. */
  const [versao, setVersao] = useState(0)
  const [responsavel, setResponsavel] = useState<string>('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  const dados = useMemo(() => {
    void versao
    return {
      funil: crm.funil(responsavel || undefined),
      agenda: crm.agenda(responsavel || undefined),
      todos: crm.registros(),
      responsaveis: crm.responsaveis(),
    }
  }, [versao, responsavel])

  function comando(resultado: { persistiu?: boolean; erro?: string } | boolean) {
    const persistiu = typeof resultado === 'boolean' ? resultado : resultado.persistiu
    setVersao((v) => v + 1)
    setAviso(persistiu === false ? 'Registrado só nesta aba — o navegador recusou o armazenamento local.' : '')
  }

  const etapas = crm.ESTADOS_FUNIL.filter((e) => !e.saida).sort((a, b) => a.ordem - b.ordem)
  const maiorContagem = Math.max(1, ...etapas.map((e) => dados.funil.contagem[e.chave] ?? 0))

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="text-[15px] font-semibold">Pipeline de prospecção</h2>
        <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-suave">
          Empresas entram aqui a partir de qualquer tela da ferramenta, carregando o índice e a
          classificação do momento da entrada.
        </p>

        {dados.responsaveis.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setResponsavel('')}
              className={`rounded-ficha border px-2.5 py-1 text-[11px] font-semibold transition
                ${!responsavel ? 'border-tinta bg-tinta text-papel' : 'border-fio-forte text-suave hover:border-tinta-2'}`}
            >
              Todos
            </button>
            {dados.responsaveis.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResponsavel(r)}
                className={`rounded-ficha border px-2.5 py-1 text-[11px] font-semibold transition
                  ${responsavel === r ? 'border-tinta bg-tinta text-papel' : 'border-fio-forte text-suave hover:border-tinta-2'}`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        {aviso && <p className="mt-2 text-[11.5px] text-lacre">{aviso}</p>}
      </section>

      {dados.todos.length === 0 ? (
        <p className="rounded-ficha border border-dashed border-fio-forte px-4 py-8 text-center text-[12px] leading-relaxed text-suave">
          Nenhuma empresa no funil. Use <b className="text-tinta">levar ao pipeline</b> no mapa de
          mercado, na lista de empresas ou numa lista de contrapartes.
        </p>
      ) : (
        <>
          {/* ---- funil ---- */}
          <section className="rounded-ficha border border-fio-forte p-4">
            <h3 className="mb-3 text-[12.5px] font-semibold">
              Funil · {dados.funil.responsavel} · {dados.funil.total} empresa
              {dados.funil.total === 1 ? '' : 's'}
            </h3>

            <div className="grid gap-1.5">
              {etapas.map((etapa, i) => {
                const quantidade = dados.funil.contagem[etapa.chave] ?? 0
                const conversao = i > 0 ? dados.funil.conversoes[i - 1] : null
                return (
                  <div key={etapa.chave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                    <div className="relative overflow-hidden rounded-ficha border border-fio bg-papel-2 px-3 py-2">
                      <div
                        className="absolute inset-y-0 left-0 border-r-2 border-tinta-2 bg-tinta/10"
                        style={{ width: `${(quantidade / maiorContagem) * 100}%` }}
                      />
                      <div className="relative flex flex-wrap items-baseline gap-x-3">
                        <b className="text-[12.5px]">{etapa.rotulo}</b>
                        {conversao && (
                          <span className="text-[11px] text-suave">
                            conversão {conversao.taxa === null ? '—' : `${conversao.taxa}%`} ({conversao.absoluto})
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="w-10 text-right text-[17px] font-semibold tabular-nums">{quantidade}</span>
                  </div>
                )
              })}
            </div>

            <p className="mt-3 border-t border-fio pt-2.5 text-[11px] leading-relaxed text-suave">
              A contagem é <b>cumulativa</b>: quem chegou à proposta passou por "contatada" e
              continua contando lá. Sem isso, a taxa de conversão compararia grupos diferentes.
            </p>

            {dados.funil.motivosDeRecusa.length > 0 && (
              <div className="mt-3 border-t border-fio pt-3">
                <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-suave">
                  Por que perdemos ({dados.funil.recusadas} recusa
                  {dados.funil.recusadas === 1 ? '' : 's'})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dados.funil.motivosDeRecusa.map((m) => (
                    <span key={m.chave} className="rounded-ficha border border-lacre/40 bg-lacre/10 px-2 py-0.5 text-[11px] text-lacre">
                      {m.rotulo} · {m.quantidade}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ---- agenda ---- */}
          <section>
            <h3 className="mb-1 text-[13px] font-semibold">Agenda de prospecção</h3>
            <p className="mb-3 text-[11.5px] text-suave">
              Ordenada pelo que está parado há mais tempo. Recusadas e fechadas ficam fora.
            </p>

            <div className="grid gap-2">
              {dados.agenda.map((r) => (
                <LinhaRegistro
                  key={r.empresaId}
                  registro={r}
                  expandido={expandido === r.empresaId}
                  aoAlternar={() => setExpandido(expandido === r.empresaId ? null : r.empresaId)}
                  aoComandar={comando}
                  empresa={avaliadas.find((e) => e.id === r.empresaId) ?? null}
                  aoAbrirEmpresa={aoAbrirEmpresa}
                />
              ))}
              {dados.agenda.length === 0 && (
                <p className="rounded-ficha border border-dashed border-fio-forte px-4 py-6 text-center text-[11.5px] text-suave">
                  Nenhuma empresa ativa nesta seleção.
                </p>
              )}
            </div>
          </section>

          {/* ---- encerradas ---- */}
          {dados.todos.some((r) => r.estado === 'recusada' || r.estado === 'mandato_fechado') && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold">Encerradas</h3>
              <div className="grid gap-1.5">
                {dados.todos
                  .filter((r) => r.estado === 'recusada' || r.estado === 'mandato_fechado')
                  .filter((r) => !responsavel || r.responsavel === responsavel)
                  .map((r) => (
                    <div
                      key={r.empresaId}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-ficha border border-fio px-3 py-2 text-[11.5px]"
                    >
                      <b>{r.nome}</b>
                      <span className={`rounded-ficha border px-1.5 py-0.5 text-[10px] font-semibold ${CORES_ETAPA[r.estado]}`}>
                        {crm.estadoDe(r.estado).rotulo}
                      </span>
                      <span className="text-suave">{r.responsavel}</span>
                      {r.recusa && (
                        <span className="text-suave">
                          {crm.MOTIVOS_RECUSA.find((m) => m.chave === r.recusa!.motivo)?.rotulo}
                          {r.recusa.resposta && ` — "${r.recusa.resposta}"`}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="rounded-ficha border border-lacre/30 bg-lacre/[0.06] p-4">
        <h3 className="mb-2 text-[12.5px] font-semibold text-lacre">Limitações desta implementação</h3>
        <ul className="grid gap-2.5">
          {crm.LIMITACOES.map((l) => (
            <li key={l.titulo} className="text-[11.5px] leading-relaxed">
              <b>{l.titulo}.</b> <span className="text-suave">{l.texto}</span>
              {l.viaDeObtencao !== '—' && (
                <span className="text-comprador-tinta"> Via: {l.viaDeObtencao}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function LinhaRegistro({
  registro: r,
  expandido,
  aoAlternar,
  aoComandar,
  empresa,
  aoAbrirEmpresa,
}: {
  registro: RegistroCrm & { diasParado?: number }
  expandido: boolean
  aoAlternar: () => void
  aoComandar: (r: { persistiu?: boolean; erro?: string } | boolean) => void
  empresa: EmpresaAvaliada | null
  aoAbrirEmpresa: (e: EmpresaAvaliada) => void
}) {
  const [nota, setNota] = useState('')
  const [descricaoCall, setDescricaoCall] = useState('')
  const [motivo, setMotivo] = useState('sem_interesse')
  const [resposta, setResposta] = useState('')

  const proxima = crm.ESTADOS_FUNIL
    .filter((e) => !e.saida)
    .sort((a, b) => a.ordem - b.ordem)
    .find((e) => e.ordem === crm.estadoDe(r.estado).ordem + 1)

  return (
    <article className="rounded-ficha border border-fio-forte">
      <button type="button" onClick={aoAlternar} className="flex w-full items-start gap-4 p-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <b className="text-[13px]">{r.nome}</b>
            <span className={`rounded-ficha border px-1.5 py-0.5 text-[10px] font-semibold ${CORES_ETAPA[r.estado]}`}>
              {crm.estadoDe(r.estado).rotulo}
            </span>
            <span className="text-[11px] text-suave">{r.responsavel}</span>
            <span className="text-[11px] text-suave">{r.subsetor}</span>
          </span>
          <span className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-suave">
            <span>índice na entrada {r.retrato.indice}</span>
            <span>{milhoes(r.retrato.receita)}</span>
            <span>{r.calls.length} call{r.calls.length === 1 ? '' : 's'}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[17px] font-semibold leading-none tabular-nums">{r.diasParado ?? 0}</span>
          <span className="block text-[10px] tracking-wide text-suave">dias parado</span>
        </span>
      </button>

      {expandido && (
        <div className="grid gap-4 border-t border-fio px-3.5 py-3">
          {/* avançar */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-[11.5px]">
              <span className="text-[10.5px] font-semibold text-suave">Nota do movimento</span>
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="o que aconteceu"
                className="w-64 rounded-ficha border border-fio-forte bg-papel px-2 py-1"
              />
            </label>
            {proxima && (
              <button
                type="button"
                onClick={() => { aoComandar(crm.mover(r.empresaId, proxima.chave, { nota })); setNota('') }}
                className="rounded-ficha border border-tinta bg-tinta px-2.5 py-1.5 text-[11px] font-semibold text-papel transition hover:opacity-90"
              >
                Avançar para {proxima.rotulo}
              </button>
            )}
            {empresa && (
              <button
                type="button"
                onClick={() => aoAbrirEmpresa(empresa)}
                className="rounded-ficha border border-fio-forte px-2.5 py-1.5 text-[11px] font-semibold transition hover:border-tinta-2"
              >
                Abrir dossiê
              </button>
            )}
          </div>

          {/* call */}
          <div className="flex flex-wrap items-end gap-2 border-t border-fio pt-3">
            <label className="grid flex-1 gap-1 text-[11.5px]">
              <span className="text-[10.5px] font-semibold text-suave">Descrição da call</span>
              <input
                value={descricaoCall}
                onChange={(e) => setDescricaoCall(e.target.value)}
                placeholder="quem participou, o que foi dito, próximo passo"
                className="w-full rounded-ficha border border-fio-forte bg-papel px-2 py-1"
              />
            </label>
            <button
              type="button"
              disabled={!descricaoCall.trim()}
              onClick={() => { aoComandar(crm.anotarCall(r.empresaId, { descricao: descricaoCall })); setDescricaoCall('') }}
              className="rounded-ficha border border-fio-forte px-2.5 py-1.5 text-[11px] font-semibold transition hover:border-tinta-2 disabled:opacity-40"
            >
              Registrar call
            </button>
          </div>

          {r.calls.length > 0 && (
            <ul className="grid gap-1 text-[11.5px]">
              {r.calls.map((c, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 border-b border-fio pb-1 last:border-0">
                  <span className="text-suave">{c.data}</span>
                  <span className="text-suave">{c.quem}</span>
                  <span>{c.descricao}</span>
                </li>
              ))}
            </ul>
          )}

          {/* recusa */}
          <div className="flex flex-wrap items-end gap-2 border-t border-fio pt-3">
            <label className="grid gap-1 text-[11.5px]">
              <span className="text-[10.5px] font-semibold text-suave">Motivo da recusa</span>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="rounded-ficha border border-fio-forte bg-papel px-2 py-1"
              >
                {crm.MOTIVOS_RECUSA.map((m) => (
                  <option key={m.chave} value={m.chave}>{m.rotulo}</option>
                ))}
              </select>
            </label>
            <label className="grid flex-1 gap-1 text-[11.5px]">
              <span className="text-[10.5px] font-semibold text-suave">Resposta específica</span>
              <input
                value={resposta}
                onChange={(e) => setResposta(e.target.value)}
                placeholder="o que a empresa respondeu, nas palavras dela"
                className="w-full rounded-ficha border border-fio-forte bg-papel px-2 py-1"
              />
            </label>
            <button
              type="button"
              onClick={() => aoComandar(crm.mover(r.empresaId, 'recusada', { motivoRecusa: motivo, respostaRecusa: resposta }))}
              className="rounded-ficha border border-lacre px-2.5 py-1.5 text-[11px] font-semibold text-lacre transition hover:bg-lacre hover:text-papel"
            >
              Marcar recusada
            </button>
          </div>

          {/* trilha */}
          <div className="border-t border-fio pt-3">
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-suave">
              Trilha — nenhum movimento é apagado
            </p>
            <ul className="grid gap-1 text-[11px]">
              {r.historico.map((h, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 text-suave">
                  <span>{new Date(h.quando).toLocaleDateString('pt-BR')}</span>
                  <span className="font-semibold text-tinta">
                    {h.de ? `${crm.estadoDe(h.de).rotulo} → ` : ''}{crm.estadoDe(h.para).rotulo}
                  </span>
                  <span>{h.quem}</span>
                  {h.nota && <span>· {h.nota}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </article>
  )
}
