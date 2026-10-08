/* =============================================================================
 *  GHT4 · rotas da pesquisa por tese
 * -----------------------------------------------------------------------------
 *  Toda pesquisa pertence a um TRABALHO (agente_conversas) do próprio membro:
 *  o escopo de mandato, a auditoria e o histórico vêm de lá. Ler exige
 *  `agente.ler`; criar, editar, rodar e entregar exigem `agente.usar`.
 * ========================================================================== */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { criarMotorPesquisa, Filtros, ListaCriterios, ordenarItens } from '../pesquisa/motor.mjs';
import { definirMonitoramento, verificarVencidos, publico as monitoramentoPublico } from '../pesquisa/monitoramento.mjs';

const Id = z.string().uuid();
const Versao = z.number().int().min(1);
/** Corta no fim de uma palavra, com reticências, para títulos e resumos. */
export const resumirTexto = (t, max) => { const limpo = t.replace(/\s+/g, ' ').trim(); if (limpo.length <= max) return limpo; const corte = limpo.slice(0, max - 1); return `${corte.slice(0, corte.lastIndexOf(' ') > max * 0.6 ? corte.lastIndexOf(' ') : corte.length).replace(/[\s,;.:]+$/, '')}…`; };
const CAMPOS = `id,conversa_id,usuario_id,anterior_id,tese,frente,filtros,criterios,meta,limite_web,catalogo_hash,referencia,funil,
  estado,motivo_estado,modo,notas,turno_id,versao,execucao,criado_em,atualizado_em`;

