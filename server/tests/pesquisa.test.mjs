import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { interpretarTese, verificarCadastro, consolidar, ListaCriterios } from '../src/pesquisa/criterios.mjs';
import { urlLegivel, permitidoPeloRobots, obterPagina, lerSite, identidadeDoSite, ipPrivado, lookupPublico } from '../src/pesquisa/fontes-web.mjs';
import { validarPropostaIA, julgarPorTexto, criarMotorPesquisa } from '../src/pesquisa/motor.mjs';
import { atributosDe } from '../src/agente/atributos.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { configurarIA, criarServicoIA } from '../src/agente/provedor.mjs';
import { resumirTexto } from '../src/api/pesquisas.mjs';
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
  assert.equal(porCampo.sem_socio_pj.obrigatorio, false, '"familiar" não vira reprovação por holding');
  assert.equal(porCampo.estabelecimentos_min.regra.valor, 2);
  const pesquisa = r.criterios.filter((c) => c.tipo === 'pesquisa');
  assert.deepEqual(pesquisa.map((c) => c.texto), ['Controle familiar', 'Representem fabricantes multinacionais', 'Laboratório próprio']);
  assert.equal(pesquisa[2].obrigatorio, false);
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

const LEVE = { 'x-ght4-lista': 'leve' };
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
    return (method, url, payload, cabecalhos = {}) => app.inject({ method, url, payload, headers: { cookie, ...cabecalhos } });
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

  const lote = (await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 }, LEVE)).json();
  const alfa = lote.itens.find((i) => i.empresa_id === 'cnpj11111111');
  assert.equal(alfa.etapa, 'revisada');
  assert.equal(alfa.site.identidade, 'cnpj');
  assert.equal(alfa.vereditos[2].veredito, 'indicio');
  // A lista vem leve: sem justificativa, trechos nem páginas; o item completo vem ao abrir a empresa.
  assert.equal(alfa.resumido, true);
  assert.equal(alfa.vereditos[2].evidencias, undefined);
  assert.equal(alfa.vereditos[2].justificativa, undefined);
  assert.equal(alfa.site.paginas, undefined);
  const completo = (await chamar('GET', `/api/pesquisas/${id}/itens/cnpj11111111`)).json().item;
  assert.match(completo.vereditos[2].evidencias[0].trecho, /fabricantes multinacionais/);
  assert.ok(completo.vereditos[2].justificativa);
  assert.ok(completo.site.paginas.length >= 1);
  assert.equal(completo.empresa.atributos, undefined, 'atributos internos não saem no item completo');
  assert.equal(completo.resumido, undefined);
  // Contrato negociado: sem o cabeçalho (cliente anterior, aba aberta antes da publicação), lista completa
  // no detalhe e na continuação; com ele, lista leve também na continuação.
  const antigo = (await chamar('GET', `/api/pesquisas/${id}`)).json().itens.find((i) => i.empresa_id === 'cnpj11111111');
  assert.equal(antigo.resumido, undefined);
  assert.match(antigo.vereditos[2].evidencias[0].trecho, /fabricantes multinacionais/);
  assert.ok(antigo.vereditos[2].justificativa); assert.ok(antigo.site.paginas.length >= 1);
  const contAntiga = (await chamar('GET', `/api/pesquisas/${id}/itens?grupo=provavel`)).json().itens[0];
  assert.ok(Array.isArray(contAntiga.vereditos[2].evidencias));
  const contLeve = (await chamar('GET', `/api/pesquisas/${id}/itens?grupo=provavel`, undefined, LEVE)).json().itens[0];
  assert.equal(contLeve.resumido, true); assert.equal(contLeve.vereditos[2].evidencias, undefined);
  assert.equal((await chamar('GET', `/api/pesquisas/${id}`, undefined, LEVE)).json().itens.find((i) => i.empresa_id === 'cnpj11111111').resumido, true);
  assert.equal((await chamar('GET', `/api/pesquisas/${id}/itens/cnpj99999999`)).statusCode, 404);
  assert.equal((await chamar('GET', `/api/pesquisas/${id}/itens/nao-e-cnpj`)).statusCode, 422);
  const intruso = await entrar('intruso-item@teste.local', 'analista');
  assert.equal((await intruso('GET', `/api/pesquisas/${id}/itens/cnpj11111111`)).statusCode, 404, 'item completo só para quem acessa a pesquisa');
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

