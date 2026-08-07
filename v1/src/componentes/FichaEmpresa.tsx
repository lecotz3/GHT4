import type { EmpresaAvaliada, Papel } from '../dominio/tipos'
import { iniciais, milhoes, pct } from '../formato'
import { SeloLastro } from './SeloLastro'

const COR_PAPEL: Record<Papel, string> = {
  alvo: 'bg-alvo',
  comprador: 'bg-comprador',
  vendedora: 'bg-vendedora',
}

const TOM_SINAL: Record<string, string> = {
  positivo: 'bg-alvo-fundo text-alvo-tinta border-alvo/25',
  atencao: 'bg-vendedora-fundo text-vendedora-tinta border-vendedora/25',
  neutro: 'bg-papel-2 text-tinta-2 border-fio',
}

export function FichaEmpresa({
  e,
  aoAbrir,
}: {
  e: EmpresaAvaliada
  aoAbrir: (e: EmpresaAvaliada) => void
}) {
  const principais = e.papeis[e.classificacao].contribuicoes.slice(0, 3)
  const l = e.lastroPrincipal

  return (
    <button
      type="button"
      onClick={() => aoAbrir(e)}
      aria-label={`Abrir dossiê de ${e.nome}`}
      className="group relative flex w-full flex-col gap-3 rounded-ficha border border-fio bg-ficha p-4 text-left
                 transition hover:-translate-y-0.5 hover:border-fio-forte hover:shadow-lg
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
    >
      {/* filete do papel, à esquerda */}
      <span className={`absolute inset-y-0 left-0 w-[3px] opacity-85 ${COR_PAPEL[e.classificacao]}`} />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold leading-tight">{e.nome}</h3>
          <p className="mt-1 text-[11px] tracking-wide text-suave">
            {e.setor} · {e.subsetor} · {e.cidade}/{e.uf}
          </p>
        </div>
        <div className="shrink-0 text-right leading-none">
          <div className="text-[33px] font-semibold tracking-tight">
            {e.scorePrincipal}
            <sup className="ml-px text-[10px] font-normal text-suave">/100</sup>
          </div>
          <div className={`ml-auto mt-1 h-0.5 w-9 ${COR_PAPEL[e.classificacao]}`} />
          <div className="mt-1.5 text-[9.5px] font-semibold text-suave">Índice</div>
        </div>
      </header>

      <p className="text-[12.5px] leading-snug text-tinta-2 line-clamp-3">{e.oQueFazem}</p>

      {/* cifras estilo livro-razão */}
      <dl className="grid grid-cols-2 overflow-hidden rounded-ficha border border-fio bg-papel-2 text-[11px]">
        {[
          ['Receita', milhoes(e.receita)],
          ['Cresc.', pct(e.crescimento)],
          ['EBITDA', pct(e.margemEbitda)],
          ['Perfil', e.perfil],
        ].map(([k, v], i) => (
          <div
            key={k}
            className={`flex items-baseline justify-between gap-2 px-3 py-1.5
                        ${i % 2 === 0 ? 'border-r border-fio' : ''} ${i < 2 ? 'border-b border-fio' : ''}`}
          >
            <dt className="font-semibold text-suave">{k}</dt>
            <dd className="text-right font-semibold text-tinta">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-1.5">
        {principais.map((s) => (
          <span
            key={s.chave}
            className={`whitespace-nowrap rounded-ficha border px-2 py-1 text-[10.5px] font-semibold ${TOM_SINAL[s.tipo]}`}
          >
            {s.rotulo}
          </span>
        ))}
      </div>

      {/* self-start: o card é flex-col, e sem isso o selo estica na largura toda */}
      <div className="self-start">
        <SeloLastro
          chave={e.rotuloLastro.chave}
          rotulo={e.rotuloLastro.rotulo}
          titulo={`${l.pctDocumentado}% documentado · ${l.pctEstruturado}% indicador · ${l.pctInferido}% inferido`}
        />
      </div>

      <footer className="mt-auto flex items-center gap-2.5 border-t border-fio pt-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tinta text-[12px] font-semibold text-papel">
          {iniciais(e.contato.nome)}
        </span>
        <div className="min-w-0 text-[11px]">
          <p className="truncate font-bold">
            {e.contato.nome} <span className="font-normal text-suave">· {e.contato.cargo}</span>
          </p>
          <p className="truncate text-[10.5px] text-tinta-2">
            {e.contato.email ?? 'e-mail não informado'}
          </p>
        </div>
      </footer>
    </button>
  )
}
