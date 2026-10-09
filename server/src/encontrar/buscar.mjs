import { LIMITE_RECORTE, LIMITE_VARREDURA } from '../agente/catalogo.mjs';
import { lerGrafo, caminhosNoGrafo, LIMITACAO_GRAFO } from '../rede/caminhos.mjs';
import { respostasPorPessoa } from '../acesso/plano.mjs';
import { interpretarPedido } from './pedido.mjs';
import { resolverNomes } from './nomes.mjs';
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

/* Tetos medidos com `ferramentas/medir-encontrar.mjs` (09/10/2026): o catálogo inteiro (12.145
   empresas) e o quadro estatutário de 2026-08 (8.736 dirigentes) somam ~0,1 s em banco local. O
   recorte é lido em páginas, como no monitoramento, até `LIMITE_VARREDURA`; as pessoas, até 20 mil. */
export const LIMITE_PESSOAS = 20000;
export const EXIBIDOS = Object.freeze({ forte: 60, revisar: 60, excluido: 20 });
export const LACUNAS_EXIBIDAS = 30;

/** Erro com código, para a rota traduzir sem confundir com falha de programa. */
const falha = (codigo, mensagem, causa) => Object.assign(new Error(mensagem), { codigo, causa });

/* O recorte inteiro, em páginas na mesma publicação (a primeira fixa o hash, como em
   `aprovadasCadastro` do motor da pesquisa): uma importação no meio não mistura versões. */
async function lerRecorte(catalogo, filtros, { pagina: tamanho = LIMITE_RECORTE, maximo = LIMITE_VARREDURA } = {}) {
  let pagina = await catalogo.recorte(filtros, { limite: tamanho });
  const { total, hash } = pagina;
  const empresas = [...pagina.empresas];
  while (pagina.proximo != null && pagina.empresas.length && empresas.length < maximo) {
    pagina = await catalogo.recorte(filtros, { hash, apos: pagina.proximo, limite: tamanho });
    if (!pagina || pagina.hash !== hash || pagina.total !== total) throw new Error('A publicação do catálogo mudou durante a busca.');
    empresas.push(...pagina.empresas);
  }
  return { empresas, total, truncado: pagina.proximo != null, referencia: pagina.referencia ?? null, fonte: pagina.fonte };
}

/* Restrições de contato dos outros espaços que o membro vê viram aviso, como no plano de acesso
   (`situacaoDaEmpresa` em api/empresas.mjs, mesma visibilidade): a do espaço do trabalho (`escopo`)
   decide o grupo; a de outro espaço pede conversa com o responsável antes de abordar, e não tira
   ninguém do resultado. Visíveis: o espaço pessoal do próprio membro e os mandatos que ele vê;
   o espaço pessoal de outro membro, não. */
async function avisosDeOutrosEspacos(db, usuario, escopo, empresas) {
  const porEmpresa = new Map();
  if (!empresas.length) return porEmpresa;
  const { rows } = await db.query(`SELECT r.empresa_id, r.motivo, m.rotulo AS espaco
      FROM crm_restricoes_contato r LEFT JOIN mandatos m ON r.escopo = 'mandato:' || m.id::text
     WHERE r.empresa_id = ANY($4::text[]) AND r.ativa AND r.escopo <> $5
       AND (r.escopo = 'usuario:' || $1::text OR (m.id IS NOT NULL AND ($2 OR m.confidencial = false OR m.id = ANY($3::uuid[]))))
     ORDER BY r.empresa_id, r.atualizado_em DESC`,
  [usuario.id, usuario.papel === 'admin', (usuario.mandatos ?? []).map((m) => m.id), empresas, escopo]);
  for (const r of rows) {
    if (!porEmpresa.has(r.empresa_id)) porEmpresa.set(r.empresa_id, []);
    const onde = r.espaco ? `no espaço "${r.espaco}"` : 'no seu espaço pessoal';
    const motivo = (r.motivo ?? '').replace(/[.\s]+$/, '');
    porEmpresa.get(r.empresa_id).push(`Há restrição de contato ${onde}${motivo ? `: ${motivo}` : ''}. Fale com o responsável antes de abordar.`);
  }
  return porEmpresa;
}

