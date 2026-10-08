/* Monitoramento semanal de tese. Não há agendador: a verificação vencida roda quando a
   pessoa abre o Meu dia (POST /api/monitoramentos/verificar), que é onde as novidades
   aparecem. Refaz só o funil cadastral sobre o catálogo vigente: nenhum site é lido e
   nenhuma IA é chamada. O que muda vira novidade até a pessoa abrir a pesquisa. */

export const SEMANA = "interval '7 days'";
/** Falha ao verificar: tenta de novo em uma hora, em vez de perder a semana. */
const NOVA_TENTATIVA = "interval '1 hour'";
/** Teto de novidades gravadas por verificação; o total vai no resultado. */
const MAX_NOVIDADES = 200;
const NOMES_NO_RESULTADO = 10;

const MAIOR_EVENTO = 'SELECT COALESCE(max(id),0)::bigint AS n FROM eventos_corporativos';

/** Liga ou desliga. Ligar grava a linha de base: as empresas que a pessoa já viu na pesquisa. */
export async function definirMonitoramento(db, { pesquisaId, usuarioId, ativo }) {
  return db.transaction(async (tx) => {
    if (!ativo) {
      return (await tx.query('UPDATE monitoramentos_tese SET ativo=FALSE WHERE pesquisa_id=$1 RETURNING *', [pesquisaId])).rows[0] ?? null;
    }
    const conhecidas = (await tx.query('SELECT array_agg(empresa_id ORDER BY empresa_id) AS ids FROM pesquisa_itens WHERE pesquisa_id=$1', [pesquisaId])).rows[0].ids ?? [];
    const ultimo = (await tx.query(MAIOR_EVENTO)).rows[0].n;
    // Religar refaz a linha de base: o que estava na pesquisa até agora é conhecido.
    return (await tx.query(`INSERT INTO monitoramentos_tese (pesquisa_id,usuario_id,ativo,conhecidas,ultimo_evento,proxima_em)
        VALUES ($1,$2,TRUE,$3,$4,now()+${SEMANA})
      ON CONFLICT (pesquisa_id) DO UPDATE SET ativo=TRUE, conhecidas=CASE WHEN monitoramentos_tese.ativo THEN monitoramentos_tese.conhecidas ELSE EXCLUDED.conhecidas END,
        ultimo_evento=CASE WHEN monitoramentos_tese.ativo THEN monitoramentos_tese.ultimo_evento ELSE EXCLUDED.ultimo_evento END,
        proxima_em=CASE WHEN monitoramentos_tese.ativo THEN monitoramentos_tese.proxima_em ELSE EXCLUDED.proxima_em END
      RETURNING *`, [pesquisaId, usuarioId, conhecidas, ultimo])).rows[0];
  });
}

/** O estado público do monitoramento, para o detalhe da pesquisa. */
export const publico = (m) => m ? { ativo: m.ativo, verificadoEm: m.verificado_em, proximaEm: m.proxima_em, ultimoResultado: m.ultimo_resultado ?? null } : null;

/**
 * Verifica até `limite` monitoramentos vencidos da pessoa. Cada um é reivindicado com
 * `FOR UPDATE SKIP LOCKED` e já recebe a próxima data: duas abas abrindo o Meu dia ao
 * mesmo tempo não verificam a mesma pesquisa duas vezes.
 */
