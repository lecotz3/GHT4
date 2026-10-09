import { api } from './api'

/** Este cliente busca o item completo ao abrir a empresa; por isso pede a lista leve (o servidor
 *  só a envia a quem pede, e clientes antigos continuam recebendo a lista completa). */
const leve = <T>(url: string, method = 'GET', corpo?: unknown) => api<T>(url, method, corpo, undefined, { 'X-GHT4-Lista': 'leve' })

export type Veredito = 'atende' | 'indicio' | 'indeterminado' | 'nao_atende'
export type Categoria = 'aderente' | 'provavel' | 'a_confirmar' | 'nao_aderente'
export type EstadoPesquisa = 'rascunho' | 'pronta' | 'em_andamento' | 'pausada' | 'concluida'

export interface Regra { campo: string; valor: unknown }
export interface Criterio {
  id: string; texto: string; obrigatorio: boolean; tipo: 'cadastro' | 'pesquisa'
  regra: Regra | null; trecho?: string | null; origem: 'regras' | 'ia' | 'usuario'
}
export interface Filtros { uf: string; busca: string; cnae: string; incluirPossiveis: boolean; subsetor?: string }
/** Setores-alvo: espelho de `subsetoresAcionaveis()` da taxonomia (um teste confere as duas listas). */
export const SUBSETORES_ALVO = [
  'Distribuição e trading químico', 'Especialidades e aditivos', 'Tintas, vernizes e revestimentos',
  'Domissanitários e produtos de limpeza', 'Inorgânicos e gases industriais', 'Fertilizantes e nutrição vegetal',
  'Defensivos agrícolas', 'Explosivos e pirotecnia', 'Resinas, elastômeros e fibras',
] as const
/** Pesquisas gravadas antes dos setores-alvo não têm `subsetor` e continuam neste. */
export const SUBSETOR_ORIGINAL = 'Distribuição e trading químico'
export const rotuloSubsetor = (s?: string) => !s || s === 'todos' ? 'todos os setores-alvo' : s
export interface Evidencia { fonte: string; url?: string; trecho?: string; referencia?: string; campo?: string }
/** Na lista (`resumido`) vêm só veredito, resumo e lastro; justificativa e evidências vêm com o item completo. */
export interface VereditoCriterio {
  veredito: Veredito; resumo: string; justificativa?: string; lastro: 'cadastro' | 'site' | 'ia' | 'pendente' | 'humano'
  evidencias?: Evidencia[]; pendente?: boolean; modelo?: string
  /** Revisão humana: quem decidiu, quando e com que fonte; `automatico` é o veredito que "desfazer" devolve. */
  revisao?: { autor: { id: string; nome: string }; em: string; fonte?: { descricao: string; url?: string } }
  automatico?: VereditoCriterio
}
/** Passo do registro da execução: `ator` diz se foi o agente (passo automático) ou uma pessoa. */
export type TipoEvento = 'criterios' | 'funil' | 'retomada' | 'lote' | 'pausa' | 'conclusao' | 'revisao_humana' | 'ajuste' | 'entrega' | 'monitoramento'
export interface EventoPesquisa { id: number; tipo: TipoEvento; dados: Record<string, unknown>; em: string; ator: 'agente' | 'pessoa'; autor: string | null }
/** Uma versão da revisão humana de uma empresa (só cresce; desfazer é uma versão nova). */
export interface RevisaoVeredito { id: number; criterioId: string; acao: 'revisar' | 'desfazer'; antes: VereditoCriterio; depois: VereditoCriterio; em: string; autor: string }
export interface PedidoRevisao {
  criterioId: string; veredito: 'atende' | 'nao_atende' | 'indeterminado'; justificativa: string
  fonte?: { descricao: string; url?: string }; anterior: { veredito: Veredito; lastro: string | null }
}
export interface Funil {
  recorte: number; avaliadas: number; truncado: boolean; semAtributos: number; eliminadas: number
  eliminadasPor: Record<string, number>; exclusivas: Record<string, number>
  aprovadasCadastro: number; comSite: number; armazenadas: number
}
export interface Pesquisa {
  id: string; conversa_id: string; anterior_id: string | null; tese: string; frente: 'compra' | 'venda'
  filtros: Filtros; criterios: Criterio[]; meta: number; limite_web: number; referencia: string
  funil: Funil | Record<string, never>; estado: EstadoPesquisa; motivo_estado: string | null
  modo: string; notas: string[]; turno_id: string | null; versao: number; execucao: number; atualizado_em: string
}
export interface ItemPesquisa {
  empresa_id: string; ordem: number; etapa: 'aguardando' | 'em_revisao' | 'revisada'
  empresa: { id: string; nome: string; razaoSocial: string; cidade: string; uf: string; cnpjRaiz: string; cnaePrincipal: string; dominio: string | null; porte: string | null; capitalSocial: number | null; dataAbertura: string | null }
  vereditos: VereditoCriterio[]; aderencia: number; categoria: Categoria
  site: { dominio: string | null; estado: string; identidade: 'cnpj' | 'nome' | 'dominio' | null; motivo: string | null; paginas?: { url: string; titulo: string | null }[] } | null
  /** Veio da lista leve: abra o item completo para ver justificativas e trechos. */
  resumido?: boolean
}
export interface Contagens { total: number; revisadas: number; pendentes: number; aderente: number; provavel: number; a_confirmar: number; nao_aderente: number }
export interface IAInfo { provedor: string; modelo: string; gratuito: boolean }
/** `marca`: identifica o conjunto revisado da página; `execucaoLote`: geração em que o avanço rodou (null: não rodou). */
/** Monitoramento semanal: refaz o funil cadastral e avisa no Meu dia sobre empresas novas e eventos. */
/** Quanto do recorte a verificação avalia. Ela lê o recorte inteiro em páginas, até o teto; acima
 *  dele (ou numa verificação anterior à leitura em páginas), a cobertura é parcial. */
