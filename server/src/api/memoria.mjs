/* =============================================================================
 *  GHT4 · rotas da memória do membro
 * -----------------------------------------------------------------------------
 *  Cada pessoa só alcança a própria memória (`usuario_id` da sessão; nenhuma
 *  rota recebe outro usuário). Ler e apagar exigem `agente.ler`: quem perdeu o
 *  direito de usar o agente continua podendo ver e apagar o que ficou guardado.
 *
 *  A auditoria registra QUE algo foi apagado ou pausado e quantos itens, nunca o
 *  texto dos critérios: a trilha é imutável, e guardar o conteúdo nela
 *  desfaria o "apagar".
 * ========================================================================== */

import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { lerMemoria, travarMemoria } from '../pesquisa/memoria.mjs';

export async function registrarMemoria(app) {
  const { db } = app;

  app.get('/api/memoria', async (req) => lerMemoria(db, req.exigir('agente.ler').id));

  app.put('/api/memoria', async (req) => {
    const u = req.exigir('agente.ler');
    const { ativa } = z.object({ ativa: z.boolean() }).strict().parse(req.body);
    await db.transaction(async (tx) => {
      await travarMemoria(tx, u.id);
      await tx.query(`INSERT INTO memoria_preferencias (usuario_id, ativa) VALUES ($1,$2)
        ON CONFLICT (usuario_id) DO UPDATE SET ativa=EXCLUDED.ativa, atualizado_em=now()`, [u.id, ativa]);
      await registrar(tx, { usuarioId: u.id, entidade: 'memoria', entidadeId: u.id, acao: ativa ? 'retomar_memoria' : 'pausar_memoria', depois: { ativa } });
    });
    return lerMemoria(db, u.id);
  });

  app.delete('/api/memoria/criterios/:chave', async (req) => {
    const u = req.exigir('agente.ler');
    const chave = z.string().regex(/^[a-f0-9]{32}$/).parse(req.params.chave);
    await db.transaction(async (tx) => {
      await travarMemoria(tx, u.id);
      const r = await tx.query('DELETE FROM memoria_criterios WHERE usuario_id=$1 AND chave=$2 RETURNING chave', [u.id, chave]);
      if (!r.rows.length) throw new ErroHttp(404, 'memoria_inexistente', 'Este critério já não está na sua memória.');
      await registrar(tx, { usuarioId: u.id, entidade: 'memoria', entidadeId: u.id, acao: 'esquecer_criterio', depois: { apagados: 1 } });
    });
    return lerMemoria(db, u.id);
  });

  app.delete('/api/memoria/criterios', async (req) => {
    const u = req.exigir('agente.ler');
    await db.transaction(async (tx) => {
      await travarMemoria(tx, u.id);
      const r = await tx.query('DELETE FROM memoria_criterios WHERE usuario_id=$1 RETURNING chave', [u.id]);
      await registrar(tx, { usuarioId: u.id, entidade: 'memoria', entidadeId: u.id, acao: 'apagar_memoria', depois: { apagados: r.rows.length } });
    });
    return lerMemoria(db, u.id);
  });
}
