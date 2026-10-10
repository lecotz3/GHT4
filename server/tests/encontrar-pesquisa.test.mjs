import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/app.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso, atestarQuadro } from './ajuda.mjs';
import { encontrarPessoas } from '../src/encontrar/buscar.mjs';

/* Rodada 23: as melhorias de prioridade média do roteiro "Find 100% funcional".
   O find dentro de uma pesquisa por tese ("quem decide nas aderentes") e as restrições
   de contato dos outros espaços como aviso, como no plano de acesso. */

const senha = 'Senha restrita aos testes 2026!';
const REF = '2026-08';

async function montar(t) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-encontrar-pesquisa-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'base.js');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const empresa = (raiz, nome, cidade, uf, abertura) => [`cnpj${raiz}`, nome, `${nome} Ltda`, raiz, cidade, uf, '4684299', [], '02', '2062',
    500000, '05', abertura, 1, [uf], 2, 0, false, {}];
  const linhas = [
    empresa('11111111', 'Alfa Química', 'Campinas', 'SP', '1990-01-01'),
    empresa('22222222', 'Beta Química', 'Santos', 'SP', '2020-01-01'),
    empresa('33333333', 'Gama Química', 'Niterói', 'RJ', '1995-01-01'),
    empresa('44444444', 'Delta Química', 'Sorocaba', 'SP', '1985-01-01'),
  ];
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${REF}";`);
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo: criarCatalogo({ arquivo, arquivoIbama: null }) });
  t.after(async () => { await app.close(); await db.close(); });
  async function usuario(email, papel, nome) {
    const u = await criarUsuario(db, { email, papel, senha, nome });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha } });
    assert.equal(r.statusCode, 200, r.body);
    const cookie = r.headers['set-cookie'].split(';')[0];
    return { ...u, cookie, chamar: (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } }) };
  }
  return { db, usuario };
}

