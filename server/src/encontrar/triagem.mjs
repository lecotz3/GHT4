import { juizoDoDecisor, estruturaDeDecisao, atestadoPeloQuadro } from '../acesso/plano.mjs';
import { verificarCadastro } from '../pesquisa/criterios.mjs';
import { senioridadeDe, categoriaDe } from '../rede/contratos.mjs';
import { ACESSO_ROTULO, AREAS, cargoTrazArea } from './pedido.mjs';

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

/** O papel pedido: cargos da escala, quem decide, ou os dois (qualquer um basta). Cargo negado reprova. */
function linhaDoPapel(p, papel, decisao) {
  const s = senioridadeDe(p.senioridade);
  if ((papel.excluidas ?? []).includes(s.id)) return { requisito: `Cargo fora do pedido (${s.rotulo})`, julgamento: 'nao_atende',
    informacao: `${s.rotulo}${p.cargo ? ` · ${p.cargo}` : ''}`, fonte: decisao.fonte, obrigatorio: true };
  if (!papel.senioridades.length) return { ...decisao, obrigatorio: true };
  const rotulo = papel.senioridades.map((x) => senioridadeDe(x).rotulo).join(', ');
  const noCargo = papel.senioridades.includes(s.id);
  const julgamento = noCargo || (papel.decide && decisao.julgamento === 'atende') ? 'atende'
    : s.id === 'outro' ? 'indeterminado'
      : papel.decide && decisao.julgamento === 'indicio' ? 'indicio' : 'nao_atende';
  return { requisito: `${papel.decide ? 'Decide a venda ou ' : ''}Cargo: ${rotulo}`, julgamento,
    informacao: `${s.rotulo}${p.cargo ? ` · ${p.cargo}` : ''}`, fonte: decisao.fonte, obrigatorio: true };
}

/* A área do cargo ("gerentes comerciais") não está na escala da rede: atende quando o cargo escrito
   a traz, e fica sem evidência quando não traz, nunca reprovada (o cargo pode só estar resumido).
   Área da lista (`AREAS`) vale pelos nomes dela ("de RH" atende "Recursos Humanos"); fora da
   lista, pelas palavras do pedido. */
const palavras = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const raiz = (w) => w.length <= 3 ? w : w.slice(0, Math.max(4, Math.min(6, w.length - 1)));
/** Se o cargo escrito traz a área pedida (`{texto, area}` de `leitura.papel.areas`). */
export function cargoTemArea(cargo, area) {
  const daLista = area.area ? AREAS.find((a) => a.id === area.area) : null;
  if (daLista) return cargoTrazArea(cargo, daLista);
  const doCargo = palavras(cargo);
  const pedidas = palavras(area.texto).filter((w) => !/^(?:de|da|do|das|dos|com|e)$/.test(w));
  return pedidas.length > 0 && pedidas.every((w) => doCargo.some((c) => w.length <= 3 ? c === w : c.startsWith(raiz(w))));
}
/* Várias áreas para o mesmo cargo ("o diretor comercial e o diretor de RH"): basta uma. */
function linhaDaArea(p, areas) {
  const trazida = areas.find((a) => cargoTemArea(p.cargo, a));
  const nomes = [...new Set(areas.map((a) => a.texto))].join(' ou ');
  return { requisito: `Área do cargo: ${trazida ? trazida.texto : nomes}`, julgamento: trazida ? 'atende' : 'indeterminado', obrigatorio: true, fonte: null,
    informacao: trazida ? `O cargo registrado traz a área: ${p.cargo}.` : `O cargo registrado (${p.cargo || 'sem cargo escrito'}) não diz a área.` };
}

/* Cargo único (presidente, CFO) com mais de um ocupante na mesma empresa, por fontes diferentes:
   o Lessie mostra dois "CEOs" do mesmo banco sem apontar o conflito (PESQUISA-LESSIE-AI.md, §11.5).
   Aqui o quadro estatutário (Receita) prevalece sobre a lista da equipe e o registro da casa; sem
   ele, todos vão para revisão. Dois do próprio quadro não são conflito: o quadro é a fonte. */
