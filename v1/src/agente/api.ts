export class ErroApi extends Error {
  status: number
  constructor(status: number, mensagem: string) { super(mensagem); this.status = status }
}

export async function api<T>(url: string, method = 'GET', corpo?: unknown, chave?: string): Promise<T> {
  const controle = new AbortController()
  const timeout = setTimeout(() => controle.abort(), 100000)
  try {
    const r = await fetch(url, { method, credentials: 'same-origin', signal: controle.signal,
      headers: { ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...(chave ? { 'Idempotency-Key': chave } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) })
    const dados = await r.json().catch(() => null)
    if (!r.ok) throw new ErroApi(r.status, dados?.mensagem || 'Não foi possível concluir. Tente novamente.')
    if (dados === null) throw new Error('O servidor retornou uma resposta inesperada.')
    return dados as T
  } catch (erro) {
    if (erro instanceof ErroApi) throw erro
    throw new Error('Não foi possível falar com o servidor. Confira se o agente está aberto e tente novamente.')
  } finally { clearTimeout(timeout) }
}

export type Tarefa = 'interpretar_busca' | 'conversar' | 'pesquisar_web' | 'buscar_empresas' | 'preparar_reuniao' | 'registrar_passo' | 'ver_pendencias'
export interface Usuario { id: string; nome: string; papel: string }
export interface Contexto {
  modeloBusca?: { id: string; versao: number; hash: string } | null
  frente?: 'compra' | 'venda'; objetivo?: string; busca?: string; uf?: string
  incluirPossiveis?: boolean; empresaId?: string | null
  offset?: number; catalogoHash?: string; cnae?: string
  oportunidadeId?: string; documentoIds?: string[]
}
export interface Conversa { id: string; titulo: string; mandato_id: string | null; contexto: Contexto; versao: number; atualizado_em: string }
export interface Empresa { id: string; nome: string; razaoSocial: string; cidade: string; uf: string; cnpjRaiz: string; cnaePrincipal: string; estado: string; motivo: string; referencia: string }
export interface Resultado {
  propostaBusca?: { modo: 'ia' | 'regras_locais'; filtrosAtuais: Contexto; filtrosPropostos: Contexto; alteracoes: {campo: keyof Contexto; valor: string | boolean; trecho: string}[]; pendencias: string[]; aplicavel: boolean; hash: string }
  titulo: string; resumo: string; modo: string; complementoIA?: string; avisoIA?: string
  citacoesIA?: { inicio: number; fim: number; url: string; titulo: string }[]; modeloIA?: string
  catalogoHash?: string; paginacao?: { total: number; offset: number; proximoOffset: number | null }
  empresas: Empresa[]; blocos: { titulo: string; itens: string[] }[]
  fontes: { titulo: string; referencia: string; descricao: string; url?: string }[]; proximas: Tarefa[]
}
export interface Turno { id: string; numero: number; pedido: { tarefa: Tarefa; texto: string; contexto: Contexto }; resultado: Resultado }
export interface Acao { id: string; descricao: string; concluida: boolean }
export interface Trabalho { conversa: Conversa; turnos: Turno[]; acoes: Acao[] }
export interface EstadoAgente {
  tarefas: { id: Tarefa; titulo: string; descricao: string }[]; iaConfigurada: boolean
  ia?: { provedor: string; modelo: string; web: boolean; pedidosUsuarioDia: number; pedidosDia: number; tokensSaida: number } | null
  base: { disponivel: boolean; total?: number; referencia?: string; mensagem?: string }
}
