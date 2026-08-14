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

/* =============================================================================
 *  MÓDULO 4 — conexões da rede GHT4 (conexoes.js)
 * ========================================================================== */

export interface PassagemProfissional { empresa: string; cargo?: string; de?: string; ate?: string }
export interface ContatoRede { nome: string; empresa: string; cargo?: string; relacao?: string; cnpj?: string }
export interface FormacaoRede { instituicao: string; curso?: string; ano?: string }

export interface MembroRede {
  id: string
  nome: string
  cargo: string
  /** "Cobrir todos os membros da GHT4 (grupo inteiro, não apenas a Advisory)". */
  area: string
  uf?: string
  setores?: string[]
  historico?: PassagemProfissional[]
  contatos?: ContatoRede[]
  formacao?: FormacaoRede[]
}

export type ForcaVinculo = 'direta' | 'indireta' | 'fraca'

export interface Vinculo {
  tipo: string
  rotulo: string
  membro: string
  area: string
  detalhe: string
  fonte: string
  forcaVinculo: ForcaVinculo
  /** Falso quando outro vínculo do mesmo tipo já somou — exibido, mas sem pontuar. */
  pontuou: boolean
}

export interface NivelConexao {
  chave: 'forte' | 'media' | 'fraca' | 'tenue' | 'nenhuma'
  rotulo: string
}

export interface AnaliseConexao {
  forca: number
  nivel: NivelConexao
  vinculos: Vinculo[]
  membrosNaRede?: number
}

export interface CamadaConexoes {
  TIPOS_VINCULO: Record<string, { rotulo: string; peso: number; forca: ForcaVinculo; explicacao: string }>
  NIVEIS: (NivelConexao & { min: number })[]
  LIMITACOES: Limitacao[]
  membros(): MembroRede[]
  adicionarMembro(m: Omit<MembroRede, 'id'>): { membro: MembroRede; persistiu: boolean }
  removerMembro(id: string): boolean
  importarRede(json: string, substituir?: boolean): { quantidade: number; persistiu: boolean }
  exportarRede(): string
  limparRede(): boolean
  carregarRedeDemonstracao(): boolean
  analisar(empresa: Empresa): AnaliseConexao
  forcaDe(empresa: Empresa): number
  temVinculoRelevante(empresa: Empresa): boolean
  ranquearPorConexao(empresas: EmpresaAvaliada[]): (AnaliseConexao & { empresa: EmpresaAvaliada })[]
  normalizar(texto: string): string
  mesmaEmpresa(a: string, b: string): boolean
  nivelDe(forca: number): NivelConexao
}

/* =============================================================================
 *  MÓDULO 7 — CRM / pipeline (crm.js)
 * ========================================================================== */

export interface EstadoFunil {
  chave: string
  rotulo: string
  ordem: number
  descricao: string
  /** Recusada não é etapa avançada, é saída — fica fora da sequência. */
  saida?: boolean
}

export interface MovimentoCrm {
  de: string | null
  para: string
  quem: string
  quando: string
  nota: string
}

export interface CallCrm { quem: string; data: string; descricao: string; registradaEm: string }
export interface RecusaCrm { motivo: string; resposta: string; registradaEm: string }

/** Índice e números congelados no momento em que a empresa entrou no funil. */
export interface RetratoEntrada {
  indice: number
  classificacao: Papel
  receita: number | null
  margemEbitda: number | null
  lastro: string | null
  origem: string
  dataDoDado: string
}

export interface RegistroCrm {
  empresaId: string
  nome: string
  setor: string
  subsetor: string
  uf: string
  contato: Contato | null
  responsavel: string
  estado: string
  criadoEm: string
  retrato: RetratoEntrada
  historico: MovimentoCrm[]
  calls: CallCrm[]
  recusa: RecusaCrm | null
}

export interface Funil {
  responsavel: string
  total: number
  contagem: Record<string, number>
  conversoes: { de: string; para: string; taxa: number | null; absoluto: string }[]
  ativas: number
  recusadas: number
  fechadas: number
  motivosDeRecusa: { chave: string; rotulo: string; quantidade: number }[]
}

export interface CamadaCrm {
  ESTADOS_FUNIL: EstadoFunil[]
  MOTIVOS_RECUSA: { chave: string; rotulo: string }[]
  LIMITACOES: Limitacao[]
  estadoDe(chave: string): EstadoFunil
  registros(): RegistroCrm[]
  registroDe(empresaId: string): RegistroCrm | null
  adicionar(avaliada: EmpresaAvaliada, responsavel?: string): { registro: RegistroCrm; jaExistia: boolean; persistiu: boolean }
  mover(empresaId: string, estado: string, opcoes?: { quem?: string; nota?: string; motivoRecusa?: string; respostaRecusa?: string }): { registro?: RegistroCrm; persistiu?: boolean; erro?: string }
  anotarCall(empresaId: string, dados: { quem?: string; data?: string; descricao: string }): { registro?: RegistroCrm; persistiu?: boolean; erro?: string }
  trocarResponsavel(empresaId: string, responsavel: string): { registro?: RegistroCrm; persistiu?: boolean; erro?: string }
  remover(empresaId: string): boolean
  responsaveis(): string[]
  funil(responsavel?: string): Funil
  agenda(responsavel?: string): (RegistroCrm & { diasParado: number; ultimoMovimento: MovimentoCrm })[]
  exportarCrm(): string
  importarCrm(json: string): { quantidade: number; persistiu: boolean }
  limparCrm(): boolean
  linhasParaPlanilha(): unknown[][]
}

