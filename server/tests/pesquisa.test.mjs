import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { interpretarTese, verificarCadastro, consolidar, ListaCriterios } from '../src/pesquisa/criterios.mjs';
import { urlLegivel, permitidoPeloRobots, obterPagina, lerSite, identidadeDoSite, ipPrivado, lookupPublico } from '../src/pesquisa/fontes-web.mjs';
import { validarPropostaIA, julgarPorTexto } from '../src/pesquisa/motor.mjs';
import { atributosDe } from '../src/agente/atributos.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { configurarIA, criarServicoIA } from '../src/agente/provedor.mjs';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso } from './ajuda.mjs';

const REF = '2026-08';
const empresa = (atributos, extra = {}) => ({ id: 'cnpj12345678', nome: 'Química Alfa', razaoSocial: 'Química Alfa Comércio Ltda', cnpjRaiz: '12345678',
  cidade: 'Campinas', uf: 'SP', cnaePrincipal: '4684299', estado: 'provavel', motivo: 'CNAE', referencia: REF, atributos, ...extra });
const ATR = { capitalSocial: 2_000_000, porte: '05', optanteSimples: false, dataAbertura: '1998-05-10', estabelecimentosAtivos: 3,
  ufsAtuacao: ['SP', 'MG'], naturezaJuridica: '2062', qtdSocios: 2, qtdSociosPj: 0, socioEstrangeiro: false, filialRecente: '2025-02-01',
  cnaesSecundarios: ['4689399'], dominio: 'alfa.com.br', ibama: { grau: 'comercio', viva: true, ano: 2025 } };

test('tese vira recorte, critérios cadastrais e de pesquisa, com preferência opcional e notas', () => {
  const r = interpretarTese('Alvos de aquisição: distribuidoras em SP com mais de 15 anos, familiares, sem sócio estrangeiro, com filiais, que representem fabricantes multinacionais; de preferência com laboratório próprio', { referencia: REF });
  assert.equal(r.frente, 'compra');
  assert.equal(r.filtros.uf, 'SP');
  const porCampo = Object.fromEntries(r.criterios.filter((c) => c.regra).map((c) => [c.regra.campo, c]));
  assert.equal(porCampo.idade_min.regra.valor, 15);
  assert.equal(porCampo.socio_estrangeiro.regra.valor, false);
  assert.equal(porCampo.sem_socio_pj.obrigatorio, true);
  assert.equal(porCampo.estabelecimentos_min.regra.valor, 2);
  const pesquisa = r.criterios.filter((c) => c.tipo === 'pesquisa');
  assert.deepEqual(pesquisa.map((c) => c.texto), ['Representem fabricantes multinacionais', 'Laboratório próprio']);
  assert.equal(pesquisa[1].obrigatorio, false);
  assert.ok(r.notas.some((n) => /Familiar/.test(n)));
  ListaCriterios.parse(r.criterios);
  const regiao = interpretarTese('Distribuidoras de médio porte no Sul, capital social acima de R$ 1,5 milhão', { referencia: REF });
  const uf = regiao.criterios.find((c) => c.regra?.campo === 'uf');
  assert.deepEqual(uf.regra.valor, ['PR', 'RS', 'SC']);
  assert.equal(regiao.criterios.find((c) => c.regra?.campo === 'capital_min').regra.valor, 1_500_000);
  assert.deepEqual(regiao.criterios.find((c) => c.regra?.campo === 'porte').regra.valor, ['DEMAIS']);
  // São Paulo sem qualificação é estado, e isso é dito.
  assert.ok(interpretarTese('Empresas em São Paulo que vendem solventes').notas.some((n) => /cidade de São Paulo/.test(n)));
  assert.ok(interpretarTese('xyz').notas.length);
});

