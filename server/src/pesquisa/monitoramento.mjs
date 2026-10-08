/* Monitoramento semanal de tese. Não há agendador: a verificação vencida roda quando a
   pessoa abre o Meu dia (POST /api/monitoramentos/verificar), que é onde as novidades
   aparecem. Refaz só o funil cadastral sobre o catálogo vigente: nenhum site é lido e
   nenhuma IA é chamada. O que muda vira novidade até a pessoa abrir a pesquisa.

   Garantias:
   - nada detectado é descartado: toda novidade é gravada (em lotes) antes de a linha de
     base e o cursor de eventos avançarem;
   - o conjunto monitorado é a linha de base inteira (`conhecidas`), inclusive empresas
     descobertas em semanas anteriores, que continuam recebendo eventos;
   - acesso conferido na seleção e de novo, com a sessão relida, logo antes de gravar;
   - reserva curta com ficha: processo interrompido não empurra a semana, e desligar ou
     religar durante o cálculo invalida o resultado em voo;
   - cobertura explícita: com o limite de empresas por recorte, a verificação pode ser
     parcial, e isso fica gravado e visível. */

export const SEMANA = "interval '7 days'";
/** Reserva enquanto calcula: se o processo cair, a verificação volta a vencer depois disso. */
const RESERVA = "interval '10 minutes'";
/** Falha ao verificar: tenta de novo em uma hora, em vez de perder a semana. */
const NOVA_TENTATIVA = "interval '1 hour'";
const LOTE = 500;
const NOMES_NO_RESULTADO = 10;

const MAIOR_EVENTO = 'SELECT COALESCE(max(id),0)::bigint AS n FROM eventos_corporativos';

/** Cobertura de uma varredura: quantas empresas do recorte foram de fato avaliadas. */
export const coberturaDe = (funil) => ({ recorte: funil.recorte, avaliadas: funil.avaliadas, completa: !funil.truncado && funil.avaliadas >= funil.recorte });

/**
 * Liga ou desliga. Ligar grava a linha de base: todas as empresas que atendem ao cadastro
 * agora (`aprovadas`, calculadas fora da transação) mais as que já estão na pesquisa.
 * Ligar o que já está ligado não muda nada; desligar ou religar invalida verificação em voo.
 */
export async function definirMonitoramento(db, { pesquisaId, usuarioId, ativo, aprovadas = [], cobertura = null }) {
  return db.transaction(async (tx) => {
    const atual = (await tx.query('SELECT * FROM monitoramentos_tese WHERE pesquisa_id=$1 FOR UPDATE', [pesquisaId])).rows[0];
    if (!ativo) {
      if (!atual) return null;
      return (await tx.query('UPDATE monitoramentos_tese SET ativo=FALSE, execucao=execucao+1 WHERE pesquisa_id=$1 RETURNING *', [pesquisaId])).rows[0];
    }
    if (atual?.ativo) return atual;
    const itens = (await tx.query('SELECT empresa_id FROM pesquisa_itens WHERE pesquisa_id=$1', [pesquisaId])).rows.map((r) => r.empresa_id);
    const conhecidas = [...new Set([...itens, ...aprovadas])].sort();
    const ultimo = (await tx.query(MAIOR_EVENTO)).rows[0].n;
    return (await tx.query(`INSERT INTO monitoramentos_tese (pesquisa_id,usuario_id,ativo,conhecidas,ultimo_evento,proxima_em,cobertura)
        VALUES ($1,$2,TRUE,$3,$4,now()+${SEMANA},$5)
      ON CONFLICT (pesquisa_id) DO UPDATE SET ativo=TRUE, conhecidas=EXCLUDED.conhecidas, ultimo_evento=EXCLUDED.ultimo_evento,
        proxima_em=EXCLUDED.proxima_em, cobertura=EXCLUDED.cobertura, execucao=monitoramentos_tese.execucao+1
      RETURNING *`, [pesquisaId, usuarioId, conhecidas, ultimo, cobertura && JSON.stringify(cobertura)])).rows[0];
  });
}

