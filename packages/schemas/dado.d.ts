/* =============================================================================
 *  GHT4 · tipos de Dado<T>, para a v1 em TypeScript
 * -----------------------------------------------------------------------------
 *  Espelha packages/schemas/dado.mjs. O runtime é o .mjs; este arquivo é só a
 *  régua de tipo que a interface consome.
 * ========================================================================== */

/** Como se chegou ao valor. Ver o cabeçalho de dado.mjs. */
export type EstadoDoDado =
  | 'reportado'
  | 'estimado'
  | 'proxy'
  | 'inferido'
  | 'nao_apurado'

export declare const ESTADOS: readonly EstadoDoDado[]
export declare const ESTADOS_COM_LASTRO: readonly EstadoDoDado[]

interface DadoBase {
  /** Id da fonte em fontes.js. Obrigatório quando o estado afirma lastro. */
  fonte: string | null
  /** Data ISO do que o valor descreve. */
  observadoEm: string | null
  /** Data ISO de quando foi coletado. */
  coletadoEm: string | null
  /** 0..1. */
  confianca: number | null
  /** Como se chegou ao valor. */
  metodo: string | null
  /** 'BRL_milhoes', 'pct', 'pessoas'... Obrigatória para valor numérico. */
  unidade: string | null
  /** '2025', '2025-Q3', '2024-2025'. */
  periodo: string | null
}

/** Valor apurado: existe, e sabe de onde veio. */
export interface DadoApurado<T> extends DadoBase {
  valor: T
  estado: Exclude<EstadoDoDado, 'nao_apurado'>
  motivo: null
}

/** Ausência declarada. O motivo é obrigatório: sem ele, some com o esquecimento. */
export interface DadoAusente extends DadoBase {
  valor: null
  estado: 'nao_apurado'
  motivo: string
}

export type Dado<T> = DadoApurado<T> | DadoAusente

export interface MetaDoDado {
  estado: Exclude<EstadoDoDado, 'nao_apurado'>
  fonte?: string
  observadoEm?: string
  coletadoEm?: string
  confianca?: number
  metodo?: string
  unidade?: string
  periodo?: string
}

export declare function dado<T>(valor: T, meta: MetaDoDado): DadoApurado<T>
export declare function naoApurado(motivo: string): DadoAusente
export declare function ehDado(d: unknown): d is Dado<unknown>
export declare function ehApurado(d: unknown): d is DadoApurado<unknown>
export declare function temLastro(d: unknown): d is DadoApurado<unknown>
export declare function valorDe<T>(d: Dado<T> | null | undefined): T | null
export declare function rotuloDoEstado(estado: EstadoDoDado): string

export interface Cobertura {
  total: number
  comLastro: number
  apurados: number
  ausentes: number
  /** `null` quando não há campo nenhum: zero afirmaria "nada tem lastro". */
  pctComLastro: number | null
}

export declare function cobertura(dados: Record<string, unknown> | null | undefined): Cobertura
