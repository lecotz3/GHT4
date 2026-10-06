import test from 'node:test';
import assert from 'node:assert/strict';
import { compararCadastro, compararCadastroAtual } from '../src/empresas/comparar-cadastro.mjs';
import { bancoDeTeste } from './ajuda.mjs';
import { importarCatalogo } from '../src/agente/importar-catalogo.mjs';
import { criarCatalogoBanco } from '../src/agente/catalogo-banco.mjs';
import { bancoIndisponivel } from '../src/app.mjs';

const cadastro = (extra = {}) => ({
  id: 'cnpj00123456', cnpjRaiz: '00123456', nome: 'Quimica Teste',
  razaoSocial: 'Quimica Teste Ltda', cidade: 'Campinas', uf: 'SP',
  cnaePrincipal: '4684299', estado: 'provavel', referencia: '2026-08', ...extra,
});

test('compara os campos do cadastro e separa enquadramento de situacao empresarial', () => {
  const anterior = Object.freeze(cadastro());
  const atual = Object.freeze(cadastro({ nome: 'Novo nome', razaoSocial: 'Nova Ltda', cidade: 'Curitiba',
    uf: 'PR', cnaePrincipal: '4683400', estado: 'possivel', referencia: '2026-09' }));
  const r = compararCadastro(anterior, atual);
  assert.equal(r.estado, 'comparado');
  assert.equal(r.empresaId, anterior.id);
  assert.deepEqual(r.referencias, { anterior: '2026-08', atual: '2026-09' });
  assert.deepEqual(r.mudancas.map((m) => m.campo), ['nome', 'razaoSocial', 'cidade', 'uf', 'cnaePrincipal', 'estado']);
  assert.ok(r.mudancas.every((m) => m.tipo === 'alterado'));
  assert.deepEqual(r.mudancas.at(-1), { campo: 'estado', grupo: 'enquadramento',
    anterior: 'provavel', atual: 'possivel', tipo: 'alterado' });
  assert.equal(r.anterior.cnpjRaiz, '00123456');
  assert.notStrictEqual(r.anterior, anterior);
  assert.notStrictEqual(r.atual, atual);
  r.anterior.nome = 'Alteracao no resultado';
  assert.equal(anterior.nome, 'Quimica Teste');
});

test('referencia nova sem mudanca de campos produz array vazio, nao um evento', () => {
  const r = compararCadastro(cadastro(), cadastro({ referencia: '2026-09' }));
  assert.equal(r.estado, 'comparado');
  assert.deepEqual(r.mudancas, []);
  assert.equal(r.atual.referencia, '2026-09');
});

test('ignora espacos e codificacao Unicode equivalentes sem apagar diferencas reais', () => {
  const anterior = cadastro({ nome: '  Qu\u00edmica  Teste ', cidade: 'S\u00e3o Paulo' });
  const r = compararCadastro(anterior, cadastro({ nome: 'Qui\u0301mica Teste', cidade: 'Sa\u0303o Paulo' }));
  assert.deepEqual(r.mudancas, []);
  assert.equal(r.anterior.nome, anterior.nome);
  assert.equal(compararCadastro(anterior, cadastro({ nome: 'Quimica Teste', cidade: anterior.cidade })).mudancas.length, 1);
});

test('campos ausentes nao viram zero, nem sao descritos como exclusao cadastral', () => {
  const r = compararCadastro(cadastro({ cidade: undefined, nome: '' }), cadastro({ cidade: 'Campinas', nome: null }));
  assert.deepEqual(r.mudancas, [{ campo: 'cidade', grupo: 'cadastro', anterior: null, atual: 'Campinas', tipo: 'preenchido' }]);
  const semInformacao = compararCadastro(cadastro(), cadastro({ cidade: undefined }));
  assert.deepEqual(semInformacao.mudancas, [{ campo: 'cidade', grupo: 'cadastro',
    anterior: 'Campinas', atual: null, tipo: 'nao_informado' }]);
});

