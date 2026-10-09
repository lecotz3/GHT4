import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { filtrarMembroDaRede, pode } from '../seguranca/rbac.mjs';
import { caminhosDeAcesso } from '../rede/caminhos.mjs';
import { alterarRede } from '../rede/estado.mjs';
import { EmpresaId, Id, Senioridade, SENIORIDADES, normalizar, senioridadeDe } from '../rede/contratos.mjs';
import { situacaoDaEmpresa } from './empresas.mjs';
import { criarSancoes } from '../empresas/sancoes.mjs';
import { TIPOS_FONTE_CARGO, montarPlano, referenciaDaFonte, respostasPorPessoa, minhasRespostas } from '../acesso/plano.mjs';

/* =============================================================================
 *  GHT4 · rotas do plano de acesso a quem decide (ver acesso/plano.mjs)
 * -----------------------------------------------------------------------------
 *  Ler o plano exige `rede.ler`, como a busca de caminhos. Aberto de uma pesquisa
 *  por tese, ele usa a empresa e o site gravados no item, e o escopo de restrição
 *  é o do trabalho da pesquisa; aberto sem pesquisa, a empresa vem do catálogo e
 *  o escopo é o do próprio membro. Registrar quem decide exige `rede.editar`,
 *  como qualquer cadastro da rede, e a fonte do cargo é obrigatória.
 * ========================================================================== */

