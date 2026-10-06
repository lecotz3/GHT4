import { pode } from '../seguranca/rbac.mjs';
import { hoje } from '../crm/contratos.mjs';
import { ESCOPO_OPORTUNIDADE, valoresDeEscopo } from './empresas.mjs';

/**
 * "Meu dia": o que depende de quem está logado, e só disso. Não é uma segunda
 * agenda: cada item aponta para o registro onde a ação acontece. Tudo passa pelo
 * mesmo escopo da lista de oportunidades, para que perder acesso a um espaço
 * tire também os compromissos dele daqui.
 */
export async function registrarInicio(app) {
  const { db } = app;
  app.get('/api/inicio', async (req, res) => {
    const u = req.exigir('agente.ler');
    const dia = hoje();
    const resposta = { hoje: dia, compromissos: null, semProximoPasso: null, rede: null };
    if (pode(u.papel, 'crm.ler')) {
      const v = [...valoresDeEscopo(u), dia];
      const meus = `(
        SELECT o.id AS oportunidade_id,o.titulo,o.proxima_acao AS descricao,o.prazo,'Próximo passo' AS tipo,o.empresa->>'nome' AS empresa
        FROM crm_oportunidades o LEFT JOIN mandatos m ON m.id=o.mandato_id
        WHERE ${ESCOPO_OPORTUNIDADE} AND o.responsavel_id=$1 AND NOT o.acao_concluida AND o.etapa NOT IN ('perdida','mandato_assinado')
        UNION ALL SELECT o.id,o.titulo,t.descricao,t.prazo,t.tipo,o.empresa->>'nome' FROM crm_tarefas t
        JOIN crm_oportunidades o ON o.id=t.oportunidade_id LEFT JOIN mandatos m ON m.id=o.mandato_id
        WHERE ${ESCOPO_OPORTUNIDADE} AND t.responsavel_id=$1 AND NOT t.concluida) c`;
      const totais = (await db.query(`SELECT count(*) FILTER (WHERE prazo < $4::date)::int atrasados,
          count(*) FILTER (WHERE prazo = $4::date)::int hoje,
          count(*) FILTER (WHERE prazo > $4::date AND prazo <= $4::date + 7)::int semana FROM ${meus}`, v)).rows[0];
      const itens = (await db.query(`SELECT oportunidade_id,titulo,descricao,prazo::text,tipo,empresa FROM ${meus}
        WHERE prazo <= $4::date + 7 ORDER BY prazo,oportunidade_id,descricao LIMIT 8`, v)).rows;
      resposta.compromissos = { ...totais, itens };
      // Oportunidade aberta cuja próxima ação já foi feita e nenhuma nova foi definida: a carteira para aí.
      const parados = `FROM crm_oportunidades o LEFT JOIN mandatos m ON m.id=o.mandato_id
        WHERE ${ESCOPO_OPORTUNIDADE} AND o.responsavel_id=$1 AND o.acao_concluida AND o.etapa NOT IN ('perdida','mandato_assinado')`;
      const vp = valoresDeEscopo(u);
      resposta.semProximoPasso = {
        total: (await db.query(`SELECT count(*)::int n ${parados}`, vp)).rows[0].n,
        itens: (await db.query(`SELECT o.id,o.titulo,o.etapa,o.empresa->>'nome' AS empresa,o.atualizado_em ${parados}
          ORDER BY o.atualizado_em,o.id LIMIT 5`, vp)).rows,
      };
    }
    if (pode(u.papel, 'rede.ler')) {
      const eu = (await db.query("SELECT id FROM rede_pessoas WHERE lado='ght4' AND ativo AND usuario_id=$1", [u.id])).rows[0];
      resposta.rede = { naRede: Boolean(eu), perguntasPendentes: 0, vinculosParaConfirmar: 0 };
      if (eu) Object.assign(resposta.rede, (await db.query(`SELECT
          (SELECT count(*)::int FROM rede_pessoas p LEFT JOIN rede_reconhecimentos r ON r.pessoa_alvo_id=p.id AND r.pessoa_ght4_id=$1
            WHERE p.lado='mercado' AND p.ativo AND r.id IS NULL) AS "perguntasPendentes",
          (SELECT count(*)::int FROM rede_vinculos v WHERE v.ativo AND v.disposicao='nao_confirmado'
            AND $1 IN (v.pessoa_a_id,v.pessoa_b_id)) AS "vinculosParaConfirmar"`, [eu.id])).rows[0]);
    }
    res.header('Cache-Control', 'no-store');
    return resposta;
  });
}