test('nao encontrado preserva o historico e nao significa empresa encerrada', () => {
  const r = compararCadastro(cadastro(), null);
  assert.equal(r.estado, 'empresa_nao_encontrada');
  assert.equal(r.anterior.nome, 'Quimica Teste');
  assert.equal(r.atual, null);
  assert.equal(r.mudancas, null);
  assert.deepEqual(r.referencias, { anterior: '2026-08', atual: null });
});

test('nao copia contatos, notas, dados financeiros ou sinais de aquisicao', () => {
  const sensiveis = { email: 'segredo@example.test', contato: { telefone: 'telefone-secreto' },
    notas: 'nota privada', receita: 123, intencaoDeTransacao: 'vender',
    eventos: [{ tipo: 'aquisicao_provavel', detalhe: 'evento-secreto' }], motivo: 'texto-nao-comparado' };
  const r = compararCadastro(cadastro(sensiveis), cadastro({ ...sensiveis, receita: 999, referencia: '2026-09' }));
  assert.deepEqual(r.mudancas, []);
  assert.doesNotMatch(JSON.stringify(r), /segredo|privada|receita|vender|aquisicao|evento-secreto|texto-nao-comparado/);
});

test('rejeita identificadores distintos e raiz divergente, preservando zeros iniciais', () => {
  const outra = compararCadastro(cadastro(), cadastro({ id: 'cnpj87654321', cnpjRaiz: '87654321' }));
  assert.equal(outra.estado, 'catalogo_resposta_invalida');
  assert.equal(outra.atual, null);
  for (const extra of [{ cnpjRaiz: '87654321' }, { id: 'cnpj1234' }, { cnpjRaiz: 123456 }]) {
    assert.equal(compararCadastro(cadastro(extra), cadastro()).estado, 'historico_invalido');
  }
  assert.equal(compararCadastro(cadastro({ cnpjRaiz: undefined }), cadastro()).anterior.cnpjRaiz, '00123456');
});

test('valida referencia mensal, CNAE, UF e tipos de campo', () => {
  for (const extra of [{ referencia: '2026-13' }, { referencia: '2026-00' }, { referencia: '2026-09-01' },
    { cnaePrincipal: '4684-2/99' }, { uf: 'Sao Paulo' }, { estado: 'encerrada' }, { cidade: 0 },
    { nome: 'a'.repeat(501) }, { nome: 'nome\0invalido' }]) {
    const r = compararCadastro(cadastro(), cadastro(extra));
    assert.equal(r.estado, 'catalogo_resposta_invalida');
    assert.equal(r.atual, null);
    assert.equal(r.mudancas, null);
  }
  assert.equal(compararCadastro(cadastro(), undefined).estado, 'catalogo_resposta_invalida');
});

test('referencia atual anterior ao historico nao apresenta mudancas como atualizacao', () => {
  const r = compararCadastro(cadastro({ referencia: '2026-01' }), cadastro({ referencia: '2025-12', nome: 'Antigo' }));
  assert.equal(r.estado, 'referencia_atual_mais_antiga');
  assert.equal(r.mudancas, null);
  assert.equal(r.anterior.nome, 'Quimica Teste');
  assert.equal(r.atual.nome, 'Antigo');
  assert.deepEqual(r.referencias, { anterior: '2026-01', atual: '2025-12' });
});

test('referencias iguais ou desconhecidas nao inventam data ou impedem comparacao de valores', () => {
  const mesmoMes = compararCadastro(cadastro(), cadastro({ nome: 'Correcao no mesmo mes' }));
  assert.equal(mesmoMes.mudancas.length, 1);
  const semReferencia = compararCadastro(cadastro({ referencia: undefined }), cadastro({ referencia: '', nome: 'Outro' }));
  assert.equal(semReferencia.estado, 'comparado');
  assert.deepEqual(semReferencia.referencias, { anterior: null, atual: null });
  assert.equal(semReferencia.mudancas.length, 1);
});

