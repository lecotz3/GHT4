/* =============================================================================
 *  FaixaNumerica — filtro de intervalo (receita, crescimento, margem)
 * -----------------------------------------------------------------------------
 *  Base: componente "Slider" de @originui no 21st.dev
 *  (https://21st.dev/@originui/components/slider), adaptado.
 *
 *  Duas mudanças de fundo em relação ao original:
 *
 *  1. Sem `cn` (clsx + tailwind-merge). O resto da v1 compõe classe com template
 *     string; trazer duas dependências só para esse componente seria peso sem
 *     retorno.
 *  2. Sem tooltip. O original mostra o valor num balão flutuante durante o
 *     arrasto — some quando solta, e some no teclado. Aqui o intervalo fica
 *     escrito ao lado do rótulo, sempre legível, o que num painel de filtros é
 *     o que a pessoa precisa ler antes e depois de mexer. De quebra, dispensa
 *     @radix-ui/react-tooltip.
 *
 *  A pele é a da casa: trilho de filete, punho quadrado de 2px como o resto das
 *  fichas. O trecho selecionado usa a cor do papel em questão quando informada.
 * ========================================================================== */

import * as Faixa from '@radix-ui/react-slider'

export type FaixaNumericaProps = {
  rotulo: string
  min: number
  max: number
  passo?: number
  valor: [number, number]
  aoMudar: (valor: [number, number]) => void
  /** Formata cada extremo para leitura (ex.: `R$ 120 mi`, `12,5%`). */
  formatar: (v: number) => string
  /** Quando ligado, o extremo superior no máximo é lido como "sem teto". */
  tetoAberto?: boolean
}

export function FaixaNumerica({
  rotulo,
  min,
  max,
  passo = 1,
  valor,
  aoMudar,
  formatar,
  tetoAberto = true,
}: FaixaNumericaProps) {
  const [de, ate] = valor
  const intacta = de === min && ate === max

  const legenda = intacta
    ? 'qualquer valor'
    : `${formatar(de)} — ${formatar(ate)}${tetoAberto && ate === max ? '+' : ''}`

  return (
    <div className="min-w-[190px] flex-1">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-suave">{rotulo}</span>
        <span
          className={`text-[11px] tabular-nums ${intacta ? 'italic text-suave/70' : 'font-semibold text-tinta'}`}
        >
          {legenda}
        </span>
      </div>

      <Faixa.Root
        value={valor}
        onValueChange={(v) => aoMudar([v[0], v[1]])}
        min={min}
        max={max}
        step={passo}
        minStepsBetweenThumbs={1}
        aria-label={rotulo}
        className="relative flex h-4 w-full touch-none select-none items-center"
      >
        <Faixa.Track className="relative h-[3px] w-full grow bg-fio">
          <Faixa.Range className="absolute h-full bg-tinta" />
        </Faixa.Track>

        {(['de', 'até'] as const).map((extremo) => (
          <Faixa.Thumb
            key={extremo}
            aria-label={`${rotulo}, ${extremo}`}
            className="block size-3.5 rotate-45 cursor-grab border-[1.5px] border-tinta bg-ficha
                       transition-[box-shadow,background-color] active:cursor-grabbing
                       hover:bg-papel-2
                       focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-papel),0_0_0_5px_var(--color-tinta)]"
          />
        ))}
      </Faixa.Root>
    </div>
  )
}
