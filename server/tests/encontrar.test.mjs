import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/app.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';
import { interpretarPedido } from '../src/encontrar/pedido.mjs';

const senha = 'Senha restrita aos testes 2026!';
const REF = '2026-08';

test('o pedido separa papel, acesso e empresa, sem roubar critério da empresa', () => {
  const quem = interpretarPedido('Quem decide nas distribuidoras de SP com mais de 20 anos');
  assert.equal(quem.papel.decide, true);
  assert.equal(quem.papel.padrao, false);
  assert.deepEqual(quem.papel.senioridades, []);
  assert.equal(quem.recorte.uf, 'SP');
  assert.equal(quem.recorte.subsetor, 'Distribuição e trading químico');
  assert.deepEqual(quem.criterios.map((c) => c.regra?.campo), ['idade_min']);
  assert.equal(quem.acesso.exigido, null);

  // Cargo da escala e acesso pela casa; "de fabricantes de tintas" já é o recorte.
  const cfo = interpretarPedido('CFOs de fabricantes de tintas no Sul que a casa conhece');
  assert.deepEqual(cfo.papel.senioridades, ['cfo']);
  assert.equal(cfo.papel.decide, false);
  assert.deepEqual(cfo.acesso, { exigido: 'com_caminho', obrigatorio: true, trecho: 'que a casa conhece' });
  assert.equal(cfo.recorte.subsetor, 'Tintas, vernizes e revestimentos');
  assert.deepEqual(cfo.criterios.map((c) => c.tipo), ['cadastro'], 'só a região vira critério');
  assert.ok(cfo.notas.some((n) => /já está no recorte/.test(n)));
  assert.ok(cfo.notas.every((n) => !/"Recorte"/.test(n)), 'a tela do find não tem o seletor de recorte');

  // Sócio, dono e controlador que descrevem a empresa ficam para a tese.
  const estrangeiro = interpretarPedido('Diretores em empresas sem sócio estrangeiro, até 3 sócios');
  assert.equal(estrangeiro.papel.decide, false);
  assert.deepEqual(estrangeiro.papel.senioridades.sort(), ['ceo', 'cfo', 'diretoria']);
  assert.deepEqual(estrangeiro.criterios.map((c) => c.regra?.campo).sort(), ['socio_estrangeiro', 'socios_max']);
  assert.equal(interpretarPedido('Empresas de dono em tintas').papel.padrao, true, '"empresas de dono" é critério da empresa');
  assert.equal(interpretarPedido('Donos de distribuidoras em MG').papel.decide, true);

  // Área do cargo acompanha o papel; introdução de preferência não é obrigatória.
  const gerentes = interpretarPedido('Gerentes comerciais de distribuidoras de solventes industriais, de preferência com apresentação viável');
  assert.deepEqual(gerentes.papel.senioridades, ['gerencia']);
  assert.ok(gerentes.notas.some((n) => /área do cargo \("comerciais"\)/.test(n)));
  assert.deepEqual(gerentes.acesso, { exigido: 'introducao', obrigatorio: false, trecho: 'com apresentação viável' });
  assert.ok(gerentes.criterios.some((c) => c.tipo === 'pesquisa' && /solventes/i.test(c.texto)), 'o produto vendido pede site');
  assert.ok(!gerentes.criterios.some((c) => /comerciais/i.test(c.texto)));

  // Sem cargo: quem decide, com nota.
  const vago = interpretarPedido('pessoas nas tradings de resinas');
  assert.equal(vago.papel.padrao, true);
  assert.equal(vago.papel.decide, true);
  assert.ok(vago.notas.some((n) => /não diz o cargo/.test(n)));
});

async function montar(t) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-encontrar-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'base.js');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const empresa = (raiz, nome, cidade, uf, abertura) => [`cnpj${raiz}`, nome, `${nome} Ltda`, raiz, cidade, uf, '4684299', [], '02', '2062',
    500000, '05', abertura, 1, [uf], 2, 0, false, { email: `contato@${raiz}.com.br`, telefone: '(11) 0000-0000' }];
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
    return { ...u, cookie, chamar: (method, url, payload, headers = {}) => app.inject({ method, url, payload, headers: { cookie, ...headers } }) };
  }
  return { db, app, usuario };
}