test('verificação cadastral usa a referência do snapshot e nunca reprova por falta de dado', () => {
  const e = empresa(ATR);
  const v = (campo, valor) => verificarCadastro({ campo, valor }, e, REF).veredito;
  assert.equal(v('idade_min', 28), 'atende');
  assert.equal(v('idade_min', 29), 'nao_atende');
  assert.equal(v('capital_min', 1_000_000), 'atende');
  assert.equal(v('porte', ['EPP']), 'nao_atende');
  assert.equal(v('estabelecimentos_min', 3), 'atende');
  assert.equal(v('ufs_atuacao_min', 3), 'nao_atende');
  assert.equal(v('atua_em_uf', ['MG']), 'atende');
  assert.equal(v('sem_socio_pj', true), 'atende');
  assert.equal(v('natureza', ['sa']), 'nao_atende');
  assert.equal(v('ibama', ['comercio']), 'atende');
  assert.equal(v('filial_recente_anos', 2), 'atende');
  assert.equal(v('cnae_secundario', ['4689399']), 'atende');
  assert.equal(v('municipio', 'campinas'), 'atende');
  const sem = empresa(null);
  assert.equal(verificarCadastro({ campo: 'idade_min', valor: 10 }, sem, REF).veredito, 'indeterminado');
  assert.equal(verificarCadastro({ campo: 'uf', valor: ['SP'] }, sem, REF).veredito, 'atende');
  // Sem declaração ao IBAMA não é prova de que não opera.
  assert.equal(verificarCadastro({ campo: 'ibama', valor: ['comercio'] }, empresa({ ...ATR, ibama: null }), REF).veredito, 'indeterminado');
  assert.match(verificarCadastro({ campo: 'capital_min', valor: 1 }, e, REF).justificativa, /Não é medida de faturamento/);
});

test('aderência separa reprovação, evidência, indício e falta de evidência', () => {
  const c = [{ obrigatorio: true }, { obrigatorio: true }, { obrigatorio: false }];
  const r = (...vs) => consolidar(c, vs.map((veredito) => ({ veredito })));
  assert.deepEqual(r('atende', 'atende', 'atende'), { aderencia: 100, categoria: 'aderente' });
  assert.equal(r('atende', 'indicio', 'nao_atende').categoria, 'provavel');
  assert.equal(r('atende', 'indeterminado', 'atende').categoria, 'a_confirmar');
  assert.equal(r('nao_atende', 'atende', 'atende').categoria, 'nao_aderente');
  assert.equal(r('atende', 'atende', 'nao_atende').categoria, 'aderente');
  assert.equal(r('atende', 'atende', 'nao_atende').aderencia, 80);
});

