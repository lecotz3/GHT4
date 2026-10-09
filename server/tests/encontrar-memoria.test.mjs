import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/app.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';
import { lembrarBusca, lerBuscas, MAX_BUSCAS } from '../src/encontrar/memoria.mjs';
import { lembrarCriterios, lerMemoria } from '../src/pesquisa/memoria.mjs';

/* Rodada 24: memória das buscas do find. Pessoal, visível, apagável e pausável como a
   memória de critérios; guarda o pedido e as contagens, nunca as pessoas. */

const senha = 'Senha restrita aos testes 2026!';

async function montar(t) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-encontrar-memoria-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'base.js');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const linhas = [['11111111', 'Alfa Química', '1990-01-01'], ['22222222', 'Beta Química', '2020-01-01']].map(([raiz, nome, abertura]) => [`cnpj${raiz}`, nome, `${nome} Ltda`,
    raiz, 'Campinas', 'SP', '4684299', [], '02', '2062', 500000, '05', abertura, 1, ['SP'], 2, 0, false, {}]);
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "2026-08";`);
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo: criarCatalogo({ arquivo, arquivoIbama: null }) });
  t.after(async () => { await app.close(); await db.close(); });
  async function usuario(email, papel, nome) {
    const u = await criarUsuario(db, { email, papel, senha, nome });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha } });
    assert.equal(r.statusCode, 200, r.body);
    const cookie = r.headers['set-cookie'].split(';')[0];
    return { ...u, chamar: (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } }) };
  }
  return { db, usuario };
}

test('memória das buscas: guarda o pedido, soma usos, respeita pausa e pesquisa, e apaga', async (t) => {
  const { db, usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const analista = await usuario('analista@teste.local', 'analista', 'Ana Lista');
  const buscar = async (corpo, quem = socio) => {
    const r = await quem.chamar('POST', '/api/encontrar', corpo);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const memoria = async (quem = socio) => {
    const r = await quem.chamar('GET', '/api/encontrar/memoria');
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.headers['cache-control'], 'no-store');
    return r.json();
  };
  await socio.chamar('POST', '/api/acesso/cnpj11111111/decisores', { id: randomUUID(), nome: 'Carlos Nunes', cargo: 'Sócio-administrador', senioridade: 'ceo',
    fonte: { tipo: 'site_oficial', descricao: 'Página Quem somos', url: 'https://alfa.exemplo.test/quem-somos' } });

  // A busca fica guardada com as contagens; o mesmo pedido em outra grafia soma usos.
  await buscar({ pedido: 'Quem decide nas distribuidoras de SP' });
  let m = await memoria();
  assert.equal(m.ativa, true);
  assert.equal(m.buscas.length, 1);
  assert.deepEqual([m.buscas[0].pedido, m.buscas[0].usos, m.buscas[0].resumo], ['Quem decide nas distribuidoras de SP', 1, { forte: 1, revisar: 0, excluido: 0, lacunas: 1 }]);
  assert.doesNotMatch(JSON.stringify(m), /Carlos/, 'nunca as pessoas');
  await buscar({ pedido: '  quem decide  nas DISTRIBUIDORAS de sp ' });
  m = await memoria();
  assert.deepEqual([m.buscas.length, m.buscas[0].usos, m.buscas[0].pedido], [1, 2, 'quem decide nas DISTRIBUIDORAS de sp']);
  await buscar({ pedido: 'Donos de distribuidoras em MG' });
  assert.deepEqual((await memoria()).buscas.map((b) => b.pedido), ['Donos de distribuidoras em MG', 'quem decide nas DISTRIBUIDORAS de sp'], 'a mais recente primeiro');

  // Pessoal: a analista não vê as buscas da sócia.
  assert.deepEqual((await memoria(analista)).buscas, []);

  // Dentro de uma pesquisa por tese, nada é guardado.
  const id = randomUUID();
  const criada = await socio.chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos' });
  assert.equal((await socio.chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: criada.json().pesquisa.versao })).statusCode, 200);
  await buscar({ pedido: 'Quem decide nestas empresas', pesquisaId: id });
  assert.equal((await memoria()).buscas.length, 2);

  // Pausada, a memória não guarda buscas novas e não apaga as antigas.
  assert.equal((await socio.chamar('PUT', '/api/memoria', { ativa: false })).statusCode, 200);
  await buscar({ pedido: 'CFOs das distribuidoras químicas' });
  m = await memoria();
  assert.deepEqual([m.ativa, m.buscas.length], [false, 2]);
  assert.equal((await socio.chamar('PUT', '/api/memoria', { ativa: true })).statusCode, 200);

  // Esquecer uma e apagar todas, com auditoria que não guarda o texto.
  const chave = m.buscas[0].chave;
  let r = await socio.chamar('DELETE', `/api/encontrar/memoria/${chave}`);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().buscas.length, 1);
  assert.equal((await socio.chamar('DELETE', `/api/encontrar/memoria/${chave}`)).statusCode, 404);
  assert.equal((await socio.chamar('DELETE', '/api/encontrar/memoria/nao-e-chave')).statusCode, 422);
  r = await socio.chamar('DELETE', '/api/encontrar/memoria');
  assert.deepEqual(r.json().buscas, []);
  const trilha = (await db.query("SELECT acao, depois FROM auditoria WHERE entidade='memoria' AND acao IN ('esquecer_busca','apagar_buscas') ORDER BY id")).rows;
  assert.deepEqual(trilha.map((x) => [x.acao, x.depois.apagados]), [['esquecer_busca', 1], ['apagar_buscas', 1]]);
  assert.doesNotMatch(JSON.stringify(trilha), /distribuidoras/i);

  // Teto por pessoa: ficam as mais recentes.
  for (let i = 0; i < MAX_BUSCAS + 3; i++) await lembrarBusca(db, socio.id, `Pedido de teste número ${i}`, { forte: 0 });
  m = await memoria();
  assert.equal(m.buscas.length, MAX_BUSCAS);
  assert.ok(!m.buscas.some((b) => b.pedido === 'Pedido de teste número 0'), 'a mais antiga saiu');
});

/* Banco que segura a gravação logo depois de ler a preferência: é a janela em que a pessoa pausa e
   apaga em outra aba. A gravação já admitida não pode repor o que foi apagado. */
function comBarreira(base) {
  let leu, liberar;
  const leitura = new Promise((r) => { leu = r; });
  const barreira = new Promise((r) => { liberar = r; });
  const envolver = (alvo) => ({
    query: async (sql, ...resto) => {
      const r = await alvo.query(sql, ...resto);
      if (/SELECT ativa FROM memoria_preferencias/.test(sql)) { leu(); await barreira; }
      return r;
    },
    transaction: (corpo) => alvo.transaction((tx) => corpo(envolver(tx))),
  });
  return { db: envolver(base), leitura, liberar: () => liberar() };
}

test('pausa e exclusão confirmadas não são desfeitas por uma gravação em voo (buscas e critérios)', async (t) => {
  const { db, usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const resumo = { forte: 1, revisar: 0, excluido: 0, lacunas: 0 };

  const b = comBarreira(db);
  const gravando = lembrarBusca(b.db, socio.id, 'Quem decide nas distribuidoras de SP', resumo);
  await b.leitura;
  const pausa = socio.chamar('PUT', '/api/memoria', { ativa: false });
  const apaga = socio.chamar('DELETE', '/api/encontrar/memoria');
  await new Promise((r) => setTimeout(r, 30));
  b.liberar();
  await gravando;
  assert.equal((await pausa).statusCode, 200);
  assert.equal((await apaga).statusCode, 200);
  assert.deepEqual(await lerBuscas(db, socio.id), { ativa: false, buscas: [] });

  // A mesma preferência serve à memória de critérios: o mesmo protocolo vale para ela.
  assert.equal((await socio.chamar('PUT', '/api/memoria', { ativa: true })).statusCode, 200);
  const c = comBarreira(db);
  const criterios = lembrarCriterios(c.db, socio.id, [{ texto: 'Mais de 20 anos', tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 }, obrigatorio: true }]);
  await c.leitura;
  const pausa2 = socio.chamar('PUT', '/api/memoria', { ativa: false });
  const apaga2 = socio.chamar('DELETE', '/api/memoria/criterios');
  await new Promise((r) => setTimeout(r, 30));
  c.liberar();
  await criterios;
  assert.equal((await pausa2).statusCode, 200);
  assert.equal((await apaga2).statusCode, 200);
  assert.deepEqual(await lerMemoria(db, socio.id), { ativa: false, criterios: [] });
});
