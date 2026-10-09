import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from '../src/app.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso } from './ajuda.mjs';
import { criarPonte } from '../../ferramentas/mcp-ght4.mjs';

const senha = 'Senha restrita aos testes 2026!';
const PONTE = fileURLToPath(new URL('../../ferramentas/mcp-ght4.mjs', import.meta.url));
const SITE = {
  'https://www.alfa.com.br/': '<html><title>Alfa</title><body><a href="/quem-somos">Quem somos</a><p>Alfa Química, CNPJ 11.111.111/0001-00.</p></body></html>',
  'https://www.alfa.com.br/quem-somos': '<html><body><p>Somos distribuidores autorizados de fabricantes multinacionais de solventes.</p></body></html>',
};
const fetchSites = async (url) => url.endsWith('/robots.txt') ? new Response('User-agent: *', { headers: { 'content-type': 'text/plain' } })
  : SITE[url] ? new Response(SITE[url], { headers: { 'content-type': 'text/html' } }) : new Response('nao', { status: 404 });

async function preparar(t) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-mcp-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'base.js');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const linha = (raiz, nome, abertura, email) => [`cnpj${raiz}`, nome, `${nome} Ltda`, raiz, 'Campinas', 'SP', '4684299', [], '02', '2062',
    500000, '05', abertura, 2, ['SP'], 2, 0, false, { email, telefone: '(19) 0000-0000' }];
  const linhas = [linha('11111111', 'Alfa Química', '1990-01-01', 'contato@alfa.com.br'), linha('22222222', 'Beta Química', '1995-01-01', 'joao@beta.com.br')];
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "2026-08";`);
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo: criarCatalogo({ arquivo, arquivoIbama: null }), web: { fetchImpl: fetchSites, resolver: async () => [{ address: '200.1.2.3' }] } });
  const host = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(async () => { await app.close(); await db.close(); });
  const usuario = await criarUsuario(db, { email: 'analista@teste.local', papel: 'analista', senha });
  return { db, app, host, usuario };
}

let seq = 0;
const chamarFerramenta = async (ponte, name, args = {}) => {
  const r = await ponte.tratar({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args } });
  assert.equal(r.error, undefined, JSON.stringify(r.error));
  return r.result;
};
const dados = async (ponte, name, args) => {
  const r = await chamarFerramenta(ponte, name, args);
  assert.equal(r.isError, false, r.content[0].text);
  return r.structuredContent;
};

test('ponte MCP: da tese às evidências, sem entrega, revisão humana nem pessoas', async (t) => {
  const { host } = await preparar(t);
  const ponte = criarPonte({ url: host, email: 'analista@teste.local', senha });
  const init = await ponte.tratar({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'teste', version: '1' } } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'ght4');
  assert.equal(await ponte.tratar({ jsonrpc: '2.0', method: 'notifications/initialized' }), null, 'notificação não tem resposta');
  const lista = (await ponte.tratar({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).result.tools.map((f) => f.name);
  assert.deepEqual(lista, ['listar_pesquisas', 'pesquisar_tese', 'ajustar_criterios', 'iniciar_pesquisa', 'revisar_empresas', 'resultado_pesquisa', 'evidencias_empresa', 'registro_execucao']);
  assert.ok(!lista.some((n) => /registrar|entreg|revisao|acesso|rede|pessoa/.test(n)));

  const criada = await dados(ponte, 'pesquisar_tese', { tese: 'Distribuidoras com mais de 20 anos que representem fabricantes multinacionais' });
  assert.equal(criada.estado, 'rascunho');
  assert.ok(criada.criterios.length >= 2);
  const ajustada = await dados(ponte, 'ajustar_criterios', { pesquisaId: criada.pesquisaId, adicionar: [{ texto: 'Laboratório próprio', obrigatorio: false }], meta: 2 });
  assert.equal(ajustada.criterios.length, criada.criterios.length + 1);
  assert.equal(ajustada.meta, 2);
  const errado = await chamarFerramenta(ponte, 'ajustar_criterios', { pesquisaId: criada.pesquisaId, remover: ['nao_existe'] });
  assert.equal(errado.isError, true);
  assert.match(errado.content[0].text, /inexistentes/);

  const iniciada = await dados(ponte, 'iniciar_pesquisa', { pesquisaId: criada.pesquisaId });
  assert.equal(iniciada.estado, 'pronta');
  assert.equal(iniciada.funil.aprovadasCadastro, 2);
  const lote = await dados(ponte, 'revisar_empresas', { pesquisaId: criada.pesquisaId, quantidade: 5 });
  assert.equal(lote.contagens.revisadas, 2);
  assert.equal(lote.revisadasAgora.length, 2);
  const resultado = await dados(ponte, 'resultado_pesquisa', { pesquisaId: criada.pesquisaId });
  assert.equal(resultado.empresas.length, 2);
  assert.ok(resultado.limites);
  assert.doesNotMatch(JSON.stringify(resultado), /0000-0000|joao@beta/, 'contato do cadastro não sai');
  const ev = await dados(ponte, 'evidencias_empresa', { pesquisaId: criada.pesquisaId, empresaId: 'cnpj11111111' });
  assert.equal(ev.empresa.nome, 'Alfa Química');
  assert.ok(ev.criterios.some((c) => c.evidencias.some((e) => /multinacionais/.test(e.trecho ?? ''))));
  const registro = await dados(ponte, 'registro_execucao', { pesquisaId: criada.pesquisaId });
  assert.ok(['criterios', 'funil', 'lote'].every((tipo) => registro.eventos.some((e) => e.tipo === tipo)));

  // Iniciada, só relaxar: abre uma nova rodada; remover ou acrescentar é recusado.
  assert.equal((await chamarFerramenta(ponte, 'ajustar_criterios', { pesquisaId: criada.pesquisaId, remover: [criada.criterios[0].id] })).isError, true);
  const rodada = await dados(ponte, 'ajustar_criterios', { pesquisaId: criada.pesquisaId, tornarOpcionais: [criada.criterios[0].id] });
  assert.equal(rodada.novaRodada, true);
  assert.notEqual(rodada.pesquisaId, criada.pesquisaId);
  assert.equal(rodada.criterios[0].obrigatorio, false);
  const minhas = await dados(ponte, 'listar_pesquisas');
  assert.equal(minhas.pesquisas.length, 2);

  assert.equal((await ponte.tratar({ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name: 'registrar_entrega' } })).error.code, -32602);
  assert.equal((await ponte.tratar({ jsonrpc: '2.0', id: 98, method: 'resources/list' })).error.code, -32601);
});

test('canal externo: mandato confidencial não aparece, não é lido nem criado pela ponte', async (t) => {
  const { db, host, usuario } = await preparar(t);
  const confidencial = await criarMandato(db, { codigo: 'M-CONF', confidencial: true });
  const aberto = await criarMandato(db, { codigo: 'M-ABERTO', confidencial: false });
  await darAcesso(db, confidencial.id, usuario.id, 'analista');
  await darAcesso(db, aberto.id, usuario.id, 'analista');
  const login = await fetch(`${host}/api/sessao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: usuario.email, senha }) });
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('ght4_sessao='));
  const criar = async (mandatoId, canal) => fetch(`${host}/api/pesquisas`, { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(canal ? { 'X-GHT4-Canal': canal } : {}) },
    body: JSON.stringify({ id: randomUUID(), tese: 'Distribuidoras em SP com mais de 20 anos', mandatoId }) });
  const sigilosa = await (await criar(confidencial.id)).json();
  const publica = await (await criar(aberto.id)).json();
  assert.ok(sigilosa.pesquisa?.id && publica.pesquisa?.id, 'pela interface, as duas são criadas');
  const recusada = await criar(confidencial.id, 'mcp');
  assert.equal(recusada.status, 403);
  assert.equal((await recusada.json()).erro, 'canal_externo_confidencial');

  const ponte = criarPonte({ url: host, email: usuario.email, senha });
  const lista = await dados(ponte, 'listar_pesquisas');
  assert.deepEqual(lista.pesquisas.map((p) => p.pesquisaId), [publica.pesquisa.id]);
  const lida = await chamarFerramenta(ponte, 'resultado_pesquisa', { pesquisaId: sigilosa.pesquisa.id });
  assert.equal(lida.isError, true);
  assert.match(lida.content[0].text, /canal_externo_confidencial/);
  assert.equal((await chamarFerramenta(ponte, 'registro_execucao', { pesquisaId: sigilosa.pesquisa.id })).isError, true);
  assert.equal((await chamarFerramenta(ponte, 'resultado_pesquisa', { pesquisaId: publica.pesquisa.id })).isError, false, 'mandato não confidencial passa');

  const semSenha = criarPonte({ url: host, email: usuario.email, senha: 'errada' });
  const negado = await chamarFerramenta(semSenha, 'listar_pesquisas');
  assert.equal(negado.isError, true);
  assert.match(negado.content[0].text, /recusou o login/);
});