export interface Cobertura { recorte: number; avaliadas: number; completa: boolean }
/** Teto de empresas lidas por verificação: o mesmo `LIMITE_VARREDURA` do servidor. */
export const TETO_VARREDURA = 100000
/** `falhaEm`: a última tentativa falhou (até o próximo sucesso). `emAndamento`: há uma verificação
 *  reservada agora. `aConferir`: novas de uma transição sem referência histórica, que podem ser
 *  anteriores ao monitoramento. */
export interface Monitoramento {
  ativo: boolean; verificadoEm: string | null; proximaEm: string; falhaEm?: string | null; emAndamento?: boolean; cobertura: Cobertura | null
  ultimoResultado: { verificadoEm: string; totalNovas: number; totalEventos: number; cobertura?: Cobertura; aConferir?: number; novas: { id: string; nome: string; aderencia: number }[]; eventos: { id: string; nome: string; rotulo: string | null }[] } | null
}
/** Resposta da verificação: o que esta chamada fez e o estado gravado das falhas (não só desta chamada). */
export interface VerificacaoMonitores { verificados: number; falhas: number; emFalha?: number; emAndamento?: number; proximaTentativa?: string | null }
/** Como a tela de pesquisa é aberta: por tese, por id, e, vindo de um aviso do Meu dia, até qual novidade marcar como vista. */
export interface InicialPesquisa { tese?: string; pesquisaId?: string; novidadesAte?: number }
export interface DetalhePesquisa { pesquisa: Pesquisa; contagens: Contagens; itens: ItemPesquisa[]; ia: IAInfo | null; atualizados?: string[]; marca?: string; execucaoLote?: number | null; monitoramento?: Monitoramento | null }
export interface ResumoPesquisa { id: string; conversa_id: string; tese: string; estado: EstadoPesquisa; motivo_estado: string | null; funil: Partial<Funil>; meta: number; atualizado_em: string; titulo: string; boas: number }
export interface Previa { funil: Funil; referencia: string; amostra: { id: string; nome: string; cidade: string; uf: string; aderencia: number }[] }

