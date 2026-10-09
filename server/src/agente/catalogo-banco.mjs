import { createHash } from 'node:crypto';
import { normalizar, LIMITE_RECORTE, escopoSubsetores, rotuloEscopo, validarPagina } from './catalogo.mjs';
import { normalizarMunicipio } from './filtros.mjs';
import { MESES_EVENTO_RECENTE, SQL_EVENTO_PUBLICO } from './eventos.mjs';

// Sem extensão unaccent: acentos são removidos por tabela fixa, igual a normalizarMunicipio.
const SEM_ACENTO = `translate(lower(r.cidade),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn')`;

/* Ordens fixas (nunca texto do usuário no SQL). A de prioridade é lexicográfica e
   explicável: cada critério só desempata o anterior, sem pesos escondidos. */
const ORDENS = {
  enquadramento: 'ordem',
  prioridade: '"eventoRecente" DESC, "relacaoConfirmada" DESC, ("pessoasMapeadas">0) DESC, ordem',
};

/* Versão dos sinais vivos (eventos e rede) que mudam sem nova publicação do cadastro.
   Calculada DENTRO da mesma instrução da página: uma instrução vê um só snapshot, então
   página, contagem e versão descrevem os mesmos dados. Supõe que toda escrita relevante
   insere evento (id novo) ou altera versao/atualizado_em em rede_pessoas/rede_vinculos. */
const SQL_SINAIS = `current_date::text
  ||'|'||(SELECT count(*)||'.'||coalesce(max(id),0) FROM eventos_corporativos)
  ||'|'||(SELECT count(*)||'.'||coalesce(sum(versao),0)||'.'||coalesce(max(atualizado_em)::text,'') FROM rede_vinculos)
  ||'|'||(SELECT count(*)||'.'||coalesce(sum(versao),0)||'.'||coalesce(max(atualizado_em)::text,'') FROM rede_pessoas)`;

