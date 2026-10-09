import { api } from './api'
import type { Julgamento, Posicao } from './acesso'

/* Encontrar quem decide (servidor: server/src/encontrar/). Pedido em linguagem
   natural → pessoas que a casa já mapeou, com juízo e caminho, em três grupos. */

export type Grupo = 'forte' | 'revisar' | 'excluido'
export const GRUPOS: Grupo[] = ['forte', 'revisar', 'excluido']

export interface LinhaEncontrada { requisito: string; julgamento: Julgamento; informacao: string; fonte: string | null; obrigatorio: boolean }
export interface PessoaEncontrada {
  id: string; nome: string; cargo: string; senioridade: string; senioridadeRotulo: string
  origem: 'manual' | 'cadastro_publico' | 'importacao' | null
  empresa: { id: string; nome: string; cidade: string | null; uf: string | null; subsetor: string | null }
  posicao: { id: Posicao; rotulo: string }
  grupo: Grupo; motivo: string | null; pendencias: string[]; pedePesquisa: boolean
  juizo: LinhaEncontrada[]
  caminho: { rota: string; categoria: string; categoriaRotulo: string; saltos: number } | null
  respostas: { respostas: number; negativas: number }
  /** Restrição de contato em outro espaço visível: não muda o grupo, pede conversa antes de abordar. */
  avisos?: string[]
}
export interface Lacuna {
  empresa: { id: string; nome: string; cidade: string | null; uf: string | null; subsetor: string | null }
  mapeadas: number; estrutura: string; pendentes: number
  avisos?: string[]
}
export interface LeituraPedido {
  pedido: string
  /** A parte do pedido que descreve a empresa, para levar à pesquisa por tese. */
  tese: string
  /** `excluidas`: cargos negados no pedido ("sem gerentes"). `areas`: a área que acompanha um cargo ("gerentes comerciais"). */
  papel: { decide: boolean; senioridades: string[]; excluidas?: string[]; areas?: { texto: string; senioridades: string[] }[]; rotulo: string; padrao: boolean; trechos: string[] }
  acesso: { exigido: 'com_caminho' | 'introducao' | null; obrigatorio: boolean; trecho: string | null }
  recorte: { uf: string; subsetor: string; cnae: string; incluirPossiveis: boolean }
  criterios: { id: string; texto: string; obrigatorio: boolean; tipo: 'cadastro' | 'pesquisa' }[]
  notas: string[]
  /** Empresas citadas pelo nome ou CNPJ e confirmadas no catálogo: quando há, são o recorte inteiro. */
  empresas?: { trecho: string; empresas: { id: string; nome: string; cidade: string | null; uf: string | null }[] }[]
  /** Busca feita dentro de uma pesquisa por tese: as aderentes e prováveis dela são o recorte. */
  pesquisa?: { id: string; tese: string; empresas: number; categorias: string[] } | null
}
/** A pesquisa por tese em que o find procura ("quem decide nas aderentes"). */
export interface PesquisaDoFind { id: string; tese: string; boas: number }
export interface FunilEncontrar {
  recorte: number; lidas: number; truncado: boolean; nosCriterios: number; comPessoas: number
  pessoas: number; foraDosCriterios: number; forte: number; revisar: number; excluido: number
}
export interface ResultadoEncontrar {
  leitura: LeituraPedido; funil: FunilEncontrar
  grupos: Record<Grupo, PessoaEncontrada[]>
  lacunas: { total: number; ninguemMapeado: number; empresas: Lacuna[] }
  membros: number; referencia: string | null; fonte: string; limitacoes: string[]
}

/** Um pedido guardado na memória do membro, com as contagens do último resultado. */
export interface BuscaLembrada {
  chave: string; pedido: string; usos: number; ultimoUso: string
  resumo: { forte?: number; revisar?: number; excluido?: number; lacunas?: number }
}
export interface MemoriaBuscas { ativa: boolean; buscas: BuscaLembrada[] }

