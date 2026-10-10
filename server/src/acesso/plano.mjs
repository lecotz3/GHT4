import { senioridadeDe, categoriaDe, normalizar } from '../rede/contratos.mjs';

/* =============================================================================
 *  GHT4 · plano de acesso a quem decide
 * -----------------------------------------------------------------------------
 *  A pesquisa por tese entrega a empresa; o negócio começa numa pessoa. Este
 *  módulo responde, para UMA empresa-alvo, as quatro perguntas que separam as
 *  duas coisas: quem decide a venda, como a casa chega até essa pessoa, por onde
 *  falar se não houver ponte, e o que dizer na primeira mensagem.
 *
 *  DE ONDE VEIO A IDEIA
 *  O "Match Judgment" do Lessie (app.lessie.ai/find): cada pessoa encontrada traz
 *  uma tabela requisito · julgamento · informação · fonte, e a lista de pessoas
 *  guarda o estado do contato (salva, contatada, em conversa). Aqui a tabela vira
 *  o juízo do decisor, com os mesmos vereditos da pesquisa (atende, indício, sem
 *  evidência, não atende), e o estado do contato é o da rede e da oportunidade,
 *  que já existem.
 *
 *  O QUE ELE NÃO FAZ, de propósito
 *  - Não descobre nomes. O quadro societário público só entra no produto pelo
 *    recorte decidido pela casa (cargos estatutários em 18/09/2026, e o
 *    sócio-administrador das limitadas em 10/10/2026); para as demais
 *    empresas, a ESTRUTURA do cadastro (natureza jurídica, quantos sócios, sócio
 *    pessoa jurídica ou no exterior) diz QUE TIPO de pessoa decide, e quem é a
 *    pessoa é registrado por alguém da casa, com a fonte (o "caminho de recall").
 *  - Não usa faixa etária: o produto se proíbe de inferir sucessão pela idade.
 *  - Não expõe telefone nem e-mail do cadastro: costumam ser do escritório
 *    contábil, e contato pessoal não é propagado. O canal institucional é o site.
 *  - Não envia nada. A primeira mensagem é rascunho para quem conhece a relação
 *    revisar e mandar pelo próprio canal.
 * ========================================================================== */

/** De onde a casa sabe o cargo de uma pessoa registrada pelo plano. */
export const TIPOS_FONTE_CARGO = Object.freeze([
  { id: 'conhecimento_da_casa', rotulo: 'Conhecimento da casa' },
  { id: 'site_oficial', rotulo: 'Site oficial da empresa' },
  { id: 'documento_publico', rotulo: 'Documento público' },
  { id: 'conversa', rotulo: 'Conversa com a empresa' },
]);
export const rotuloFonte = (id) => TIPOS_FONTE_CARGO.find((t) => t.id === id)?.rotulo ?? 'Fonte informada';

/** Referência gravada em `rede_pessoas.origem_referencia`: o que se lê como fonte do cargo. */
export function referenciaDaFonte({ tipo, descricao, url }) {
  return `${rotuloFonte(tipo)}: ${descricao}${url ? ` · ${url}` : ''}`.slice(0, 600);
}

/* Grupos de natureza jurídica (códigos da tabela da Receita). Os mesmos de
   `pesquisa/criterios.mjs`; cooperativa e estatal ficam à parte porque a venda
   de controle, nelas, não se decide do jeito de uma empresa privada. */
const NATUREZAS = Object.freeze({
  individual: ['2135', '2305', '2313', '2348'],
  ltda: ['2062', '2240'],
  sa_fechada: ['2054'],
  sa_aberta: ['2046'],
  cooperativa: ['2143', '2330'],
  estatal: ['2011', '2038'],
});
const ROTULO_NATUREZA = Object.freeze({
  individual: 'empresário individual ou unipessoal', ltda: 'sociedade limitada', sa_fechada: 'sociedade anônima fechada',
  sa_aberta: 'companhia aberta', cooperativa: 'cooperativa', estatal: 'empresa pública ou de economia mista', outra: 'outra natureza',
});
const grupoDaNatureza = (codigo) => Object.keys(NATUREZAS).find((g) => NATUREZAS[g].includes(codigo)) ?? 'outra';