test('avanço antigo não desfaz pausa, conclusão nem retomada mais nova', async (t) => {
  const { chamar, db } = await preparar(t);
  // Intercala uma ação exatamente antes da transição do avanço (a janela entre ler e gravar).
  const original = db.query.bind(db);
  let antes = null;
  db.query = async (sql, ...resto) => {
    if (antes && /estado='em_andamento', motivo_estado=NULL|AND estado='em_andamento' AND execucao=\$2/.test(sql)) { const f = antes; antes = null; await f(); }
    return original(sql, ...resto);
  };
  t.after(() => { db.query = original; });
  const estado = async (id) => (await original('SELECT estado, execucao, motivo_estado FROM pesquisas_tese WHERE id=$1', [id])).rows[0];

  // Retomada explícita que leu "pronta", com pausa entre a leitura e a transição: não vira retomada.
  const a = await pesquisaPronta(chamar, 4);
  antes = () => chamar('POST', `/api/pesquisas/${a}/pausar`);
  const r1 = (await chamar('POST', `/api/pesquisas/${a}/avancar`, { quantidade: 1 })).json();
  assert.deepEqual(r1.atualizados, []);
  assert.deepEqual(await estado(a), { estado: 'pausada', execucao: 0, motivo_estado: 'Pausada por você.' });

  // Continuação da geração 1 com pausa intercalada: não revisa, não limpa o motivo, não abre geração.
  const b = await pesquisaPronta(chamar, 4);
  const g1 = (await chamar('POST', `/api/pesquisas/${b}/avancar`, { quantidade: 1 })).json();
  assert.equal(g1.pesquisa.execucao, 1); assert.equal(g1.pesquisa.estado, 'em_andamento');
  antes = () => chamar('POST', `/api/pesquisas/${b}/pausar`);
  const r2 = (await chamar('POST', `/api/pesquisas/${b}/avancar`, { quantidade: 1, execucao: 1 })).json();
  assert.deepEqual(r2.atualizados, []);
  assert.deepEqual(await estado(b), { estado: 'pausada', execucao: 1, motivo_estado: 'Pausada por você.' });

  // Retomada mais nova (geração 2): continuação atrasada da geração 1 não entra nela.
  const g2 = (await chamar('POST', `/api/pesquisas/${b}/avancar`, { quantidade: 1 })).json();
  assert.equal(g2.pesquisa.execucao, 2);
  const r3 = (await chamar('POST', `/api/pesquisas/${b}/avancar`, { quantidade: 1, execucao: 1 })).json();
  assert.deepEqual(r3.atualizados, []);
  assert.equal(r3.pesquisa.execucao, 2);

  // Conclusão intercalada: o avanço não reabre a pesquisa.
  antes = () => original(`UPDATE pesquisas_tese SET estado='concluida', motivo_estado='Meta atingida.' WHERE id=$1`, [b]);
  const r4 = (await chamar('POST', `/api/pesquisas/${b}/avancar`, { quantidade: 1, execucao: 2 })).json();
  assert.deepEqual(r4.atualizados, []);
  assert.equal((await estado(b)).estado, 'concluida');
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

test('redirecionamento: outro domínio não vira evidência, robots vale por origem e antes do cache, URL final é guardada', async (t) => {
  const db = await bancoDeTeste();
  t.after(() => db.close());
  const resolver = async () => [{ address: '200.1.2.3' }];
  const html = (txt) => new Response(`<html><title>T</title><body><p>${txt}</p></body></html>`, { headers: { 'content-type': 'text/html' } });
  let robotsApex = 'User-agent: *\nDisallow:';
  const fetchImpl = async (url) => {
    const vai = (destino) => new Response('', { status: 301, headers: { location: destino } });
    if (url.endsWith('/robots.txt')) return new Response(url.startsWith('https://gama.com.br') ? robotsApex : 'User-agent: *\nDisallow:', { headers: { 'content-type': 'text/plain' } });
    if (url === 'https://www.alfa.com.br/') return vai('https://terceiro.com.br/privado');
    if (url === 'https://alfa.com.br/' || url === 'http://www.alfa.com.br/') return vai('https://terceiro.com.br/privado');
    if (url === 'https://terceiro.com.br/privado') return html('Conteúdo de outra empresa: distribuidora de resinas.');
    if (url === 'https://www.gama.com.br/') return vai('https://gama.com.br/inicio');
    if (url === 'https://gama.com.br/inicio') return html('Gama Química, distribuidora oficial de solventes há trinta anos.');
    return new Response('nao', { status: 404 });
  };
  const alfa = await lerSite(db, empresa({ ...ATR, dominio: 'alfa.com.br' }), { fetchImpl, resolver });
  assert.equal(alfa.estado, 'bloqueada');
  assert.deepEqual(alfa.paginas, []);
  assert.match(alfa.motivo, /outro domínio/);

  const gama = await lerSite(db, empresa({ ...ATR, dominio: 'gama.com.br' }), { fetchImpl, resolver });
  assert.equal(gama.estado, 'lido');
  assert.equal(gama.paginas[0].url, 'https://gama.com.br/inicio', 'evidência aponta para onde a leitura foi');
  assert.deepEqual(gama.paginas[0].cadeia, ['https://www.gama.com.br/', 'https://gama.com.br/inicio']);

  // O robots da origem final passa a proibir: o cache não é devolvido.
  robotsApex = 'User-agent: *\nDisallow: /inicio';
  await db.query("DELETE FROM paginas_publicas WHERE url='https://gama.com.br/robots.txt'");
  const depois = await lerSite(db, empresa({ ...ATR, dominio: 'gama.com.br' }), { fetchImpl, resolver });
  assert.equal(depois.estado, 'bloqueada');
  assert.match(depois.motivo, /robots/);

  // Falha passageira expira em um dia, não em trinta.
  const agora = Date.now();
  const falha = async () => new Response('erro', { status: 503 });
  assert.equal((await obterPagina(db, 'https://www.delta.com.br/', { fetchImpl: falha, resolver, agora })).estado, 'falhou');
  let chamadas = 0;
  const volta = async (u) => { chamadas++; return u.endsWith('robots.txt') ? new Response('', { status: 404 }) : html('Delta Química de volta ao ar.'); };
  assert.equal((await obterPagina(db, 'https://www.delta.com.br/', { fetchImpl: volta, resolver, agora: agora + 2 * 24 * 3600 * 1000 })).estado, 'ok');
  assert.equal(chamadas, 1);
});

test('corte de 300 não esconde a aderente; grupos e fila continuam por página com contagem global', async (t) => {
  const { chamar, db } = await preparar(t);
  const id = await pesquisaPronta(chamar);
  // 301 revisadas a confirmar + a única aderente na posição 300 da ordem do funil + 60 na fila.
  await db.query('DELETE FROM pesquisa_itens WHERE pesquisa_id=$1', [id]);
  await db.query(`INSERT INTO pesquisa_itens (pesquisa_id,empresa_id,ordem,empresa,etapa,vereditos,aderencia,categoria,revisado_em)
    SELECT $1, 'cnpj'||lpad(n::text,8,'0'), n, jsonb_build_object('id','cnpj'||lpad(n::text,8,'0'),'nome','E'||n,'cidade','X','uf','SP'),
      CASE WHEN n>301 THEN 'aguardando' ELSE 'revisada' END, '[]',
      CASE WHEN n=300 THEN 100 ELSE 40 END, CASE WHEN n=300 THEN 'aderente' WHEN n>301 THEN 'a_confirmar' ELSE 'a_confirmar' END,
      CASE WHEN n>301 THEN NULL ELSE now() END
    FROM generate_series(1,361) n`, [id]);
  const d = (await chamar('GET', `/api/pesquisas/${id}`)).json();
  assert.equal(d.contagens.aderente, 1);
  assert.equal(d.itens[0].empresa_id, 'cnpj00000300', 'a aderente vem primeiro, antes do corte');
  assert.equal(d.itens.filter((i) => i.etapa === 'revisada').length, 300);
  assert.equal(d.itens.filter((i) => i.etapa !== 'revisada').length, 50);
  assert.equal(d.contagens.pendentes, 60);
  const resto = (await chamar('GET', `/api/pesquisas/${id}/itens?grupo=a_confirmar&offset=299`)).json();
  assert.equal(resto.total, 300); assert.equal(resto.itens.length, 1); assert.equal(resto.proximoOffset, null);
  const fila = (await chamar('GET', `/api/pesquisas/${id}/itens?grupo=fila&offset=50`)).json();
  assert.equal(fila.itens.length, 10);
  assert.equal((await chamar('GET', `/api/pesquisas/${id}/itens?grupo=outro`)).statusCode, 422);
});

test('corpo não lido é encerrado: redirecionamento, HTTP de erro e tipo ilegível', async (t) => {
  const db = await bancoDeTeste();
  t.after(() => db.close());
  const encerrados = [];
  // Corpo que nunca termina sozinho: só é liberado se quem recebe cancelar.
  const corpo = (nome) => new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => { encerrados.push(nome); } });
  const fetchImpl = async (url) => {
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow:', { headers: { 'content-type': 'text/plain' } });
    if (url === 'https://redir.com.br/') return new Response(corpo('redirecionamento'), { status: 301, headers: { location: 'https://redir.com.br/fim' } });
    if (url === 'https://redir.com.br/fim') return new Response(corpo('erro'), { status: 500 });
    if (url === 'https://pdf.com.br/') return new Response(corpo('tipo'), { headers: { 'content-type': 'application/pdf' } });
    return new Response('nao', { status: 404 });
  };
  const resolver = async () => [{ address: '200.1.2.3' }];
  const r1 = await obterPagina(db, 'https://redir.com.br/', { fetchImpl, resolver });
  assert.equal(r1.estado, 'falhou');
  const r2 = await obterPagina(db, 'https://pdf.com.br/', { fetchImpl, resolver });
  assert.equal(r2.estado, 'sem_html');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(encerrados.sort(), ['erro', 'redirecionamento', 'tipo']);
});