test('servico usa obter com o identificador, preservando o contexto do adaptador', async () => {
  const consultas = [];
  const catalogo = { vigente: cadastro({ referencia: '2026-09', nome: 'Atual' }),
    async obter(id) { consultas.push(id); return this.vigente; } };
  const r = await compararCadastroAtual(cadastro(), { catalogo });
  assert.deepEqual(consultas, ['cnpj00123456']);
  assert.equal(r.estado, 'comparado');
  assert.deepEqual(r.mudancas, [{ campo: 'nome', grupo: 'cadastro', anterior: 'Quimica Teste', atual: 'Atual', tipo: 'alterado' }]);
});

test('falha nao vaza detalhes, difere de nao encontrado e permite recuperacao', async () => {
  let indisponivel = true;
  const catalogo = { async obter() {
    if (indisponivel) throw Object.assign(new Error('postgres://usuario:segredo@host/banco'), { code: 'ECONNREFUSED' });
    return cadastro();
  } };
  const falha = await compararCadastroAtual(cadastro(), { catalogo, ehIndisponibilidade: bancoIndisponivel });
  assert.equal(falha.estado, 'catalogo_indisponivel');
  assert.equal(falha.mudancas, null);
  assert.equal(falha.atual, null);
  assert.doesNotMatch(JSON.stringify(falha), /postgres|segredo|ECONNREFUSED/);
  indisponivel = false;
  const recuperado = await compararCadastroAtual(cadastro(), { catalogo });
  assert.equal(recuperado.estado, 'comparado');
  assert.deepEqual(recuperado.mudancas, []);
  const ausente = await compararCadastroAtual(cadastro(), { catalogo: { obter: async () => null } });
  assert.equal(ausente.estado, 'empresa_nao_encontrada');
});

test('resposta malformada ou de outra empresa tem estado proprio nas duas variantes', async () => {
  for (const recebido of [undefined, {}, false, cadastro({ referencia: '2026-13' }),
    cadastro({ id: 'cnpj87654321', cnpjRaiz: '87654321', nome: 'Outra empresa confidencial' })]) {
    const r = await compararCadastroAtual(cadastro(), { catalogo: { obter: async () => recebido } });
    assert.deepEqual(r, compararCadastro(cadastro(), recebido));
    assert.equal(r.estado, 'catalogo_resposta_invalida');
    assert.equal(r.mudancas, null);
    assert.equal(r.atual, null);
    assert.doesNotMatch(JSON.stringify(r), /confidencial|87654321/);
  }
});

test('historico invalido tem estado seguro antes de consultar, incluindo dados legados', async () => {
  let consultas = 0;
  const catalogo = { async obter() { consultas++; return cadastro(); } };
  for (const anterior of [null, undefined, {}, cadastro({ id: 'invalido' }), cadastro({ uf: 'sp' }),
    cadastro({ razaoSocial: 'a'.repeat(501), notas: 'privada' }), cadastro({ cnpjRaiz: '87654321' })]) {
    const r = await compararCadastroAtual(anterior, { catalogo });
    assert.deepEqual(r, { estado: 'historico_invalido', empresaId: null,
      referencias: { anterior: null, atual: null }, anterior: null, atual: null, mudancas: null });
    assert.deepEqual(compararCadastro(anterior, cadastro()), r);
  }
  assert.equal(consultas, 0);
});

test('catalogo e politica invalidos sao erros de programacao antes da consulta', async () => {
  let consultas = 0;
  const catalogo = { async obter() { consultas++; return cadastro(); } };
  await assert.rejects(compararCadastroAtual(cadastro()), /obter/);
  await assert.rejects(compararCadastroAtual(cadastro(), { catalogo: {} }), /obter/);
  for (const ehIndisponibilidade of [null, true, 'sim', {}]) {
    await assert.rejects(compararCadastroAtual(cadastro(), { catalogo, ehIndisponibilidade }), /funcao sincrona/);
  }
  assert.equal(consultas, 0);
});

test('relanca defeitos inesperados intactos para o tratamento e log do chamador', async () => {
  for (const erro of [new TypeError('defeito do adaptador'),
    Object.assign(new Error('tabela ausente'), { code: '42P01' })]) {
    const catalogo = { obter: async () => { throw erro; } };
    await assert.rejects(compararCadastroAtual(cadastro(), { catalogo, ehIndisponibilidade: bancoIndisponivel }),
      (recebido) => recebido === erro);
  }
});

