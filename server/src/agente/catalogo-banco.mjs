import { SUBSETOR, normalizar } from './catalogo.mjs';

// Uma consulta SQL fixa o snapshot para contagem e página, mesmo durante importações.
// Os filtros são parâmetros; '%' e '_' em um nome não se tornam curingas SQL.
export function criarCatalogoBanco(db) {
  return {
    async buscar({ busca = '', uf = '', incluirPossiveis = false, limite = 12, offset = 0, catalogoHash, cnae = '' } = {}) {
      if (!Number.isInteger(limite) || limite < 0 || limite > 1000 || !Number.isInteger(offset) || offset < 0) throw new Error('Paginação inválida.');
      const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
      const { rows } = await db.query(`WITH atual AS (
        SELECT p.*, s.referencia FROM catalogo_controle cc
        JOIN catalogo_publicacoes p ON p.snapshot_id=cc.snapshot_id
        JOIN snapshots_universo s ON s.id=p.snapshot_id AND s.estado='pronto'
      ), filtradas AS (
        SELECT 'cnpj'||trim(e.cnpj_raiz) AS id, r.nome, r.razao_social AS "razaoSocial",
          trim(e.cnpj_raiz) AS "cnpjRaiz", r.cidade, r.uf, r.cnae_principal AS "cnaePrincipal",
          c.estado, c.motivo, NULL::numeric AS receita, 'Não apurada'::text AS "intencaoDeTransacao",
          a.referencia, r.ordem
        FROM atual a JOIN catalogo_registros r ON r.snapshot_id=a.snapshot_id
        JOIN entidades_juridicas e ON e.id=r.entidade_id
        JOIN classificacoes_subsetor c ON c.snapshot_id=r.snapshot_id AND c.entidade_id=r.entidade_id
        WHERE c.subsetor=$1 AND c.estado<>'excluida' AND ($2::boolean OR c.estado<>'possivel')
          AND ($3='' OR r.uf=$3) AND ($4='' OR r.cnae_principal=$4)
          AND NOT EXISTS (SELECT 1 FROM unnest($5::text[]) AS t(termo) WHERE strpos(r.busca_normalizada,t.termo)=0)
      ), pagina AS (SELECT * FROM filtradas ORDER BY ordem LIMIT $6 OFFSET $7)
      SELECT a.hash, a.referencia, a.total_origem, (SELECT count(*)::int FROM filtradas) AS total,
        COALESCE((SELECT jsonb_agg(to_jsonb(p)-'ordem' ORDER BY p.ordem) FROM pagina p),'[]'::jsonb) AS empresas
      FROM atual a`, [SUBSETOR, incluirPossiveis, uf, cnae, termos, limite, offset]);
      const r = rows[0];
      if (!r) throw new Error('O catálogo ainda não foi importado no banco.');
      if (catalogoHash && catalogoHash !== r.hash) {
        const e = new Error('O catálogo foi atualizado. Inicie uma nova busca.'); e.codigo = 'base_atualizada'; throw e;
      }
      return { empresas: r.empresas, total: r.total, offset, limite,
        proximoOffset: offset + limite < r.total ? offset + limite : null,
        cobertura: { receitaApurada: 0, intencaoApurada: 0, classificacao: r.total, universo: r.total },
        referencia: r.referencia, hash: r.hash, totalOrigem: r.total_origem };
    },
    async obter(id) {
      if (!/^cnpj\d{8}$/.test(id)) return null;
      const r = await this.buscar({ busca: id.slice(4), incluirPossiveis: true, limite: 1000 });
      return r.empresas.find(e => e.id === id) ?? null;
    },
  };
}