test('continuação da lista confronta a marca do snapshot: revisão nova entre páginas é recusada', async (t) => {
  const { chamar, db } = await preparar(t);
  const id = await pesquisaPronta(chamar);
  // 300 aderentes revisadas + 1 pendente que vai virar a melhor aderente.
  await db.query('DELETE FROM pesquisa_itens WHERE pesquisa_id=$1', [id]);
  await db.query(`INSERT INTO pesquisa_itens (pesquisa_id,empresa_id,ordem,empresa,etapa,vereditos,aderencia,categoria,revisado_em)
    SELECT $1, 'cnpj'||lpad(n::text,8,'0'), n, jsonb_build_object('id','cnpj'||lpad(n::text,8,'0'),'nome','E'||n,'cidade','X','uf','SP'),
      CASE WHEN n=301 THEN 'aguardando' ELSE 'revisada' END, '[]', 80, CASE WHEN n=301 THEN 'a_confirmar' ELSE 'aderente' END,
      CASE WHEN n=301 THEN NULL ELSE now() END
    FROM generate_series(1,301) n`, [id]);
  const d = (await chamar('GET', `/api/pesquisas/${id}`)).json();
  assert.match(d.marca, /^[a-f0-9]{32}$/);
  assert.equal(d.contagens.aderente, 300);
  assert.equal(d.itens.filter((i) => i.etapa === 'revisada').length, 300, 'contagem e itens do mesmo snapshot');
  // Mesma marca: continuação aceita.
  const ok = await chamar('GET', `/api/pesquisas/${id}/itens?grupo=aderente&offset=300&marca=${d.marca}`);
  assert.equal(ok.statusCode, 200); assert.equal(ok.json().marca, d.marca);
  // A pendente é revisada como a melhor aderente entre o detalhe e a continuação.
  await db.query(`UPDATE pesquisa_itens SET etapa='revisada', categoria='aderente', aderencia=100, revisado_em=now() WHERE pesquisa_id=$1 AND empresa_id='cnpj00000301'`, [id]);
  const velha = await chamar('GET', `/api/pesquisas/${id}/itens?grupo=aderente&offset=300&marca=${d.marca}`);
  assert.equal(velha.statusCode, 409);
  assert.equal(velha.json().codigo ?? velha.json().erro ?? velha.json().code, 'lista_atualizada', velha.body);
  // Recarregado, a nova melhor vem primeiro e a marca é outra.
  const novo = (await chamar('GET', `/api/pesquisas/${id}`)).json();
  assert.notEqual(novo.marca, d.marca);
  assert.equal(novo.itens[0].empresa_id, 'cnpj00000301');
  assert.equal(novo.contagens.aderente, 301);
  const resto = (await chamar('GET', `/api/pesquisas/${id}/itens?grupo=aderente&offset=300&marca=${novo.marca}`)).json();
  assert.equal(resto.itens.length, 1); assert.equal(resto.proximoOffset, null);
  assert.ok(!novo.itens.some((i) => i.empresa_id === resto.itens[0].empresa_id), 'a continuação não repete a primeira página');
});

test('pausa automática com ficha só pausa a geração do próprio laço; a humana pausa a execução', async (t) => {
  const { chamar, db } = await preparar(t);
  const id = await pesquisaPronta(chamar, 4);
  const g1 = (await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 1 })).json();
  assert.equal(g1.execucaoLote, 1);
  // Outra aba pausa e retoma: geração 2 (a retomada é simulada no banco para não esgotar a fila pequena).
  await chamar('POST', `/api/pesquisas/${id}/pausar`);
  await db.query(`UPDATE pesquisas_tese SET estado='em_andamento', motivo_estado=NULL, execucao=2 WHERE id=$1`, [id]);
  // Continuação atrasada da geração 1 não roda e diz isso.
  const velho = (await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 1, execucao: 1 })).json();
  assert.equal(velho.execucaoLote, null);
  // Pausa automática do laço abandonado (geração 1) não desfaz a retomada 2.
  const auto = (await chamar('POST', `/api/pesquisas/${id}/pausar`, { execucao: 1 })).json();
  assert.equal(auto.pesquisa.estado, 'em_andamento'); assert.equal(auto.pesquisa.execucao, 2);
  // Com a ficha certa, pausa.
  assert.equal((await chamar('POST', `/api/pesquisas/${id}/pausar`, { execucao: 2 })).json().pesquisa.estado, 'pausada');
  // Pausa humana (sem ficha) vale para a execução compartilhada.
  await db.query(`UPDATE pesquisas_tese SET estado='em_andamento', execucao=3 WHERE id=$1`, [id]);
  assert.equal((await chamar('POST', `/api/pesquisas/${id}/pausar`)).json().pesquisa.estado, 'pausada');
});

test('resposta HTTP hostil vira erro recuperável, sem derrubar o processo', async () => {
  const { execFile } = await import('node:child_process');
  const modulo = new URL('../src/pesquisa/fontes-web.mjs', import.meta.url).href;
  // Processo isolado: se a exceção escapasse da Promise, o filho morreria sem imprimir o resultado.
  const script = `
    import net from 'node:net';
    const { fetchFixado } = await import(${JSON.stringify(modulo)});
    const Q = String.fromCharCode(13, 10); const respostas = ['HTTP/1.1 700 Estranho' + Q + 'Content-Length: 2' + Q + Q + 'ok', 'HTTP/1.1 200 OK' + Q + 'Content-Length: 2' + Q + Q + 'ok'];
    let n = 0;
    const servidor = net.createServer((s) => { const r = respostas[n++]; s.once('data', () => s.end(r)); }).listen(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    const porta = servidor.address().port;
    const lookupConexao = (h, o, cb) => (o?.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4));
    const saida = [];
    try { await fetchFixado('http://hostil.test:' + porta + '/', { lookupConexao, signal: AbortSignal.timeout(3000) }); saida.push('sem erro'); }
    catch (e) { saida.push('rejeitou:' + /Status HTTP inválido/.test(e.message)); }
    const ok = await fetchFixado('http://hostil.test:' + porta + '/', { lookupConexao, signal: AbortSignal.timeout(3000) });
    saida.push('depois:' + ok.status + ':' + await ok.text());
    servidor.close();
    console.log(saida.join('|'));`;
  const { stdout } = await new Promise((resolve, reject) => execFile(process.execPath, ['--input-type=module', '-e', script], { timeout: 15000 },
    (e, out, err) => (e ? reject(Object.assign(e, { stderr: err })) : resolve({ stdout: out }))));
  assert.equal(stdout.trim(), 'rejeitou:true|depois:200:ok');
});