test('leitura web recusa endereço privado, respeita robots e usa cache', async (t) => {
  assert.equal(urlLegivel('http://127.0.0.1/'), null);
  assert.equal(urlLegivel('http://intranet/'), null);
  assert.equal(urlLegivel('https://site.com.br:8443/'), null);
  assert.ok(urlLegivel('https://www.alfa.com.br/sobre'));
  assert.equal(permitidoPeloRobots('User-agent: *\nDisallow: /', '/'), false);
  assert.equal(permitidoPeloRobots('User-agent: *\nDisallow: /adm\nAllow: /adm/pub', '/adm/pub/x'), true);
  assert.equal(permitidoPeloRobots('User-agent: GHT4-Pesquisa\nDisallow: /\n\nUser-agent: *\nDisallow:', '/x'), false);
  const db = await bancoDeTeste();
  t.after(() => db.close());
  let chamadas = 0;
  const fetchImpl = async (url) => {
    chamadas++;
    if (url === 'https://redireciona.com.br/') return new Response('', { status: 302, headers: { location: 'https://interno.com.br/' } });
    return new Response('<html><title>Alfa</title><body><p>Distribuidora oficial de resinas.</p></body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  };
  const resolver = async (host) => [{ address: host === 'interno.com.br' ? '10.0.0.5' : '200.1.2.3' }];
  const a = await obterPagina(db, 'https://www.alfa.com.br/', { fetchImpl, resolver });
  assert.equal(a.estado, 'ok'); assert.match(a.texto, /Distribuidora oficial/);
  await obterPagina(db, 'https://www.alfa.com.br/', { fetchImpl, resolver });
  assert.equal(chamadas, 1, 'segunda leitura vem do cache');
  assert.equal((await obterPagina(db, 'https://redireciona.com.br/', { fetchImpl, resolver })).estado, 'bloqueada');
  assert.equal((await obterPagina(db, 'https://www.beta.com.br/', { fetchImpl, resolver, robots: 'User-agent: *\nDisallow: /' })).estado, 'bloqueada');
  assert.equal(identidadeDoSite('CNPJ 12.345.678/0001-90', empresa(ATR)), 'cnpj');
  assert.equal(identidadeDoSite('Bem-vindo ao nosso site', empresa(ATR)), 'dominio');
  assert.equal(identidadeDoSite('A Química Alfa atende todo o Brasil', { ...empresa(ATR), nome: 'Distribuidora Vetorquim', razaoSocial: 'Vetorquim Ltda' }), 'dominio');
});

test('sem IA, o site só gera indício quando os termos aparecem juntos', () => {
  const site = { dominio: 'alfa.com.br', paginas: [{ url: 'https://www.alfa.com.br/' }] };
  const frases = [{ url: 'https://www.alfa.com.br/', texto: 'Somos distribuidores autorizados de fabricantes multinacionais de resinas.' }];
  assert.equal(julgarPorTexto({ texto: 'Representem fabricantes multinacionais' }, frases, site).veredito, 'indicio');
  const nada = julgarPorTexto({ texto: 'Possui laboratório próprio' }, frases, site);
  assert.equal(nada.veredito, 'indeterminado'); assert.equal(nada.evidencias.length, 0);
  // Radical só vale no início da palavra: "colaboradores" não é laboratório.
  const falso = julgarPorTexto({ texto: 'Laboratório próprio' }, [{ url: 'u', texto: 'Valorizamos nossos colaboradores e parceiros.' }], site);
  assert.equal(falso.veredito, 'indeterminado'); assert.equal(falso.evidencias.length, 0);
});

test('proposta da IA sem base literal na tese é descartada', () => {
  const r = validarPropostaIA({ frente: 'venda', criterios: [
    { texto: 'Mais de 10 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 10 }, trecho: 'mais de 10 anos' },
    { texto: 'Faturamento acima de 50 mi', obrigatorio: true, tipo: 'pesquisa', regra: null, trecho: 'faturamento alto' },
    { texto: 'Regra inventada', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'receita_min', valor: 5 }, trecho: 'mais de 10 anos' },
  ], notas: [] }, 'Distribuidoras com mais de 10 anos');
  assert.equal(r.criterios.length, 2);
  assert.equal(r.criterios[1].tipo, 'pesquisa', 'regra desconhecida vira pesquisa, não filtro inventado');
  assert.ok(r.notas.some((n) => /descartados/.test(n)));
});

/* ---- fluxo completo pela API ---------------------------------------------- */

async function catalogoDeTeste(t) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-pesquisa-'));
  const arquivo = path.join(pasta, 'base.js');
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const linha = (raiz, nome, abertura, pj, email) => [`cnpj${raiz}`, nome, `${nome} Ltda`, raiz, 'Campinas', 'SP', '4684299', [], '02', '2062',
    500000, '05', abertura, 2, ['SP'], 2, pj, false, { email, telefone: '(19) 0000-0000' }];
  const linhas = [
    linha('11111111', 'Alfa Química', '1990-01-01', 0, 'contato@alfa.com.br'),
    linha('22222222', 'Beta Química', '2015-01-01', 0, 'joao@beta.com.br'),
    linha('33333333', 'Gama Química', '1985-01-01', 1, 'x@gama.com.br'),
    linha('44444444', 'Delta Química', '1992-01-01', 0, 'fulano@gmail.com'),
  ];
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${REF}";`);
  return criarCatalogo({ arquivo, arquivoIbama: null });
}

const SITE = {
  'https://www.alfa.com.br/': '<html><title>Alfa</title><body><a href="/quem-somos">Quem somos</a><p>Alfa Química, CNPJ 11.111.111/0001-00.</p></body></html>',
  'https://www.alfa.com.br/quem-somos': '<html><body><p>Somos distribuidores autorizados de fabricantes multinacionais de solventes e resinas.</p></body></html>',
};
const fetchSites = async (url) => {
  if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /admin', { headers: { 'content-type': 'text/plain' } });
  if (SITE[url]) return new Response(SITE[url], { headers: { 'content-type': 'text/html' } });
  return new Response('nao', { status: 404 });
};

async function preparar(t, { servicoIA = null, papel = 'analista', fetchImpl = fetchSites } = {}) {
  const db = await bancoDeTeste();
  const catalogo = await catalogoDeTeste(t);
  const app = await criarApp(db, { catalogo, servicoIA, web: { fetchImpl, resolver: async () => [{ address: '200.1.2.3' }] } });
  t.after(async () => { await app.close(); await db.close(); });
  const entrar = async (email, p) => {
    await criarUsuario(db, { email, senha: 'senha-de-teste', papel: p });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha: 'senha-de-teste' } });
    const cookie = r.headers['set-cookie'].split(';')[0];
    return (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
  };
  return { db, app, chamar: await entrar('analista@teste.local', papel), entrar };
}

