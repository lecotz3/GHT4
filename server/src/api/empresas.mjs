import { EmpresaId } from '../crm/contratos.mjs';
import { ErroHttp } from '../app.mjs';
import { pode } from '../seguranca/rbac.mjs';
import { criarCatalogo } from '../agente/catalogo.mjs';
import { caminhosDeAcesso, pessoasDaEmpresa } from '../rede/caminhos.mjs';
import { senioridadeDe } from '../rede/contratos.mjs';
import { z } from 'zod';
import { registrar } from '../auditoria/registrar.mjs';
import { briefingPdf } from '../acervo/briefing.mjs';
import { roteiroDeReuniao } from '../agente/tarefas.mjs';
import { SQL_EVENTO_PUBLICO } from '../agente/eventos.mjs';

/**
 * Visões centradas numa empresa, montadas só com o que o usuário já alcança.
 *
 * Mesmo escopo da lista de oportunidades: as privadas são do próprio autor; as de
 * espaço, de quem participa, de admin ou de espaço não confidencial. Mandato
 * confidencial de que o usuário não participa não aparece nem como contagem:
 * dizer "há algo que você não pode ver" já revelaria que a casa trabalha a empresa.
 */
export const ESCOPO_OPORTUNIDADE = `((o.mandato_id IS NULL AND o.criado_por=$1) OR (o.mandato_id IS NOT NULL AND ($2 OR m.confidencial=false OR o.mandato_id=ANY($3::uuid[]))))`;
export const valoresDeEscopo = (u) => [u.id, u.papel === 'admin', (u.mandatos || []).map((m) => m.id)];

export async function situacaoDaEmpresa(db, u, empresaId) {
  const v = valoresDeEscopo(u);
  const oportunidades = (await db.query(`SELECT o.id,o.titulo,o.frente,o.etapa,o.prazo::text,o.proxima_acao,o.acao_concluida,
      u.nome AS responsavel_nome,m.rotulo AS espaco
    FROM crm_oportunidades o JOIN usuarios u ON u.id=o.responsavel_id LEFT JOIN mandatos m ON m.id=o.mandato_id
    WHERE o.empresa->>'id'=$4 AND ${ESCOPO_OPORTUNIDADE} ORDER BY o.atualizado_em DESC,o.id LIMIT 20`, [...v, empresaId])).rows;
  // Restrição vale por escopo (`usuario:<id>` ou `mandato:<id>`); só os escopos visíveis entram.
  const restricoes = (await db.query(`SELECT r.categoria,r.motivo,r.atualizado_em,m.rotulo AS espaco
    FROM crm_restricoes_contato r LEFT JOIN mandatos m ON r.escopo='mandato:'||m.id::text
    WHERE r.empresa_id=$4 AND r.ativa AND (r.escopo='usuario:'||$1::text
      OR (m.id IS NOT NULL AND ($2 OR m.confidencial=false OR m.id=ANY($3::uuid[]))))
    ORDER BY r.atualizado_em DESC`, [...v, empresaId])).rows;
  return { empresaId, oportunidades, restricoes };
}

/** Acervo das oportunidades acessíveis: última versão de cada série. Relações e passagens ficam de fora (podem conter contato). */
async function acervoDaEmpresa(db, u, empresaId) {
  const v = valoresDeEscopo(u);
  const registros = (await db.query(`SELECT DISTINCT ON (r.serie_id) r.tipo,r.dados,r.revisado,r.versao,r.criado_em,o.id AS oportunidade_id,o.titulo AS oportunidade
    FROM crm_registros r JOIN crm_oportunidades o ON o.id=r.oportunidade_id LEFT JOIN mandatos m ON m.id=o.mandato_id
    WHERE o.empresa->>'id'=$4 AND r.tipo IN ('evidencia','tese','comparavel','noticia') AND ${ESCOPO_OPORTUNIDADE}
    ORDER BY r.serie_id,r.versao DESC`, [...v, empresaId])).rows
    .sort((a, b) => b.criado_em - a.criado_em).slice(0, 30)
    .map((r) => ({ tipo: r.tipo, titulo: r.dados.titulo || r.dados.campo || r.dados.evento || 'Registro', revisado: r.revisado,
      versao: r.versao, fonte: r.dados.fonte || '', referencia: r.dados.referencia || r.dados.periodo || '', oportunidadeId: r.oportunidade_id, oportunidade: r.oportunidade }));
  const documentos = (await db.query(`SELECT d.id,d.nome,d.estado,d.criado_em,o.id AS oportunidade_id
    FROM crm_documentos d JOIN crm_oportunidades o ON o.id=d.oportunidade_id LEFT JOIN mandatos m ON m.id=o.mandato_id
    WHERE o.empresa->>'id'=$4 AND ${ESCOPO_OPORTUNIDADE} ORDER BY d.criado_em DESC LIMIT 20`, [...v, empresaId])).rows;
  return { registros, documentos };
}

