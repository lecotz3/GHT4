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

const Id = z.string().uuid();
const Versao = z.number().int().min(1);
/** Corta no fim de uma palavra, com reticências, para títulos e resumos. */
const resumir = (t, max) => { const limpo = t.replace(/\s+/g, ' ').trim(); if (limpo.length <= max) return limpo; const corte = limpo.slice(0, max - 1); return `${corte.slice(0, corte.lastIndexOf(' ') > max * 0.6 ? corte.lastIndexOf(' ') : corte.length).replace(/[\s,;.:]+$/, '')}…`; };
const CAMPOS = `id,conversa_id,usuario_id,anterior_id,tese,frente,filtros,criterios,meta,limite_web,catalogo_hash,referencia,funil,
  estado,motivo_estado,modo,notas,turno_id,versao,criado_em,atualizado_em`;

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
  const semAtributos = (i) => { const { atributos, ...empresa } = i.empresa; return { ...i, empresa: { ...empresa, porte: atributos?.porte ?? null, capitalSocial: atributos?.capitalSocial ?? null, dataAbertura: atributos?.dataAbertura ?? null } }; };
  async function detalhar(p, { limite = 300 } = {}) {
    const itens = (await db.query(`SELECT empresa_id,ordem,empresa,etapa,vereditos,aderencia,categoria,site,revisado_em FROM pesquisa_itens
      WHERE pesquisa_id=$1 ORDER BY (etapa='revisada') DESC, ordem LIMIT $2`, [p.id, limite])).rows;
    return { pesquisa: p, contagens: await contagens(p.id), itens: itens.map(semAtributos).sort((a, b) => (a.etapa === 'revisada') === (b.etapa === 'revisada') ? ordenarItens(a, b) : a.etapa === 'revisada' ? -1 : 1),
      ia: servicoIA ? { provedor: servicoIA.status.provedor, modelo: servicoIA.status.modelo, gratuito: servicoIA.status.gratuito } : null };
  }

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
      const titulo = `Pesquisa · ${resumir(p.tese, 100)}`;
      conversa = await db.transaction(async (tx) => {
        const c = (await tx.query(`INSERT INTO agente_conversas (usuario_id,mandato_id,titulo,contexto) VALUES ($1,$2,$3,$4) RETURNING *`,
          [u.id, p.mandatoId, titulo, JSON.stringify({ frente: p.frente ?? 'venda', objetivo: p.tese.slice(0, 2000) })])).rows[0];
        await registrar(tx, { usuarioId: u.id, mandatoId: p.mandatoId, entidade: 'agente_conversa', entidadeId: c.id, acao: 'criar', depois: { titulo } });
        return c;
      });
    }
    let recorte;
    try { recorte = await motor.base(); }
    catch { throw new ErroHttp(503, 'base_indisponivel', 'A base de empresas não está disponível agora. Tente novamente.'); }
    const proposta = await motor.propor(p.tese, { referencia: recorte.referencia,
      execucao: { usuarioId: u.id, conversaId: conversa.id, chave: p.id } });
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

  /* Um lote de revisão. O cliente chama de novo enquanto o estado for "em_andamento". */
  app.post('/api/pesquisas/:id/avancar', async (req) => {
    const { quantidade } = z.object({ quantidade: z.number().int().min(1).max(5).default(3) }).strict().parse(req.body ?? {});
    const { pesquisa, usuario } = await carregar(req, req.params.id, 'agente.usar');
    if (!['pronta', 'em_andamento', 'pausada'].includes(pesquisa.estado)) return { ...(await detalhar(pesquisa)), atualizados: [] };
    // Retomar explicitamente abre uma nova geração; chamadas seguidas em andamento continuam nela.
    const { execucao } = (await db.query(`UPDATE pesquisas_tese SET estado='em_andamento', motivo_estado=NULL,
        execucao=CASE WHEN estado IN ('pronta','pausada') THEN execucao+1 ELSE execucao END
      WHERE id=$1 RETURNING execucao`, [pesquisa.id])).rows[0];
    const r = await motor.avancar(pesquisa, usuario, { quantidade, execucao });
    // Revalida o escopo antes de gravar o estado: a sessão pode ter caído durante a leitura dos sites.
    await req.revalidarSessao();
    const { pesquisa: depois } = await carregar(req, pesquisa.id, 'agente.usar');
    // Só grava se ninguém pausou nem retomou em outra aba durante o lote: a decisão mais recente vale.
    const salva = r.interrompida ? depois : (await db.query(`UPDATE pesquisas_tese SET estado=$2, motivo_estado=$3, atualizado_em=now(), versao=versao+1
      WHERE id=$1 AND estado='em_andamento' AND execucao=$4 RETURNING ${CAMPOS}`, [depois.id, r.estado, r.motivo, execucao])).rows[0] ?? depois;
    return { ...(await detalhar(salva)), atualizados: r.atualizados.map((i) => i.empresa_id) };
  });

  app.post('/api/pesquisas/:id/pausar', async (req) => {
    const { pesquisa } = await carregar(req, req.params.id, 'agente.usar');
    const r = (await db.query(`UPDATE pesquisas_tese SET estado='pausada', motivo_estado='Pausada por você.', versao=versao+1, atualizado_em=now()
      WHERE id=$1 AND estado IN ('pronta','em_andamento') RETURNING ${CAMPOS}`, [pesquisa.id])).rows[0];
    return detalhar(r ?? pesquisa);
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
    const sites = itens.flatMap((i) => (i.site?.paginas || []).slice(0, 1).map((pg) => ({ titulo: `Site · ${i.empresa.nome}`, url: pg.url, referencia: i.site.dominio,
      descricao: 'Página pública lida na revisão por critério. Confira o trecho citado antes de usar.' })));
    const resultado = {
      modo: 'pesquisa_por_tese', titulo: `Pesquisa por tese · ${empresas.length} ${empresas.length === 1 ? 'empresa' : 'empresas'}`,
      resumo: `Empresas escolhidas na pesquisa "${resumir(pesquisa.tese, 160)}". Aderência calculada critério a critério; cada veredito traz a fonte. Ausência de evidência ficou como "?" e não como reprovação.`,
      empresas, fontes: [{ titulo: 'Receita Federal — cadastro CNPJ', referencia: pesquisa.referencia, descricao: 'Critérios cadastrais conferidos no snapshot indicado.' }, ...sites].slice(0, 40),
      blocos: [
        { titulo: 'Critérios da pesquisa', itens: pesquisa.criterios.map((c) => `${c.obrigatorio ? 'Obrigatório' : 'Opcional'} · ${c.texto} (${c.tipo === 'cadastro' ? 'cadastro' : 'fonte pública'})`) },
        { titulo: 'Aderência por empresa', itens: itens.map((i) => `${i.empresa.nome}: ${i.aderencia}% · ${ROTULO[i.categoria]} · ${pesquisa.criterios.map((c, k) => `${SIMBOLO[i.vereditos[k]?.veredito] ?? '?'} ${c.texto}`).join(' · ')}`) },
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
