import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { autorizarOportunidade } from '../crm/acesso.mjs';
import { Id, Versao } from '../crm/contratos.mjs';
import { FORMULARIOS, permissaoDe, validarRegistro } from '../acervo/contratos.mjs';
import { pode, podeNoMandato } from '../seguranca/rbac.mjs';
import { compararTeses, analisarComparaveis } from '../acervo/analises.mjs';

export async function registrarAcervo(app) {
  const { db } = app;
  async function permissoes(req,o) {
    const m = o.mandato_id ? (await db.query('SELECT id,confidencial FROM mandatos WHERE id=$1',[o.mandato_id])).rows[0] : null;
    const permitido = (p) => m ? podeNoMandato(req.usuario,m,p) : pode(req.usuario.papel,p);
    return { editar: Object.fromEntries(Object.keys(FORMULARIOS).map((t) => [t,permitido(permissaoDe(t,true))])),
      revisar: permitido('crm.mover'), contatos: permitido('rede.ver_contato') };
  }
  const campos = 'r.id,r.serie_id,r.tipo,r.versao,r.dados,r.revisado,r.criado_em,u.nome AS autor';
  const mascarar = (r,p) => r.tipo === 'relacao' && !p.contatos ? { ...r,dados: { ...r.dados,email: undefined,telefone: undefined },contatosOmitidos: true } : r;
  async function registrosDe(id) {
    return (await db.query(`SELECT DISTINCT ON(r.serie_id) ${campos} FROM crm_registros r JOIN usuarios u ON u.id=r.usuario_id
      WHERE r.oportunidade_id=$1 ORDER BY r.serie_id,r.versao DESC`,[id])).rows;
  }
  app.get('/api/crm/oportunidades/:id/acervo', async (req) => {
    const o = await autorizarOportunidade(req,db,req.params.id);
    const p = await permissoes(req,o);
    const registros = await registrosDe(o.id);
    return { registros: registros.map((r) => mascarar(r,p)), formularios: FORMULARIOS, permissoes: p,
      comparaveis: analisarComparaveis(registros.filter((r) => r.tipo === 'comparavel')) };
  });
  app.get('/api/crm/oportunidades/:id/acervo/:serieId/versoes', async (req) => {
    const o = await autorizarOportunidade(req,db,req.params.id); const p = await permissoes(req,o);
    const linhas = (await db.query(`SELECT ${campos} FROM crm_registros r JOIN usuarios u ON u.id=r.usuario_id
      WHERE r.oportunidade_id=$1 AND r.serie_id=$2 ORDER BY r.versao DESC`,[o.id,Id.parse(req.params.serieId)])).rows;
    return { versoes: linhas.map((r) => mascarar(r,p)) };
  });
  app.post('/api/crm/oportunidades/:id/acervo', async (req) => {
    const p = z.object({ id: Id, serieId: Id.nullable(), versao: Versao, tipo: z.enum(Object.keys(FORMULARIOS)), dados: z.record(z.unknown()), revisado: z.boolean() }).strict().parse(req.body);
    const o = await autorizarOportunidade(req,db,req.params.id,permissaoDe(p.tipo,true));
    if (p.revisado) await autorizarOportunidade(req,db,o.id,'crm.mover');
    if (p.tipo === 'passagem' && o.etapa !== 'mandato_assinado') throw new ErroHttp(422,'assinatura_necessaria','Registre o mandato assinado antes de preparar a passagem para execução.');
    const dados = validarRegistro(p.tipo,p.dados);
    const registro = await db.transaction(async (tx) => {
      await tx.query('SELECT id FROM crm_oportunidades WHERE id=$1 FOR UPDATE',[o.id]);
      const repetido = (await tx.query('SELECT * FROM crm_registros WHERE id=$1',[p.id])).rows[0];
      if (repetido) {
        if (repetido.oportunidade_id !== o.id || repetido.usuario_id !== req.usuario.id || repetido.tipo !== p.tipo ||
          repetido.serie_id !== (p.serieId || p.id) || repetido.versao !== p.versao + 1 || repetido.revisado !== p.revisado || !isDeepStrictEqual(repetido.dados,dados)) {
          throw new ErroHttp(409,'envio_diferente','Este envio já foi usado. Atualize os registros.');
        }
        return repetido;
      }
      const anterior = p.serieId ? (await tx.query('SELECT tipo,versao FROM crm_registros WHERE oportunidade_id=$1 AND serie_id=$2 ORDER BY versao DESC LIMIT 1',[o.id,p.serieId])).rows[0] : null;
      if ((p.serieId && !anterior) || (anterior && (anterior.tipo !== p.tipo || anterior.versao !== p.versao)) || (!anterior && p.versao !== 0)) {
        throw new ErroHttp(409,'versao_alterada','A versão mudou. Reabra o registro para comparar antes de salvar.');
      }
      const r = (await tx.query(`INSERT INTO crm_registros(id,serie_id,oportunidade_id,tipo,versao,dados,revisado,usuario_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,serie_id,versao`,[p.id,p.serieId || p.id,o.id,p.tipo,p.versao+1,JSON.stringify(dados),p.revisado,req.usuario.id])).rows[0];
      await tx.query('UPDATE crm_oportunidades SET versao=versao+1,atualizado_em=now() WHERE id=$1',[o.id]);
      await registrar(tx,{ usuarioId: req.usuario.id, mandatoId: o.mandato_id, entidade: 'crm_registro', entidadeId: r.id,
        acao: p.revisado ? 'revisar' : 'registrar', depois: { tipo: p.tipo, serieId: r.serie_id, versao: r.versao, revisado: p.revisado } });
      return r;
    });
    return { registro };
  });
  app.get('/api/crm/oportunidades/:id/encaixes', async (req) => {
    const o = await autorizarOportunidade(req,db,req.params.id);
    const teses = (await registrosDe(o.id)).filter((r) => r.tipo === 'tese' && r.revisado);
    const u = req.usuario;
    const candidatas = (await db.query(`SELECT DISTINCT ON(r.serie_id) r.*,o.titulo AS oportunidade_titulo,o.empresa FROM crm_registros r
      JOIN crm_oportunidades o ON o.id=r.oportunidade_id LEFT JOIN mandatos m ON m.id=o.mandato_id
      WHERE r.tipo='tese' AND o.id<>$4 AND ((o.mandato_id IS NULL AND o.criado_por=$1) OR
      (o.mandato_id IS NOT NULL AND ($2 OR m.confidencial=false OR o.mandato_id=ANY($3::uuid[]))))
      ORDER BY r.serie_id,r.versao DESC`,[u.id,u.papel==='admin',(u.mandatos || []).map((m) => m.id),o.id])).rows.filter((r) => r.revisado);
    return { resultados: teses.flatMap((t) => candidatas.filter((c) => c.dados.papel !== t.dados.papel && c.empresa.id !== o.empresa.id)
      .map((c) => ({ ...compararTeses(t.dados,c.dados), tese: t.dados.titulo, contraparte: c.dados.titulo, oportunidadeId: c.oportunidade_id,
        fonte: c.dados.fonte, referencia: c.dados.referencia, versao: c.versao }))).sort((a,b) => b.aderencia - a.aderencia || b.cobertura - a.cobertura),
      metodologia: 'Compara somente perfis revisados que você pode acessar. Produtos, região, intervalo de receita e controle têm peso igual. Aderência considera apenas critérios conhecidos; cobertura mostra quantos dos quatro puderam ser avaliados. Encaixe é hipótese, não intenção confirmada nem recomendação de transação.' };
  });
}
