/* Regressões do parecer do Codex sobre as Rodadas 20 e 25 (AI_COLLAB.md, commit 7845da1). Cada
   teste reproduz um achado e confere a correção da Rodada 27. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/app.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso } from './ajuda.mjs';
import { interpretarPedido } from '../src/encontrar/pedido.mjs';
import { avaliarEmpresa, julgarPessoa } from '../src/encontrar/triagem.mjs';
import { empresasParecidas } from '../src/encontrar/nomes.mjs';
import { interpretarTese, verificarCadastro } from '../src/pesquisa/criterios.mjs';
import { criarPonte } from '../../ferramentas/mcp-ght4.mjs';
import { posicaoNaDecisao } from '../src/acesso/plano.mjs';

const senha = 'Senha restrita aos testes 2026!';
const REF = '2026-08';

test('27: área de cargo negado mantém a exclusão até o fim da lista e o grupo final', () => {
  const empresa = { id: 'cnpj11111111', nome: 'Alfa', cnpjRaiz: '11111111' };
  const ctx = { empresa, avaliacao: avaliarEmpresa(empresa, [], REF), caminho: null, incompletos: 0,
    respostas: 0, negativas: 0, membros: 1, restricao: null };
  const pessoa = { id: randomUUID(), nome: 'Caio', cargo: 'CEO', senioridade: 'ceo', origem: 'manual',
    origem_referencia: 'Site institucional', empresa_id: empresa.id };
  for (const separador of ['e', 'ou', ',', 'nem']) {
    const lida = interpretarPedido(`CFOs exceto gerentes comerciais ${separador} CEOs`);
    assert.deepEqual(lida.papel.excluidas.sort(), ['ceo', 'gerencia']);
    assert.equal(julgarPessoa(pessoa, ctx, lida).grupo, 'excluido');
  }
  assert.deepEqual(interpretarPedido('CEOs, sem gerentes comerciais, e CFOs').papel.senioridades.sort(), ['ceo', 'cfo']);
});

test('27: representar um sócio ou negar participação não prova ser dono, no plano e no find', () => {
  const empresa = { id: 'cnpj11111111', nome: 'Alfa', cnpjRaiz: '11111111' };
  const ctx = { empresa, avaliacao: avaliarEmpresa(empresa, [], REF), caminho: null, incompletos: 0,
    respostas: 0, negativas: 0, membros: 1, restricao: null };
  for (const cargo of ['Representante do sócio pessoa jurídica', 'Administrador não sócio', 'CEO sem ser sócio', 'Ex-sócio']) {
    assert.equal(posicaoNaDecisao('ceo', null, cargo).id, 'influencia', cargo);
    const pessoa = { id: randomUUID(), nome: 'Caio', cargo, senioridade: 'ceo', origem: 'manual',
      origem_referencia: 'Site institucional', empresa_id: empresa.id };
    assert.equal(julgarPessoa(pessoa, ctx, interpretarPedido('Quem decide')).grupo, 'revisar', cargo);
  }
  for (const cargo of ['Sócia-administradora', 'CEO e acionista', 'Sócio controlador', 'Titular', 'Representante do sócio e sócio-administrador']) {
    assert.equal(posicaoNaDecisao('ceo', null, cargo).id, 'decide', cargo);
  }
});

test('25 [P2]: a negação vale para a lista de cargos, até outra palavra separar', () => {
  const lista = interpretarPedido('CFOs exceto CEOs e gerentes');
  assert.deepEqual(lista.papel.senioridades, ['cfo']);
  assert.deepEqual(lista.papel.excluidas.sort(), ['ceo', 'gerencia']);
  // O grupo final, não só a leitura: a gerente sai do pedido.
  const empresa = { id: 'cnpj11111111', nome: 'Alfa', cnpjRaiz: '11111111' };
  const avaliacao = avaliarEmpresa(empresa, [], REF);
  const gerente = julgarPessoa({ id: randomUUID(), nome: 'Gil', cargo: 'Gerente comercial', senioridade: 'gerencia', origem: 'manual', origem_referencia: 'Cartão', empresa_id: empresa.id },
    { empresa, avaliacao, caminho: null, incompletos: 0, respostas: 0, negativas: 0, membros: 1, restricao: null }, lista);
  assert.equal(gerente.grupo, 'excluido');
  assert.match(gerente.motivo, /^Cargo fora do pedido \(Gerência\)/);

  assert.deepEqual(interpretarPedido('Quem decide nas distribuidoras, sem gerentes e diretores').papel.excluidas.sort(), ['diretoria', 'gerencia'],
    '"sem diretores" tira a diretoria, não o presidente');
  assert.deepEqual(interpretarPedido('CFOs exceto CEOs, gerentes e conselheiros').papel.excluidas.sort(), ['ceo', 'conselho', 'gerencia']);
  assert.deepEqual(interpretarPedido('sem CEOs nem CFOs, só diretores').papel.excluidas.sort(), ['ceo', 'cfo']);
  // ", e" fecha a oração intercalada, e "com" separa: o cargo seguinte volta a ser pedido.
  assert.deepEqual(interpretarPedido('CEOs, sem gerentes, e CFOs').papel.senioridades.sort(), ['ceo', 'cfo']);
  assert.deepEqual(interpretarPedido('sem gerentes e com diretores das tradings').papel.excluidas, ['gerencia']);
});

test('25 [P2]: município negado com preposição, cidades explícitas em alternativa e lista em minúsculas', () => {
  const municipios = new Set(['campinas', 'osasco', 'sorocaba']);
  const campinas = { cidade: 'Campinas', uf: 'SP' }, osasco = { cidade: 'Osasco', uf: 'SP' }, santos = { cidade: 'Santos', uf: 'SP' };
  const veredito = (tese, empresa) => {
    const r = interpretarTese(tese, { municipios });
    const regras = r.criterios.filter((c) => /municipio/.test(c.regra?.campo ?? ''));
    assert.equal(regras.length, 1, `${tese}: ${JSON.stringify(r.criterios.map((c) => c.regra))}`);
    return verificarCadastro(regras[0].regra, empresa, REF).veredito;
  };
  for (const [tese, esperado] of [
    ['Distribuidoras fora da cidade de Campinas', { campinas: 'nao_atende', osasco: 'atende' }],
    ['Distribuidoras na cidade de Campinas ou na cidade de Osasco', { campinas: 'atende', osasco: 'atende', santos: 'nao_atende' }],
    ['Distribuidoras em campinas ou osasco', { campinas: 'atende', osasco: 'atende', santos: 'nao_atende' }],
    ['Distribuidoras exceto em Campinas', { campinas: 'nao_atende', osasco: 'atende' }],
  ]) {
    for (const [nome, v] of Object.entries(esperado)) assert.equal(veredito(tese, { campinas, osasco, santos }[nome]), v, `${tese} · ${nome}`);
  }
  // O mesmo leitor serve o find.
  assert.deepEqual(interpretarPedido('Quem decide nas distribuidoras na cidade de Campinas ou na cidade de Osasco', { municipios }).criterios.map((c) => c.regra),
    [{ campo: 'municipios', valor: ['Campinas', 'Osasco'] }]);
});

test('25 [P2]: sugestão de CNPJ com a leitura parada no teto não afirma ausência nem total', async () => {
  // 100.001 empresas com "Alfa" no nome; a "Alfa Rara" é a última, depois do teto da varredura.
  const TOTAL = 100001;
  const empresa = (k) => ({ id: `cnpj${String(k).padStart(8, '0')}`, nome: k === TOTAL - 1 ? 'Alfa Rara' : `Alfa ${k}`, razaoSocial: null, cnpjRaiz: String(k).padStart(8, '0') });
  const catalogo = { recorte: async (_f, { apos = null, limite }) => {
    const ini = apos ?? 0, fim = Math.min(TOTAL, ini + limite);
    return { empresas: Array.from({ length: fim - ini }, (_, i) => empresa(ini + i)), total: TOTAL, hash: 'h', proximo: fim < TOTAL ? fim : null, referencia: REF };
  } };
  const r = await empresasParecidas(catalogo, 'Alfa Rara');
  assert.equal(r.incompleta, true);
  assert.deepEqual(r.empresas, []);
});

async function montar(t) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-parecer-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'base.js');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const linhas = [['11111111', 'Alfa Química'], ['22222222', 'Beta Química']].map(([raiz, nome]) => [`cnpj${raiz}`, nome, `${nome} Ltda`, raiz,
    'Campinas', 'SP', '4684299', [], '02', '2062', 500000, '05', '1990-01-01', 1, ['SP'], 2, 0, false, {}]);
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${REF}";`);
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo: criarCatalogo({ arquivo, arquivoIbama: null }) });
  t.after(async () => { await app.close(); await db.close(); });
  async function usuario(email, papel, nome) {
    const u = await criarUsuario(db, { email, papel, senha, nome });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha } });
    const cookie = r.headers['set-cookie'].split(';')[0];
    return { ...u, chamar: (method, url, payload, headers = {}) => app.inject({ method, url, payload, headers: { cookie, ...headers } }) };
  }
  /** Pesquisa do membro com a Alfa já revisada (o motor tem os próprios testes). */
  async function pesquisa(quem, mandatoId = null) {
    const id = randomUUID();
    const r = await quem.chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos que representem fabricantes multinacionais', ...(mandatoId ? { mandatoId } : {}) });
    assert.equal(r.statusCode, 201, r.body);
    const { criterios } = r.json().pesquisa;
    const vereditos = criterios.map((c) => ({ veredito: 'indeterminado', resumo: 'Sem evidência', lastro: c.tipo === 'cadastro' ? 'cadastro' : 'site', evidencias: [] }));
    await db.query(`INSERT INTO pesquisa_itens (pesquisa_id, empresa_id, ordem, empresa, etapa, vereditos, aderencia, categoria)
      VALUES ($1,'cnpj11111111',0,$2,'revisada',$3,50,'a_confirmar')`, [id, JSON.stringify({ id: 'cnpj11111111', nome: 'Alfa Química', cnpjRaiz: '11111111', cidade: 'Campinas', uf: 'SP' }), JSON.stringify(vereditos)]);
    return { id, criterios, site: criterios.findIndex((c) => c.tipo === 'pesquisa') };
  }
  return { db, app, usuario, pesquisa };
}