test('encontrar dentro de uma pesquisa por tese, com avisos de outros espaços', async (t) => {
  const { db, usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const outro = await usuario('outro@teste.local', 'socio', 'Otávio Sócio');
  const buscar = async (corpo, quem = socio) => {
    const r = await quem.chamar('POST', '/api/encontrar', corpo);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const decisor = async (empresaId, nome) => {
    const r = await socio.chamar('POST', `/api/acesso/${empresaId}/decisores`, { id: randomUUID(), nome, cargo: 'Sócio-administrador', senioridade: 'ceo',
      fonte: { tipo: 'site_oficial', descricao: 'Página Quem somos', url: `https://${empresaId}.exemplo.test/quem-somos` } });
    assert.equal(r.statusCode, 201, r.body);
  };
  await decisor('cnpj11111111', 'Carlos Nunes');
  await decisor('cnpj44444444', 'Dora Lima');
  await decisor('cnpj22222222', 'Ivo Reis');

  // Uma pesquisa só de cadastro: o resultado sai na hora. A Delta vira "provável" e a Gama sai das aderentes.
  const id = randomUUID();
  const criada = await socio.chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos' });
  assert.equal(criada.statusCode, 201, criada.body);
  const iniciada = await socio.chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: criada.json().pesquisa.versao });
  assert.equal(iniciada.statusCode, 200, iniciada.body);
  await db.query("UPDATE pesquisa_itens SET categoria='provavel', aderencia=70 WHERE pesquisa_id=$1 AND empresa_id='cnpj44444444'", [id]);
  await db.query("UPDATE pesquisa_itens SET categoria='nao_aderente', aderencia=0 WHERE pesquisa_id=$1 AND empresa_id='cnpj33333333'", [id]);

  let r = await buscar({ pedido: 'Quem decide', pesquisaId: id });
  assert.equal(r.funil.recorte, 2, 'aderentes e prováveis');
  assert.deepEqual(r.leitura.pesquisa, { id, tese: 'Distribuidoras com mais de 20 anos', empresas: 2, categorias: ['aderente', 'provavel'] });
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Carlos Nunes']);
  const linha = r.grupos.forte[0].juizo.find((l) => l.requisito === 'Na pesquisa por tese');
  assert.equal(linha.julgamento, 'atende');
  assert.match(linha.fonte, /Pesquisa por tese do GHT4 · "Distribuidoras com mais de 20 anos"/);
  assert.deepEqual(r.grupos.revisar.map((p) => [p.nome, p.pendencias]), [['Dora Lima', ['Na pesquisa por tese']]], 'provável é indício');
  assert.ok(!JSON.stringify(r.grupos).includes('Ivo Reis'), 'a Beta não está na pesquisa');
  assert.ok(r.limitacoes.some((l) => /vêm da pesquisa por tese/.test(l)));
  assert.ok(!r.leitura.notas.some((n) => /subsetor/.test(n)));

  // O pedido ainda vale por cima da pesquisa: a UF citada recorta.
  r = await buscar({ pedido: 'Quem decide em RJ', pesquisaId: id });
  assert.equal(r.funil.recorte, 0);

  // A pesquisa é do membro: outro sócio não a usa, e uma que não existe também não.
  assert.equal((await outro.chamar('POST', '/api/encontrar', { pedido: 'Quem decide', pesquisaId: id })).statusCode, 404);
  assert.equal((await socio.chamar('POST', '/api/encontrar', { pedido: 'Quem decide', pesquisaId: randomUUID() })).statusCode, 404);
  assert.equal((await socio.chamar('POST', '/api/encontrar', { pedido: 'Quem decide', pesquisaId: 'x' })).statusCode, 422);

  // Restrições: a do espaço do trabalho decide; a de um mandato visível vira aviso; a de um mandato
  // confidencial de que o membro não participa não aparece.
  const aberto = await criarMandato(db, { codigo: 'M-ABERTO', rotulo: 'Mandato Aberto', confidencial: false });
  const fechado = await criarMandato(db, { codigo: 'M-FECHADO', rotulo: 'Mandato Fechado', confidencial: true });
  await darAcesso(db, fechado.id, outro.id, 'socio');
  const restringir = (escopo, empresaId, motivo, quem) => db.query(
    `INSERT INTO crm_restricoes_contato(escopo,empresa_id,ativa,categoria,motivo,usuario_id) VALUES ($1,$2,true,'solicitacao_da_empresa',$3,$4)`,
    [escopo, empresaId, motivo, quem]);
  await restringir(`mandato:${aberto.id}`, 'cnpj11111111', 'Em negociação com outro assessor.', socio.id);
  await restringir(`mandato:${fechado.id}`, 'cnpj11111111', 'Motivo confidencial.', outro.id);
  await restringir(`usuario:${socio.id}`, 'cnpj44444444', 'Pediu para não ser procurada.', socio.id);

  r = await buscar({ pedido: 'Quem decide', pesquisaId: id });
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Carlos Nunes'], 'aviso não tira do grupo');
  assert.deepEqual(r.grupos.forte[0].avisos, ['Há restrição de contato no espaço "Mandato Aberto": Em negociação com outro assessor. Fale com o responsável antes de abordar.']);
  assert.doesNotMatch(JSON.stringify(r), /Motivo confidencial/);
  assert.match(r.grupos.excluido.find((p) => p.nome === 'Dora Lima').motivo, /^Não contatar neste espaço: Pediu para não ser procurada/);

  // Fora da pesquisa vale o mesmo: o aviso também chega às lacunas.
  r = await buscar({ pedido: 'Quem decide nas distribuidoras com mais de 20 anos' });
  assert.equal(r.grupos.forte.find((p) => p.nome === 'Carlos Nunes').avisos.length, 1);
  await db.query("UPDATE rede_pessoas SET ativo=false WHERE nome='Carlos Nunes'");
  r = await buscar({ pedido: 'Quem decide nas distribuidoras com mais de 20 anos' });
  const lacuna = r.lacunas.empresas.find((l) => l.empresa.id === 'cnpj11111111');
  assert.match(lacuna.avisos[0], /espaço "Mandato Aberto"/);

  // Quem participa do mandato fechado vê a restrição dele; a pessoal da Helena não aparece para ele.
  await db.query("UPDATE rede_pessoas SET ativo=true WHERE nome='Carlos Nunes'");
  r = await buscar({ pedido: 'Quem decide nas distribuidoras com mais de 20 anos' }, outro);
  const carlos = r.grupos.forte.find((p) => p.nome === 'Carlos Nunes');
  assert.equal(carlos.avisos.length, 2);
  assert.ok(carlos.avisos.some((a) => /Mandato Fechado/.test(a)));
  assert.ok(!JSON.stringify(r).includes('Pediu para não ser procurada'), 'espaço pessoal de outro membro não aparece');
});