test('IA: sem trecho ou com valor que o trecho não diz, o critério é descartado; corte de pesquisa avisa', () => {
  const tese = 'Distribuidoras com mais de 20 anos e pelo menos 3 filiais';
  const r = validarPropostaIA({ frente: null, criterios: [
    { texto: 'Sem sócio PJ', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'sem_socio_pj', valor: true }, trecho: null },
    { texto: 'Mais de 30 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 30 }, trecho: 'mais de 20 anos' },
    { texto: 'Mais de 2 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 2 }, trecho: 'mais de 20 anos' },
    { texto: 'Mais de 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 }, trecho: 'mais de 20 anos' },
  ], notas: [] }, tese);
  assert.deepEqual(r.criterios.map((c) => c.regra?.valor), [20]);
  assert.ok(r.notas.some((n) => /3 critério/.test(n)));
  // Idade máxima tem a mesma conferência que a mínima.
  const ate = validarPropostaIA({ frente: null, criterios: [
    { texto: 'Até 90 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_max', valor: 90 }, trecho: 'ate 20 anos' },
    { texto: 'Até 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_max', valor: 20 }, trecho: 'ate 20 anos' },
  ], notas: [] }, 'Distribuidoras com ate 20 anos');
  assert.deepEqual(ate.criterios.map((c) => [c.regra?.campo, c.regra?.valor]), [['idade_max', 20]]);
  assert.ok(ate.notas.some((n) => /1 critério/.test(n)), ate.notas.join(' | '));
  const muitas = interpretarTese('Distribuidoras que representem fabricantes alemães; que atendam o agronegócio paulista; que tenham laboratório próprio certificado; que exportem solventes industriais; que façam mistura de resinas; que possuam frota própria refrigerada');
  assert.ok(muitas.notas.some((n) => /limite de \d+ critérios de pesquisa/.test(n)), muitas.notas.join(' | '));
});

test('prazo do lote chega ao DNS e ao corpo: o lote para no prazo e a empresa volta à fila sem falha em cache', async (t) => {
  const { chamar, db } = await preparar(t);
  const id = await pesquisaPronta(chamar);
  await db.query(`UPDATE pesquisas_tese SET estado='em_andamento', execucao=1 WHERE id=$1`, [id]);
  const pesquisa = (await db.query('SELECT * FROM pesquisas_tese WHERE id=$1', [id])).rows[0];
  const usuario = { id: pesquisa.usuario_id };
  const medir = async (web) => {
    const motor = criarMotorPesquisa({ db, catalogo: null, servicoIA: null, web });
    const inicio = Date.now();
    const r = await motor.avancar(pesquisa, usuario, { quantidade: 3, prazoMs: 400, execucao: 1 });
    return { r, ms: Date.now() - inicio };
  };
  // DNS que nunca responde.
  const dnsPreso = await medir({ fetchImpl: fetchSites, resolver: () => new Promise(() => {}) });
  assert.ok(dnsPreso.ms < 3000, `parou em ${dnsPreso.ms} ms`);
  assert.deepEqual(dnsPreso.r.atualizados, []);
  // Corpo que começa e não termina.
  const corpoPreso = async (url, o) => {
    if (url.endsWith('/robots.txt')) return fetchSites(url, o);
    const corpo = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('<html><body>')); o.signal.addEventListener('abort', () => c.error(new Error('abortado'))); } });
    return new Response(corpo, { headers: { 'content-type': 'text/html' } });
  };
  const corpo = await medir({ fetchImpl: corpoPreso, resolver: async () => [{ address: '200.1.2.3' }] });
  assert.ok(corpo.ms < 3000, `parou em ${corpo.ms} ms`);
  const itens = (await db.query(`SELECT etapa FROM pesquisa_itens WHERE pesquisa_id=$1 AND empresa_id='cnpj11111111'`, [id])).rows[0];
  assert.equal(itens.etapa, 'aguardando');
  const falhas = (await db.query(`SELECT count(*)::int n FROM paginas_publicas WHERE estado='falhou'`)).rows[0].n;
  assert.equal(falhas, 0, 'interrupção por prazo não vira "site indisponível" no cache');
});

test('localização: capital explícita vira município no estado; "sede em" ambíguo fica como estado com nota', () => {
  const regra = (t, campo) => interpretarTese(t, { referencia: REF }).criterios.find((c) => c.regra?.campo === campo)?.regra.valor;
  const sp = interpretarTese('Distribuidoras na cidade de São Paulo que vendam solventes', { referencia: REF });
  assert.equal(sp.filtros.uf, 'SP'); assert.equal(regra('Distribuidoras na cidade de São Paulo que vendam solventes', 'municipio'), 'São Paulo');
  const rj = interpretarTese('Distribuidoras na cidade do Rio de Janeiro', { referencia: REF });
  assert.equal(rj.filtros.uf, 'RJ'); assert.equal(regra('Distribuidoras na cidade do Rio de Janeiro', 'municipio'), 'Rio de Janeiro');
  const ambigua = interpretarTese('Distribuidoras sediadas em São Paulo', { referencia: REF });
  assert.equal(ambigua.filtros.uf, 'SP'); assert.equal(regra('Distribuidoras sediadas em São Paulo', 'municipio'), undefined);
  assert.ok(ambigua.notas.some((n) => /cidade de São Paulo/.test(n)));
  assert.equal(regra('Distribuidoras com sede em Campinas', 'municipio'), 'Campinas');
  // Sede (município) e atuação (UF de estabelecimento) continuam critérios diferentes.
  const atuacao = interpretarTese('Distribuidoras na cidade de São Paulo com atuação em MG', { referencia: REF });
  assert.ok(atuacao.criterios.some((c) => c.regra?.campo === 'municipio'));
  const explicito = interpretarTese('Distribuidoras sem holding no quadro', { referencia: REF });
  assert.equal(explicito.criterios.find((c) => c.regra?.campo === 'sem_socio_pj').obrigatorio, true, 'pedido explícito continua obrigatório');
});