test('pesquisa por tese: rascunho, funil, revisão no site, entrega ao trabalho e seleção', async (t) => {
  const { chamar, entrar, db } = await preparar(t);
  const id = randomUUID();
  const criada = await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos, sem holding no quadro, que representem fabricantes multinacionais' });
  assert.equal(criada.statusCode, 201, criada.body);
  const { pesquisa } = criada.json();
  assert.equal(pesquisa.estado, 'rascunho'); assert.equal(pesquisa.modo, 'regras');
  assert.deepEqual(pesquisa.criterios.map((c) => c.tipo), ['cadastro', 'cadastro', 'pesquisa']);
  assert.equal((await chamar('POST', '/api/pesquisas', { id, tese: 'outra tese qualquer aqui' })).statusCode, 409);

  // Prévia mostra quem cada critério elimina, e quantas voltariam se ele fosse opcional.
  const previa = (await chamar('POST', `/api/pesquisas/${id}/previa`, { criterios: pesquisa.criterios, filtros: pesquisa.filtros })).json();
  assert.equal(previa.funil.recorte, 4);
  assert.equal(previa.funil.aprovadasCadastro, 2);
  assert.equal(previa.funil.exclusivas[pesquisa.criterios[0].id], 1);

  const editada = await chamar('PATCH', `/api/pesquisas/${id}`, { versao: pesquisa.versao, meta: 1 });
  assert.equal(editada.statusCode, 200, editada.body);
  const iniciada = (await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: editada.json().pesquisa.versao })).json();
  assert.equal(iniciada.pesquisa.estado, 'pronta');
  assert.equal(iniciada.contagens.total, 2);
  assert.equal(iniciada.pesquisa.funil.comSite, 1, 'webmail não conta como site');
  assert.equal((await chamar('PATCH', `/api/pesquisas/${id}`, { versao: iniciada.pesquisa.versao, criterios: pesquisa.criterios })).statusCode, 409);

  const lote = (await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 })).json();
  const alfa = lote.itens.find((i) => i.empresa_id === 'cnpj11111111');
  assert.equal(alfa.etapa, 'revisada');
  assert.equal(alfa.site.identidade, 'cnpj');
  assert.equal(alfa.vereditos[2].veredito, 'indicio');
  assert.match(alfa.vereditos[2].evidencias[0].trecho, /fabricantes multinacionais/);
  assert.equal(alfa.categoria, 'provavel');
  assert.equal(alfa.empresa.atributos, undefined, 'atributos internos não saem na API');
  const delta = lote.itens.find((i) => i.empresa_id === 'cnpj44444444');
  assert.equal(delta.vereditos[2].veredito, 'indeterminado'); assert.match(delta.vereditos[2].resumo, /Sem site/);
  assert.equal(lote.pesquisa.estado, 'concluida');
  assert.ok(!JSON.stringify(lote).includes('joao@'), 'e-mail cadastral não vaza');

  const chave = randomUUID();
  const entregue = await chamar('POST', `/api/pesquisas/${id}/registrar`, { chave, empresas: ['cnpj11111111'] });
  assert.equal(entregue.statusCode, 200, entregue.body);
  const { turno, conversa } = entregue.json();
  assert.equal(turno.pedido.tarefa, 'pesquisar_tese');
  assert.equal(turno.resultado.empresas[0].id, 'cnpj11111111');
  assert.equal((await chamar('POST', `/api/pesquisas/${id}/registrar`, { chave, empresas: ['cnpj44444444'] })).statusCode, 409);
  const lista = await chamar('POST', `/api/agente/conversas/${conversa.id}/selecao/lote`, { turnoId: turno.id, empresas: ['cnpj11111111'], justificativa: 'Aderente à tese' });
  assert.equal(lista.statusCode, 200, lista.body); assert.equal(lista.json().adicionadas, 1);
  assert.ok((await db.query("SELECT count(*)::int n FROM auditoria WHERE entidade='pesquisa_tese'")).rows[0].n >= 3);

  // Outro membro não enxerga a pesquisa; leitura não cria.
  const outro = await entrar('outro@teste.local', 'analista');
  assert.equal((await outro('GET', `/api/pesquisas/${id}`)).statusCode, 404);
  const leitor = await entrar('leitor@teste.local', 'leitura');
  assert.equal((await leitor('POST', '/api/pesquisas', { id: randomUUID(), tese: 'Distribuidoras em SP' })).statusCode, 403);
});

