/* =============================================================================
 *  Ponte para o domínio compartilhado
 * -----------------------------------------------------------------------------
 *  FONTE ÚNICA, DE PROPÓSITO
 *  A v1 NÃO reimplementa o scoring nem as regras de evidência. Ela importa
 *  exatamente os mesmos arquivos que o protótipo carrega por <script>:
 *
 *      ../data.js          empresas fictícias
 *      ../evidencias.js    de onde vem cada afirmação
 *      ../scoring.js       sinais, pesos, índice e lastro
 *
 *  A quarta — ../data-real.js, a base da CVM — entra por <script> em
 *  `carregarBaseReal()`, não por import: é dado gerado, pode não existir, e não
 *  tem por que atravessar o bundler. Veja o comentário lá embaixo.
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
/* A ordem abaixo importa menos do que a de cima — estes quatro só consultam
   `window.MOTOR` na hora da chamada, nunca no corpo do arquivo. Ainda assim
   ficam depois de scoring.js, na sequência em que as camadas se empilham. */
import '@dominio/configuracao.js'
import '@dominio/conexoes.js'
import '@dominio/crm.js'
import '@dominio/mercado.js'
import '@dominio/matchmaking.js'
import '@dominio/exportar-excel.js'

import type {
  CamadaConfiguracao,
  CamadaConexoes,
  CamadaCrm,
  CamadaEvidencia,
  CamadaExcel,
  CamadaMatchmaking,
  CamadaMercado,
  Empresa,
  Motor,
} from './tipos'

declare global {
  interface Window {
    MOTOR: Motor
    EVIDENCIA: CamadaEvidencia
    CONFIGURACAO: CamadaConfiguracao
    CONEXOES: CamadaConexoes
    CRM: CamadaCrm
    MERCADO: CamadaMercado
    MATCHMAKING: CamadaMatchmaking
    EXCEL: CamadaExcel
    EMPRESAS_DEMO: Empresa[]
    PERFIS: string[]
    EMPRESAS_CVM?: Empresa[]
    PERFIS_CVM?: string[]
  }
}

/* Injeta um <script> e resolve quando ele terminou — ou rejeita se não carregou.
   Note que "carregou" não é "funcionou": um servidor estático que devolve o
   index.html no lugar de um 404 dispara onload com HTML no corpo. Por isso quem
   chama confere o resultado pelo global, não pela promessa. */
function carregarScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`falha ao carregar ${url}`))
    document.head.appendChild(script)
  })
}

/* data-real.js é gerado por `node ferramentas/importar-cvm.mjs` e pode
   legitimamente não existir num clone novo. A captura faz a ausência degradar
   em "só a base fictícia", nunca em tela branca.

   <script> em vez de import(): o arquivo é ~1 MB de DADO e não passa pelo
   bundler — vite.config.ts o serve e copia como ativo estático, e o comentário
   de lá explica por quê. É também exatamente como o protótipo o carrega. */
export async function carregarBaseReal(): Promise<boolean> {
  if (window.EMPRESAS_CVM?.length) return true
  try {
    await carregarScript(`${import.meta.env.BASE_URL}data-real.js`)
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
export const configuracao = window.CONFIGURACAO
export const conexoes = window.CONEXOES
export const crm = window.CRM
export const mercado = window.MERCADO
export const matchmaking = window.MATCHMAKING
export const excel = window.EXCEL

export type ChaveBase = 'demo' | 'cvm'

export interface DefinicaoBase {
  chave: ChaveBase
  rotulo: string
  /** Função, não string: a contagem é lida da base no momento do render. */
  nota: () => string
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
    /* A contagem sai da própria base carregada. Número escrito à mão vira
       mentira silenciosa no dia em que o importador roda de novo — foi o que
       aconteceu com "386" quando a base passou a incluir a DFP individual. */
    nota: () =>
      `${window.EMPRESAS_DEMO?.length ?? 0} empresas fictícias, com o conjunto completo de sinais — inclusive eventos societários. Serve para discutir o modelo, não o mercado.`,
    tarja: 'Demonstração — empresas fictícias e índices ilustrativos',
    real: false,
    empresas: () => window.EMPRESAS_DEMO ?? [],
    perfis: () => window.PERFIS ?? [],
  },
  cvm: {
    chave: 'cvm',
    rotulo: 'Real · CVM',
    nota: () =>
      `${window.EMPRESAS_CVM?.length ?? 0} companhias abertas reais, com demonstrações auditadas entregues à CVM. Sem eventos societários — não existe fonte pública aberta para isso.`,
    tarja: 'Empresas e números REAIS (CVM) · índice de priorização ilustrativo',
    real: true,
    empresas: () => window.EMPRESAS_CVM ?? [],
    perfis: () => window.PERFIS_CVM ?? [],
  },
}