export const pesquisaApi = {
  listar: () => api<{ pesquisas: ResumoPesquisa[]; ia: IAInfo | null }>('/api/pesquisas'),
  criar: (corpo: { id: string; tese: string; frente: 'compra' | 'venda' | null; mandatoId?: string | null }) => leve<DetalhePesquisa>('/api/pesquisas', 'POST', corpo),
  obter: (id: string) => leve<DetalhePesquisa>(`/api/pesquisas/${id}`),
  itens: (id: string, grupo: Categoria | 'fila', offset: number, marca?: string) => leve<{ itens: ItemPesquisa[]; total: number; proximoOffset: number | null; marca?: string }>(`/api/pesquisas/${id}/itens?grupo=${grupo}&offset=${offset}${marca ? `&marca=${marca}` : ''}`),
  monitorar: (id: string, ativo: boolean) => api<{ monitoramento: Monitoramento | null }>(`/api/pesquisas/${id}/monitoramento`, 'PUT', { ativo }),
  /** `repetir`: nova tentativa pedida pela pessoa, também para as que falharam há pouco. */
  verificarMonitoramentos: (repetir = false) => api<VerificacaoMonitores>('/api/monitoramentos/verificar', 'POST', repetir ? { repetir } : {}),
  marcarNovidadesVistas: (id: string, ateId?: number) => api<{ vistas: number }>(`/api/pesquisas/${id}/novidades/vistas`, 'POST', ateId ? { ateId } : {}),
  /** Item completo (justificativas, trechos citados, páginas lidas), ao abrir a empresa. */
  item: (id: string, empresaId: string) => api<{ item: ItemPesquisa; revisoes?: RevisaoVeredito[] }>(`/api/pesquisas/${id}/itens/${empresaId}`),
  /** Registro da execução por cursor: só os eventos depois de `apos`. */
  eventos: (id: string, apos = 0) => api<{ eventos: EventoPesquisa[]; ultimo: number }>(`/api/pesquisas/${id}/eventos?apos=${apos}`),
  /** Revisão humana de um critério de empresa já revisada; desfazer devolve o veredito automático. */
  revisar: (id: string, empresaId: string, corpo: PedidoRevisao) => api<{ item: ItemPesquisa; revisoes: RevisaoVeredito[] }>(`/api/pesquisas/${id}/itens/${empresaId}/revisao`, 'POST', corpo),
  desfazerRevisao: (id: string, empresaId: string, criterioId: string) => api<{ item: ItemPesquisa; revisoes: RevisaoVeredito[] }>(`/api/pesquisas/${id}/itens/${empresaId}/revisao/desfazer`, 'POST', { criterioId }),
  editar: (id: string, corpo: { versao: number; criterios?: Criterio[]; filtros?: Filtros; frente?: 'compra' | 'venda'; meta?: number; limiteWeb?: number }) => leve<DetalhePesquisa>(`/api/pesquisas/${id}`, 'PATCH', corpo),
  previa: (id: string, criterios: Criterio[], filtros: Filtros) => api<Previa>(`/api/pesquisas/${id}/previa`, 'POST', { criterios, filtros }),
  iniciar: (id: string, versao: number) => leve<DetalhePesquisa>(`/api/pesquisas/${id}/iniciar`, 'POST', { versao }),
  /** Sem `execucao`: retomada explícita. Com ela: continuação do laço, só na mesma geração. */
  avancar: (id: string, quantidade = 2, execucao?: number) => leve<DetalhePesquisa>(`/api/pesquisas/${id}/avancar`, 'POST', execucao === undefined ? { quantidade } : { quantidade, execucao }),
  /** Sem `execucao`: pausa humana. Com ela: pausa automática que só vale para essa geração. */
  pausar: (id: string, execucao?: number) => leve<DetalhePesquisa>(`/api/pesquisas/${id}/pausar`, 'POST', execucao === undefined ? {} : { execucao }),
  /** `opcionais`: critérios que a nova rodada já recebe como opcionais (sugestão de relaxamento aceita). */
  ajustar: (id: string, novo: string, opcionais: string[] = []) => leve<DetalhePesquisa>(`/api/pesquisas/${id}/ajustar`, 'POST', opcionais.length ? { id: novo, opcionais } : { id: novo }),
  registrar: (id: string, chave: string, empresas: string[]) => api<{ turno: { id: string }; conversa: { id: string } }>(`/api/pesquisas/${id}/registrar`, 'POST', { chave, empresas }),
}

/** Critério guardado na memória do membro: o que ele verifica, sem id nem trecho da tese. */
export interface CriterioMemoria { chave: string; texto: string; tipo: 'cadastro' | 'pesquisa'; regra: Regra | null; obrigatorio: boolean; usos: number; ultimoUso: string }
/** Memória pessoal: só a própria pessoa vê; `ativa` false = pausada (não grava, não apaga). */
export interface Memoria { ativa: boolean; criterios: CriterioMemoria[] }

