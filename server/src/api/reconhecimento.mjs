import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { Id, EmpresaId, normalizar } from '../rede/contratos.mjs';

/* =============================================================================
 *  GHT4 · passada de reconhecimento
 * -----------------------------------------------------------------------------
 *  A rede não enche pedindo à casa que a mapeie. Pedir "liste quem você conhece
 *  no setor" é pedir um esforço de memória sem âncora, e ninguém responde. O que
 *  funciona é mostrar o nome e perguntar se reconhece — lembrar é caro,
 *  reconhecer é barato, e essa diferença é o que separa um grafo cheio de um
 *  grafo vazio.
 *
 *  Por isso a ordem importa: primeiro o roster de quem manda nas empresas,
 *  depois a pergunta. Nome de empresa não puxa memória; nome de pessoa puxa.
 *
 *  O "NÃO CONHEÇO" É O REGISTRO MAIS IMPORTANTE DESTA ROTA
 *  Sem ele o produto não distingue "a rede não foi consultada" de "foi
 *  consultada e não há caminho" — e essas duas respostas levam a decisões
 *  opostas: uma manda procurar outra via, a outra manda parar. Também é o que
 *  impede que o mesmo par seja perguntado de novo daqui a um mês por outro
 *  analista, que é como se queima a paciência de quem responde.
 * ========================================================================== */

const RESPOSTAS = Object.freeze([
  { id: 'posso_apresentar', rotulo: 'Conheço e posso apresentar', gera: 'posso_apresentar' },
  { id: 'conheco', rotulo: 'Conheço', gera: 'conheco' },
  { id: 'talvez', rotulo: 'Talvez, preciso confirmar', gera: 'nao_confirmado' },
  { id: 'nao_conheco', rotulo: 'Não conheço', gera: null },
]);
const Resposta = z.enum(RESPOSTAS.map((r) => r.id));
const respostaDe = (id) => RESPOSTAS.find((r) => r.id === id);