/* Empresas citadas pelo nome são o recorte inteiro: subsetor e "possíveis" não as tiram (quem
   cita o nome sabe qual quer); a UF citada ainda vale, com nota quando tira alguma. */
function recortePeloNome(leitura, referencia) {
  const citadas = new Map();
  for (const n of leitura.empresas) for (const e of n.empresas) citadas.set(e.id, e);
  const ufs = leitura.recorte.uf ? leitura.recorte.uf.split(',') : [];
  const empresas = [...citadas.values()].filter((e) => !ufs.length || ufs.includes(e.uf));
  if (empresas.length < citadas.size) {
    const fora = [...citadas.values()].filter((e) => !empresas.includes(e)).map((e) => `${e.nome} (${e.uf})`);
    leitura.notas.push(`${fora.join(', ')} ${fora.length === 1 ? 'fica' : 'ficam'} fora do recorte: o pedido cita ${ufs.join(', ')}.`);
  }
  return { empresas, total: empresas.length, truncado: false, referencia, fonte: 'Receita Federal · CNPJ' };
}

/* Dentro de uma pesquisa por tese ("quem decide nas aderentes"), o recorte são as empresas
   aderentes e prováveis dela, com o cadastro que a pesquisa guardou, e cada uma ganha a linha do
   veredito da pesquisa: aderente atende; provável é indício e manda para revisão. Os critérios do
   pedido ainda valem por cima, e a UF citada também. */
export const CATEGORIAS_DA_PESQUISA = Object.freeze(['aderente', 'provavel']);
function recorteDaPesquisa(leitura, pesquisa) {
  const ufs = leitura.recorte.uf ? leitura.recorte.uf.split(',') : [];
  const empresas = pesquisa.itens.map((i) => i.empresa).filter((e) => !ufs.length || ufs.includes(e.uf));
  return { empresas, total: empresas.length, truncado: false, referencia: pesquisa.referencia, fonte: 'Receita Federal · CNPJ' };
}
function linhaDaPesquisa(item, pesquisa) {
  const aderente = item.categoria === 'aderente';
  return { requisito: 'Na pesquisa por tese', julgamento: aderente ? 'atende' : 'indicio', obrigatorio: true,
    informacao: `${aderente ? 'Aderente' : 'Provável: algum critério só por indício no site'} (aderência ${item.aderencia}%)`,
    fonte: `Pesquisa por tese do GHT4 · "${pesquisa.tese.slice(0, 80)}"` };
}

/**
 * @param {object} db
 * @param {{recorte: Function}} catalogo
 * @param {{texto: string, usuario: {id: string}, pesquisa?: {id: string, tese: string, referencia: string|null,
 *   escopo: string, itens: {empresa: object, categoria: string, aderencia: number}[]}|null}} pedido
 *   `pesquisa`: as empresas aderentes e prováveis de uma pesquisa por tese, já autorizada pela rota.
 */