test('20 [P1]: registrar quem decide a partir de mandato confidencial só com a confirmação de compartilhar', async (t) => {
  const { db, usuario, pesquisa } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const analista = await usuario('analista@teste.local', 'analista', 'Ana Lista');
  const confidencial = await criarMandato(db, { codigo: 'CONF-REVIEW', confidencial: true });
  await darAcesso(db, confidencial.id, socio.id, 'socio');
  const { id } = await pesquisa(socio, confidencial.id);

  const plano = (await socio.chamar('GET', `/api/acesso/cnpj11111111?pesquisaId=${id}`)).json();
  assert.equal(plano.compartilhamento, 'confirmar');
  const decisor = (extra = {}) => ({ id: randomUUID(), nome: 'Maria Exemplo', cargo: 'Sócia-administradora', senioridade: 'ceo', pesquisaId: id,
    fonte: { tipo: 'conhecimento_da_casa', descricao: 'Reuniao reservada do mandato CONF-REVIEW: cliente procura vender o controle' }, ...extra });
  const recusa = await socio.chamar('POST', '/api/acesso/cnpj11111111/decisores', decisor());
  assert.equal(recusa.statusCode, 409);
  assert.equal(recusa.json().erro, 'confirmar_compartilhamento');
  assert.equal((await db.query("SELECT count(*)::int n FROM rede_pessoas WHERE nome='Maria Exemplo'")).rows[0].n, 0, 'nada gravado sem a confirmação');
  // O analista sem participação não vê nada do mandato.
  assert.ok(!JSON.stringify((await analista.chamar('GET', '/api/acesso/cnpj11111111')).json()).includes('CONF-REVIEW'));

  // Com a confirmação, a pessoa e a fonte escrita para compartilhar entram na rede, e a auditoria guarda o mandato de origem.
  const ok = await socio.chamar('POST', '/api/acesso/cnpj11111111/decisores', decisor({ compartilhar: true,
    fonte: { tipo: 'site_oficial', descricao: 'Página Quem somos da Alfa', url: 'https://alfa.com.br/quem-somos' } }));
  assert.equal(ok.statusCode, 201, ok.body);
  const auditoria = (await db.query("SELECT mandato_id, depois FROM auditoria WHERE acao='registrar_decisor'")).rows;
  assert.equal(auditoria.length, 1);
  assert.equal(auditoria[0].mandato_id, confidencial.id);
  assert.equal(auditoria[0].depois.compartilhadoDeMandatoConfidencial, true);

  // Fora de mandato confidencial, nada muda: registra sem a confirmação.
  const aberta = await pesquisa(socio);
  assert.equal((await socio.chamar('GET', `/api/acesso/cnpj22222222?pesquisaId=${aberta.id}`)).statusCode, 404, 'a Beta não está nesta pesquisa');
  assert.equal((await socio.chamar('GET', `/api/acesso/cnpj11111111?pesquisaId=${aberta.id}`)).json().compartilhamento, null);
  assert.equal((await socio.chamar('POST', '/api/acesso/cnpj11111111/decisores', { ...decisor({ nome: 'Rui Exemplo', pesquisaId: aberta.id }) })).statusCode, 201);
});