test('entrega leva avaliação por critério com trecho, URL interna e data; base fora do ar não deixa conversa órfã', async (t) => {
  const { chamar, db } = await preparar(t);
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos, sem holding no quadro, que representem fabricantes multinacionais' })).json();
  const editada = (await chamar('PATCH', `/api/pesquisas/${id}`, { versao: pesquisa.versao, meta: 1 })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: editada.pesquisa.versao });
  await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 });
  const { turno } = (await chamar('POST', `/api/pesquisas/${id}/registrar`, { chave: randomUUID(), empresas: ['cnpj11111111'] })).json();
  const r = turno.resultado;
  assert.equal(r.pesquisa.id, id); assert.ok(r.pesquisa.catalogoHash);
  // Textos gravados (título, resumo, citações): nenhum objeto vira "[object Object]".
  const tese = 'Distribuidoras com mais de 20 anos, sem holding no quadro, que representem fabricantes multinacionais';
  const conversa = (await db.query('SELECT titulo FROM agente_conversas WHERE id=(SELECT conversa_id FROM pesquisas_tese WHERE id=$1)', [id])).rows[0];
  assert.equal(conversa.titulo, 'Pesquisa · Distribuidoras com mais de 20 anos, sem holding no quadro, que representem fabricantes…', 'título cortado em 100');
  assert.equal(r.resumo.startsWith(`Empresas escolhidas na pesquisa "${tese}".`), true, r.resumo);
  const citacoes = r.blocos.find((b) => b.titulo === 'Evidências citadas').itens;
  assert.match(citacoes[0], /^Alfa[^:]*· .+: "[^"]*fabricantes multinacionais[^"]*" \(https:\/\/www\.alfa\.com\.br\/quem-somos\)$/);
  assert.doesNotMatch(JSON.stringify(r) + conversa.titulo, /\[object Object\]/);
  const criterio = r.avaliacoes[0].criterios.find((c) => c.tipo === 'pesquisa');
  assert.ok(criterio.evidencias.length, 'evidência do critério de pesquisa chega à entrega');
  assert.equal(criterio.evidencias[0].url, 'https://www.alfa.com.br/quem-somos', 'página interna citada, não só a inicial');
  assert.match(criterio.evidencias[0].lidaEm, /^\d{4}-\d{2}-\d{2}/);
  assert.ok(r.fontes.some((f) => f.url === 'https://www.alfa.com.br/quem-somos'));
  assert.ok(r.blocos.some((b) => b.titulo === 'Evidências citadas'));

  // Base indisponível na criação: a conversa criada para a pesquisa é arquivada.
  const quebrado = { buscar: async () => { throw new Error('fora do ar'); }, obter: async () => null };
  const app2 = await criarApp(db, { catalogo: quebrado, web: { fetchImpl: fetchSites, resolver: async () => [{ address: '200.1.2.3' }] } });
  t.after(() => app2.close());
  const login = await app2.inject({ method: 'POST', url: '/api/sessao', payload: { email: 'analista@teste.local', senha: 'senha-de-teste' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const antes = (await app2.inject({ method: 'GET', url: '/api/agente/conversas', headers: { cookie } })).json().conversas.length;
  const falha = await app2.inject({ method: 'POST', url: '/api/pesquisas', headers: { cookie }, payload: { id: randomUUID(), tese: 'Distribuidoras com mais de 20 anos em SP' } });
  assert.equal(falha.statusCode, 503);
  assert.equal((await app2.inject({ method: 'GET', url: '/api/agente/conversas', headers: { cookie } })).json().conversas.length, antes);
});

test('provedor que retém dados não recebe nada de mandato confidencial; gratuito depende do modelo; Ollama é local', async (t) => {
  assert.equal(configurarIA({ GHT4_IA_PROVEDOR: 'openrouter', OPENROUTER_API_KEY: 'k', GHT4_IA_MODELO: 'meta/llama-3:free' }).gratuito, true);
  assert.equal(configurarIA({ GHT4_IA_PROVEDOR: 'openrouter', OPENROUTER_API_KEY: 'k', GHT4_IA_MODELO: 'anthropic/claude-x' }).gratuito, false);
  const ollama = configurarIA({ GHT4_IA_PROVEDOR: 'ollama', GHT4_IA_MODELO: 'llama3' });
  assert.equal(ollama.gratuito, true); assert.equal(ollama.retemDados, false);
  const gemini = configurarIA({ GHT4_IA_PROVEDOR: 'gemini', GEMINI_API_KEY: 'chave-gratuita-teste' });
  assert.equal(gemini.retemDados, true);
  // "Local" é o destino, não o nome: Ollama em outra máquina é externo e retém.
  for (const url of ['http://localhost:11434/v1/chat/completions', 'http://127.0.0.2:11434/v1/chat/completions', 'http://[::1]:11434/v1/chat/completions']) {
    assert.equal(configurarIA({ GHT4_IA_PROVEDOR: 'ollama', GHT4_IA_MODELO: 'llama3', GHT4_IA_URL: url }).retemDados, false, url);
  }
  const ollamaRemoto = configurarIA({ GHT4_IA_PROVEDOR: 'ollama', GHT4_IA_MODELO: 'llama3', GHT4_IA_URL: 'https://ollama.exemplo.test/v1/chat/completions' });
  assert.equal(ollamaRemoto.local, false); assert.equal(ollamaRemoto.retemDados, true);
  for (const [n, config] of [['gemini', gemini], ['ollama-remoto', ollamaRemoto]]) await t.test(n, async (t) => {
  let chamadas = 0;
  const fetchIA = async () => { chamadas++; return Response.json({ choices: [{ message: { content: '{}' } }] }); };
  const db = await bancoDeTeste();
  const catalogo = await catalogoDeTeste(t);
  const app = await criarApp(db, { catalogo, servicoIA: criarServicoIA(db, config, { fetchImpl: fetchIA }), web: { fetchImpl: fetchSites, resolver: async () => [{ address: '200.1.2.3' }] } });
  t.after(async () => { await app.close(); await db.close(); });
  const u = await criarUsuario(db, { email: 'conf@teste.local', senha: 'senha-de-teste' });
  const mandato = await criarMandato(db, { codigo: 'M-CONF-IA', confidencial: true });
  // Documento de mandato confidencial também não sai.
  const servico = criarServicoIA(db, config, { fetchImpl: fetchIA });
  const conversa = (await db.query(`INSERT INTO agente_conversas (usuario_id, mandato_id, titulo) VALUES ($1,$2,'conf') RETURNING id`, [u.id, mandato.id])).rows[0];
  const execucao = { conversaId: conversa.id, usuarioId: u.id, chave: randomUUID(), corpoHash: 'h' };
  await assert.rejects(servico.estruturar({ instrucoes: 'x', dados: { tese: 'SEGREDO_DO_MANDATO' }, execucao }), /mandato_confidencial_em_provedor_gratuito/);
  await assert.rejects(servico.redigir({ tarefa: 'conversar', pedido: 'SEGREDO_DO_MANDATO', execucao: { ...execucao, chave: randomUUID() },
    documentos: [{ id: 'd', nome: 'memorando.pdf', hash: 'h', trechos: ['SEGREDO_DO_MANDATO'] }] }), /documentos_em_provedor_gratuito/);
  await darAcesso(db, mandato.id, u.id);
  const login = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email: 'conf@teste.local', senha: 'senha-de-teste' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const chamar = (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
  const id = randomUUID();
  const criada = await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos que representem fabricantes multinacionais', mandatoId: mandato.id });
  assert.equal(criada.statusCode, 201, criada.body);
  assert.equal(criada.json().pesquisa.modo, 'regras');
  const editada = (await chamar('PATCH', `/api/pesquisas/${id}`, { versao: criada.json().pesquisa.versao, meta: 5 })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: editada.pesquisa.versao });
  const lote = (await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 })).json();
  assert.ok(lote.atualizados.length >= 1, 'a revisão segue sem IA');
  assert.equal(chamadas, 0, 'nada saiu para o provedor');
  });
});

