import { createHash } from 'node:crypto';
import { SUBSETOR, normalizar, LIMITE_RECORTE } from './catalogo.mjs';
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
  return {
    async buscar({ busca = '', uf = '', municipio = '', comEvento = false, ordem = 'enquadramento', incluirPossiveis = false, limite = 12, offset = 0, catalogoHash, cnae = '' } = {}) {
      if (!Number.isInteger(limite) || limite < 0 || limite > 1000 || !Number.isInteger(offset) || offset < 0) throw new Error('Paginação inválida.');
      const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
      // Seleção ou ordem que dependem de sinais vivos: a continuação também carrega a versão deles.
      const dependeDeSinais = ordem === 'prioridade' || Boolean(comEvento);
      const { rows } = await db.query(`WITH atual AS (
        SELECT p.*, s.referencia FROM catalogo_controle cc
        JOIN catalogo_publicacoes p ON p.snapshot_id=cc.snapshot_id
        JOIN snapshots_universo s ON s.id=p.snapshot_id AND s.estado='pronto'
      ), filtradas AS (
        SELECT 'cnpj'||trim(e.cnpj_raiz) AS id, r.nome, r.razao_social AS "razaoSocial",
          trim(e.cnpj_raiz) AS "cnpjRaiz", r.cidade, r.uf, r.cnae_principal AS "cnaePrincipal",
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
        WHERE c.subsetor=$1 AND c.estado<>'excluida' AND ($2::boolean OR c.estado<>'possivel')
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
      FROM atual a`, [SUBSETOR, incluirPossiveis, uf, cnae, termos, limite, offset, normalizarMunicipio(municipio), Boolean(comEvento), MESES_EVENTO_RECENTE]);
      const r = rows[0];
      if (!r) throw new Error('O catálogo ainda não foi importado no banco.');
      /* Prioridade e "com evento" dependem de eventos e rede, que mudam sem nova publicação.
         Se mudaram desde a primeira página, a seguinte poderia pular ou repetir empresas:
         a busca recomeça em vez de continuar. Sem essa dependência, vale o hash cadastral. */
      const hashPaginacao = dependeDeSinais ? createHash('sha256').update(`${r.hash}|${r.sinais}`).digest('hex') : r.hash;
      if (catalogoHash && catalogoHash !== hashPaginacao) {
        const e = new Error(dependeDeSinais ? 'Eventos ou relações mudaram desde a primeira página. Inicie uma nova busca para não pular empresas.'
          : 'O catálogo foi atualizado. Inicie uma nova busca.');
        e.codigo = 'base_atualizada'; throw e;
      }
      return { empresas: r.empresas, total: r.total, offset, limite,
        proximoOffset: offset + limite < r.total ? offset + limite : null,
        cobertura: { receitaApurada: 0, intencaoApurada: 0, classificacao: r.total, universo: r.total },
        referencia: r.referencia, hash: r.hash, hashPaginacao, totalOrigem: r.total_origem,
        fonte: 'Receita Federal · CNPJ', subsetor: SUBSETOR };
    },
    /** Universo de uma pesquisa por tese, com os atributos públicos gravados na importação. */
    async recorte({ busca = '', uf = '', incluirPossiveis = false, cnae = '' } = {}) {
      const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
      const { rows } = await db.query(`WITH atual AS (
        SELECT p.*, s.referencia FROM catalogo_controle cc
        JOIN catalogo_publicacoes p ON p.snapshot_id=cc.snapshot_id
        JOIN snapshots_universo s ON s.id=p.snapshot_id AND s.estado='pronto'
      ), filtradas AS (
        SELECT 'cnpj'||trim(e.cnpj_raiz) AS id, r.nome, r.razao_social AS "razaoSocial",
          trim(e.cnpj_raiz) AS "cnpjRaiz", r.cidade, r.uf, r.cnae_principal AS "cnaePrincipal",
          c.estado, c.motivo, a.referencia, r.ordem,
          CASE WHEN r.atributos = '{}'::jsonb THEN NULL ELSE r.atributos END AS atributos
        FROM atual a JOIN catalogo_registros r ON r.snapshot_id=a.snapshot_id
        JOIN entidades_juridicas e ON e.id=r.entidade_id
        JOIN classificacoes_subsetor c ON c.snapshot_id=r.snapshot_id AND c.entidade_id=r.entidade_id
        WHERE c.subsetor=$1 AND c.estado<>'excluida' AND ($2::boolean OR c.estado<>'possivel')
          AND ($3='' OR r.uf=ANY(string_to_array($3,','))) AND ($4='' OR r.cnae_principal=$4)
          AND NOT EXISTS (SELECT 1 FROM unnest($5::text[]) AS t(termo) WHERE strpos(r.busca_normalizada,t.termo)=0)
      )
      SELECT a.hash, a.referencia, (SELECT count(*)::int FROM filtradas) AS total,
        COALESCE((SELECT jsonb_agg(to_jsonb(f)-'ordem' ORDER BY f.ordem) FROM (SELECT * FROM filtradas ORDER BY ordem LIMIT $6) f),'[]'::jsonb) AS empresas
      FROM atual a`, [SUBSETOR, incluirPossiveis, uf, cnae, termos, LIMITE_RECORTE]);
      const r = rows[0];
      if (!r) throw new Error('O catálogo ainda não foi importado no banco.');
      return { empresas: r.empresas, total: r.total, truncado: r.total > LIMITE_RECORTE, referencia: r.referencia,
        hash: r.hash, fonte: 'Receita Federal · CNPJ', subsetor: SUBSETOR };
    },
    async obter(id) {
      if (!/^cnpj\d{8}$/.test(id)) return null;
      const r = await this.buscar({ busca: id.slice(4), incluirPossiveis: true, limite: 1000 });
      return r.empresas.find(e => e.id === id) ?? null;
    },
  };
}
