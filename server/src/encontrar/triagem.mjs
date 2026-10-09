import { juizoDoDecisor, estruturaDeDecisao } from '../acesso/plano.mjs';
import { verificarCadastro } from '../pesquisa/criterios.mjs';
import { senioridadeDe, categoriaDe } from '../rede/contratos.mjs';
import { ACESSO_ROTULO } from './pedido.mjs';

/* =============================================================================
 *  GHT4 · triagem das pessoas encontradas
 * -----------------------------------------------------------------------------
 *  O Lessie separa o resultado em três: o que é obviamente bom fica, o que é
 *  obviamente ruim sai, e só o ambíguo vai à revisão profunda. Aqui a separação
 *  sai do juízo de cada pessoa, linha a linha (requisito · julgamento ·
 *  informação · fonte), com os mesmos vereditos da pesquisa por tese:
 *    forte     todas as linhas obrigatórias atendidas
 *    revisar   nenhuma reprovada, mas alguma só com indício ou sem evidência
 *    excluido  alguma obrigatória reprovada, ou empresa marcada "não contatar"
 *  O que fica "sem evidência" nunca vira "não atende": falta de dado manda para
 *  revisão, não para fora.
 * ========================================================================== */

export const GRUPOS = Object.freeze(['forte', 'revisar', 'excluido']);
const ORDEM_POSICAO = { decide: 0, influencia: 1, porta: 2, a_revisar: 3 };

/** Critérios da empresa, conferidos uma vez por empresa e repetidos em cada pessoa dela. */
export function avaliarEmpresa(empresa, criterios, referencia) {
  const linhas = criterios.map((c) => {
    if (c.tipo === 'pesquisa') return { requisito: c.texto, julgamento: 'indeterminado', obrigatorio: c.obrigatorio, pesquisa: true,
      informacao: 'O cadastro não responde a isto. A pesquisa por tese procura no site oficial da empresa.', fonte: null };
    const r = verificarCadastro(c.regra, empresa, referencia);
    const ev = r.evidencias?.[0];
    return { requisito: c.texto, julgamento: r.veredito, informacao: r.resumo, obrigatorio: c.obrigatorio,
      fonte: ev ? `${ev.fonte}${ev.referencia ? ` · ${ev.referencia}` : ''}` : null };
  });
  return { linhas, reprovada: linhas.some((l) => l.obrigatorio && l.julgamento === 'nao_atende'),
    estrutura: estruturaDeDecisao(empresa.atributos ?? null, referencia) };
}

/** O papel pedido: cargos da escala, quem decide, ou os dois (qualquer um basta). */
function linhaDoPapel(p, papel, decisao) {
  if (!papel.senioridades.length) return { ...decisao, obrigatorio: true };
  const s = senioridadeDe(p.senioridade);
  const rotulo = papel.senioridades.map((x) => senioridadeDe(x).rotulo).join(', ');
  const noCargo = papel.senioridades.includes(s.id);
  const julgamento = noCargo || (papel.decide && decisao.julgamento === 'atende') ? 'atende'
    : s.id === 'outro' ? 'indeterminado'
      : papel.decide && decisao.julgamento === 'indicio' ? 'indicio' : 'nao_atende';
  return { requisito: `${papel.decide ? 'Decide a venda ou ' : ''}Cargo: ${rotulo}`, julgamento,
    informacao: `${s.rotulo}${p.cargo ? ` · ${p.cargo}` : ''}`, fonte: decisao.fonte, obrigatorio: true };
}

/**
 * Juízo e grupo de uma pessoa.
 *
 * @param {object} p linha de `rede_pessoas`
 * @param {{empresa: object, avaliacao: object, caminho: object|null, incompletos: number,
 *   respostas: number, negativas: number, membros: number, restricao: object|null}} ctx
 * @param {{papel: object, acesso: object}} leitura o pedido lido (`interpretarPedido`)
 */
