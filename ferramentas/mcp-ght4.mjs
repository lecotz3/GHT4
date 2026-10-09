#!/usr/bin/env node
/* =============================================================================
 *  GHT4 · ponte MCP da pesquisa por tese
 * -----------------------------------------------------------------------------
 *  Deixa o membro usar a pesquisa por tese de dentro de um cliente de IA que fale
 *  MCP (Claude Desktop, Claude Code, outros), sem abrir a interface: propor
 *  critérios a partir da tese, ajustá-los, rodar o funil e a revisão, ler o
 *  resultado, as evidências de uma empresa e o registro da execução. É o "MCP /
 *  CLI / SDK" da plataforma aberta do Lessie, no tamanho da GHT4.
 *
 *  COMO FUNCIONA
 *  Servidor MCP por stdio (JSON-RPC 2.0, uma mensagem por linha), sem
 *  dependências. Fala com a API do GHT4 com a conta do próprio membro:
 *    GHT4_URL    endereço da API (padrão http://127.0.0.1:3311)
 *    GHT4_EMAIL  e-mail da conta
 *    GHT4_SENHA  senha da conta (fica no ambiente do cliente MCP, nunca no repositório)
 *  Todas as permissões são as da conta: a ponte não tem acesso próprio.
 *
 *  O QUE ELA NÃO FAZ, de propósito
 *  - Não entrega resultado ao trabalho nem faz revisão humana de veredito: são
 *    decisões que ficam na interface, com autoria e trilha.
 *  - Não lê o plano de acesso nem a rede: nome de pessoa de terceiro não sai para
 *    um cliente de IA que a casa não controla.
 *  - Mandato confidencial não passa: cada pedido vai marcado como canal externo
 *    (`X-GHT4-Canal: mcp`) e o servidor recusa pesquisa de mandato confidencial.
 *    As pesquisas criadas por aqui são do trabalho pessoal do membro.
 *
 *  USO (Claude Code):  claude mcp add ght4 -e GHT4_URL=... -e GHT4_EMAIL=... -e GHT4_SENHA=... -- node ferramentas/mcp-ght4.mjs
 *  Ver docs/runbooks/mcp-ght4.md.
 * ========================================================================== */

import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const VERSAO = '1.0.0';
const PROTOCOLOS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const ID_CRITERIO = /^[a-z0-9_-]{1,40}$/;

class ErroGht4 extends Error {
  constructor(status, codigo, mensagem) { super(mensagem || `A API respondeu ${status}.`); this.status = status; this.codigo = codigo ?? null; }
}