/** O estado público do monitoramento, para o detalhe da pesquisa. */
export const publico = (m) => m ? { ativo: m.ativo, verificadoEm: m.verificado_em, proximaEm: m.proxima_em,
  cobertura: m.cobertura ?? null, ultimoResultado: m.ultimo_resultado ?? null } : null;

/**
 * Verifica até `limite` monitoramentos vencidos da pessoa.
 * - `escopo` ({ admin, mandatos }): mesma regra da lista de pesquisas, aplicada na seleção;
 * - `podeAcessar(pesquisaId)`: a política completa (`carregar`, com a sessão relida),
 *   conferida antes de reivindicar e de novo logo antes de gravar.
 * Cada candidata é reivindicada com UPDATE condicional (vencida e ativa): entre abas
 * concorrentes, só uma reserva cada pesquisa.
 */
export async function verificarVencidos(db, motor, usuarioId, { limite = 2, escopo = { admin: false, mandatos: [] }, podeAcessar = async () => true } = {}) {
  const candidatas = (await db.query(`SELECT t.pesquisa_id FROM monitoramentos_tese t
      JOIN pesquisas_tese p ON p.id=t.pesquisa_id JOIN agente_conversas c ON c.id=p.conversa_id LEFT JOIN mandatos m ON m.id=c.mandato_id
      WHERE t.usuario_id=$1 AND p.usuario_id=$1 AND t.ativo AND t.proxima_em<=now()
        AND (c.mandato_id IS NULL OR $2 OR m.confidencial=FALSE OR c.mandato_id=ANY($3::uuid[]))
      ORDER BY t.proxima_em, t.pesquisa_id LIMIT 20`, [usuarioId, escopo.admin, escopo.mandatos])).rows.map((r) => r.pesquisa_id);
  const feitos = [];
  for (const pesquisaId of candidatas) {
    if (feitos.length >= limite) break;
    if (!(await podeAcessar(pesquisaId))) continue; // fora do escopo: não reserva nem consome nada
    const m = (await db.query(`UPDATE monitoramentos_tese SET proxima_em=now()+${RESERVA}, execucao=execucao+1
      WHERE pesquisa_id=$1 AND ativo AND proxima_em<=now() RETURNING *`, [pesquisaId])).rows[0];
    if (!m) continue; // outra aba reservou antes
    try { feitos.push(await verificar(db, motor, m, podeAcessar)); }
    catch {
      await db.query(`UPDATE monitoramentos_tese SET proxima_em=now()+${NOVA_TENTATIVA} WHERE pesquisa_id=$1 AND execucao=$2`, [m.pesquisa_id, m.execucao]);
      feitos.push({ pesquisaId: m.pesquisa_id, falhou: true });
    }
  }
  return feitos;
}

