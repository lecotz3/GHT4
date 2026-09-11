import { ErroHttp } from '../app.mjs';
import { Id } from './contratos.mjs';
export async function autorizarOportunidade(req, db, id, permissao = 'crm.ler') {
  const u = req.exigir(permissao);
  const o = (await db.query('SELECT * FROM crm_oportunidades WHERE id=$1',[Id.parse(id)])).rows[0];
  if (!o) throw new ErroHttp(404,'oportunidade_inexistente','Oportunidade não encontrada.');
  if (o.mandato_id) await req.exigirNoMandato(o.mandato_id,permissao);
  else if (o.criado_por !== u.id) throw new ErroHttp(404,'oportunidade_inexistente','Oportunidade não encontrada.');
  return o;
}
