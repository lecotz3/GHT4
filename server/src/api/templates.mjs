/* =============================================================================
 *  GHT4 · API de templates de triagem
 * -----------------------------------------------------------------------------
 *  Tira a régua de triagem do `localStorage` de uma pessoa e a põe onde o time
 *  alcança — com versão, autor e trilha.
 *
 *  A REGRA CENTRAL
 *  Salvar por cima apaga a régua que produziu a lista de ontem, e aí "por que
 *  esta empresa entrou na shortlist?" fica sem resposta. Por isso editar cria
 *  uma VERSÃO nova, e versão já usada é imutável — regra imposta pelo banco.
 * ========================================================================== */

import crypto from 'node:crypto';
import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { consultar, consultarUm } from '../db/cliente.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { comIdempotencia } from './idempotencia.mjs';
import { FiltrosBusca } from '../agente/filtros.mjs';

/* A régua. Frouxa de propósito no miolo: a Fase 4 traz a DSL validada, e travar
   o formato agora obrigaria a migrar duas vezes. O que já é exigido é o que dá
   para verificar hoje sem inventar contrato. */
const Configuracao = z.object({
  buscaAgente: FiltrosBusca.optional(),
  filtrosDuros: z.array(z.object({
    campo: z.string().min(1),
    operador: z.string().min(1),
    valor: z.unknown().optional(),
  })).default([]),
  preferencias: z.array(z.object({
    campo: z.string().min(1),
    peso: z.number().finite(),
  })).default([]),
  politicaDadoAusente: z.enum(['sinalizar', 'excluir', 'tratar_como_zero']).default('sinalizar'),
  coberturaMinima: z.number().min(0).max(1).nullable().default(null),
}).passthrough();

const CorpoCriar = z.object({
  nome: z.string().min(1).max(120),
  descricao: z.string().max(2000).optional(),
  mandatoId: z.string().uuid().nullable().optional(),
  configuracao: Configuracao,
  nota: z.string().max(500).optional(),
});

const CorpoNovaVersao = z.object({
  baseVersao: z.number().int().min(1).optional(),
  configuracao: Configuracao,
  nota: z.string().max(500).optional(),
});