export const memoriaApi = {
  ler: () => api<Memoria>('/api/memoria'),
  definir: (ativa: boolean) => api<Memoria>('/api/memoria', 'PUT', { ativa }),
  esquecer: (chave: string) => api<Memoria>(`/api/memoria/criterios/${chave}`, 'DELETE'),
  apagarTudo: () => api<Memoria>('/api/memoria/criterios', 'DELETE'),
}

export const ROTULO_CATEGORIA: Record<Categoria, string> = { aderente: 'Aderentes', provavel: 'Prováveis', a_confirmar: 'A confirmar', nao_aderente: 'Não aderentes' }
export const DESCRICAO_CATEGORIA: Record<Categoria, string> = {
  aderente: 'Todos os critérios obrigatórios confirmados com evidência.',
  provavel: 'Obrigatórios atendidos, ao menos um só por indício no site.',
  a_confirmar: 'Passaram no cadastro; falta evidência pública para algum obrigatório.',
  nao_aderente: 'Algum obrigatório foi contrariado por evidência.',
}
export const ROTULO_VEREDITO: Record<Veredito, string> = { atende: 'Atende', indicio: 'Indício', indeterminado: 'Sem evidência', nao_atende: 'Não atende' }

/** Exemplos para começar, escritos como a equipe fala. */
export const EXEMPLOS_TESE = [
  { rotulo: 'Venda', texto: 'Distribuidoras químicas em SP com mais de 20 anos, sem holding no quadro e sem sócio estrangeiro, que representem fabricantes multinacionais' },
  { rotulo: 'Compra', texto: 'Alvos de aquisição para um comprador: distribuidoras de médio porte no Sul, com filiais, de preferência que atendam o agronegócio' },
  { rotulo: 'Consolidação', texto: 'Distribuidoras tradicionais em MG e SP que importem solventes e declarem transporte de produtos perigosos ao IBAMA' },
  { rotulo: 'Nicho', texto: 'Empresas com laboratório próprio e certificação ISO 9001 que distribuam resinas para a indústria de tintas' },
]

/** Atalhos de critério cadastral, com o parâmetro que cada um pede. */
export const ATALHOS_CADASTRO: { campo: string; rotulo: string; parametro?: { rotulo: string; padrao: number; min: number; max: number }; texto: (v: number) => string; valor: (v: number) => unknown }[] = [
  { campo: 'idade_min', rotulo: 'Tempo de fundação mínimo', parametro: { rotulo: 'anos', padrao: 15, min: 1, max: 100 }, texto: (v) => `Mais de ${v} anos de fundação`, valor: (v) => v },
  { campo: 'estabelecimentos_min', rotulo: 'Número de estabelecimentos', parametro: { rotulo: 'estabelecimentos', padrao: 2, min: 2, max: 200 }, texto: (v) => `Pelo menos ${v} estabelecimentos ativos`, valor: (v) => v },
  { campo: 'ufs_atuacao_min', rotulo: 'Presença em várias UFs', parametro: { rotulo: 'UFs', padrao: 3, min: 2, max: 27 }, texto: (v) => `Estabelecimentos em pelo menos ${v} UFs`, valor: (v) => v },
  { campo: 'capital_min', rotulo: 'Capital social mínimo', parametro: { rotulo: 'mil reais', padrao: 500, min: 1, max: 10000000 }, texto: (v) => `Capital social de pelo menos R$ ${v.toLocaleString('pt-BR')} mil`, valor: (v) => v * 1000 },
  { campo: 'porte', rotulo: 'Porte acima de EPP', texto: () => 'Porte declarado acima de EPP', valor: () => ['DEMAIS'] },
  { campo: 'sem_socio_pj', rotulo: 'Sem empresa no quadro societário', texto: () => 'Controle por pessoas físicas (sem empresa no quadro)', valor: () => true },
  { campo: 'socio_estrangeiro', rotulo: 'Sem sócio estrangeiro', texto: () => 'Sem sócio estrangeiro', valor: () => false },
  { campo: 'ibama', rotulo: 'Atividade declarada ao IBAMA', texto: () => 'Atividade química declarada ao IBAMA', valor: () => ['comercio', 'transporte', 'industria'] },
  { campo: 'filial_recente_anos', rotulo: 'Abriu filial recentemente', parametro: { rotulo: 'anos', padrao: 3, min: 1, max: 20 }, texto: (v) => `Abriu filial nos últimos ${v} anos`, valor: (v) => v },
]
