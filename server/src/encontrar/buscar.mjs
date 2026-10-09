import { LIMITE_RECORTE } from '../agente/catalogo.mjs';
import { lerGrafo, caminhosNoGrafo, LIMITACAO_GRAFO } from '../rede/caminhos.mjs';
import { respostasPorPessoa } from '../acesso/plano.mjs';
import { interpretarPedido } from './pedido.mjs';
import { avaliarEmpresa, julgarPessoa, ordenar, GRUPOS } from './triagem.mjs';

/* =============================================================================
 *  GHT4 · encontrar quem decide (o "/find" do agente)
 * -----------------------------------------------------------------------------
 *  Pedido em linguagem natural → as pessoas que a casa já mapeou nas empresas
 *  que se encaixam, cada uma com o juízo linha a linha e o caminho pela rede,
 *  separadas em forte · revisar · excluído. E, do outro lado, as empresas que se
 *  encaixam e onde falta alguém: é ali que a casa registra quem decide.
 *
 *  DE ONDE VÊM AS PESSOAS
 *  Só de `rede_pessoas` do lado do mercado, ligadas a um CNPJ do catálogo:
 *  quadro societário público no recorte estatutário que a casa decidiu
 *  (18/09/2026), listas compartilhadas pela equipe e quem alguém da casa
 *  registrou com a fonte. O GHT4 não compra base de pessoas nem lê LinkedIn
 *  (PESQUISA-LESSIE-AI.md, §5.3), e a resposta não traz telefone nem e-mail.
 *
 *  SÍNCRONO, DE PROPÓSITO
 *  Tudo aqui é cadastro e rede, já no banco: uma busca é uma leitura, sem custo
 *  nem fila. O que pede site (critério de pesquisa) fica "sem evidência" e manda
 *  a pessoa para revisão, com a pesquisa por tese como passo seguinte.
 * ========================================================================== */

export const LIMITE_PESSOAS = 5000;
export const EXIBIDOS = Object.freeze({ forte: 60, revisar: 60, excluido: 20 });
export const LACUNAS_EXIBIDAS = 30;

/** Erro com código, para a rota traduzir sem confundir com falha de programa. */
const falha = (codigo, mensagem, causa) => Object.assign(new Error(mensagem), { codigo, causa });

/**
 * @param {object} db
 * @param {{recorte: Function}} catalogo
 * @param {{texto: string, usuario: {id: string}}} pedido
 */