function hashDaConfiguracao(configuracao) {
  /* Chaves ordenadas: a mesma régua escrita em outra ordem tem de dar o mesmo
     hash, senão "é a mesma regra?" fica sem resposta confiável. */
  const estavel = JSON.stringify(configuracao,(_k,v)=>v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  return crypto.createHash('sha256').update(estavel).digest('hex');
}

/**
 * Confere que o usuário alcança o escopo pedido.
 * Template sem mandato é da casa; com mandato, vale o escopo do mandato.
 */
async function exigirEscopo(req, mandatoId, permissao) {
  if (mandatoId) return req.exigirNoMandato(mandatoId, permissao);
  return { usuario: req.exigir(permissao), mandato: null };
}

export async function registrarRotasDeTemplate(app) {
  const { db } = app;

  /* ---- listar ------------------------------------------------------------ */
  app.get('/api/templates', async (req) => {
    const u = req.exigirAutenticado();

    /* O filtro é do SQL: trazer tudo e filtrar depois é como vazamento
       acontece. Admin vê tudo; os demais veem o da casa mais o dos mandatos
       que alcançam. */
    const linhas = u.papel === 'admin'
      ? await consultar(db,
          `SELECT t.*, (SELECT max(versao) FROM templates_versoes v WHERE v.template_id = t.id) AS versao_atual
             FROM templates_triagem t WHERE t.arquivado = FALSE ORDER BY t.atualizado_em DESC`)
      : await consultar(db,
          `SELECT t.*, (SELECT max(versao) FROM templates_versoes v WHERE v.template_id = t.id) AS versao_atual
             FROM templates_triagem t
             LEFT JOIN mandato_membros mm
               ON mm.mandato_id = t.mandato_id AND mm.usuario_id = $1
            WHERE t.arquivado = FALSE
              AND (t.mandato_id IS NULL OR mm.usuario_id IS NOT NULL)
            ORDER BY t.atualizado_em DESC`, [u.id]);

    return { templates: linhas };
  });

  /* ---- criar ------------------------------------------------------------- */
  app.post('/api/templates', async (req, resposta) => {
    const corpo = CorpoCriar.parse(req.body);
    const { usuario, mandato } = await exigirEscopo(req, corpo.mandatoId ?? null, 'template.criar');

    const resultado = await comIdempotencia(db, req, async () => {
      const criado = await db.transaction(async (tx) => {
        const t = (await tx.query(
          `INSERT INTO templates_triagem (mandato_id, nome, descricao, criado_por)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [corpo.mandatoId ?? null, corpo.nome, corpo.descricao ?? null, usuario.id],
        )).rows[0];

        const v = (await tx.query(
          `INSERT INTO templates_versoes (template_id, versao, configuracao, conteudo_hash, nota, criado_por)
           VALUES ($1, 1, $2, $3, $4, $5) RETURNING *`,
          [t.id, JSON.stringify(corpo.configuracao), hashDaConfiguracao(corpo.configuracao),
           corpo.nota ?? null, usuario.id],
        )).rows[0];

        await registrar(tx, {
          usuarioId: usuario.id,
          mandatoId: corpo.mandatoId ?? null,
          acao: 'criar',
          entidade: 'template',
          entidadeId: t.id,
          depois: { nome: t.nome, versao: 1, hash: v.conteudo_hash },
        });

        return { template: t, versao: v };
      });
      return { status: 201, corpo: criado };
    });

    return resposta.status(resultado.status).send(resultado.corpo);
  });

  /* ---- ler, com as versões ----------------------------------------------- */
  app.get('/api/templates/:id', async (req) => {
    const t = await consultarUm(db, 'SELECT * FROM templates_triagem WHERE id = $1', [req.params.id]);
    if (!t) throw new ErroHttp(404, 'template_inexistente', 'Template não encontrado.');
    await exigirEscopo(req, t.mandato_id, 'triagem.ler');

    const versoes = await consultar(db,
      `SELECT id, versao, conteudo_hash, configuracao, nota, criado_em, criado_por, usada_em
         FROM templates_versoes WHERE template_id = $1 ORDER BY versao DESC`, [t.id]);

    const atual = await consultarUm(db,
      `SELECT * FROM templates_versoes WHERE template_id = $1 ORDER BY versao DESC LIMIT 1`, [t.id]);

    let podeEditar=false;
    try{await exigirEscopo(req,t.mandato_id,'template.editar');podeEditar=true}catch(e){if(!(e instanceof ErroHttp))throw e}
    return { template: t, versaoAtual: atual, versoes, podeEditar };
  });

  /* ---- nova versão ------------------------------------------------------- */
  app.post('/api/templates/:id/versoes', async (req, resposta) => {
    const corpo = CorpoNovaVersao.parse(req.body);
    const t = await consultarUm(db, 'SELECT * FROM templates_triagem WHERE id = $1', [req.params.id]);
    if (!t) throw new ErroHttp(404, 'template_inexistente', 'Template não encontrado.');
    const { usuario } = await exigirEscopo(req, t.mandato_id, 'template.editar');

    const resultado = await comIdempotencia(db, req, async () => {
      const nova = await db.transaction(async (tx) => {
        await tx.query('SELECT id FROM templates_triagem WHERE id=$1 FOR UPDATE',[t.id]);
        const ultima = (await tx.query(
          `SELECT versao, conteudo_hash, configuracao FROM templates_versoes
            WHERE template_id = $1 ORDER BY versao DESC LIMIT 1`, [t.id],
        )).rows[0];

        const hash = hashDaConfiguracao(corpo.configuracao);
        /* Régua idêntica não vira versão nova: o histórico ficaria cheio de
           entradas que não mudam nada, e achar a mudança real fica mais caro. */
        if(corpo.baseVersao!==undefined && corpo.baseVersao!==ultima?.versao)throw new ErroHttp(409,'modelo_atualizado','O modelo mudou. Reabra a versão mais recente antes de salvar.');
        if (ultima && hashDaConfiguracao(ultima.configuracao) === hash) {
          throw new ErroHttp(409, 'sem_mudanca',
            'Esta configuração é idêntica à versão atual. Nada a versionar.');
        }

        const v = (await tx.query(
          `INSERT INTO templates_versoes (template_id, versao, configuracao, conteudo_hash, nota, criado_por)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [t.id, (ultima?.versao ?? 0) + 1, JSON.stringify(corpo.configuracao), hash,
           corpo.nota ?? null, usuario.id],
        )).rows[0];

        await tx.query('UPDATE templates_triagem SET atualizado_em = now() WHERE id = $1', [t.id]);

        await registrar(tx, {
          usuarioId: usuario.id,
          mandatoId: t.mandato_id,
          acao: 'versionar',
          entidade: 'template',
          entidadeId: t.id,
          antes: { versao: ultima?.versao ?? null, hash: ultima?.conteudo_hash ?? null },
          depois: { versao: v.versao, hash: v.conteudo_hash },
          justificativa: corpo.nota ?? null,
        });

        return v;
      });
      return { status: 201, corpo: { versao: nova } };
    });

    return resposta.status(resultado.status).send(resultado.corpo);
  });

  /* ---- marcar versão como usada ------------------------------------------ */
  app.post('/api/templates/:id/versoes/:versao/usar', async (req) => {
    const t = await consultarUm(db, 'SELECT * FROM templates_triagem WHERE id = $1', [req.params.id]);
    if (!t) throw new ErroHttp(404, 'template_inexistente', 'Template não encontrado.');
    const { usuario } = await exigirEscopo(req, t.mandato_id, 'template.usar');

    return db.transaction(async (tx) => {
      const v = (await tx.query(
        `UPDATE templates_versoes SET usada_em = COALESCE(usada_em, now())
          WHERE template_id = $1 AND versao = $2 RETURNING *`,
        [t.id, Number(req.params.versao)],
      )).rows[0];

      if (!v) throw new ErroHttp(404, 'versao_inexistente', 'Versão não encontrada.');

      await registrar(tx, {
        usuarioId: usuario.id, mandatoId: t.mandato_id,
        acao: 'usar', entidade: 'template', entidadeId: t.id,
        depois: { versao: v.versao, hash: v.conteudo_hash },
      });

      return { versao: v };
    });
  });

  /* ---- importar o que está no navegador ---------------------------------- */
  const CorpoImportar = z.object({
    mandatoId: z.string().uuid().nullable().optional(),
    /* O formato de `ght4.templates.v1`: um objeto id → template. */
    templates: z.record(z.object({
      id: z.string().optional(),
      nome: z.string().min(1).max(120),
      salvoEm: z.string().optional(),
      configuracao: z.record(z.unknown()),
    })),
  });

  /**
   * Importação única do que já existe no `localStorage` de alguém.
   *
   * Idempotente por nome dentro do escopo: importar duas vezes não duplica, e
   * relata o que pulou. Sem isso, quem clicasse duas vezes ficaria com duas
   * cópias de cada régua e nenhuma forma fácil de saber qual usar.
   */
  app.post('/api/templates/importar', async (req) => {
    const corpo = CorpoImportar.parse(req.body);
    const { usuario } = await exigirEscopo(req, corpo.mandatoId ?? null, 'template.criar');

    const importados = [];
    const pulados = [];

    for (const bruto of Object.values(corpo.templates)) {
      const jaExiste = await consultarUm(db,
        `SELECT id FROM templates_triagem
          WHERE lower(nome) = lower($1) AND arquivado = FALSE
            AND mandato_id IS NOT DISTINCT FROM $2`,
        [bruto.nome, corpo.mandatoId ?? null]);

      if (jaExiste) {
        pulados.push({ nome: bruto.nome, motivo: 'já existe um template ativo com este nome' });
        continue;
      }

      const configuracao = Configuracao.parse(bruto.configuracao);

      const criado = await db.transaction(async (tx) => {
        const t = (await tx.query(
          `INSERT INTO templates_triagem (mandato_id, nome, descricao, criado_por)
           VALUES ($1, $2, $3, $4) RETURNING id, nome`,
          [corpo.mandatoId ?? null, bruto.nome,
           `Importado do navegador${bruto.salvoEm ? ` (salvo em ${bruto.salvoEm})` : ''}.`,
           usuario.id],
        )).rows[0];

        await tx.query(
          `INSERT INTO templates_versoes (template_id, versao, configuracao, conteudo_hash, nota, criado_por)
           VALUES ($1, 1, $2, $3, $4, $5)`,
          [t.id, JSON.stringify(configuracao), hashDaConfiguracao(configuracao),
           'Importação do localStorage', usuario.id],
        );

        await registrar(tx, {
          usuarioId: usuario.id, mandatoId: corpo.mandatoId ?? null,
          acao: 'importar', entidade: 'template', entidadeId: t.id,
          depois: { nome: t.nome, origem: 'localStorage' },
        });

        return t;
      });

      importados.push(criado);
    }

    return { importados, pulados };
  });
}