/** Adaptador: a ponte MCP falando com o app em memória, sem rede. */
const viaInject = (app) => async (url, opcoes = {}) => {
  const u = new URL(url);
  const r = await app.inject({ method: opcoes.method ?? 'GET', url: u.pathname + u.search, headers: opcoes.headers, payload: opcoes.body });
  const cabecalhos = new Headers();
  for (const [k, v] of Object.entries(r.headers)) for (const x of [v].flat()) cabecalhos.append(k, String(x));
  return new Response(r.statusCode === 204 ? null : r.body, { status: r.statusCode, headers: cabecalhos });
};

test('20 [P1]: revisão humana sai pelo canal externo só como estado, sem texto livre nem histórico', async (t) => {
  const { app, usuario, pesquisa } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const { id, criterios, site } = await pesquisa(socio);
  const PRIVADO = 'Conversa com Maria Exemplo, celular 11999990000 e maria@exemplo.invalid; ela confirmou o criterio.';
  const feita = await socio.chamar('POST', `/api/pesquisas/${id}/itens/cnpj11111111/revisao`, { criterioId: criterios[site].id, veredito: 'atende',
    justificativa: PRIVADO, fonte: { descricao: 'Ligação para Maria Exemplo' }, anterior: { veredito: 'indeterminado', lastro: 'site' } });
  assert.equal(feita.statusCode, 200, feita.body);
  // Na interface, tudo; no canal externo, só o estado.
  assert.ok(JSON.stringify((await socio.chamar('GET', `/api/pesquisas/${id}/itens/cnpj11111111`)).json()).includes('Maria Exemplo'));
  for (const url of [`/api/pesquisas/${id}/itens/cnpj11111111`, `/api/pesquisas/${id}`, `/api/pesquisas/${id}/itens?grupo=a_confirmar`]) {
    const corpo = (await socio.chamar('GET', url, undefined, { 'x-ght4-canal': 'mcp' })).json();
    const texto = JSON.stringify(corpo);
    for (const marca of ['Maria', '11999990000', 'exemplo.invalid', 'Helena', 'Ligação']) assert.ok(!texto.includes(marca), `${url}: ${marca}`);
    const item = corpo.item ?? corpo.itens.find((i) => i.empresa_id === 'cnpj11111111');
    assert.deepEqual(item.vereditos[site], { veredito: 'atende', lastro: 'humano', resumo: 'Revisado por alguém da casa. A justificativa e a fonte ficam na interface do GHT4.', justificativa: null, evidencias: [] });
    if ('revisoes' in corpo) assert.deepEqual(corpo.revisoes, []);
  }
  // A ponte real, ferramenta a ferramenta.
  const ponte = criarPonte({ url: 'http://ght4.teste', email: 'socio@teste.local', senha, fetchImpl: viaInject(app) });
  for (const [name, args] of [['evidencias_empresa', { pesquisaId: id, empresaId: 'cnpj11111111' }], ['resultado_pesquisa', { pesquisaId: id }]]) {
    const r = await ponte.tratar({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    assert.equal(r.result.isError, false, JSON.stringify(r));
    const texto = JSON.stringify(r.result);
    for (const marca of ['Maria', '11999990000', 'exemplo.invalid']) assert.ok(!texto.includes(marca), `${name}: ${marca}`);
  }
});

test('20 [P2]: a aba antiga não sobrescreve nem desfaz uma revisão humana mais nova com o mesmo veredito', async (t) => {
  const { usuario, pesquisa } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const { id, criterios, site } = await pesquisa(socio);
  const url = `/api/pesquisas/${id}/itens/cnpj11111111/revisao`;
  const revisar = (justificativa, anterior) => socio.chamar('POST', url, { criterioId: criterios[site].id, veredito: 'atende', justificativa, anterior });
  const a = (await revisar('Decisão A, confirmada no site.', { veredito: 'indeterminado', lastro: 'site' })).json().item.vereditos[site];
  const vistaPelasDuas = { veredito: 'atende', lastro: 'humano', versao: a.revisao.versao };
  const b = await revisar('Decisão B, com a fonte nova.', vistaPelasDuas);
  assert.equal(b.statusCode, 200);
  const antiga = await revisar('Aba antiga sobrescreveu a fonte B.', vistaPelasDuas);
  assert.equal(antiga.statusCode, 409);
  assert.equal(antiga.json().erro, 'veredito_atualizado');
  const desfazAntiga = await socio.chamar('POST', `${url}/desfazer`, { criterioId: criterios[site].id, anterior: vistaPelasDuas });
  assert.equal(desfazAntiga.statusCode, 409);
  const atual = (await socio.chamar('GET', `/api/pesquisas/${id}/itens/cnpj11111111`)).json();
  assert.equal(atual.item.vereditos[site].justificativa, 'Decisão B, com a fonte nova.');
  assert.deepEqual(atual.revisoes.map((r) => r.acao), ['revisar', 'revisar'], 'a recusa não grava versão');
  const vistaB = { veredito: 'atende', lastro: 'humano', versao: b.json().item.vereditos[site].revisao.versao };
  assert.equal((await socio.chamar('POST', `${url}/desfazer`, { criterioId: criterios[site].id, anterior: vistaB })).statusCode, 200);
});

test('20 [P2]: resultado_pesquisa pela ponte acha a categoria que está depois das 300 primeiras', async () => {
  const item = (k, categoria) => ({ empresa_id: `cnpj${String(k).padStart(8, '0')}`, empresa: { nome: `Empresa ${k}` }, etapa: 'revisada', categoria, aderencia: 50, vereditos: [] });
  const pedidos = [];
  const fetchImpl = async (url, opcoes = {}) => {
    const u = new URL(url);
    pedidos.push(u.pathname + u.search);
    if (u.pathname === '/api/sessao') return new Response('{}', { status: 200, headers: { 'set-cookie': 'ght4_sessao=abc; Path=/' } });
    if (u.searchParams.get('grupo') === 'nao_aderente') return Response.json({ itens: [item(301, 'nao_aderente')], total: 1, marca: 'm', proximoOffset: null });
    return Response.json({ pesquisa: { id: 'p', tese: 'x', estado: 'concluida', criterios: [] }, marca: 'm',
      contagens: { total: 301, revisadas: 301, pendentes: 0, aderente: 300, provavel: 0, a_confirmar: 0, nao_aderente: 1 },
      itens: Array.from({ length: 300 }, (_, k) => item(k, 'aderente')) });
  };
  const ponte = criarPonte({ url: 'http://ght4.teste', email: 'x@teste.local', senha: 's', fetchImpl });
  const r = await ponte.tratar({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'resultado_pesquisa', arguments: { pesquisaId: randomUUID(), categoria: 'nao_aderente' } } });
  assert.deepEqual(r.result.structuredContent.empresas.map((e) => e.nome), ['Empresa 301']);
  assert.equal(r.result.structuredContent.total, 1);
  assert.ok(pedidos.some((p) => p.includes('grupo=nao_aderente')));
  // Sem categoria, o corte é declarado.
  const todas = await ponte.tratar({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'resultado_pesquisa', arguments: { pesquisaId: randomUUID(), limite: 30 } } });
  assert.match(todas.result.structuredContent.corte, /Mostradas 30 de 301/);
});

test('20 [P2]: dois cadastros do mesmo decisor: o segundo, já depois da trava, vê o primeiro', async (t) => {
  // A corrida real pede PostgreSQL com duas conexões; aqui, a ordem: a trava vem antes da consulta.
  const { usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const corpo = (id) => ({ id, nome: 'Rui Prado', cargo: 'Sócio-administrador', senioridade: 'ceo', fonte: { tipo: 'site_oficial', descricao: 'Página Quem somos' } });
  const [um, dois] = await Promise.all([socio.chamar('POST', '/api/acesso/cnpj11111111/decisores', corpo(randomUUID())),
    socio.chamar('POST', '/api/acesso/cnpj11111111/decisores', corpo(randomUUID()))]);
  assert.deepEqual([um.statusCode, dois.statusCode].sort(), [201, 409]);
});
