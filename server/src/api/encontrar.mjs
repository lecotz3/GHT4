import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { encontrarPessoas, CATEGORIAS_DA_PESQUISA } from '../encontrar/buscar.mjs';
import { lembrarBusca, lerBuscas, resumoDaBusca } from '../encontrar/memoria.mjs';
import { lerPedidoComIA } from '../encontrar/ia.mjs';
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
  // Leitura com IA, a pedido do membro (encontrar/ia.mjs). A chave torna o clique idempotente.
  ia: z.object({ chave: z.string().uuid() }).strict().optional(),
}).strict();

const LIMITE_ITENS = 2000;

/* Por que a IA não leu, na língua da tela. A busca segue pelas regras e a nota explica. */
const FALHA_IA = {
  limite_diario: 'A cota diária de pedidos à IA acabou. A leitura abaixo é a das regras; amanhã a cota volta.',
  limite_provedor: 'O provedor de IA recusou por limite de uso. A leitura abaixo é a das regras.',
  mandato_confidencial_em_provedor_gratuito: 'Esta pesquisa é de um mandato confidencial, e o provedor de IA configurado pode reter o texto. A leitura abaixo é a das regras.',
  leitura_vazia: 'A IA não propôs nada que se apoiasse no texto do pedido. A leitura abaixo é a das regras.',
  leitura_incompativel: 'A IA alterou uma exigência explícita do pedido. A leitura abaixo é a das regras; as exigências foram preservadas.',
  ia_em_andamento: 'Esta leitura com IA ainda está em andamento. A leitura abaixo é a das regras.',
};

export async function registrarEncontrar(app, { catalogo, servicoIA = null }) {
  const { db } = app;

  /** Quantos pedidos à IA o membro ainda tem hoje (a cota comum, fora a das revisões da pesquisa). */
  async function iaDisponivel(u) {
    if (!servicoIA) return { disponivel: false };
    const s = servicoIA.status;
    const c = (await db.query(`SELECT count(*)::int total, count(*) FILTER (WHERE usuario_id=$1)::int pessoal FROM ia_execucoes
      WHERE tarefa <> 'revisao' AND criado_em >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`, [u.id])).rows[0];
    return { disponivel: true, provedor: s.provedor, modelo: s.modelo, gratuito: s.gratuito,
      restantes: Math.max(0, Math.min(s.pedidosUsuarioDia - c.pessoal, s.pedidosDia - c.total)) };
  }

  /** A pesquisa é do membro, e o mandato da conversa ainda o inclui. */
  async function acessoDaPesquisa(req, u, pesquisaId) {
    req.exigir('agente.ler');
    const p = (await db.query('SELECT id, conversa_id, tese, referencia FROM pesquisas_tese WHERE id=$1 AND usuario_id=$2', [pesquisaId, u.id])).rows[0];
    if (!p) throw new ErroHttp(404, 'pesquisa_inexistente', 'Pesquisa não encontrada.');
    const c = (await db.query('SELECT mandato_id, usuario_id FROM agente_conversas WHERE id=$1', [p.conversa_id])).rows[0];
    if (c.mandato_id) await req.exigirNoMandato(c.mandato_id, 'agente.ler');
    return { p, c };
  }

  /* A sessão, o papel ou o mandato podem mudar enquanto a busca espera a IA ou lê catálogo e rede:
     confere tudo de novo. A recusa encerra o pedido; não é falha da IA (parecer do Codex, Rodada 26). */
  async function conferirDeNovo(req, pesquisaId) {
    await req.revalidarSessao();
    const u = req.exigir('rede.ler');
    if (pesquisaId) await acessoDaPesquisa(req, u, pesquisaId);
    return u;
  }

  async function daPesquisa(req, u, pesquisaId) {
    const { p, c } = await acessoDaPesquisa(req, u, pesquisaId);
    const itens = (await db.query(
      `SELECT empresa, categoria, aderencia FROM pesquisa_itens
        WHERE pesquisa_id=$1 AND categoria = ANY($2::text[]) ORDER BY ordem LIMIT ${LIMITE_ITENS}`,
      [p.id, CATEGORIAS_DA_PESQUISA])).rows;
    return { id: p.id, tese: p.tese, referencia: p.referencia, itens, conversaId: p.conversa_id,
      escopo: c.mandato_id ? `mandato:${c.mandato_id}` : `usuario:${c.usuario_id}` };
  }

  app.post('/api/encontrar', async (req, res) => {
    let u = req.exigir('rede.ler');
    if (req.headers['x-ght4-canal'] === 'mcp') throw new ErroHttp(403, 'canal_externo', 'Encontrar pessoas não é servido por canal externo. Use a interface do GHT4.');
    const { pedido, pesquisaId, ia: pedidoIA } = Pedido.parse(req.body);
    let pesquisa = pesquisaId ? await daPesquisa(req, u, pesquisaId) : null;
    /* Leitura com IA: só o texto do pedido vai ao provedor, na cota diária comum. Se a IA não
       ler, a busca segue pelas regras e a tela diz por quê; a falha não derruba a busca. */
    let ia = null, falhaIA = null;
    if (pedidoIA) {
      if (!servicoIA) throw new ErroHttp(409, 'ia_indisponivel', 'A leitura com IA não está configurada nesta instalação.');
      try { ia = await lerPedidoComIA(servicoIA, pedido, { usuarioId: u.id, conversaId: pesquisa?.conversaId ?? null, chave: pedidoIA.chave }); }
      catch (e) {
        if (e?.message === 'pedido_diferente' || e?.message === 'pedido_ja_falhou') throw new ErroHttp(409, 'pedido_ja_usado', 'Este pedido à IA já foi usado. Clique de novo para uma nova leitura.');
        falhaIA = FALHA_IA[e?.codigo ?? e?.message] ?? 'A IA não respondeu agora. A leitura abaixo é a das regras.';
        req.log?.warn?.({ motivo: e?.codigo ?? e?.message }, 'leitura do find com IA indisponível');
      }
      // A espera pela IA é externa: a busca segue com a sessão e a pesquisa relidas.
      u = await conferirDeNovo(req, null);
      if (pesquisaId) pesquisa = await daPesquisa(req, u, pesquisaId);
    }
    let resultado;
    try { resultado = await encontrarPessoas(app.db, catalogo, { texto: pedido, usuario: u, pesquisa, ia }); }
    catch (e) {
      if (e?.codigo === 'catalogo_indisponivel') throw new ErroHttp(503, 'base_indisponivel', e.message);
      throw e;
    }
    // E antes de entregar: a busca leu catálogo e rede depois da última conferência.
    u = await conferirDeNovo(req, pesquisaId);
    if (falhaIA) resultado.leitura.notas.unshift(falhaIA);
    resultado.ia = { ...await iaDisponivel(u), falha: falhaIA };
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