test('resumirTexto: corta no limite, em fronteira de palavra, com reticências', () => {
  assert.equal(resumirTexto('  curto   demais ', 100), 'curto demais');
  const longo = 'palavra '.repeat(40).trim();
  const r = resumirTexto(longo, 100);
  assert.ok(r.length <= 100, r.length); assert.ok(r.endsWith('…')); assert.doesNotMatch(r, /palavr…$|\s…$/);
  assert.equal(resumirTexto('x'.repeat(160), 160), 'x'.repeat(160));
  assert.equal(resumirTexto('x'.repeat(161), 160).length, 160);
});

test('setores-alvo na tese: recorte só quando inequívoco; negação e alternativas ficam no escopo amplo; pesquisa antiga fica no original', async () => {
  const sub = (t) => interpretarTese(t, { referencia: REF });
  const dist = sub('Distribuidoras químicas que representem fabricantes de resinas');
  assert.equal(dist.filtros.subsetor, 'Distribuição e trading químico');
  assert.ok(dist.notas.some((x) => /subsetor "Distribuição e trading químico" \(pela palavra "Distribuidoras"\)/.test(x)));
  assert.equal(sub('Fabricantes de tintas industriais em SC').filtros.subsetor, 'Tintas, vernizes e revestimentos');
  assert.equal(sub('Misturadoras de fertilizantes no Centro-Oeste').filtros.subsetor, 'Fertilizantes e nutrição vegetal');
  assert.equal(sub('Fabricantes de produtos de limpeza com marca própria').filtros.subsetor, 'Domissanitários e produtos de limpeza');
  // Negação e alternativas (revisão da Rodada 15): nunca recortar no subsetor excluído nem escolher um entre alternativas.
  const negada = sub('Nao quero tintas; procuro distribuidoras com mais de 20 anos');
  assert.equal(negada.filtros.subsetor, 'Distribuição e trading químico');
  assert.ok(negada.notas.some((x) => /"Tintas, vernizes e revestimentos" aparece negado/.test(x)));
  assert.equal(sub('Empresas químicas, exceto tintas, com mais de 20 anos').filtros.subsetor, 'todos');
  const alternativas = sub('Fabricantes de resinas ou de tintas no Brasil');
  assert.equal(alternativas.filtros.subsetor, 'todos');
  assert.ok(alternativas.notas.some((x) => /mais de um subsetor \("Tintas, vernizes e revestimentos", "Resinas, elastômeros e fibras"\)|mais de um subsetor \("Resinas, elastômeros e fibras", "Tintas, vernizes e revestimentos"\)/.test(x)), alternativas.notas.join(' | '));
  assert.ok(dist.notas.some((x) => /"Resinas, elastômeros e fibras" foi lido como produto vendido/.test(x)));
  // Revisão da Rodada 16: alternativa entre tipos de empresa e exclusão longe do subsetor.
  const tipos = sub('Distribuidoras ou fabricantes de tintas no Brasil');
  assert.equal(tipos.filtros.subsetor, 'todos', 'alternativa entre dois tipos de empresa não vira recorte');
  assert.ok(tipos.notas.some((x) => /coordena tipos de empresa como alternativas \("Distribuidoras ou fabricantes"\)/.test(x)), tipos.notas.join(' | '));
  assert.equal(sub('Distribuidoras de solventes ou fabricantes de tintas').filtros.subsetor, 'todos');
  assert.equal(sub('Indústrias químicas ou fabricantes de tintas').filtros.subsetor, 'todos');
  const longe = sub('Empresas quimicas, exceto empresas fabricantes nacionais de tintas');
  assert.equal(longe.filtros.subsetor, 'todos', 'exclusão a mais de quatro palavras ainda exclui');
  assert.ok(longe.notas.some((x) => /"Tintas, vernizes e revestimentos" aparece negado/.test(x)));
  assert.ok(longe.notas.some((x) => /só cita subsetores excluídos/.test(x)));
  assert.equal(sub('Empresas químicas, tintas excluídas').filtros.subsetor, 'todos');
  assert.equal(sub('Não quero tintas, procuro distribuidoras').filtros.subsetor, 'Distribuição e trading químico', 'retomada afirmativa encerra a exclusão');
  assert.equal(sub('Não só tintas, mas também resinas').filtros.subsetor, 'todos', '"não só" não exclui');
  assert.equal(sub('Fabricantes de tintas com pelo menos 20 anos').filtros.subsetor, 'Tintas, vernizes e revestimentos', '"pelo menos" não exclui');
  assert.equal(sub('Distribuidoras de resinas').filtros.subsetor, 'Distribuição e trading químico');
  assert.equal(sub('Distribuidoras de resinas para fabricantes de tintas').filtros.subsetor, 'Distribuição e trading químico', 'cliente da distribuidora não é alternativa');
  // Revisão da Rodada 17: a descrição do primeiro tipo pode ter qualquer tamanho; na dúvida, todos.
  for (const t of ['Distribuidoras de produtos quimicos ou fabricantes de tintas no Brasil',
    'Distribuidoras regionais de produtos quimicos ou fabricantes de tintas no Brasil',
    'Distribuidoras independentes e familiares de produtos quimicos especiais ou fabricantes de tintas',
    'Distribuidoras de solventes ou fabricantes de tintas no Brasil',
    'Distribuidoras de produtos químicos ou fabricantes']) {
    const r = sub(t);
    assert.equal(r.filtros.subsetor, 'todos', t);
    assert.ok(r.notas.some((x) => /coordena tipos de empresa como alternativas \("Distribuidoras .*fabricantes"\)/.test(x)), `${t}: ${r.notas.join(' | ')}`);
    assert.ok(!r.notas.some((x) => /lido como produto vendido/.test(x)), t);
  }
  assert.equal(sub('Distribuidoras de resinas ou tintas').filtros.subsetor, 'todos', 'alternativa entre produtos: não dá para afirmar o recorte');
  assert.equal(sub('Distribuidoras de resinas e tintas em SP').filtros.subsetor, 'Distribuição e trading químico', 'lista de produtos vendidos');
  assert.equal(sub('Empresas que fabricam tintas e vernizes').filtros.subsetor, 'Tintas, vernizes e revestimentos');
  const geral = sub('Empresas químicas familiares com mais de 30 anos');
  assert.equal(geral.filtros.subsetor, 'todos');
  assert.ok(geral.notas.some((x) => /não cita um subsetor/.test(x)));
  // O motor: filtros gravados antes dos setores-alvo (sem a chave) continuam no subsetor original.
  const pedidos = [];
  const catalogo = { recorte: async (f) => { pedidos.push(f.subsetor); return { empresas: [], total: 0, truncado: false, referencia: REF, hash: 'h' }; }, buscar: async () => ({ hash: 'h', referencia: REF }) };
  const motor = criarMotorPesquisa({ db: null, catalogo });
  await motor.previa({ uf: '', busca: '', cnae: '', incluirPossiveis: false }, []);
  await motor.previa({ uf: '', busca: '', cnae: '', incluirPossiveis: false, subsetor: 'todos' }, []);
  await motor.previa({ uf: '', busca: '', cnae: '', incluirPossiveis: false, subsetor: 'Defensivos agrícolas' }, []);
  assert.deepEqual(pedidos, ['Distribuição e trading químico', 'todos', 'Defensivos agrícolas']);
  // O contrato dos filtros aceita só subsetores acionáveis.
  const { Filtros } = await import('../src/pesquisa/motor.mjs');
  assert.equal(Filtros.safeParse({ subsetor: 'Petroquímica básica e intermediários' }).success, false);
  assert.equal(Filtros.parse({}).subsetor, undefined, 'sem padrão: a ausência marca a pesquisa antiga');
});