test('encontrar quem decide: triagem, caminho, introdução, lacunas e restrição', async (t) => {
  const { db, usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const analista = await usuario('analista@teste.local', 'analista', 'Ana Lista');
  const buscar = async (pedido, quem = socio) => {
    const r = await quem.chamar('POST', '/api/encontrar', { pedido });
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };

  // Quem decide na Alfa entra pelo plano de acesso, com a fonte do cargo.
  const carlos = randomUUID();
  const registrado = await socio.chamar('POST', '/api/acesso/cnpj11111111/decisores', { id: carlos, nome: 'Carlos Nunes', cargo: 'Sócio-administrador', senioridade: 'ceo',
    fonte: { tipo: 'site_oficial', descricao: 'Página Quem somos', url: 'https://alfa.com.br/quem-somos' } });
  assert.equal(registrado.statusCode, 201, registrado.body);
  // Uma gerente de lista compartilhada (com contato que não pode sair) e uma conselheira numa empresa nova demais.
  const inserir = (id, nome, cargo, senioridade, empresaId, origem, extra = {}) => db.query(
    `INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,empresa_id,origem,origem_referencia,criado_por,email,telefone)
     VALUES ($1,'mercado',$2,lower($2),$3,$4,'x','x',$5,$6,$7,$8,$9,$10)`,
    [id, nome, cargo, senioridade, empresaId, origem, extra.referencia ?? '', socio.id, extra.email ?? null, extra.telefone ?? null]);
  const bia = randomUUID(), dora = randomUUID();
  await inserir(bia, 'Bia Prado', 'Gerente comercial', 'gerencia', 'cnpj11111111', 'importacao', { referencia: 'Lista da feira', email: 'bia@alfa.com.br', telefone: '(19) 99999-1234' });
  await inserir(dora, 'Dora Lima', 'Conselheira', 'conselho', 'cnpj22222222', 'cadastro_publico');

  let r = await buscar('Quem decide nas distribuidoras de SP com mais de 20 anos');
  assert.equal(r.funil.recorte, 3, 'só SP');
  assert.equal(r.funil.nosCriterios, 2, 'Beta tem menos de 20 anos');
  assert.equal(r.funil.pessoas, 2);
  assert.equal(r.funil.foraDosCriterios, 1, 'Dora está numa empresa fora dos critérios');
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Carlos Nunes']);
  const c = r.grupos.forte[0];
  assert.equal(c.posicao.id, 'decide');
  assert.deepEqual(c.juizo.filter((l) => l.obrigatorio).map((l) => l.julgamento), ['atende', 'atende', 'atende', 'atende']);
  assert.match(c.juizo.find((l) => l.requisito === 'Cargo com fonte').fonte, /Site oficial/);
  assert.match(c.juizo.find((l) => /20 anos/.test(l.requisito)).fonte, /Receita Federal · CNPJ · 2026-08/);
  assert.equal(c.juizo.find((l) => l.requisito === 'A casa chega até ela').obrigatorio, false, 'acesso só informa quando não pedido');
  assert.deepEqual(r.grupos.excluido.map((p) => p.nome), ['Bia Prado']);
  assert.match(r.grupos.excluido[0].motivo, /^Decide a venda: Gerência/);
  assert.deepEqual(r.lacunas.empresas.map((l) => l.empresa.nome), ['Delta Química'], 'onde falta registrar quem decide');
  assert.equal(r.lacunas.ninguemMapeado, 1);
  assert.doesNotMatch(JSON.stringify(r), /bia@alfa|99999-1234|0000-0000|contato@/, 'nem contato da rede nem do cadastro');

  // Pedir quem a casa conhece: sem caminho, Carlos vai para revisão; com a relação confirmada, volta a forte.
  // Sem o critério de idade, a Beta volta ao recorte, e a conselheira dela também fica sem caminho.
  const carlosEm = (lista) => lista.find((p) => p.nome === 'Carlos Nunes');
  r = await buscar('Quem decide nas distribuidoras de SP que a casa conhece');
  assert.deepEqual(r.grupos.revisar.map((p) => p.nome), ['Carlos Nunes', 'Dora Lima']);
  assert.deepEqual(carlosEm(r.grupos.revisar).pendencias, ['A casa chega até ela']);
  assert.deepEqual(r.grupos.forte, []);
  const eu = await socio.chamar('POST', '/api/rede/pessoas', { id: randomUUID(), lado: 'ght4', nome: 'Helena Sócia', usuarioId: socio.id });
  assert.equal(eu.statusCode, 201, eu.body);
  const responder = (resposta) => socio.chamar('POST', '/api/rede/reconhecimento', { id: randomUUID(), pessoaAlvoId: carlos, resposta, evidencia: 'Trabalhamos juntos na Química Beta até 2019.' });
  assert.equal((await responder('conheco')).statusCode, 201);
  r = await buscar('Quem decide nas distribuidoras de SP que a casa conhece');
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Carlos Nunes']);
  assert.deepEqual(r.grupos.revisar.map((p) => p.nome), ['Dora Lima']);
  assert.equal(r.grupos.forte[0].caminho.categoria, 'relacao_confirmada');
  assert.match(r.grupos.forte[0].caminho.rota, /Helena Sócia → Carlos Nunes/);

  // Introdução pede mais: relação confirmada sem aceite de apresentar é indício.
  r = await buscar('Quem decide nas distribuidoras de SP com apresentação viável');
  assert.deepEqual(r.grupos.forte, []);
  assert.equal(carlosEm(r.grupos.revisar).juizo.find((l) => l.requisito === 'Há introdução viável pela casa').julgamento, 'indicio');
  assert.equal((await responder('posso_apresentar')).statusCode, 201);
  r = await buscar('Quem decide nas distribuidoras de SP com apresentação viável');
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Carlos Nunes']);

  // Cargo da escala: a gerente atende ao pedido de gerentes; "decide a venda" só informa.
  r = await buscar('Gerentes das distribuidoras de SP');
  const gerente = [...r.grupos.forte, ...r.grupos.revisar].find((p) => p.nome === 'Bia Prado');
  assert.ok(gerente, JSON.stringify(r.grupos));
  assert.equal(gerente.grupo, 'revisar', 'cargo de lista compartilhada pede revisão');
  assert.deepEqual(gerente.pendencias, ['Cargo com fonte']);
  assert.equal(gerente.juizo.find((l) => l.requisito === 'Decide a venda').obrigatorio, false);

  // Critério que só o site responde manda para revisão, com a pesquisa por tese como passo.
  r = await buscar('Quem decide nas distribuidoras de solventes industriais em SP');
  assert.deepEqual(r.grupos.forte, []);
  assert.equal(carlosEm(r.grupos.revisar).pedePesquisa, true);
  assert.deepEqual(carlosEm(r.grupos.revisar).pendencias, ['Nas distribuidoras de solventes industriais']);

  // Restrição do espaço do membro: fora, com o motivo, e a empresa não vira lacuna.
  await db.query(`INSERT INTO crm_restricoes_contato(escopo,empresa_id,ativa,categoria,motivo,usuario_id) VALUES ($1,'cnpj11111111',true,'solicitacao_da_empresa','Pediu para não ser procurada.',$2)`,
    [`usuario:${socio.id}`, socio.id]);
  r = await buscar('Quem decide nas distribuidoras de SP com mais de 20 anos');
  assert.deepEqual(r.grupos.forte, []);
  const restrito = r.grupos.excluido.find((p) => p.nome === 'Carlos Nunes');
  assert.match(restrito.motivo, /^Não contatar neste espaço: Pediu para não ser procurada/);
  assert.equal(restrito.caminho, null, 'restrição esconde o caminho');
  assert.ok(!r.lacunas.empresas.some((l) => l.empresa.id === 'cnpj11111111'));
  // A restrição é do espaço de quem marcou: para a analista, Carlos segue no resultado.
  r = await buscar('Quem decide nas distribuidoras de SP com mais de 20 anos', analista);
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Carlos Nunes']);

  // Canal externo, pedido vazio e sessão.
  const externo = await socio.chamar('POST', '/api/encontrar', { pedido: 'Quem decide em SP' }, { 'x-ght4-canal': 'mcp' });
  assert.equal(externo.statusCode, 403);
  assert.equal(externo.json().erro, 'canal_externo');
  assert.equal((await socio.chamar('POST', '/api/encontrar', { pedido: ' ' })).statusCode, 422);
  assert.equal((await socio.chamar('POST', '/api/encontrar', { pedido: 'Quem decide', extra: 1 })).statusCode, 422);
});

test('busca em lote não perde o caminho que passa por outro alvo (Casa → Alfa → Delta)', async (t) => {
  const { db, usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const buscar = async (pedido) => {
    const r = await socio.chamar('POST', '/api/encontrar', { pedido });
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const eu = randomUUID(), ivo = randomUUID(), rita = randomUUID();
  assert.equal((await socio.chamar('POST', '/api/rede/pessoas', { id: eu, lado: 'ght4', nome: 'Helena Sócia', usuarioId: socio.id })).statusCode, 201);
  for (const [id, nome, empresaId] of [[ivo, 'Ivo Ramos', 'cnpj11111111'], [rita, 'Rita Melo', 'cnpj44444444']]) await db.query(
    `INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,empresa_id,origem,criado_por)
     VALUES ($1,'mercado',$2,lower($2),'Diretor-presidente','ceo','x','x',$3,'cadastro_publico',$4)`, [id, nome, empresaId, socio.id]);
  const ligar = (x, y) => { const [a, b] = [x, y].sort(); return db.query(
    `INSERT INTO rede_vinculos (id,pessoa_a_id,pessoa_b_id,tipo,forca,evidencia,disposicao,criado_por)
     VALUES ($1,$2,$3,'trabalharam_juntos','direta','Trabalharam juntos','posso_apresentar',$4)`, [randomUUID(), a, b, socio.id]); };
  await ligar(eu, ivo);
  await ligar(ivo, rita);

  const daRita = (r) => [...r.grupos.forte, ...r.grupos.revisar, ...r.grupos.excluido].find((p) => p.nome === 'Rita Melo');
  const sozinha = daRita(await buscar('Quem decide na Delta Química que a casa conhece'));
  assert.equal(sozinha.grupo, 'forte');
  assert.equal(sozinha.caminho.saltos, 2);
  assert.match(sozinha.caminho.rota, /Helena Sócia → Ivo Ramos .*→ Rita Melo/);

  // Em lote, Ivo também é alvo: a ligação até ele não pode encerrar a busca que chega à Rita.
  const lote = await buscar('Quem decide nas distribuidoras de SP que a casa conhece');
  const emLote = daRita(lote);
  assert.equal(emLote.grupo, 'forte', JSON.stringify(emLote?.pendencias));
  assert.deepEqual({ saltos: emLote.caminho.saltos, rota: emLote.caminho.rota, categoria: emLote.caminho.categoria },
    { saltos: sozinha.caminho.saltos, rota: sozinha.caminho.rota, categoria: sozinha.caminho.categoria }, 'o mesmo caminho da busca individual');
  const doIvo = lote.grupos.forte.find((p) => p.nome === 'Ivo Ramos');
  assert.equal(doIvo?.caminho.saltos, 1, 'e o intermediário segue com o próprio caminho direto');
});

test('cargo negado sai do pedido, e a área do cargo vira exigência', async (t) => {
  // Leitura: "sem gerentes" e "exceto CEOs" excluem; nada de "sem" sobrando para a tese.
  const semGerentes = interpretarPedido('Quem decide nas distribuidoras, sem gerentes');
  assert.equal(semGerentes.papel.decide, true);
  assert.deepEqual(semGerentes.papel.senioridades, []);
  assert.deepEqual(semGerentes.papel.excluidas, ['gerencia']);
  assert.match(semGerentes.papel.rotulo, /^Quem decide a venda, exceto Gerência/);
  assert.doesNotMatch(semGerentes.tese, /\bsem\b/);
  const cfo = interpretarPedido('CFOs exceto CEOs');
  assert.deepEqual(cfo.papel.senioridades, ['cfo']);
  assert.deepEqual(cfo.papel.excluidas, ['ceo']);
  assert.deepEqual(interpretarPedido('Diretores, menos os CFOs').papel.senioridades.sort(), ['ceo', 'diretoria']);
  assert.deepEqual(interpretarPedido('Gerentes comerciais de distribuidoras').papel.areas, [{ texto: 'comerciais', area: 'comercial', senioridades: ['gerencia'] }]);

  const { db, usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const buscar = async (pedido) => {
    const r = await socio.chamar('POST', '/api/encontrar', { pedido });
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  for (const [nome, cargo, senioridade] of [['Gil Souza', 'Gerente comercial', 'gerencia'], ['Lia Reis', 'Gerente de compras', 'gerencia'], ['Caio Dias', 'Diretor-presidente', 'ceo']]) await db.query(
    `INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,empresa_id,origem,criado_por)
     VALUES ($1,'mercado',$2,lower($2),$3,$4,'x','x','cnpj11111111','cadastro_publico',$5)`, [randomUUID(), nome, cargo, senioridade, socio.id]);
  const grupoDe = (r, nome) => [...r.grupos.forte, ...r.grupos.revisar, ...r.grupos.excluido].find((p) => p.nome === nome);

  let r = await buscar('Quem decide nas distribuidoras de SP, sem gerentes');
  for (const nome of ['Gil Souza', 'Lia Reis']) {
    assert.equal(grupoDe(r, nome).grupo, 'excluido', nome);
    assert.match(grupoDe(r, nome).motivo, /^Cargo fora do pedido \(Gerência\)/);
  }
  assert.equal(grupoDe(r, 'Caio Dias').grupo, 'forte');

  r = await buscar('Gerentes comerciais das distribuidoras de SP');
  assert.equal(grupoDe(r, 'Gil Souza').grupo, 'forte', 'o cargo registrado traz a área');
  const lia = grupoDe(r, 'Lia Reis');
  assert.equal(lia.grupo, 'revisar', 'a área não está no cargo: não se afirma que atende');
  assert.deepEqual(lia.pendencias, ['Área do cargo: comerciais']);
});