export function julgarPessoa(p, ctx, leitura) {
  const base = juizoDoDecisor(p, { empresaId: ctx.empresa.id, cnpjRaiz: ctx.empresa.cnpjRaiz, estrutura: ctx.avaliacao.estrutura,
    caminho: ctx.caminho, incompletos: ctx.incompletos, respostas: ctx.respostas, negativas: ctx.negativas, membros: ctx.membros });
  const [decisao, fonteDoCargo, pertence, casa] = base.juizo;
  const linhas = [linhaDoPapel(p, leitura.papel, decisao)];
  if (leitura.papel.senioridades.length) linhas.push({ ...decisao, obrigatorio: false });
  linhas.push({ ...fonteDoCargo, obrigatorio: true }, { ...pertence, obrigatorio: true }, ...ctx.avaliacao.linhas);

  const acesso = leitura.acesso;
  const linhaCasa = { ...casa, obrigatorio: Boolean(acesso.exigido && acesso.obrigatorio) };
  if (acesso.exigido === 'introducao') {
    linhaCasa.requisito = ACESSO_ROTULO.introducao;
    if (ctx.caminho?.categoria === 'relacao_confirmada') {
      linhaCasa.julgamento = 'indicio';
      linhaCasa.informacao = `${ctx.caminho.categoriaRotulo}: ${ctx.caminho.rota}. O titular ainda não disse se aceita apresentar.`;
    }
  }
  linhas.push(linhaCasa);

  const obrigatorias = linhas.filter((l) => l.obrigatorio);
  const reprovada = obrigatorias.find((l) => l.julgamento === 'nao_atende');
  const grupo = ctx.restricao || reprovada ? 'excluido' : obrigatorias.every((l) => l.julgamento === 'atende') ? 'forte' : 'revisar';
  const motivoDaRestricao = (ctx.restricao?.motivo ?? '').replace(/[.\s]+$/, '');
  const motivo = ctx.restricao ? `Não contatar neste espaço${motivoDaRestricao ? `: ${motivoDaRestricao}` : ''}.`
    : reprovada ? `${reprovada.requisito}: ${reprovada.informacao}` : null;
  const s = senioridadeDe(p.senioridade);
  return {
    id: p.id, nome: p.nome, cargo: p.cargo, senioridade: s.id, senioridadeRotulo: s.rotulo, origem: p.origem ?? null,
    empresa: { id: ctx.empresa.id, nome: ctx.empresa.nome, cidade: ctx.empresa.cidade ?? null, uf: ctx.empresa.uf ?? null, subsetor: ctx.empresa.subsetor ?? null },
    posicao: base.posicao, grupo, motivo,
    pendencias: grupo === 'revisar' ? obrigatorias.filter((l) => l.julgamento !== 'atende').map((l) => l.requisito) : [],
    // A pesquisa por tese é a "revisão profunda" do GHT4: só ela responde aos critérios do site.
    pedePesquisa: grupo === 'revisar' && obrigatorias.some((l) => l.pesquisa && l.julgamento !== 'atende'),
    juizo: linhas.map(({ requisito, julgamento, informacao, fonte, obrigatorio }) => ({ requisito, julgamento, informacao, fonte, obrigatorio })),
    caminho: ctx.caminho && !ctx.restricao ? { rota: ctx.caminho.rota, categoria: ctx.caminho.categoria, categoriaRotulo: ctx.caminho.categoriaRotulo, saltos: ctx.caminho.saltos } : null,
    respostas: { respostas: ctx.respostas, negativas: ctx.negativas },
    // Restrição de outro espaço visível: não muda o grupo, pede conversa com o responsável.
    avisos: ctx.avisos ?? [],
  };
}

/** Ordem de leitura dentro de um grupo: quem decide, o melhor caminho, menos pendências, empresa, nome. */
export function ordenar(pessoas) {
  return pessoas.sort((a, b) => ORDEM_POSICAO[a.posicao.id] - ORDEM_POSICAO[b.posicao.id]
    || (a.caminho ? categoriaDe(a.caminho.categoria).ordem : 9) - (b.caminho ? categoriaDe(b.caminho.categoria).ordem : 9)
    || a.pendencias.length - b.pendencias.length
    || a.empresa.nome.localeCompare(b.empresa.nome, 'pt-BR')
    || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));
}