export async function registrarEmpresas(app, { catalogo = criarCatalogo() } = {}) {
  const { db } = app;
  /* Ficha única: o cadastro vem do catálogo; o resto, do que o usuário já alcança
     em CRM e rede. Contatos (e-mail, telefone) não entram: a ficha é para decidir
     como abordar, e quem pode ver contato os encontra na Rede. */
  async function montarFicha(u, empresaId) {
    let empresa;
    try { empresa = await catalogo.obter(empresaId); }
    catch { throw new ErroHttp(503, 'catalogo_indisponivel', 'A base de empresas está temporariamente indisponível.'); }
    if (!empresa) throw new ErroHttp(404, 'empresa_inexistente', 'Empresa não encontrada no catálogo atual.');
    // Eventos vêm de dado público (CNPJ), sem restrição de espaço.
    const eventos = (await db.query(`SELECT ${SQL_EVENTO_PUBLICO} AS e FROM eventos_corporativos ev
      JOIN entidades_juridicas j ON j.id=ev.entidade_id WHERE j.cnpj_raiz=$1 ORDER BY ev.detectado_em DESC, ev.id LIMIT 20`, [empresaId.slice(4)])).rows.map((r) => r.e);
    const ficha = { empresa, eventos, situacao: null, pessoas: null, acesso: null, acervo: null };
    if (pode(u.papel, 'crm.ler')) {
      ficha.situacao = await situacaoDaEmpresa(db, u, empresaId);
      ficha.acervo = await acervoDaEmpresa(db, u, empresaId);
    }
    if (pode(u.papel, 'rede.ler')) {
      ficha.pessoas = (await pessoasDaEmpresa(db, { empresaId, nomeEmpresa: empresa.nome }))
        .map((p) => ({ id: p.id, nome: p.nome, cargo: p.cargo, senioridade: senioridadeDe(p.senioridade).rotulo ?? p.senioridade }));
      const r = await caminhosDeAcesso(db, { empresaId, nomeEmpresa: empresa.nome, usuario: u });
      const uteis = r.caminhos.filter((c) => c.recomendavel);
      const melhor = uteis[0];
      ficha.acesso = { pessoasConhecidas: r.pessoasConhecidas, lideresConhecidos: r.lideresConhecidos,
        utilizaveis: uteis.length, descartados: r.caminhos.length - uteis.length,
        melhor: melhor ? { categoria: melhor.categoriaRotulo, de: melhor.ght4.nome, ate: melhor.alvo.nome, cargo: melhor.alvo.cargo, saltos: melhor.saltos } : null };
    }
    return ficha;
  }

  app.get('/api/empresas/:empresaId/ficha', async (req, res) => {
    const u = req.exigir('agente.ler');
    const ficha = await montarFicha(u, EmpresaId.parse(req.params.empresaId));
    res.header('Cache-Control', 'no-store');
    return ficha;
  });

  /* Briefing: mesma ficha, em PDF, com o roteiro da frente escolhida. Gerar fica na
     auditoria (quem levou o quê para fora do sistema), sem copiar o conteúdo. */
  app.get('/api/empresas/:empresaId/briefing', async (req, res) => {
    const u = req.exigir('agente.usar');
    const empresaId = EmpresaId.parse(req.params.empresaId);
    const { frente } = z.object({ frente: z.enum(['compra', 'venda']).default('venda') }).strict().parse(req.query);
    const ficha = await montarFicha(u, empresaId);
    const pdf = await briefingPdf(ficha, { frente, roteiro: roteiroDeReuniao(frente), autor: u.nome });
    await registrar(db, { usuarioId: u.id, entidade: 'briefing_empresa', entidadeId: empresaId, acao: 'exportar',
      depois: { frente, oportunidades: ficha.situacao?.oportunidades.length ?? 0, bytes: pdf.length } });
    const nome = `briefing-${empresaId.slice(4)}-${frente}.pdf`;
    return res.header('Content-Type', 'application/pdf').header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${nome}"`).send(pdf);
  });

  app.get('/api/empresas/:empresaId/situacao', async (req) => {
    const u = req.exigir('crm.ler');
    return situacaoDaEmpresa(db, u, EmpresaId.parse(req.params.empresaId));
  });
}