export async function registrarPesquisas(app, { catalogo, servicoIA = null, web = {} } = {}) {
  const { db } = app;
  const motor = criarMotorPesquisa({ db, catalogo, servicoIA, web });

  async function carregar(req, id, permissao = 'agente.ler', tx = db, bloquear = false) {
    const u = req.exigir(permissao);
    const p = (await tx.query(`SELECT ${CAMPOS} FROM pesquisas_tese WHERE id=$1 AND usuario_id=$2 ${bloquear ? 'FOR UPDATE' : ''}`, [Id.parse(id), u.id])).rows[0];
    if (!p) throw new ErroHttp(404, 'pesquisa_inexistente', 'Pesquisa não encontrada.');
    const c = (await tx.query('SELECT id,mandato_id,titulo FROM agente_conversas WHERE id=$1', [p.conversa_id])).rows[0];
    if (c.mandato_id) await req.exigirNoMandato(c.mandato_id, permissao);
    return { pesquisa: p, conversa: c, usuario: u };
  }
  const contagens = async (id) => (await db.query(`SELECT etapa,categoria,count(*)::int n FROM pesquisa_itens WHERE pesquisa_id=$1 GROUP BY 1,2`, [id])).rows
    .reduce((acc, r) => { acc.total += r.n; if (r.etapa === 'revisada') { acc.revisadas += r.n; acc[r.categoria] += r.n; } else acc.pendentes += r.n; return acc; },
      { total: 0, revisadas: 0, pendentes: 0, aderente: 0, provavel: 0, a_confirmar: 0, nao_aderente: 0 });
  /* Lista leve: por critério só o necessário para a tabela (veredito, resumo, lastro); justificativa,
     trechos, páginas e modelo vêm em GET /api/pesquisas/:id/itens/:empresaId, ao abrir a empresa.
     A entrega ao trabalho lê do banco e não depende disto. Nome próprio: não encobre `resumirTexto`. */
  const itemLeve = (i) => ({ ...i, resumido: true,
    vereditos: (i.vereditos ?? []).map((v) => ({ veredito: v.veredito, resumo: v.resumo, lastro: v.lastro, ...(v.pendente ? { pendente: true } : {}) })),
    site: i.site ? { dominio: i.site.dominio ?? null, estado: i.site.estado, identidade: i.site.identidade ?? null, motivo: i.site.motivo ?? null } : null });
  const semAtributos = (i) => { const { atributos, ...empresa } = i.empresa; return { ...i, empresa: { ...empresa, porte: atributos?.porte ?? null, capitalSocial: atributos?.capitalSocial ?? null, dataAbertura: atributos?.dataAbertura ?? null } }; };
  /* A ordem de exibição (categoria, aderência, ordem do funil) é aplicada no SQL ANTES do corte:
     as melhores revisadas nunca ficam de fora da primeira resposta. A fila tem cota própria.
     Contagens são globais; o resto de cada grupo vem por `GET /api/pesquisas/:id/itens`. */
  const ITENS = 'empresa_id,ordem,empresa,etapa,vereditos,aderencia,categoria,site,revisado_em';
  const ORDEM_SQL = `CASE categoria WHEN 'aderente' THEN 0 WHEN 'provavel' THEN 1 WHEN 'a_confirmar' THEN 2 ELSE 3 END, aderencia DESC, ordem`;
  /* Marca do conjunto revisado: muda quando uma empresa é revisada ou muda de categoria/aderência,
     ou seja, sempre que a ordenação das revisadas pode mudar. Calculada na MESMA instrução que lê
     a página, para descrever exatamente a lista entregue; a continuação a confronta. */
  const MARCA_SQL = `md5(COALESCE(string_agg(empresa_id||':'||categoria||':'||aderencia, ',' ORDER BY empresa_id) FILTER (WHERE etapa='revisada'), ''))`;
  async function detalhar(p, { limite = 300, fila = 50 } = {}) {
    // Uma instrução, um snapshot: contagens, marca, revisadas e fila são do mesmo instante.
    const linhas = (await db.query(`WITH base AS MATERIALIZED (SELECT ${ITENS} FROM pesquisa_itens WHERE pesquisa_id=$1),
      resumo AS (SELECT ${MARCA_SQL} AS marca, count(*)::int AS total,
          count(*) FILTER (WHERE etapa='revisada')::int AS revisadas, count(*) FILTER (WHERE etapa<>'revisada')::int AS pendentes,
          count(*) FILTER (WHERE etapa='revisada' AND categoria='aderente')::int AS aderente,
          count(*) FILTER (WHERE etapa='revisada' AND categoria='provavel')::int AS provavel,
          count(*) FILTER (WHERE etapa='revisada' AND categoria='a_confirmar')::int AS a_confirmar,
          count(*) FILTER (WHERE etapa='revisada' AND categoria='nao_aderente')::int AS nao_aderente FROM base),
      pagina AS (
        (SELECT *, 0 AS grupo_, row_number() OVER (ORDER BY ${ORDEM_SQL}) AS pos_ FROM base WHERE etapa='revisada' ORDER BY ${ORDEM_SQL} LIMIT $2)
        UNION ALL
        (SELECT *, 1, row_number() OVER (ORDER BY ordem) FROM base WHERE etapa<>'revisada' ORDER BY ordem LIMIT $3))
      SELECT r.*, to_jsonb(x) AS item FROM resumo r LEFT JOIN pagina x ON true ORDER BY x.grupo_, x.pos_`, [p.id, limite, fila])).rows;
    const { marca, total, revisadas, pendentes, aderente, provavel, a_confirmar, nao_aderente } = linhas[0];
    const monitoramento = monitoramentoPublico((await db.query('SELECT * FROM monitoramentos_tese WHERE pesquisa_id=$1', [p.id])).rows[0]);
    const itens = linhas.filter((l) => l.item).map(({ item: { grupo_, pos_, ...i } }) => semAtributos(i));
    return { pesquisa: p, marca, contagens: { total, revisadas, pendentes, aderente, provavel, a_confirmar, nao_aderente }, itens, monitoramento,
      ia: servicoIA ? { provedor: servicoIA.status.provedor, modelo: servicoIA.status.modelo, gratuito: servicoIA.status.gratuito } : null };
  }

  /* A lista leve é negociada: só quem envia `X-GHT4-Lista: leve` (o cliente que busca o item completo
     ao abrir a empresa) a recebe. Sem o cabeçalho, o contrato completo de antes, para que uma aba
     aberta com o cliente anterior continue funcionando depois da publicação. Vale para toda resposta
     das rotas de pesquisa que traz `itens` (detalhe, ações que devolvem o detalhe e continuação). */
  app.addHook('preSerialization', async (req, res, corpo) => {
    if (!req.routeOptions?.url?.startsWith('/api/pesquisas') || !Array.isArray(corpo?.itens)) return corpo;
    res.header('Vary', 'X-GHT4-Lista');
    if (req.headers['x-ght4-lista'] !== 'leve') return corpo;
    return { ...corpo, itens: corpo.itens.map(itemLeve) };
  });

  app.get('/api/pesquisas', async (req) => {
    const u = req.exigir('agente.ler');
    const pesquisas = (await db.query(`SELECT p.id,p.conversa_id,p.tese,p.estado,p.motivo_estado,p.funil,p.meta,p.atualizado_em,c.titulo,
        (SELECT count(*)::int FROM pesquisa_itens i WHERE i.pesquisa_id=p.id AND i.etapa='revisada' AND i.categoria IN ('aderente','provavel')) AS boas
      FROM pesquisas_tese p JOIN agente_conversas c ON c.id=p.conversa_id LEFT JOIN mandatos m ON m.id=c.mandato_id
      WHERE p.usuario_id=$1 AND (c.mandato_id IS NULL OR $2 OR m.confidencial=FALSE OR c.mandato_id=ANY($3::uuid[]))
      ORDER BY p.atualizado_em DESC LIMIT 30`, [u.id, u.papel === 'admin', (u.mandatos ?? []).map((m) => m.id)])).rows;
    return { pesquisas, ia: servicoIA ? { provedor: servicoIA.status.provedor, modelo: servicoIA.status.modelo, gratuito: servicoIA.status.gratuito } : null };
  });

  /* Cria o trabalho (se preciso) e o rascunho com os critérios propostos. Idempotente pelo id. */
  app.post('/api/pesquisas', async (req, res) => {
    const u = req.exigir('agente.usar');
    const p = z.object({ id: Id, tese: z.string().trim().min(10).max(2000), mandatoId: Id.nullable().default(null),
      conversaId: Id.nullable().default(null), frente: z.enum(['compra', 'venda']).nullable().default(null) }).strict().parse(req.body);
    const existente = (await db.query(`SELECT ${CAMPOS} FROM pesquisas_tese WHERE id=$1`, [p.id])).rows[0];
    if (existente) {
      if (existente.usuario_id !== u.id || existente.tese !== p.tese) throw new ErroHttp(409, 'pesquisa_ja_existe', 'Este envio já foi usado. Atualize a página.');
      // A repetição devolve a pesquisa só com o escopo de hoje, lido da conversa gravada
      // (não do mandato enviado): acesso retirado depois da criação também vale aqui.
      const { conversa } = await carregar(req, existente.id, 'agente.usar');
      if ((p.conversaId && p.conversaId !== conversa.id) || (!p.conversaId && p.mandatoId !== conversa.mandato_id)) {
        throw new ErroHttp(409, 'pesquisa_ja_existe', 'Este envio já foi usado em outro trabalho. Atualize a página.');
      }
      return detalhar(existente);
    }
    if (p.mandatoId) await req.exigirNoMandato(p.mandatoId, 'agente.usar');
    let conversa;
    if (p.conversaId) {
      conversa = (await db.query('SELECT * FROM agente_conversas WHERE id=$1 AND usuario_id=$2', [p.conversaId, u.id])).rows[0];
      if (!conversa) throw new ErroHttp(404, 'trabalho_inexistente', 'Trabalho não encontrado.');
      if (conversa.mandato_id) await req.exigirNoMandato(conversa.mandato_id, 'agente.usar');
    } else {
      const titulo = `Pesquisa · ${resumirTexto(p.tese, 100)}`;
      conversa = await db.transaction(async (tx) => {
        const c = (await tx.query(`INSERT INTO agente_conversas (usuario_id,mandato_id,titulo,contexto) VALUES ($1,$2,$3,$4) RETURNING *`,
          [u.id, p.mandatoId, titulo, JSON.stringify({ frente: p.frente ?? 'venda', objetivo: p.tese.slice(0, 2000) })])).rows[0];
        await registrar(tx, { usuarioId: u.id, mandatoId: p.mandatoId, entidade: 'agente_conversa', entidadeId: c.id, acao: 'criar', depois: { titulo } });
        return c;
      });
    }
    let recorte, proposta;
    try {
      recorte = await motor.base();
      proposta = await motor.propor(p.tese, { referencia: recorte.referencia,
        execucao: { usuarioId: u.id, conversaId: conversa.id, chave: p.id } });
    } catch {
      // A conversa criada só para esta pesquisa não fica órfã no "Continue de onde parou".
      if (!p.conversaId) await db.query('UPDATE agente_conversas SET arquivada_em=now() WHERE id=$1 AND arquivada_em IS NULL', [conversa.id]);
      throw new ErroHttp(503, 'base_indisponivel', 'A base de empresas não está disponível agora. Tente novamente.');
    }
    const criterios = proposta.criterios.length ? proposta.criterios
      : [{ id: 'atividade', texto: p.tese.slice(0, 200), obrigatorio: true, tipo: 'pesquisa', regra: null, trecho: null, origem: 'regras' }];
    const filtros = Filtros.parse(proposta.filtros);
    const frente = p.frente ?? proposta.frente ?? conversa.contexto?.frente ?? 'venda';
    const pesquisa = await db.transaction(async (tx) => {
      const r = (await tx.query(`INSERT INTO pesquisas_tese (id,conversa_id,usuario_id,tese,frente,filtros,criterios,meta,limite_web,catalogo_hash,referencia,funil,modo,notas)
        VALUES ($1,$2,$3,$4,$5,$6,$7,20,40,$8,$9,'{}',$10,$11) RETURNING ${CAMPOS}`,
      [p.id, conversa.id, u.id, p.tese, frente, JSON.stringify(filtros), JSON.stringify(criterios), recorte.hash, recorte.referencia,
        proposta.modo, JSON.stringify(proposta.notas)])).rows[0];
      await tx.query('UPDATE agente_conversas SET atualizado_em=now() WHERE id=$1', [conversa.id]);
      await registrar(tx, { usuarioId: u.id, mandatoId: conversa.mandato_id, entidade: 'pesquisa_tese', entidadeId: p.id, acao: 'criar',
        depois: { criterios: criterios.length, modo: proposta.modo } });
      return r;
    });
    return res.status(201).send(await detalhar(pesquisa));
  });

  app.get('/api/pesquisas/:id', async (req) => detalhar((await carregar(req, req.params.id)).pesquisa));

  /* Continuação de um grupo (categoria revisada ou fila), na mesma ordem da primeira resposta. */
  app.get('/api/pesquisas/:id/itens', async (req) => {
    const q = z.object({ grupo: z.enum(['aderente', 'provavel', 'a_confirmar', 'nao_aderente', 'fila']),
      offset: z.coerce.number().int().min(0).max(5000).default(0), limite: z.coerce.number().int().min(1).max(200).default(100),
      marca: z.string().regex(/^[a-f0-9]{32}$/).optional() }).strict().parse(req.query);
    const { pesquisa } = await carregar(req, req.params.id);
    const fila = q.grupo === 'fila';
    const filtro = fila ? "etapa<>'revisada'" : "etapa='revisada' AND categoria=$4";
    // Página, total e marca na mesma instrução: se a lista mudou desde a página de origem, recusa.
    const linhas = (await db.query(`WITH base AS MATERIALIZED (SELECT ${ITENS} FROM pesquisa_itens WHERE pesquisa_id=$1),
      resumo AS (SELECT ${MARCA_SQL} AS marca, count(*) FILTER (WHERE ${filtro})::int AS total FROM base),
      pagina AS (SELECT *, row_number() OVER (ORDER BY ${fila ? 'ordem' : ORDEM_SQL}) AS pos_ FROM base WHERE ${filtro}
        ORDER BY ${fila ? 'ordem' : ORDEM_SQL} LIMIT $2 OFFSET $3)
      SELECT r.marca, r.total, to_jsonb(x) AS item FROM resumo r LEFT JOIN pagina x ON true ORDER BY x.pos_`,
    fila ? [pesquisa.id, q.limite, q.offset] : [pesquisa.id, q.limite, q.offset, q.grupo])).rows;
    const { marca, total } = linhas[0];
    if (q.marca && q.marca !== marca) throw new ErroHttp(409, 'lista_atualizada', 'A lista mudou com novas revisões. Ela foi recarregada; peça mais de novo.');
    const itens = linhas.filter((l) => l.item).map(({ item: { pos_, ...i } }) => semAtributos(i));
    return { itens, total, marca, proximoOffset: q.offset + itens.length < total ? q.offset + itens.length : null };
  });

  /* Monitoramento semanal: ligar grava como linha de base as empresas já vistas na pesquisa. */
  app.put('/api/pesquisas/:id/monitoramento', async (req) => {
    const { ativo } = z.object({ ativo: z.boolean() }).strict().parse(req.body);
    const { pesquisa, conversa, usuario } = await carregar(req, req.params.id, 'agente.usar');
    if (pesquisa.estado === 'rascunho') throw new ErroHttp(409, 'pesquisa_rascunho', 'Inicie a pesquisa antes de monitorá-la.');
    const m = await definirMonitoramento(db, { pesquisaId: pesquisa.id, usuarioId: pesquisa.usuario_id, ativo });
    await registrar(db, { usuarioId: usuario.id, mandatoId: conversa.mandato_id, entidade: 'pesquisa_tese', entidadeId: pesquisa.id,
      acao: ativo ? 'monitorar' : 'parar_monitoramento', depois: { ativo } });
    return { monitoramento: monitoramentoPublico(m) };
  });

  /* Chamado pelo Meu dia: verifica os monitoramentos vencidos da pessoa (no máximo dois por vez). */
  app.post('/api/monitoramentos/verificar', async (req) => {
    const u = req.exigir('agente.ler');
    const feitos = await verificarVencidos(db, motor, u.id);
    return { verificados: feitos.length, falhas: feitos.filter((f) => f.falhou).length };
  });

  /* Abrir a pesquisa a partir do aviso marca as novidades dela como vistas. */
  app.post('/api/pesquisas/:id/novidades/vistas', async (req) => {
    const { pesquisa } = await carregar(req, req.params.id);
    const r = await db.query('UPDATE monitoramento_novidades SET vista_em=now() WHERE pesquisa_id=$1 AND vista_em IS NULL RETURNING id', [pesquisa.id]);
    return { vistas: r.rows.length };
  });

  /* Item completo (justificativas, trechos citados, páginas lidas), pedido ao abrir a empresa. */
  app.get('/api/pesquisas/:id/itens/:empresaId', async (req) => {
    const empresaId = z.string().regex(/^cnpj\d{8}$/).parse(req.params.empresaId);
    const { pesquisa } = await carregar(req, req.params.id);
    const item = (await db.query(`SELECT ${ITENS} FROM pesquisa_itens WHERE pesquisa_id=$1 AND empresa_id=$2`, [pesquisa.id, empresaId])).rows[0];
    if (!item) throw new ErroHttp(404, 'item_inexistente', 'Empresa não encontrada nesta pesquisa.');
    return { item: semAtributos(item) };
  });

  /* Edição do rascunho: critérios, recorte, frente, meta e limite de pesquisas no site. */
  app.patch('/api/pesquisas/:id', async (req) => {
    const p = z.object({ versao: Versao, criterios: ListaCriterios.optional(), filtros: Filtros.optional(),
      frente: z.enum(['compra', 'venda']).optional(), meta: z.number().int().min(1).max(200).optional(),
      limiteWeb: z.number().int().min(0).max(500).optional() }).strict().parse(req.body);
    const { pesquisa, conversa, usuario } = await carregar(req, req.params.id, 'agente.usar');
    const nova = await db.transaction(async (tx) => {
      const atual = (await tx.query(`SELECT ${CAMPOS} FROM pesquisas_tese WHERE id=$1 FOR UPDATE`, [pesquisa.id])).rows[0];
      if (atual.versao !== p.versao) throw new ErroHttp(409, 'pesquisa_atualizada', 'A pesquisa mudou em outra aba. Reabra-a antes de salvar.');
      const soLimites = !p.criterios && !p.filtros && !p.frente;
      if (atual.estado !== 'rascunho' && !soLimites) throw new ErroHttp(409, 'pesquisa_iniciada', 'Critérios de uma pesquisa iniciada não mudam. Use "Ajustar critérios" para uma nova rodada.');
      const r = (await tx.query(`UPDATE pesquisas_tese SET criterios=COALESCE($2,criterios), filtros=COALESCE($3,filtros), frente=COALESCE($4,frente),
          meta=COALESCE($5,meta), limite_web=COALESCE($6,limite_web), versao=versao+1, atualizado_em=now(),
          estado=CASE WHEN estado='concluida' AND $7 THEN 'pausada' ELSE estado END
        WHERE id=$1 RETURNING ${CAMPOS}`, [pesquisa.id, p.criterios ? JSON.stringify(p.criterios) : null, p.filtros ? JSON.stringify(p.filtros) : null,
        p.frente ?? null, p.meta ?? null, p.limiteWeb ?? null, Boolean((p.meta && p.meta > atual.meta) || (p.limiteWeb && p.limiteWeb > atual.limite_web))])).rows[0];
      await registrar(tx, { usuarioId: usuario.id, mandatoId: conversa.mandato_id, entidade: 'pesquisa_tese', entidadeId: pesquisa.id, acao: 'editar',
        depois: { criterios: p.criterios?.length, filtros: p.filtros, meta: p.meta, limiteWeb: p.limiteWeb } });
      return r;
    });
    return detalhar(nova);
  });

  /* Funil sem gravar: para o membro ver o efeito de cada critério antes de rodar. */
  app.post('/api/pesquisas/:id/previa', async (req) => {
    await carregar(req, req.params.id, 'agente.usar');
    const p = z.object({ criterios: ListaCriterios, filtros: Filtros }).strict().parse(req.body);
    try { return await motor.previa(p.filtros, p.criterios); }
    catch { throw new ErroHttp(503, 'base_indisponivel', 'A base de empresas não está disponível agora. Tente novamente.'); }
  });

  app.post('/api/pesquisas/:id/iniciar', async (req) => {
    const { versao } = z.object({ versao: Versao }).strict().parse(req.body);
    const { pesquisa, conversa, usuario } = await carregar(req, req.params.id, 'agente.usar');
    if (pesquisa.estado !== 'rascunho') return detalhar(pesquisa);
    if (pesquisa.versao !== versao) throw new ErroHttp(409, 'pesquisa_atualizada', 'A pesquisa mudou em outra aba. Reabra-a antes de iniciar.');
    let r;
    try { r = await motor.calcular(pesquisa); }
    catch { throw new ErroHttp(503, 'base_indisponivel', 'A base de empresas não está disponível agora. Tente novamente.'); }
    const nova = await db.transaction(async (tx) => {
      const atual = (await tx.query(`SELECT ${CAMPOS} FROM pesquisas_tese WHERE id=$1 FOR UPDATE`, [pesquisa.id])).rows[0];
      if (atual.estado !== 'rascunho') return atual;
      // A versão garante que os critérios calculados são os que estão gravados.
      if (atual.versao !== versao) throw new ErroHttp(409, 'pesquisa_atualizada', 'A pesquisa mudou em outra aba. Reabra-a antes de iniciar.');
      await motor.gravarItens(tx, atual.id, r.itens);
      const salva = (await tx.query(`UPDATE pesquisas_tese SET estado=$2, motivo_estado=$3, funil=$4, catalogo_hash=$5, referencia=$6,
        versao=versao+1, atualizado_em=now() WHERE id=$1 RETURNING ${CAMPOS}`, [atual.id, r.estado, r.motivo, JSON.stringify(r.funil), r.hash, r.referencia])).rows[0];
      await tx.query('UPDATE agente_conversas SET atualizado_em=now() WHERE id=$1', [conversa.id]);
      await registrar(tx, { usuarioId: usuario.id, mandatoId: conversa.mandato_id, entidade: 'pesquisa_tese', entidadeId: atual.id, acao: 'iniciar',
        depois: { aprovadasCadastro: r.funil.aprovadasCadastro, recorte: r.funil.recorte } });
      return salva;
    });
    return detalhar(nova);
  });

  /* Um lote de revisão. Sem `execucao`, é o clique de quem retoma (abre uma geração nova se estava
     pronta/pausada); com `execucao`, é a continuação de um laço, que só segue na MESMA geração ainda
     em andamento. Assim um lote antigo não desfaz uma pausa, conclusão ou retomada mais recente. */
  app.post('/api/pesquisas/:id/avancar', async (req) => {
    const { quantidade, execucao: continuacao } = z.object({ quantidade: z.number().int().min(1).max(5).default(3),
      execucao: z.number().int().min(0).optional() }).strict().parse(req.body ?? {});
    const { pesquisa, usuario } = await carregar(req, req.params.id, 'agente.usar');
    // `execucaoLote`: a geração em que ESTE pedido rodou; null quando não rodou. É a ficha que o
    // laço usa para continuar e para a sua pausa automática (nunca a geração mais nova de outro).
    const parado = async () => ({ ...(await detalhar((await db.query(`SELECT ${CAMPOS} FROM pesquisas_tese WHERE id=$1`, [pesquisa.id])).rows[0])), atualizados: [], execucaoLote: null });
    if (!['pronta', 'em_andamento', 'pausada'].includes(pesquisa.estado)) return parado();
    // Transição condicional ao que esta chamada leu: versão (retomada) ou geração (continuação).
    const vigente = (continuacao === undefined
      ? await db.query(`UPDATE pesquisas_tese SET estado='em_andamento', motivo_estado=NULL,
            execucao=CASE WHEN estado IN ('pronta','pausada') THEN execucao+1 ELSE execucao END,
            versao=CASE WHEN estado IN ('pronta','pausada') THEN versao+1 ELSE versao END
          WHERE id=$1 AND versao=$2 AND estado IN ('pronta','em_andamento','pausada') RETURNING execucao`, [pesquisa.id, pesquisa.versao])
      : await db.query(`SELECT execucao FROM pesquisas_tese WHERE id=$1 AND estado='em_andamento' AND execucao=$2`, [pesquisa.id, continuacao])).rows[0];
    if (!vigente) return parado();
    const { execucao } = vigente;
    const r = await motor.avancar(pesquisa, usuario, { quantidade, execucao });
    // Revalida o escopo antes de gravar o estado: a sessão pode ter caído durante a leitura dos sites.
    await req.revalidarSessao();
    const { pesquisa: depois } = await carregar(req, pesquisa.id, 'agente.usar');
    // Só grava se ninguém pausou nem retomou em outra aba durante o lote: a decisão mais recente vale.
    const salva = r.interrompida ? depois : (await db.query(`UPDATE pesquisas_tese SET estado=$2, motivo_estado=$3, atualizado_em=now(), versao=versao+1
      WHERE id=$1 AND estado='em_andamento' AND execucao=$4 RETURNING ${CAMPOS}`, [depois.id, r.estado, r.motivo, execucao])).rows[0] ?? depois;
    return { ...(await detalhar(salva)), atualizados: r.atualizados.map((i) => i.empresa_id), execucaoLote: execucao };
  });

  /* Sem `execucao`: pausa humana da execução (compartilhada entre abas). Com `execucao`: pausa
     automática de um laço, que só vale para a geração dele; não desfaz retomada mais nova. */
  app.post('/api/pesquisas/:id/pausar', async (req) => {
    const { execucao } = z.object({ execucao: z.number().int().min(0).optional() }).strict().parse(req.body ?? {});
    const { pesquisa } = await carregar(req, req.params.id, 'agente.usar');
    const r = (await db.query(`UPDATE pesquisas_tese SET estado='pausada', motivo_estado='Pausada por você.', versao=versao+1, atualizado_em=now()
      WHERE id=$1 AND estado IN ('pronta','em_andamento') AND ($2::int IS NULL OR (estado='em_andamento' AND execucao=$2::int)) RETURNING ${CAMPOS}`,
    [pesquisa.id, execucao ?? null])).rows[0];
    return detalhar(r ?? (await db.query(`SELECT ${CAMPOS} FROM pesquisas_tese WHERE id=$1`, [pesquisa.id])).rows[0]);
  });

  /* Nova rodada no mesmo trabalho, partindo dos critérios desta. A anterior fica no histórico. */
  app.post('/api/pesquisas/:id/ajustar', async (req, res) => {
    const { id } = z.object({ id: Id }).strict().parse(req.body);
    const { pesquisa, conversa, usuario } = await carregar(req, req.params.id, 'agente.usar');
    const existente = (await db.query(`SELECT ${CAMPOS} FROM pesquisas_tese WHERE id=$1`, [id])).rows[0];
    if (existente) {
      if (existente.anterior_id !== pesquisa.id || existente.usuario_id !== usuario.id) throw new ErroHttp(409, 'pesquisa_ja_existe', 'Este envio já foi usado. Atualize a página.');
      return detalhar(existente);
    }
    const nova = await db.transaction(async (tx) => {
      const r = (await tx.query(`INSERT INTO pesquisas_tese (id,conversa_id,usuario_id,anterior_id,tese,frente,filtros,criterios,meta,limite_web,catalogo_hash,referencia,funil,modo,notas)
        SELECT $2,conversa_id,usuario_id,id,tese,frente,filtros,criterios,meta,limite_web,catalogo_hash,referencia,'{}',modo,'[]' FROM pesquisas_tese WHERE id=$1
        RETURNING ${CAMPOS}`, [pesquisa.id, id])).rows[0];
      await registrar(tx, { usuarioId: usuario.id, mandatoId: conversa.mandato_id, entidade: 'pesquisa_tese', entidadeId: id, acao: 'ajustar', depois: { anterior: pesquisa.id } });
      return r;
    });
    return res.status(201).send(await detalhar(nova));
  });

  /* Leva as empresas escolhidas para o trabalho como resultado: daí seguem seleção, reunião e oportunidade. */
  app.post('/api/pesquisas/:id/registrar', async (req) => {
    const p = z.object({ chave: Id, empresas: z.array(z.string().regex(/^cnpj\d{8}$/)).min(1).max(30) }).strict().parse(req.body);
    const { pesquisa, usuario } = await carregar(req, req.params.id, 'agente.usar');
    const itens = (await db.query(`SELECT * FROM pesquisa_itens WHERE pesquisa_id=$1 AND empresa_id=ANY($2::text[]) AND etapa='revisada'`, [pesquisa.id, [...new Set(p.empresas)]])).rows;
    if (itens.length !== new Set(p.empresas).size) throw new ErroHttp(422, 'empresa_fora_da_pesquisa', 'Escolha empresas já revisadas nesta pesquisa.');
    itens.sort(ordenarItens);
    const ROTULO = { aderente: 'aderente', provavel: 'provável', a_confirmar: 'a confirmar', nao_aderente: 'não aderente' };
    const SIMBOLO = { atende: '✓', indicio: '≈', indeterminado: '?', nao_atende: '✗' };
    const empresas = itens.map((i) => { const { atributos, dominio, ...e } = i.empresa; return { ...e, aderencia: i.aderencia, categoria: i.categoria }; });
    // Lastro da entrega: cada critério leva o veredito e as evidências efetivamente citadas
    // (trecho, URL e data da leitura), e as fontes incluem toda página citada, não só a inicial.
    const lidaEm = (i, url) => i.site?.paginas?.find((pg) => pg.url === url)?.obtidaEm ?? null;
    const avaliacoes = itens.map((i) => ({ empresaId: i.empresa_id, aderencia: i.aderencia, categoria: i.categoria,
      criterios: pesquisa.criterios.map((c, k) => ({ id: c.id, texto: c.texto, obrigatorio: c.obrigatorio, tipo: c.tipo,
        veredito: i.vereditos[k]?.veredito ?? 'indeterminado', resumo: i.vereditos[k]?.resumo ?? '', lastro: i.vereditos[k]?.lastro ?? null,
        evidencias: (i.vereditos[k]?.evidencias ?? []).map((ev) => ({ ...ev, ...(ev.url ? { lidaEm: lidaEm(i, ev.url) } : {}) })) })) }));
    const citadas = new Map();
    for (const a of avaliacoes) for (const c of a.criterios) for (const ev of c.evidencias) {
      if (ev.url && !citadas.has(ev.url)) citadas.set(ev.url, { titulo: `Site · ${itens.find((i) => i.empresa_id === a.empresaId).empresa.nome}`, url: ev.url,
        referencia: ev.lidaEm ? `lida em ${ev.lidaEm.slice(0, 10).split('-').reverse().join('/')}` : ev.referencia,
        descricao: 'Página pública citada como evidência na revisão por critério. Confira o trecho antes de usar.' });
    }
    const sites = [...citadas.values()];
    const evidenciasTexto = avaliacoes.flatMap((a) => a.criterios.flatMap((c) => c.evidencias.filter((ev) => ev.trecho).slice(0, 1)
      .map((ev) => `${itens.find((i) => i.empresa_id === a.empresaId).empresa.nome} · ${c.texto}: "${resumirTexto(ev.trecho, 160)}" (${ev.url ?? ev.fonte})`))).slice(0, 40);
    const resultado = {
      modo: 'pesquisa_por_tese', titulo: `Pesquisa por tese · ${empresas.length} ${empresas.length === 1 ? 'empresa' : 'empresas'}`,
      resumo: `Empresas escolhidas na pesquisa "${resumirTexto(pesquisa.tese, 160)}". Aderência calculada critério a critério; cada veredito traz a fonte. Ausência de evidência ficou como "?" e não como reprovação.`,
      empresas, fontes: [{ titulo: 'Receita Federal — cadastro CNPJ', referencia: pesquisa.referencia, descricao: 'Critérios cadastrais conferidos no snapshot indicado.' }, ...sites].slice(0, 40),
      pesquisa: { id: pesquisa.id, tese: pesquisa.tese, referencia: pesquisa.referencia, catalogoHash: pesquisa.catalogo_hash },
      avaliacoes,
      blocos: [
        { titulo: 'Critérios da pesquisa', itens: pesquisa.criterios.map((c) => `${c.obrigatorio ? 'Obrigatório' : 'Opcional'} · ${c.texto} (${c.tipo === 'cadastro' ? 'cadastro' : 'fonte pública'})`) },
        { titulo: 'Aderência por empresa', itens: itens.map((i) => `${i.empresa.nome}: ${i.aderencia}% · ${ROTULO[i.categoria]} · ${pesquisa.criterios.map((c, k) => `${SIMBOLO[i.vereditos[k]?.veredito] ?? '?'} ${c.texto}`).join(' · ')}`) },
        ...(evidenciasTexto.length ? [{ titulo: 'Evidências citadas', itens: evidenciasTexto }] : []),
        { titulo: 'Antes de priorizar', itens: ['Confirme com a empresa os critérios marcados com "?" e "≈".', 'Cadastro e site não informam faturamento nem intenção de transação.'] },
      ],
      proximas: ['preparar_reuniao', 'mapear_acesso', 'registrar_passo'],
    };
    const salvo = await db.transaction(async (tx) => {
      const c = (await tx.query('SELECT * FROM agente_conversas WHERE id=$1 FOR UPDATE', [pesquisa.conversa_id])).rows[0];
      const corpoHash = createHash('sha256').update(JSON.stringify({ pesquisa: pesquisa.id, empresas: p.empresas })).digest('hex');
      const repetido = (await tx.query('SELECT * FROM agente_turnos WHERE conversa_id=$1 AND chave=$2', [c.id, p.chave])).rows[0];
      if (repetido) {
        if (repetido.corpo_hash !== corpoHash) throw new ErroHttp(409, 'pedido_diferente', 'Este envio já foi usado com outro conteúdo.');
        return { turno: repetido, conversa: c };
      }
      const pedido = { tarefa: 'pesquisar_tese', texto: pesquisa.tese, contexto: { ...c.contexto, frente: pesquisa.frente, pesquisaId: pesquisa.id } };
      const turno = (await tx.query(`INSERT INTO agente_turnos (conversa_id,chave,corpo_hash,numero,pedido,resultado) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [c.id, p.chave, corpoHash, c.versao + 1, JSON.stringify(pedido), JSON.stringify(resultado)])).rows[0];
      const conversa = (await tx.query(`UPDATE agente_conversas SET versao=versao+1, contexto=contexto || $2::jsonb, atualizado_em=now() WHERE id=$1 RETURNING *`,
        [c.id, JSON.stringify({ frente: pesquisa.frente })])).rows[0];
      await tx.query('UPDATE pesquisas_tese SET turno_id=$2 WHERE id=$1', [pesquisa.id, turno.id]);
      await registrar(tx, { usuarioId: usuario.id, mandatoId: c.mandato_id, entidade: 'agente_conversa', entidadeId: c.id, acao: 'executar_tarefa',
        depois: { tarefa: 'pesquisar_tese', turno: turno.id, empresas: empresas.length }, runId: p.chave });
      return { turno, conversa };
    });
    return salvo;
  });
}
