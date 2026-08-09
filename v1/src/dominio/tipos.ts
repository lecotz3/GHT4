/* =============================================================================
 *  Tipos do domínio GHT4
 * -----------------------------------------------------------------------------
 *  O motor (scoring.js) e a camada de evidência (evidencias.js) vivem na raiz do
 *  repositório, em JavaScript puro, porque o protótipo precisa carregá-los por
 *  <script> e rodar em file:// sem build. Estes tipos descrevem o contrato
 *  daquelas estruturas para o lado TypeScript, sem duplicar a lógica.
 * ========================================================================== */

export type Papel = 'alvo' | 'comprador' | 'vendedora'
export type TipoSinal = 'positivo' | 'atencao' | 'neutro'
export type NaturezaSinal = 'documental' | 'estruturado' | 'cadastral'
export type NaturezaEvidencia = NaturezaSinal | 'lacuna'
export type ChaveLastro = 'forte' | 'medio' | 'fraco'

export interface Contato {
  nome: string
  cargo: string
  email: string | null
  telefone: string | null
}

export interface Evidencia {
  natureza: NaturezaEvidencia
  tipo: string
  veiculo: string
  titulo: string
  data: string | null
  confianca: string
  trecho: string
  escopo?: 'empresa' | 'setorial'
}

export interface Sinal {
  chave: string
  rotulo: string
  tipo: TipoSinal
  natureza: NaturezaSinal
  detalhe: string
  evidencia: Evidencia | null
}

export interface Contribuicao extends Sinal {
  peso: number
}

export interface Lastro {
  pctDocumentado: number
  pctEstruturado: number
  pctInferido: number
  lacunas: string[]
}

export interface ResultadoPapel {
  score: number
  contribuicoes: Contribuicao[]
  maxPossivel: number
  somaPontos: number
  lastro: Lastro
}

/** Empresa como vem de data.js (fictícia) ou data-real.js (CVM). */
export interface Empresa {
  id: string
  nome: string
  setor: string
  subsetor: string
  oQueFazem: string
  cidade: string
  uf: string
  receita: number | null
  crescimento: number | null
  margemEbitda: number | null
  margemObservacao?: string | null
  funcionarios: number | null
  perfil: string
  contato: Contato
  mercadoFragmentado: boolean
  rodadaRecente: boolean
  mudancaControle: boolean
  expansaoGeografica: boolean
  situacaoEspecial?: string | null
  dataSituacaoEspecial?: string | null
  fonteBase?: 'cvm'
  cvm?: Record<string, unknown>
  origem: string
  dataAtualizacao: string
  confianca: string
  descricao: string

  /* Critérios de triagem de boutique. Só a base da CVM os preenche — `data.js`
     não modela dívida, liquidez nem fluxo de caixa. Todos opcionais e
     anuláveis: ausente e ruim são coisas diferentes, e o dossiê distingue. */
  alavancagem?: number | null
  liquidezCorrente?: number | null
  conversaoCaixa?: number | null
  conversaoObservacao?: string | null
  intensidadeInvestimento?: number | null
  contingenciasSobrePl?: number | null
  patrimonioLiquidoNegativo?: boolean | null
  receitaPorFuncionario?: number | null
  variacaoMargem?: number | null
  /* Declarados nulos de propósito: nenhuma fonte pública os responde. */
  concentracaoClientes?: null
  receitaRecorrente?: null
  dependenciaFundador?: null
}

/** Ressalva de triagem: risco exibido AO LADO do índice, nunca dentro dele. */
export interface Ressalva {
  chave: string
  rotulo: string
  detalhe: string
  evidencia: Evidencia | null
}

/** Critério que a boutique aplica e que nenhuma fonte pública responde. */
export interface CriterioSemFonte {
  chave: string
  rotulo: string
  peso: string
  motivo: string
  via: string
}

/** Empresa após passar pelo motor. */
export interface EmpresaAvaliada extends Empresa {
  sinais: Sinal[]
  papeis: Record<Papel, ResultadoPapel>
  classificacao: Papel
  scorePrincipal: number
  lastroPrincipal: Lastro
  rotuloLastro: { chave: ChaveLastro; rotulo: string }
  ressalvas: Ressalva[]
  criteriosNaoAvaliados: CriterioSemFonte[]
  cobertura: { documentados: number; estruturados: number; lacunas: number; total: number } | null
}

export interface ConfigPapel {
  id: Papel
  rotulo: string
  descricao: string
  cor: string
  pesos: Record<string, number>
}

export interface Motor {
  LIMIARES: Record<string, number>
  SINAIS: Record<string, { rotulo: string; tipo: TipoSinal; natureza: NaturezaSinal }>
  CONFIG_PAPEIS: Record<Papel, ConfigPapel>
  RESSALVAS: string[]
  avaliarBase(empresas: Empresa[]): EmpresaAvaliada[]
  avaliarEmpresa(empresa: Empresa): EmpresaAvaliada
  ressalvasDe(empresa: Empresa): Ressalva[]
}

export interface CamadaEvidencia {
  evidenciaDe(empresa: Empresa, chave: string): Evidencia
  sinaisIndisponiveis(empresa: Empresa): { chave: string; motivo: string }[]
  criteriosNaoAvaliados(): CriterioSemFonte[]
}
