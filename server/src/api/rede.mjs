import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { filtrarMembroDaRede, pode } from '../seguranca/rbac.mjs';
import { autorizarOportunidade } from '../crm/acesso.mjs';
import { caminhosDeAcesso } from '../rede/caminhos.mjs';
import {
  Id, EmpresaId, Versao, Pessoa, PessoaBase, Vinculo, Disposicao, disposicaoDe,
  SENIORIDADES, TIPOS_VINCULO, FORCAS, DISPOSICOES, CATEGORIAS, LADOS, normalizar,
} from '../rede/contratos.mjs';

const conflito = () => new ErroHttp(409, 'registro_atualizado', 'Este registro mudou. Reabra a rede antes de salvar.');
const semPessoa = () => new ErroHttp(404, 'pessoa_inexistente', 'Pessoa não encontrada na rede.');

const CAMPOS = `id,lado,nome,cargo,senioridade,organizacao,empresa_id,usuario_id,
  email,telefone,linkedin,observacoes,ativo,versao,criado_em,atualizado_em`;
const VINCULO = 'id,pessoa_a_id,pessoa_b_id,tipo,forca,periodo,evidencia,disposicao,confirmado_em,ativo,versao';

const publicar = (linha, usuario) => filtrarMembroDaRede({
  id: linha.id, lado: linha.lado, nome: linha.nome, cargo: linha.cargo,
  senioridade: linha.senioridade, organizacao: linha.organizacao,
  empresaId: linha.empresa_id, usuarioId: linha.usuario_id,
  email: linha.email, telefone: linha.telefone, linkedin: linha.linkedin,
  observacoes: linha.observacoes, ativo: linha.ativo, versao: linha.versao,
}, usuario);

/* O par é guardado sempre ordenado, porque conhecer é recíproco: sem isso A-B e
   B-A entrariam como dois vínculos e um caminho contaria a mesma relação duas
   vezes. Quem preenche o formulário não precisa saber disso. */
const parOrdenado = (x, y) => x < y ? [x, y] : [y, x];