export async function encontrarPessoas(db, catalogo, { texto, usuario, pesquisa = null }, { limitePessoas = LIMITE_PESSOAS, paginaRecorte = LIMITE_RECORTE } = {}) {
  // Sem a lista de municípios, cidade continua pedindo "cidade de" (como na pesquisa por tese).
  const municipios = await Promise.resolve(catalogo.municipios?.()).catch(() => null) ?? null;
  let leitura = interpretarPedido(texto, { municipios });
  // A restrição que decide o grupo é a do espaço do trabalho: o da pesquisa, ou o pessoal do membro.
  const escopo = pesquisa?.escopo ?? `usuario:${usuario.id}`;
  let recorte;
  try {
    if (pesquisa) recorte = recorteDaPesquisa(leitura, pesquisa);
    else if (leitura.candidatos.length) {
      const { nomes, referencia } = await resolverNomes(catalogo, leitura.candidatos);
      leitura = interpretarPedido(texto, { municipios, nomes });
      if (leitura.empresas.length) recorte = recortePeloNome(leitura, referencia);
    }
    recorte ??= await lerRecorte(catalogo, leitura.recorte, { pagina: paginaRecorte });
  } catch (e) { throw falha('catalogo_indisponivel', 'O catálogo não pôde ser consultado. Tente novamente.', e); }
  const referencia = recorte.referencia ?? null;
  // Dentro da pesquisa, o subsetor não recorta nada: as notas dele saem.
  if (pesquisa) leitura.notas = leitura.notas.filter((n) => !/subsetor/.test(n));

  // Critérios da empresa, uma vez por empresa. Reprovada num obrigatório, a empresa sai antes das pessoas.
  const daPesquisa = new Map((pesquisa?.itens ?? []).map((i) => [i.empresa.id, i]));
  const empresas = new Map(recorte.empresas.map((e) => {
    const avaliacao = avaliarEmpresa(e, leitura.criterios, referencia);
    if (daPesquisa.has(e.id)) avaliacao.linhas.unshift(linhaDaPesquisa(daPesquisa.get(e.id), pesquisa));
    return [e.id, { empresa: e, avaliacao }];
  }));
  const ids = [...empresas.keys()];
  const nosCriterios = ids.filter((id) => !empresas.get(id).avaliacao.reprovada);

  const linhas = ids.length ? (await db.query(
    `SELECT id, lado, nome, cargo, senioridade, organizacao, empresa_id, origem, origem_referencia
       FROM rede_pessoas WHERE lado = 'mercado' AND ativo AND empresa_id = ANY($1::text[])
      ORDER BY empresa_id, nome, id LIMIT ${limitePessoas + 1}`, [ids])).rows : [];
  const limitacoes = [
    'Só entram pessoas que a casa já mapeou: o quadro societário público no recorte estatutário, as listas compartilhadas pela equipe e quem alguém da casa registrou com a fonte. O GHT4 não compra base de pessoas nem lê LinkedIn.',
    'Telefone e e-mail não aparecem: a conversa começa pelo caminho da rede ou pelo canal institucional do plano de acesso.',
    'Critério que o cadastro não responde fica "sem evidência" e manda a pessoa para revisão; a pesquisa por tese procura a resposta no site oficial.',
  ];
  if (recorte.truncado) limitacoes.push(`O recorte tem ${recorte.total.toLocaleString('pt-BR')} empresas e esta busca leu as primeiras ${recorte.empresas.length.toLocaleString('pt-BR')}. Cite UF ou subsetor no pedido para cobrir todas.`);
  /* Pessoas além do teto: as empresas a partir da última lida (em ordem de CNPJ, como na consulta)
     ficaram sem avaliar e não podem virar "ninguém mapeado" nas lacunas. */
  let semAvaliar = null;
  if (linhas.length > limitePessoas) {
    linhas.length = limitePessoas;
    semAvaliar = linhas.at(-1).empresa_id;
    limitacoes.push(`Mais de ${limitePessoas.toLocaleString('pt-BR')} pessoas mapeadas no recorte: esta busca leu as primeiras, e as empresas seguintes (em ordem de CNPJ) não entram em "Onde falta quem decide". Estreite o pedido.`);
  }

  // Pessoas das empresas reprovadas só entram na contagem: listá-las seria ruído.
  const avaliadas = linhas.filter((p) => !empresas.get(p.empresa_id).avaliacao.reprovada);
  const restricoes = new Map(nosCriterios.length ? (await db.query(
    'SELECT empresa_id, categoria, motivo FROM crm_restricoes_contato WHERE escopo = $1 AND ativa AND empresa_id = ANY($2::text[])',
    [escopo, nosCriterios])).rows.map((r) => [r.empresa_id, r]) : []);
  const avisos = await avisosDeOutrosEspacos(db, usuario, escopo, nosCriterios.filter((id) => !restricoes.has(id)));
  if (pesquisa) limitacoes.push(`Empresas e cadastro vêm da pesquisa por tese (referência ${pesquisa.referencia ?? 'da pesquisa'}): as aderentes e as prováveis. Para outras empresas, faça o pedido fora da pesquisa.`);

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
  const [respostas, membros, semCnpj] = await Promise.all([
    respostasPorPessoa(db, avaliadas.map((p) => p.id)),
    db.query("SELECT count(*)::int AS n FROM rede_pessoas WHERE lado = 'ght4' AND ativo").then((r) => r.rows[0].n),
    db.query("SELECT count(*)::int AS n FROM rede_pessoas WHERE lado = 'mercado' AND ativo AND empresa_id IS NULL").then((r) => r.rows[0].n),
  ]);
  if (semCnpj) limitacoes.push(`${semCnpj.toLocaleString('pt-BR')} ${semCnpj === 1 ? 'pessoa da rede está' : 'pessoas da rede estão'} só com o nome da organização e não ${semCnpj === 1 ? 'entra' : 'entram'} em nenhuma busca. Em Relacionamentos › Pessoas nas empresas, use "Vincular ao CNPJ".`);

  const julgadas = avaliadas.map((p) => {
    const { empresa, avaliacao } = empresas.get(p.empresa_id);
    const dela = porAlvo.get(p.id) ?? [];
    const resp = respostas.get(p.id) ?? { respostas: 0, negativas: 0 };
    return julgarPessoa(p, { empresa, avaliacao, caminho: dela.find((c) => c.recomendavel) ?? null,
      incompletos: dela.filter((c) => !c.recomendavel).length, membros, ...resp,
      restricao: restricoes.get(p.empresa_id) ?? null, avisos: avisos.get(p.empresa_id) ?? [] }, leitura);
  });
  const grupos = Object.fromEntries(GRUPOS.map((g) => [g, ordenar(julgadas.filter((p) => p.grupo === g))]));

  /* Lacunas: empresas nos critérios, sem restrição, onde ninguém mapeado serve ao pedido.
     É o "caminho de recall": alguém da casa registra quem decide, com a fonte. */
  const servidas = new Set(julgadas.filter((p) => p.grupo !== 'excluido').map((p) => p.empresa.id));
  const mapeadas = new Map();
  for (const p of avaliadas) mapeadas.set(p.empresa_id, (mapeadas.get(p.empresa_id) ?? 0) + 1);
  const lacunas = nosCriterios.filter((id) => !servidas.has(id) && !restricoes.has(id) && !(semAvaliar && id >= semAvaliar)).map((id) => {
    const { empresa, avaliacao } = empresas.get(id);
    const pendentes = avaliacao.linhas.filter((l) => l.obrigatorio && l.julgamento !== 'atende').length;
    return { empresa: { id, nome: empresa.nome, cidade: empresa.cidade ?? null, uf: empresa.uf ?? null, subsetor: empresa.subsetor ?? null },
      mapeadas: mapeadas.get(id) ?? 0, estrutura: avaliacao.estrutura.leitura, pendentes, avisos: avisos.get(id) ?? [] };
  }).sort((a, b) => a.pendentes - b.pendentes || (a.mapeadas ? 1 : 0) - (b.mapeadas ? 1 : 0));

  const contagem = Object.fromEntries(GRUPOS.map((g) => [g, grupos[g].length]));
  return {
    leitura: { pedido: leitura.pedido, tese: leitura.tese, papel: leitura.papel, acesso: leitura.acesso, recorte: leitura.recorte,
      criterios: leitura.criterios.map(({ id, texto, obrigatorio, tipo }) => ({ id, texto, obrigatorio, tipo })), notas: leitura.notas,
      empresas: leitura.empresas.map(({ trecho, empresas }) => ({ trecho,
        empresas: empresas.map(({ id, nome, cidade, uf }) => ({ id, nome, cidade: cidade ?? null, uf: uf ?? null })) })),
      pesquisa: pesquisa ? { id: pesquisa.id, tese: pesquisa.tese, empresas: pesquisa.itens.length, categorias: CATEGORIAS_DA_PESQUISA } : null },
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