test('com IA gratuita, citação inventada não sustenta veredito', async (t) => {
  const corpos = [];
  const fetchIA = async (url, opcoes) => {
    const corpo = JSON.parse(opcoes.body);
    corpos.push({ url, corpo, auth: opcoes.headers.Authorization });
    const dados = JSON.parse(corpo.messages[1].content);
    const conteudo = dados.tese ? { frente: null, criterios: [
      { texto: 'Mais de 20 anos de fundação', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 }, trecho: 'mais de 20 anos' },
      { texto: 'Representa fabricantes multinacionais', obrigatorio: true, tipo: 'pesquisa', regra: null, trecho: 'representem fabricantes multinacionais' },
      { texto: 'Tem laboratório', obrigatorio: false, tipo: 'pesquisa', regra: null, trecho: 'tenham laboratório' },
    ], notas: [] } : { avaliacoes: dados.criterios.map((c, k) => k === 0
      ? { id: c.id, veredito: 'atende', resumo: 'Distribuidor autorizado', justificativa: 'Trecho explícito.', citacoes: [{ n: dados.trechos.findIndex((x) => /multinacionais/.test(x.texto)), trecho: 'distribuidores autorizados de fabricantes multinacionais' }] }
      : { id: c.id, veredito: 'atende', resumo: 'Tem laboratório', justificativa: 'Inventado.', citacoes: [{ n: 0, trecho: 'possui laboratório de análises' }] }) };
    return Response.json({ choices: [{ message: { content: JSON.stringify(conteudo) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  };
  const db0 = await bancoDeTeste(); await db0.close();
  const config = configurarIA({ GHT4_IA_PROVEDOR: 'gemini', GEMINI_API_KEY: 'chave-gratuita-teste' });
  assert.equal(config.modelo, 'gemini-2.5-flash'); assert.equal(config.gratuito, true); assert.equal(config.web, false);
  const db = await bancoDeTeste();
  const catalogo = await catalogoDeTeste(t);
  const servicoIA = criarServicoIA(db, config, { fetchImpl: fetchIA });
  const app = await criarApp(db, { catalogo, servicoIA, web: { fetchImpl: fetchSites, resolver: async () => [{ address: '200.1.2.3' }] } });
  t.after(async () => { await app.close(); await db.close(); });
  await criarUsuario(db, { email: 'ia@teste.local', senha: 'senha-de-teste' });
  const login = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email: 'ia@teste.local', senha: 'senha-de-teste' } });
  const chamar = (method, url, payload) => app.inject({ method, url, payload, headers: { cookie: login.headers['set-cookie'].split(';')[0] } });
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos que representem fabricantes multinacionais e tenham laboratório' })).json();
  assert.match(pesquisa.modo, /^ia:gemini/);
  assert.equal(pesquisa.criterios.length, 3);
  assert.equal(corpos[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(corpos[0].auth, 'Bearer chave-gratuita-teste');
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
  const r = (await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 })).json();
  const alfa = r.itens.find((i) => i.empresa_id === 'cnpj11111111');
  assert.equal(alfa.vereditos[1].veredito, 'atende');
  assert.equal(alfa.vereditos[1].lastro, 'ia');
  assert.equal(alfa.vereditos[2].veredito, 'indeterminado', 'trecho que não existe no site não vale');
  assert.equal(alfa.categoria, 'aderente');
  const julgamento = corpos.find((c) => c.corpo.messages[1].content.includes('trechos'));
  assert.ok(!julgamento.corpo.messages[1].content.includes('contato@'), 'IA recebe só trechos públicos');
  assert.equal((await db.query("SELECT count(*)::int n FROM ia_execucoes WHERE tarefa='revisao'")).rows[0].n, 2, 'proposta + só a empresa com site legível');
  // Camada gratuita não recebe documento confidencial de oportunidade, nem consome cota tentando.
  const antes = corpos.length;
  await assert.rejects(servicoIA.redigir({ tarefa: 'conversar', pedido: 'Resuma', contexto: {}, documentos: [{ id: randomUUID(), nome: 'NDA.pdf', hash: 'x', trechos: [] }],
    execucao: { usuarioId: randomUUID(), conversaId: randomUUID(), chave: randomUUID(), corpoHash: 'h' } }), /documentos_em_provedor_gratuito/);
  assert.equal(corpos.length, antes);
});

test('com o catálogo no banco, iniciar não prende a transação e usa os atributos importados', async (t) => {
  const { importarCatalogo } = await import('../src/agente/importar-catalogo.mjs');
  const { criarCatalogoBanco } = await import('../src/agente/catalogo-banco.mjs');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const linhas = [
    ['cnpj11111111', 'Alfa Química', 'Alfa Química Ltda', '11111111', 'Campinas', 'SP', '4684299', [], '02', '2062', 500000, '05', '1990-01-01', 3, ['SP'], 2, 0, false, { email: 'a@alfa.com.br' }],
    ['cnpj22222222', 'Beta Química', 'Beta Química Ltda', '22222222', 'Santos', 'SP', '4684299', [], '02', '2062', 500000, '05', '2020-01-01', 1, ['SP'], 2, 0, false, null],
  ];
  const texto = `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${REF}";`;
  const db = await bancoDeTeste();
  await importarCatalogo(db, { texto, versaoRegras: 'teste' });
  const registrado = (await db.query("SELECT r.atributos FROM catalogo_registros r JOIN entidades_juridicas e ON e.id=r.entidade_id WHERE e.cnpj_raiz='11111111'")).rows[0].atributos;
  assert.equal(registrado.dominio, 'alfa.com.br'); assert.equal(registrado.estabelecimentosAtivos, 3);
  assert.ok(!JSON.stringify((await db.query('SELECT atributos FROM catalogo_registros')).rows).includes('a@alfa'), 'só o domínio é gravado');
  const app = await criarApp(db, { catalogo: criarCatalogoBanco(db) });
  t.after(async () => { await app.close(); await db.close(); });
  await criarUsuario(db, { email: 'banco@teste.local', senha: 'senha-de-teste' });
  const login = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email: 'banco@teste.local', senha: 'senha-de-teste' } });
  const chamar = (method, url, payload) => app.inject({ method, url, payload, headers: { cookie: login.headers['set-cookie'].split(';')[0] } });
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 10 anos e com filiais' })).json();
  const r = await Promise.race([chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao }),
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error('iniciar travou')), 8000))]);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().pesquisa.funil.aprovadasCadastro, 1);
  assert.equal(r.json().itens[0].empresa_id, 'cnpj11111111');
});

