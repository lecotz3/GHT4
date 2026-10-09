import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { encontrarPessoas, CATEGORIAS_DA_PESQUISA } from '../encontrar/buscar.mjs';
import { lembrarBusca, lerBuscas, resumoDaBusca } from '../encontrar/memoria.mjs';
import { travarMemoria } from '../pesquisa/memoria.mjs';

/* =============================================================================
 *  GHT4 · rota do "encontrar quem decide" (ver encontrar/buscar.mjs)
 * -----------------------------------------------------------------------------
 *  Ler exige `rede.ler`, como o plano de acesso: a resposta traz nomes de
 *  pessoas de terceiros. Pelo mesmo motivo não sai pelo canal externo (ponte
 *  MCP), e a resposta não fica em cache. Não grava pessoa nem rede; com a memória ligada,
 *  guarda o pedido e as contagens do resultado (abaixo).
 *
 *  Com `pesquisaId`, a busca fica nas empresas aderentes e prováveis de uma
 *  pesquisa por tese do próprio membro, com a mesma autorização do plano de
 *  acesso aberto a partir da pesquisa (`agente.ler`, e o mandato da conversa).
 *
 *  Memória das buscas (encontrar/memoria.mjs): o pedido feito fora de uma pesquisa fica
 *  guardado para repetir, se a memória do membro estiver ligada. Ler e apagar exigem só
 *  `agente.ler`, como a memória de critérios: quem perdeu o acesso à rede ainda vê e apaga o
 *  que ficou. A auditoria registra que algo foi apagado e quanto, nunca o texto do pedido.
 * ========================================================================== */

const Pedido = z.object({
  pedido: z.string().trim().min(3, 'descreva quem você procura').max(2000),
  pesquisaId: z.string().uuid().optional(),
}).strict();

const LIMITE_ITENS = 2000;

export async function registrarEncontrar(app, { catalogo }) {
  const { db } = app;

  async function daPesquisa(req, u, pesquisaId) {
    req.exigir('agente.ler');
    const p = (await db.query('SELECT id, conversa_id, tese, referencia FROM pesquisas_tese WHERE id=$1 AND usuario_id=$2', [pesquisaId, u.id])).rows[0];
    if (!p) throw new ErroHttp(404, 'pesquisa_inexistente', 'Pesquisa não encontrada.');
    const c = (await db.query('SELECT mandato_id, usuario_id FROM agente_conversas WHERE id=$1', [p.conversa_id])).rows[0];
    if (c.mandato_id) await req.exigirNoMandato(c.mandato_id, 'agente.ler');
    const itens = (await db.query(
      `SELECT empresa, categoria, aderencia FROM pesquisa_itens
        WHERE pesquisa_id=$1 AND categoria = ANY($2::text[]) ORDER BY ordem LIMIT ${LIMITE_ITENS}`,
      [p.id, CATEGORIAS_DA_PESQUISA])).rows;
    return { id: p.id, tese: p.tese, referencia: p.referencia, itens,
      escopo: c.mandato_id ? `mandato:${c.mandato_id}` : `usuario:${c.usuario_id}` };
  }

  app.post('/api/encontrar', async (req, res) => {
    const u = req.exigir('rede.ler');
    if (req.headers['x-ght4-canal'] === 'mcp') throw new ErroHttp(403, 'canal_externo', 'Encontrar pessoas não é servido por canal externo. Use a interface do GHT4.');
    const { pedido, pesquisaId } = Pedido.parse(req.body);
    const pesquisa = pesquisaId ? await daPesquisa(req, u, pesquisaId) : null;
    let resultado;
    try { resultado = await encontrarPessoas(app.db, catalogo, { texto: pedido, usuario: u, pesquisa }); }
    catch (e) {
      if (e?.codigo === 'catalogo_indisponivel') throw new ErroHttp(503, 'base_indisponivel', e.message);
      throw e;
    }
    // Guardar o pedido não pode derrubar a busca: sem memória, a pessoa só redigita.
    if (!pesquisa) {
      try { await lembrarBusca(db, u.id, pedido, resumoDaBusca(resultado)); }
      catch (e) { req.log?.warn?.({ err: e }, 'memória das buscas indisponível'); }
    }
    res.header('Cache-Control', 'no-store');
    return resultado;
  });

  app.get('/api/encontrar/memoria', async (req, res) => {
    const u = req.exigir('agente.ler');
    res.header('Cache-Control', 'no-store');
    return lerBuscas(db, u.id);
  });

  app.delete('/api/encontrar/memoria/:chave', async (req, res) => {
    const u = req.exigir('agente.ler');
    const chave = z.string().regex(/^[a-f0-9]{32}$/).parse(req.params.chave);
    await db.transaction(async (tx) => {
      await travarMemoria(tx, u.id);
      const r = await tx.query('DELETE FROM memoria_buscas WHERE usuario_id=$1 AND chave=$2 RETURNING chave', [u.id, chave]);
      if (!r.rows.length) throw new ErroHttp(404, 'memoria_inexistente', 'Esta busca já não está na sua memória.');
      await registrar(tx, { usuarioId: u.id, entidade: 'memoria', entidadeId: u.id, acao: 'esquecer_busca', depois: { apagados: 1 } });
    });
    res.header('Cache-Control', 'no-store');
    return lerBuscas(db, u.id);
  });

  app.delete('/api/encontrar/memoria', async (req, res) => {
    const u = req.exigir('agente.ler');
    await db.transaction(async (tx) => {
      await travarMemoria(tx, u.id);
      const r = await tx.query('DELETE FROM memoria_buscas WHERE usuario_id=$1 RETURNING chave', [u.id]);
      await registrar(tx, { usuarioId: u.id, entidade: 'memoria', entidadeId: u.id, acao: 'apagar_buscas', depois: { apagados: r.rows.length } });
    });
    res.header('Cache-Control', 'no-store');
    return lerBuscas(db, u.id);
  });
}
