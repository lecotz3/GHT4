import { api } from './api'

/* Plano de acesso a quem decide (servidor: server/src/acesso/plano.mjs). */

export type Julgamento = 'atende' | 'indicio' | 'indeterminado' | 'nao_atende'
export type Posicao = 'decide' | 'influencia' | 'porta' | 'a_revisar'
export type AcaoPlano = 'nao_contatar' | 'registrar_decisor' | 'usar_porta' | 'pedir_apresentacao' | 'falar_direto' | 'cadastrar_casa' | 'perguntar_a_casa' | 'abordagem_institucional'
export type RespostaReconhecimento = 'posso_apresentar' | 'conheco' | 'talvez' | 'nao_conheco' | 'nao_intermediar' | 'desatualizado'

/** Uma linha do juízo: requisito · julgamento · informação · fonte. */
export interface LinhaJuizo { requisito: string; julgamento: Julgamento; informacao: string; fonte: string | null }
export interface PessoaPlano {
  id: string; nome: string; cargo: string; senioridade: string; senioridadeRotulo: string; organizacao: string; empresaId: string | null
  email?: string | null; telefone?: string | null; linkedin?: string | null; camposOmitidos?: string[]
  origem: 'manual' | 'cadastro_publico' | 'importacao' | null
  posicao: { id: Posicao; rotulo: string }; juizo: LinhaJuizo[]
  caminho: { rota: string; categoria: string; categoriaRotulo: string; saltos: number } | null
  respostas: { respostas: number; negativas: number }; minhaResposta: RespostaReconhecimento | null
}
export interface Estrutura {
  conhecida: boolean; natureza: string | null; naturezaRotulo: string | null; socios: number | null; sociosPj: number | null; socioEstrangeiro: boolean | null
  leitura: string; sinais: string[]; fonte: string | null
}
export interface Canal { tipo: 'site' | 'contato' | 'institucional' | 'ri'; rotulo: string; url: string; fonte: string; dica: string | null }
export interface Rascunho { para: string; texto: string }
/** `alerta`: diligência pendente (sanção pública não encerrada), mostrada antes de qualquer mensagem. */
export interface Passo { acao: AcaoPlano; titulo: string; texto: string; quem?: string; rascunhos: Rascunho[]; regras: string[]; alerta?: string }
/** Registro do CEIS ou do CNEP (CGU). `sem_data_final`: o órgão não informou o fim. */
export interface RegistroSancao {
  cadastro: string; codigo: string; categoria: string; inicio: string | null; fim: string | null; orgao: string; esfera: string
  uf: string | null; abrangencia: string | null; situacao: 'vigente' | 'encerrada' | 'sem_data_final'
}
export interface Diligencia { consultada: boolean; referencia: string | null; fonte: string; url: string; registros: RegistroSancao[]; atencao: boolean }
export interface CaminhoPlano { rota: string; categoria: string; categoriaRotulo: string; categoriaDescricao: string; saltos: number; porque: string; ressalvas: string[]; alvoId: string }
export interface Plano {
  empresa: { id: string; nome: string; razaoSocial: string | null; cnpjRaiz: string | null; cidade: string | null; uf: string | null; subsetor: string | null }
  estrutura: Estrutura; pessoas: PessoaPlano[]; passo: Passo; canais: Canal[]; caminhos: CaminhoPlano[]
  cobertura: { membros: number; perguntasPossiveis: number; perguntasPendentes: number; respostas: number; situacao: string; apuracaoCompleta: boolean }
  restricao: { ativa: boolean; categoria: string; motivo: string } | null
  restricoesOutras: { categoria: string; motivo: string; espaco: string | null }[]
  diligencia: Diligencia | null
  oportunidades: { id: string; titulo: string; etapa: string; proximaAcao: string; prazo: string; responsavel: string; espaco: string | null }[]
  limitacoes: string[]
  eu: { naRede: boolean; pessoaId: string | null }
  podeRegistrar: boolean
  tiposFonte: { id: string; rotulo: string }[]
  senioridades: { id: string; rotulo: string }[]
}
export interface PedidoDecisor {
  id: string; nome: string; cargo: string; senioridade: string
  fonte: { tipo: string; descricao: string; url?: string }
  pesquisaId?: string
}

const consulta = (pesquisaId?: string) => pesquisaId ? `?pesquisaId=${encodeURIComponent(pesquisaId)}` : ''

export const acessoApi = {
  plano: (empresaId: string, pesquisaId?: string) => api<Plano>(`/api/acesso/${encodeURIComponent(empresaId)}${consulta(pesquisaId)}`),
  registrarDecisor: (empresaId: string, corpo: PedidoDecisor) => api<{ pessoa: PessoaPlano }>(`/api/acesso/${encodeURIComponent(empresaId)}/decisores`, 'POST', corpo),
  /** Resposta da passada de reconhecimento (mesma rota da tela Rede): positiva exige a evidência. */
  responder: (pessoaAlvoId: string, resposta: RespostaReconhecimento, evidencia = '') =>
    api('/api/rede/reconhecimento', 'POST', { id: crypto.randomUUID(), pessoaAlvoId, resposta, ...(evidencia ? { evidencia } : {}) }),
}

export const ROTULO_JULGAMENTO: Record<Julgamento, string> = { atende: 'Atende', indicio: 'Indício', indeterminado: 'Sem evidência', nao_atende: 'Não atende' }
export const RESPOSTAS_RAPIDAS: { id: RespostaReconhecimento; rotulo: string; pedeEvidencia: boolean }[] = [
  { id: 'posso_apresentar', rotulo: 'Conheço e posso apresentar', pedeEvidencia: true },
  { id: 'conheco', rotulo: 'Conheço', pedeEvidencia: true },
  { id: 'nao_conheco', rotulo: 'Não conheço', pedeEvidencia: false },
]
const ROTULO_RESPOSTA: Record<RespostaReconhecimento, string> = {
  posso_apresentar: 'você conhece e pode apresentar', conheco: 'você conhece', talvez: 'você talvez conheça',
  nao_conheco: 'você não conhece', nao_intermediar: 'você prefere não intermediar', desatualizado: 'você avisou que está desatualizado',
}
export const rotuloResposta = (r: RespostaReconhecimento) => ROTULO_RESPOSTA[r] ?? r

/** Resumo de quanto da casa já foi perguntado (o "consultada × não consultada" que a rede exige). */
export function resumoCobertura(c: Plano['cobertura'] | null | undefined): string {
  if (!c) return ''
  if (!c.membros) return 'Nenhum membro da GHT4 está na rede ainda.'
  if (!c.perguntasPossiveis) return `${c.membros} ${c.membros === 1 ? 'membro' : 'membros'} na rede; ninguém desta empresa mapeado.`
  const feitas = c.perguntasPossiveis - c.perguntasPendentes
  return `${feitas} de ${c.perguntasPossiveis} ${c.perguntasPossiveis === 1 ? 'pergunta respondida' : 'perguntas respondidas'} pela casa${c.apuracaoCompleta ? ' — apuração completa' : ''}.`
}