const Consulta = z.object({ pesquisaId: Id.optional() });
const Fonte = z.object({
  tipo: z.enum(TIPOS_FONTE_CARGO.map((t) => t.id)),
  descricao: z.string().trim().min(5, 'diga em poucas palavras de onde vem o cargo').max(300),
  url: z.string().trim().max(500).url().regex(/^https?:\/\//i, 'use um endereço http ou https').optional(),
}).strict();
const Decisor = z.object({
  id: Id,
  nome: z.string().trim().min(2).max(120),
  cargo: z.string().trim().min(2).max(120),
  senioridade: Senioridade,
  fonte: Fonte,
  pesquisaId: Id.optional(),
}).strict();

export async function registrarAcesso(app, { catalogo, sancoes = criarSancoes() }) {
  const { db } = app;
  /* O plano traz nomes de pessoas de terceiros: não sai pelo canal externo (ponte MCP), qualquer que
     seja o mandato. A ponte nem o chama; a recusa aqui vale para quem tentar. */
  const semCanalExterno = (req) => {
    if (req.headers['x-ght4-canal'] === 'mcp') throw new ErroHttp(403, 'canal_externo', 'O plano de acesso não é servido por canal externo. Use a interface do GHT4.');
  };

  /** Empresa, atributos públicos, site lido e escopo de restrição, conforme a origem do pedido. */
  async function contexto(req, u, empresaId, pesquisaId) {
    if (pesquisaId) {
      req.exigir('agente.ler');
      const p = (await db.query('SELECT id, conversa_id FROM pesquisas_tese WHERE id=$1 AND usuario_id=$2', [pesquisaId, u.id])).rows[0];
      if (!p) throw new ErroHttp(404, 'pesquisa_inexistente', 'Pesquisa não encontrada.');
      const c = (await db.query('SELECT id, mandato_id, usuario_id FROM agente_conversas WHERE id=$1', [p.conversa_id])).rows[0];
      if (c.mandato_id) await req.exigirNoMandato(c.mandato_id, 'agente.ler');
      const item = (await db.query('SELECT empresa, site FROM pesquisa_itens WHERE pesquisa_id=$1 AND empresa_id=$2', [p.id, empresaId])).rows[0];
      if (!item) throw new ErroHttp(404, 'item_inexistente', 'Empresa não encontrada nesta pesquisa.');
      return { empresa: item.empresa, atributos: item.empresa?.atributos ?? null, site: item.site ?? null,
        escopo: c.mandato_id ? `mandato:${c.mandato_id}` : `usuario:${c.usuario_id}` };
    }
    let empresa;
    try { empresa = await catalogo.obter(empresaId); }
    catch { throw new ErroHttp(503, 'base_indisponivel', 'O catálogo não pôde ser consultado. Tente novamente.'); }
    if (!empresa) throw new ErroHttp(404, 'empresa_inexistente', 'Empresa não encontrada no catálogo.');
    // Os atributos públicos só vêm no recorte; sem ele, o plano segue sem a estrutura societária.
    let atributos = null;
    if (typeof catalogo.recorte === 'function' && empresa.cnpjRaiz) {
      try {
        const r = await catalogo.recorte({ busca: empresa.cnpjRaiz, incluirPossiveis: true }, { limite: 20 });
        atributos = r?.empresas?.find((e) => e.id === empresaId)?.atributos ?? null;
      } catch { atributos = null; }
    }
    return { empresa, atributos, site: null, escopo: `usuario:${u.id}` };
  }

  app.get('/api/acesso/:empresaId', async (req, res) => {
    const u = req.exigir('rede.ler');
    semCanalExterno(req);
    const empresaId = EmpresaId.parse(req.params.empresaId);
    const { pesquisaId } = Consulta.parse(req.query);
    const ctx = await contexto(req, u, empresaId, pesquisaId);
    const acesso = await caminhosDeAcesso(db, { empresaId, nomeEmpresa: ctx.empresa.nome, escopo: ctx.escopo, usuario: u });
    const ids = [...new Set([...acesso.caminhos.map((c) => c.alvo.id), ...acesso.semCaminho.map((p) => p.id)])];
    const linhas = ids.length ? (await db.query('SELECT id, origem, origem_referencia, empresa_id FROM rede_pessoas WHERE id = ANY($1::uuid[])', [ids])).rows : [];
    const [respostas, minhas, situacao, diligencia] = await Promise.all([
      respostasPorPessoa(db, ids), minhasRespostas(db, u.id, ids), situacaoDaEmpresa(db, u, empresaId),
      sancoes.daEmpresa(ctx.empresa.cnpjRaiz ?? empresaId.slice(4)),
    ]);
    const plano = montarPlano({ empresa: ctx.empresa, atributos: ctx.atributos, site: ctx.site, acesso, linhas,
      respostas, minhas: minhas.respostas, autor: u.nome, diligencia,
      // A restrição do próprio escopo já decide o passo; as dos outros espaços visíveis viram aviso.
      restricoesOutras: situacao.restricoes.filter((x) => !(acesso.restricao?.ativa && x.motivo === acesso.restricao.motivo)),
      oportunidades: situacao.oportunidades.map((o) => ({ id: o.id, titulo: o.titulo, etapa: o.etapa, proximaAcao: o.proxima_acao, prazo: o.prazo, responsavel: o.responsavel_nome, espaco: o.espaco ?? null })) });
    res.header('Cache-Control', 'no-store');
    return { ...plano, eu: { naRede: Boolean(minhas.eu), pessoaId: minhas.eu?.id ?? null },
      podeRegistrar: pode(u.papel, 'rede.editar'), tiposFonte: TIPOS_FONTE_CARGO, senioridades: SENIORIDADES.map(({ id, rotulo }) => ({ id, rotulo })) };
  });

  /* "Caminho de recall": alguém da casa informa quem decide nesta empresa, e de
     onde sabe. Entra como pessoa do mercado ligada ao CNPJ, com a fonte do cargo
     em `origem_referencia` — é ela que o juízo do decisor mostra como fonte. Não
     pede e-mail, telefone nem LinkedIn: o plano não monta contato pessoal. */
  app.post('/api/acesso/:empresaId/decisores', async (req, res) => {
    const u = req.exigir('rede.editar');
    semCanalExterno(req);
    const empresaId = EmpresaId.parse(req.params.empresaId);
    const p = Decisor.parse(req.body);
    const ctx = await contexto(req, u, empresaId, p.pesquisaId);
    const nomeNormalizado = normalizar(p.nome);
    const referencia = referenciaDaFonte(p.fonte);
    const CAMPOS = 'id,lado,nome,cargo,senioridade,organizacao,empresa_id,usuario_id,email,telefone,linkedin,observacoes,ativo,versao,origem,origem_referencia';
    const salva = await db.transaction(async (tx) => {
      const mesma = (await tx.query(`SELECT ${CAMPOS} FROM rede_pessoas WHERE id=$1`, [p.id])).rows[0];
      // Reenvio do mesmo formulário devolve o cadastro feito, em vez de duplicar a pessoa.
      if (mesma) {
        if (mesma.nome !== p.nome || mesma.empresa_id !== empresaId) throw new ErroHttp(409, 'registro_atualizado', 'Este registro mudou. Reabra o plano antes de salvar.');
        return { linha: mesma, nova: false };
      }
      const homonima = (await tx.query(`SELECT id FROM rede_pessoas WHERE ativo AND lado='mercado' AND empresa_id=$1 AND nome_normalizado=$2 LIMIT 1`,
        [empresaId, nomeNormalizado])).rows[0];
      if (homonima) throw new ErroHttp(409, 'pessoa_ja_mapeada', 'Esta pessoa já está na rede para esta empresa. Corrija o cargo pela tela Rede.', { id: homonima.id });
      await alterarRede(tx);
      const linha = (await tx.query(
        `INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,
           empresa_id,origem,origem_referencia,criado_por)
         VALUES ($1,'mercado',$2,$3,$4,$5,$6,$7,$8,'manual',$9,$10) RETURNING ${CAMPOS}`,
        [p.id, p.nome, nomeNormalizado, p.cargo, p.senioridade, ctx.empresa.nome, normalizar(ctx.empresa.nome), empresaId, referencia, u.id])).rows[0];
      await registrar(tx, { usuarioId: u.id, entidade: 'rede_pessoa', entidadeId: p.id, acao: 'registrar_decisor',
        depois: { empresaId, nome: p.nome, cargo: p.cargo, senioridade: p.senioridade, fonte: p.fonte.tipo },
        justificativa: referencia });
      return { linha, nova: true };
    });
    res.header('Cache-Control', 'no-store');
    const l = salva.linha;
    return res.status(salva.nova ? 201 : 200).send({ pessoa: filtrarMembroDaRede({
      id: l.id, lado: l.lado, nome: l.nome, cargo: l.cargo, senioridade: l.senioridade, senioridadeRotulo: senioridadeDe(l.senioridade).rotulo,
      organizacao: l.organizacao, empresaId: l.empresa_id, origem: l.origem, origemReferencia: l.origem_referencia,
      email: l.email, telefone: l.telefone, linkedin: l.linkedin, versao: l.versao,
    }, u) });
  });
}
