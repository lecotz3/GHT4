/* Meu dia real conectado à API real (app.inject sobre PGlite): o aviso de falha do
   monitoramento corresponde ao que o servidor executou. "Verificar de novo" logo depois de
   uma falha não executa nada e não pode parecer recuperação; recuperação é verificação
   gravada no banco. */
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

test('Meu dia com a API real: falha, "Verificar de novo" sem execução mantém o aviso, recuperação de fato o remove', async (t) => {
  const db = await bancoDeTeste();
  await importarCatalogo(db, { texto: fonte([linha('11111111', 'Alfa Química', '1990-01-01'), linha('33333333', 'Gama Química', '1988-01-01')]), versaoRegras: 'teste' });
  const app = await criarApp(db, { catalogo: criarCatalogoBanco(db) });
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
  const ativa = (await db.query('SELECT snapshot_id FROM catalogo_controle')).rows[0].snapshot_id;
  await db.query('UPDATE catalogo_controle SET snapshot_id=NULL'); // catálogo indisponível: a verificação falha

  // O cliente fala com a API real: cada fetch vira app.inject com a sessão.
  const respostas = [];
  globalThis.fetch = async (url, o = {}) => {
    const u = new URL(String(url), 'http://127.0.0.1/');
    const r = await app.inject({ method: o.method ?? 'GET', url: u.pathname + u.search, payload: o.body, headers: { ...(o.headers ?? {}), cookie } });
    if (u.pathname === '/api/monitoramentos/verificar') respostas.push(r.json());
    return new Response(r.body, { status: r.statusCode, headers: { 'content-type': r.headers['content-type'] ?? 'application/json' } });
  };
  const tela = await montar(React.createElement(MeuDia, { visivel: true, aoAbrirCrm: () => {}, aoRede: () => {}, aoOportunidades: () => {}, aoExpirar: () => {} }));
  const texto = () => document.querySelector('section.agente-meu-dia')?.textContent ?? '';
  const estado = async () => (await db.query('SELECT verificado_em, falha_em FROM monitoramentos_tese')).rows[0];
  try {
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
    assert.deepEqual(respostas[2], { verificados: 1, falhas: 0, emFalha: 0, proximaTentativa: null });
    const fim = await estado();
    assert.ok(fim.verificado_em); assert.equal(fim.falha_em, null);
  } finally { await tela.desmontar(); }
});