export async function verificarVencidos(db, motor, usuarioId, { limite = 2 } = {}) {
  const feitos = [];
  for (let i = 0; i < limite; i++) {
    const m = (await db.query(`UPDATE monitoramentos_tese SET proxima_em=now()+${SEMANA}
      WHERE pesquisa_id=(SELECT pesquisa_id FROM monitoramentos_tese WHERE usuario_id=$1 AND ativo AND proxima_em<=now()
        ORDER BY proxima_em LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [usuarioId])).rows[0];
    if (!m) break;
    try { feitos.push(await verificar(db, motor, m)); }
    catch {
      await db.query(`UPDATE monitoramentos_tese SET proxima_em=now()+${NOVA_TENTATIVA} WHERE pesquisa_id=$1`, [m.pesquisa_id]);
      feitos.push({ pesquisaId: m.pesquisa_id, falhou: true });
    }
  }
  return feitos;
}

async function verificar(db, motor, m) {
  const pesquisa = (await db.query('SELECT * FROM pesquisas_tese WHERE id=$1', [m.pesquisa_id])).rows[0];
  // Fora de qualquer transação: o recorte é uma consulta grande (ver motor.calcular).
  const { itens } = await motor.calcular(pesquisa);
  const conhecidas = new Set(m.conhecidas);
  const novas = itens.filter((i) => !conhecidas.has(i.empresa_id));
  const ultimo = (await db.query(MAIOR_EVENTO)).rows[0].n;
  // Evento novo em empresa da pesquisa (já vista ou nova agora); só o mais recente de cada uma.
  const eventos = (await db.query(`SELECT DISTINCT ON (x.empresa_id) x.empresa_id, x.nome, ev.descricao
      FROM (SELECT empresa_id, empresa->>'nome' AS nome FROM pesquisa_itens WHERE pesquisa_id=$1
            UNION SELECT u.id, u.nome FROM unnest($4::text[], $5::text[]) AS u(id, nome)) x
      JOIN entidades_juridicas e ON 'cnpj'||trim(e.cnpj_raiz)=x.empresa_id
      JOIN eventos_corporativos ev ON ev.entidade_id=e.id AND ev.tipo<>'outro' AND ev.id>$2 AND ev.id<=$3
      ORDER BY x.empresa_id, ev.id DESC`,
  [m.pesquisa_id, m.ultimo_evento, ultimo, novas.map((i) => i.empresa_id), novas.map((i) => i.empresa.nome)])).rows;
  const resultado = {
    verificadoEm: new Date().toISOString(), totalNovas: novas.length, totalEventos: eventos.length,
    novas: novas.slice(0, NOMES_NO_RESULTADO).map((i) => ({ id: i.empresa_id, nome: i.empresa.nome, aderencia: i.aderencia })),
    eventos: eventos.slice(0, NOMES_NO_RESULTADO).map((e) => ({ id: e.empresa_id, nome: e.nome, rotulo: e.descricao })),
  };
  await db.transaction(async (tx) => {
    const linhas = [
      ...novas.slice(0, MAX_NOVIDADES).map((i) => ({ empresa_id: i.empresa_id, tipo: 'nova', empresa: { id: i.empresa_id, nome: i.empresa.nome, cidade: i.empresa.cidade, uf: i.empresa.uf }, detalhe: `Aderência ${i.aderencia}%` })),
      ...eventos.slice(0, MAX_NOVIDADES).map((e) => ({ empresa_id: e.empresa_id, tipo: 'evento', empresa: { id: e.empresa_id, nome: e.nome }, detalhe: e.descricao })),
    ];
    if (linhas.length) {
      await tx.query(`INSERT INTO monitoramento_novidades (pesquisa_id,empresa_id,tipo,empresa,detalhe)
        SELECT $1,x.empresa_id,x.tipo,x.empresa,x.detalhe FROM jsonb_to_recordset($2::jsonb) AS x(empresa_id text, tipo text, empresa jsonb, detalhe text)`,
      [m.pesquisa_id, JSON.stringify(linhas)]);
    }
    // A linha de base avança: o que foi avisado não volta a ser novidade.
    await tx.query(`UPDATE monitoramentos_tese SET conhecidas=ARRAY(SELECT DISTINCT unnest(conhecidas || $2::text[]) ORDER BY 1),
        ultimo_evento=GREATEST(ultimo_evento,$3), verificado_em=now(), ultimo_resultado=$4 WHERE pesquisa_id=$1`,
    [m.pesquisa_id, novas.map((i) => i.empresa_id), ultimo, JSON.stringify(resultado)]);
  });
  return { pesquisaId: m.pesquisa_id, ...resultado };
}
