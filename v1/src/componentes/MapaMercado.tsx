import { useMemo, useState } from 'react'
import { mercado, motor } from '../dominio'
import type { EmpresaAvaliada, Subsegmento } from '../dominio/tipos'
import { milhoes, num, pct } from '../formato'

/**
 * Módulos 1 e 2 — mapa de subsegmentos e ranking de atratividade.
 *
 * A tela responde a duas perguntas em sequência, e a ordem é a da originação
 * real: "onde eu abro conversa?" (qual subsegmento) antes de "com quem?" (qual
 * empresa). O Módulo 3, que já existia, respondia só a segunda — e por isso a
 * ferramenta obrigava o usuário a escolher o setor de antemão, no palpite.
 *
 * DUAS COISAS FICAM PERMANENTEMENTE VISÍVEIS, e não é excesso de zelo:
 *
 *   1. A régua — quanto cada critério pesou e quanto rendeu. Ranking cuja
 *      fórmula não aparece é ranking que ninguém consegue contestar, e um
 *      número que não se contesta não se corrige.
 *   2. O que a base NÃO responde. Dos quatro critérios que o documento pede
 *      para este módulo, nenhum existe em dado público. Exibi-los como lacuna
 *      declarada é o que impede a leitura de que o índice é completo.
 */

const CORES_CONCENTRACAO: Record<string, string> = {
  fragmentado: 'text-alvo-tinta border-alvo/40 bg-alvo-fundo',
  moderado: 'text-suave border-fio-forte',
  concentrado: 'text-lacre border-lacre/40 bg-lacre/10',
  indeterminado: 'text-suave border-fio',
}