test('repetir a criação revalida o mandato da conversa gravada e recusa outro contexto', async (t) => {
  const { db, chamar } = await preparar(t);
  const analista = (await db.query(`SELECT id FROM usuarios WHERE email='analista@teste.local'`)).rows[0].id;
  const mandato = await criarMandato(db, { codigo: 'M-PESQ-1', confidencial: true });
  await darAcesso(db, mandato.id, analista);
  const id = randomUUID();
  const corpo = { id, tese: 'Distribuidoras com mais de 20 anos que representem fabricantes multinacionais', mandatoId: mandato.id };
  assert.equal((await chamar('POST', '/api/pesquisas', corpo)).statusCode, 201);
  assert.equal((await chamar('POST', '/api/pesquisas', corpo)).statusCode, 200, 'repetição idempotente com acesso');
  assert.equal((await chamar('POST', '/api/pesquisas', { ...corpo, mandatoId: null })).statusCode, 409, 'mesmo ID em outro contexto');
  await db.query('DELETE FROM mandato_membros WHERE mandato_id=$1 AND usuario_id=$2', [mandato.id, analista]);
  assert.equal((await chamar('GET', `/api/pesquisas/${id}`)).statusCode, 404);
  const repetida = await chamar('POST', '/api/pesquisas', corpo);
  assert.notEqual(repetida.statusCode, 200);
  assert.doesNotMatch(repetida.body, /fabricantes multinacionais/);
});