export async function registrarRede(app) {
  const { db } = app;

  /* A rede é da casa inteira, não de um mandato. Uma relação pessoal não deixa
     de existir porque o mandato mudou, e recortá-la por espaço faria a mesma
     pessoa ser cadastrada várias vezes — que é como uma rede de contatos morre.
     O que protege o dado sensível é o campo, não a linha: `rede.ver_contato`
     decide quem vê e-mail e telefone, e quem não tem vê que existem. */
  app.get('/api/rede', async (req) => {
    req.exigir('rede.ler');
    const totais = (await db.query(
      'SELECT lado, count(*) FILTER (WHERE ativo)::int AS pessoas FROM rede_pessoas GROUP BY lado')).rows;
    const vinculos = (await db.query('SELECT count(*)::int AS n FROM rede_vinculos WHERE ativo')).rows[0].n;
    const por = (lado) => totais.find((t) => t.lado === lado)?.pessoas ?? 0;
    return {
      senioridades: SENIORIDADES, tipos: TIPOS_VINCULO, forcas: FORCAS,
      disposicoes: DISPOSICOES, categorias: CATEGORIAS, lados: LADOS,
      totais: { ght4: por('ght4'), mercado: por('mercado'), externo: por('externo'), vinculos },
      podeEditar: pode(req.usuario.papel, 'rede.editar'),
      veContatos: pode(req.usuario.papel, 'rede.ver_contato'),
    };
  });

  app.get('/api/rede/pessoas', async (req, res) => {
    const u = req.exigir('rede.ler');
    const q = z.object({
      lado: z.enum(['ght4', 'mercado', 'externo']).optional(),
      busca: z.string().trim().max(120).default(''),
      empresaId: EmpresaId.optional(),
      limite: z.coerce.number().int().min(1).max(200).default(60),
    }).parse(req.query);
    const termo = normalizar(q.busca);
    const linhas = (await db.query(
      `SELECT ${CAMPOS} FROM rede_pessoas
        WHERE ativo
          AND ($1::text IS NULL OR lado = $1)
          AND ($2::text IS NULL OR empresa_id = $2)
          AND ($3 = '' OR organizacao_normalizada LIKE '%' || $3 || '%'
               OR lower(nome) LIKE '%' || $3 || '%' OR lower(cargo) LIKE '%' || $3 || '%')
        ORDER BY lado, nome, id LIMIT $4`,
      [q.lado ?? null, q.empresaId ?? null, termo, q.limite])).rows;
    res.header('Cache-Control', 'no-store');
    return { pessoas: linhas.map((l) => publicar(l, u)) };
  });

  app.post('/api/rede/pessoas', async (req, res) => {
    const u = req.exigir('rede.editar');
    const p = Pessoa.parse(req.body);
    const criada = await db.transaction(async (tx) => {
      if (p.usuarioId && !(await tx.query('SELECT id FROM usuarios WHERE id = $1', [p.usuarioId])).rows.length) {
        throw new ErroHttp(422, 'usuario_inexistente', 'A conta indicada não existe.');
      }
      const linha = (await tx.query(
        `INSERT INTO rede_pessoas (id,lado,nome,cargo,senioridade,organizacao,organizacao_normalizada,
           empresa_id,usuario_id,email,telefone,linkedin,observacoes,criado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO NOTHING RETURNING ${CAMPOS}`,
        [p.id, p.lado, p.nome, p.cargo, p.senioridade, p.organizacao, normalizar(p.organizacao),
          p.empresaId, p.usuarioId, p.email, p.telefone, p.linkedin, p.observacoes, u.id])).rows[0];
      if (!linha) {
        // Reenvio do mesmo formulário: devolve o que já existe em vez de duplicar a pessoa.
        const anterior = (await tx.query(`SELECT ${CAMPOS} FROM rede_pessoas WHERE id = $1`, [p.id])).rows[0];
        if (!anterior || anterior.nome !== p.nome) throw conflito();
        return anterior;
      }
      await registrar(tx, { usuarioId: u.id, entidade: 'rede_pessoa', entidadeId: p.id, acao: 'criar',
        depois: { lado: p.lado, nome: p.nome, cargo: p.cargo, senioridade: p.senioridade, organizacao: p.organizacao } });
      return linha;
    });
    res.header('Cache-Control', 'no-store');
    return res.status(201).send({ pessoa: publicar(criada, u) });
  });

  app.patch('/api/rede/pessoas/:id', async (req, res) => {
    const u = req.exigir('rede.editar');
    const id = Id.parse(req.params.id);
    const p = PessoaBase.omit({ id: true, lado: true }).extend({ versao: Versao, ativo: z.boolean().default(true) }).parse(req.body);
    const salva = await db.transaction(async (tx) => {
      const antes = (await tx.query(`SELECT ${CAMPOS} FROM rede_pessoas WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!antes) throw semPessoa();
      if (antes.versao !== p.versao) throw conflito();
      if (antes.lado === 'ght4' && p.empresaId) throw new ErroHttp(422, 'empresa_invalida', 'Empresa do catálogo é para pessoas do mercado.');
      // Mesma regra do cadastro, cobrada aqui contra o lado que o banco guarda.
      if (antes.lado === 'mercado' && !p.organizacao && !p.empresaId) throw new ErroHttp(422, 'organizacao_necessaria', 'Informe a empresa desta pessoa, ou vincule-a a uma empresa do catálogo.');
      const linha = (await tx.query(
        `UPDATE rede_pessoas SET nome=$2,cargo=$3,senioridade=$4,organizacao=$5,organizacao_normalizada=$6,
           empresa_id=$7,usuario_id=$8,email=$9,telefone=$10,linkedin=$11,observacoes=$12,ativo=$13,
           versao=versao+1,atualizado_em=now() WHERE id=$1 RETURNING ${CAMPOS}`,
        [id, p.nome, p.cargo, p.senioridade, p.organizacao, normalizar(p.organizacao),
          p.empresaId, p.usuarioId, p.email, p.telefone, p.linkedin, p.observacoes, p.ativo])).rows[0];
      await registrar(tx, { usuarioId: u.id, entidade: 'rede_pessoa', entidadeId: id, acao: p.ativo ? 'editar' : 'desativar',
        antes: { nome: antes.nome, cargo: antes.cargo, senioridade: antes.senioridade, organizacao: antes.organizacao, ativo: antes.ativo },
        depois: { nome: p.nome, cargo: p.cargo, senioridade: p.senioridade, organizacao: p.organizacao, ativo: p.ativo } });
      return linha;
    });
    res.header('Cache-Control', 'no-store');
    return { pessoa: publicar(salva, u) };
  });

  app.get('/api/rede/pessoas/:id/vinculos', async (req, res) => {
    req.exigir('rede.ler');
    const id = Id.parse(req.params.id);
    const linhas = (await db.query(
      `SELECT v.id,v.pessoa_a_id,v.pessoa_b_id,v.tipo,v.forca,v.periodo,v.evidencia,v.disposicao,
              v.confirmado_em,v.ativo,v.versao,
              a.nome AS a_nome, a.cargo AS a_cargo, a.lado AS a_lado, a.organizacao AS a_organizacao,
              b.nome AS b_nome, b.cargo AS b_cargo, b.lado AS b_lado, b.organizacao AS b_organizacao,
              c.nome AS confirmado_por_nome
         FROM rede_vinculos v
         JOIN rede_pessoas a ON a.id = v.pessoa_a_id
         JOIN rede_pessoas b ON b.id = v.pessoa_b_id
         LEFT JOIN usuarios c ON c.id = v.confirmado_por
        WHERE v.pessoa_a_id = $1 OR v.pessoa_b_id = $1
        ORDER BY v.ativo DESC, v.id`, [id])).rows;
    res.header('Cache-Control', 'no-store');
    return { vinculos: linhas.map((v) => ({
      ...v, confirmadoEm: v.confirmado_em ? new Date(v.confirmado_em).toISOString().slice(0, 10) : null,
      disposicaoRotulo: disposicaoDe(v.disposicao).rotulo,
    })) };
  });

  app.post('/api/rede/vinculos', async (req, res) => {
    const u = req.exigir('rede.editar');
    const p = Vinculo.parse(req.body);
    if (p.pessoaAId === p.pessoaBId) throw new ErroHttp(422, 'vinculo_consigo', 'Um vínculo liga duas pessoas diferentes.');
    const [a, b] = parOrdenado(p.pessoaAId, p.pessoaBId);
    const d = disposicaoDe(p.disposicao);
    const criado = await db.transaction(async (tx) => {
      const lados = (await tx.query('SELECT id,lado,ativo FROM rede_pessoas WHERE id = ANY($1::uuid[])', [[a, b]])).rows;
      if (lados.length !== 2) throw semPessoa();
      if (lados.some((l) => !l.ativo)) throw new ErroHttp(422, 'pessoa_inativa', 'Reative as duas pessoas antes de registrar o vínculo.');
      /* Um caminho começa na casa e termina numa empresa, mas uma LIGAÇÃO
         isolada não precisa disso: o elo entre o intermediário e o diretor não
         toca a GHT4, e exigir que tocasse tornaria o caminho de duas pontas
         impossível de cadastrar. Ligar duas pessoas da casa também não é erro —
         só não abre porta nenhuma, e a busca de caminhos ignora. */
      const linha = (await tx.query(
        `INSERT INTO rede_vinculos (id,pessoa_a_id,pessoa_b_id,tipo,forca,periodo,evidencia,disposicao,
           confirmado_por,confirmado_em,criado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING
         RETURNING ${VINCULO}`,
        [p.id, a, b, p.tipo, p.forca, p.periodo, p.evidencia, p.disposicao,
          d.confirmada ? u.id : null, d.confirmada ? new Date() : null, u.id])).rows[0];
      if (!linha) {
        const anterior = (await tx.query(`SELECT ${VINCULO} FROM rede_vinculos WHERE id = $1`, [p.id])).rows[0];
        if (!anterior) throw conflito();
        return anterior;
      }
      await registrar(tx, { usuarioId: u.id, entidade: 'rede_vinculo', entidadeId: p.id, acao: 'criar',
        depois: { tipo: p.tipo, forca: p.forca, disposicao: p.disposicao }, justificativa: p.evidencia });
      return linha;
    }).catch((erro) => {
      if (erro.code === '23505') throw new ErroHttp(409, 'vinculo_existente', 'Essas duas pessoas já têm um vínculo desse tipo registrado.');
      throw erro;
    });
    res.header('Cache-Control', 'no-store');
    return res.status(201).send({ vinculo: criado });
  });

  app.patch('/api/rede/vinculos/:id', async (req, res) => {
    const u = req.exigir('rede.editar');
    const id = Id.parse(req.params.id);
    const p = z.object({ versao: Versao, forca: Vinculo.shape.forca, periodo: z.string().trim().max(120).default(''),
      evidencia: z.string().trim().min(10).max(2000), disposicao: Disposicao,
      ativo: z.boolean().default(true) }).strict().parse(req.body);
    const d = disposicaoDe(p.disposicao);
    const salvo = await db.transaction(async (tx) => {
      const antes = (await tx.query('SELECT * FROM rede_vinculos WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!antes) throw new ErroHttp(404, 'vinculo_inexistente', 'Vínculo não encontrado.');
      if (antes.versao !== p.versao) throw conflito();
      /* Quem registra a resposta do titular não é necessariamente o titular: um
         analista anota o que o sócio respondeu. O carimbo guarda quem registrou
         e quando, e a auditoria guarda o resto. Exigir que só o titular pudesse
         digitar travaria o uso real; atribuir a resposta a quem digitou seria
         mentira. A data se renova a cada resposta nova: é isso que a janela de
         frescor mede. */
      const linha = (await tx.query(
        `UPDATE rede_vinculos SET forca=$2,periodo=$3,evidencia=$4,disposicao=$5,confirmado_por=$6,confirmado_em=$7,
           ativo=$8,versao=versao+1,atualizado_em=now() WHERE id=$1 RETURNING ${VINCULO}`,
        [id, p.forca, p.periodo, p.evidencia, p.disposicao,
          d.confirmada ? u.id : null, d.confirmada ? new Date() : null, p.ativo])).rows[0];
      await registrar(tx, { usuarioId: u.id, entidade: 'rede_vinculo', entidadeId: id,
        acao: !p.ativo ? 'desativar' : antes.disposicao !== p.disposicao ? 'confirmar' : 'editar',
        antes: { forca: antes.forca, ativo: antes.ativo, disposicao: antes.disposicao },
        depois: { forca: p.forca, ativo: p.ativo, disposicao: p.disposicao }, justificativa: p.evidencia });
      return linha;
    });
    res.header('Cache-Control', 'no-store');
    return { vinculo: salvo };
  });

  app.get('/api/rede/caminhos', async (req, res) => {
    const u = req.exigir('rede.ler');
    const q = z.object({ empresaId: EmpresaId.optional(), nome: z.string().trim().max(160).default(''),
      oportunidadeId: Id.optional() }).parse(req.query);
    if (!q.empresaId && !q.nome) throw new ErroHttp(422, 'empresa_necessaria', 'Informe a empresa do catálogo ou o nome da organização.');

    /* A restrição de não contatar vive no escopo da oportunidade. Sem uma
       oportunidade indicada não há escopo a consultar, e o resultado diz isso
       em vez de afirmar que não existe restrição. */
    let escopo = null;
    if (q.oportunidadeId) {
      const o = await autorizarOportunidade(req, db, q.oportunidadeId);
      escopo = o.mandato_id ? `mandato:${o.mandato_id}` : `usuario:${o.criado_por}`;
    }
    const r = await caminhosDeAcesso(db, { empresaId: q.empresaId ?? null, nomeEmpresa: q.nome, escopo, usuario: u });
    res.header('Cache-Control', 'no-store');
    return { ...r, escopoConsultado: Boolean(escopo) };
  });
}
