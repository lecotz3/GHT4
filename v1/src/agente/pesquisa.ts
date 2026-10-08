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
export interface Filtros { uf: string; busca: string; cnae: string; incluirPossiveis: boolean }
export interface Evidencia { fonte: string; url?: string; trecho?: string; referencia?: string; campo?: string }
/** Na lista (`resumido`) vêm só veredito, resumo e lastro; justificativa e evidências vêm com o item completo. */
export interface VereditoCriterio {
  veredito: Veredito; resumo: string; justificativa?: string; lastro: 'cadastro' | 'site' | 'ia' | 'pendente'
  evidencias?: Evidencia[]; pendente?: boolean; modelo?: string
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
export interface DetalhePesquisa { pesquisa: Pesquisa; contagens: Contagens; itens: ItemPesquisa[]; ia: IAInfo | null; atualizados?: string[]; marca?: string; execucaoLote?: number | null }
export interface ResumoPesquisa { id: string; conversa_id: string; tese: string; estado: EstadoPesquisa; motivo_estado: string | null; funil: Partial<Funil>; meta: number; atualizado_em: string; titulo: string; boas: number }
export interface Previa { funil: Funil; referencia: string; amostra: { id: string; nome: string; cidade: string; uf: string; aderencia: number }[] }

export const pesquisaApi = {
  listar: () => api<{ pesquisas: ResumoPesquisa[]; ia: IAInfo | null }>('/api/pesquisas'),
  criar: (corpo: { id: string; tese: string; frente: 'compra' | 'venda' | null; mandatoId?: string | null }) => leve<DetalhePesquisa>('/api/pesquisas', 'POST', corpo),
  obter: (id: string) => leve<DetalhePesquisa>(`/api/pesquisas/${id}`),
  itens: (id: string, grupo: Categoria | 'fila', offset: number, marca?: string) => leve<{ itens: ItemPesquisa[]; total: number; proximoOffset: number | null; marca?: string }>(`/api/pesquisas/${id}/itens?grupo=${grupo}&offset=${offset}${marca ? `&marca=${marca}` : ''}`),
  /** Item completo (justificativas, trechos citados, páginas lidas), ao abrir a empresa. */
  item: (id: string, empresaId: string) => api<{ item: ItemPesquisa }>(`/api/pesquisas/${id}/itens/${empresaId}`),
  editar: (id: string, corpo: { versao: number; criterios?: Criterio[]; filtros?: Filtros; frente?: 'compra' | 'venda'; meta?: number; limiteWeb?: number }) => leve<DetalhePesquisa>(`/api/pesquisas/${id}`, 'PATCH', corpo),
  previa: (id: string, criterios: Criterio[], filtros: Filtros) => api<Previa>(`/api/pesquisas/${id}/previa`, 'POST', { criterios, filtros }),
  iniciar: (id: string, versao: number) => leve<DetalhePesquisa>(`/api/pesquisas/${id}/iniciar`, 'POST', { versao }),
  /** Sem `execucao`: retomada explícita. Com ela: continuação do laço, só na mesma geração. */
  avancar: (id: string, quantidade = 2, execucao?: number) => leve<DetalhePesquisa>(`/api/pesquisas/${id}/avancar`, 'POST', execucao === undefined ? { quantidade } : { quantidade, execucao }),
  /** Sem `execucao`: pausa humana. Com ela: pausa automática que só vale para essa geração. */
  pausar: (id: string, execucao?: number) => leve<DetalhePesquisa>(`/api/pesquisas/${id}/pausar`, 'POST', execucao === undefined ? {} : { execucao }),
  ajustar: (id: string, novo: string) => leve<DetalhePesquisa>(`/api/pesquisas/${id}/ajustar`, 'POST', { id: novo }),
  registrar: (id: string, chave: string, empresas: string[]) => api<{ turno: { id: string }; conversa: { id: string } }>(`/api/pesquisas/${id}/registrar`, 'POST', { chave, empresas }),
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
