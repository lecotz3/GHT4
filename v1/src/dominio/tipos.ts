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
  /* `config` é opcional: sem ela o motor usa os pesos fixos de CONFIG_PAPEIS,
     exatamente como antes do painel de configuração existir. */
  avaliarBase(empresas: Empresa[], config?: Configuracao): EmpresaAvaliada[]
  avaliarEmpresa(empresa: Empresa, config?: Configuracao): EmpresaAvaliada
  ressalvasDe(empresa: Empresa): Ressalva[]
}

/* =============================================================================
 *  MÓDULO 3.2 e 3.3 — configuração em tempo de uso (configuracao.js)
 * ========================================================================== */

export type TipoCampo = 'numero' | 'categoria' | 'booleano'

export interface CampoCriterio {
  rotulo: string
  grupo: string
  tipo: TipoCampo
  unidade?: string
  natureza: NaturezaSinal
  fonte: string
  /** Campo derivado que aproxima o conceito pedido sem medi-lo diretamente. */
  proxy?: boolean
}

export interface Operador {
  chave: string
  rotulo: string
  tipos: TipoCampo[]
  precisaValor: boolean
  precisaValor2?: boolean
}

/** Critério criado pelo usuário no momento da consulta. */
export interface Criterio {
  id: string
  papel: Papel
  campo: string
  operador: string
  valor?: string | number
  valor2?: number
  peso: number
  rotulo?: string
}

export interface Configuracao {
  pesos: Record<Papel, Record<string, number>>
  criterios: Criterio[]
}

export interface Template {
  id: string
  nome: string
  salvoEm: string
  configuracao: Configuracao
}

export interface CamadaConfiguracao {
  CAMPOS: Record<string, CampoCriterio>
  OPERADORES: Record<string, Omit<Operador, 'chave'>>
  operadoresPara(campo: string): Operador[]
  valoresDe(campo: string, empresas: Empresa[]): string[]
  avaliarCriterio(empresa: Empresa, criterio: Criterio): boolean | null
  descreverCriterio(criterio: Criterio): string
  fonteCriterio(criterio: Criterio): string | null
  listarTemplates(): Template[]
  salvarTemplate(nome: string, config: Configuracao): { template: Template; persistiu: boolean }
  removerTemplate(id: string): boolean
  exportarTemplate(template: Template): string
  importarTemplate(json: string): { template: Template; persistiu: boolean }
  configuracaoPadrao(): Configuracao
  ajustesAplicados(config: Configuracao): {
    pesos: { papel: Papel; sinal: string; rotulo: string; de: number; para: number }[]
    criterios: number
  }
}

/* =============================================================================
 *  MÓDULOS 1 e 2 — mapa e ranking de subsegmentos (mercado.js)
 * ========================================================================== */

export interface Concentracao {
  chave: 'fragmentado' | 'moderado' | 'concentrado' | 'indeterminado'
  rotulo: string
}

export interface MetricasSubsegmento {
  contagem: number
  receitaTotal: number | null
  receitaMediana: number | null
  crescimentoMediano: number | null
  margemMediana: number | null
  alavancagemMediana: number | null
  hhi: number | null
  concentracao: Concentracao
  alvosNaFaixa: number
  pctNaFaixa: number
}

export interface ContribuicaoSubsegmento {
  chave: string
  rotulo: string
  peso: number
  nota: number | null
  bruto?: number | null
  pontos?: number
  semDado?: boolean
}

export interface Subsegmento extends MetricasSubsegmento {
  subsegmento: string
  setor: string
  empresas: EmpresaAvaliada[]
  /* Presentes só depois do ranqueamento — dependem da classificação do motor. */
  compradores?: number
  candidatasVenda?: number
  alvos?: number
  score?: number
  contribuicoes?: ContribuicaoSubsegmento[]
  pesoAplicado?: number
}

export interface RessalvaCobertura {
  titulo: string
  texto: string
  viaDeObtencao: string
}

