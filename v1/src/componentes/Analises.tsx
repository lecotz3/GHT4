import { useMemo, useRef, useState } from 'react'
import { analises } from '../dominio'
import type { EmpresaAvaliada, EstatisticasMultiplos, Report } from '../dominio/tipos'
import { milhoes, num, pct } from '../formato'

/**
 * Módulo 5 — análises complementares: valuation, report de mercado e news run.
 *
 * As três dividem a mesma condição: dependem de material que vem de fora da
 * CVM. Por isso a tela é organizada pelo que o usuário precisa TRAZER, e não
 * pelo que ela produz — cada aba começa dizendo qual arquivo espera e de onde
 * ele sai.
 *
 * Nenhuma das três inventa número. Onde falta dado, aparece o campo vazio com o
 * motivo e a via de obtenção, que é o padrão do projeto inteiro.
 */

type Aba = 'valuation' | 'report' | 'news'

const ABAS: [Aba, string, string][] = [
  ['valuation', 'Valuation', '5.1 — comps e precedentes do Capital IQ'],
  ['report', 'Report de mercado', '5.2 — TAM/SAM/SOM, Porter, SWOT, PESTLE'],
  ['news', 'News run', '5.3 — notícias por empresa ou setor'],
]

export function Analises({
  avaliadas,
  setorPadrao,
}: {
  avaliadas: EmpresaAvaliada[]
  setorPadrao: string
}) {
  const [aba, setAba] = useState<Aba>('valuation')

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="text-[15px] font-semibold">Análises complementares</h2>
        <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-suave">
          As três dependem de material externo à CVM. A ferramenta monta a estrutura, preenche o que
          a base sustenta e declara o resto — em vez de completar com estimativa.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ABAS.map(([chave, rotulo, dica]) => (
            <button
              key={chave}
              type="button"
              title={dica}
              onClick={() => setAba(chave)}
              className={`rounded-ficha border px-2.5 py-1 text-[11px] font-semibold transition
                ${aba === chave ? 'border-tinta bg-tinta text-papel' : 'border-fio-forte text-suave hover:border-tinta-2'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </section>

      {aba === 'valuation' && <Valuation avaliadas={avaliadas} />}
      {aba === 'report' && <ReportMercado avaliadas={avaliadas} setorPadrao={setorPadrao} />}
      {aba === 'news' && <NewsRun avaliadas={avaliadas} setorPadrao={setorPadrao} />}

      <section className="rounded-ficha border border-lacre/30 bg-lacre/[0.06] p-4">
        <h3 className="mb-2 text-[12.5px] font-semibold text-lacre">O que estas análises não fazem</h3>
        <ul className="grid gap-2.5">
          {analises.LIMITACOES.map((l) => (
            <li key={l.titulo} className="text-[11.5px] leading-relaxed">
              <b>{l.modulo} · {l.titulo}.</b> <span className="text-suave">{l.texto}</span>{' '}
              <span className="text-comprador-tinta">Via: {l.viaDeObtencao}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/* ---- 5.1 ------------------------------------------------------------------ */

function Valuation({ avaliadas }: { avaliadas: EmpresaAvaliada[] }) {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [leitura, setLeitura] = useState<{
    registros: Record<string, unknown>[]
    colunasReconhecidas: string[]
    colunasAusentes: string[]
    separador: string
    estatisticas: EstatisticasMultiplos
  } | null>(null)
  const [empresaId, setEmpresaId] = useState('')
  const [veredito, setVeredito] = useState<'correta' | 'incorreta'>('correta')
  const [comentario, setComentario] = useState('')
  const [autor, setAutor] = useState('')
  const arquivo = useRef<HTMLInputElement>(null)

  const empresa = avaliadas.find((e) => e.id === empresaId) ?? null
  const salvo = empresaId ? analises.valuationDe(empresaId) : null

  function interpretar(conteudo: string) {
    try {
      const lido = analises.interpretarCsv(conteudo, analises.COLUNAS_COMPS)
      const consolidado = analises.consolidarMultiplos(lido.registros)
      setLeitura({ ...lido, registros: consolidado.registros, estatisticas: consolidado.estatisticas })
      setErro('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ler o material.')
      setLeitura(null)
    }
  }

  const aplicado = useMemo(
    () => (empresa && leitura ? analises.aplicarA(empresa, leitura.estatisticas) : null),
    [empresa, leitura],
  )

  return (
    <div className="grid gap-4">
      <section className="rounded-ficha border border-fio-forte bg-tinta/[0.015] p-4">
        <h3 className="text-[12.5px] font-semibold">Trazer a exportação do Capital IQ</h3>
        <p className="mt-0.5 mb-3 max-w-prose text-[11.5px] leading-relaxed text-suave">
          Exporte os comparáveis na plataforma e cole aqui, ou carregue o arquivo. Separador e
          formato numérico (1.234,56 ou 1,234.56) são detectados. <b>Sem raspagem</b> — o acesso é
          login web, e raspar plataforma paga violaria o contrato de assinatura.
        </p>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={5}
          placeholder={'Empresa;Receita;EBITDA;Market Cap;Net Debt;TEV/EBITDA\nSantos Brasil;2.450,5;735,2;9.800,0;1.200,0;15,0x'}
          className="w-full rounded-ficha border border-fio-forte bg-papel px-2.5 py-2 font-mono text-[11px]"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => interpretar(texto)}
            disabled={!texto.trim()}
            className="rounded-ficha border border-tinta bg-tinta px-2.5 py-1 text-[11px] font-semibold text-papel transition hover:opacity-90 disabled:opacity-40"
          >
            Interpretar material
          </button>
          <button
            type="button"
            onClick={() => arquivo.current?.click()}
            className="rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold text-suave transition hover:border-tinta-2"
          >
            Carregar arquivo CSV
          </button>
          <input
            ref={arquivo}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={async (e) => {
              const a = e.target.files?.[0]
              if (a) { const c = await a.text(); setTexto(c); interpretar(c) }
              e.target.value = ''
            }}
          />
        </div>
        {erro && <p className="mt-2 text-[11.5px] text-lacre">{erro}</p>}
      </section>

      {leitura && (
        <>
          <p className="rounded-ficha border border-fio px-3 py-2 text-[11.5px] leading-relaxed">
            <b>{leitura.registros.length} comparáveis lidos</b> · separador {leitura.separador} ·{' '}
            <span className="text-suave">reconhecidas: {leitura.colunasReconhecidas.join(', ')}</span>
            {leitura.colunasAusentes.length > 0 && (
              <span className="text-lacre"> · ausentes: {leitura.colunasAusentes.join(', ')}</span>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {(['evEbitda', 'evReceita'] as const).map((chave) => {
              const e = leitura.estatisticas[chave]
              if (!e) return null
              return (
                <div key={chave} className="rounded-ficha border border-fio-forte p-3.5">
                  <h4 className="text-[12px] font-semibold">{chave === 'evEbitda' ? 'EV/EBITDA' : 'EV/Receita'}</h4>
                  <p className="mt-1 text-[24px] font-semibold leading-none tabular-nums">
                    {num(e.mediana, 1)}×<span className="text-[12px] font-normal text-suave"> mediana</span>
                  </p>
                  <p className="mt-1.5 text-[11.5px] text-suave">
                    faixa de trabalho {num(e.q1, 1)}× a {num(e.q3, 1)}× (quartis) · amostra completa{' '}
                    {num(e.minimo, 1)}× a {num(e.maximo, 1)}× · n = {e.n}
                  </p>
                  <p className="mt-1 text-[11px] text-suave">
                    Mediana, não média: uma transação atípica distorce a média de uma amostra pequena.
                  </p>
                </div>
              )
            })}
          </div>

          <section className="rounded-ficha border border-fio-forte p-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[11.5px]">
                <span className="text-[10.5px] font-semibold text-suave">Aplicar a qual empresa da base</span>
                <select
                  value={empresaId}
                  onChange={(e) => setEmpresaId(e.target.value)}
                  className="w-72 rounded-ficha border border-fio-forte bg-papel px-2 py-1"
                >
                  <option value="">escolha…</option>
                  {[...avaliadas]
                    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                    .map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </label>
            </div>

            {aplicado && (
              <div className="mt-3 border-t border-fio pt-3">
                <p className="text-[11.5px] text-suave">
                  EBITDA estimado: <b className="text-tinta">{milhoes(aplicado.ebitdaEstimado)}</b> —
                  receita e margem vêm da DFP auditada; o múltiplo vem do material importado.
                </p>
                <div className="mt-2 grid gap-2">
                  {aplicado.faixas.map((f) => (
                    <div key={f.base} className="rounded-ficha border border-fio px-3 py-2">
                      <p className="flex flex-wrap items-baseline gap-x-3 text-[12px]">
                        <b>{f.base}</b>
                        <span className="text-[17px] font-semibold tabular-nums">{milhoes(f.central)}</span>
                        <span className="text-suave">faixa {milhoes(f.minimo)} a {milhoes(f.maximo)}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-suave">{f.referencia}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] text-lacre">{aplicado.ressalva}</p>

                {/* human-in-the-loop, seção 6.1 */}
                <div className="mt-3 border-t border-fio pt-3">
                  <h4 className="text-[12px] font-semibold">Revisão humana</h4>
                  <p className="mt-0.5 mb-2 text-[11.5px] text-suave">
                    O parecer não sobrescreve o cálculo — fica ao lado, com autor e data, e a
                    exportação carrega os dois.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grid gap-1 text-[11.5px]">
                      <span className="text-[10.5px] font-semibold text-suave">Quem revisou</span>
                      <input value={autor} onChange={(e) => setAutor(e.target.value)}
                        className="w-40 rounded-ficha border border-fio-forte bg-papel px-2 py-1" />
                    </label>
                    <label className="grid gap-1 text-[11.5px]">
                      <span className="text-[10.5px] font-semibold text-suave">Veredito</span>
                      <select value={veredito} onChange={(e) => setVeredito(e.target.value as 'correta' | 'incorreta')}
                        className="rounded-ficha border border-fio-forte bg-papel px-2 py-1">
                        <option value="correta">Correta</option>
                        <option value="incorreta">Incorreta</option>
                      </select>
                    </label>
                    <label className="grid flex-1 gap-1 text-[11.5px]">
                      <span className="text-[10.5px] font-semibold text-suave">Recomendação ou ajuste</span>
                      <input value={comentario} onChange={(e) => setComentario(e.target.value)}
                        placeholder="o que precisa mudar na amostra ou no múltiplo"
                        className="w-full rounded-ficha border border-fio-forte bg-papel px-2 py-1" />
                    </label>
                    <button
                      type="button"
                      disabled={!autor.trim() || !comentario.trim()}
                      onClick={() => {
                        analises.salvarValuation(empresaId, {
                          comps: leitura.estatisticas,
                          parecer: { autor, veredito, comentario },
                        })
                        setComentario('')
                      }}
                      className="rounded-ficha border border-fio-forte px-2.5 py-1.5 text-[11px] font-semibold transition hover:border-tinta-2 disabled:opacity-40"
                    >
                      Registrar parecer
                    </button>
                  </div>

                  {salvo && salvo.revisoes.length > 0 && (
                    <ul className="mt-3 grid gap-1 text-[11.5px]">
                      {salvo.revisoes.map((r, i) => (
                        <li key={i} className="flex flex-wrap gap-x-3 border-b border-fio pb-1 last:border-0">
                          <span className="text-suave">{new Date(r.quando).toLocaleDateString('pt-BR')}</span>
                          <b>{r.autor}</b>
                          <span className={r.veredito === 'correta' ? 'text-alvo-tinta' : 'text-lacre'}>
                            {r.veredito}
                          </span>
                          <span className="text-suave">{r.comentario}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/* ---- 5.2 ------------------------------------------------------------------ */

function ReportMercado({ avaliadas, setorPadrao }: { avaliadas: EmpresaAvaliada[]; setorPadrao: string }) {
  const setores = useMemo(
    () => [...new Set(avaliadas.map((e) => e.setor))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [avaliadas],
  )
  const [setor, setSetor] = useState(setorPadrao || setores[0] || '')
  const report: Report = useMemo(() => analises.montarReport(avaliadas, setor), [avaliadas, setor])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
          className="rounded-ficha border border-fio-forte bg-papel px-2 py-1 text-[12px]"
        >
          {setores.map((s) => <option key={s}>{s}</option>)}
        </select>
        {/* Módulo 9: "análise de mercado apresentada no chat e exportada em PDF".
            A impressão do navegador É a geração de PDF aqui — sem dependência,
            e com o resultado que o usuário já sabe conferir antes de salvar. */}
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold text-suave transition hover:border-tinta-2 print:hidden"
        >
          Exportar PDF
        </button>
      </div>

      <div className="para-impressao grid gap-4">
        <section className="rounded-ficha border border-fio-forte p-4">
          <h3 className="text-[14px] font-semibold">{report.setor}</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Empresas', num(report.universo.empresas)],
              ['Subsegmentos', num(report.universo.subsegmentos)],
              ['Receita somada', milhoes(report.universo.receitaSomada)],
              ['Crescimento mediano', pct(report.universo.crescimentoMediano)],
              ['Margem mediana', pct(report.universo.margemMediana)],
              ['Top 5 concentram', pct(report.universo.concentracaoTop5, 0)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo}>
                <p className="text-[15px] font-semibold tabular-nums">{valor}</p>
                <p className="text-[10.5px] text-suave">{rotulo}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-ficha border border-fio-forte p-4">
          <h3 className="text-[13px] font-semibold">{report.dimensionamento.titulo}</h3>
          <div className="mt-2 grid gap-2">
            {(['tam', 'sam', 'som'] as const).map((chave) => {
              const d = report.dimensionamento[chave]
              return (
                <div key={chave} className={`rounded-ficha border px-3 py-2 ${d.sustentado ? 'border-fio' : 'border-dashed border-lacre/40 bg-lacre/[0.05]'}`}>
                  <p className="flex flex-wrap items-baseline gap-x-3 text-[12px]">
                    <b>{d.rotulo}</b>
                    {d.valor !== null && <span className="text-[16px] font-semibold tabular-nums">{milhoes(d.valor)}</span>}
                  </p>
                  {d.aviso && <p className="mt-1 text-[11.5px] text-lacre">{d.aviso}</p>}
                  {d.oQueFalta && <p className="mt-1 text-[11.5px] text-suave"><b>Falta:</b> {d.oQueFalta}</p>}
                  <p className="mt-0.5 text-[10.5px] text-suave">Fonte: {d.fonte}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-ficha border border-fio-forte p-4">
          <h3 className="text-[13px] font-semibold">{report.players.titulo}</h3>
          <ul className="mt-2 grid gap-1">
            {report.players.lideres.map((l) => (
              <li key={l.nome} className="flex flex-wrap items-baseline gap-x-3 border-b border-fio py-1 text-[12px] last:border-0">
                <b>{l.nome}</b>
                <span className="text-suave">{l.subsetor}</span>
                <span className="ml-auto tabular-nums text-suave">{milhoes(l.receita)}</span>
                <span className="w-14 text-right tabular-nums">{pct(l.participacao)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-lacre">{report.players.aviso}</p>
        </section>

        <section className="rounded-ficha border border-fio-forte p-4">
          <h3 className="text-[13px] font-semibold">Cinco Forças de Porter</h3>
          <p className="mt-0.5 mb-2 text-[11.5px] text-suave">
            {report.porter.filter((f) => f.sustentado).length} de 5 forças têm indicador na base. As
            demais aparecem com o que falta, em vez de texto sem fonte.
          </p>
          <div className="grid gap-2">
            {report.porter.map((f) => (
              <div key={f.forca} className={`rounded-ficha border px-3 py-2 ${f.sustentado ? 'border-fio' : 'border-dashed border-lacre/40 bg-lacre/[0.05]'}`}>
                <p className="text-[12px] font-semibold">{f.forca}</p>
                {f.indicador && <p className="text-[12px] tabular-nums">{f.indicador}</p>}
                {f.leitura && <p className="mt-0.5 text-[11.5px] text-suave">{f.leitura}</p>}
                {f.oQueFalta && <p className="mt-0.5 text-[11.5px] text-lacre"><b>Falta:</b> {f.oQueFalta}</p>}
                <p className="mt-0.5 text-[10.5px] text-suave">Fonte: {f.fonte}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-ficha border border-fio-forte p-4">
            <h3 className="text-[13px] font-semibold">{report.swot.titulo}</h3>
            {(['forcas', 'fraquezas'] as const).map((chave) => (
              <div key={chave} className="mt-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-suave">
                  {chave === 'forcas' ? 'Forças' : 'Fraquezas'}
                </p>
                <ul className="mt-0.5 grid gap-0.5 text-[11.5px]">
                  {report.swot[chave].length > 0
                    ? report.swot[chave].map((t) => <li key={t}>· {t}</li>)
                    : <li className="text-suave">— sem indicador na base</li>}
                </ul>
              </div>
            ))}
            <p className="mt-2 text-[11.5px] text-lacre"><b>Falta:</b> {report.swot.oQueFalta}</p>
          </div>

          <div className="rounded-ficha border border-dashed border-lacre/40 bg-lacre/[0.05] p-4">
            <h3 className="text-[13px] font-semibold">PESTLE</h3>
            <p className="mt-1 text-[11.5px] text-suave">
              As seis dimensões estão declaradas sem fonte: {report.pestle.map((p) => p.dimensao).join(', ')}.
            </p>
            <p className="mt-1.5 text-[11.5px] text-lacre">{report.pestle[0].oQueFalta}</p>
            <p className="mt-0.5 text-[10.5px] text-suave">Fonte: {report.pestle[0].fonte}</p>
          </div>
        </section>

        <section className="rounded-ficha border border-dashed border-lacre/40 bg-lacre/[0.05] p-4">
          <h3 className="text-[13px] font-semibold">{report.trends.titulo}</h3>
          {report.trends.indicadorDisponivel && (
            <p className="mt-1 text-[12px]">{report.trends.indicadorDisponivel}</p>
          )}
          <p className="mt-1 text-[11.5px] text-lacre"><b>Falta:</b> {report.trends.oQueFalta}</p>
          <p className="mt-0.5 text-[10.5px] text-suave">Fonte: {report.trends.fonte}</p>
        </section>
      </div>
    </div>
  )
}

/* ---- 5.3 ------------------------------------------------------------------ */

function NewsRun({ avaliadas, setorPadrao }: { avaliadas: EmpresaAvaliada[]; setorPadrao: string }) {
  const [versao, setVersao] = useState(0)
  const [empresaId, setEmpresaId] = useState('')
  const [anos, setAnos] = useState(3)
  const [titulo, setTitulo] = useState('')
  const [veiculo, setVeiculo] = useState('')
  const [data, setData] = useState('')
  const [link, setLink] = useState('')
  const [lote, setLote] = useState('')
  const [erro, setErro] = useState('')

  const resultado = useMemo(() => {
    void versao
    return analises.newsRun({
      empresaId: empresaId || undefined,
      setor: empresaId ? undefined : setorPadrao || undefined,
      anos,
    })
  }, [versao, empresaId, anos, setorPadrao])

  return (
    <div className="grid gap-4">
      <section className="rounded-ficha border border-fio-forte bg-tinta/[0.015] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[11.5px]">
            <span className="text-[10.5px] font-semibold text-suave">Empresa</span>
            <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}
              className="w-64 rounded-ficha border border-fio-forte bg-papel px-2 py-1">
              <option value="">todas · por setor</option>
              {[...avaliadas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                .map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-[11.5px]">
            <span className="text-[10.5px] font-semibold text-suave">Período (anos)</span>
            <input type="number" min={1} max={20} value={anos} onChange={(e) => setAnos(Number(e.target.value))}
              className="w-20 rounded-ficha border border-fio-forte bg-papel px-2 py-1" />
          </label>
          <p className="text-[11.5px] text-suave">
            <b className="text-tinta">{resultado.total}</b> notícias · {resultado.periodo}
          </p>
        </div>
      </section>

      <section className="rounded-ficha border border-fio-forte p-4">
        <h3 className="text-[12.5px] font-semibold">Registrar notícia</h3>
        <p className="mt-0.5 mb-2 max-w-prose text-[11.5px] leading-relaxed text-suave">
          A coleta automática precisa de servidor e fonte licenciada. O que existe aqui é o destino
          estruturado — veículo, data e link, para a notícia poder ser citada como evidência depois.
        </p>
        <div className="flex flex-wrap items-end gap-2 text-[11.5px]">
          <label className="grid flex-1 gap-1">
            <span className="text-[10.5px] font-semibold text-suave">Título</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-ficha border border-fio-forte bg-papel px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-[10.5px] font-semibold text-suave">Veículo</span>
            <input value={veiculo} onChange={(e) => setVeiculo(e.target.value)}
              className="w-32 rounded-ficha border border-fio-forte bg-papel px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-[10.5px] font-semibold text-suave">Data</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="rounded-ficha border border-fio-forte bg-papel px-2 py-1" />
          </label>
          <label className="grid gap-1">
            <span className="text-[10.5px] font-semibold text-suave">Link</span>
            <input value={link} onChange={(e) => setLink(e.target.value)}
              className="w-40 rounded-ficha border border-fio-forte bg-papel px-2 py-1" />
          </label>
          <button
            type="button"
            disabled={!titulo.trim()}
            onClick={() => {
              analises.registrarNoticia({
                empresaId: empresaId || undefined,
                setor: empresaId ? undefined : setorPadrao,
                titulo, veiculo, data: data || undefined, link,
              })
              setTitulo(''); setVeiculo(''); setLink('')
              setVersao((v) => v + 1)
            }}
            className="rounded-ficha border border-tinta bg-tinta px-2.5 py-1.5 text-[11px] font-semibold text-papel transition hover:opacity-90 disabled:opacity-40"
          >
            Registrar
          </button>
        </div>

        <div className="mt-3 border-t border-fio pt-3">
          <p className="mb-1 text-[10.5px] font-semibold text-suave">Ou cole um lote (CSV: título; veículo; data; link)</p>
          <textarea value={lote} onChange={(e) => setLote(e.target.value)} rows={3}
            className="w-full rounded-ficha border border-fio-forte bg-papel px-2.5 py-2 font-mono text-[11px]" />
          <button
            type="button"
            disabled={!lote.trim()}
            onClick={() => {
              try {
                analises.importarNoticias(lote, { empresaId: empresaId || undefined, setor: empresaId ? undefined : setorPadrao })
                setLote(''); setErro(''); setVersao((v) => v + 1)
              } catch (e) {
                setErro(e instanceof Error ? e.message : 'Não consegui ler o lote.')
              }
            }}
            className="mt-2 rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold transition hover:border-tinta-2 disabled:opacity-40"
          >
            Importar lote
          </button>
          {erro && <p className="mt-2 text-[11.5px] text-lacre">{erro}</p>}
        </div>
      </section>

      {resultado.total > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-suave">
            {resultado.porAno.map((a) => (
              <span key={a.ano} className="rounded-ficha border border-fio-forte px-2 py-0.5">
                {a.ano} · {a.quantidade}
              </span>
            ))}
          </div>
          <ul className="grid gap-1">
            {resultado.noticias.map((n) => (
              <li key={n.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-ficha border border-fio px-3 py-1.5 text-[11.5px]">
                <span className="text-suave tabular-nums">{n.data}</span>
                <b>{n.titulo}</b>
                <span className="text-suave">{n.veiculo}</span>
                {n.link && (
                  <a href={n.link} target="_blank" rel="noreferrer" className="text-comprador-tinta underline">
                    abrir
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => { analises.removerNoticia(n.id); setVersao((v) => v + 1) }}
                  className="ml-auto text-[11px] font-semibold text-lacre hover:underline"
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