async function verificar(db, motor, m, podeAcessar) {
  const pesquisa = (await db.query('SELECT * FROM pesquisas_tese WHERE id=$1', [m.pesquisa_id])).rows[0];
  // Fora de qualquer transação: o recorte é uma consulta grande (ver motor.calcular).
  // Todas as aprovadas, sem o corte de itens da pesquisa; o limite do recorte vira cobertura.
  const { funil, empresas } = await motor.aprovadasCadastro(pesquisa);
  const cobertura = coberturaDe(funil);
  const conhecidas = new Set(m.conhecidas);
  // Ligado antes da cobertura (Rodada 15), a linha de base tinha só os itens da pesquisa (até 2.000):
  // a primeira verificação completa a linha de base com todas as aprovadas, sem avisá-las como novas.
  const refazerBase = m.cobertura == null;
  const novas = refazerBase ? [] : empresas.filter((e) => !conhecidas.has(e.id));
  const incorporar = refazerBase ? empresas.map((e) => e.id) : novas.map((e) => e.id);
  const ultimo = (await db.query(MAIOR_EVENTO)).rows[0].n;
  // Eventos de todo o conjunto monitorado: a linha de base (com as descobertas anteriores),
  // os itens da pesquisa e as novas de agora. Só o evento mais recente de cada empresa.
  const monitoradas = [...new Set([...m.conhecidas, ...incorporar])];
  const eventos = (await db.query(`SELECT DISTINCT ON (a.id) a.id AS empresa_id,
        COALESCE(r.nome, i.empresa->>'nome', a.id) AS nome, ev.descricao
      FROM unnest($1::text[]) AS a(id)
      JOIN entidades_juridicas e ON 'cnpj'||trim(e.cnpj_raiz)=a.id
      JOIN eventos_corporativos ev ON ev.entidade_id=e.id AND ev.tipo<>'outro' AND ev.id>$2 AND ev.id<=$3
      LEFT JOIN catalogo_registros r ON r.entidade_id=e.id AND r.snapshot_id=(SELECT snapshot_id FROM catalogo_controle WHERE id=TRUE)
      LEFT JOIN pesquisa_itens i ON i.pesquisa_id=$4 AND i.empresa_id=a.id
      ORDER BY a.id, ev.id DESC`, [monitoradas, m.ultimo_evento, ultimo, m.pesquisa_id])).rows;
  const resultado = {
    verificadoEm: new Date().toISOString(), totalNovas: novas.length, totalEventos: eventos.length, cobertura,
    ...(refazerBase ? { linhaDeBaseRefeita: true } : {}),
    novas: novas.slice(0, NOMES_NO_RESULTADO).map((e) => ({ id: e.id, nome: e.nome, aderencia: e.aderencia })),
    eventos: eventos.slice(0, NOMES_NO_RESULTADO).map((e) => ({ id: e.empresa_id, nome: e.nome, rotulo: e.descricao })),
  };
  // Acesso revalidado (sessão relida) logo antes de gravar: revogado durante o cálculo, nada é
  // gravado e o cursor não avança; a reserva expira sozinha. Fora da transação porque a política
  // consulta mandatos e sessão pelo banco.
  if (!(await podeAcessar(m.pesquisa_id))) return { pesquisaId: m.pesquisa_id, descartada: true };
  return db.transaction(async (tx) => {
    // Só quem tem a ficha vigente grava, e só com o monitoramento ainda ligado.
    const atual = (await tx.query('SELECT ativo, execucao FROM monitoramentos_tese WHERE pesquisa_id=$1 FOR UPDATE', [m.pesquisa_id])).rows[0];
    if (!atual?.ativo || atual.execucao !== m.execucao) return { pesquisaId: m.pesquisa_id, descartada: true };
    const linhas = [
      ...novas.map((e) => ({ empresa_id: e.id, tipo: 'nova', empresa: { id: e.id, nome: e.nome, cidade: e.cidade, uf: e.uf }, detalhe: `Aderência ${e.aderencia}%` })),
      ...eventos.map((e) => ({ empresa_id: e.empresa_id, tipo: 'evento', empresa: { id: e.empresa_id, nome: e.nome }, detalhe: e.descricao })),
    ];
    // Tudo é gravado, em lotes: a linha de base nunca passa por cima de algo não avisado.
    for (let i = 0; i < linhas.length; i += LOTE) {
      await tx.query(`INSERT INTO monitoramento_novidades (pesquisa_id,empresa_id,tipo,empresa,detalhe)
        SELECT $1,x.empresa_id,x.tipo,x.empresa,x.detalhe FROM jsonb_to_recordset($2::jsonb) AS x(empresa_id text, tipo text, empresa jsonb, detalhe text)`,
      [m.pesquisa_id, JSON.stringify(linhas.slice(i, i + LOTE))]);
    }
    await tx.query(`UPDATE monitoramentos_tese SET conhecidas=ARRAY(SELECT DISTINCT unnest(conhecidas || $2::text[]) ORDER BY 1),
        ultimo_evento=GREATEST(ultimo_evento,$3), verificado_em=now(), proxima_em=now()+${SEMANA}, ultimo_resultado=$4, cobertura=$5
      WHERE pesquisa_id=$1`, [m.pesquisa_id, incorporar, ultimo, JSON.stringify(resultado), JSON.stringify(cobertura)]);
    return { pesquisaId: m.pesquisa_id, ...resultado };
  });
}
