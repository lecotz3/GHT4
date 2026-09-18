import { filtrarMembroDaRede } from '../seguranca/rbac.mjs';
import {
  senioridadeDe, tipoDe, forcaDe, disposicaoDe, categoriaDe, categoriaDoCaminho,
  normalizar, MESES_CONFIRMACAO, MAXIMO_LIGACOES,
} from './contratos.mjs';

/* =============================================================================
 *  GHT4 · caminhos de acesso à liderança
 * -----------------------------------------------------------------------------
 *  A pergunta que este módulo responde é estreita e prática: para falar com
 *  quem decide nesta empresa, quem da casa liga, por meio de quem, e com que
 *  assunto?
 *
 *  O QUE ELE NÃO FAZ
 *  Não descobre pessoas. O catálogo cadastral não traz sócio, diretor nem
 *  contato — nada. Tudo aqui foi digitado por alguém da casa que conhece a
 *  relação. Uma empresa sem ninguém cadastrado devolve lista vazia, e isso
 *  significa "a casa ainda não mapeou", nunca "não há a quem recorrer".
 *  Confundir as duas coisas faria o agente desaconselhar uma abordagem por
 *  ignorância própria, que é o pior conselho possível.
 *
 *  DUAS LIGAÇÕES, NÃO MAIS
 *  O plano de relações limita a busca a duas ligações entre pessoas. Cada salto
 *  a mais multiplica suposições, e ninguém liga para o conhecido do conhecido de
 *  um conhecido pedindo apresentação. Cada ligação precisa da sua própria
 *  evidência: trabalhar na mesma empresa não prova que duas pessoas se conhecem,
 *  e o programa nunca inventa a ligação que falta.
 *
 *  A CATEGORIA VEM DA PIOR LIGAÇÃO
 *  Um caminho herda a fragilidade do elo menos comprovado. Uma cadeia com uma
 *  ponta confirmada e outra por confirmar é um caminho a confirmar — apresentá-lo
 *  como relação confirmada seria prometer uma porta que talvez não abra.
 * ========================================================================== */

const COLUNAS = Object.freeze(['id', 'lado', 'nome', 'cargo', 'senioridade', 'organizacao',
  'empresa_id', 'usuario_id', 'email', 'telefone', 'linkedin', 'observacoes', 'ativo']);

const comoPessoa = (r) => ({
  id: r.id, lado: r.lado, nome: r.nome, cargo: r.cargo,
  senioridade: r.senioridade, senioridadeRotulo: senioridadeDe(r.senioridade).rotulo,
  organizacao: r.organizacao, empresaId: r.empresa_id ?? null,
  usuarioId: r.usuario_id ?? null, ativo: r.ativo,
  email: r.email, telefone: r.telefone, linkedin: r.linkedin, observacoes: r.observacoes ?? '',
});