export interface CriterioSemFonteMercado {
  criterio: string
  porQueImporta: string
  porQueFalta: string
  viaDeObtencao: string
  substitutoAtual?: string
}

export interface Mapa {
  setor: string
  totalEmpresas: number
  totalSubsegmentos: number
  subsegmentos: Subsegmento[]
  ressalvaCobertura: RessalvaCobertura
}

export interface RankingMercado extends Mapa {
  pesos: Record<string, number>
  criteriosSemFonte: CriterioSemFonteMercado[]
}

export interface CriterioSubsegmento {
  rotulo: string
  explicacao: string
  fonte: string
  pesoPadrao: number
  direcao: 'maior' | 'menor'
  proxy?: boolean
}

export interface CamadaMercado {
  CRITERIOS_SUBSEGMENTO: Record<string, CriterioSubsegmento>
  CRITERIOS_SEM_FONTE_MERCADO: CriterioSemFonteMercado[]
  setoresDisponiveis(empresas: Empresa[]): { setor: string; empresas: number; subsegmentos: number }[]
  mapear(empresas: EmpresaAvaliada[], setor?: string): Mapa
  ranquearSubsegmentos(
    avaliadas: EmpresaAvaliada[],
    opcoes?: { setor?: string; pesos?: Record<string, number> },
  ): RankingMercado
  hhi(empresas: Empresa[]): number | null
  mediana(valores: number[]): number | null
}

/* =============================================================================
 *  MÓDULO 6 — matchmaking (matchmaking.js)
 * ========================================================================== */

export interface ContribuicaoMatch {
  chave: string
  rotulo: string
  peso: number
  nota: number | null
  pontos?: number
  descricao: string
  proxy?: boolean
  semDado?: boolean
}

export interface Candidata extends EmpresaAvaliada {
  aderencia: number
  contribuicoes: ContribuicaoMatch[]
  pesoAplicado: number
  criteriosSemDado: number
}

export interface Limitacao {
  titulo: string
  texto: string
  viaDeObtencao: string
}

export interface ResultadoMatch {
  alvo: EmpresaAvaliada
  sentido: 'sell-side' | 'buy-side'
  candidatas: Candidata[]
  totalAvaliadas: number
  totalQualificadas: number
  descartadasPorCriterio: { empresa: Empresa; criterio: string; motivo: string }[]
  descartadasPorFaltaDeDado: number
  pesos: Record<string, number>
  limitacoes: Limitacao[]
}

export interface OpcoesMatch {
  limite?: number
  pesos?: Record<string, number>
  criteriosAdicionais?: Criterio[]
  faixaReceita?: { min: number; max: number }
}

export interface CamadaMatchmaking {
  CRITERIOS_COMPRADOR: Record<string, { rotulo: string; explicacao: string; pesoPadrao: number; fonte: string; proxy?: boolean }>
  LIMITACOES: Limitacao[]
  compradoresPara(alvo: EmpresaAvaliada, avaliadas: EmpresaAvaliada[], opcoes?: OpcoesMatch): ResultadoMatch
  alvosPara(comprador: EmpresaAvaliada, avaliadas: EmpresaAvaliada[], opcoes?: OpcoesMatch): ResultadoMatch
}

/* =============================================================================
 *  MÓDULO 9 — exportação (exportar-excel.js)
 * ========================================================================== */

export interface CamadaExcel {
  gerarXlsx(abas: { nome: string; linhas: unknown[][] }[]): Uint8Array
  gerarPastaDeTrabalho(dados: {
    mapa?: Mapa
    ranking?: RankingMercado
    avaliadas?: EmpresaAvaliada[]
    configuracao?: Configuracao
    setor?: string
    base?: string
  }): Uint8Array
  baixar(bytes: Uint8Array, nomeArquivo: string): void
}

export interface CamadaEvidencia {
  evidenciaDe(empresa: Empresa, chave: string): Evidencia
  sinaisIndisponiveis(empresa: Empresa): { chave: string; motivo: string }[]
  criteriosNaoAvaliados(): CriterioSemFonte[]
}