export const encontrarApi = {
  buscar: (pedido: string, pesquisaId?: string) => api<ResultadoEncontrar>('/api/encontrar', 'POST', pesquisaId ? { pedido, pesquisaId } : { pedido }),
  memoria: () => api<MemoriaBuscas>('/api/encontrar/memoria'),
  esquecer: (chave: string) => api<MemoriaBuscas>(`/api/encontrar/memoria/${chave}`, 'DELETE'),
  apagarTodas: () => api<MemoriaBuscas>('/api/encontrar/memoria', 'DELETE'),
}

/** O que a busca lembrada trouxe da última vez, em poucas palavras. */
export function resumoDaLembrada(b: BuscaLembrada): string {
  const r = b.resumo, partes: string[] = []
  if (r.forte !== undefined) partes.push(`${r.forte.toLocaleString('pt-BR')} ${r.forte === 1 ? 'atende' : 'atendem'}`)
  if (r.revisar) partes.push(`${r.revisar.toLocaleString('pt-BR')} para revisar`)
  if (r.lacunas) partes.push(`${r.lacunas.toLocaleString('pt-BR')} ${r.lacunas === 1 ? 'lacuna' : 'lacunas'}`)
  partes.push(new Date(b.ultimoUso).toLocaleDateString('pt-BR'))
  if (b.usos > 1) partes.push(`${b.usos} vezes`)
  return partes.join(' · ')
}

export const ROTULO_GRUPO: Record<Grupo, { titulo: string; descricao: string }> = {
  forte: { titulo: 'Atendem ao pedido', descricao: 'Todas as exigências conferidas, com fonte.' },
  revisar: { titulo: 'Para revisar', descricao: 'Nada reprovado, mas alguma exigência só tem indício ou está sem evidência.' },
  excluido: { titulo: 'Fora do pedido', descricao: 'Alguma exigência não atendida, ou a empresa está marcada para não contatar.' },
}
export const ACESSO_PEDIDO: Record<'com_caminho' | 'introducao', string> = { com_caminho: 'Só quem a casa alcança', introducao: 'Só com introdução viável' }

export const EXEMPLOS_ENCONTRAR = [
  { rotulo: 'Quem decide', texto: 'Quem decide nas distribuidoras de SP com mais de 20 anos, sem sócio estrangeiro' },
  { rotulo: 'Pela rede', texto: 'Donos de fabricantes de tintas no Sul que a casa conhece' },
  { rotulo: 'Cargo', texto: 'CFOs das distribuidoras químicas com filiais em mais de 3 estados' },
  { rotulo: 'Introdução', texto: 'Conselheiros de empresas familiares de domissanitários, com apresentação viável' },
]

const numero = (n: number) => n.toLocaleString('pt-BR')
const contar = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`

/** A frase que resume o resultado, para o leitor de tela e para o topo da lista. */
export function resumoResultado(r: ResultadoEncontrar): string {
  const f = r.funil
  if (!f.recorte) return 'Nenhuma empresa do catálogo cabe neste recorte. Afrouxe UF ou subsetor no pedido.'
  if (!f.pessoas) return `${contar(f.nosCriterios, 'empresa se encaixa', 'empresas se encaixam')} no pedido, e a casa ainda não mapeou ninguém nelas.`
  return `${contar(f.forte, 'pessoa atende', 'pessoas atendem')}, ${contar(f.revisar, 'pede', 'pedem')} revisão e ${contar(f.excluido, 'ficou', 'ficaram')} fora, `
    + `em ${contar(f.comPessoas, 'empresa', 'empresas')} com alguém mapeado.`
}

/** Onde a pessoa está: empresa e cidade. */
export const ondeEsta = (p: { empresa: PessoaEncontrada['empresa'] }) =>
  `${p.empresa.nome}${p.empresa.cidade ? ` · ${p.empresa.cidade}${p.empresa.uf ? `/${p.empresa.uf}` : ''}` : ''}`