const mesesDesde = (data) => {
  if (!data) return null;
  const d = data instanceof Date ? data : new Date(data);
  if (!Number.isFinite(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
};
const dataTexto = (d) => d ? (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10) : null;

/** Pessoas do mercado desta empresa: pelo vínculo com o catálogo ou pelo nome da organização. */
export async function pessoasDaEmpresa(db, { empresaId = null, nomeEmpresa = '' }) {
  const organizacao = normalizar(nomeEmpresa);
  if (!empresaId && !organizacao) return [];
  return (await db.query(
    `SELECT ${COLUNAS.join(',')} FROM rede_pessoas
      WHERE lado = 'mercado' AND ativo
        AND (($1::text IS NOT NULL AND empresa_id = $1)
          OR ($2::text <> '' AND organizacao_normalizada = $2))
      ORDER BY nome, id`, [empresaId, organizacao])).rows;
}

const LIMITE_ARESTAS = 20000;

/**
 * Caminhos de acesso, do mais apresentável ao menos.
 *
 * @param {object} db
 * @param {{empresaId?: string|null, nomeEmpresa?: string, escopo?: string|null, usuario?: object|null}} opcoes
 */
export async function caminhosDeAcesso(db, { empresaId = null, nomeEmpresa = '', escopo = null, usuario = null } = {}) {
  const alvos = await pessoasDaEmpresa(db, { empresaId, nomeEmpresa });
  const restricao = escopo && empresaId
    ? (await db.query('SELECT ativa,categoria,motivo FROM crm_restricoes_contato WHERE escopo=$1 AND empresa_id=$2',
      [escopo, empresaId])).rows[0] ?? null
    : null;

  const cobertura = {
    fontesConectadas: ['Rede interna cadastrada pela própria casa'],
    fontesNaoConectadas: ['LinkedIn e Sales Navigator', 'E-mail e agenda corporativos', 'CRM externo'],
    consultada: true,
  };
  const limitacoes = [
    'A rede é conhecimento da casa, digitado por quem o tem. O cadastro público não informa dirigentes nem contatos, e nada aqui foi descoberto automaticamente.',
    'Uma empresa sem pessoas cadastradas significa que a casa ainda não mapeou essa empresa — não que não haja a quem recorrer.',
    'A empresa é reconhecida pelo vínculo explícito com o catálogo ou pelo nome da organização escrito igual. Grafias diferentes da mesma empresa não se encontram sozinhas.',
    `A busca vai até ${MAXIMO_LIGACOES} ligações entre pessoas, e cada ligação exige evidência própria. Trabalhar na mesma organização não prova uma relação entre duas pessoas.`,
    'Raiz de CNPJ agrupa matriz e filiais. Grupo econômico com raízes distintas exige evidência própria e não é deduzido aqui.',
  ];

  const vazio = {
    empresaId, nomeEmpresa, caminhos: [], semCaminho: [],
    pessoasConhecidas: alvos.length,
    lideresConhecidos: alvos.filter((a) => senioridadeDe(a.senioridade).lideranca).length,
    restricao, cobertura, limitacoes,
  };
  if (!alvos.length) return vazio;

  /* O piloto trabalha com dezenas de pessoas; carregar as arestas ativas de uma
     vez custa menos que duas rodadas de ida e volta ao banco, e deixa a busca
     inteira legível num lugar só. O teto existe para que um crescimento
     inesperado apareça como aviso, não como lentidão silenciosa. */
  const arestas = (await db.query(
    `SELECT v.id,v.pessoa_a_id,v.pessoa_b_id,v.tipo,v.forca,v.periodo,v.evidencia,v.disposicao,
            v.confirmado_em, c.nome AS confirmado_por_nome
       FROM rede_vinculos v
       JOIN rede_pessoas pa ON pa.id = v.pessoa_a_id AND pa.ativo
       JOIN rede_pessoas pb ON pb.id = v.pessoa_b_id AND pb.ativo
       LEFT JOIN usuarios c ON c.id = v.confirmado_por
      WHERE v.ativo ORDER BY v.id LIMIT ${LIMITE_ARESTAS + 1}`)).rows;
  if (arestas.length > LIMITE_ARESTAS) {
    limitacoes.push(`A rede passou de ${LIMITE_ARESTAS} vínculos e esta leitura considerou apenas os primeiros. Avise quem mantém o sistema.`);
    arestas.length = LIMITE_ARESTAS;
  }
  if (!arestas.length) return { ...vazio, semCaminho: alvos.map((a) => filtrarMembroDaRede(comoPessoa(a), usuario)) };

  const envolvidos = [...new Set(arestas.flatMap((a) => [a.pessoa_a_id, a.pessoa_b_id]))];
  const pessoas = new Map((await db.query(
    `SELECT ${COLUNAS.join(',')} FROM rede_pessoas WHERE id = ANY($1::uuid[])`, [envolvidos])).rows
    .map((r) => [r.id, r]));

  // Adjacência não direcionada: conhecer é recíproco, e o par é guardado ordenado.
  const vizinhos = new Map();
  const ligar = (de, para, aresta) => {
    if (!vizinhos.has(de)) vizinhos.set(de, []);
    vizinhos.get(de).push({ outro: para, aresta });
  };
  for (const a of arestas) { ligar(a.pessoa_a_id, a.pessoa_b_id, a); ligar(a.pessoa_b_id, a.pessoa_a_id, a); }

  const daCasa = [...pessoas.values()].filter((p) => p.lado === 'ght4');
  const idsAlvo = new Set(alvos.map((a) => a.id));
  const brutos = [];
  const vistos = new Set();

  const registrar = (cadeia, ligacoes) => {
    const chave = cadeia.map((p) => p.id).join('>');
    if (vistos.has(chave)) return;
    vistos.add(chave);
    brutos.push({ cadeia, ligacoes });
  };

  for (const origem of daCasa) {
    if (idsAlvo.has(origem.id)) continue;
    for (const passo1 of vizinhos.get(origem.id) ?? []) {
      const meio = pessoas.get(passo1.outro);
      if (!meio) continue;
      if (idsAlvo.has(meio.id)) { registrar([origem, meio], [passo1.aresta]); continue; }
      if (MAXIMO_LIGACOES < 2) continue;
      for (const passo2 of vizinhos.get(meio.id) ?? []) {
        const fim = pessoas.get(passo2.outro);
        // Nem voltar para a origem, nem contar a mesma pessoa duas vezes.
        if (!fim || fim.id === origem.id || fim.id === meio.id || !idsAlvo.has(fim.id)) continue;
        registrar([origem, meio, fim], [passo1.aresta, passo2.aresta]);
      }
    }
  }

  const caminhos = brutos.map(({ cadeia, ligacoes }) => {
    const alvo = cadeia.at(-1);
    const senioridade = senioridadeDe(alvo.senioridade);
    const categoria = categoriaDe(categoriaDoCaminho(ligacoes.map((l) => l.disposicao)));

    const detalhes = ligacoes.map((l, i) => {
      const de = cadeia[i], para = cadeia[i + 1];
      const meses = mesesDesde(l.confirmado_em);
      const d = disposicaoDe(l.disposicao);
      return {
        id: l.id, de: de.nome, para: para.nome,
        tipo: l.tipo, tipoRotulo: tipoDe(l.tipo).rotulo, frase: tipoDe(l.tipo).frase,
        forca: l.forca, forcaRotulo: forcaDe(l.forca).rotulo, forcaExplicacao: forcaDe(l.forca).explicacao,
        periodo: l.periodo, evidencia: l.evidencia,
        disposicao: l.disposicao, disposicaoRotulo: d.rotulo,
        confirmadoEm: dataTexto(l.confirmado_em), confirmadoPor: l.confirmado_por_nome ?? null,
        recente: meses !== null && meses <= MESES_CONFIRMACAO,
      };
    });

    /* Herdar a fragilidade da ligação menos comprovada vale também para a
       força: uma cadeia é tão boa quanto o seu elo mais fraco. */
    const forcaMinima = Math.min(...detalhes.map((l) => forcaDe(l.forca).peso));
    const todasRecentes = detalhes.every((l) => l.recente);
    const saltos = detalhes.length;
    const parcelas = {
      senioridade: senioridade.peso,
      vinculo: forcaMinima,
      confirmacao: todasRecentes ? 2 : 0,
      ligacoes: saltos > 1 ? -2 : 0,
    };
    const pontuacao = parcelas.senioridade + parcelas.vinculo + parcelas.confirmacao + parcelas.ligacoes;

    const ressalvas = [];
    for (const l of detalhes) {
      if (l.disposicao === 'nao_intermediar') ressalvas.push(`${l.de} conhece ${l.para}, mas não quer intermediar. Não usar este caminho sem falar com ${l.de}.`);
      else if (l.disposicao === 'desatualizado') ressalvas.push(`${l.de} avisou que a informação sobre ${l.para} está desatualizada.`);
      else if (l.disposicao === 'nao_confirmado') ressalvas.push(`A ligação ${l.de} → ${l.para} ainda não foi confirmada pelo titular. Perguntar antes de prometer a apresentação.`);
      else if (!l.recente) ressalvas.push(`${l.de} → ${l.para}: confirmado em ${l.confirmadoEm}, há mais de ${MESES_CONFIRMACAO} meses. Vale checar se segue de pé.`);
      if (l.forca === 'fraca') ressalvas.push(`${l.de} → ${l.para}: há um ponto em comum, não um relacionamento. Tratar como abertura fria com contexto.`);
    }
    if (!senioridade.lideranca) ressalvas.push('O cargo está fora da alta liderança: serve como porta de entrada para quem decide, não como decisor.');
    if (saltos > 1) ressalvas.push(`O caminho passa por ${cadeia[1].nome}, que não é da GHT4. Confirmar com ${cadeia[0].nome} se essa via é plausível antes de contar com ela.`);

    const rota = cadeia.map((p) => `${p.nome}${p.cargo ? ` (${p.cargo})` : ''}`).join(' → ');
    const porque = `${rota}. ` + detalhes.map((l) => `${l.de} e ${l.para} ${l.frase}${l.periodo ? ` ${l.periodo}` : ''}; ${l.evidencia}`).join(' ');

    return {
      alvo: filtrarMembroDaRede(comoPessoa(alvo), usuario),
      ght4: filtrarMembroDaRede(comoPessoa(cadeia[0]), usuario),
      intermediario: saltos > 1 ? filtrarMembroDaRede(comoPessoa(cadeia[1]), usuario) : null,
      rota, ligacoes: detalhes, saltos,
      categoria: categoria.id, categoriaRotulo: categoria.rotulo, categoriaDescricao: categoria.descricao,
      recomendavel: categoria.id !== 'incompleto',
      pontuacao, parcelas, porque, ressalvas,
    };
  });

  /* Categoria primeiro, porque é o que o plano pede que se leia. A pontuação só
     desempata dentro da mesma categoria, e o resto da ordem existe para que duas
     chamadas iguais devolvam a mesma lista — lista que dança na tela não se lê. */
  caminhos.sort((a, b) => categoriaDe(a.categoria).ordem - categoriaDe(b.categoria).ordem
    || b.pontuacao - a.pontuacao
    || a.saltos - b.saltos
    || a.alvo.nome.localeCompare(b.alvo.nome, 'pt-BR')
    || a.ght4.nome.localeCompare(b.ght4.nome, 'pt-BR'));

  const alcancados = new Set(caminhos.map((c) => c.alvo.id));
  return {
    ...vazio,
    caminhos,
    semCaminho: alvos.filter((a) => !alcancados.has(a.id)).map((a) => filtrarMembroDaRede(comoPessoa(a), usuario)),
    limitacoes,
  };
}
