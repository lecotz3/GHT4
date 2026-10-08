/* Monitoramento semanal de tese. Não há agendador: a verificação vencida roda quando a
   pessoa abre o Meu dia (POST /api/monitoramentos/verificar), que é onde as novidades
   aparecem. Refaz só o funil cadastral sobre o catálogo vigente: nenhum site é lido e
   nenhuma IA é chamada. O que muda vira novidade até a pessoa abrir a pesquisa.

   Garantias:
   - nada detectado é descartado: toda novidade é gravada (em lotes) na mesma transação que
     avança a linha de base e o cursor de eventos;
   - o conjunto monitorado é a linha de base inteira (`conhecidas`), inclusive empresas
     descobertas em semanas anteriores, que continuam recebendo eventos;
   - acesso: a seleção usa o escopo da lista de pesquisas, e a política completa (`podeAcessar`,
     com a sessão relida) é conferida antes de reservar e de novo depois do cálculo, logo antes
     da transação que grava. Limite: uma revogação que se efetive depois dessa última checagem
     e antes do commit (uma transação curta) não é detectada. A ficha não cobre essa janela: ela
     invalida execuções superadas (reserva nova, desligar, religar), não autorizações. As
     leituras (detalhe, Meu dia) conferem o acesso de novo, então o que for gravado nessa
     janela não é exibido a quem perdeu o acesso;
   - erro da política (sessão expirada, papel sem permissão) não vira "nada verificado": a
     reserva é devolvida e o erro chega à rota;
   - reserva curta com ficha: processo interrompido não empurra a semana, e desligar ou
     religar durante o cálculo invalida o resultado em voo;
   - falha registrada (`falha_em`) até o próximo sucesso: nova tentativa automática em uma
     hora, ou pedida (`repetir`) depois de um intervalo mínimo; uma chamada que não executou
     nada não apaga a falha;
   - cobertura explícita: com o limite de empresas por recorte, a verificação pode ser
     parcial, e isso fica gravado e visível;
   - monitor ligado antes da cobertura (Rodada 15): linha de base reconstruída pela
     publicação da pesquisa, sem absorver novidade real (ver `baseLegada`). */

import { MAX_ITENS } from './motor.mjs';

export const SEMANA = "interval '7 days'";
/** Reserva enquanto calcula: se o processo cair, a verificação volta a vencer depois disso. */
const RESERVA = "interval '10 minutes'";
/** Falha ao verificar: tenta de novo em uma hora, em vez de perder a semana. */
const NOVA_TENTATIVA = "interval '1 hour'";
/** Nova tentativa pedida pela pessoa: só depois deste intervalo desde a falha. */
const REPETIR_APOS = "interval '15 seconds'";
const LOTE = 500;
const NOMES_NO_RESULTADO = 10;