export async function encontrarPessoas(db, catalogo, { texto, usuario }) {
  const leitura = interpretarPedido(texto);
  let recorte;
  try { recorte = await catalogo.recorte(leitura.recorte, { limite: LIMITE_RECORTE }); }
  catch (e) { throw falha('catalogo_indisponivel', 'O catálogo não pôde ser consultado. Tente novamente.', e); }
  const referencia = recorte.referencia ?? null;

  // Critérios da empresa, uma vez por empresa. Reprovada num obrigatório, a empresa sai antes das pessoas.
  const empresas = new Map(recorte.empresas.map((e) => [e.id, { empresa: e, avaliacao: avaliarEmpresa(e, leitura.criterios, referencia) }]));
  const ids = [...empresas.keys()];
  const nosCriterios = ids.filter((id) => !empresas.get(id).avaliacao.reprovada);

  const linhas = ids.length ? (await db.query(
    `SELECT id, lado, nome, cargo, senioridade, organizacao, empresa_id, origem, origem_referencia
       FROM rede_pessoas WHERE lado = 'mercado' AND ativo AND empresa_id = ANY($1::text[])
      ORDER BY empresa_id, nome, id LIMIT ${LIMITE_PESSOAS + 1}`, [ids])).rows : [];
  const limitacoes = [
    'Só entram pessoas que a casa já mapeou: o quadro societário público no recorte estatutário, as listas compartilhadas pela equipe e quem alguém da casa registrou com a fonte. O GHT4 não compra base de pessoas nem lê LinkedIn.',
    'Telefone e e-mail não aparecem: a conversa começa pelo caminho da rede ou pelo canal institucional do plano de acesso.',
    'Critério que o cadastro não responde fica "sem evidência" e manda a pessoa para revisão; a pesquisa por tese procura a resposta no site oficial.',
    'Pessoa cadastrada só com o nome da organização, sem vínculo com o CNPJ, não entra: vincule-a à empresa na tela Rede.',
  ];
  if (recorte.truncado) limitacoes.push(`O recorte tem ${recorte.total.toLocaleString('pt-BR')} empresas e esta busca leu as primeiras ${LIMITE_RECORTE.toLocaleString('pt-BR')}. Cite UF ou subsetor no pedido para cobrir todas.`);
  if (linhas.length > LIMITE_PESSOAS) {
    linhas.length = LIMITE_PESSOAS;
    limitacoes.push(`Mais de ${LIMITE_PESSOAS.toLocaleString('pt-BR')} pessoas mapeadas no recorte: esta busca leu as primeiras. Estreite o pedido.`);
  }

  // Pessoas das empresas reprovadas só entram na contagem: listá-las seria ruído.
  const avaliadas = linhas.filter((p) => !empresas.get(p.empresa_id).avaliacao.reprovada);
  const restricoes = new Map(nosCriterios.length ? (await db.query(
    'SELECT empresa_id, categoria, motivo FROM crm_restricoes_contato WHERE escopo = $1 AND ativa AND empresa_id = ANY($2::text[])',
    [`usuario:${usuario.id}`, nosCriterios])).rows.map((r) => [r.empresa_id, r]) : []);

  let caminhos = [];
  if (avaliadas.length) {
    const grafo = await lerGrafo(db);
    if (grafo.truncado) limitacoes.push(LIMITACAO_GRAFO);
    if (grafo.arestas.length) caminhos = caminhosNoGrafo(grafo, avaliadas.filter((p) => !restricoes.has(p.empresa_id)), usuario);
  }
  const porAlvo = new Map();
  for (const c of caminhos) {
    if (!porAlvo.has(c.alvo.id)) porAlvo.set(c.alvo.id, []);
    porAlvo.get(c.alvo.id).push(c);
  }
  const [respostas, membros] = await Promise.all([
    respostasPorPessoa(db, avaliadas.map((p) => p.id)),
    db.query("SELECT count(*)::int AS n FROM rede_pessoas WHERE lado = 'ght4' AND ativo").then((r) => r.rows[0].n),
  ]);

  const julgadas = avaliadas.map((p) => {
    const { empresa, avaliacao } = empresas.get(p.empresa_id);
    const dela = porAlvo.get(p.id) ?? [];
    const resp = respostas.get(p.id) ?? { respostas: 0, negativas: 0 };
    return julgarPessoa(p, { empresa, avaliacao, caminho: dela.find((c) => c.recomendavel) ?? null,
      incompletos: dela.filter((c) => !c.recomendavel).length, membros, ...resp,
      restricao: restricoes.get(p.empresa_id) ?? null }, leitura);
  });
  const grupos = Object.fromEntries(GRUPOS.map((g) => [g, ordenar(julgadas.filter((p) => p.grupo === g))]));

  /* Lacunas: empresas nos critérios, sem restrição, onde ninguém mapeado serve ao pedido.
     É o "caminho de recall": alguém da casa registra quem decide, com a fonte. */
  const servidas = new Set(julgadas.filter((p) => p.grupo !== 'excluido').map((p) => p.empresa.id));
  const mapeadas = new Map();
  for (const p of avaliadas) mapeadas.set(p.empresa_id, (mapeadas.get(p.empresa_id) ?? 0) + 1);
  const lacunas = nosCriterios.filter((id) => !servidas.has(id) && !restricoes.has(id)).map((id) => {
    const { empresa, avaliacao } = empresas.get(id);
    const pendentes = avaliacao.linhas.filter((l) => l.obrigatorio && l.julgamento !== 'atende').length;
    return { empresa: { id, nome: empresa.nome, cidade: empresa.cidade ?? null, uf: empresa.uf ?? null, subsetor: empresa.subsetor ?? null },
      mapeadas: mapeadas.get(id) ?? 0, estrutura: avaliacao.estrutura.leitura, pendentes };
  }).sort((a, b) => a.pendentes - b.pendentes || (a.mapeadas ? 1 : 0) - (b.mapeadas ? 1 : 0));

  const contagem = Object.fromEntries(GRUPOS.map((g) => [g, grupos[g].length]));
  return {
    leitura: { pedido: leitura.pedido, tese: leitura.tese, papel: leitura.papel, acesso: leitura.acesso, recorte: leitura.recorte,
      criterios: leitura.criterios.map(({ id, texto, obrigatorio, tipo }) => ({ id, texto, obrigatorio, tipo })), notas: leitura.notas },
    funil: {
      recorte: recorte.total, lidas: recorte.empresas.length, truncado: Boolean(recorte.truncado),
      nosCriterios: nosCriterios.length, comPessoas: new Set(avaliadas.map((p) => p.empresa_id)).size,
      pessoas: avaliadas.length, foraDosCriterios: linhas.length - avaliadas.length, ...contagem,
    },
    grupos: Object.fromEntries(GRUPOS.map((g) => [g, grupos[g].slice(0, EXIBIDOS[g])])),
    lacunas: { total: lacunas.length, ninguemMapeado: lacunas.filter((l) => !l.mapeadas).length, empresas: lacunas.slice(0, LACUNAS_EXIBIDAS) },
    membros, referencia, fonte: recorte.fonte ?? 'Receita Federal · CNPJ', limitacoes,
  };
}
