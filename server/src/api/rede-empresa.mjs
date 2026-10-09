import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { alterarRede } from '../rede/estado.mjs';
import { Id, EmpresaId, Versao } from '../rede/contratos.mjs';
import { empresasParecidas } from '../encontrar/nomes.mjs';
import { CAMPOS, publicar } from './rede.mjs';

/* =============================================================================
 *  GHT4 · ligar ao CNPJ quem a rede só conhece pelo nome da organização
 * -----------------------------------------------------------------------------
 *  Listas da equipe e cadastros à mão chegam com "Química Alfa Ltda." escrito
 *  de um jeito, e o find só enxerga quem está ligado a um CNPJ do catálogo. Aqui
 *  o agente SUGERE empresas pelo nome escrito e um membro com permissão de
 *  editar CONFIRMA uma. Nada é ligado sozinho: homônimo de empresa existe.
 *
 *  A rota de vínculo muda só `empresa_id`. A edição completa (PATCH da pessoa)
 *  reescreve todos os campos, inclusive contatos que o papel de quem edita pode
 *  não ver; para ligar ao CNPJ, isso seria arriscar o que não está na tela.
 * ========================================================================== */

const semPessoa = () => new ErroHttp(404, 'pessoa_inexistente', 'Pessoa não encontrada na rede.');
const doMercado = () => new ErroHttp(422, 'pessoa_da_casa', 'Só pessoas das empresas se ligam a um CNPJ do catálogo.');
const cartao = ({ id, nome, razaoSocial, cnpjRaiz, cidade, uf, subsetor }) =>
  ({ id, nome, razaoSocial: razaoSocial ?? null, cnpjRaiz, cidade: cidade ?? null, uf: uf ?? null, subsetor: subsetor ?? null });

export async function registrarVinculoEmpresa(app, { catalogo }) {
  const { db } = app;
  const catalogoFora = (e) => Object.assign(new ErroHttp(503, 'base_indisponivel', 'O catálogo não pôde ser consultado. Tente novamente.'), { cause: e });

  app.get('/api/rede/pessoas/:id/empresas-sugeridas', async (req, res) => {
    req.exigir('rede.editar');
    const id = Id.parse(req.params.id);
    const q = z.object({ busca: z.string().trim().max(160).optional() }).parse(req.query);
    const p = (await db.query('SELECT lado, organizacao, empresa_id FROM rede_pessoas WHERE id=$1 AND ativo', [id])).rows[0];
    if (!p) throw semPessoa();
    if (p.lado !== 'mercado') throw doMercado();
    const busca = q.busca || p.organizacao || '';
    let r = { empresas: [], total: 0, identifica: false, incompleta: false };
    if (busca) {
      try { r = await empresasParecidas(catalogo, busca); } catch (e) { throw catalogoFora(e); }
    }
    res.header('Cache-Control', 'no-store');
    return { busca, empresaAtual: p.empresa_id, identifica: r.identifica, total: r.total, incompleta: r.incompleta, empresas: r.empresas.map(cartao) };
  });

  app.post('/api/rede/pessoas/:id/empresa', async (req, res) => {
    const u = req.exigir('rede.editar');
    const id = Id.parse(req.params.id);
    const { empresaId, versao } = z.object({ empresaId: EmpresaId, versao: Versao }).strict().parse(req.body);
    let empresa;
    try { empresa = await catalogo.obter(empresaId); } catch (e) { throw catalogoFora(e); }
    if (!empresa) throw new ErroHttp(422, 'empresa_fora_do_catalogo', 'Esta empresa não está no catálogo de químicos.');
    const salva = await db.transaction(async (tx) => {
      const antes = (await tx.query(`SELECT ${CAMPOS} FROM rede_pessoas WHERE id = $1 AND ativo FOR UPDATE`, [id])).rows[0];
      if (!antes) throw semPessoa();
      if (antes.lado !== 'mercado') throw doMercado();
      if (antes.versao !== versao) throw new ErroHttp(409, 'registro_atualizado', 'Este registro mudou. Reabra a rede antes de salvar.');
      if (antes.empresa_id === empresaId) return antes;
      await alterarRede(tx);
      const linha = (await tx.query(
        `UPDATE rede_pessoas SET empresa_id=$2, versao=versao+1, atualizado_em=now() WHERE id=$1 RETURNING ${CAMPOS}`, [id, empresaId])).rows[0];
      await registrar(tx, { usuarioId: u.id, entidade: 'rede_pessoa', entidadeId: id, acao: 'vincular_empresa',
        antes: { empresaId: antes.empresa_id, organizacao: antes.organizacao },
        depois: { empresaId, empresa: empresa.nome } });
      return linha;
    });
    res.header('Cache-Control', 'no-store');
    return { pessoa: publicar(salva, u), empresa: cartao(empresa) };
  });
}
