import { interpretarTese } from '../pesquisa/criterios.mjs';
import { senioridadeDe } from '../rede/contratos.mjs';
import { candidatosANome, MAX_EMPRESAS_POR_NOME } from './nomes.mjs';

/* =============================================================================
 *  GHT4 · leitura do pedido de "encontrar quem decide"
 * -----------------------------------------------------------------------------
 *  O `/find` do Lessie recebe o pedido em linguagem natural e o passa literal ao
 *  agente. Aqui o pedido tem três partes, separadas com regras locais (sem IA):
 *    - o PAPEL da pessoa: quem decide a venda, ou cargos da escala da rede;
 *    - o ACESSO: se o membro só quer quem a casa já alcança;
 *    - o resto descreve a EMPRESA e vai inteiro para `interpretarTese`, o mesmo
 *      intérprete da pesquisa por tese (recorte e critérios de cadastro).
 *  Nada é descartado em silêncio: o que não vira papel nem acesso chega ao
 *  intérprete da tese, e cada leitura discutível volta como nota.
 * ========================================================================== */

/** Normaliza preservando o comprimento, para apagar trechos do texto original. */
const mesmoTamanho = (texto) => [...texto].map((c) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()[0] ?? c).join('');
const PREFERENCIA = /(de preferencia|preferencialmente|idealmente|se possivel|desejavel|melhor se|opcional)/;

/* Papéis, do mais específico ao mais genérico: um trecho usado por um papel não
   volta a ser lido pelos seguintes ("diretor financeiro" não vira "diretoria"). */
const PAPEIS = [
  { senioridades: ['cfo'], re: /\b(?:cfos?|diretor(?:es|as|a)? financeir[oa]s?|diretoria financeira|responsave(?:l|is) financeir[oa]s?|head de financas)\b/g },
  { senioridades: ['ceo'], re: /\b(?:ceos?|presidentes?|diretor(?:es|as|a)?[- ](?:presidentes?|gera(?:l|is))|socios?[- ](?:administrador(?:es|as|a)?|gerentes?)|administrador(?:es|as|a)?)\b/g },
  { senioridades: ['conselho'], re: /\b(?:conselheir[oa]s?|membros? do conselho|conselhos? de administracao|conselhos?)\b/g },
  { senioridades: ['conselho', 'ceo', 'cfo', 'diretoria'], re: /\b(?:alta (?:gestao|direcao|administracao|lideranca)|lideranca|c-?level|executiv[oa]s?)\b/g,
    nota: 'Liderança lida como conselho, presidência, financeiro e diretoria.' },
  { senioridades: ['ceo', 'cfo', 'diretoria'], negado: ['diretoria'], re: /\b(?:diretor(?:es|as|a)?|diretoria)\b/g,
    nota: '"Diretores" inclui presidente e financeiro, que no Brasil costumam ser diretores estatutários.' },
  { senioridades: ['gerencia'], re: /\b(?:gerentes?|gerencia|gestor(?:es|as|a)?|coordenador(?:es|as|a)?|heads?)\b/g },
  { decide: true, re: /\b(?:quem (?:decide|manda|controla)|decisor(?:es|as)?|tomador(?:es|as)? de decisao|donos?|donas?|proprietari[oa]s?|controlador(?:es|as)?|acionistas?|socios?|fundador(?:es|as)?)\b/g },
];
/* Dono, sócio e controlador também descrevem a EMPRESA ("sem sócio estrangeiro", "até 3 sócios",
   "empresas de dono"): nesses usos o trecho fica para o intérprete da tese. */
const USO_DA_EMPRESA_DEPOIS = /^\s*(?:e?s?\s*)?(?:estrangeir|pessoas? juridic|pj\b|capitalista|comanditad|minoritari)/;
const USO_DA_EMPRESA_ANTES = /(?:\bate|\bsem|\bnenhum|\bmaximo|\bmais de|\bmenos de|\bpor|\bde|\bdos?|\bdas?|\b\d+)\s+$/;

/* Cargo negado ("sem gerentes", "exceto CEOs", "menos os CFOs") sai do pedido, com a palavra
   da negação: nem vira alternativa positiva, nem sobra um "sem" para o intérprete da tese. */
