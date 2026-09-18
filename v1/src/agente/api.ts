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

export type Tarefa = 'interpretar_busca' | 'conversar' | 'pesquisar_web' | 'buscar_empresas' | 'preparar_reuniao' | 'mapear_acesso' | 'registrar_passo' | 'ver_pendencias'
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
/* Rede de relacionamento. Os campos de contato são opcionais porque o servidor
   os remove de quem não tem `rede.ver_contato` — e diz quais removeu em
   `camposOmitidos`, para a tela poder mostrar "existe, você não vê" em vez de
   dar a entender que não há contato nenhum. */
export interface PessoaRede {
  id: string; lado: 'ght4' | 'mercado' | 'externo'; nome: string; cargo: string
  senioridade: string; senioridadeRotulo: string
  organizacao: string; empresaId: string | null; ativo: boolean; versao?: number
  email?: string | null; telefone?: string | null; linkedin?: string | null
  observacoes?: string; camposOmitidos: string[]
}
export interface Ligacao {
  id: string; de: string; para: string
  tipo: string; tipoRotulo: string; frase: string
  forca: string; forcaRotulo: string; forcaExplicacao: string
  periodo: string; evidencia: string
  disposicao: string; disposicaoRotulo: string
  confirmadoEm: string | null; confirmadoPor: string | null; recente: boolean
}
export interface Caminho {
  alvo: PessoaRede; ght4: PessoaRede; intermediario: PessoaRede | null
  rota: string; ligacoes: Ligacao[]; saltos: number
  categoria: string; categoriaRotulo: string; categoriaDescricao: string; recomendavel: boolean
  pontuacao: number
  parcelas: { senioridade: number; vinculo: number; confirmacao: number; ligacoes: number }
  porque: string; ressalvas: string[]
}
export interface PendenteReconhecimento {
  id: string; nome: string; cargo: string; senioridade: string
  organizacao: string; empresa_id: string | null
  origem: 'manual' | 'cadastro_publico'; origem_referencia: string
}
export interface FilaReconhecimento {
  quem: { id: string; nome: string } | null
  pendentes: PendenteReconhecimento[]
  respostas: { id: string; rotulo: string; gera: string | null }[]
  total: number; respondidas: number; cobertura: number; aviso?: string
}

export interface MapaDeAcesso {
  empresaId: string | null; nomeEmpresa: string
  caminhos: Caminho[]; semCaminho: PessoaRede[]
  pessoasConhecidas: number; lideresConhecidos: number
  restricao: { ativa: boolean; categoria: string; motivo: string } | null
  cobertura: {
    fontesConectadas: string[]; fontesNaoConectadas: string[]; consultada: boolean
    pessoasPerguntadas: number; respostas: number; negativas: number
    /* O estado da APURAÇÃO, independente de haver caminho. 'nao_perguntada' é o
       que mais engana: parece ausência de relacionamento e é ausência de pergunta. */
    situacao: 'nao_mapeada' | 'nao_perguntada' | 'perguntada'
  }
  limitacoes: string[]
}

export interface Resultado {
  propostaBusca?: { modo: 'ia' | 'regras_locais'; filtrosAtuais: Contexto; filtrosPropostos: Contexto; alteracoes: {campo: keyof Contexto; valor: string | boolean; trecho: string}[]; pendencias: string[]; aplicavel: boolean; hash: string }
  titulo: string; resumo: string; modo: string; complementoIA?: string; avisoIA?: string
  citacoesIA?: { inicio: number; fim: number; url: string; titulo: string }[]; modeloIA?: string
  catalogoHash?: string; paginacao?: { total: number; offset: number; proximoOffset: number | null }
  empresas: Empresa[]; blocos: { titulo: string; itens: string[] }[]
  caminhos?: MapaDeAcesso
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
