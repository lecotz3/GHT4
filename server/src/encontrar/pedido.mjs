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
  { senioridades: ['ceo', 'cfo', 'diretoria'], re: /\b(?:diretor(?:es|as|a)?|diretoria)\b/g,
    nota: '"Diretores" inclui presidente e financeiro, que no Brasil costumam ser diretores estatutários.' },
  { senioridades: ['gerencia'], re: /\b(?:gerentes?|gerencia|gestor(?:es|as|a)?|coordenador(?:es|as|a)?|heads?)\b/g },
  { decide: true, re: /\b(?:quem (?:decide|manda|controla)|decisor(?:es|as)?|tomador(?:es|as)? de decisao|donos?|donas?|proprietari[oa]s?|controlador(?:es|as)?|acionistas?|socios?|fundador(?:es|as)?)\b/g },
];
/* Dono, sócio e controlador também descrevem a EMPRESA ("sem sócio estrangeiro", "até 3 sócios",
   "empresas de dono"): nesses usos o trecho fica para o intérprete da tese. */
const USO_DA_EMPRESA_DEPOIS = /^\s*(?:e?s?\s*)?(?:estrangeir|pessoas? juridic|pj\b|capitalista|comanditad|minoritari)/;
const USO_DA_EMPRESA_ANTES = /(?:\bate|\bsem|\bnenhum|\bmaximo|\bmais de|\bmenos de|\bpor|\bde|\bdos?|\bdas?|\b\d+)\s+$/;

const AREA_DO_CARGO = /^\s+(?:comerciai?s|comercial|industriai?s|industrial|tecnic[oa]s?|juridic[oa]s?|administrativ[oa]s?|operaciona(?:l|is)|de (?:vendas|compras|operacoes|marketing|rh|recursos humanos|suprimentos|logistica|produtos?|novos negocios|negocios|qualidade|tecnologia|ti|inovacao|planejamento|estrategia|relacoes com investidores))\b/;

/* Acesso pela rede da casa. "Introdução" pede mais que "alcança": o titular aceitou apresentar. */
const ACESSOS = [
  { id: 'introducao', re: /\b(?:com (?:apresentacao|introducao)(?: viavel)?|(?:apresentacao|introducao) viavel|que (?:a casa|alguem da casa|nos|a gente|a ght4|eu|algum socio) (?:possa|pode|consiga|consegue) (?:apresentar|introduzir|nos apresentar))\b/g },
  { id: 'com_caminho', re: /\b(?:que (?:a casa|alguem da casa|nos|a gente|a ght4|eu|o time|a equipe) (?:conhec\w*|alcanc\w*|cheg\w*)|que conhecemos|que conheco|com (?:caminho|acesso|ponte|relacao|relacionamento) (?:pela|na|da) (?:rede|casa)|com caminho|alcancave(?:l|is)|acessive(?:l|is)|pela rede|via rede|com quem (?:temos|a casa tem|tenho) (?:relacao|relacionamento|contato))\b/g },
];
/* Palavras do pedido que falam da pessoa e não da empresa; ficam fora da tese. */
const PALAVRAS_DA_PESSOA = /\b(?:pessoas?|nomes?|contatos?|quem|profissionais?|encontr\w*|ach\w*|mape\w*|liste|listar|mostre|mostrar)\b/g;

export const ACESSO_ROTULO = Object.freeze({ com_caminho: 'A casa chega até ela', introducao: 'Há introdução viável pela casa' });

/**
 * Lê o pedido. Sem papel no texto, procura quem decide a venda, com nota.
 *
 * Empresa pelo nome em duas leituras: a primeira devolve os `candidatos` (trechos que parecem
 * nome ou CNPJ); quem chama os confere no catálogo (`resolverNomes`) e lê de novo com `nomes`.
 * Na segunda, o trecho aceito sai da tese e as empresas voltam em `empresas`.
 *
 * @param {{ referencia?: string, municipios?: Set<string>|null, nomes?: object[]|null }} [opcoes]
 * @returns {{ pedido: string, papel: {decide: boolean, senioridades: string[], rotulo: string, padrao: boolean, trechos: string[]},
 *   acesso: {exigido: 'com_caminho'|'introducao'|null, obrigatorio: boolean, trecho: string|null},
 *   recorte: object, criterios: object[], notas: string[], candidatos: object[], empresas: {trecho: string, empresas: object[]}[] }}
 */
export function interpretarPedido(texto, { referencia, municipios = null, nomes = null } = {}) {
  const original = String(texto || '').slice(0, 2000);
  const n = mesmoTamanho(original);
  const usados = [];
  const livre = (ini, fim) => !usados.some(([a, b]) => ini < b && fim > a);
  const notas = [];
  const senioridades = new Set();
  let decide = false;
  const trechos = [];

  for (const papel of PAPEIS) {
    for (const m of n.matchAll(papel.re)) {
      const ini = m.index, fim = m.index + m[0].length;
      if (!livre(ini, fim)) continue;
      if (papel.decide && /socio|dono|controlador|acionista/.test(m[0])
        && (USO_DA_EMPRESA_DEPOIS.test(n.slice(fim, fim + 30)) || USO_DA_EMPRESA_ANTES.test(n.slice(Math.max(0, ini - 14), ini)))) continue;
      // A área do cargo ("gerentes comerciais") acompanha o papel: a escala da rede é por nível.
      const area = papel.decide ? null : n.slice(fim).match(AREA_DO_CARGO);
      const ate = fim + (area ? area[0].length : 0);
      usados.push([ini, ate]);
      trechos.push(original.slice(ini, ate));
      if (papel.decide) decide = true;
      else papel.senioridades.forEach((s) => senioridades.add(s));
      if (papel.nota) notas.push(papel.nota);
      if (area) notas.push(`A área do cargo ("${original.slice(fim, ate).trim()}") não está no cadastro da rede: a busca usa o nível do cargo.`);
    }
  }

  let acesso = { exigido: null, obrigatorio: false, trecho: null };
  for (const a of ACESSOS) {
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
  const rotulo = [decide ? 'Quem decide a venda' : null, ...rotulos].filter(Boolean).join(' ou ');

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
  const criterios = tese.criterios.filter((c) => {
    if (c.tipo !== 'pesquisa' || !cobertoPeloRecorte(c.texto, tese.filtros.subsetor)) return true;
    notas.push(`"${c.texto}" já está no recorte (${tese.filtros.subsetor}) e não virou critério.`);
    return false;
  });

  return {
    pedido: original,
    papel: { decide, senioridades: [...senioridades], rotulo, padrao, trechos },
    acesso,
    recorte: tese.filtros,
    criterios,
    // A parte do pedido que descreve a empresa: é o que segue para a pesquisa por tese.
    tese: textoDaEmpresa,
    notas: [...new Set([...notas, ...notasTese])],
    candidatos,
    empresas,
  };
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