const NEGACAO_ANTES = /(?:^|[\s,;(])(?:sem|exceto|menos|nao|nem|fora|excluindo|tirando|salvo)\s+(?:(?:os|as|o|a)\s+)?$/;
/* Entre dois cargos, o que continua a lista negada: vírgula, "e", "ou", "nem" e artigo. ", e" fecha a
   oração intercalada ("CEOs, sem gerentes, e CFOs"): o cargo seguinte volta a ser pedido. */
const LISTA_NEGADA = /^\s*(?:,|\be\b|\bou\b|\bnem\b|,\s*nem\b)\s*(?:(?:os|as|o|a)\s+)?$/;

const AREA_DO_CARGO = /^\s+(?:comerciai?s|comercial|industriai?s|industrial|tecnic[oa]s?|juridic[oa]s?|administrativ[oa]s?|operaciona(?:l|is)|de (?:vendas|compras|operacoes|marketing|rh|recursos humanos|pessoas|gente|suprimentos|logistica|produtos?|novos negocios|negocios|qualidade|tecnologia|ti|inovacao|planejamento|estrategia|relacoes com investidores))\b/;

/* Áreas do cargo, com os nomes com que aparecem no cargo escrito: "de RH" atende quem é
   "Diretor de Recursos Humanos". A IA (encontrar/ia.mjs) escolhe a área por esta lista. */
export const AREAS = Object.freeze([
  { id: 'rh', rotulo: 'recursos humanos', termos: ['rh', 'recursos humanos', 'pessoas', 'gente', 'people', 'hr', 'talentos'] },
  { id: 'comercial', rotulo: 'comercial', termos: ['comercial', 'comerciais', 'vendas', 'sales'] },
  { id: 'compras', rotulo: 'compras', termos: ['compras', 'suprimentos', 'procurement', 'purchasing'] },
  { id: 'operacoes', rotulo: 'operações', termos: ['operacoes', 'operacional', 'operacionais', 'industrial', 'industriais', 'producao', 'fabrica'] },
  { id: 'juridico', rotulo: 'jurídico', termos: ['juridico', 'juridica', 'juridicos', 'legal', 'compliance'] },
  { id: 'marketing', rotulo: 'marketing', termos: ['marketing', 'mkt'] },
  { id: 'logistica', rotulo: 'logística', termos: ['logistica', 'supply chain'] },
  { id: 'ti', rotulo: 'tecnologia', termos: ['ti', 'tecnologia', 'sistemas'] },
  { id: 'qualidade', rotulo: 'qualidade', termos: ['qualidade', 'regulatorio', 'regulatorios'] },
  { id: 'tecnica', rotulo: 'técnica', termos: ['tecnico', 'tecnica', 'tecnicos', 'tecnicas', 'pesquisa e desenvolvimento', 'inovacao', 'produto', 'produtos'] },
  { id: 'novos_negocios', rotulo: 'novos negócios', termos: ['novos negocios', 'estrategia', 'planejamento', 'expansao'] },
  { id: 'administrativa', rotulo: 'administrativa', termos: ['administrativo', 'administrativa', 'administrativos', 'administracao'] },
  { id: 'ri', rotulo: 'relações com investidores', termos: ['relacoes com investidores', 'ri'] },
]);
const temTermo = (texto, termo) => new RegExp(`(?:^|[^a-z0-9&])${termo.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}(?:$|[^a-z0-9&])`).test(texto);
/** A área da lista que o texto nomeia ("de RH", "comerciais"), ou null. */
export const areaDoTexto = (texto) => { const t = mesmoTamanho(String(texto ?? '')); return AREAS.find((a) => a.termos.some((x) => temTermo(t, x))) ?? null; };
/** Se o cargo escrito traz a área. */
export const cargoTrazArea = (cargo, area) => { const t = mesmoTamanho(String(cargo ?? '')); return area.termos.some((x) => temTermo(t, x)); };

/* Vários papéis numa lista com "e" ("o CEO e o diretor de RH") pedem um de cada em cada empresa:
   cada papel é um requisito, com a cobertura contada à parte. Com "ou", ou fora de uma lista,
   qualquer um serve, como antes. É o achado do Lessie na §11.5 de PESQUISA-LESSIE-AI.md. */
const LISTA = /^\s*(?:,|\be\b|,\s*e\b)\s*(?:(?:o|a|os|as|um|uma|seu|sua|seus|suas|tambem)\s+)?$/;
/** `n` nulo: quem chama já sabe que é "um de cada" (a IA disse, com o trecho), e o conector não é conferido. */
function requisitosDaLista(achados, n) {
  if (achados.length < 2) return null;
  const ordem = [...achados].sort((a, b) => a.ini - b.ini);
  if (n !== null) {
    let comE = false;
    for (let i = 1; i < ordem.length; i++) {
      const entre = n.slice(ordem[i - 1].fim, ordem[i].ini);
      if (!LISTA.test(entre)) return null;
      if (/\be\b/.test(entre)) comE = true;
    }
    if (!comE) return null;
  }
  const vistos = new Map();
  for (const a of ordem) {
    const chave = `${a.decide ? 'decide' : a.senioridades.join('+')}|${a.area?.id ?? ''}`;
    if (!vistos.has(chave)) vistos.set(chave, requisito(a));
  }
  return vistos.size >= 2 ? [...vistos.values()] : null;
}
/* "Diretores" e "liderança" juntam vários degraus da escala; no rótulo do requisito, o nome do pedido. */
const GRUPOS_DA_ESCALA = [['Liderança', ['ceo', 'cfo', 'conselho', 'diretoria']], ['Diretoria', ['ceo', 'cfo', 'diretoria']]];
function requisito({ decide, senioridades, area }) {
  const chave = [...senioridades].sort().join('+');
  const grupo = GRUPOS_DA_ESCALA.find(([, s]) => s.join('+') === chave)?.[0];
  const base = decide ? 'Quem decide a venda' : grupo ?? senioridades.map((s) => senioridadeDe(s).rotulo).join(' ou ');
  return { rotulo: area ? `${base} · ${area.rotulo}` : base, decide: Boolean(decide), senioridades: decide ? [] : [...senioridades], area: area ?? null };
}

/* Sobra do pedido que parece cargo mas não está na escala da rede ("chefe", "COO", "RH"):
   as regras deixam para a empresa, e é aí que a leitura com IA ajuda. */
const CARGO_FORA_DA_ESCALA = /\b(?:chefes?|lider(?:es)?|responsave(?:l|is)|superintendentes?|vice[- ]presidentes?|vps?|coos?|ctos?|cios?|cmos?|chros?|cpos?|rh|recursos humanos|people|compradores?|encarregad[oa]s?|supervisor(?:es|as|a)?|quem (?:cuida|responde|assina|compra|vende))\b/g;

/* Acesso pela rede da casa. "Introdução" pede mais que "alcança": o titular aceitou apresentar. */
const ACESSOS = [
  { id: 'introducao', re: /\b(?:com (?:apresentacao|introducao)(?: viavel)?|(?:apresentacao|introducao) viavel|que (?:a casa|alguem da casa|nos|a gente|a ght4|eu|algum socio) (?:possa|pode|consiga|consegue) (?:apresentar|introduzir|nos apresentar))\b/g },
  { id: 'com_caminho', re: /\b(?:que (?:a casa|alguem da casa|nos|a gente|a ght4|eu|o time|a equipe) (?:conhec\w*|alcanc\w*|cheg\w*)|que conhecemos|que conheco|com (?:caminho|acesso|ponte|relacao|relacionamento) (?:pela|na|da) (?:rede|casa)|com caminho|alcancave(?:l|is)|acessive(?:l|is)|pela rede|via rede|com quem (?:temos|a casa tem|tenho) (?:relacao|relacionamento|contato))\b/g },
];
/* Palavras do pedido que falam da pessoa e não da empresa; ficam fora da tese. */
const PALAVRAS_DA_PESSOA = /\b(?:pessoas?|nomes?|contatos?|quem|profissionais?|encontr\w*|ach\w*|mape\w*|liste|listar|mostre|mostrar)\b/g;

export const ACESSO_ROTULO = Object.freeze({ com_caminho: 'A casa chega até ela', introducao: 'Há introdução viável pela casa' });

/** Onde o trecho citado está no pedido normalizado (maiúsculas e acentos não contam), ou -1. */
export const posicaoDoTrecho = (n, trecho) => {
  const t = mesmoTamanho(String(trecho ?? '').trim());
  return t.length >= 2 ? n.indexOf(t) : -1;
};
export { mesmoTamanho };

/**
 * Lê o pedido. Sem papel no texto, procura quem decide a venda, com nota.
 *
 * Empresa pelo nome em duas leituras: a primeira devolve os `candidatos` (trechos que parecem
 * nome ou CNPJ); quem chama os confere no catálogo (`resolverNomes`) e lê de novo com `nomes`.
 * Na segunda, o trecho aceito sai da tese e as empresas voltam em `empresas`.
 *
 * Com `ia` (a leitura da IA já conferida por `validarLeituraIA`), papel, acesso e critérios da
 * empresa vêm dela, cada item preso a um trecho literal do pedido; nome de empresa e recorte
 * continuam pelas regras, sobre o que sobra.
 *
 * @param {{ referencia?: string, municipios?: Set<string>|null, nomes?: object[]|null, ia?: object|null }} [opcoes]
 * @returns {{ pedido: string, papel: {decide: boolean, senioridades: string[], rotulo: string, padrao: boolean, trechos: string[],
 *   requisitos: object[]|null}, acesso: {exigido: 'com_caminho'|'introducao'|null, obrigatorio: boolean, trecho: string|null},
 *   recorte: object, criterios: object[], notas: string[], candidatos: object[], empresas: {trecho: string, empresas: object[]}[],
 *   modo: 'regras'|'ia', ambiguidades: string[] }}
 */
export function interpretarPedido(texto, { referencia, municipios = null, nomes = null, ia = null } = {}) {
  const original = String(texto || '').slice(0, 2000);
  const n = mesmoTamanho(original);
  const usados = [];
  const livre = (ini, fim) => !usados.some(([a, b]) => ini < b && fim > a);
  const notas = [];
  const senioridades = new Set();
  const excluidas = new Set();
  const areas = [];
  let decide = false;
  const trechos = [];
  // Cada papel lido, com a posição: uma lista com "e" vira um requisito por papel.
  const achados = [];

  if (ia) {
    // A IA já foi conferida: cada trecho existe no pedido. Aqui só se marca o que cada um ocupa.
    for (const p of ia.papeis) {
      const ini = posicaoDoTrecho(n, p.trecho), fim = ini + mesmoTamanho(p.trecho.trim()).length;
      if (ini < 0 || !livre(ini, fim)) continue;
      usados.push([ini, fim]); trechos.push(original.slice(ini, fim));
      p.senioridades.forEach((s) => senioridades.add(s));
      const area = p.area ? AREAS.find((a) => a.id === p.area) : null;
      if (area) areas.push({ texto: area.rotulo, area: area.id, senioridades: p.senioridades });
      achados.push({ ini, fim, senioridades: p.senioridades, decide: false, area });
    }
    if (ia.decide) {
      const ini = posicaoDoTrecho(n, ia.decide), fim = ini + mesmoTamanho(ia.decide.trim()).length;
      if (ini >= 0 && livre(ini, fim)) { usados.push([ini, fim]); trechos.push(original.slice(ini, fim)); decide = true; achados.push({ ini, fim, senioridades: [], decide: true }); }
    }
    for (const x of ia.excluidas) {
      const ini = posicaoDoTrecho(n, x.trecho), fim = ini + mesmoTamanho(x.trecho.trim()).length;
      if (ini < 0 || !livre(ini, fim)) continue;
      usados.push([ini, fim]);
      x.senioridades.forEach((s) => excluidas.add(s));
    }
  }

  /* Primeiro os trechos de cada papel, do mais específico ao mais genérico (o trecho usado não
     volta a ser lido); depois, na ordem do texto, o alcance da negação: "exceto CEOs e gerentes"
     nega os dois, porque a lista continua a negação até outra palavra separar os cargos. */
  const lidos = [];
  for (const papel of ia ? [] : PAPEIS) {
    for (const m of n.matchAll(papel.re)) {
      const ini = m.index, fim = m.index + m[0].length;
      if (!livre(ini, fim)) continue;
      if (papel.decide && /socio|dono|controlador|acionista/.test(m[0])
        && (USO_DA_EMPRESA_DEPOIS.test(n.slice(fim, fim + 30)) || USO_DA_EMPRESA_ANTES.test(n.slice(Math.max(0, ini - 14), ini)))) continue;
      const negacao = papel.decide ? null : n.slice(Math.max(0, ini - 20), ini).match(NEGACAO_ANTES);
      if (negacao) {
        usados.push([ini - negacao[0].replace(/^[\s,;(]/, '').length, fim]);
        lidos.push({ papel, ini, fim, ate: fim, negado: true, area: null });
        continue;
      }
      // A área do cargo ("gerentes comerciais") acompanha o papel: a rede guarda o nível, e a área
      // é conferida no cargo escrito de cada pessoa (triagem.mjs).
      const area = papel.decide ? null : n.slice(fim).match(AREA_DO_CARGO);
      const ate = fim + (area ? area[0].length : 0);
      usados.push([ini, ate]);
      lidos.push({ papel, ini, fim, ate, negado: false, area });
    }
  }
  lidos.sort((a, b) => a.ini - b.ini);
  lidos.forEach((x, i) => {
    const antes = lidos[i - 1];
    if (!x.negado && !x.papel.decide && antes?.negado && LISTA_NEGADA.test(n.slice(antes.ate, x.ini))) x.negado = true;
  });
  for (const { papel, ini, fim, ate, negado, area } of lidos) {
    // Negado, "diretores" tira a diretoria, não o presidente nem o financeiro que ela incluiria.
    if (negado) { (papel.negado ?? papel.senioridades).forEach((s) => excluidas.add(s)); continue; }
    trechos.push(original.slice(ini, ate));
    if (papel.decide) decide = true;
    else papel.senioridades.forEach((s) => senioridades.add(s));
    if (papel.nota) notas.push(papel.nota);
    const textoDaArea = area ? original.slice(fim, ate).trim() : null;
    const daLista = area ? areaDoTexto(textoDaArea) : null;
    if (area) areas.push({ texto: textoDaArea, area: daLista?.id ?? null, senioridades: papel.senioridades });
    achados.push({ ini, fim: ate, senioridades: papel.decide ? [] : papel.senioridades, decide: Boolean(papel.decide),
      area: area ? (daLista ?? { id: null, rotulo: textoDaArea, termos: [] }) : null });
  }
  for (const s of excluidas) senioridades.delete(s);
  if (excluidas.size) notas.push(`Fora do pedido: ${[...excluidas].map((s) => senioridadeDe(s).rotulo).join(', ')}. Quem tem esse cargo vai para "Fora do pedido".`);
  if (areas.length) notas.push(`A área do cargo (${areas.map((a) => `"${a.texto}"`).join(', ')}) não está no cadastro da rede: é conferida no cargo escrito de cada pessoa, e quem não a tem fica para revisar.`);
  const requisitos = ia ? (ia.cadaUm && achados.length >= 2 ? requisitosDaLista(achados, null) : null) : requisitosDaLista(achados, n);
  if (requisitos) notas.push(`O pedido lista ${requisitos.length} papéis com "e": cada um é procurado em cada empresa, com a cobertura contada à parte. Para aceitar qualquer um deles, escreva "ou".`);

  let acesso = { exigido: null, obrigatorio: false, trecho: null };
  if (ia?.acesso) {
    const ini = posicaoDoTrecho(n, ia.acesso.trecho), fim = ini + mesmoTamanho(ia.acesso.trecho.trim()).length;
    if (ini >= 0 && livre(ini, fim)) {
      usados.push([ini, fim]);
      acesso = { exigido: ia.acesso.exigido, obrigatorio: ia.acesso.obrigatorio, trecho: original.slice(ini, fim) };
    }
  }
  for (const a of ia ? [] : ACESSOS) {
    for (const m of n.matchAll(a.re)) {
      const ini = m.index, fim = m.index + m[0].length;
      if (!livre(ini, fim)) continue;
      usados.push([ini, fim]);
      // A exigência mais forte vale: introdução contém "a casa chega".
      if (!acesso.exigido || acesso.exigido === 'com_caminho') {
        const oracao = n.slice(Math.max(0, n.lastIndexOf(',', ini - 1)), (n.indexOf(',', fim) + 1 || n.length + 1) - 1);
        acesso = { exigido: acesso.exigido === 'introducao' ? 'introducao' : a.id, obrigatorio: !PREFERENCIA.test(oracao), trecho: original.slice(ini, fim) };
      }
    }
  }

  // Empresa pelo nome: o pedido propõe, o catálogo confirma (nomes.mjs).
  const candidatos = nomes ? [] : candidatosANome(original, n, livre, municipios);
  const empresas = [], semEmpresa = [];
  for (const nome of nomes ?? []) {
    if (!livre(nome.ini, nome.fim)) continue;
    const trecho = original.slice(nome.ini, nome.fim);
    if (nome.cnpj || nome.empresas.length) {
      usados.push([nome.ini, nome.fim]);
      empresas.push({ trecho, empresas: nome.empresas });
    } else semEmpresa.push(trecho);
    if (nome.cnpj && !nome.empresas.length) notas.push(`O CNPJ ${trecho.replace(/^cnpj(?:\s+raiz)?\s*:?\s*/i, '')} não está no catálogo de químicos da GHT4.`);
    else if (nome.empresas.length > 1) notas.push(`"${trecho}" corresponde a ${nome.empresas.length} empresas do catálogo; todas entram na busca.`);
    else if (nome.motivo === 'demais') notas.push(`"${trecho}" corresponde a mais de ${MAX_EMPRESAS_POR_NOME} empresas do catálogo e foi lido como descrição. Use o nome completo ou o CNPJ.`);
    else if (nome.motivo === 'fora' && nome.maiuscula) notas.push(`"${trecho}" não corresponde a uma empresa do catálogo de químicos e foi lido como descrição. Confira a grafia ou use o CNPJ.`);
  }

  const padrao = !decide && !senioridades.size;
  if (padrao) {
    decide = true;
    notas.push('O pedido não diz o cargo: procurei quem decide a venda, pela estrutura societária de cada empresa. Quem só influencia aparece para revisão.');
  }
  const rotulos = [...senioridades].map((s) => senioridadeDe(s).rotulo);
  const exceto = excluidas.size ? `, exceto ${[...excluidas].map((s) => senioridadeDe(s).rotulo).join(', ')}` : '';
  const rotulo = requisitos ? `Um de cada: ${requisitos.map((r) => r.rotulo).join('; ')}${exceto}`
    : [decide ? 'Quem decide a venda' : null, ...rotulos].filter(Boolean).join(' ou ') + exceto;

  // O resto é a empresa: apaga papel, acesso e palavras da pessoa, e lê como tese.
  let resto = '';
  for (let i = 0; i < original.length; i++) resto += usados.some(([a, b]) => i >= a && i < b) ? ' ' : original[i];
  const restoN = mesmoTamanho(resto);
  for (const m of restoN.matchAll(PALAVRAS_DA_PESSOA)) resto = resto.slice(0, m.index) + ' '.repeat(m[0].length) + resto.slice(m.index + m[0].length);
  const textoDaEmpresa = resto.replace(/\s+/g, ' ').replace(/^[\s,;:.-]+|[\s,;:-]+$/g, '').trim();
  const tese = interpretarTese(textoDaEmpresa, { referencia, municipios });
  // A nota de "não identifiquei critérios" fala da tese; aqui o pedido pode ser só sobre a pessoa.
  // A tela do find não tem o seletor "Recorte" da pesquisa: o subsetor muda pelo próprio pedido.
  // Palavra solta de um nome que o catálogo não achou já tem a nota do nome.
  const doNome = (x) => semEmpresa.some((t) => t.includes(x.match(/^"([^"]+)" não virou critério/)?.[1] ?? '\u0000'));
  // Com a empresa citada pelo nome, o subsetor não recorta nada (buscar.mjs): as notas dele saem.
  const notasTese = tese.notas.filter((x) => !/^Não identifiquei critérios/.test(x) && !doNome(x) && !(empresas.length && /subsetor/.test(x)))
    .map((x) => x.replace(/\s*(?:Troque|Escolha um) em "Recorte"[^.]*\./, ' Para outro subsetor, cite-o no pedido.'));
  if (tese.frente) notas.push(`"Frente de ${tese.frente}" não muda quem decide: a busca é a mesma para compra e venda.`);
  /* "De fabricantes de tintas", com o recorte já em Tintas, não pede site nenhum: o recorte
     responde. Só o critério de pesquisa feito apenas de tipo de empresa e de palavras do
     subsetor escolhido sai; "de solventes" ou "controle familiar" ficam. */
  /* Com a IA, os critérios da empresa são os dela (já conferidos contra o pedido), menos os que
     caem num trecho de papel, acesso ou nome, e a UF única que o recorte já aplica. O recorte
     (UF, subsetor) continua das regras, que são exatas, como na pesquisa por tese. */
  const daTese = ia ? ia.criterios.filter((c) => {
    const ini = posicaoDoTrecho(n, c.trecho);
    if (ini >= 0 && !livre(ini, ini + mesmoTamanho(c.trecho.trim()).length)) return false;
    return !(c.regra?.campo === 'uf' && c.regra.valor.length === 1 && tese.filtros.uf === c.regra.valor[0]);
  }) : tese.criterios;
  const criterios = daTese.filter((c) => {
    if (c.tipo !== 'pesquisa' || !cobertoPeloRecorte(c.texto, tese.filtros.subsetor)) return true;
    notas.push(`"${c.texto}" já está no recorte (${tese.filtros.subsetor}) e não virou critério.`);
    return false;
  });
  if (ia) notas.unshift('Pedido lido com a IA: cada papel, acesso e critério abaixo vem de um trecho do próprio pedido. O recorte e o nome de empresa continuam pelas regras.', ...ia.notas);

  return {
    pedido: original,
    papel: { decide, senioridades: [...senioridades], excluidas: [...excluidas], areas, rotulo, padrao, trechos, requisitos },
    acesso,
    recorte: tese.filtros,
    criterios,
    // A parte do pedido que descreve a empresa: é o que segue para a pesquisa por tese.
    tese: textoDaEmpresa,
    notas: [...new Set([...notas, ...notasTese])],
    candidatos,
    empresas,
    modo: ia ? 'ia' : 'regras',
    // O que as regras não souberam ler: é o que a leitura com IA pode resolver.
    ambiguidades: ia ? [] : ambiguidades(textoDaEmpresa, [...notas, ...notasTese]),
  };
}

/** Trechos que as regras não leram com segurança, em frases curtas para a tela. */
function ambiguidades(textoDaEmpresa, notas) {
  const lista = [];
  const n = mesmoTamanho(textoDaEmpresa);
  const cargos = [...new Set([...n.matchAll(CARGO_FORA_DA_ESCALA)].map((m) => textoDaEmpresa.slice(m.index, m.index + m[0].length)))];
  if (cargos.length) lista.push(`${cargos.map((c) => `"${c}"`).join(', ')} ${cargos.length === 1 ? 'parece cargo' : 'parecem cargos'}, mas não ${cargos.length === 1 ? 'está' : 'estão'} na escala da rede (conselho, presidência, financeiro, diretoria, gerência). Ficou como descrição da empresa.`);
  for (const nota of notas) if (/não virou critério\. Se for a cidade|não corresponde a uma empresa do catálogo/.test(nota)) lista.push(nota);
  return lista;
}

const LIGACAO = /^(?:de|da|do|das|dos|e|em|no|na|nos|nas|para|com|que|produtos?|quimic\w*)$/;
const TIPO_DE_EMPRESA = /^(?:distribuid\w*|distribuicao|trading\w*|revend\w*|atacad\w*|importador\w*|fabric\w*|produtor\w*|industri\w*|manufatur\w*|formulador\w*|empresas?|companhias?)$/;
function cobertoPeloRecorte(texto, subsetor) {
  if (!subsetor || subsetor === 'todos') return false;
  const doRotulo = mesmoTamanho(subsetor).split(/[^a-z]+/).filter((w) => w.length >= 4);
  const palavras = mesmoTamanho(texto).split(/[^a-z0-9]+/).filter(Boolean);
  return palavras.length > 0 && palavras.every((w) => LIGACAO.test(w) || TIPO_DE_EMPRESA.test(w)
    || (w.length >= 4 && doRotulo.some((r) => r.slice(0, 5) === w.slice(0, 5))));
}
