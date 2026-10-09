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
import { interpretarTese, verificarCadastro } from '../src/pesquisa/criterios.mjs';

/* Rodada 22: as três melhorias de prioridade alta do roteiro "Find 100% funcional".
   Empresa pelo nome no pedido, o leitor da tese (produto de uma palavra, "tradings",
   cidade sem "cidade de") e o vínculo ao CNPJ de quem só tem o nome da organização. */

const senha = 'Senha restrita aos testes 2026!';
const REF = '2026-08';

test('leitor da tese: produto de uma palavra, "tradings" e cidade pelo catálogo', () => {
  const regras = (tese, opcoes) => interpretarTese(tese, { referencia: REF, ...opcoes });

  // "Tradings" no plural é distribuição; a resina é o produto vendido, não o recorte.
  assert.equal(regras('Tradings de resinas no Sul').filtros.subsetor, 'Distribuição e trading químico');

  // Um produto só, depois do tipo de empresa, vira critério de pesquisa (antes sumia sem aviso).
  assert.deepEqual(regras('Distribuidoras de solventes em SP').criterios.map((c) => [c.tipo, c.texto]), [['pesquisa', 'Distribuidoras de solventes']]);
  assert.deepEqual(regras('Distribuidoras de ácidos').criterios.map((c) => c.texto), ['Distribuidoras de ácidos']);
  assert.deepEqual(regras('Distribuidoras de produtos químicos em SP').criterios, [], '"produtos químicos" não descreve nada além do recorte');

  // Sem a lista de municípios, a cidade não vira critério, mas não some: a nota ensina "cidade de".
  const semLista = regras('Distribuidoras de Campinas');
  assert.deepEqual(semLista.criterios, []);
  assert.ok(semLista.notas.some((n) => /"Campinas" não virou critério.*cidade de Campinas/.test(n)), JSON.stringify(semLista.notas));

  // Com a lista do catálogo: "em" vale em minúsculas; "de" pede inicial maiúscula; nome inteiro.
  const municipios = new Set(['campinas', 'serra', 'sao paulo', 'sao jose dos campos']);
  const campinas = regras('distribuidoras em campinas com mais de 20 anos', { municipios });
  assert.deepEqual(campinas.criterios.map((c) => c.regra.campo), ['municipio', 'idade_min']);
  assert.equal(campinas.criterios[0].texto, 'Sede em Campinas');
  assert.equal(verificarCadastro(campinas.criterios[0].regra, { cidade: 'CAMPINAS', uf: 'SP' }, REF).veredito, 'atende');
  assert.equal(regras('Fabricantes de tintas de Campinas', { municipios }).criterios.find((c) => c.regra?.campo === 'municipio')?.regra.valor, 'Campinas');
  assert.equal(regras('Distribuidoras em São José dos Campos', { municipios }).criterios[0].texto, 'Sede em São José dos Campos');
  assert.ok(!regras('Distribuidoras na Serra Gaúcha', { municipios }).criterios.some((c) => c.regra?.campo === 'municipio'), '"Serra Gaúcha" não é Serra');
  const estado = regras('Distribuidoras em São Paulo', { municipios });
  assert.equal(estado.filtros.uf, 'SP', 'nome de estado continua estado');
  assert.ok(!estado.criterios.some((c) => c.regra?.campo === 'municipio'));
});

test('o pedido propõe nomes de empresa sem confundir lugar, cargo ou valor', () => {
  const trechos = (pedido, opcoes) => {
    const l = interpretarPedido(pedido, opcoes);
    return l.candidatos.map((c) => (c.cnpj ? `cnpj:${c.cnpj}` : pedido.slice(c.ini, c.fim)));
  };
  assert.deepEqual(trechos('Quem decide na Química Alfa'), ['Química Alfa']);
  assert.deepEqual(trechos('quem decide na quimica alfa'), ['quimica alfa'], 'em minúsculas, pelo artigo no singular');
  assert.deepEqual(trechos('CFO do CNPJ 11.111.111/0001-00'), ['cnpj:11111111']);
  assert.deepEqual(trechos('Quem decide nas distribuidoras de SP com mais de 20 anos'), []);
  assert.deepEqual(trechos('Donos de fabricantes de tintas no Sul que a casa conhece'), []);
  assert.deepEqual(trechos('Quem decide na cidade de Campinas'), []);
  assert.deepEqual(trechos('Quem decide nas distribuidoras com capital acima de 10.000.000'), [], 'valor não é CNPJ');
  assert.deepEqual(trechos('Gerentes da Química'), [], 'palavra comum não identifica empresa');
  assert.deepEqual(trechos('Quem decide nas distribuidoras em Campinas', { municipios: new Set(['campinas']) }), [], 'município é lugar');
});

