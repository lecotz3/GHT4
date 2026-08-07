import type { ChaveLastro, Lastro } from '../dominio/tipos'

/**
 * Selo de lastro e sua barra de composição.
 *
 * Duas decisões que não são estéticas:
 *
 * 1. O caso comum (lastro parcial) é NEUTRO. Se ele usar cor de alerta, a cor de
 *    alerta deixa de significar alerta — na base fictícia quase todo registro é
 *    parcial, e o âmbar em todo card virava ruído.
 * 2. A barra sempre vem com legenda rotulada. O par verde↔vermelho fica na banda
 *    de alerta para daltonismo, então o rótulo direto é o canal secundário
 *    obrigatório: a cor nunca carrega a informação sozinha.
 */

const ESTILO: Record<ChaveLastro, string> = {
  forte: 'text-alvo-tinta border-alvo/40 bg-alvo-fundo',
  medio: 'text-suave border-fio-forte bg-transparent',
  fraco: 'text-lacre border-lacre/40 bg-lacre/10 font-bold',
}

export function SeloLastro({
  rotulo,
  chave,
  titulo,
}: {
  rotulo: string
  chave: ChaveLastro
  titulo?: string
}) {
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-ficha border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${ESTILO[chave]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {rotulo}
    </span>
  )
}

export function BarraLastro({ lastro }: { lastro: Lastro }) {
  const { pctDocumentado: d, pctEstruturado: e, pctInferido: i } = lastro

  return (
    <div>
      {/* segmentos separados por 2px de superfície, para não se colarem */}
      <div className="my-2 flex h-2 gap-0.5" role="img" aria-label="Composição do lastro do índice">
        {d > 0 && <i className="block h-full rounded-[1px] bg-alvo" style={{ width: `${d}%` }} />}
        {e > 0 && <i className="block h-full rounded-[1px] bg-comprador" style={{ width: `${e}%` }} />}
        {i > 0 && <i className="block h-full rounded-[1px] bg-inferido" style={{ width: `${i}%` }} />}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-suave">
        <span className="inline-flex items-center gap-1.5">
          <i className="size-2 shrink-0 rounded-[1px] bg-alvo" />
          {d}% documentado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-2 shrink-0 rounded-[1px] bg-comprador" />
          {e}% indicador estruturado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-2 shrink-0 rounded-[1px] bg-inferido" />
          {i}% inferido, sem fonte
        </span>
      </div>

      {lastro.lacunas.length > 0 && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-lacre">
          <b>Atenção:</b> {lastro.lacunas.length === 1 ? 'o sinal' : 'os sinais'}{' '}
          <b>{lastro.lacunas.join(', ')}</b>{' '}
          {lastro.lacunas.length === 1 ? 'pesa' : 'pesam'} no índice mas não{' '}
          {lastro.lacunas.length === 1 ? 'tem' : 'têm'} fonte documental anexada. Confirmar antes de
          levar ao cliente.
        </p>
      )}
    </div>
  )
}
