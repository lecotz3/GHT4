/* =============================================================================
 *  Gaveta — painel lateral do dossiê
 * -----------------------------------------------------------------------------
 *  Base: componente "Drawer" de @ddoemonn no 21st.dev
 *  (https://21st.dev/@ddoemonn/components/drawer), adaptado.
 *
 *  O que veio de lá e vale ouro (é difícil de acertar à mão):
 *    · foco preso dentro do painel, com Tab e Shift+Tab circulando;
 *    · o resto da página marcado `inert` enquanto a gaveta está aberta, para
 *      leitor de tela e Tab não vazarem para trás do scrim;
 *    · trava de rolagem do documento COM compensação da barra de rolagem, que é
 *      o que evita a página inteira dar um pulo lateral ao abrir;
 *    · devolução do foco ao elemento que abriu, ao fechar;
 *    · arrastar-para-fechar com decisão por distância OU velocidade.
 *
 *  O que foi trocado: toda a pele. O original é SaaS — branco, cantos de 14px,
 *  cinza-pedra, foco azul. Aqui é o livro-razão da GHT4: papel, filete de tinta,
 *  canto de 2px. Ninguém deve conseguir apontar a origem olhando a tela.
 *
 *  Também removido o `"use client"` (isto é Vite, não Next) e traduzida a
 *  interface, inclusive os rótulos que só o leitor de tela ouve.
 * ========================================================================== */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'

const ABERTURA = { type: 'spring', stiffness: 150, damping: 27, mass: 1 } as const

const FOCAVEL =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

type ComInert = HTMLElement & { inert?: boolean }

type InfoArrasto = {
  offset: { x: number; y: number }
  velocity: { x: number; y: number }
}

export type LadoGaveta = 'esquerda' | 'direita'

type OpcoesGaveta = {
  aberta: boolean
  aoMudar: (aberta: boolean) => void
  lado?: LadoGaveta
  largura?: number
  razaoDescarte?: number
}

function useGaveta({
  aberta,
  aoMudar,
  lado = 'direita',
  largura = 560,
  razaoDescarte = 0.38,
}: OpcoesGaveta) {
  const [arrastando, setArrastando] = useState(false)

  const sinal = lado === 'direita' ? 1 : -1
  const fora = sinal * (largura + 24)

  const x = useMotionValue(aberta ? 0 : fora)
  const veu = useTransform(x, (v) => 1 - Math.min(1, Math.abs(v) / largura))

  const raizRef = useRef<HTMLDivElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)
  const devolverPara = useRef<HTMLElement | null>(null)
  const animacao = useRef<{ stop: () => void } | null>(null)

  const viva = useRef(aberta)
  viva.current = aberta

  const mudou = useRef(aoMudar)
  mudou.current = aoMudar

  const reduzido = useReducedMotion()
  const controles = useDragControls()

  const fechar = useCallback(() => mudou.current?.(false), [])

  const deslizar = useCallback(
    (destino: number) => {
      animacao.current?.stop()
      animacao.current = animate(x, destino, reduzido ? { duration: 0 } : ABERTURA)
    },
    [x, reduzido],
  )

  useEffect(() => {
    deslizar(aberta ? 0 : fora)
    return () => animacao.current?.stop()
  }, [aberta, fora, deslizar])

  /* Painel fechado não deve ser alcançável por Tab nem lido em voz alta, mesmo
     ainda montado no DOM para a animação de saída. */
  useEffect(() => {
    const painel = painelRef.current as ComInert | null
    if (!painel) return
    painel.inert = !aberta
    return () => {
      painel.inert = false
    }
  }, [aberta])

  useEffect(() => {
    if (aberta) {
      const ativo = document.activeElement
      devolverPara.current = ativo instanceof HTMLElement ? ativo : null
      const painel = painelRef.current
      if (!painel) return
      const primeiro = painel.querySelector<HTMLElement>(FOCAVEL)
      ;(primeiro ?? painel).focus({ preventScroll: true })
      return
    }
    const alvo = devolverPara.current
    devolverPara.current = null
    if (alvo && alvo.isConnected) alvo.focus({ preventScroll: true })
  }, [aberta])

  /* Trava a rolagem e devolve, em padding, a largura que a barra de rolagem
     ocupava — sem isso a página toda salta para o lado ao abrir a gaveta. */
  useEffect(() => {
    if (!aberta) return
    const raiz = document.documentElement
    const overflow = raiz.style.overflow
    const padding = raiz.style.paddingRight
    const goteira = window.innerWidth - raiz.clientWidth

    raiz.style.overflow = 'hidden'
    if (goteira > 0) raiz.style.paddingRight = `${goteira}px`

    return () => {
      raiz.style.overflow = overflow
      raiz.style.paddingRight = padding
    }
  }, [aberta])

  useEffect(() => {
    const casca = raizRef.current
    if (!aberta || !casca) return
    const silenciados: ComInert[] = []

    for (const no of Array.from(document.body.children)) {
      if (!(no instanceof HTMLElement) || no.contains(casca)) continue
      const el = no as ComInert
      if (el.inert) continue
      el.inert = true
      silenciados.push(el)
    }

    return () => {
      for (const el of silenciados) el.inert = false
    }
  }, [aberta])

  const aoTeclar = useCallback(
    (evento: React.KeyboardEvent) => {
      const painel = painelRef.current
      if (!painel) return

      if (evento.key === 'Escape') {
        evento.stopPropagation()
        fechar()
        return
      }
      if (evento.key !== 'Tab') return

      const nos = Array.from(painel.querySelectorAll<HTMLElement>(FOCAVEL))
      if (nos.length === 0) {
        evento.preventDefault()
        painel.focus({ preventScroll: true })
        return
      }

      const primeiro = nos[0]
      const ultimo = nos[nos.length - 1]
      const ativo = document.activeElement

      if (evento.shiftKey && (ativo === primeiro || ativo === painel)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && ativo === ultimo) {
        evento.preventDefault()
        primeiro.focus()
      }
    },
    [fechar],
  )

  const iniciarArrasto = useCallback(
    (evento: React.PointerEvent) => {
      if (!viva.current) return
      controles.start(evento)
    },
    [controles],
  )

  const aoTerminarArrasto = useCallback(
    (_evento: MouseEvent | TouchEvent | PointerEvent, info: InfoArrasto) => {
      setArrastando(false)
      const percorrido = sinal * info.offset.x
      const velocidade = sinal * info.velocity.x
      /* Distância OU velocidade: um puxão curto e rápido também fecha, que é o
         gesto que a mão faz quando já decidiu. */
      if (percorrido > largura * razaoDescarte || velocidade > 520) {
        fechar()
        return
      }
      deslizar(0)
    },
    [sinal, largura, razaoDescarte, deslizar, fechar],
  )

  return {
    arrastando,
    x,
    veu,
    fechar,
    raizRef,
    painelRef,
    painelProps: {
      tabIndex: -1,
      role: 'dialog' as const,
      'aria-modal': true,
      onKeyDown: aoTeclar,
      drag: 'x' as const,
      dragControls: controles,
      dragListener: false,
      dragMomentum: false,
      dragConstraints: { left: 0, right: 0 },
      dragElastic:
        lado === 'direita'
          ? { top: 0, bottom: 0, left: 0, right: 1 }
          : { top: 0, bottom: 0, left: 1, right: 0 },
      onDragStart: () => setArrastando(true),
      onDragEnd: aoTerminarArrasto,
    },
    pegaProps: { onPointerDown: iniciarArrasto },
  }
}