test('nova rodada: copia os critérios; com opcionais, já os recebe opcionais; id repetido devolve a mesma rodada', async (t) => {
  const { chamar } = await preparar(t);
  const id = await pesquisaPronta(chamar);
  const origem = (await chamar('GET', `/api/pesquisas/${id}`)).json().pesquisa;
  const obrigatorio = origem.criterios.find((c) => c.tipo === 'cadastro' && c.obrigatorio);

  const comum = await chamar('POST', `/api/pesquisas/${id}/ajustar`, { id: randomUUID() });
  assert.equal(comum.statusCode, 201, comum.body);
  assert.deepEqual(comum.json().pesquisa.criterios, origem.criterios, 'sem opcionais, a rodada nova repete os critérios');
  assert.equal(comum.json().pesquisa.estado, 'rascunho');

  const novo = randomUUID();
  const relaxada = await chamar('POST', `/api/pesquisas/${id}/ajustar`, { id: novo, opcionais: [obrigatorio.id] });
  assert.equal(relaxada.statusCode, 201, relaxada.body);
  const criterios = relaxada.json().pesquisa.criterios;
  assert.equal(criterios.find((c) => c.id === obrigatorio.id).obrigatorio, false);
  assert.deepEqual(criterios.filter((c) => c.id !== obrigatorio.id), origem.criterios.filter((c) => c.id !== obrigatorio.id), 'só o peso do escolhido muda');
  assert.equal(relaxada.json().pesquisa.anterior_id, id);
  // Repetição do envio: a mesma rodada, sem criar outra.
  const repetida = await chamar('POST', `/api/pesquisas/${id}/ajustar`, { id: novo, opcionais: [obrigatorio.id] });
  assert.equal(repetida.json().pesquisa.id, novo);
  assert.equal((await chamar('POST', `/api/pesquisas/${id}/ajustar`, { id: randomUUID(), opcionais: ['inexistente'] })).statusCode, 422);
  // A rodada anterior não muda.
  assert.deepEqual((await chamar('GET', `/api/pesquisas/${id}`)).json().pesquisa.criterios, origem.criterios);
});

test('memória do membro: lembra os critérios ao iniciar, é pessoal, pausável e apagável, e ignora mandato confidencial', async (t) => {
  const { chamar, entrar, db } = await preparar(t);
  assert.deepEqual((await chamar('GET', '/api/memoria')).json(), { ativa: true, criterios: [] });
  // Rascunho não alimenta a memória: só o que a pessoa confirmou ao iniciar.
  await chamar('POST', '/api/pesquisas', { id: randomUUID(), tese: 'Distribuidoras com mais de 20 anos que atendam o agronegócio' });
  assert.equal((await chamar('GET', '/api/memoria')).json().criterios.length, 0);

  await pesquisaPronta(chamar);
  const m1 = (await chamar('GET', '/api/memoria')).json();
  assert.equal(m1.criterios.length, 3);
  assert.ok(m1.criterios.every((c) => c.usos === 1 && /^[a-f0-9]{32}$/.test(c.chave) && !('id' in c) && !('trecho' in c)));
  await pesquisaPronta(chamar);
  assert.ok((await chamar('GET', '/api/memoria')).json().criterios.every((c) => c.usos === 2), 'o mesmo critério soma usos, não duplica');

  // Pausada: não grava, e não apaga o que já havia.
  assert.equal((await chamar('PUT', '/api/memoria', { ativa: false })).json().ativa, false);
  await pesquisaPronta(chamar);
  assert.ok((await chamar('GET', '/api/memoria')).json().criterios.every((c) => c.usos === 2));
  await chamar('PUT', '/api/memoria', { ativa: true });

  // Pessoal: outra pessoa não vê.
  const outra = await entrar('outra@teste.local', 'analista');
  assert.deepEqual((await outra('GET', '/api/memoria')).json().criterios, []);
  assert.equal((await outra('DELETE', `/api/memoria/criterios/${m1.criterios[0].chave}`)).statusCode, 404);

  // Mandato confidencial não alimenta a memória.
  const mandato = await criarMandato(db, { codigo: 'CONF-1', confidencial: true });
  const { id: uid } = (await db.query("SELECT id FROM usuarios WHERE email='analista@teste.local'")).rows[0];
  await darAcesso(db, mandato.id, uid);
  const sigilo = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id: sigilo, mandatoId: mandato.id, tese: 'Distribuidoras com filiais que representem a fabricante sigilosa' })).json();
  assert.equal((await chamar('POST', `/api/pesquisas/${sigilo}/iniciar`, { versao: pesquisa.versao })).statusCode, 200);
  assert.ok(!(await chamar('GET', '/api/memoria')).json().criterios.some((c) => /sigilosa/.test(c.texto)));

  // Esquecer um e apagar tudo; a auditoria guarda só a contagem.
  const esquecido = m1.criterios[0].chave;
  assert.ok(!(await chamar('DELETE', `/api/memoria/criterios/${esquecido}`)).json().criterios.some((c) => c.chave === esquecido));
  assert.equal((await chamar('DELETE', `/api/memoria/criterios/${esquecido}`)).statusCode, 404);
  assert.deepEqual((await chamar('DELETE', '/api/memoria/criterios')).json().criterios, []);
  const trilha = (await db.query("SELECT acao, depois FROM auditoria WHERE entidade='memoria' ORDER BY id")).rows;
  assert.deepEqual(trilha.map((r) => r.acao), ['pausar_memoria', 'retomar_memoria', 'esquecer_criterio', 'apagar_memoria']);
  assert.ok(trilha.every((r) => !JSON.stringify(r.depois).includes('anos')), 'texto de critério não vai para a trilha imutável');
});

