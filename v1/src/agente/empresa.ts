import { useEffect, useState } from 'react'
import { api, type EventoSocietario } from './api'

export interface SituacaoEmpresa {
  empresaId: string
  oportunidades: { id: string; titulo: string; frente: string; etapa: string; prazo: string; responsavel_nome: string; espaco: string | null }[]
  /** Total acessível antes do corte; `oportunidades` traz as atualizadas mais recentemente. */
  totalOportunidades: number
  restricoes: { categoria: string; motivo: string; atualizado_em: string; espaco: string | null }[]
}

export const NOMES_ETAPA: Record<string, string> = { identificada: 'Identificada', qualificada: 'Qualificada para abordagem', contatada: 'Contatada', conversa_realizada: 'Conversa realizada', oportunidade_mandato: 'Oportunidade de mandato', proposta_enviada: 'Proposta enviada', negociacao: 'Negociação', mandato_assinado: 'Mandato assinado', nutricao: 'Nutrição ou pausa', perdida: 'Perdida ou não contatar' }

export function useSituacaoEmpresa(empresaId: string | null) {
  const [situacao, setSituacao] = useState<SituacaoEmpresa | null>(null)
  useEffect(() => {
    if (!empresaId) return
    let ativo = true
    // Falha aqui não bloqueia a tarefa: o aviso é ajuda, não trava.
    api<SituacaoEmpresa>(`/api/empresas/${empresaId}/situacao`).then((s) => { if (ativo) setSituacao(s) }).catch(() => { if (ativo) setSituacao(null) })
    return () => { ativo = false }
  }, [empresaId])
  return situacao?.empresaId === empresaId ? situacao : null
}

export interface FichaEmpresa {
  empresa: { id: string; nome: string; razaoSocial: string; cidade: string; uf: string; cnpjRaiz: string; cnaePrincipal: string; estado: string; motivo: string; referencia: string }
  eventos: EventoSocietario[]
  situacao: SituacaoEmpresa | null
  cadastro: { grupos: ComparacaoCadastro[]; comparadas: number; total: number } | null
  pessoas: { id: string; nome: string; cargo: string; senioridade: string }[] | null
  acesso: { pessoasConhecidas: number; lideresConhecidos: number; utilizaveis: number; descartados: number; melhor: { categoria: string; de: string; ate: string; cargo: string; saltos: number } | null } | null
  acervo: { registros: { tipo: string; titulo: string; revisado: boolean; versao: number; fonte: string; referencia: string; oportunidadeId: string; oportunidade: string; espaco: string | null }[]; documentos: { id: string; nome: string; estado: string; criado_em: string; oportunidade_id: string }[] } | null
}
/** Cadastro salvo nas oportunidades comparado ao atual. `mudancas` é null quando não deu para comparar. */
export interface ComparacaoCadastro {
  estado: 'comparado' | 'empresa_nao_encontrada' | 'catalogo_indisponivel' | 'referencia_atual_mais_antiga' | 'historico_invalido' | 'catalogo_resposta_invalida'
  referencias: { anterior: string | null; atual: string | null }
  mudancas: { campo: string; grupo: 'cadastro' | 'enquadramento'; anterior: string | null; atual: string | null; tipo: 'alterado' | 'preenchido' | 'nao_informado' }[] | null
  oportunidades: { id: string; titulo: string; espaco: string | null }[]
}
export const TIPOS_ACERVO: Record<string, string> = { evidencia: 'Evidência', tese: 'Tese', comparavel: 'Comparável', noticia: 'Notícia' }

/** Mês no formato do registro (AAAA-MM) para leitura: 07/2026. */
export const mesCurto = (m: string) => m ? m.split('-').reverse().join('/') : ''
