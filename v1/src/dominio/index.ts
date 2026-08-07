/* =============================================================================
 *  Ponte para o domínio compartilhado
 * -----------------------------------------------------------------------------
 *  FONTE ÚNICA, DE PROPÓSITO
 *  A v1 NÃO reimplementa o scoring nem as regras de evidência. Ela importa
 *  exatamente os mesmos arquivos que o protótipo carrega por <script>:
 *
 *      ../data.js          empresas fictícias
 *      ../data-real.js     386 companhias abertas (CVM) — pode não existir
 *      ../evidencias.js    de onde vem cada afirmação
 *      ../scoring.js       sinais, pesos, índice e lastro
 *
 *  Por que funciona: esses arquivos não usam sintaxe de módulo (nenhum import ou
 *  export). O Vite os trata como módulos cujo corpo é executado por efeito
 *  colateral — as atribuições em `window.*` acontecem normalmente. A ORDEM
 *  importa: scoring.js consulta `window.EVIDENCIA` ao avaliar.
 *
 *  Por que não transformar os originais em ESM: o protótipo precisa rodar com
 *  duplo-clique no index.html, e navegador bloqueia módulos ES em file:// por
 *  CORS. Converter mataria a única característica que faz o protótipo funcionar
 *  numa sala de reunião sem rede.
 *
 *  Consequência prática: mexeu na regra de negócio, mexe num lugar só, e as
 *  duas interfaces mudam juntas.
 * ========================================================================== */

import '@dominio/data.js'
import '@dominio/evidencias.js'
import '@dominio/scoring.js'

import type { CamadaEvidencia, Empresa, Motor } from './tipos'

declare global {
  interface Window {
    MOTOR: Motor
    EVIDENCIA: CamadaEvidencia
    EMPRESAS_DEMO: Empresa[]
    PERFIS: string[]
    EMPRESAS_CVM?: Empresa[]
    PERFIS_CVM?: string[]
  }
}

/* data-real.js é gerado por `node ferramentas/importar-cvm.mjs` e pode
   legitimamente não existir num clone novo. Import dinâmico com captura para
   que a ausência degrade em "só a base fictícia", nunca em tela branca. */
export async function carregarBaseReal(): Promise<boolean> {
  if (window.EMPRESAS_CVM?.length) return true
  try {
    await import('@dominio/data-real.js')
    return Boolean(window.EMPRESAS_CVM?.length)
  } catch {
    console.info(
      '[GHT4] data-real.js ausente — rode `node ferramentas/importar-cvm.mjs` na raiz para gerar a base da CVM.',
    )
    return false
  }
}

export const motor = window.MOTOR
export const evidencia = window.EVIDENCIA

export type ChaveBase = 'demo' | 'cvm'

export interface DefinicaoBase {
  chave: ChaveBase
  rotulo: string
  nota: string
  /** Texto da tarja: a natureza do dado MUDA com a base, e avisar "fictício"
   *  sobre dado real é tão errado quanto o contrário — e mais perigoso. */
  tarja: string
  real: boolean
  empresas(): Empresa[]
  perfis(): string[]
}

export const BASES: Record<ChaveBase, DefinicaoBase> = {
  demo: {
    chave: 'demo',
    rotulo: 'Demonstração',
    nota: '32 empresas fictícias, com o conjunto completo de sinais — inclusive eventos societários. Serve para discutir o modelo, não o mercado.',
    tarja: 'Demonstração — empresas fictícias e índices ilustrativos',
    real: false,
    empresas: () => window.EMPRESAS_DEMO ?? [],
    perfis: () => window.PERFIS ?? [],
  },
  cvm: {
    chave: 'cvm',
    rotulo: 'Real · CVM',
    nota: '386 companhias abertas reais, com demonstrações auditadas entregues à CVM. Sem eventos societários — não existe fonte pública aberta para isso.',
    tarja: 'Empresas e números REAIS (CVM) · índice de priorização ilustrativo',
    real: true,
    empresas: () => window.EMPRESAS_CVM ?? [],
    perfis: () => window.PERFIS_CVM ?? [],
  },
}