test('revisão humana: só em empresa revisada, travada, versionada, desfazível e levada à entrega', async (t) => {
  const { chamar, entrar, db } = await preparar(t);
  const id = await pesquisaPronta(chamar);
  const { pesquisa } = (await chamar('GET', `/api/pesquisas/${id}`)).json();
  const site = pesquisa.criterios.findIndex((c) => c.tipo === 'pesquisa');
  const pedido = (o = {}) => ({ criterioId: pesquisa.criterios[site].id, veredito: 'atende', justificativa: 'Confirmado em reunião com o diretor comercial em 05/10.',
    fonte: { descricao: 'Ata da reunião de 05/10', url: 'https://exemplo.com.br/ata' }, anterior: { veredito: 'indeterminado', lastro: 'site' }, ...o });
  const delta = 'cnpj44444444';
  // Na fila: a revisão automática ainda vai passar por ela, então a humana espera.
  const cedo = await chamar('POST', `/api/pesquisas/${id}/itens/${delta}/revisao`, pedido({ anterior: { veredito: 'indeterminado', lastro: 'pendente' } }));
  assert.equal(cedo.statusCode, 409); assert.equal(cedo.json().erro, 'item_nao_revisado');

  await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 });
  const antes = (await chamar('GET', `/api/pesquisas/${id}/itens/${delta}`)).json();
  assert.equal(antes.item.categoria, 'a_confirmar', 'sem site no cadastro: falta evidência');
  assert.deepEqual(antes.revisoes, []);

  const feita = await chamar('POST', `/api/pesquisas/${id}/itens/${delta}/revisao`, pedido());
  assert.equal(feita.statusCode, 200, feita.body);
  const v = feita.json().item.vereditos[site];
  assert.equal(v.lastro, 'humano'); assert.equal(v.veredito, 'atende'); assert.equal(v.revisao.autor.nome, 'Fulano de Teste');
  assert.equal(v.automatico.lastro, 'site', 'o automático fica guardado para desfazer');
  assert.equal(feita.json().item.categoria, 'aderente');
  assert.deepEqual(feita.json().revisoes.map((r) => r.acao), ['revisar']);
  assert.equal((await chamar('GET', `/api/pesquisas/${id}`)).json().contagens.aderente >= 1, true);
  // O que a tela mostrava mudou: recusa em vez de sobrescrever.
  assert.equal((await chamar('POST', `/api/pesquisas/${id}/itens/${delta}/revisao`, pedido({ veredito: 'nao_atende' }))).json().erro, 'veredito_atualizado');
  // Travada: avançar de novo não toca a empresa revisada.
  await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 });
  assert.equal((await chamar('GET', `/api/pesquisas/${id}/itens/${delta}`)).json().item.vereditos[site].lastro, 'humano');
  // Outra pessoa não alcança.
  const outra = await entrar('outra@teste.local', 'analista');
  assert.equal((await outra('POST', `/api/pesquisas/${id}/itens/${delta}/revisao/desfazer`, { criterioId: pesquisa.criterios[site].id })).statusCode, 404);

  const desfeita = (await chamar('POST', `/api/pesquisas/${id}/itens/${delta}/revisao/desfazer`, { criterioId: pesquisa.criterios[site].id })).json();
  assert.equal(desfeita.item.vereditos[site].lastro, 'site'); assert.equal(desfeita.item.categoria, 'a_confirmar');
  assert.deepEqual(desfeita.revisoes.map((r) => r.acao), ['desfazer', 'revisar']);
  assert.equal((await chamar('POST', `/api/pesquisas/${id}/itens/${delta}/revisao/desfazer`, { criterioId: pesquisa.criterios[site].id })).json().erro, 'sem_revisao_humana');
  await assert.rejects(db.query("UPDATE pesquisa_revisoes SET acao='revisar'"), /append-only/);

  // De novo, e a entrega leva a decisão da equipe e a fonte informada.
  await chamar('POST', `/api/pesquisas/${id}/itens/${delta}/revisao`, pedido());
  const entrega = (await chamar('POST', `/api/pesquisas/${id}/registrar`, { chave: randomUUID(), empresas: [delta] })).json();
  const resultado = (await db.query('SELECT resultado FROM agente_turnos WHERE id=$1', [entrega.turno.id])).rows[0].resultado;
  assert.ok(resultado.blocos.find((b) => b.titulo === 'Decisões da equipe').itens[0].includes('confirmado por Fulano de Teste'));
  assert.ok(resultado.fontes.some((f) => f.titulo.startsWith('Fonte da revisão humana') && f.url === 'https://exemplo.com.br/ata'));
  const trilha = (await db.query("SELECT acao, justificativa FROM auditoria WHERE entidade='pesquisa_item' ORDER BY id")).rows;
  assert.deepEqual(trilha.map((r) => r.acao), ['revisar_veredito', 'desfazer_revisao', 'revisar_veredito']);
  assert.match(trilha[0].justificativa, /reunião com o diretor/);
});

test('registro da execução: cada passo vira evento tipado, lido por cursor, só pelo dono e sem trecho de site', async (t) => {
  const { chamar, entrar, db } = await preparar(t);
  const id = await pesquisaPronta(chamar, 1);
  await chamar('POST', `/api/pesquisas/${id}/avancar`, { quantidade: 5 });
  const tudo = (await chamar('GET', `/api/pesquisas/${id}/eventos`)).json();
  const tipos = tudo.eventos.map((e) => e.tipo);
  assert.deepEqual(tipos.slice(0, 3), ['criterios', 'funil', 'retomada']);
  assert.ok(tipos.includes('lote'));
  assert.equal(tipos.at(-1), 'conclusao', 'meta 1 atingida: a conclusão fecha o registro');
  const funil = tudo.eventos.find((e) => e.tipo === 'funil');
  assert.equal(funil.dados.aprovadasCadastro, 2); assert.equal(funil.ator, 'agente');
  const lote = tudo.eventos.find((e) => e.tipo === 'lote');
  assert.ok(lote.dados.empresas[0].nome && lote.dados.empresas[0].categoria);
  assert.ok(!JSON.stringify(tudo).includes('distribuidores autorizados'), 'trecho do site não entra no registro');
  assert.equal(tudo.eventos.find((e) => e.tipo === 'retomada').autor, 'Fulano de Teste');
  // Cursor: depois do último, nada; uma ação nova aparece sozinha.
  assert.deepEqual((await chamar('GET', `/api/pesquisas/${id}/eventos?apos=${tudo.ultimo}`)).json(), { eventos: [], ultimo: tudo.ultimo });
  await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true });
  const novos = (await chamar('GET', `/api/pesquisas/${id}/eventos?apos=${tudo.ultimo}`)).json();
  assert.deepEqual(novos.eventos.map((e) => [e.tipo, e.dados.ativo, e.ator]), [['monitoramento', true, 'pessoa']]);
  // Nova rodada: evento na anterior e "critérios" na nova, com a origem.
  const nova = randomUUID();
  await chamar('POST', `/api/pesquisas/${id}/ajustar`, { id: nova });
  assert.equal((await chamar('GET', `/api/pesquisas/${id}/eventos?apos=${novos.ultimo}`)).json().eventos[0].tipo, 'ajuste');
  assert.equal((await chamar('GET', `/api/pesquisas/${nova}/eventos`)).json().eventos[0].dados.origem, 'ajuste');
  const outra = await entrar('outra@teste.local', 'analista');
  assert.equal((await outra('GET', `/api/pesquisas/${id}/eventos`)).statusCode, 404);
  await assert.rejects(db.query('DELETE FROM pesquisa_eventos'), /append-only/);
});
