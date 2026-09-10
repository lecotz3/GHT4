import type { Empresa, Resultado } from './api'

export const campo = 'w-full rounded-ficha border border-fio-forte bg-papel px-3 py-2.5 text-sm focus:outline-comprador'
export const botao = 'rounded-ficha bg-tinta px-4 py-2.5 text-sm font-semibold text-papel disabled:opacity-50'
export const secundario = 'rounded-ficha border border-fio-forte bg-papel px-3 py-2 text-sm hover:bg-papel-2 disabled:opacity-50'
export const hojeLocal = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
export const dataCurta = (d: string) => d.slice(0,10).split('-').reverse().join('/')
export interface EscolhaEmpresa { empresa: Empresa; turnoId: string; frente: 'compra' | 'venda' }
export interface Selecao {
  id: string; empresa_id: string; empresa: Empresa; fontes: Resultado['fontes']; turno_id: string
  frente: 'compra' | 'venda'; estado: 'investigar' | 'priorizar' | 'descartar'; justificativa: string
  versao: number; oportunidade_id: string | null
}
export interface Oportunidade {
  id: string; titulo: string; objetivo: string; empresa: Empresa; fontes: Resultado['fontes']
  frente: 'compra' | 'venda'; etapa: string; proxima_acao: string; prazo: string; acao_concluida: boolean
  responsavel_id: string; responsavel_nome: string; responsavel_ativo: boolean; mandato_id: string | null; espaco: string | null; versao: number
}
export interface Etapa { id: string; nome: string }
export interface Evento { id: string; tipo: string; descricao: string; ocorrido_em: string; criado_em: string; autor: string
  dados: { etapaAnterior?: string; etapa?: string; canal?: string; participantes?: string; referencia?: string; motivo?: string;
    depois?: { proximaAcao: string; prazo: string; acaoConcluida: boolean } } }
export interface FichaOportunidade { oportunidade: Oportunidade; historico: Evento[]; etapas: Etapa[]
  responsaveis: { id: string; nome: string }[]; permissoes: { editar: boolean; mover: boolean } }