test('recorte em páginas e teto de pessoas: empresa sem avaliar não vira "ninguém mapeado"', async (t) => {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-encontrar-tetos-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'base.js');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const linhas = ['11111111', '22222222', '33333333', '44444444'].map((raiz, i) => [`cnpj${raiz}`, `Empresa ${i + 1}`, `Empresa ${i + 1} Ltda`, raiz, 'Campinas', 'SP',
    '4684299', [], '02', '2062', 500000, '05', '1990-01-01', 1, ['SP'], 2, 0, false, {}]);
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${REF}";`);
  const db = await bancoDeTeste();
  t.after(() => db.close());
  const catalogo = criarCatalogo({ arquivo, arquivoIbama: null });
  const u = await criarUsuario(db, { email: 'tetos@teste.local', papel: 'socio', senha, nome: 'Teto' });
  const pessoa = (nome, senioridade, empresaId) => db.query(`INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,empresa_id,origem,origem_referencia,criado_por)
    VALUES ($1,'mercado',$2,lower($2),'Cargo',$3,$4,'cadastro_publico','Quadro societário',$5)`, [randomUUID(), nome, senioridade, empresaId, u.id]).then(() => atestarQuadro(db));
  await pessoa('Bia Gerente', 'gerencia', 'cnpj11111111');
  await pessoa('Caio Presidente', 'ceo', 'cnpj22222222');
  await pessoa('Dora Presidente', 'ceo', 'cnpj44444444');

  // Sem teto apertado: as quatro empresas em duas páginas, e as três pessoas.
  let r = await encontrarPessoas(db, catalogo, { texto: 'Quem decide', usuario: { ...u, mandatos: [] } }, { paginaRecorte: 2 });
  assert.deepEqual([r.funil.recorte, r.funil.lidas, r.funil.truncado, r.funil.pessoas], [4, 4, false, 3]);
  assert.ok(r.lacunas.empresas.some((l) => l.empresa.id === 'cnpj33333333'), 'a Empresa 3 não tem ninguém');

  // Teto de duas pessoas: a Dora não é lida, e da Empresa 2 em diante nada vira lacuna.
  r = await encontrarPessoas(db, catalogo, { texto: 'Quem decide', usuario: { ...u, mandatos: [] } }, { paginaRecorte: 2, limitePessoas: 2 });
  assert.equal(r.funil.pessoas, 2);
  assert.deepEqual(r.lacunas.empresas.map((l) => l.empresa.id), ['cnpj11111111'], 'a gerente não serve; Empresa 3 e 4 ficaram sem avaliar');
  assert.ok(r.limitacoes.some((l) => /Mais de 2 pessoas mapeadas.*não entram em "Onde falta quem decide"/.test(l)));
});

test('dentro da pesquisa, empresa citada pelo nome estreita o recorte da pesquisa', async (t) => {
  const { db, usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const buscar = async (corpo) => { const r = await socio.chamar('POST', '/api/encontrar', corpo); assert.equal(r.statusCode, 200, r.body); return r.json(); };
  const id = randomUUID();
  const criada = await socio.chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos' });
  assert.equal((await socio.chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: criada.json().pesquisa.versao })).statusCode, 200);

  let r = await buscar({ pedido: 'Quem decide na Alfa Química', pesquisaId: id });
  assert.deepEqual([r.funil.recorte, r.lacunas.empresas.map((l) => l.empresa.id)], [1, ['cnpj11111111']], 'só a Alfa, das empresas da pesquisa');
  assert.deepEqual(r.leitura.empresas.map((n) => n.trecho), ['Alfa Química']);

  // A Beta existe no catálogo, mas não está entre as aderentes e prováveis: o pedido não a traz de volta.
  r = await buscar({ pedido: 'Quem decide na Beta Química', pesquisaId: id });
  assert.equal(r.funil.recorte, 0);
  assert.ok(r.leitura.notas.some((n) => /Beta Química não está entre as aderentes e prováveis desta pesquisa/.test(n)), JSON.stringify(r.leitura.notas));
});

test('o teto de pessoas conta só as empresas que passam nos critérios', async (t) => {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-encontrar-teto-criterios-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'base.js');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const linhas = [['11111111', '2020-01-01'], ['22222222', '1990-01-01']].map(([raiz, abertura], i) => [`cnpj${raiz}`, `Empresa ${i + 1}`, `Empresa ${i + 1} Ltda`, raiz,
    'Campinas', 'SP', '4684299', [], '02', '2062', 500000, '05', abertura, 1, ['SP'], 2, 0, false, {}]);
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${REF}";`);
  const db = await bancoDeTeste();
  t.after(() => db.close());
  const catalogo = criarCatalogo({ arquivo, arquivoIbama: null });
  const u = await criarUsuario(db, { email: 'teto-criterios@teste.local', papel: 'socio', senha, nome: 'Teto' });
  const pessoa = (nome, empresaId) => db.query(`INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,empresa_id,origem,origem_referencia,criado_por)
    VALUES ($1,'mercado',$2,lower($2),'Sócio-administrador','ceo',$3,'cadastro_publico','Quadro societário',$4)`, [randomUUID(), nome, empresaId, u.id]).then(() => atestarQuadro(db));
  // A Empresa 1 é nova demais e tem três dirigentes; a Empresa 2 passa e tem um.
  for (const nome of ['Ana Um', 'Bia Um', 'Caio Um']) await pessoa(nome, 'cnpj11111111');
  await pessoa('Dora Dois', 'cnpj22222222');

  const r = await encontrarPessoas(db, catalogo, { texto: 'Quem decide nas distribuidoras com mais de 20 anos', usuario: { ...u, mandatos: [] } }, { limitePessoas: 2 });
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Dora Dois'], 'quem está fora dos critérios não ocupa o teto');
  assert.deepEqual([r.funil.pessoas, r.funil.foraDosCriterios], [1, 3]);
  assert.ok(!r.limitacoes.some((l) => /Mais de 2 pessoas/.test(l)));
});
