import { api } from './api'

/* Ligar ao CNPJ do catálogo quem a rede só conhece pelo nome da organização
   (servidor: server/src/api/rede-empresa.mjs). Sem o vínculo, a pessoa não entra
   em "Encontrar quem decide". */

export type EmpresaSugerida = { id: string; nome: string; razaoSocial: string | null; cnpjRaiz: string; cidade: string | null; uf: string | null; subsetor: string | null }
export type Sugestoes = { busca: string; empresaAtual: string | null; identifica: boolean; total: number; empresas: EmpresaSugerida[] }

export const vinculoCnpjApi = {
  /** Sem `busca`, o servidor usa o nome da organização escrito no cadastro. */
  sugerir: (pessoaId: string, busca?: string) =>
    api<Sugestoes>(`/api/rede/pessoas/${pessoaId}/empresas-sugeridas${busca === undefined ? '' : `?busca=${encodeURIComponent(busca)}`}`),
  ligar: (pessoaId: string, empresaId: string, versao: number) => api(`/api/rede/pessoas/${pessoaId}/empresa`, 'POST', { empresaId, versao }),
}

export const raizFormatada = (r: string) => `${r.slice(0, 2)}.${r.slice(2, 5)}.${r.slice(5, 8)}`

/** O que dizer sobre a lista de sugestões, para a tela e para o leitor de tela. */
export function situacaoDasSugestoes(s: Sugestoes): string {
  if (!s.busca) return 'Escreva o nome da empresa ou o CNPJ para procurar no catálogo.'
  if (!s.identifica) return 'Este nome só tem palavras comuns (química, distribuidora, Ltda.). Escreva o nome próprio da empresa ou o CNPJ.'
  if (!s.total) return 'Nenhuma empresa do catálogo de químicos com esse nome. Confira a grafia ou procure pelo CNPJ.'
  if (s.total > s.empresas.length) return `${s.total} empresas parecidas; abaixo, as ${s.empresas.length} mais próximas. Confira cidade e razão social antes de ligar.`
  return s.total === 1 ? '1 empresa parecida. Confira cidade e razão social antes de ligar.' : `${s.total} empresas parecidas. Confira cidade e razão social antes de ligar.`
}