// Uma consulta SQL fixa o snapshot para contagem e página, mesmo durante importações.
// Os filtros são parâmetros; '%' e '_' em um nome não se tornam curingas SQL.
export function criarCatalogoBanco(db) {
  let municipiosDaPublicacao = null;
  return {
    /** Municípios das sedes na publicação vigente, normalizados (ver catalogo.mjs). Guardados por
     *  publicação: a lista só muda quando o catálogo é reimportado. */
    async municipios() {
      const atual = (await db.query('SELECT snapshot_id FROM catalogo_controle WHERE id=TRUE')).rows[0]?.snapshot_id;
      if (!atual) return new Set();
      if (municipiosDaPublicacao?.snapshot !== atual) {
        const { rows } = await db.query('SELECT DISTINCT cidade FROM catalogo_registros WHERE snapshot_id=$1', [atual]);
        municipiosDaPublicacao = { snapshot: atual, nomes: new Set(rows.map((r) => normalizarMunicipio(r.cidade)).filter(Boolean)) };
      }
      return municipiosDaPublicacao.nomes;
    },
    async buscar({ busca = '', uf = '', municipio = '', comEvento = false, ordem = 'enquadramento', incluirPossiveis = false, limite = 12, offset = 0, catalogoHash, cnae = '', subsetor } = {}) {
      if (!Number.isInteger(limite) || limite < 0 || limite > 1000 || !Number.isInteger(offset) || offset < 0) throw new Error('Paginação inválida.');
      const escopo = escopoSubsetores(subsetor);
      const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
      // Seleção ou ordem que dependem de sinais vivos: a continuação também carrega a versão deles.
      const dependeDeSinais = ordem === 'prioridade' || Boolean(comEvento);
      const { rows } = await db.query(`WITH atual AS (
        SELECT p.*, s.referencia FROM catalogo_controle cc
        JOIN catalogo_publicacoes p ON p.snapshot_id=cc.snapshot_id
        JOIN snapshots_universo s ON s.id=p.snapshot_id AND s.estado='pronto'
      ), filtradas AS (
        SELECT 'cnpj'||trim(e.cnpj_raiz) AS id, r.nome, r.razao_social AS "razaoSocial",
          trim(e.cnpj_raiz) AS "cnpjRaiz", r.cidade, r.uf, r.cnae_principal AS "cnaePrincipal", c.subsetor,
          c.estado, c.motivo, NULL::numeric AS receita, 'Não apurada'::text AS "intencaoDeTransacao",
          a.referencia, r.ordem, r.entidade_id,
          EXISTS (SELECT 1 FROM eventos_corporativos ev WHERE ev.entidade_id=r.entidade_id AND ev.tipo<>'outro'
            AND ev.detectado_em >= (current_date - make_interval(months => $10::int))) AS "eventoRecente",
          -- As duas pontas precisam estar ativas, como em caminhosDeAcesso. Relação confirmada
          -- não é caminho utilizável: o caminho ainda avalia recomendação e atualidade.
          EXISTS (SELECT 1 FROM rede_pessoas rp JOIN rede_vinculos v ON v.ativo AND rp.id IN (v.pessoa_a_id,v.pessoa_b_id)
            AND v.disposicao IN ('conheco','posso_apresentar')
            JOIN rede_pessoas outra ON outra.ativo AND outra.id=CASE WHEN v.pessoa_a_id=rp.id THEN v.pessoa_b_id ELSE v.pessoa_a_id END
            WHERE rp.lado='mercado' AND rp.ativo AND rp.empresa_id='cnpj'||trim(e.cnpj_raiz)) AS "relacaoConfirmada",
          (SELECT count(*)::int FROM rede_pessoas rp WHERE rp.lado='mercado' AND rp.ativo AND rp.empresa_id='cnpj'||trim(e.cnpj_raiz)) AS "pessoasMapeadas"
        FROM atual a JOIN catalogo_registros r ON r.snapshot_id=a.snapshot_id
        JOIN entidades_juridicas e ON e.id=r.entidade_id
        JOIN classificacoes_subsetor c ON c.snapshot_id=r.snapshot_id AND c.entidade_id=r.entidade_id
        WHERE c.subsetor=ANY($1::text[]) AND c.estado<>'excluida' AND ($2::boolean OR c.estado<>'possivel')
          AND ($3='' OR r.uf=ANY(string_to_array($3,','))) AND ($4='' OR r.cnae_principal=$4)
          AND ($8='' OR regexp_replace(${SEM_ACENTO},'\\s+',' ','g')=$8)
          AND NOT EXISTS (SELECT 1 FROM unnest($5::text[]) AS t(termo) WHERE strpos(r.busca_normalizada,t.termo)=0)
          AND (NOT $9::boolean OR EXISTS (SELECT 1 FROM eventos_corporativos ev WHERE ev.entidade_id=r.entidade_id
            AND ev.tipo<>'outro' AND ev.detectado_em >= (current_date - make_interval(months => $10::int))))
      ), pagina AS (SELECT f.*, COALESCE((SELECT jsonb_agg(${SQL_EVENTO_PUBLICO} ORDER BY ev.detectado_em DESC, ev.id)
          FROM (SELECT * FROM eventos_corporativos ev WHERE ev.entidade_id=f.entidade_id AND ev.tipo<>'outro' ORDER BY ev.detectado_em DESC, ev.id LIMIT 3) ev),'[]'::jsonb) AS eventos
        FROM filtradas f ORDER BY ${ORDENS[ordem] ?? ORDENS.enquadramento} LIMIT $6 OFFSET $7)
      SELECT a.hash, a.referencia, a.total_origem, (SELECT count(*)::int FROM filtradas) AS total,
        ${dependeDeSinais ? SQL_SINAIS : 'NULL::text'} AS sinais,
        COALESCE((SELECT jsonb_agg(to_jsonb(p)-'ordem'-'entidade_id' ORDER BY ${ORDENS[ordem] ?? ORDENS.enquadramento}) FROM pagina p),'[]'::jsonb) AS empresas
      FROM atual a`, [escopo, incluirPossiveis, uf, cnae, termos, limite, offset, normalizarMunicipio(municipio), Boolean(comEvento), MESES_EVENTO_RECENTE]);
      const r = rows[0];
      if (!r) throw new Error('O catálogo ainda não foi importado no banco.');
      /* Prioridade e "com evento" dependem de eventos e rede, que mudam sem nova publicação.
         Se mudaram desde a primeira página, a seguinte poderia pular ou repetir empresas:
         a busca recomeça em vez de continuar. Sem essa dependência, vale o hash cadastral. */
      // O escopo de subsetores entra sempre: outra lista de subsetores não continua a página.
      const hashPaginacao = createHash('sha256').update(`${r.hash}|${escopo.join(',')}${dependeDeSinais ? `|${r.sinais}` : ''}`).digest('hex');
      if (catalogoHash && catalogoHash !== hashPaginacao) {
        const e = new Error(dependeDeSinais ? 'Eventos ou relações mudaram desde a primeira página. Inicie uma nova busca para não pular empresas.'
          : 'O catálogo foi atualizado. Inicie uma nova busca.');
        e.codigo = 'base_atualizada'; throw e;
      }
      return { empresas: r.empresas, total: r.total, offset, limite,
        proximoOffset: offset + limite < r.total ? offset + limite : null,
        cobertura: { receitaApurada: 0, intencaoApurada: 0, classificacao: r.total, universo: r.total },
        referencia: r.referencia, hash: r.hash, hashPaginacao, totalOrigem: r.total_origem,
        fonte: 'Receita Federal · CNPJ', subsetor: rotuloEscopo(escopo), subsetores: escopo };
    },
    /** Universo de uma pesquisa por tese, com os atributos públicos gravados na importação.
     *  Com `hash`, o recorte é o da publicação com esse hash (registros publicados são imutáveis
     *  e não são apagados), e `null` se ela não existir; sem ele, o da publicação vigente.
     *  Em páginas por `ordem` (a posição no arquivo importado, única na publicação): `proximo` é
     *  a ordem da última empresa da página, e a seguinte começa depois dela. Quem lê várias
     *  páginas repete o `hash` da primeira, para não misturar publicações. */
    async recorte({ busca = '', uf = '', incluirPossiveis = false, cnae = '', subsetor } = {}, { hash = null, apos = null, limite = LIMITE_RECORTE } = {}) {
      validarPagina(apos, limite);
      const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
      const escopo = escopoSubsetores(subsetor);
      const { rows } = await db.query(`WITH atual AS (
        SELECT p.*, s.referencia FROM catalogo_publicacoes p
        JOIN snapshots_universo s ON s.id=p.snapshot_id AND s.estado='pronto'
        WHERE CASE WHEN $7::text IS NULL THEN p.snapshot_id=(SELECT snapshot_id FROM catalogo_controle WHERE id=TRUE) ELSE p.hash=$7 END
      ), filtradas AS (
        SELECT 'cnpj'||trim(e.cnpj_raiz) AS id, r.nome, r.razao_social AS "razaoSocial",
          trim(e.cnpj_raiz) AS "cnpjRaiz", r.cidade, r.uf, r.cnae_principal AS "cnaePrincipal", c.subsetor,
          c.estado, c.motivo, a.referencia, r.ordem,
          CASE WHEN r.atributos = '{}'::jsonb THEN NULL ELSE r.atributos END AS atributos
        FROM atual a JOIN catalogo_registros r ON r.snapshot_id=a.snapshot_id
        JOIN entidades_juridicas e ON e.id=r.entidade_id
        JOIN classificacoes_subsetor c ON c.snapshot_id=r.snapshot_id AND c.entidade_id=r.entidade_id
        WHERE c.subsetor=ANY($1::text[]) AND c.estado<>'excluida' AND ($2::boolean OR c.estado<>'possivel')
          AND ($3='' OR r.uf=ANY(string_to_array($3,','))) AND ($4='' OR r.cnae_principal=$4)
          AND NOT EXISTS (SELECT 1 FROM unnest($5::text[]) AS t(termo) WHERE strpos(r.busca_normalizada,t.termo)=0)
      ), pagina AS (
        SELECT * FROM filtradas WHERE $8::int IS NULL OR ordem>$8 ORDER BY ordem LIMIT $6::int+1
      ), lida AS (SELECT * FROM pagina ORDER BY ordem LIMIT $6)
      SELECT a.hash, a.referencia, (SELECT count(*)::int FROM filtradas) AS total,
        (SELECT count(*) FROM pagina) > $6 AS mais, (SELECT max(ordem) FROM lida) AS ultima,
        COALESCE((SELECT jsonb_agg(to_jsonb(f)-'ordem' ORDER BY f.ordem) FROM lida f),'[]'::jsonb) AS empresas
      FROM atual a`, [escopo, incluirPossiveis, uf, cnae, termos, limite, hash, apos]);
      const r = rows[0];
      if (!r && hash) return null;
      if (!r) throw new Error('O catálogo ainda não foi importado no banco.');
      return { empresas: r.empresas, total: r.total, truncado: r.mais, proximo: r.mais ? r.ultima : null, referencia: r.referencia,
        hash: r.hash, fonte: 'Receita Federal · CNPJ', subsetor: rotuloEscopo(escopo) };
    },
    async obter(id) {
      if (!/^cnpj\d{8}$/.test(id)) return null;
      const r = await this.buscar({ busca: id.slice(4), incluirPossiveis: true, limite: 1000 });
      return r.empresas.find(e => e.id === id) ?? null;
    },
  };
}