const MAIOR_EVENTO = 'SELECT COALESCE(max(id),0)::bigint AS n FROM eventos_corporativos';
/** Vencida, ou em falha há mais que o intervalo mínimo quando a pessoa pede nova tentativa. */
const vencida = (repetir, t = '') => `(${t}proxima_em<=now() OR (${repetir}::boolean AND ${t}falha_em IS NOT NULL AND ${t}falha_em<=now()-${REPETIR_APOS}))`;

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
        proxima_em=EXCLUDED.proxima_em, cobertura=EXCLUDED.cobertura, falha_em=NULL, execucao=monitoramentos_tese.execucao+1
      RETURNING *`, [pesquisaId, usuarioId, conhecidas, ultimo, cobertura && JSON.stringify(cobertura)])).rows[0];
  });
}

/** O estado público do monitoramento, para o detalhe da pesquisa. */
export const publico = (m) => m ? { ativo: m.ativo, verificadoEm: m.verificado_em, proximaEm: m.proxima_em,
  falhaEm: m.falha_em ?? null, cobertura: m.cobertura ?? null, ultimoResultado: m.ultimo_resultado ?? null } : null;

const ESCOPO = `(c.mandato_id IS NULL OR $2 OR m.confidencial=FALSE OR c.mandato_id=ANY($3::uuid[]))`;
const DA_PESSOA = `monitoramentos_tese t JOIN pesquisas_tese p ON p.id=t.pesquisa_id JOIN agente_conversas c ON c.id=p.conversa_id
  LEFT JOIN mandatos m ON m.id=c.mandato_id`;

/** Monitoramentos ligados da pessoa (no escopo dela) cuja última tentativa falhou, e quando
 *  a próxima tentativa automática acontece. */
export async function situacaoFalhas(db, usuarioId, { escopo = { admin: false, mandatos: [] } } = {}) {
  const r = (await db.query(`SELECT count(*)::int AS n, min(t.proxima_em) AS proxima FROM ${DA_PESSOA}
    WHERE t.usuario_id=$1 AND p.usuario_id=$1 AND t.ativo AND t.falha_em IS NOT NULL AND ${ESCOPO}`, [usuarioId, escopo.admin, escopo.mandatos])).rows[0];
  return { emFalha: r.n, proximaTentativa: r.proxima ?? null };
}

/**
 * Verifica até `limite` monitoramentos vencidos da pessoa.
 * - `escopo` ({ admin, mandatos }): mesma regra da lista de pesquisas, aplicada na seleção;
 * - `podeAcessar(pesquisaId)`: a política completa (`carregar`, com a sessão relida),
 *   conferida antes de reivindicar e de novo depois do cálculo. Devolve false quando a
 *   pesquisa saiu do alcance; lança quando a própria sessão ou o papel não valem mais;
 * - `repetir`: também as que falharam há mais que o intervalo mínimo (pedido explícito).
 * Cada candidata é reivindicada com UPDATE condicional: entre abas concorrentes, só uma
 * reserva cada pesquisa. Reivindicar apaga a falha anterior: uma execução em andamento não
 * é reivindicada de novo por outro pedido de repetição.
 */
export async function verificarVencidos(db, motor, usuarioId, { limite = 2, escopo = { admin: false, mandatos: [] }, podeAcessar = async () => true, repetir = false } = {}) {
  const candidatas = (await db.query(`SELECT t.pesquisa_id FROM ${DA_PESSOA}
      WHERE t.usuario_id=$1 AND p.usuario_id=$1 AND t.ativo AND ${vencida('$4', 't.')} AND ${ESCOPO}
      ORDER BY t.proxima_em, t.pesquisa_id LIMIT 20`, [usuarioId, escopo.admin, escopo.mandatos, repetir])).rows.map((r) => r.pesquisa_id);
  const feitos = [];
  for (const pesquisaId of candidatas) {
    if (feitos.length >= limite) break;
    if (!(await podeAcessar(pesquisaId))) continue; // fora do escopo: não reserva nem consome nada
    const m = (await db.query(`UPDATE monitoramentos_tese SET proxima_em=now()+${RESERVA}, execucao=execucao+1, falha_em=NULL
      WHERE pesquisa_id=$1 AND ativo AND ${vencida('$2')} RETURNING *`, [pesquisaId, repetir])).rows[0];
    if (!m) continue; // outra aba reservou antes
    let calculo;
    try { calculo = await calcular(db, motor, m); }
    catch { await falhou(db, m); feitos.push({ pesquisaId, falhou: true }); continue; }
    // Acesso de novo, com a sessão relida, depois do cálculo e logo antes de gravar. Revogado
    // durante o cálculo: nada é gravado, o cursor não avança e a reserva expira sozinha.
    let pode;
    try { pode = await podeAcessar(pesquisaId); }
    catch (e) { await db.query('UPDATE monitoramentos_tese SET proxima_em=now() WHERE pesquisa_id=$1 AND execucao=$2', [pesquisaId, m.execucao]); throw e; }
    if (!pode) { feitos.push({ pesquisaId, descartada: true }); continue; }
    try { feitos.push(await gravar(db, m, calculo)); }
    catch { await falhou(db, m); feitos.push({ pesquisaId, falhou: true }); }
  }
  return feitos;
}

/** Falha: próxima tentativa em uma hora e falha registrada, só para a ficha vigente. */
const falhou = (db, m) => db.query(`UPDATE monitoramentos_tese SET proxima_em=now()+${NOVA_TENTATIVA}, falha_em=now()
  WHERE pesquisa_id=$1 AND execucao=$2`, [m.pesquisa_id, m.execucao]);

/*
 * Monitor ligado antes da cobertura (Rodada 15): a linha de base é só `pesquisa_itens`, que pode
 * ter o corte de itens da pesquisa. Sem distinguir "estava além do corte" de "chegou depois",
 * a primeira verificação inventaria avisos ou engoliria novidades reais. A referência confiável
 * é a publicação em que a pesquisa foi calculada (`catalogo_hash`):
 * - `pesquisa`: os itens não tiveram corte (todas as aprovadas foram gravadas); a linha de base
 *   já está completa e o regime é o normal;
 * - `historica`: houve corte; as aprovadas naquela publicação entram na linha de base sem aviso,
 *   e o que aprova agora e não aprovava lá é novidade real;
 * - `incerta`: a publicação não está disponível (catálogo em arquivo, outra versão). Nada é
 *   absorvido em silêncio: as candidatas viram aviso marcado "a conferir", porque podem já
 *   atender desde antes de o monitoramento ser ligado.
 * Empresas que entraram entre o cálculo da pesquisa e a ativação contam como novas: excesso
 * declarado, nunca perda.
 */
async function baseLegada(motor, pesquisa) {
  const f = pesquisa.funil ?? {};
  if (Number.isInteger(f.aprovadasCadastro) && f.aprovadasCadastro <= (f.armazenadas ?? MAX_ITENS)) return { origem: 'pesquisa', ids: [] };
  const ref = await motor.aprovadasCadastro(pesquisa, { hash: pesquisa.catalogo_hash });
  return ref ? { origem: 'historica', ids: ref.empresas.map((e) => e.id) } : { origem: 'incerta', ids: [] };
}

/* Cálculo fora de qualquer transação: o recorte é uma consulta grande (ver motor.calcular).
   Todas as aprovadas, sem o corte de itens da pesquisa; o limite do recorte vira cobertura. */
async function calcular(db, motor, m) {
  const pesquisa = (await db.query('SELECT * FROM pesquisas_tese WHERE id=$1', [m.pesquisa_id])).rows[0];
  const { funil, empresas } = await motor.aprovadasCadastro(pesquisa);
  const cobertura = coberturaDe(funil);
  const transicao = m.cobertura == null ? await baseLegada(motor, pesquisa) : null;
  const antes = new Set(m.conhecidas);
  const conhecidas = new Set([...antes, ...(transicao?.ids ?? [])]);
  const novas = empresas.filter((e) => !conhecidas.has(e.id));
  const aConferir = transicao?.origem === 'incerta';
  const incorporar = [...new Set([...(transicao?.ids ?? []), ...novas.map((e) => e.id)])].filter((id) => !antes.has(id));
  const ultimo = (await db.query(MAIOR_EVENTO)).rows[0].n;
  // Eventos de todo o conjunto monitorado: a linha de base (com as descobertas anteriores),
  // os itens da pesquisa e as novas de agora. Só o evento mais recente de cada empresa.
  const monitoradas = [...antes, ...incorporar];
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
    ...(transicao ? { transicao: transicao.origem } : {}), ...(aConferir ? { aConferir: novas.length } : {}),
    novas: novas.slice(0, NOMES_NO_RESULTADO).map((e) => ({ id: e.id, nome: e.nome, aderencia: e.aderencia })),
    eventos: eventos.slice(0, NOMES_NO_RESULTADO).map((e) => ({ id: e.empresa_id, nome: e.nome, rotulo: e.descricao })),
  };
  return { cobertura, novas, eventos, incorporar, ultimo, resultado, aConferir };
}

async function gravar(db, m, { cobertura, novas, eventos, incorporar, ultimo, resultado, aConferir }) {
  return db.transaction(async (tx) => {
    // Só quem tem a ficha vigente grava, e só com o monitoramento ainda ligado.
    const atual = (await tx.query('SELECT ativo, execucao FROM monitoramentos_tese WHERE pesquisa_id=$1 FOR UPDATE', [m.pesquisa_id])).rows[0];
    if (!atual?.ativo || atual.execucao !== m.execucao) return { pesquisaId: m.pesquisa_id, descartada: true };
    const linhas = [
      ...novas.map((e) => ({ empresa_id: e.id, tipo: 'nova', empresa: { id: e.id, nome: e.nome, cidade: e.cidade, uf: e.uf, ...(aConferir ? { aConferir: true } : {}) },
        detalhe: `Aderência ${e.aderencia}%${aConferir ? ' · a conferir: pode já atender desde antes do monitoramento' : ''}` })),
      ...eventos.map((e) => ({ empresa_id: e.empresa_id, tipo: 'evento', empresa: { id: e.empresa_id, nome: e.nome }, detalhe: e.descricao })),
    ];
    // Tudo é gravado, em lotes: a linha de base nunca passa por cima de algo não avisado.
    for (let i = 0; i < linhas.length; i += LOTE) {
      await tx.query(`INSERT INTO monitoramento_novidades (pesquisa_id,empresa_id,tipo,empresa,detalhe)
        SELECT $1,x.empresa_id,x.tipo,x.empresa,x.detalhe FROM jsonb_to_recordset($2::jsonb) AS x(empresa_id text, tipo text, empresa jsonb, detalhe text)`,
      [m.pesquisa_id, JSON.stringify(linhas.slice(i, i + LOTE))]);
    }
    await tx.query(`UPDATE monitoramentos_tese SET conhecidas=ARRAY(SELECT DISTINCT unnest(conhecidas || $2::text[]) ORDER BY 1),
        ultimo_evento=GREATEST(ultimo_evento,$3), verificado_em=now(), proxima_em=now()+${SEMANA}, ultimo_resultado=$4, cobertura=$5, falha_em=NULL
      WHERE pesquisa_id=$1`, [m.pesquisa_id, incorporar, ultimo, JSON.stringify(resultado), JSON.stringify(cobertura)]);
    return { pesquisaId: m.pesquisa_id, ...resultado };
  });
}