const ICONE_FECHAR = (
  <svg width="13" height="13" viewBox="0 0 256 256" fill="none" aria-hidden="true">
    <line x1="200" y1="56" x2="56" y2="200" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
    <line x1="200" y1="200" x2="56" y2="56" stroke="currentColor" strokeWidth="18" strokeLinecap="round" />
  </svg>
)

export type GavetaProps = {
  aberta: boolean
  aoMudar: (aberta: boolean) => void
  titulo: string
  children: React.ReactNode
  /** Linha fina acima do título — no dossiê, a etiqueta de arquivo. */
  etiqueta?: string
  descricao?: string
  rodape?: React.ReactNode
  largura?: number
}

export function Gaveta({
  aberta,
  aoMudar,
  titulo,
  children,
  etiqueta,
  descricao,
  rodape,
  largura = 560,
}: GavetaProps) {
  const idTitulo = useId()
  const idDica = useId()

  const g = useGaveta({ aberta, aoMudar, largura })

  const [hospedeiro, setHospedeiro] = useState<HTMLElement | null>(null)
  useEffect(() => setHospedeiro(document.body), [])

  const arvore = (
    <div
      ref={g.raizRef}
      className={`fixed inset-0 z-50 overflow-hidden ${aberta ? '' : 'pointer-events-none'}`}
    >
      <motion.div
        aria-hidden
        style={{ opacity: g.veu }}
        onClick={g.fechar}
        className="absolute inset-0 bg-tinta/35 backdrop-blur-[1.5px]"
      />

      <motion.div
        ref={g.painelRef}
        aria-labelledby={idTitulo}
        aria-describedby={idDica}
        style={{ x: g.x, width: largura, maxWidth: 'calc(100% - 32px)', touchAction: 'pan-y' }}
        className={`absolute inset-y-0 right-0 flex flex-col border-l-2 border-tinta bg-ficha
                    shadow-[-24px_0_60px_-28px_rgba(22,33,28,0.55)] outline-none
                    ${g.arrastando ? 'select-none' : ''}`}
        {...g.painelProps}
      >
        {/* A pega é o cabeçalho inteiro: área generosa, e o cursor anuncia. */}
        <header
          onPointerDown={g.pegaProps.onPointerDown}
          className={`relative flex select-none items-start gap-3 border-b border-fio-forte bg-papel-2 px-6 py-4
                      ${g.arrastando ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <span className="absolute inset-x-0 top-0 h-[3px] bg-lacre" />

          <div className="min-w-0 flex-1">
            {etiqueta && (
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-suave">
                {etiqueta}
              </p>
            )}
            <h2 id={idTitulo} className="truncate text-[20px] font-semibold leading-tight text-tinta">
              {titulo}
            </h2>
            {descricao && <p className="mt-1 truncate text-[11.5px] text-suave">{descricao}</p>}
          </div>

          <button
            type="button"
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={g.fechar}
            aria-label="Fechar o dossiê"
            className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-ficha border border-transparent text-suave
                       transition-colors hover:border-fio-forte hover:bg-papel hover:text-tinta
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            {ICONE_FECHAR}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>

        {rodape && <div className="border-t border-fio-forte bg-papel-2 px-6 py-3">{rodape}</div>}

        <span id={idDica} className="sr-only">
          Pressione Esc para fechar o dossiê, ou arraste o cabeçalho para a direita.
        </span>
      </motion.div>
    </div>
  )

  return hospedeiro ? createPortal(arvore, hospedeiro) : null
}