export function MapaMercado({
  avaliadas,
  aoAbrirEmpresa,
  aoMontarLista,
}: {
  avaliadas: EmpresaAvaliada[]
  aoAbrirEmpresa: (e: EmpresaAvaliada) => void
  aoMontarLista: (e: EmpresaAvaliada) => void
}) {
  const setores = useMemo(() => mercado.setoresDisponiveis(avaliadas), [avaliadas])
  const [setor, setSetor] = useState<string>(() => setores[0]?.setor ?? '')
  const [pesos, setPesos] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {}
    for (const chave in mercado.CRITERIOS_SUBSEGMENTO) {
      inicial[chave] = mercado.CRITERIOS_SUBSEGMENTO[chave].pesoPadrao
    }
    return inicial
  })
  const [aberto, setAberto] = useState<string | null>(null)
  const [mostrarLacunas, setMostrarLacunas] = useState(false)

  const ranking = useMemo(
    () => mercado.ranquearSubsegmentos(avaliadas, { setor, pesos }),
    [avaliadas, setor, pesos],
  )

  const somaPesos = Object.values(pesos).reduce((a, b) => a + b, 0)

  return (
    <div className="grid gap-6">
      {/* ---- entrada do Módulo 1: o setor ---- */}
      <section>
        <h2 className="text-[15px] font-semibold">Mapa de mercado</h2>
        <p className="mt-0.5 mb-3 max-w-prose text-[12px] leading-relaxed text-suave">
          Escolha um setor: a ferramenta abre os subsegmentos, lista as empresas de cada um e ordena
          os subsegmentos por atratividade para M&amp;A.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {setores.map((s) => (
            <button
              key={s.setor}
              type="button"
              onClick={() => { setSetor(s.setor); setAberto(null) }}
              className={`rounded-ficha border px-2.5 py-1 text-[11px] font-semibold transition
                ${setor === s.setor
                  ? 'border-tinta bg-tinta text-papel'
                  : 'border-fio-forte text-suave hover:border-tinta-2'}`}
            >
              {s.setor}
              <span className={setor === s.setor ? 'text-papel/60' : 'text-suave/70'}>
                {' '}· {s.empresas}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- a régua do Módulo 2 ---- */}
      <section className="rounded-ficha border border-fio-forte bg-tinta/[0.015] p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[12.5px] font-semibold">Pesos do ranking de subsegmentos</h3>
          <span className="text-[11px] text-suave">soma {somaPesos}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(mercado.CRITERIOS_SUBSEGMENTO).map(([chave, criterio]) => (
            <label key={chave} className="grid gap-1 text-[11.5px]">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate" title={criterio.explicacao}>
                  {criterio.rotulo}
                  {criterio.proxy && <span className="text-lacre"> · proxy</span>}
                </span>
                <b className="tabular-nums">{pesos[chave]}</b>
              </span>
              <input
                type="range"
                min={0}
                max={50}
                value={pesos[chave]}
                onChange={(e) => setPesos({ ...pesos, [chave]: Number(e.target.value) })}
                className="h-1 cursor-pointer appearance-none rounded-full bg-fio-forte accent-tinta"
                aria-label={`Peso de ${criterio.rotulo}`}
              />
              <span className="text-[10.5px] leading-snug text-suave">{criterio.fonte}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ---- ressalva de cobertura ---- */}
      <p className="rounded-ficha border border-lacre/30 bg-lacre/[0.06] px-3 py-2 text-[11.5px] leading-relaxed">
        <b>{ranking.ressalvaCobertura.titulo}.</b> {ranking.ressalvaCobertura.texto}
      </p>

      {/* ---- ranking ---- */}
      <section className="grid gap-2">
        {ranking.subsegmentos.map((s, i) => (
          <LinhaSubsegmento
            key={s.subsegmento}
            posicao={i + 1}
            subsegmento={s}
            aberto={aberto === s.subsegmento}
            aoAlternar={() => setAberto(aberto === s.subsegmento ? null : s.subsegmento)}
            aoAbrirEmpresa={aoAbrirEmpresa}
            aoMontarLista={aoMontarLista}
          />
        ))}
      </section>

      {/* ---- o que a base não responde ---- */}
      <section className="rounded-ficha border border-fio-forte p-4">
        <button
          type="button"
          onClick={() => setMostrarLacunas(!mostrarLacunas)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <b className="text-[12.5px]">
              {ranking.criteriosSemFonte.length} critérios do Módulo 2 que nenhuma fonte pública responde
            </b>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-suave">
              Interesse de compradores, volume de transações, múltiplos e tendências — os quatro que o
              documento pede. Declarados, não silenciados.
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-suave">
            {mostrarLacunas ? 'ocultar' : 'ver'}
          </span>
        </button>

        {mostrarLacunas && (
          <ul className="mt-3 grid gap-3 border-t border-fio pt-3">
            {ranking.criteriosSemFonte.map((c) => (
              <li key={c.criterio} className="text-[11.5px] leading-relaxed">
                <b>{c.criterio}</b>
                <p className="text-suave"><b>Por que importa:</b> {c.porQueImporta}</p>
                <p className="text-suave"><b>Por que falta:</b> {c.porQueFalta}</p>
                <p className="text-suave"><b>Via de obtenção:</b> {c.viaDeObtencao}</p>
                {c.substitutoAtual && (
                  <p className="text-comprador-tinta"><b>Hoje no lugar:</b> {c.substitutoAtual}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function LinhaSubsegmento({
  posicao,
  subsegmento: s,
  aberto,
  aoAlternar,
  aoAbrirEmpresa,
  aoMontarLista,
}: {
  posicao: number
  subsegmento: Subsegmento
  aberto: boolean
  aoAlternar: () => void
  aoAbrirEmpresa: (e: EmpresaAvaliada) => void
  aoMontarLista: (e: EmpresaAvaliada) => void
}) {
  const empresasOrdenadas = useMemo(
    () => [...s.empresas].sort((a, b) => b.scorePrincipal - a.scorePrincipal),
    [s.empresas],
  )

  return (
    <article className="rounded-ficha border border-fio-forte">
      <button type="button" onClick={aoAlternar} className="flex w-full items-start gap-4 p-4 text-left">
        <span className="w-6 shrink-0 text-[15px] font-semibold tabular-nums text-suave">{posicao}</span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-2">
            <b className="text-[13.5px]">{s.subsegmento}</b>
            <span
              className={`rounded-ficha border px-1.5 py-0.5 text-[10px] font-semibold ${CORES_CONCENTRACAO[s.concentracao.chave]}`}
            >
              {s.concentracao.rotulo}
              {s.hhi !== null && ` · HHI ${num(s.hhi)}`}
            </span>
          </span>

          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-suave">
            <span>{s.contagem} empresas</span>
            <span>{s.alvosNaFaixa} na faixa R$ 30–250 mi</span>
            {s.compradores !== undefined && <span>{s.compradores} consolidadores</span>}
            {s.crescimentoMediano !== null && <span>cresc. mediano {pct(s.crescimentoMediano)}</span>}
            {s.margemMediana !== null && <span>margem mediana {pct(s.margemMediana)}</span>}
          </span>

          {/* a régua: quanto cada critério rendeu */}
          <span className="mt-2 flex flex-wrap gap-1">
            {(s.contribuicoes ?? []).map((c) => (
              <span
                key={c.chave}
                title={`${c.rotulo}: ${c.semDado ? 'sem dado' : `${c.pontos} de ${c.peso} pontos`}`}
                className={`rounded-ficha border px-1.5 py-0.5 text-[10px] ${
                  c.semDado
                    ? 'border-dashed border-fio-forte text-suave/70'
                    : 'border-fio-forte text-suave'
                }`}
              >
                {c.rotulo} {c.semDado ? '—' : `${c.pontos}/${c.peso}`}
              </span>
            ))}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-[22px] font-semibold leading-none tabular-nums">{s.score}</span>
          <span className="block text-[10px] tracking-wide text-suave">índice</span>
        </span>
      </button>

      {aberto && (
        <div className="border-t border-fio px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-suave">
            Empresas do subsegmento, ordenadas pelo índice do Módulo 3
          </p>
          <ul className="grid gap-1">
            {empresasOrdenadas.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-fio py-1.5 text-[11.5px] last:border-0"
              >
                <button
                  type="button"
                  onClick={() => aoAbrirEmpresa(e)}
                  className="font-semibold hover:underline"
                >
                  {e.nome}
                </button>
                <span className="text-suave">{e.uf}</span>
                <span className="text-suave">{milhoes(e.receita)}</span>
                <span className="text-suave">{motor.CONFIG_PAPEIS[e.classificacao].rotulo}</span>
                <span className="tabular-nums text-suave">índice {e.scorePrincipal}</span>
                <button
                  type="button"
                  onClick={() => aoMontarLista(e)}
                  className="ml-auto text-[11px] font-semibold text-comprador-tinta hover:underline"
                >
                  montar lista de compradores →
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}