export async function registrarReconhecimento(app) {
  const { db } = app;

  /** A pessoa da rede que representa quem está respondendo, quando existe. */
  async function euNaRede(usuarioId, tx = db) {
    return (await tx.query(
      "SELECT id, nome FROM rede_pessoas WHERE lado = 'ght4' AND ativo AND usuario_id = $1", [usuarioId])).rows[0] ?? null;
  }

  app.get('/api/rede/reconhecimento', async (req, res) => {
    const u = req.exigir('rede.ler');
    const q = z.object({
      pessoaGht4Id: Id.optional(),
      empresaId: EmpresaId.optional(),
      empresa: z.string().trim().max(160).default(''),
      limite: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);

    /* Quem responde precisa existir na rede: o vínculo que a resposta gera sai
       de uma pessoa, não de uma conta. Sem isso a pergunta não teria sujeito. */
    const quem = q.pessoaGht4Id
      ? (await db.query("SELECT id, nome FROM rede_pessoas WHERE id = $1 AND lado = 'ght4' AND ativo", [q.pessoaGht4Id])).rows[0]
      : await euNaRede(u.id);
    if (!quem) {
      return { pendentes: [], respondidas: 0, total: 0, respostas: RESPOSTAS, quem: null,
        aviso: 'Você ainda não está cadastrado na rede como pessoa da GHT4. Cadastre-se em Rede, ou escolha por quem está respondendo.' };
    }

    const organizacao = normalizar(q.empresa);
    const filtro = `p.lado = 'mercado' AND p.ativo
      AND ($2::text IS NULL OR p.empresa_id = $2)
      AND ($3 = '' OR p.organizacao_normalizada = $3)`;
    const valores = [quem.id, q.empresaId ?? null, organizacao];

    const totais = (await db.query(
      `SELECT count(*)::int AS total,
              count(r.id)::int AS respondidas
         FROM rede_pessoas p
         LEFT JOIN rede_reconhecimentos r ON r.pessoa_alvo_id = p.id AND r.pessoa_ght4_id = $1
        WHERE ${filtro}`, valores)).rows[0];

    /* Ordem: quem decide primeiro, e dentro disso o nome. Perguntar na ordem do
       banco faria a passada começar por gente sem poder de decisão, que é onde a
       atenção de quem responde se perde. */
    const pendentes = (await db.query(
      `SELECT p.id, p.nome, p.cargo, p.senioridade, p.organizacao, p.empresa_id, p.origem, p.origem_referencia
         FROM rede_pessoas p
         LEFT JOIN rede_reconhecimentos r ON r.pessoa_alvo_id = p.id AND r.pessoa_ght4_id = $1
        WHERE ${filtro} AND r.id IS NULL
        ORDER BY CASE p.senioridade WHEN 'ceo' THEN 0 WHEN 'conselho' THEN 1 WHEN 'cfo' THEN 2
          WHEN 'diretoria' THEN 3 WHEN 'gerencia' THEN 4 ELSE 5 END, p.organizacao, p.nome, p.id
        LIMIT $4`, [...valores, q.limite])).rows;

    res.header('Cache-Control', 'no-store');
    return { quem, pendentes, respostas: RESPOSTAS,
      total: totais.total, respondidas: totais.respondidas,
      cobertura: totais.total ? Math.round(totais.respondidas / totais.total * 100) : 0 };
  });

  app.post('/api/rede/reconhecimento', async (req, res) => {
    const u = req.exigir('rede.editar');
    const p = z.object({
      id: Id,
      pessoaGht4Id: Id.optional(),
      pessoaAlvoId: Id,
      resposta: Resposta,
      observacao: z.string().trim().max(1000).default(''),
      evidencia: z.string().trim().max(2000).default(''),
      forca: z.enum(['direta', 'indireta', 'fraca']).default('indireta'),
      vinculoId: Id.optional(),
    }).strict().parse(req.body);

    const r = respostaDe(p.resposta);
    // Uma resposta positiva vira vínculo, e vínculo sem evidência não entra.
    if (r.gera && p.evidencia.trim().length < 10) {
      throw new ErroHttp(422, 'evidencia_necessaria', 'Diga em uma linha de onde vocês se conhecem. É o que aparece como base da conversa.');
    }

    const salvo = await db.transaction(async (tx) => {
      const quem = p.pessoaGht4Id
        ? (await tx.query("SELECT id, nome FROM rede_pessoas WHERE id = $1 AND lado = 'ght4' AND ativo", [p.pessoaGht4Id])).rows[0]
        : await euNaRede(u.id, tx);
      if (!quem) throw new ErroHttp(422, 'sem_pessoa_na_rede', 'Informe por quem você está respondendo: a resposta parte de uma pessoa da GHT4.');
      const alvo = (await tx.query("SELECT id, nome FROM rede_pessoas WHERE id = $1 AND lado = 'mercado' AND ativo", [p.pessoaAlvoId])).rows[0];
      if (!alvo) throw new ErroHttp(404, 'pessoa_inexistente', 'Pessoa não encontrada na rede.');
      if (quem.id === alvo.id) throw new ErroHttp(422, 'mesma_pessoa', 'Uma resposta liga duas pessoas diferentes.');

      let vinculoId = null;
      if (r.gera) {
        const [a, b] = quem.id < alvo.id ? [quem.id, alvo.id] : [alvo.id, quem.id];
        const disposicao = r.gera;
        const confirmada = disposicao !== 'nao_confirmado';
        const criado = (await tx.query(
          `INSERT INTO rede_vinculos (id,pessoa_a_id,pessoa_b_id,tipo,forca,evidencia,disposicao,
             confirmado_por,confirmado_em,criado_por)
           VALUES ($1,$2,$3,'outro',$4,$5,$6,$7,$8,$9)
           ON CONFLICT (pessoa_a_id, pessoa_b_id, tipo) DO UPDATE
             SET forca = EXCLUDED.forca, evidencia = EXCLUDED.evidencia, disposicao = EXCLUDED.disposicao,
                 confirmado_por = EXCLUDED.confirmado_por, confirmado_em = EXCLUDED.confirmado_em,
                 ativo = true, versao = rede_vinculos.versao + 1, atualizado_em = now()
           RETURNING id`,
          [p.vinculoId ?? p.id, a, b, p.forca, p.evidencia, disposicao,
            confirmada ? u.id : null, confirmada ? new Date() : null, u.id])).rows[0];
        vinculoId = criado.id;
      }

      const linha = (await tx.query(
        `INSERT INTO rede_reconhecimentos (id,pessoa_ght4_id,pessoa_alvo_id,resposta,observacao,vinculo_id,registrado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (pessoa_ght4_id, pessoa_alvo_id) DO UPDATE
           SET resposta = EXCLUDED.resposta, observacao = EXCLUDED.observacao,
               vinculo_id = COALESCE(EXCLUDED.vinculo_id, rede_reconhecimentos.vinculo_id),
               registrado_por = EXCLUDED.registrado_por, respondido_em = now(),
               versao = rede_reconhecimentos.versao + 1
         RETURNING id, resposta, vinculo_id, versao`,
        [p.id, quem.id, alvo.id, p.resposta, p.observacao, vinculoId, u.id])).rows[0];

      await registrar(tx, { usuarioId: u.id, entidade: 'rede_reconhecimento', entidadeId: linha.id,
        acao: 'responder', depois: { de: quem.nome, sobre: alvo.nome, resposta: p.resposta, vinculo: vinculoId },
        justificativa: p.evidencia || p.observacao || 'Resposta negativa registrada para não repetir a pergunta.' });
      return linha;
    });

    res.header('Cache-Control', 'no-store');
    return res.status(201).send({ reconhecimento: salvo });
  });
}
