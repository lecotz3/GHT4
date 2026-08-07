import { useEffect, useMemo, useState } from 'react'
import { BASES, carregarBaseReal, motor, type ChaveBase } from './dominio'
import type { EmpresaAvaliada, Papel } from './dominio/tipos'
import { FichaEmpresa } from './componentes/FichaEmpresa'
import { FaixaNumerica } from './componentes/FaixaNumerica'
import { Gaveta } from './componentes/Gaveta'
import { Dossie } from './componentes/Dossie'
import { milhoes, num, pct } from './formato'

const PAPEIS: Papel[] = ['alvo', 'comprador', 'vendedora']

/** Uma faixa não escolhida é `null`, e isso é diferente de "faixa inteira":
 *  enquanto ninguém mexeu, registros SEM o indicador continuam na lista. Assim
 *  que a faixa é usada, ela vira um critério numérico — e quem não tem número
 *  não pode ser comparado, então sai. Tratar ausência como zero acenderia
 *  "margem baixa" em toda empresa sem margem apurada; foi bug real do protótipo. */
type Faixa = [number, number] | null

interface Limites {
  min: number
  max: number
  passo: number
}

function limitesDe(valores: (number | null)[]): Limites | null {
  const nums = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  if (nums.length < 2) return null

  const bruto = { min: Math.min(...nums), max: Math.max(...nums) }
  if (bruto.min === bruto.max) return null

  /* Passo proporcional à amplitude: a base da CVM vai a mais de R$ 1 bi, e um
     passo de 1 ali daria 1 milhão de paradas no teclado. */
  const amplitude = bruto.max - bruto.min
  const passo = amplitude > 5000 ? 50 : amplitude > 500 ? 10 : amplitude > 50 ? 1 : 0.5

  return {
    min: Math.floor(bruto.min / passo) * passo,
    max: Math.ceil(bruto.max / passo) * passo,
    passo,
  }
}

function dentro(v: number | null, faixa: Faixa, lim: Limites | null): boolean {
  if (!faixa || !lim) return true
  if (faixa[0] === lim.min && faixa[1] === lim.max) return true
  if (v === null) return false
  return v >= faixa[0] && v <= faixa[1]
}

const ROMANOS: Record<Papel, string> = { alvo: 'I', comprador: 'II', vendedora: 'III' }
const TINTA_PAPEL: Record<Papel, string> = {
  alvo: 'text-alvo-tinta',
  comprador: 'text-comprador-tinta',
  vendedora: 'text-vendedora-tinta',
}
const MARCA_PAPEL: Record<Papel, string> = {
  alvo: 'bg-alvo',
  comprador: 'bg-comprador',
  vendedora: 'bg-vendedora',
}

