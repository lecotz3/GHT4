import { useMemo, useState } from 'react'
import { matchmaking, motor } from '../dominio'
import type { Candidata, EmpresaAvaliada } from '../dominio/tipos'
import { milhoes, pct } from '../formato'

/**
 * Módulo 6 — listas de potenciais compradores e alvos.
 *
 * A tela existe para um momento específico do trabalho: a GHT4 já foi
 * mandatada. A pergunta deixou de ser "quem interessa no mercado" e virou
 * "quem compra ESTA empresa" — e a resposta muda de eixo, porque cada candidata
 * passa a ser medida contra um alvo concreto em vez de um ideal abstrato.
 *
 * Cada candidata mostra POR QUE entrou, critério a critério. Uma lista de
 * compradores sem justificativa é indefensável na frente do cliente: o sócio
 * precisa saber, antes de ligar, se aquele nome está ali por proximidade
 * setorial ou só por tamanho.
 */

export function Matchmaking({
  avaliadas,
  empresaInicial,
  aoAbrirEmpresa,
}: {
  avaliadas: EmpresaAvaliada[]
  empresaInicial: EmpresaAvaliada | null
  aoAbrirEmpresa: (e: EmpresaAvaliada) => void
}) {
  const [busca, setBusca] = useState('')
  const [selecionada, setSelecionada] = useState<EmpresaAvaliada | null>(empresaInicial)
  const [sentido, setSentido] = useState<'sell-side' | 'buy-side'>('sell-side')
  const [expandida, setExpandida] = useState<string | null>(null)
  const [mostrarLimitacoes, setMostrarLimitacoes] = useState(false)

  const sugestoes = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return []
    return avaliadas
      .filter((e) => e.nome.toLowerCase().includes(termo))
      .slice(0, 8)
  }, [busca, avaliadas])

  const resultado = useMemo(() => {
    if (!selecionada) return null
    return sentido === 'sell-side'
      ? matchmaking.compradoresPara(selecionada, avaliadas, { limite: 15 })
      : matchmaking.alvosPara(selecionada, avaliadas, { limite: 15 })
  }, [selecionada, avaliadas, sentido])

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="text-[15px] font-semibold">Listas de compradores e alvos</h2>
        <p className="mt-0.5 mb-3 max-w-prose text-[12px] leading-relaxed text-suave">
          Escolha a empresa do mandato. Em <b>sell-side</b>, a ferramenta monta quem pode comprá-la;
          em <b>buy-side</b>, quais alvos cabem nela.
        </p>

        <div className="relative max-w-lg">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar a empresa do mandato…"
            className="w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-[12.5px]"
          />
          {sugestoes.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-ficha border border-fio-forte bg-papel shadow-lg">
              {sugestoes.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => { setSelecionada(e); setBusca(''); setExpandida(null) }}
                    className="flex w-full flex-wrap items-baseline gap-x-3 px-3 py-2 text-left text-[11.5px] hover:bg-tinta/5"
                  >
                    <b>{e.nome}</b>
                    <span className="text-suave">{e.subsetor}</span>
                    <span className="ml-auto text-suave">{milhoes(e.receita)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {selecionada && resultado && (
        <>
          <section className="rounded-ficha border border-fio-forte p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-suave">
                  Empresa do mandato
                </p>
                <h3 className="text-[16px] font-semibold">{selecionada.nome}</h3>
                <p className="mt-0.5 flex flex-wrap gap-x-4 text-[11.5px] text-suave">
                  <span>{selecionada.subsetor}</span>
                  <span>{selecionada.cidade}/{selecionada.uf}</span>
                  <span>{milhoes(selecionada.receita)}</span>
                  <span>margem {pct(selecionada.margemEbitda)}</span>
                  <span>{motor.CONFIG_PAPEIS[selecionada.classificacao].rotulo}</span>
                </p>
              </div>

              <div className="flex gap-1.5">
                {(['sell-side', 'buy-side'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setSentido(s); setExpandida(null) }}
                    className={`rounded-ficha border px-2.5 py-1 text-[11px] font-semibold transition
                      ${sentido === s
                        ? 'border-tinta bg-tinta text-papel'
                        : 'border-fio-forte text-suave hover:border-tinta-2'}`}
                  >
                    {s === 'sell-side' ? 'Quem compra' : 'O que comprar'}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-3 border-t border-fio pt-3 text-[11.5px] text-suave">
              {resultado.totalQualificadas} candidatas avaliadas sobre {resultado.totalAvaliadas} empresas
              da base · exibindo as {resultado.candidatas.length} de maior aderência
              {resultado.descartadasPorFaltaDeDado > 0 &&
                ` · ${resultado.descartadasPorFaltaDeDado} fora por dado não publicado`}
            </p>
          </section>

          <section className="grid gap-2">
            {resultado.candidatas.map((c, i) => (
              <LinhaCandidata
                key={c.id}
                posicao={i + 1}
                candidata={c}
                expandida={expandida === c.id}
                aoAlternar={() => setExpandida(expandida === c.id ? null : c.id)}
                aoAbrir={() => aoAbrirEmpresa(c)}
              />
            ))}
          </section>

          <section className="rounded-ficha border border-lacre/30 bg-lacre/[0.06] p-4">
            <button
              type="button"
              onClick={() => setMostrarLimitacoes(!mostrarLimitacoes)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <b className="text-[12.5px]">O que esta lista não sabe</b>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-suave">
                  A ordenação é por <b>capacidade</b> de comprar. Apetite declarado, tese de aquisição
                  e histórico de compras não são dados públicos.
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-semibold text-suave">
                {mostrarLimitacoes ? 'ocultar' : 'ver'}
              </span>
            </button>

            {mostrarLimitacoes && (
              <ul className="mt-3 grid gap-2.5 border-t border-lacre/20 pt-3">
                {resultado.limitacoes.map((l) => (
                  <li key={l.titulo} className="text-[11.5px] leading-relaxed">
                    <b>{l.titulo}.</b> <span className="text-suave">{l.texto}</span>{' '}
                    <span className="text-comprador-tinta">Via: {l.viaDeObtencao}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!selecionada && (
        <p className="rounded-ficha border border-dashed border-fio-forte px-4 py-8 text-center text-[12px] text-suave">
          Busque uma empresa acima para montar a lista.
        </p>
      )}
    </div>
  )
}

function LinhaCandidata({
  posicao,
  candidata: c,
  expandida,
  aoAlternar,
  aoAbrir,
}: {
  posicao: number
  candidata: Candidata
  expandida: boolean
  aoAlternar: () => void
  aoAbrir: () => void
}) {
  /* Barra de aderência com o mesmo vocabulário visual do índice: número grande à
     direita, composição à esquerda. */
  return (
    <article className="rounded-ficha border border-fio-forte">
      <button type="button" onClick={aoAlternar} className="flex w-full items-start gap-4 p-3.5 text-left">
        <span className="w-5 shrink-0 text-[13px] font-semibold tabular-nums text-suave">{posicao}</span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <b className="text-[13px]">{c.nome}</b>
            <span className="text-[11px] text-suave">{c.subsetor}</span>
            <span className="text-[11px] text-suave">{milhoes(c.receita)}</span>
            {c.criteriosSemDado > 0 && (
              <span className="rounded-ficha border border-dashed border-fio-forte px-1.5 py-0.5 text-[10px] text-suave">
                {c.criteriosSemDado} critério{c.criteriosSemDado === 1 ? '' : 's'} sem dado
              </span>
            )}
          </span>

          <span className="mt-1.5 flex flex-wrap gap-1">
            {c.contribuicoes.slice(0, 3).map((x) => (
              <span
                key={x.chave}
                className={`rounded-ficha border px-1.5 py-0.5 text-[10px] ${
                  x.semDado ? 'border-dashed border-fio-forte text-suave/70' : 'border-fio-forte text-suave'
                }`}
              >
                {x.descricao}
                {x.proxy && <span className="text-lacre"> · proxy</span>}
              </span>
            ))}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-[19px] font-semibold leading-none tabular-nums">{c.aderencia}%</span>
          <span className="block text-[10px] tracking-wide text-suave">aderência</span>
        </span>
      </button>

      {expandida && (
        <div className="border-t border-fio px-3.5 py-3">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-suave">
            Por que esta empresa entrou na lista
          </p>
          <ul className="grid gap-1.5">
            {c.contribuicoes.map((x) => (
              <li key={x.chave} className="flex flex-wrap items-baseline gap-x-3 text-[11.5px]">
                <span className="w-44 shrink-0 font-semibold">{x.rotulo}</span>
                <span className="text-suave">{x.descricao}</span>
                <span className="ml-auto tabular-nums text-suave">
                  {x.semDado ? 'sem dado — critério fora do cálculo' : `${x.pontos} de ${x.peso}`}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={aoAbrir}
            className="mt-3 rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold transition hover:border-tinta-2"
          >
            Abrir dossiê completo
          </button>
        </div>
      )}
    </article>
  )
}