test('ponte MCP por stdio: uma mensagem por linha, só protocolo na saída', async (t) => {
  const filho = spawn(process.execPath, [PONTE], { env: { ...process.env, GHT4_URL: 'http://127.0.0.1:9', GHT4_EMAIL: 'x@teste.local', GHT4_SENHA: 'x' }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => filho.kill());
  const respostas = [];
  const linhas = createInterface({ input: filho.stdout });
  const chegou = new Promise((resolve) => linhas.on('line', (l) => { respostas.push(JSON.parse(l)); if (respostas.length === 4) resolve(); }));
  filho.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`);
  filho.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  filho.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  filho.stdin.write('isto não é json\n');
  // Sem servidor no endereço: a ferramenta responde com erro legível, sem derrubar a ponte.
  filho.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'listar_pesquisas', arguments: {} } })}\n`);
  await Promise.race([chegou, new Promise((_, rej) => setTimeout(() => rej(new Error('sem resposta da ponte')), 15000))]);
  filho.stdin.end();
  assert.equal(respostas[0].result.protocolVersion, '2024-11-05');
  assert.equal(respostas[1].result.tools.length, 8);
  assert.equal(respostas[2].error.code, -32700);
  assert.equal(respostas[3].id, 3);
  assert.equal(respostas[3].result.isError, true);
});