/* =============================================================================
 *  MÓDULO 5 — análises complementares (analises.js)
 * ========================================================================== */

export interface EstatisticaMultiplo {
  n: number; minimo: number; mediana: number; maximo: number; q1: number; q3: number
}
export interface EstatisticasMultiplos {
  evEbitda: EstatisticaMultiplo | null
  evReceita: EstatisticaMultiplo | null
}

export interface LeituraCsv {
  registros: Record<string, unknown>[]
  colunasReconhecidas: string[]
  colunasAusentes: string[]
  separador: string
}

export interface FaixaValor {
  base: string; referencia: string; minimo: number; central: number; maximo: number
  multiplos: EstatisticaMultiplo
}

export interface ValuationAplicado {
  empresa: string
  ebitdaEstimado: number | null
  faixas: FaixaValor[]
  ressalva: string
}

export interface Parecer { autor: string; veredito: 'correta' | 'incorreta'; comentario: string; quando: string }

export interface RegistroValuation {
  empresaId: string
  comps: EstatisticasMultiplos | null
  precedentes: unknown | null
  atualizadoEm: string
  revisoes: Parecer[]
}

export interface SecaoDimensionamento {
  valor: number | null
  rotulo: string
  sustentado: boolean
  aviso?: string
  oQueFalta?: string
  fonte: string
}

export interface ForcaPorter {
  forca: string
  indicador: string | null
  leitura: string | null
  sustentado: boolean
  fonte: string
  oQueFalta?: string
}

export interface Report {
  setor: string
  geradoEm: string
  universo: {
    empresas: number; subsegmentos: number; receitaSomada: number
    crescimentoMediano: number | null; margemMediana: number | null
    hhi: number | null; concentracaoTop5: number | null
  }
  dimensionamento: { titulo: string; tam: SecaoDimensionamento; sam: SecaoDimensionamento; som: SecaoDimensionamento }
  players: {
    titulo: string; sustentado: boolean; consolidadores: number; aviso: string
    lideres: { nome: string; receita: number | null; participacao: number | null; classificacao: Papel; subsetor: string }[]
  }
  porter: ForcaPorter[]
  swot: { titulo: string; sustentadoParcialmente: boolean; forcas: string[]; fraquezas: string[]; oportunidades: string[]; ameacas: string[]; oQueFalta: string }
  pestle: { dimensao: string; sustentado: boolean; oQueFalta: string; fonte: string }[]
  trends: { titulo: string; sustentado: boolean; oQueFalta: string; indicadorDisponivel: string | null; fonte: string }
}

export interface Noticia {
  id: string; empresaId: string | null; setor: string | null
  titulo: string; veiculo: string; data: string; link: string | null
  resumo: string; relevancia: string; registradaEm: string
}

export interface ResultadoNewsRun {
  periodo: string
  total: number
  noticias: Noticia[]
  porAno: { ano: string; quantidade: number }[]
  veiculos: string[]
}

export interface CamadaAnalises {
  COLUNAS_COMPS: { chave: string; rotulo: string; sinonimos: string[]; obrigatoria?: boolean }[]
  COLUNAS_PRECEDENTES: { chave: string; rotulo: string; sinonimos: string[]; obrigatoria?: boolean }[]
  LIMITACOES: (Limitacao & { modulo: string })[]
  interpretarCsv(texto: string, colunas: { chave: string; rotulo: string; sinonimos: string[]; obrigatoria?: boolean }[]): LeituraCsv
  consolidarMultiplos(registros: Record<string, unknown>[]): { registros: Record<string, unknown>[]; estatisticas: EstatisticasMultiplos }
  aplicarA(empresa: Empresa, estatisticas: EstatisticasMultiplos): ValuationAplicado
  salvarValuation(empresaId: string, dados: { comps?: EstatisticasMultiplos; precedentes?: unknown; parecer?: Omit<Parecer, 'quando'> }): { registro: RegistroValuation; persistiu: boolean }
  valuationDe(empresaId: string): RegistroValuation | null
  removerValuation(empresaId: string): boolean
  montarReport(avaliadas: EmpresaAvaliada[], setor?: string): Report
  registrarNoticia(dados: Partial<Noticia>): { noticia: Noticia; persistiu: boolean }
  removerNoticia(id: string): boolean
  newsRun(opcoes?: { empresaId?: string; setor?: string; anos?: number }): ResultadoNewsRun
  importarNoticias(texto: string, contexto?: { empresaId?: string; setor?: string }): { quantidade: number; persistiu: boolean }
}