test('somente politica com retorno booleano verdadeiro converte falhas em indisponibilidade', async () => {
  const erro = Object.assign(new Error('falha de conexao'), { code: 'ECONNREFUSED' });
  const catalogo = { obter: async () => { throw erro; } };
  await assert.rejects(compararCadastroAtual(cadastro(), { catalogo }), (recebido) => recebido === erro);
  for (const valor of [false, undefined, 'sim', 1]) {
    await assert.rejects(compararCadastroAtual(cadastro(), { catalogo, ehIndisponibilidade: () => valor }),
      (recebido) => recebido === erro);
  }
  let classificado;
  const r = await compararCadastroAtual(cadastro(), { catalogo, ehIndisponibilidade: (recebido) => {
    classificado = recebido;
    return true;
  } });
  assert.strictEqual(classificado, erro);
  assert.equal(r.estado, 'catalogo_indisponivel');
});

test('consulta em andamento nao altera nem acompanha mutacoes posteriores do historico', async () => {
  let concluir;
  const historico = cadastro();
  const consulta = compararCadastroAtual(historico, { catalogo: { obter: () => new Promise((resolve) => { concluir = resolve; }) } });
  historico.nome = 'Edicao posterior';
  concluir(cadastro({ nome: 'Atual', referencia: '2026-09' }));
  const r = await consulta;
  assert.equal(r.anterior.nome, 'Quimica Teste');
  assert.equal(historico.nome, 'Edicao posterior');
});

test('compara publicacoes reais em PGlite sem escrever nem substituir snapshots historicos', async (t) => {
  const db = await bancoDeTeste();
  t.after(() => db.close());
  const colunas = ['id', 'cnpjRaiz', 'nome', 'razaoSocial', 'cidade', 'uf', 'cnaePrincipal',
    'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica'];
  const fonte = (referencia, nome, situacao = '02') => `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${JSON.stringify([
    'cnpj00123456', '00123456', nome, 'Quimica Teste Ltda', 'Campinas', 'SP', '4684299', [], situacao, '2062',
  ])}\n];\nconst REFERENCIA_QUIMICOS = "${referencia}";`;
  const primeira = await importarCatalogo(db, { texto: fonte('2026-08', 'Historico') });
  const original = await criarCatalogoBanco(db).obter('cnpj00123456');
  const historico = Object.freeze(original);
  await importarCatalogo(db, { texto: fonte('2026-09', 'Atualizado') });
  const sqls = [];
  const catalogo = criarCatalogoBanco({ async query(sql, parametros) {
    sqls.push(sql);
    return db.query(sql, parametros);
  } });
  const r = await compararCadastroAtual(historico, { catalogo });
  assert.equal(r.estado, 'comparado');
  assert.deepEqual(r.referencias, { anterior: '2026-08', atual: '2026-09' });
  assert.deepEqual(r.mudancas, [{ campo: 'nome', grupo: 'cadastro', anterior: 'Historico', atual: 'Atualizado', tipo: 'alterado' }]);
  assert.equal(historico.nome, 'Historico');
  assert.equal(sqls.length, 1);
  assert.ok(sqls.every((sql) => sql.startsWith('WITH atual AS')));
  const anteriorPersistido = (await db.query('SELECT nome FROM catalogo_registros WHERE snapshot_id=$1', [primeira.snapshotId])).rows;
  assert.deepEqual(anteriorPersistido, [{ nome: 'Historico' }]);
  assert.equal((await db.query('SELECT count(*)::int n FROM eventos_corporativos')).rows[0].n, 0);
  await importarCatalogo(db, { texto: fonte('2026-10', 'Fora do recorte', '08') });
  const ausente = await compararCadastroAtual(historico, { catalogo });
  assert.equal(ausente.estado, 'empresa_nao_encontrada');
  assert.equal(ausente.mudancas, null);
  assert.equal(ausente.anterior.nome, 'Historico');
  assert.equal((await db.query('SELECT count(*)::int n FROM catalogo_publicacoes')).rows[0].n, 3);
});
