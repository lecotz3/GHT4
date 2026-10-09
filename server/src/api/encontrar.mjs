import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { encontrarPessoas } from '../encontrar/buscar.mjs';

/* =============================================================================
 *  GHT4 · rota do "encontrar quem decide" (ver encontrar/buscar.mjs)
 * -----------------------------------------------------------------------------
 *  Ler exige `rede.ler`, como o plano de acesso: a resposta traz nomes de
 *  pessoas de terceiros. Pelo mesmo motivo não sai pelo canal externo (ponte
 *  MCP), e a resposta não fica em cache. É leitura: não grava nada.
 * ========================================================================== */

const Pedido = z.object({ pedido: z.string().trim().min(3, 'descreva quem você procura').max(2000) }).strict();

export async function registrarEncontrar(app, { catalogo }) {
  app.post('/api/encontrar', async (req, res) => {
    const u = req.exigir('rede.ler');
    if (req.headers['x-ght4-canal'] === 'mcp') throw new ErroHttp(403, 'canal_externo', 'Encontrar pessoas não é servido por canal externo. Use a interface do GHT4.');
    const { pedido } = Pedido.parse(req.body);
    let resultado;
    try { resultado = await encontrarPessoas(app.db, catalogo, { texto: pedido, usuario: u }); }
    catch (e) {
      if (e?.codigo === 'catalogo_indisponivel') throw new ErroHttp(503, 'base_indisponivel', e.message);
      throw e;
    }
    res.header('Cache-Control', 'no-store');
    return resultado;
  });
}