test('conexão usa o endereço aprovado: DNS trocado para rede interna depois da conferência é bloqueado', async (t) => {
  for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '100.64.0.1', '192.0.2.1', '198.18.0.1', '0.0.0.0', '::1', '::ffff:10.0.0.1',
    'fd00::1', 'fe80::1', '64:ff9b::a00:1', '2002:a00::1', '2001:db8::1', 'não é ip']) assert.equal(ipPrivado(ip), true, ip);
  for (const ip of ['200.1.2.3', '8.8.8.8', '2804:14c::1']) assert.equal(ipPrivado(ip), false, ip);
  const entregue = await new Promise((resolve) => lookupPublico(async () => [{ address: '200.1.2.3', family: 4 }])('alfa.com.br', { all: true }, (e, l) => resolve(e ?? l)));
  assert.deepEqual(entregue, [{ address: '200.1.2.3', family: 4 }]);
  const misto = await new Promise((resolve) => lookupPublico(async () => [{ address: '200.1.2.3' }, { address: '10.0.0.1' }])('alfa.com.br', {}, (e) => resolve(e)));
  assert.equal(misto.code, 'ENDERECO_NAO_PUBLICO');
  // Rebinding: a conferência vê IP público; a resolução da conexão, IP interno. Sem fetchImpl, vale o transporte fixado.
  const db = await bancoDeTeste();
  t.after(() => db.close());
  let consultas = 0;
  const resolver = async () => (++consultas === 1 ? [{ address: '200.1.2.3' }] : [{ address: '127.0.0.1' }]);
  const r = await obterPagina(db, 'https://rebind.com.br/', { resolver });
  assert.equal(r.estado, 'bloqueada');
  assert.ok(consultas >= 2, 'a conexão resolveu de novo pelo lookup fixado');
});

/** Fetch que segura a página inicial da Alfa até `soltar()`; as demais respostas seguem normais. */
function fetchComPortao({ vezes = 1 } = {}) {
  let soltar; const portao = new Promise((r) => { soltar = r; });
  let restantes = vezes, chegou; const chegada = new Promise((r) => { chegou = r; });
  const fetchImpl = async (url, o) => {
    if (url === 'https://www.alfa.com.br/' && restantes > 0) { restantes--; chegou(); await portao; }
    return fetchSites(url, o);
  };
  return { fetchImpl, soltar: () => soltar(), chegada };
}
async function pesquisaPronta(chamar, meta = 5) {
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos, sem holding no quadro, que representem fabricantes multinacionais' })).json();
  const editada = (await chamar('PATCH', `/api/pesquisas/${id}`, { versao: pesquisa.versao, meta })).json();
  const iniciada = (await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: editada.pesquisa.versao })).json();
  assert.equal(iniciada.pesquisa.estado, 'pronta');
  return id;
}

