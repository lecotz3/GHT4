/* Meu dia real conectado à API real (app.inject sobre PGlite): o aviso de falha do
   monitoramento corresponde ao que o servidor executou. "Verificar de novo" logo depois de
   uma falha não executa nada e não pode parecer recuperação; recuperação é verificação
   gravada no banco. Uma nova tentativa em andamento não apaga a falha, nem para outra aba
   nem para um segundo clique. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { React, montar, botao, clicar } from './apoio/dom.mjs';

const { MeuDia } = await import('../v1/src/componentes/MeuDia.tsx');
const { bancoDeTeste, criarUsuario } = await import('../server/tests/ajuda.mjs');
const { criarApp } = await import('../server/src/app.mjs');
const { importarCatalogo } = await import('../server/src/agente/importar-catalogo.mjs');
const { criarCatalogoBanco } = await import('../server/src/agente/catalogo-banco.mjs');

const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
  'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro'];
const linha = (raiz, nome, abertura) => [`cnpj${raiz}`, nome, `${nome} Ltda`, raiz, 'Campinas', 'SP', '4684299', [], '02', '2062', 500000, '05', abertura, 1, ['SP'], 2, 0, false];
const fonte = (linhas) => `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "2026-08";`;

/** Espera, dentro de act, até a condição valer (as respostas vêm do banco, não de um tique). */
async function ate(condicao, limite = 5000) {
  const fim = Date.now() + limite;
  while (!condicao()) {
    if (Date.now() > fim) throw new Error('condição não atingida a tempo');
    await React.act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }
}

/* Banco, catálogo com gancho no recorte, sessão real, uma pesquisa monitorada e vencida, e o
   fetch do cliente ligado à API (cada fetch vira app.inject com a sessão). `antesDeAbrir` prepara
   o estado (catálogo indisponível, recorte que falha) antes de o Meu dia abrir e verificar. */
async function preparar(t, antesDeAbrir) {
  const db = await bancoDeTeste();
  await importarCatalogo(db, { texto: fonte([linha('11111111', 'Alfa Química', '1990-01-01'), linha('33333333', 'Gama Química', '1988-01-01')]), versaoRegras: 'teste' });
  const base = criarCatalogoBanco(db);
  const gancho = { antes: null };
  const app = await criarApp(db, { catalogo: { ...base, recorte: async (...args) => { if (gancho.antes) await gancho.antes(...args); return base.recorte(...args); } } });
  const fetchOriginal = globalThis.fetch;
  t.after(async () => { globalThis.fetch = fetchOriginal; await app.close(); await db.close(); });
  await criarUsuario(db, { email: 'integrado@teste.local', senha: 'senha-de-teste', papel: 'analista' });
  const login = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email: 'integrado@teste.local', senha: 'senha-de-teste' } });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const chamar = (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos' })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
  assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).statusCode, 200);
  await db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  const pedidos = [], respostas = [];
  globalThis.fetch = async (url, o = {}) => {
    const u = new URL(String(url), 'http://127.0.0.1/');
    const verificar = u.pathname === '/api/monitoramentos/verificar';
    if (verificar) pedidos.push(o.body ? JSON.parse(o.body) : undefined);
    const r = await app.inject({ method: o.method ?? 'GET', url: u.pathname + u.search, payload: o.body, headers: { ...(o.headers ?? {}), cookie } });
    if (verificar) respostas.push(r.json());
    return new Response(r.body, { status: r.statusCode, headers: { 'content-type': r.headers['content-type'] ?? 'application/json' } });
  };
  await antesDeAbrir?.({ db, gancho });
  const tela = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {} }));
  const estado = async () => (await db.query('SELECT verificado_em, falha_em, reservada_ate > now() AS reservada FROM monitoramentos_tese')).rows[0];
  return { db, chamar, gancho, pedidos, respostas, tela, estado };
}
const texto = () => document.querySelector('section.agente-meu-dia')?.textContent ?? '';