export default function App() {
  const [base, setBase] = useState<ChaveBase>('demo')
  const [temReal, setTemReal] = useState(false)
  const [busca, setBusca] = useState('')
  const [setor, setSetor] = useState('')
  const [papeisAtivos, setPapeisAtivos] = useState<Set<Papel>>(new Set(PAPEIS))

  const [faixaReceita, setFaixaReceita] = useState<Faixa>(null)
  const [faixaCrescimento, setFaixaCrescimento] = useState<Faixa>(null)
  const [faixaMargem, setFaixaMargem] = useState<Faixa>(null)

  /* `selecionada` sobrevive ao fechamento de propósito: se zerasse junto, o
     dossiê ficaria vazio durante a animação de saída da gaveta. */
  const [selecionada, setSelecionada] = useState<EmpresaAvaliada | null>(null)
  const [gavetaAberta, setGavetaAberta] = useState(false)

  useEffect(() => {
    carregarBaseReal().then(setTemReal)
  }, [])

  /* `temReal` é dependência de verdade, não enfeite — não remova.
     `BASES[base].empresas()` lê `window.*`, que é estado externo mutável:
     `carregarBaseReal()` preenche `window.EMPRESAS_CVM` de forma assíncrona, e a
     virada de `temReal` para true é o ÚNICO aviso que o React recebe de que
     aquele global passou a ter dados. Sem ela, a base da CVM termina de carregar
     e a tela continua mostrando a lista antiga.

     Por isso a leitura é guardada em vez de suprimir o aviso do linter: assim a
     dependência fica visivelmente carregada, e o próximo leitor não a remove
     achando que sobra. */
  const avaliadas = useMemo<EmpresaAvaliada[]>(() => {
    const pronta = base === 'demo' || temReal
    const empresas = pronta ? BASES[base].empresas() : []
    return empresas.length ? motor.avaliarBase(empresas) : []
  }, [base, temReal])

  const setores = useMemo(
    () => [...new Set(avaliadas.map((e) => e.setor))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [avaliadas],
  )

  const limites = useMemo(
    () => ({
      receita: limitesDe(avaliadas.map((e) => e.receita)),
      crescimento: limitesDe(avaliadas.map((e) => e.crescimento)),
      margem: limitesDe(avaliadas.map((e) => e.margemEbitda)),
    }),
    [avaliadas],
  )

  /* Trocar de base troca a ordem de grandeza inteira (R$ 250 mi na fictícia,
     R$ 1 bi na CVM). Manter a faixa anterior esconderia a base nova atrás de um
     filtro que a pessoa não escolheu para ela. */
  useEffect(() => {
    setFaixaReceita(null)
    setFaixaCrescimento(null)
    setFaixaMargem(null)
  }, [base])

  const lista = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return avaliadas
      .filter((e) => {
        if (setor && e.setor !== setor) return false
        if (!papeisAtivos.has(e.classificacao)) return false
        if (!dentro(e.receita, faixaReceita, limites.receita)) return false
        if (!dentro(e.crescimento, faixaCrescimento, limites.crescimento)) return false
        if (!dentro(e.margemEbitda, faixaMargem, limites.margem)) return false
        if (q) {
          const alvo = `${e.nome} ${e.subsetor} ${e.setor} ${e.cidade}`.toLowerCase()
          if (!alvo.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => b.scorePrincipal - a.scorePrincipal)
  }, [
    avaliadas,
    busca,
    setor,
    papeisAtivos,
    faixaReceita,
    faixaCrescimento,
    faixaMargem,
    limites,
  ])

  const def = BASES[base]

  const filtrando =
    Boolean(busca || setor) ||
    papeisAtivos.size < PAPEIS.length ||
    Boolean(faixaReceita || faixaCrescimento || faixaMargem)

  function limparFiltros() {
    setBusca('')
    setSetor('')
    setPapeisAtivos(new Set(PAPEIS))
    setFaixaReceita(null)
    setFaixaCrescimento(null)
    setFaixaMargem(null)
  }

  function abrirDossie(e: EmpresaAvaliada) {
    setSelecionada(e)
    setGavetaAberta(true)
  }

  function alternarPapel(p: Papel) {
    setPapeisAtivos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(p)) proximo.delete(p)
      else proximo.add(p)
      return proximo
    })
  }

  return (
    <div className="min-h-full">
      {/* A tarja acompanha a natureza do dado. Avisar "fictício" sobre dado real
          é tão errado quanto o contrário — e mais perigoso, porque leva a
          descartar informação verdadeira. */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 bg-lacre px-5 py-2 text-center text-[11px] font-medium text-papel">
        <b className="font-bold text-white">Confidencial</b>
        <span className="text-papel/50">·</span>
        <span>{def.tarja}</span>
        <span className="text-papel/50">·</span>
        <span>não prevê transações · não substitui análise humana</span>
      </div>

      <header className="flex flex-wrap items-start gap-4 px-8 pt-6">
        <div className="grid size-13 shrink-0 place-items-center rounded-full bg-radial from-[#94322f] to-lacre-fundo text-[21px] font-semibold text-papel shadow-[inset_0_0_0_1.5px_rgba(241,231,214,.35),inset_0_0_0_4px_var(--color-lacre)]">
          G4
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-suave">
            GHT4 · Fusões &amp; Aquisições
          </p>
          <h1 className="text-[23px] font-semibold leading-tight">Livro-razão de Prospecção</h1>
          <p className="mt-1 max-w-[520px] text-[12.5px] text-suave">
            Agente que organiza e prioriza oportunidades de originação. A decisão é sempre humana.
          </p>
        </div>
        <div className="ml-auto -rotate-3 self-start rounded-ficha border-[1.5px] border-tinta-2 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-tinta-2 opacity-70">
          v1
        </div>
      </header>

      <div className="relative mx-8 mt-5 border-t border-fio-forte">
        <span className="absolute -top-px left-0 w-30 border-t-2 border-tinta" />
      </div>

      <main className="px-8 pb-16 pt-6">
        {/* seletor de base */}
        <section className="mb-6">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-suave">Base de dados</p>
          <div className="flex flex-wrap items-center gap-2">
            {(['demo', 'cvm'] as ChaveBase[])
              .filter((k) => k === 'demo' || temReal)
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setBase(k)}
                  className={`rounded-ficha border px-3 py-1.5 text-[11px] font-semibold tracking-wide transition
                    ${base === k
                      ? 'border-tinta bg-tinta text-papel'
                      : 'border-fio-forte text-suave hover:border-tinta-2'}`}
                >
                  {BASES[k].rotulo}
                </button>
              ))}
          </div>
          <p className="mt-2 max-w-prose text-[11.5px] leading-relaxed text-suave">{def.nota}</p>
          {!temReal && (
            <p className="mt-1 text-[11.5px] text-lacre">
              Base da CVM ausente — rode <code className="rounded bg-tinta/6 px-1">node ferramentas/importar-cvm.mjs</code> na raiz.
            </p>
          )}
        </section>

        {/* filtros */}
        <section className="mb-6 flex flex-wrap items-end gap-4 border-y border-fio py-4">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-suave">Buscar</span>
            <input
              value={busca}
              onChange={(ev) => setBusca(ev.target.value)}
              placeholder="Nome, subsetor ou praça…"
              className="w-full border-b-[1.5px] border-fio-forte bg-transparent py-1.5 text-[13.5px] outline-none focus:border-tinta"
            />
          </label>

          <label>
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-suave">Setor</span>
            <select
              value={setor}
              onChange={(ev) => setSetor(ev.target.value)}
              className="min-w-[190px] cursor-pointer border-b-[1.5px] border-fio-forte bg-transparent py-1.5 text-[13.5px] outline-none focus:border-tinta"
            >
              <option value="">Todos os setores</option>
              {setores.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1 block text-[11px] font-semibold tracking-wide text-suave">Classificação</span>
            <div className="flex gap-1.5">
              {PAPEIS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => alternarPapel(p)}
                  className={`rounded-ficha border px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition
                    ${papeisAtivos.has(p)
                      ? 'border-tinta bg-tinta text-papel'
                      : 'border-fio-forte text-suave hover:border-tinta-2'}`}
                >
                  {motor.CONFIG_PAPEIS[p].rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3 pb-1.5">
            {filtrando && (
              <button
                type="button"
                onClick={limparFiltros}
                className="text-[11px] font-semibold text-suave underline decoration-fio-forte underline-offset-4
                           transition-colors hover:text-lacre hover:decoration-lacre
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
              >
                limpar filtros
              </button>
            )}
            <p className="text-[12px] text-suave">
              <b className="font-semibold text-tinta">{num(lista.length)}</b> registro
              {lista.length === 1 ? '' : 's'} · {def.rotulo}
            </p>
          </div>
        </section>

        {/* Faixas: só aparecem quando a base tem amplitude para justificá-las. */}
        {(limites.receita || limites.crescimento || limites.margem) && (
          <section className="mb-6 flex flex-wrap items-start gap-x-8 gap-y-5 border-b border-fio pb-5">
            {limites.receita && (
              <FaixaNumerica
                rotulo="Receita"
                min={limites.receita.min}
                max={limites.receita.max}
                passo={limites.receita.passo}
                valor={faixaReceita ?? [limites.receita.min, limites.receita.max]}
                aoMudar={setFaixaReceita}
                formatar={milhoes}
              />
            )}
            {limites.crescimento && (
              <FaixaNumerica
                rotulo="Crescimento"
                min={limites.crescimento.min}
                max={limites.crescimento.max}
                passo={limites.crescimento.passo}
                valor={faixaCrescimento ?? [limites.crescimento.min, limites.crescimento.max]}
                aoMudar={setFaixaCrescimento}
                formatar={(v) => pct(v, 0)}
              />
            )}
            {limites.margem && (
              <FaixaNumerica
                rotulo="Margem EBITDA"
                min={limites.margem.min}
                max={limites.margem.max}
                passo={limites.margem.passo}
                valor={faixaMargem ?? [limites.margem.min, limites.margem.max]}
                aoMudar={setFaixaMargem}
                formatar={(v) => pct(v, 0)}
              />
            )}
          </section>
        )}

        {/* resumo */}
        <div className="mb-7 grid grid-cols-1 overflow-hidden rounded-ficha border border-fio bg-papel-2 sm:grid-cols-3">
          {PAPEIS.map((p, i) => (
            <div
              key={p}
              className={`flex items-baseline gap-3 px-5 py-3.5 ${i > 0 ? 'border-fio sm:border-l' : ''}`}
            >
              <span className="text-[30px] font-semibold leading-none">
                {lista.filter((e) => e.classificacao === p).length}
              </span>
              <span className="flex flex-col gap-1">
                <i className={`h-[3px] w-5.5 rounded-[1px] ${MARCA_PAPEL[p]}`} />
                <span className="text-[11px] font-semibold text-suave">
                  {motor.CONFIG_PAPEIS[p].rotulo}
                </span>
              </span>
            </div>
          ))}
        </div>

        {lista.length === 0 ? (
          <div className="rounded-ficha border border-dashed border-fio-forte bg-papel-2 px-10 py-14 text-center">
            <p className="text-[13px] italic text-suave">
              Nenhum registro atende aos critérios de triagem selecionados.
            </p>
            {filtrando && (
              <button
                type="button"
                onClick={limparFiltros}
                className="mt-4 rounded-ficha border border-fio-forte px-3 py-1.5 text-[11px] font-semibold tracking-wide text-tinta-2
                           transition-colors hover:border-tinta hover:bg-tinta hover:text-papel
                           focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          PAPEIS.filter((p) => papeisAtivos.has(p)).map((p) => {
            const grupo = lista.filter((e) => e.classificacao === p)
            if (!grupo.length) return null
            return (
              <section key={p} className="mb-8 border-t border-fio pt-4">
                <header className="mb-4 flex flex-wrap items-center gap-3.5">
                  <span className="min-w-6 text-[20px] font-semibold leading-none text-suave">
                    {ROMANOS[p]}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-ficha border-[1.5px] border-current px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] ${TINTA_PAPEL[p]}`}
                  >
                    <i className="size-1.5 rotate-45 bg-current" />
                    {motor.CONFIG_PAPEIS[p].rotulo}
                  </span>
                  <span className="text-[11px] text-suave">{grupo.length} reg.</span>
                  <span className="ml-auto hidden max-w-[44%] text-right text-[12px] italic text-suave md:block">
                    {motor.CONFIG_PAPEIS[p].descricao}
                  </span>
                </header>

                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
                  {grupo.map((e) => (
                    <FichaEmpresa key={e.id} e={e} aoAbrir={abrirDossie} />
                  ))}
                </div>
              </section>
            )
          })
        )}
      </main>

      {selecionada && (
        <Gaveta
          aberta={gavetaAberta}
          aoMudar={setGavetaAberta}
          etiqueta={`Dossiê · ${def.rotulo}`}
          titulo={selecionada.nome}
          descricao={`${selecionada.setor} · ${selecionada.subsetor} · ${selecionada.cidade}/${selecionada.uf}`}
          rodape={
            <p className="text-[10.5px] leading-relaxed text-suave">
              {def.tarja} · não substitui due diligence nem análise humana.
            </p>
          }
        >
          <Dossie e={selecionada} />
        </Gaveta>
      )}
    </div>
  )
}