/* Esquemas de entrada das ferramentas (JSON Schema). */
const UUID = { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' };
const PESQUISA = { pesquisaId: { ...UUID, description: 'Id da pesquisa (de listar_pesquisas ou pesquisar_tese).' } };
const IDS = (descricao) => ({ type: 'array', items: { type: 'string', pattern: ID_CRITERIO.source }, maxItems: 12, description: descricao });

const resumoCriterio = (c) => ({ id: c.id, texto: c.texto, obrigatorio: c.obrigatorio, tipo: c.tipo });
const resumoItem = (i) => ({ empresaId: i.empresa_id, nome: i.empresa?.nome, cnpjRaiz: i.empresa?.cnpjRaiz, cidade: i.empresa?.cidade, uf: i.empresa?.uf,
  categoria: i.categoria, aderencia: i.aderencia, vereditos: (i.vereditos ?? []).map((v) => ({ veredito: v.veredito, resumo: v.resumo, lastro: v.lastro })) });
const LIMITES = 'Fonte: cadastro CNPJ da Receita Federal, IBAMA e o site oficial lido pela pesquisa. Ausência de evidência nunca vira reprovação; "indeterminado" quer dizer que não se achou fonte.';

export function criarPonte({ url = 'http://127.0.0.1:3311', email, senha, fetchImpl = globalThis.fetch } = {}) {
  const base = String(url).replace(/\/+$/, '');
  let cookie = null;

  async function entrar() {
    if (!email || !senha) throw new ErroGht4(401, 'sem_credencial', 'Defina GHT4_EMAIL e GHT4_SENHA no ambiente do cliente MCP.');
    const r = await fetchImpl(`${base}/api/sessao`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GHT4-Canal': 'mcp' }, body: JSON.stringify({ email, senha }) });
    if (!r.ok) throw new ErroGht4(r.status, 'login_recusado', 'O GHT4 recusou o login. Confira e-mail, senha e GHT4_URL.');
    const definidos = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie()
      : String(r.headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_]+=)/);
    const achado = definidos.map((c) => c.split(';')[0].trim()).find((c) => c.startsWith('ght4_sessao='));
    if (!achado) throw new ErroGht4(502, 'sem_sessao', 'O GHT4 não devolveu a sessão.');
    cookie = achado;
  }

  async function pedir(metodo, caminho, corpo, cabecalhos = {}) {
    if (!cookie) await entrar();
    const chamar = () => fetchImpl(`${base}${caminho}`, { method: metodo,
      headers: { Cookie: cookie, 'X-GHT4-Canal': 'mcp', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...cabecalhos },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    let r = await chamar();
    // Sessão expirada: entra de novo uma vez.
    if (r.status === 401) { cookie = null; await entrar(); r = await chamar(); }
    const dados = await r.json().catch(() => null);
    if (!r.ok) throw new ErroGht4(r.status, dados?.erro, dados?.mensagem);
    return dados;
  }
  const detalhe = (id) => pedir('GET', `/api/pesquisas/${encodeURIComponent(id)}`, undefined, { 'X-GHT4-Lista': 'leve' });

  const ferramentas = [
    { name: 'listar_pesquisas', description: 'Lista as pesquisas por tese do membro (as 30 mais recentes), com estado e quantas empresas boas (aderentes e prováveis) já foram achadas. Pesquisas de mandato confidencial não aparecem por este canal.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      executar: async () => {
        const r = await pedir('GET', '/api/pesquisas');
        return { pesquisas: r.pesquisas.map((p) => ({ pesquisaId: p.id, tese: p.tese, estado: p.estado, motivo: p.motivo_estado, empresasBoas: p.boas, meta: p.meta, atualizadaEm: p.atualizado_em })) };
      } },
    { name: 'pesquisar_tese', description: 'Cria uma pesquisa a partir de uma tese de M&A em português (ex.: "distribuidoras de solventes em SP com mais de 20 anos, sem holding no quadro"). Devolve os critérios propostos (cadastrais e de pesquisa no site, obrigatórios ou opcionais) para revisar antes de rodar. A pesquisa fica no trabalho pessoal do membro.',
      inputSchema: { type: 'object', properties: { tese: { type: 'string', minLength: 10, maxLength: 2000 }, frente: { type: 'string', enum: ['compra', 'venda'] } }, required: ['tese'], additionalProperties: false },
      executar: async ({ tese, frente }) => {
        const r = await pedir('POST', '/api/pesquisas', { id: randomUUID(), tese, ...(frente ? { frente } : {}) });
        return { pesquisaId: r.pesquisa.id, estado: r.pesquisa.estado, frente: r.pesquisa.frente, meta: r.pesquisa.meta, modo: r.pesquisa.modo,
          criterios: r.pesquisa.criterios.map(resumoCriterio), notas: r.pesquisa.notas,
          proximo: 'Revise os critérios (ajustar_criterios) e rode iniciar_pesquisa.' };
      } },
    { name: 'ajustar_criterios', description: 'Ajusta os critérios de uma pesquisa. Em rascunho: torna critérios opcionais ou obrigatórios, remove, acrescenta critérios de pesquisa no site e muda a meta. Pesquisa já iniciada: só "tornarOpcionais", que abre uma NOVA rodada com esses critérios opcionais (a anterior fica no histórico).',
      inputSchema: { type: 'object', properties: { ...PESQUISA,
        tornarOpcionais: IDS('Ids de critérios obrigatórios que passam a opcionais.'),
        tornarObrigatorios: IDS('Ids de critérios opcionais que passam a obrigatórios (só em rascunho).'),
        remover: IDS('Ids de critérios a remover (só em rascunho).'),
        adicionar: { type: 'array', maxItems: 5, description: 'Critérios de pesquisa no site a acrescentar (só em rascunho).',
          items: { type: 'object', properties: { texto: { type: 'string', minLength: 3, maxLength: 200 }, obrigatorio: { type: 'boolean' } }, required: ['texto'], additionalProperties: false } },
        meta: { type: 'integer', minimum: 1, maximum: 200, description: 'Quantas empresas aderentes buscar.' } },
      required: ['pesquisaId'], additionalProperties: false },
      executar: async ({ pesquisaId, tornarOpcionais = [], tornarObrigatorios = [], remover = [], adicionar = [], meta }) => {
        const d = await detalhe(pesquisaId);
        const p = d.pesquisa;
        const ids = new Set(p.criterios.map((c) => c.id));
        const desconhecidos = [...tornarOpcionais, ...tornarObrigatorios, ...remover].filter((id) => !ids.has(id));
        if (desconhecidos.length) throw new ErroGht4(422, 'criterio_inexistente', `Critérios inexistentes nesta pesquisa: ${desconhecidos.join(', ')}.`);
        if (p.estado !== 'rascunho') {
          if (tornarObrigatorios.length || remover.length || adicionar.length) throw new ErroGht4(409, 'pesquisa_iniciada', 'Critérios de uma pesquisa iniciada não mudam. Só "tornarOpcionais" abre uma nova rodada.');
          if (!tornarOpcionais.length) throw new ErroGht4(422, 'nada_a_ajustar', 'Informe em "tornarOpcionais" quais critérios relaxar na nova rodada.');
          const r = await pedir('POST', `/api/pesquisas/${encodeURIComponent(p.id)}/ajustar`, { id: randomUUID(), opcionais: tornarOpcionais });
          return { novaRodada: true, pesquisaId: r.pesquisa.id, anteriorId: p.id, estado: r.pesquisa.estado, criterios: r.pesquisa.criterios.map(resumoCriterio),
            proximo: 'Rode iniciar_pesquisa na nova rodada.' };
        }
        const criterios = p.criterios.filter((c) => !remover.includes(c.id)).map((c) => ({ ...c,
          obrigatorio: tornarOpcionais.includes(c.id) ? false : tornarObrigatorios.includes(c.id) ? true : c.obrigatorio }));
        for (const a of adicionar) {
          let id = `mcp_${randomUUID().slice(0, 8)}`;
          while (criterios.some((c) => c.id === id)) id = `mcp_${randomUUID().slice(0, 8)}`;
          criterios.push({ id, texto: a.texto.trim(), obrigatorio: a.obrigatorio ?? true, tipo: 'pesquisa', regra: null, trecho: null, origem: 'usuario' });
        }
        const mudouCriterios = tornarOpcionais.length || tornarObrigatorios.length || remover.length || adicionar.length;
        const r = await pedir('PATCH', `/api/pesquisas/${encodeURIComponent(p.id)}`, { versao: p.versao, ...(mudouCriterios ? { criterios } : {}), ...(meta ? { meta } : {}) });
        return { pesquisaId: r.pesquisa.id, estado: r.pesquisa.estado, meta: r.pesquisa.meta, criterios: r.pesquisa.criterios.map(resumoCriterio) };
      } },
    { name: 'iniciar_pesquisa', description: 'Roda o funil cadastral de uma pesquisa em rascunho: aplica os critérios de cadastro ao recorte da Receita e separa as empresas que vão para a revisão no site. Devolve o funil (quantas passam, quantas cada critério elimina).',
      inputSchema: { type: 'object', properties: { ...PESQUISA }, required: ['pesquisaId'], additionalProperties: false },
      executar: async ({ pesquisaId }) => {
        const d = await detalhe(pesquisaId);
        const r = await pedir('POST', `/api/pesquisas/${encodeURIComponent(pesquisaId)}/iniciar`, { versao: d.pesquisa.versao });
        const f = r.pesquisa.funil ?? {};
        return { pesquisaId, estado: r.pesquisa.estado, funil: { recorte: f.recorte, aprovadasCadastro: f.aprovadasCadastro, comSite: f.comSite, truncado: f.truncado,
          eliminadasPor: Object.fromEntries(r.pesquisa.criterios.map((c) => [c.texto, f.eliminadasPor?.[c.id] ?? 0])) },
          contagens: r.contagens, proximo: 'Rode revisar_empresas para revisar as empresas no site, em lotes.' };
      } },
    { name: 'revisar_empresas', description: 'Revisa o próximo lote de empresas de uma pesquisa iniciada (até 5 por chamada): lê o site oficial e julga cada critério com evidência. Chame de novo até a meta ou até a pesquisa pausar/concluir.',
      inputSchema: { type: 'object', properties: { ...PESQUISA, quantidade: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['pesquisaId'], additionalProperties: false },
      executar: async ({ pesquisaId, quantidade = 3 }) => {
        const r = await pedir('POST', `/api/pesquisas/${encodeURIComponent(pesquisaId)}/avancar`, { quantidade }, { 'X-GHT4-Lista': 'leve' });
        const novas = new Set(r.atualizados ?? []);
        return { pesquisaId, estado: r.pesquisa.estado, motivo: r.pesquisa.motivo_estado, contagens: r.contagens,
          revisadasAgora: r.itens.filter((i) => novas.has(i.empresa_id)).map(resumoItem) };
      } },
    { name: 'resultado_pesquisa', description: 'Resultado de uma pesquisa: contagens e as empresas revisadas por categoria (aderente, provável, a confirmar, não aderente), com aderência 0–100 e o veredito de cada critério.',
      inputSchema: { type: 'object', properties: { ...PESQUISA, categoria: { type: 'string', enum: ['aderente', 'provavel', 'a_confirmar', 'nao_aderente'] }, limite: { type: 'integer', minimum: 1, maximum: 100 } },
        required: ['pesquisaId'], additionalProperties: false },
      executar: async ({ pesquisaId, categoria, limite = 30 }) => {
        const d = await detalhe(pesquisaId);
        /* Com categoria, a lista vem da rota do grupo, que pagina no banco: o detalhe só traz as
           primeiras 300 revisadas, e uma categoria inteira podia ficar de fora. Sem categoria, as
           primeiras do detalhe, com o total para dizer o corte. */
        const grupo = categoria ? await pedir('GET', `/api/pesquisas/${encodeURIComponent(pesquisaId)}/itens?grupo=${categoria}&limite=${limite}`) : null;
        const itens = grupo ? grupo.itens : d.itens.filter((i) => i.etapa === 'revisada').slice(0, limite);
        const total = grupo ? grupo.total : d.contagens.revisadas;
        return { pesquisaId, tese: d.pesquisa.tese, estado: d.pesquisa.estado, criterios: d.pesquisa.criterios.map(resumoCriterio), contagens: d.contagens,
          empresas: itens.map(resumoItem), mostradas: itens.length, total,
          ...(total > itens.length ? { corte: `Mostradas ${itens.length} de ${total}. A lista completa está na interface do GHT4.` } : {}), limites: LIMITES };
      } },
    { name: 'evidencias_empresa', description: 'Evidências de uma empresa numa pesquisa: para cada critério, o veredito, a justificativa e as fontes (campo da Receita, trecho e endereço da página do site).',
      inputSchema: { type: 'object', properties: { ...PESQUISA, empresaId: { type: 'string', pattern: '^cnpj\\d{8}$', description: 'Id da empresa (ex.: cnpj12345678).' } },
        required: ['pesquisaId', 'empresaId'], additionalProperties: false },
      executar: async ({ pesquisaId, empresaId }) => {
        const [d, r] = await Promise.all([detalhe(pesquisaId), pedir('GET', `/api/pesquisas/${encodeURIComponent(pesquisaId)}/itens/${encodeURIComponent(empresaId)}`)]);
        const i = r.item;
        return { empresa: { id: i.empresa_id, nome: i.empresa?.nome, razaoSocial: i.empresa?.razaoSocial, cnpjRaiz: i.empresa?.cnpjRaiz, cidade: i.empresa?.cidade, uf: i.empresa?.uf },
          categoria: i.categoria, aderencia: i.aderencia, site: i.site ? { dominio: i.site.dominio, estado: i.site.estado, paginasLidas: (i.site.paginas ?? []).map((p) => p.url) } : null,
          // Revisão humana sai só como estado (o servidor já projeta assim; aqui, por garantia).
          criterios: d.pesquisa.criterios.map((c, k) => { const v = i.vereditos[k]; const humano = v?.lastro === 'humano';
            return { criterio: c.texto, obrigatorio: c.obrigatorio, veredito: v?.veredito, resumo: v?.resumo, lastro: v?.lastro,
              justificativa: humano ? null : v?.justificativa,
              evidencias: humano ? [] : (v?.evidencias ?? []).map((e) => ({ fonte: e.fonte, url: e.url, trecho: e.trecho, referencia: e.referencia })) }; }),
          limites: LIMITES };
      } },
    { name: 'registro_execucao', description: 'Registro do que a pesquisa fez, passo a passo: critérios propostos, funil, lotes revisados, pausas, ajustes, revisões humanas e entregas, com quem fez cada passo (agente ou pessoa).',
      inputSchema: { type: 'object', properties: { ...PESQUISA, apos: { type: 'integer', minimum: 0, description: 'Só eventos depois deste id (paginação).' } }, required: ['pesquisaId'], additionalProperties: false },
      executar: async ({ pesquisaId, apos = 0 }) => {
        const r = await pedir('GET', `/api/pesquisas/${encodeURIComponent(pesquisaId)}/eventos?apos=${apos}`);
        return { pesquisaId, ultimo: r.ultimo, eventos: r.eventos.map((e) => ({ id: e.id, tipo: e.tipo, em: e.em, ator: e.ator, autor: e.autor, dados: e.dados })) };
      } },
  ];

  const resposta = (id, result) => ({ jsonrpc: '2.0', id, result });
  const falha = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  /** Trata uma mensagem JSON-RPC; devolve a resposta, ou null para notificação. */
  async function tratar(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return msg && 'id' in msg ? falha(msg.id ?? null, -32600, 'Pedido inválido.') : null;
    const notificacao = !('id' in msg);
    if (notificacao) return null;
    const { id, method, params = {} } = msg;
    if (method === 'initialize') {
      const pedido = params.protocolVersion;
      return resposta(id, { protocolVersion: PROTOCOLOS.includes(pedido) ? pedido : PROTOCOLOS[0], capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ght4', version: VERSAO },
        instructions: 'Pesquisa por tese do GHT4 (prospecção de M&A no setor químico). Fluxo: pesquisar_tese → ajustar_criterios → iniciar_pesquisa → revisar_empresas (repetir) → resultado_pesquisa / evidencias_empresa. Entrega ao trabalho, revisão humana e contato com pessoas ficam na interface do GHT4.' });
    }
    if (method === 'ping') return resposta(id, {});
    if (method === 'tools/list') return resposta(id, { tools: ferramentas.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    if (method === 'tools/call') {
      const f = ferramentas.find((x) => x.name === params.name);
      if (!f) return falha(id, -32602, `Ferramenta desconhecida: ${params.name}`);
      try {
        const r = await f.executar(params.arguments ?? {});
        return resposta(id, { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], structuredContent: r, isError: false });
      } catch (e) {
        const texto = e instanceof ErroGht4 ? `${e.message}${e.codigo ? ` (${e.codigo})` : ''}` : `Falha ao falar com o GHT4: ${e?.message ?? e}`;
        return resposta(id, { content: [{ type: 'text', text: texto }], isError: true });
      }
    }
    return falha(id, -32601, `Método não suportado: ${method}`);
  }

  return { tratar, ferramentas };
}

/* Execução por stdio: uma mensagem JSON por linha na entrada, uma por linha na saída.
   Nada além do protocolo vai para a saída padrão; diagnóstico vai para stderr. */
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const ponte = criarPonte({ url: process.env.GHT4_URL, email: process.env.GHT4_EMAIL, senha: process.env.GHT4_SENHA });
  const escrever = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
  const linhas = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let fila = Promise.resolve();
  linhas.on('line', (linha) => {
    if (!linha.trim()) return;
    let msg = null;
    try { msg = JSON.parse(linha); } catch { /* respondido na fila, na ordem de chegada */ }
    // Uma de cada vez: a ordem das respostas acompanha a dos pedidos, e a sessão é uma só.
    fila = fila.then(async () => {
      if (msg === null) { escrever({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } }); return; }
      const r = await ponte.tratar(msg); if (r) escrever(r);
    })
      .catch((e) => process.stderr.write(`[ght4-mcp] ${e?.message ?? e}\n`));
  });
  linhas.on('close', () => { void fila.then(() => process.exit(0)); });
}