test('Meu dia com a API real: falha, "Verificar de novo" sem execução mantém o aviso, recuperação de fato o remove', async (t) => {
  let ativa;
  // A primeira verificação (ao abrir) roda com o catálogo indisponível e falha.
  const { db, respostas, tela, estado } = await preparar(t, async ({ db }) => {
    ativa = (await db.query('SELECT snapshot_id FROM catalogo_controle')).rows[0].snapshot_id;
    await db.query('UPDATE catalogo_controle SET snapshot_id=NULL');
  });
  try {
    await ate(() => respostas.length === 1);
    await ate(() => /Não foi possível verificar 1 tese monitorada/.test(texto()));
    assert.deepEqual([respostas[0].verificados, respostas[0].falhas, respostas[0].emFalha], [0, 1, 1]);
    assert.match(texto(), /Nova tentativa automática a partir de \d{2}:\d{2}/);
    // Logo em seguida: o servidor não executa nada (falha recente) e o aviso continua.
    await clicar(botao(/^Verificar de novo$/));
    await ate(() => respostas.length === 2 && /aguarde alguns segundos/.test(texto()));
    assert.deepEqual([respostas[1].verificados, respostas[1].falhas, respostas[1].emFalha], [0, 0, 1]);
    assert.match(texto(), /Não foi possível verificar 1 tese monitorada/);
    assert.doesNotMatch(texto(), /Nada pendente com você agora/);
    assert.equal((await estado()).verificado_em, null, 'de fato nada foi verificado');
    // Catálogo de volta e passado o intervalo mínimo: o pedido verifica de verdade e o aviso some.
    await db.query('UPDATE catalogo_controle SET snapshot_id=$1', [ativa]);
    await db.query("UPDATE monitoramentos_tese SET falha_em=now()-interval '1 minute'");
    await clicar(botao(/^Verificar de novo$/));
    await ate(() => respostas.length === 3 && !/Não foi possível verificar/.test(texto()));
    assert.deepEqual(respostas[2], { verificados: 1, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
    const fim = await estado();
    assert.ok(fim.verificado_em); assert.equal(fim.falha_em, null);
  } finally { await tela.desmontar(); }
});

test('Meu dia com a API real: segundo clique e outra aba durante a nova tentativa não escondem a falha; falha tardia aparece; só o sucesso tira o aviso', async (t) => {
  // Abre com o recorte falhando.
  const { db, chamar, gancho, pedidos, respostas, tela, estado } = await preparar(t, ({ gancho }) => {
    gancho.antes = async () => { throw new Error('recorte indisponível'); };
  });
  try {
    await ate(() => /Não foi possível verificar 1 tese monitorada/.test(texto()));
    await db.query("UPDATE monitoramentos_tese SET falha_em=now()-interval '1 minute'");
    // Nova tentativa presa no recorte.
    let soltar, chegou;
    const noRecorte = new Promise((r) => { chegou = r; });
    // Segura só o primeiro recorte: um segundo cálculo indevido passaria direto e apareceria na asserção, sem travar o teste.
    let segurou = false;
    gancho.antes = () => { if (segurou) return undefined; segurou = true; return new Promise((resolve, reject) => { chegou(); soltar = (ok) => (ok ? resolve() : reject(new Error('falhou de novo'))); }); };
    await clicar(botao(/^Verificar de novo$/));
    await noRecorte;
    assert.deepEqual(pedidos.at(-1), { repetir: true });
    const emCurso = botao(/^Verificando…$/);
    assert.ok(emCurso?.disabled, 'o botão fica indisponível enquanto o pedido está em curso');
    // Segundo clique: não sobrepõe outro pedido.
    await clicar(emCurso);
    assert.equal(pedidos.length, 2, 'nenhum pedido sobreposto');
    // Outra aba durante o cálculo: vê a falha e a tentativa em andamento, não um falso zero.
    const outra = (await chamar('POST', '/api/monitoramentos/verificar', { repetir: true })).json();
    assert.deepEqual([outra.verificados, outra.falhas, outra.emFalha, outra.emAndamento], [0, 0, 1, 1]);
    const durante = await estado();
    assert.ok(durante.falha_em, 'falha preservada durante a nova tentativa'); assert.equal(durante.reservada, true);
    assert.match(texto(), /Não foi possível verificar 1 tese monitorada/, 'o aviso continua enquanto calcula');
    // A tentativa falha tarde: a resposta é a do pedido em curso, e o aviso continua.
    soltar(false);
    await ate(() => respostas.length === 2 && Boolean(botao(/^Verificar de novo$/)));
    assert.deepEqual([respostas[1].verificados, respostas[1].falhas, respostas[1].emFalha], [0, 1, 1]);
    assert.match(texto(), /Não foi possível verificar 1 tese monitorada\. Nova tentativa automática a partir de \d{2}:\d{2}/);
    assert.doesNotMatch(texto(), /Nada pendente com você agora/);
    assert.equal((await estado()).verificado_em, null);
    // Recuperação real.
    gancho.antes = null;
    await db.query("UPDATE monitoramentos_tese SET falha_em=now()-interval '1 minute'");
    await clicar(botao(/^Verificar de novo$/));
    await ate(() => respostas.length === 3 && !/Não foi possível verificar/.test(texto()));
    assert.deepEqual(respostas[2], { verificados: 1, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
    assert.ok((await estado()).verificado_em);
  } finally { await tela.desmontar(); }
});