const contar = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Quem decide a venda, pela estrutura pública do cadastro — sem nomes.
 *
 * @param {object|null} a atributos públicos da empresa (`agente/atributos.mjs`)
 * @param {string|null} referencia mês de referência do cadastro
 */
export function estruturaDeDecisao(a, referencia = null) {
  if (!a) return {
    conhecida: false, natureza: null, naturezaRotulo: null, socios: null, sociosPj: null, socioEstrangeiro: null,
    leitura: 'A estrutura societária desta empresa não veio com a consulta. Registre quem decide a partir do que a casa sabe.',
    sinais: [], decide: ['ceo', 'conselho'], fonte: null,
  };
  const natureza = a.naturezaJuridica ? grupoDaNatureza(a.naturezaJuridica) : 'outra';
  const socios = Number.isInteger(a.qtdSocios) ? a.qtdSocios : null;
  const pj = Number.isInteger(a.qtdSociosPj) ? a.qtdSociosPj : 0;
  const pf = socios === null ? null : Math.max(0, socios - pj);
  const estrangeiro = typeof a.socioEstrangeiro === 'boolean' ? a.socioEstrangeiro : null;
  let leitura;
  let decide = ['ceo', 'conselho'];
  if (natureza === 'individual') leitura = 'Titular único: a decisão de vender é de uma pessoa só, que costuma também tocar o negócio.';
  else if (natureza === 'sa_aberta') {
    leitura = 'Companhia aberta: a venda de controle é decisão do acionista controlador. Controlador e administradores estão no Formulário de Referência da CVM; Relações com Investidores é o canal institucional.';
  } else if (natureza === 'sa_fechada') {
    leitura = 'Sociedade anônima fechada: a venda de controle é decisão do acionista controlador. Conselho e diretoria abrem a conversa, mas não decidem a venda sozinhos.';
  } else if (natureza === 'cooperativa') {
    leitura = 'Cooperativa: decisões de controle passam pela assembleia dos cooperados; a diretoria é a porta de entrada.';
    decide = ['conselho', 'ceo', 'diretoria'];
  } else if (natureza === 'estatal') {
    leitura = 'Empresa pública ou de economia mista: venda depende do ente controlador e de rito próprio; não é uma abordagem de prospecção comum.';
  } else if (socios === null) leitura = 'O cadastro não informa o quadro societário desta empresa. Registre quem decide a partir do que a casa sabe.';
  else if (socios <= 1 && pj === 0) leitura = 'Sócio único: uma pessoa decide a venda, e costuma ser quem administra.';
  else if (pj === 0 && socios <= 3) leitura = `${contar(socios, 'sócio pessoa física', 'sócios pessoas físicas')}: a venda depende deles em conjunto, e o sócio que administra costuma abrir a conversa.`;
  else if (pj === 0) leitura = `Quadro com ${socios} sócios pessoas físicas: decisão colegiada. Procure quem controla e quem administra antes de abordar.`;
  else leitura = pf ? `Quadro com ${contar(pf, 'sócio pessoa física', 'sócios pessoas físicas')} e ${contar(pj, 'sócio pessoa jurídica', 'sócios pessoas jurídicas')}: a decisão pode estar numa holding ou num grupo.`
    : `Todos os ${contar(pj, 'sócio é pessoa jurídica', 'sócios são pessoas jurídicas')}: quem decide está na sociedade sócia (holding ou grupo).`;
  const sinais = [];
  if (pj > 0) sinais.push(`Há ${contar(pj, 'sócio pessoa jurídica', 'sócios pessoas jurídicas')}: identifique o controlador antes de tratar a operação. Grupo econômico não se deduz do cadastro.`);
  if (estrangeiro) sinais.push('Há sócio no exterior: a decisão pode estar na matriz estrangeira, e o caminho pode passar por ela.');
  return {
    conhecida: true, natureza, naturezaRotulo: ROTULO_NATUREZA[natureza], socios, sociosPj: pj, socioEstrangeiro: estrangeiro,
    leitura, sinais, decide,
    fonte: `Cadastro CNPJ (Receita Federal)${referencia ? `, referência ${referencia}` : ''}: natureza jurídica e contagem do quadro societário. Do quadro, só entram com nome os cargos estatutários e o sócio-administrador das limitadas (decisões da casa de 18/09 e 10/10/2026).`,
  };
}

