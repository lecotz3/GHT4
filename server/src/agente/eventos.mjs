/**
 * Eventos societários detectados pela diferença entre dois meses do CNPJ
 * (`ferramentas/eventos-cnpj.mjs` gera `data-eventos.js`). O registro público
 * afirma o FATO — o quadro mudou, o capital subiu — e não a INTENÇÃO; por isso
 * cada evento viaja com a sua ambiguidade e nunca vira "quer vender".
 */

/* O detector compara QUANTIDADES de sócios (total e PJ) entre dois meses, não
   identidades nem participação. Troca de sócios com o mesmo número não aparece, e
   entrada de PJ não prova que ela assumiu o controle. Por isso o rótulo exibido é
   definido aqui, pelo que o dado mede, e não pelo texto do arquivo gerado. */
const LIMITE_QUADRO = 'A comparação usa a quantidade de sócios, não quem são: trocas com o mesmo número de sócios não aparecem.';

/** Tipo da ferramenta → categoria em `eventos_corporativos.tipo`, confiança e rótulo do que foi medido. */
export const TIPOS_EVENTO = Object.freeze({
  aquisicao_provavel: { tipo: 'mudanca_controle', confianca: 0.4, rotulo: 'Entrou sócio pessoa jurídica no quadro', limite: LIMITE_QUADRO },
  mudanca_quadro_societario: { tipo: 'mudanca_controle', confianca: 0.4, rotulo: 'Número de sócios mudou', limite: LIMITE_QUADRO },
  entrada_capital_estrangeiro: { tipo: 'mudanca_controle', confianca: 0.6, rotulo: 'Passou a constar sócio no exterior' },
  aumento_de_capital: { tipo: 'mudanca_capital', confianca: 0.6, rotulo: 'Capital social aumentou de forma relevante' },
  expansao_geografica: { tipo: 'expansao_geografica', confianca: 0.6, rotulo: 'Passou a ter estabelecimento em UF nova' },
  saiu_de_ativa: { tipo: 'outro', confianca: 0.8, rotulo: 'Deixou a situação cadastral ativa' },
  entrada_no_escopo: { tipo: 'outro', confianca: 0.5, rotulo: 'Passou a constar no recorte químico' },
  saida_do_escopo: { tipo: 'outro', confianca: 0.5, rotulo: 'Deixou de constar no recorte químico' },
});
/** Janela do filtro "com evento recente", em meses. */
export const MESES_EVENTO_RECENTE = 12;

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const texto = (v, max) => {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string' || v.length > max || v.includes('\0')) throw new Error('Evento com texto inválido.');
  return v;
};

/** Lê o arquivo gerado sem executá-lo: só o literal JSON depois de `const EVENTOS_CNPJ =`. */
export function lerFonteEventos(conteudo) {
  const inicio = conteudo.indexOf('const EVENTOS_CNPJ = ');
  if (inicio < 0) throw new Error('Arquivo de eventos sem EVENTOS_CNPJ.');
  const corpo = conteudo.slice(inicio + 'const EVENTOS_CNPJ = '.length);
  const fim = corpo.indexOf(';\n');
  const dados = JSON.parse(fim < 0 ? corpo.trim().replace(/;$/, '') : corpo.slice(0, fim));
  if (!MES.test(dados?.de) || !MES.test(dados?.ate) || dados.de >= dados.ate || !Array.isArray(dados.eventos)) throw new Error('Período ou lista de eventos inválidos.');
  const eventos = dados.eventos.map((e, i) => {
    if (!/^\d{8}$/.test(String(e?.base ?? ''))) throw new Error(`Evento ${i + 1}: raiz de CNPJ inválida.`);
    if (!TIPOS_EVENTO[e.tipo]) throw new Error(`Evento ${i + 1}: tipo desconhecido.`);
    texto(e.rotulo, 200);
    const t = TIPOS_EVENTO[e.tipo];
    return { base: e.base, tipo: e.tipo, rotulo: t.rotulo, detalhe: texto(e.detalhe, 500),
      ambiguidade: [texto(e.ambiguidade, 600), t.limite].filter(Boolean).join(' ') };
  });
  return { de: dados.de, ate: dados.ate, eventos };
}

/**
 * Grava os eventos ligando-os às empresas já conhecidas. Reimportar o mesmo período
 * não duplica (índice único da migração 0018). Evento de empresa fora do cadastro é
 * contado e ignorado: sem entidade não há onde mostrá-lo.
 */
export async function importarEventos(db, { texto: conteudo }) {
  const { de, ate, eventos } = lerFonteEventos(conteudo);
  const periodo = `${de}..${ate}`;
  return db.transaction(async (tx) => {
    let importados = 0;
    for (let i = 0; i < eventos.length; i += 500) {
      const lote = eventos.slice(i, i + 500).map((e) => ({ ...e, categoria: TIPOS_EVENTO[e.tipo].tipo, confianca: TIPOS_EVENTO[e.tipo].confianca }));
      const r = await tx.query(`WITH x AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(base text,tipo text,rotulo text,detalhe text,ambiguidade text,categoria text,confianca numeric))
        INSERT INTO eventos_corporativos (entidade_id,tipo,ocorrido_em,detectado_em,metodo,descricao,detalhes,confianca,fonte)
        SELECT e.id,x.categoria,NULL,$2::date,'diferenca_snapshot',x.rotulo,
          jsonb_build_object('tipoOrigem',x.tipo,'rotulo',x.rotulo,'detalhe',x.detalhe,'ambiguidade',x.ambiguidade,'periodo',$3::text,'de',$4::text,'ate',$5::text),
          x.confianca,'rfb_cnpj'
        FROM x JOIN entidades_juridicas e ON e.cnpj_raiz=x.base
        ON CONFLICT DO NOTHING RETURNING id`, [JSON.stringify(lote), `${ate}-01`, periodo, de, ate]);
      importados += r.rows.length;
    }
    const bases = [...new Set(eventos.map((e) => e.base))];
    const conhecidas = new Set((await tx.query('SELECT cnpj_raiz FROM entidades_juridicas WHERE cnpj_raiz = ANY($1::text[])', [bases])).rows.map((r) => r.cnpj_raiz));
    const ligaveis = eventos.filter((e) => conhecidas.has(e.base)).length;
    return { periodo, total: eventos.length, importados, jaExistentes: ligaveis - importados,
      foraDoCadastro: eventos.length - ligaveis };
  });
}

/** Forma pública de um evento gravado, para o agente e a ficha. */
export const SQL_EVENTO_PUBLICO = `jsonb_build_object('tipo',ev.detalhes->>'tipoOrigem','categoria',ev.tipo,'rotulo',ev.descricao,
  'detalhe',ev.detalhes->>'detalhe','ambiguidade',ev.detalhes->>'ambiguidade','de',ev.detalhes->>'de','ate',ev.detalhes->>'ate',
  'detectadoEm',ev.detectado_em::text,'fonte','Receita Federal · CNPJ (diferença entre meses)')`;