async function montar(t) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-encontrar-nomes-'));
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
    empresa('55555555', 'Alfa Solventes', 'Campinas', 'SP', '2001-01-01'),
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

test('encontrar pelo nome da empresa, pelo CNPJ e pela cidade', async (t) => {
  const { usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const buscar = async (pedido) => {
    const r = await socio.chamar('POST', '/api/encontrar', { pedido });
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const carlos = randomUUID();
  const registrado = await socio.chamar('POST', '/api/acesso/cnpj11111111/decisores', { id: carlos, nome: 'Carlos Nunes', cargo: 'Sócio-administrador', senioridade: 'ceo',
    fonte: { tipo: 'site_oficial', descricao: 'Página Quem somos', url: 'https://alfa.com.br/quem-somos' } });
  assert.equal(registrado.statusCode, 201, registrado.body);

  // O nome vira o recorte: nada de critério de site, e quem decide na Alfa sai em "Atendem".
  let r = await buscar('Quem decide na Química Alfa');
  assert.equal(r.funil.recorte, 1);
  assert.deepEqual(r.leitura.criterios, []);
  assert.deepEqual(r.leitura.empresas, [{ trecho: 'Química Alfa', empresas: [{ id: 'cnpj11111111', nome: 'Alfa Química', cidade: 'Campinas', uf: 'SP' }] }]);
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Carlos Nunes']);
  assert.ok(!r.leitura.notas.some((n) => /subsetor/.test(n)), 'com a empresa citada, o subsetor não recorta');

  // Nome que corresponde a mais de uma empresa: todas entram, com nota; a outra vira lacuna.
  r = await buscar('quem decide na Alfa');
  assert.equal(r.funil.recorte, 2);
  assert.ok(r.leitura.notas.some((n) => /"Alfa" corresponde a 2 empresas/.test(n)));
  assert.deepEqual(r.lacunas.empresas.map((l) => l.empresa.nome), ['Alfa Solventes']);

  // CNPJ exato; fora do catálogo, o recorte fica vazio em vez de virar todas as empresas.
  r = await buscar('Quem decide no CNPJ 11.111.111/0001-00');
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Carlos Nunes']);
  r = await buscar('Quem decide no CNPJ 99.999.999/0001-00');
  assert.equal(r.funil.recorte, 0);
  assert.ok(r.leitura.notas.some((n) => /CNPJ 99\.999\.999\/0001-00 não está no catálogo/.test(n)));

  // A UF citada ainda vale para a empresa citada, com nota.
  r = await buscar('Quem decide na Química Alfa em RJ');
  assert.equal(r.funil.recorte, 0);
  assert.ok(r.leitura.notas.some((n) => /Alfa Química \(SP\) fica fora do recorte/.test(n)), JSON.stringify(r.leitura.notas));

  // Nome que o catálogo não conhece segue como antes, com a nota do nome (e só ela).
  r = await buscar('Quem decide na Química Ômega');
  assert.ok(r.leitura.notas.some((n) => /"Química Ômega" não corresponde a uma empresa do catálogo/.test(n)));
  assert.ok(!r.leitura.notas.some((n) => /não virou critério/.test(n)));
  assert.equal(r.funil.recorte, 4);

  // Cidade sem "cidade de", pela lista de municípios do catálogo.
  r = await buscar('Quem decide nas distribuidoras em Campinas');
  assert.deepEqual(r.leitura.criterios.map((c) => c.texto), ['Sede em Campinas']);
  assert.equal(r.funil.nosCriterios, 2);
});

test('ligar ao CNPJ quem só tem o nome da organização', async (t) => {
  const { db, usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const analista = await usuario('analista@teste.local', 'analista', 'Ana Lista');
  const rui = randomUUID();
  const criada = await socio.chamar('POST', '/api/rede/pessoas', { id: rui, lado: 'mercado', nome: 'Rui Campos', cargo: 'Diretor industrial',
    senioridade: 'diretoria', organizacao: 'Química Alfa Ltda.', email: 'rui@alfa.com.br' });
  assert.equal(criada.statusCode, 201, criada.body);

  // Sem o CNPJ, a pessoa não entra em busca nenhuma, e a tela diz quantas estão assim.
  assert.equal((await socio.chamar('GET', '/api/rede')).json().resumo.semCnpj, 1);
  let r = (await socio.chamar('POST', '/api/encontrar', { pedido: 'Diretores da Química Alfa' })).json();
  assert.ok(!JSON.stringify(r.grupos).includes('Rui Campos'));
  assert.ok(r.limitacoes.some((l) => /^1 pessoa da rede está só com o nome da organização/.test(l)), JSON.stringify(r.limitacoes));
  const fila = (await socio.chamar('GET', '/api/rede/pessoas?lado=mercado&semEmpresa=1')).json();
  assert.deepEqual(fila.pessoas.map((p) => p.nome), ['Rui Campos']);

  // Sugestões pelo nome escrito: a mais parecida primeiro. Só quem edita a rede pede.
  assert.equal((await analista.chamar('GET', `/api/rede/pessoas/${rui}/empresas-sugeridas`)).statusCode, 403);
  const sugestoes = await socio.chamar('GET', `/api/rede/pessoas/${rui}/empresas-sugeridas`);
  assert.equal(sugestoes.statusCode, 200, sugestoes.body);
  assert.equal(sugestoes.json().busca, 'Química Alfa Ltda.');
  assert.deepEqual(sugestoes.json().empresas.map((e) => e.id), ['cnpj11111111', 'cnpj55555555']);
  assert.equal(sugestoes.headers['cache-control'], 'no-store');
  assert.deepEqual((await socio.chamar('GET', `/api/rede/pessoas/${rui}/empresas-sugeridas?busca=${encodeURIComponent('55.555.555/0001-00')}`)).json().empresas.map((e) => e.id), ['cnpj55555555']);
  const generico = (await socio.chamar('GET', `/api/rede/pessoas/${rui}/empresas-sugeridas?busca=Distribuidora%20Qu%C3%ADmica`)).json();
  assert.equal(generico.identifica, false);
  assert.deepEqual(generico.empresas, []);

  // Ligar: versão conferida, empresa do catálogo, papel que edita. Só o CNPJ muda.
  const versao = criada.json().pessoa.versao;
  assert.equal((await socio.chamar('POST', `/api/rede/pessoas/${rui}/empresa`, { empresaId: 'cnpj11111111', versao: versao + 7 })).statusCode, 409);
  assert.equal((await socio.chamar('POST', `/api/rede/pessoas/${rui}/empresa`, { empresaId: 'cnpj99999999', versao })).statusCode, 422);
  assert.equal((await analista.chamar('POST', `/api/rede/pessoas/${rui}/empresa`, { empresaId: 'cnpj11111111', versao })).statusCode, 403);
  const ligada = await socio.chamar('POST', `/api/rede/pessoas/${rui}/empresa`, { empresaId: 'cnpj11111111', versao });
  assert.equal(ligada.statusCode, 200, ligada.body);
  assert.equal(ligada.json().pessoa.empresaId, 'cnpj11111111');
  assert.equal(ligada.json().empresa.nome, 'Alfa Química');
  const linha = (await db.query('SELECT organizacao, email, versao FROM rede_pessoas WHERE id=$1', [rui])).rows[0];
  assert.deepEqual(linha, { organizacao: 'Química Alfa Ltda.', email: 'rui@alfa.com.br', versao: versao + 1 }, 'nome escrito e contato ficam');
  const trilha = (await db.query("SELECT antes, depois FROM auditoria WHERE entidade='rede_pessoa' AND entidade_id=$1 AND acao='vincular_empresa'", [rui])).rows;
  assert.equal(trilha.length, 1);
  assert.equal(trilha[0].depois.empresaId, 'cnpj11111111');

  // Agora a pessoa entra no find e sai da fila.
  r = (await socio.chamar('POST', '/api/encontrar', { pedido: 'Diretores da Química Alfa' })).json();
  assert.ok([...r.grupos.forte, ...r.grupos.revisar].some((p) => p.nome === 'Rui Campos'), JSON.stringify(r.grupos));
  assert.ok(!r.limitacoes.some((l) => /só com o nome da organização/.test(l)));
  assert.equal((await socio.chamar('GET', '/api/rede')).json().resumo.semCnpj, 0);
  assert.deepEqual((await socio.chamar('GET', '/api/rede/pessoas?lado=mercado&semEmpresa=1')).json().pessoas, []);
});

test('nome entre aspas e com abreviatura ainda é nome', () => {
  const trechos = (pedido) => interpretarPedido(pedido).candidatos.map((c) => c.palavras.map((x) => x.t).join(' '));
  assert.deepEqual(trechos("Quem decide na ''Mario A. Lussari & Cia. Ltda.''"), ['mario a lussari cia ltda']);
  assert.deepEqual(trechos('Quem decide na "Química Alfa", com mais de 20 anos'), ['quimica alfa'], 'a vírgula e a aspa fecham o nome');
  assert.deepEqual(trechos("Diretores da 'Alfa'"), ['alfa'], 'a aspa de fechamento não gruda no nome');
});

test('município negado ou em alternativa não vira sede obrigatória (tese e find)', async (t) => {
  const regras = (tese, opcoes) => interpretarTese(tese, { referencia: REF, ...opcoes });
  const municipios = new Set(['campinas', 'osasco', 'sorocaba', 'santos', 'niteroi']);
  const sede = (texto) => regras(texto, { municipios }).criterios.filter((c) => /^municipio/.test(c.regra?.campo ?? ''));
  const confere = (c, cidade) => verificarCadastro(c.regra, { cidade, uf: 'SP' }, REF).veredito;

  for (const texto of ['Distribuidoras fora de Campinas', 'Distribuidoras exceto em Campinas']) {
    const r = regras(texto, { municipios });
    assert.deepEqual(r.criterios.map((c) => [c.texto, c.regra?.campo, c.regra?.valor]), [['Sede fora de Campinas', 'municipio_fora', ['Campinas']]], texto);
    assert.equal(confere(r.criterios[0], 'CAMPINAS'), 'nao_atende');
    assert.equal(confere(r.criterios[0], 'SANTOS'), 'atende');
  }
  for (const texto of ['Distribuidoras em Campinas ou em Osasco', 'Distribuidoras em Campinas ou Osasco']) {
    const [c, ...resto] = sede(texto);
    assert.deepEqual([c.texto, c.regra.campo, c.regra.valor, resto.length], ['Sede em Campinas ou Osasco', 'municipios', ['Campinas', 'Osasco'], 0], texto);
    assert.equal(confere(c, 'OSASCO'), 'atende');
    assert.equal(confere(c, 'SANTOS'), 'nao_atende');
  }
  assert.deepEqual(sede('Distribuidoras em Campinas, Osasco e Sorocaba').map((c) => c.texto), ['Sede em Campinas, Osasco ou Sorocaba']);
  assert.deepEqual(sede('Distribuidoras em Campinas e com mais de 20 anos').map((c) => c.regra.valor), ['Campinas'], '"e com" não é outra cidade');
  assert.deepEqual(interpretarPedido('Quem decide nas distribuidoras fora de Campinas', { municipios }).criterios.map((c) => c.regra?.campo), ['municipio_fora']);

  const { usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const buscar = async (pedido) => { const r = await socio.chamar('POST', '/api/encontrar', { pedido }); assert.equal(r.statusCode, 200, r.body); return r.json(); };
  let r = await buscar('Quem decide nas distribuidoras fora de Campinas');
  assert.deepEqual(r.leitura.criterios.map((c) => c.texto), ['Sede fora de Campinas']);
  assert.equal(r.funil.nosCriterios, 2, 'Santos e Niterói');
  r = await buscar('Quem decide nas distribuidoras em Campinas ou em Santos');
  assert.deepEqual(r.leitura.criterios.map((c) => c.texto), ['Sede em Campinas ou Santos']);
  assert.equal(r.funil.nosCriterios, 3);
});