/* O cargo prova a função, não o controle. Decide a venda quem tem participação no capital (sócio,
   titular, controlador); presidente, conselheiro ou administrador sem ela dirigem a empresa e dão
   acesso a quem decide, mas não vendem o controle (parecer do Codex sobre a Rodada 20). */
const DONO_PELO_CARGO = /\b(?:socio|socia|socios|socias|titular|dono|dona|proprietari[oa]|controlador(?:a)?|acionista)\b/g;
/* Onde o capital se divide (S.A., quadro com mais de três sócios ou com sócio pessoa jurídica), ser
   sócio ou acionista não prova o controle: vale "controlador", "majoritário", "dono", "proprietário"
   ou "titular" (parecer do Codex sobre a Rodada 27). Sem a estrutura, a participação basta, como antes. */
export const capitalDividido = (e) => Boolean(e?.conhecida)
  && (['sa_aberta', 'sa_fechada'].includes(e.natureza) || (e.sociosPj ?? 0) > 0 || (e.socios ?? 0) > 3);
export const donoPeloCargo = (cargo, { exigeControle = false } = {}) => {
  const texto = String(cargo ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return [...texto.matchAll(DONO_PELO_CARGO)].some((m) => {
    const antes = texto.slice(0, m.index), depois = texto.slice(m.index + m[0].length);
    if (exigeControle && /^(?:socio|socia|socios|socias|acionista)$/.test(m[0]) && !/^[-\s]*(?:majoritari[oa]s?|controlador(?:a|es|as)?)\b/.test(depois)) return false;
    // Referência a outra pessoa, negação e cargo anterior não provam participação própria.
    return !/\b(?:d[oa]s?|a[oa]s?)\s+$/.test(antes)
      && !/\b(?:nao|sem)(?:[-\s]+(?:e|ser|o|a|um|uma|qualquer))*[-\s]+$/.test(antes)
      && !/\bex[-\s]*$/.test(antes)
      // Participação minoritária não vende o controle; "conselheiro titular" é o contrário de suplente.
      && !/^[-\s]*(?:minoritari[oa]s?|sem (?:controle|poder de controle))\b/.test(depois)
      && !(m[0] === 'titular' && /\b(?:conselheir[oa]s?|membros?|diretor(?:es|a|as)?|suplentes?)\s+(?:\w+\s+)?$/.test(antes));
  });
};

/* O quadro estatutário prova só o que atestou na importação (coluna `quadro`, migração 0032): nome,
   cargo, senioridade e empresa. Editada depois pela Rede, a linha continua de origem pública, mas o
   campo mudado já não é da Receita (parecer do Codex sobre a Rodada 26). */
const chaveDoQuadro = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function atestadoPeloQuadro(p) {
  const q = p?.origem === 'cadastro_publico' ? p.quadro : null;
  return Boolean(q) && chaveDoQuadro(q.nome) === chaveDoQuadro(p.nome) && chaveDoQuadro(q.cargo) === chaveDoQuadro(p.cargo)
    && q.senioridade === p.senioridade && q.empresaId === p.empresa_id;
}

/**
 * Posição da pessoa na decisão de venda: decide, influencia, abre a porta ou cargo a revisar.
 * `cargo` (o escrito): no nível que decide, só decide quem o cargo mostra como dono; sem `cargo`
 * (quem chama não o tem), vale o nível.
 */
export function posicaoNaDecisao(senioridade, estrutura, cargo = undefined) {
  const s = senioridadeDe(senioridade);
  if (s.id === 'outro') return { id: 'a_revisar', rotulo: 'Cargo a revisar' };
  if ((estrutura?.decide ?? ['ceo', 'conselho']).includes(s.id)) {
    if (cargo === undefined || donoPeloCargo(cargo, { exigeControle: capitalDividido(estrutura) })) return { id: 'decide', rotulo: 'Decide a venda' };
    // Participação sem prova de controle (capital dividido) dirige e dá acesso, como o cargo sem participação.
    return { id: 'influencia', rotulo: 'Influencia a decisão', dirige: true, semControle: donoPeloCargo(cargo) };
  }
  if (s.lideranca) return { id: 'influencia', rotulo: 'Influencia a decisão' };
  return { id: 'porta', rotulo: 'Porta de entrada' };
}

const ORDEM_POSICAO = { decide: 0, influencia: 1, porta: 2, a_revisar: 3 };
const juizo = (requisito, julgamento, informacao, fonte = null) => ({ requisito, julgamento, informacao, fonte });

/**
 * Juízo da pessoa como decisora, na forma requisito · julgamento · informação · fonte.
 *
 * @param {object} p linha de `rede_pessoas`
 * @param {{empresaId: string, cnpjRaiz?: string, estrutura: object, caminho: object|null,
 *   incompletos: number, respostas: number, negativas: number, membros: number}} ctx
 */
export function juizoDoDecisor(p, ctx) {
  const s = senioridadeDe(p.senioridade);
  const posicao = posicaoNaDecisao(p.senioridade, ctx.estrutura, p.cargo ?? '');
  const cargo = `${s.rotulo}${p.cargo ? ` · ${p.cargo}` : ''}`;
  const doQuadro = atestadoPeloQuadro(p);
  const fonteCargo = doQuadro ? `Quadro societário público (Receita Federal)${p.origem_referencia ? ` · ${p.origem_referencia}` : ''}`
    : p.origem === 'cadastro_publico' ? 'Cadastro da rede, alterado depois da importação do quadro societário'
      : p.origem_referencia || null;
  const linhas = [];

  linhas.push(posicao.id === 'decide' ? juizo('Decide a venda', 'atende', cargo, fonteCargo)
    : posicao.semControle ? juizo('Decide a venda', 'indicio', `${cargo}: tem participação, mas o capital se divide e o cargo não diz que ela controla. A venda é de quem controla; confirme se é esta pessoa.`, fonteCargo)
    : posicao.dirige ? juizo('Decide a venda', 'indicio', `${cargo}: dirige a empresa, mas o cargo não mostra participação no capital. A venda é de quem controla; a pessoa é o acesso a essa decisão.`, fonteCargo)
    : posicao.id === 'influencia' ? juizo('Decide a venda', 'indicio', `${cargo}: influencia; a venda é de quem controla.`, fonteCargo)
      : posicao.id === 'porta' ? juizo('Decide a venda', 'nao_atende', `${cargo}: porta de entrada, não decide a venda.`, fonteCargo)
        : juizo('Decide a venda', 'indeterminado', 'Cargo sem nível de decisão definido. Revise o cadastro.', fonteCargo));

  if (doQuadro) linhas.push(juizo('Cargo com fonte', 'atende', 'Cargo declarado no quadro societário público.', fonteCargo));
  else if (p.origem === 'cadastro_publico') linhas.push(juizo('Cargo com fonte', 'indicio', 'Veio do quadro societário público, mas nome, cargo ou empresa já não são os que a Receita registrou: foi editado depois da importação. Confirme no quadro.', fonteCargo));
  else if (p.origem === 'importacao') linhas.push(juizo('Cargo com fonte', 'indicio', 'Veio de lista compartilhada pela equipe; o nível de decisão ainda deve ser revisado.', p.origem_referencia || 'Lote compartilhado'));
  else if (p.origem_referencia) linhas.push(juizo('Cargo com fonte', 'atende', 'Registrado pela casa com a fonte do cargo.', p.origem_referencia));
  else linhas.push(juizo('Cargo com fonte', 'indeterminado', 'Cadastrado sem dizer de onde vem o cargo. Peça a quem cadastrou.', null));

  linhas.push(p.empresa_id === ctx.empresaId
    ? juizo('Pertence a esta empresa', 'atende', `Vinculada ao CNPJ${ctx.cnpjRaiz ? ` ${ctx.cnpjRaiz}` : ' da empresa'}.`, 'Cadastro da rede')
    : juizo('Pertence a esta empresa', 'indicio', `Encontrada pelo nome da organização (${p.organizacao || 'sem nome'}), sem vínculo com o CNPJ.`, 'Cadastro da rede'));

  const c = ctx.caminho;
  if (c && ['introducao_viavel', 'relacao_confirmada'].includes(c.categoria)) linhas.push(juizo('A casa chega até ela', 'atende', `${c.categoriaRotulo}: ${c.rota}.`, 'Rede de relacionamento, confirmada pelo titular'));
  else if (c) linhas.push(juizo('A casa chega até ela', 'indicio', `${c.categoriaRotulo}: ${c.rota}.`, 'Rede de relacionamento'));
  else if (ctx.incompletos) linhas.push(juizo('A casa chega até ela', 'nao_atende', 'Há caminho registrado, mas o titular não quer intermediar ou a informação está desatualizada.', 'Rede de relacionamento'));
  else if (ctx.membros && ctx.respostas >= ctx.membros && ctx.negativas >= ctx.respostas) linhas.push(juizo('A casa chega até ela', 'nao_atende', 'Toda a casa respondeu e ninguém conhece.', 'Passada de reconhecimento'));
  else if (ctx.respostas) linhas.push(juizo('A casa chega até ela', 'indeterminado', `${contar(ctx.respostas, 'resposta', 'respostas')} de ${ctx.membros} da casa, nenhuma com caminho até agora.`, 'Passada de reconhecimento'));
  else linhas.push(juizo('A casa chega até ela', 'indeterminado', 'Ninguém da casa foi perguntado sobre esta pessoa.', null));
  return { posicao, juizo: linhas };
}

/* Páginas do site que a pesquisa já leu: a de contato é canal; a institucional é
   onde alguém da casa procura quem dirige a empresa. O produto aponta a página e
   não extrai nomes dela. */
const PAGINA_CONTATO = /contato|fale|contact|atendimento|sac\b/i;
const PAGINA_INSTITUCIONAL = /quem-?somos|sobre|institucional|a-?empresa|nossa-?historia|historia|diretoria|lideranca|equipe|about|team|governanca/i;

/** Canais institucionais da empresa: o site oficial e as páginas que a pesquisa leu. */
export function canaisInstitucionais({ atributos = null, site = null, estrutura = null } = {}) {
  const canais = [];
  const dominio = site?.dominio ?? atributos?.dominio ?? null;
  if (dominio) canais.push({ tipo: 'site', rotulo: 'Site oficial', url: `https://${dominio}`,
    fonte: 'Domínio do e-mail corporativo declarado no CNPJ', dica: 'Formulário e telefone publicados pela própria empresa.' });
  const paginas = Array.isArray(site?.paginas) ? site.paginas : [];
  const vistas = new Set();
  for (const p of paginas) {
    if (!p?.url || vistas.has(p.url)) continue;
    const alvo = `${p.url} ${p.titulo ?? ''}`;
    if (PAGINA_CONTATO.test(alvo)) { vistas.add(p.url); canais.push({ tipo: 'contato', rotulo: 'Página de contato', url: p.url, fonte: 'Lida pela pesquisa', dica: p.titulo ?? null }); }
    else if (PAGINA_INSTITUCIONAL.test(alvo)) { vistas.add(p.url); canais.push({ tipo: 'institucional', rotulo: 'Página institucional', url: p.url, fonte: 'Lida pela pesquisa',
      dica: 'Onde procurar quem dirige a empresa. Ao registrar a pessoa, cite esta página como fonte.' }); }
  }
  if (estrutura?.natureza === 'sa_aberta') canais.push({ tipo: 'ri', rotulo: 'Relações com Investidores', url: 'https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx',
    fonte: 'CVM', dica: 'Formulário de Referência: controlador, administradores e o contato de RI.' });
  return canais.slice(0, 6);
}

const primeiroNome = (n) => String(n ?? '').trim().split(/\s+/)[0] || String(n ?? '');
const REGRAS_RASCUNHO = Object.freeze([
  'Ajuste o tom à relação real. Não antecipe mandato, cliente, tese ou valores nesta primeira conversa, e não declare interesse de venda sem evidência.',
  'O sistema não envia nada: copie, revise e mande pelo seu próprio canal.',
  'Escrever a mensagem não move a oportunidade para "contatada": registre a etapa só depois do contato feito.',
]);

/**
 * O próximo passo do plano, na ordem em que se trabalha: restrição encerra; sem
 * ninguém mapeado, descobrir quem decide; com caminho, usá-lo; sem caminho e com
 * perguntas pendentes, perguntar à casa; só então a abordagem institucional.
 */
export function proximoPasso({ empresa, pessoas, caminhos, cobertura, estrutura, restricao, canais, autor }) {
  const nomeEmpresa = empresa?.nome ?? 'a empresa';
  if (restricao?.ativa) return { acao: 'nao_contatar', titulo: 'Não contatar',
    texto: `Esta empresa está marcada como não contatar neste espaço${restricao.motivo ? `: ${restricao.motivo}` : ''}. Nenhum caminho é sugerido enquanto a restrição estiver ativa.`,
    rascunhos: [], regras: [] };
  if (!pessoas.length) return { acao: 'registrar_decisor', titulo: 'Descubra quem decide',
    texto: `${estrutura.leitura} Ninguém desta empresa está na rede ainda: registre quem decide, com a fonte (site oficial, documento público ou conhecimento da casa).`,
    rascunhos: [], regras: [] };
  const decisores = pessoas.filter((p) => p.posicao.id === 'decide');
  const uteis = caminhos.filter((c) => c.recomendavel);
  const paraDecisor = uteis.find((c) => decisores.some((d) => d.id === c.alvo.id));
  const melhor = paraDecisor ?? uteis[0];
  if (melhor) {
    const alvo = melhor.alvo, ponte = melhor.intermediario, casa = melhor.ght4;
    const porta = !paraDecisor;
    const rascunhos = ponte ? [
      { para: ponte.nome, texto: `${primeiroNome(ponte.nome)}, tudo bem? Estou acompanhando o setor químico e vi que você tem relação com ${alvo.nome}${alvo.cargo ? `, ${alvo.cargo} da ${nomeEmpresa}` : ` da ${nomeEmpresa}`}. Faria sentido você nos apresentar? Entendo perfeitamente se preferir não.` },
      { para: alvo.nome, texto: `${primeiroNome(alvo.nome)}, tudo bem? Aqui é ${casa.nome}, da GHT4, apresentado por ${primeiroNome(ponte.nome)}. Queria ouvir sua leitura sobre o momento do setor. Você teria 20 minutos nas próximas semanas?` },
    ] : [
      { para: alvo.nome, texto: `${primeiroNome(alvo.nome)}, tudo bem? Aqui é ${casa.nome}, da GHT4. ${melhor.ligacoes?.[0]?.tipo === 'trabalharam_juntos' ? 'Trabalhamos juntos' : 'Nos conhecemos'}${melhor.ligacoes?.[0]?.periodo ? ` ${melhor.ligacoes[0].periodo}` : ''}. Estou acompanhando o setor e queria ouvir sua leitura sobre ${nomeEmpresa}. Você teria 20 minutos nas próximas semanas?` },
    ];
    return {
      acao: porta ? 'usar_porta' : ponte ? 'pedir_apresentacao' : 'falar_direto',
      titulo: porta ? 'Use a porta de entrada' : ponte ? 'Peça a apresentação' : 'Fale direto',
      texto: `${melhor.rota}. ${melhor.categoriaRotulo}: ${melhor.categoriaDescricao}${porta ? ` ${alvo.nome} não decide a venda: a conversa serve para chegar a quem decide${decisores.length ? ` (${decisores.map((d) => d.nome).join(', ')})` : ''}.` : ''}`,
      quem: casa.nome, caminho: { rota: melhor.rota, categoria: melhor.categoria, ressalvas: melhor.ressalvas },
      rascunhos, regras: REGRAS_RASCUNHO,
    };
  }
  // Sem membros na rede, "ninguém conhece" seria afirmação sem pergunta nenhuma por trás.
  if (!cobertura.membros) return { acao: 'cadastrar_casa', titulo: 'Cadastre a casa na rede',
    texto: `Ninguém da GHT4 está cadastrado na rede ainda, e sem isso não há como saber quem conhece ${pessoas[0].nome}. Cadastre os membros em Rede e faça a passada de reconhecimento desta empresa.`,
    rascunhos: [], regras: [] };
  if (cobertura.perguntasPendentes > 0) return { acao: 'perguntar_a_casa', titulo: 'Pergunte à casa',
    texto: `${contar(cobertura.perguntasPendentes, 'pergunta continua', 'perguntas continuam')} sem resposta sobre ${contar(pessoas.length, 'pessoa', 'pessoas')} desta empresa. Responda "você conhece?" abaixo e peça aos demais membros a passada de reconhecimento, filtrada por esta empresa.`,
    rascunhos: [], regras: [] };
  if (!decisores.length) return { acao: 'registrar_decisor', titulo: 'Falta quem decide',
    texto: `${estrutura.leitura} As pessoas mapeadas não decidem a venda. Registre quem decide, com a fonte.`, rascunhos: [], regras: [] };
  const decisor = decisores[0];
  const canal = canais.find((c) => c.tipo === 'contato') ?? canais.find((c) => c.tipo === 'ri') ?? canais.find((c) => c.tipo === 'site');
  return { acao: 'abordagem_institucional', titulo: 'Abordagem institucional',
    texto: `Toda a casa respondeu e não há caminho utilizável até ${decisor.nome}. Escreva pelo canal institucional${canal ? ` (${canal.rotulo.toLowerCase()})` : ''}, endereçando a quem decide; não monte e-mail por padrão de domínio.`,
    rascunhos: [{ para: decisor.nome, texto: `Prezado(a) ${decisor.nome}, sou ${autor ?? 'da equipe'}, da GHT4. Acompanhamos de perto o setor químico e a trajetória da ${nomeEmpresa}. Gostaria de uma conversa de 20 minutos para trocar impressões sobre o momento do setor, sem compromisso e com total discrição. Teria disponibilidade nas próximas semanas? Atenciosamente, ${autor ?? 'GHT4'}.` }],
    regras: REGRAS_RASCUNHO };
}

/**
 * O plano inteiro, a partir do que já foi lido do banco.
 *
 * @param {{empresa: object, atributos: object|null, site: object|null, referencia?: string|null,
 *   acesso: object, respostas: Map<string,{respostas:number,negativas:number}>, minhas: Map<string,string>,
 *   restricoesOutras?: object[], oportunidades?: object[], autor?: string}} d
 */
export function montarPlano(d) {
  const estrutura = estruturaDeDecisao(d.atributos, d.referencia ?? d.empresa?.referencia ?? null);
  const r = d.acesso;
  const membros = r.cobertura?.membros ?? 0;
  const todas = [...r.caminhos.map((c) => c.alvo), ...r.semCaminho];
  const unicas = [...new Map(todas.map((p) => [p.id, p])).values()];
  const brutas = new Map((d.linhas ?? []).map((l) => [l.id, l]));
  const pessoas = unicas.map((p) => {
    const linha = brutas.get(p.id) ?? {};
    const caminhosDela = r.caminhos.filter((c) => c.alvo.id === p.id);
    const caminho = caminhosDela.find((c) => c.recomendavel) ?? null;
    const resp = d.respostas.get(p.id) ?? { respostas: 0, negativas: 0 };
    const { posicao, juizo: linhas } = juizoDoDecisor({ ...linha, senioridade: p.senioridade, cargo: p.cargo, organizacao: p.organizacao, empresa_id: p.empresaId ?? linha.empresa_id },
      { empresaId: d.empresa.id, cnpjRaiz: d.empresa.cnpjRaiz, estrutura, caminho,
        incompletos: caminhosDela.filter((c) => !c.recomendavel).length, membros, ...resp });
    return { ...p, origem: linha.origem ?? null, posicao, juizo: linhas,
      caminho: caminho ? { rota: caminho.rota, categoria: caminho.categoria, categoriaRotulo: caminho.categoriaRotulo, saltos: caminho.saltos } : null,
      respostas: resp, minhaResposta: d.minhas.get(p.id) ?? null };
  }).sort((a, b) => ORDEM_POSICAO[a.posicao.id] - ORDEM_POSICAO[b.posicao.id]
    || (a.caminho ? categoriaDe(a.caminho.categoria).ordem : 9) - (b.caminho ? categoriaDe(b.caminho.categoria).ordem : 9)
    || a.nome.localeCompare(b.nome, 'pt-BR'));
  const canais = canaisInstitucionais({ atributos: d.atributos, site: d.site, estrutura });
  const passo = proximoPasso({ empresa: d.empresa, pessoas, caminhos: r.caminhos, cobertura: r.cobertura ?? {},
    estrutura, restricao: r.restricao, canais, autor: d.autor });
  // Sanção pública não encerrada não bloqueia o plano, mas vem antes de qualquer mensagem.
  const diligencia = d.diligencia ?? null;
  if (diligencia?.atencao && passo.acao !== 'nao_contatar') {
    const abertas = diligencia.registros.filter((x) => x.situacao !== 'encerrada');
    passo.alerta = `Diligência: ${contar(abertas.length, 'registro', 'registros')} no ${[...new Set(abertas.map((x) => x.cadastro))].join(' e ')} sem encerramento `
      + `(${abertas.slice(0, 2).map((x) => x.categoria.toLowerCase()).join('; ')}${abertas.length > 2 ? '; …' : ''}). Leve ao compliance antes de abordar.`;
  }
  return {
    empresa: { id: d.empresa.id, nome: d.empresa.nome, razaoSocial: d.empresa.razaoSocial ?? null, cnpjRaiz: d.empresa.cnpjRaiz ?? null,
      cidade: d.empresa.cidade ?? null, uf: d.empresa.uf ?? null, subsetor: d.empresa.subsetor ?? null },
    estrutura, pessoas, passo, canais,
    caminhos: r.restricao?.ativa ? [] : r.caminhos.filter((c) => c.recomendavel).slice(0, 3)
      .map((c) => ({ rota: c.rota, categoria: c.categoria, categoriaRotulo: c.categoriaRotulo, categoriaDescricao: c.categoriaDescricao,
        saltos: c.saltos, porque: c.porque, ressalvas: c.ressalvas, alvoId: c.alvo.id })),
    cobertura: r.cobertura, restricao: r.restricao ?? null, restricoesOutras: d.restricoesOutras ?? [], diligencia,
    oportunidades: d.oportunidades ?? [],
    limitacoes: [
      'Nomes do quadro societário só entram no produto pelo recorte decidido pela casa: cargos estatutários e o sócio-administrador das limitadas. Nas demais empresas, quem decide é registrado por alguém da casa, com a fonte.',
      'Cadastro de pessoa não comprova relacionamento: cada ligação exige evidência e confirmação do titular.',
      'Telefone e e-mail do cadastro não são exibidos: costumam ser do escritório contábil, e contato pessoal não é propagado.',
      'Nenhuma mensagem é enviada pelo sistema.',
    ],
  };
}

/** Respostas da passada de reconhecimento por pessoa-alvo, contando só membros ativos da casa. */
export async function respostasPorPessoa(db, ids) {
  if (!ids.length) return new Map();
  const rows = (await db.query(
    `SELECT r.pessoa_alvo_id AS id, count(*)::int AS respostas,
            count(*) FILTER (WHERE r.resposta = 'nao_conheco')::int AS negativas
       FROM rede_reconhecimentos r JOIN rede_pessoas g ON g.id = r.pessoa_ght4_id AND g.ativo AND g.lado = 'ght4'
      WHERE r.pessoa_alvo_id = ANY($1::uuid[]) GROUP BY 1`, [ids])).rows;
  return new Map(rows.map((x) => [x.id, { respostas: x.respostas, negativas: x.negativas }]));
}

/** O que o próprio membro já respondeu sobre cada pessoa (para perguntar "você conhece?" só o que falta). */
export async function minhasRespostas(db, usuarioId, ids) {
  const eu = (await db.query("SELECT id FROM rede_pessoas WHERE lado = 'ght4' AND ativo AND usuario_id = $1", [usuarioId])).rows[0] ?? null;
  if (!eu || !ids.length) return { eu, respostas: new Map() };
  const rows = (await db.query('SELECT pessoa_alvo_id AS id, resposta, versao FROM rede_reconhecimentos WHERE pessoa_ght4_id = $1 AND pessoa_alvo_id = ANY($2::uuid[])',
    [eu.id, ids])).rows;
  return { eu, respostas: new Map(rows.map((x) => [x.id, x.resposta])) };
}

export { normalizar };