const POSTOS_UNICOS = [
  { id: 'presidencia', rotulo: 'presidente ou CEO', senioridades: ['ceo'],
    re: /\b(?:ceo|presidente|diretor(?:a)?[- ]presidente|diretor(?:a)? geral|chief executive)\b/, nao: /\bvice\b|conselho/ },
  { id: 'financeiro', rotulo: 'diretor financeiro ou CFO', senioridades: ['cfo'],
    re: /\b(?:cfo|diretor(?:a)? financeir[oa]|vice[- ]presidente financeir[oa]|chief financial)\b/, nao: null },
];
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const nomeChave = (t) => semAcento(t).replace(/[^a-z]+/g, ' ').trim();
const postoDe = (p) => POSTOS_UNICOS.find((x) => x.senioridades.includes(p.senioridade) && x.re.test(semAcento(p.cargo)) && !(x.nao && x.nao.test(semAcento(p.cargo)))) ?? null;

/** Por pessoa: a linha do conflito de cargo único, quando há. */
export function conflitosDeCargoUnico(pessoas) {
  const grupos = new Map();
  for (const p of pessoas) {
    const posto = postoDe(p);
    if (!posto || !p.empresa_id) continue;
    const chave = `${p.empresa_id}|${posto.id}`;
    if (!grupos.has(chave)) grupos.set(chave, { posto, pessoas: [] });
    grupos.get(chave).pessoas.push(p);
  }
  const linhas = new Map();
  for (const { posto, pessoas: ocupantes } of grupos.values()) {
    // A mesma pessoa cadastrada duas vezes (mesmo nome) não é conflito de cargo.
    if (new Set(ocupantes.map((p) => nomeChave(p.nome))).size < 2) continue;
    // Só o que o quadro atestou desempata: a linha pública editada depois não é mais prova dele.
    const doQuadro = ocupantes.filter(atestadoPeloQuadro);
    if (doQuadro.length === ocupantes.length) continue;
    const nomes = (lista) => lista.map((p) => p.nome).join(', ');
    for (const p of ocupantes) {
      const outros = ocupantes.filter((o) => o !== p);
      if (doQuadro.includes(p)) {
        linhas.set(p.id, { requisito: 'Cargo único sem conflito', julgamento: 'atende', obrigatorio: false,
          informacao: `Outra fonte também aponta ${nomes(outros.filter((o) => !doQuadro.includes(o)))} como ${posto.rotulo}. Vale o quadro estatutário.`,
          fonte: 'Quadro societário público (Receita Federal)' });
      } else if (doQuadro.length) {
        linhas.set(p.id, { requisito: 'Cargo único sem conflito', julgamento: 'indicio', obrigatorio: true,
          informacao: `O quadro estatutário registra ${nomes(doQuadro)} como ${posto.rotulo}. Pode ser a mesma pessoa escrita de outro jeito, ou um cadastro desatualizado: confirme quem ocupa o cargo hoje.`,
          fonte: 'Quadro societário público (Receita Federal)' });
      } else {
        linhas.set(p.id, { requisito: 'Cargo único sem conflito', julgamento: 'indicio', obrigatorio: true,
          informacao: `${nomes(outros)} também ${outros.length === 1 ? 'aparece' : 'aparecem'} como ${posto.rotulo} desta empresa, por outra fonte. Confirme quem ocupa o cargo hoje.`,
          fonte: 'Cadastro da rede' });
      }
    }
  }
  return linhas;
}

/** Se a pessoa julgada serve a um requisito da lista "um de cada" (`leitura.papel.requisitos`). */
export function serveAoRequisito(pessoa, cargo, req) {
  if (pessoa.grupo === 'excluido') return false;
  const noPapel = req.decide ? pessoa.posicao.id === 'decide' : req.senioridades.includes(pessoa.senioridade);
  return noPapel && (!req.area || cargoTemArea(cargo, { texto: req.area.rotulo, area: req.area.id }));
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
  const nivel = senioridadeDe(p.senioridade).id;
  // No "um de cada", a área é de um papel só: quem serve a outro papel da lista, sem área, não a deve.
  const semArea = (leitura.papel.requisitos ?? []).some((r) => !r.area && (r.decide ? base.posicao.id === 'decide' : r.senioridades.includes(nivel)));
  const areas = semArea ? [] : (leitura.papel.areas ?? []).filter((a) => a.senioridades.includes(nivel));
  const linhas = [linhaDoPapel(p, leitura.papel, decisao), ...(areas.length ? [linhaDaArea(p, areas)] : [])];
  if (leitura.papel.senioridades.length) linhas.push({ ...decisao, obrigatorio: false });
  linhas.push({ ...fonteDoCargo, obrigatorio: true });
  if (ctx.conflito) linhas.push(ctx.conflito);
  linhas.push({ ...pertence, obrigatorio: true }, ...ctx.avaliacao.linhas);

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