test('pausa pedida durante o lote não é desfeita quando ele termina', async (t) => {
  const g = fetchComPortao();
  const { chamar } = await preparar(t, { fetchImpl: g.fetchImpl });
  const id = await pesquisaPronta(chamar);
  const lote = chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 });
  await g.chegada;
  assert.equal((await chamar('POST', `/api/pesquisas/${id}/pausar`)).json().pesquisa.estado, 'pausada');
  g.soltar();
  const fim = (await lote).json();
  assert.equal(fim.pesquisa.estado, 'pausada');
  assert.equal(fim.pesquisa.motivo_estado, 'Pausada por você.');
  const depois = (await chamar('GET', `/api/pesquisas/${id}`)).json();
  assert.equal(depois.pesquisa.estado, 'pausada');
  assert.ok(depois.contagens.pendentes >= 1, 'a pausa impediu novas reservas');
});

test('lote vencido não grava por cima de quem retomou a reserva', async (t) => {
  const g = fetchComPortao();
  const { chamar, db } = await preparar(t, { fetchImpl: g.fetchImpl });
  const id = await pesquisaPronta(chamar);
  const antigo = chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 1 });
  await g.chegada;
  // A reserva do lote antigo vence; outro lote a retoma e conclui.
  await db.query(`UPDATE pesquisa_itens SET reservado_em=now()-interval '10 minutes' WHERE pesquisa_id=$1 AND etapa='em_revisao'`, [id]);
  const novo = (await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 1 })).json();
  assert.deepEqual(novo.atualizados, ['cnpj11111111']);
  g.soltar();
  const velho = (await antigo).json();
  assert.deepEqual(velho.atualizados, [], 'a ficha do lote vencido não vale mais');
  const item = (await db.query(`SELECT tentativas, etapa FROM pesquisa_itens WHERE pesquisa_id=$1 AND empresa_id='cnpj11111111'`, [id])).rows[0];
  assert.deepEqual(item, { tentativas: 2, etapa: 'revisada' });
});

test('orçamento web conta reservas em voo', async (t) => {
  const g = fetchComPortao();
  const { chamar, db } = await preparar(t, { fetchImpl: g.fetchImpl });
  const id = await pesquisaPronta(chamar);
  await db.query('UPDATE pesquisas_tese SET limite_web=1 WHERE id=$1', [id]);
  const primeiro = chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 });
  await g.chegada;
  const segundo = (await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 })).json();
  assert.deepEqual(segundo.atualizados, [], 'a reserva em voo já usa o orçamento');
  g.soltar();
  await primeiro;
  const usados = (await db.query('SELECT count(*)::int n FROM pesquisa_itens WHERE pesquisa_id=$1 AND site IS NOT NULL', [id])).rows[0].n;
  assert.equal(usados, 1);
});

test('atributo que a fonte não trouxe é desconhecido; vazio apurado continua reprovando', () => {
  const v = (atributos, campo, valor) => verificarCadastro({ campo, valor }, empresa(atributos), REF).veredito;
  const parcial = atributosDe({ cnpjRaiz: '12345678' });
  assert.equal(parcial.filialRecente, null); assert.equal(parcial.cnaesSecundarios, null); assert.equal(parcial.ufsAtuacao, null);
  assert.equal(v(parcial, 'filial_recente_anos', 3), 'indeterminado');
  assert.equal(v(parcial, 'cnae_secundario', ['4689399']), 'indeterminado');
  assert.equal(v(parcial, 'cnae_secundario', ['4684299']), 'atende', 'o CNAE principal ainda decide');
  assert.equal(v(parcial, 'ufs_atuacao_min', 2), 'indeterminado');
  const apurado = atributosDe({ cnpjRaiz: '12345678', aberturaFilialRecente: null, cnaeSecundarias: [], ufsAtuacao: [] });
  assert.equal(apurado.filialRecente, false);
  assert.equal(v(apurado, 'filial_recente_anos', 3), 'nao_atende');
  assert.equal(v(apurado, 'cnae_secundario', ['4689399']), 'nao_atende');
});
