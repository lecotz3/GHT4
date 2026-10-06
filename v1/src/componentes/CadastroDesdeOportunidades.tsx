import { mesCurto, type ComparacaoCadastro } from '../agente/empresa'
import { IconeRede } from './IconeRede'

const CAMPOS: Record<string, string> = { nome: 'Nome', razaoSocial: 'Razão social', cidade: 'Município', uf: 'UF', cnaePrincipal: 'CNAE principal', estado: 'Enquadramento no recorte' }
const ENQUADRAMENTO: Record<string, string> = { confirmada: 'confirmado', provavel: 'provável', possivel: 'possível', excluida: 'fora do recorte' }
const valor = (campo: string, v: string | null) => v == null || v === '' ? 'não informado' : campo === 'estado' ? ENQUADRAMENTO[v] || v : v
const mes = (m: string | null) => m ? mesCurto(m) : 'data não registrada'

function Resumo({ g }: { g: ComparacaoCadastro }) {
  if (g.estado === 'comparado' && g.mudancas && !g.mudancas.length) return <p>Igual ao cadastro salvo ({mes(g.referencias.anterior)}).</p>
  if (g.estado === 'comparado' && g.mudancas) return <ul className="agente-cadastro-mudancas">{g.mudancas.map((m) => <li key={m.campo}>
    <span>{CAMPOS[m.campo] || m.campo}</span>
    <span className="agente-cadastro-valores"><s>{valor(m.campo, m.anterior)}</s><IconeRede nome="seta" /><b>{valor(m.campo, m.atual)}</b></span></li>)}</ul>
  if (g.estado === 'referencia_atual_mais_antiga') return <p>O cadastro salvo é mais recente que a publicação atual. Nada a comparar.</p>
  if (g.estado === 'historico_invalido') return <p>O cadastro salvo está num formato antigo e não pôde ser comparado. Isso não significa que nada mudou.</p>
  return <p>Não foi possível comparar agora. Isso não significa que nada mudou.</p>
}

/** Cadastro salvo quando cada oportunidade foi criada × publicação atual. Seção separada dos sinais societários: mostra diferença de campo, não evento. */
export function CadastroDesdeOportunidades({ grupos, aoAbrir }: { grupos: ComparacaoCadastro[]; aoAbrir: (id: string) => void }) {
  const mudou = grupos.some((g) => g.mudancas?.length)
  return <section aria-labelledby="titulo-cadastro-desde"><h3 id="titulo-cadastro-desde">Cadastro desde a oportunidade</h3>
    {!mudou && grupos.every((g) => g.mudancas) && <p className="agente-gaveta-vazio">Nenhuma diferença entre o cadastro salvo nas oportunidades e a publicação atual.</p>}
    <ul className="agente-cadastro">{grupos.filter((g) => mudou || !g.mudancas).map((g, i) => <li key={i} className={g.mudancas?.length ? 'is-mudou' : ''}>
      <div className="agente-cadastro-topo"><span>{mes(g.referencias.anterior)} → {mes(g.referencias.atual)}</span>
        <span>{g.oportunidades.map((o, n) => <button key={o.id} className="agente-link" onClick={() => aoAbrir(o.id)}>{n ? ', ' : ''}{o.titulo}</button>)}</span></div>
      <Resumo g={g} />
    </li>)}</ul>
    <p className="mt-2 text-xs text-suave">Diferença entre publicações do cadastro CNPJ. Não indica encerramento, venda, aquisição nem intenção de transação.</p>
  </section>
}
