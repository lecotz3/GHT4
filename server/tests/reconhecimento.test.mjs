import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';
import { caminhosDeAcesso } from '../src/rede/caminhos.mjs';
import { qualificacao, importavel } from '../src/rede/qualificacoes.mjs';
import { pessoasDoQuadro } from '../../ferramentas/importar-quadro-societario.mjs';

const senha = 'Senha restrita aos testes 2026!';
const empresa = { id: 'cnpj12345678', nome: 'Química Alfa', razaoSocial: 'Química Alfa Ltda',
  cnpjRaiz: '12345678', uf: 'SP', cidade: 'Campinas', estado: 'provavel', referencia: '2026-08', receita: null };
const catalogo = { buscar: async () => ({ empresas: [empresa], total: 1, referencia: '2026-08', hash: 'h' }),
  obter: async (id) => id === empresa.id ? empresa : null };

async function montar(t) {
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo });
  t.after(async () => { await app.close(); await db.close(); });
  const anonimo = (method, url, payload) => app.inject({ method, url, payload });
  async function usuario(email, papel) {
    const u = await criarUsuario(db, { email, papel, senha });
    const r = await anonimo('POST', '/api/sessao', { email, senha });
    assert.equal(r.statusCode, 200, r.body);
    const cookie = r.headers['set-cookie'].split(';')[0];
    return { ...u, chamar: (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } }) };
  }
  const socio = await usuario('socio@teste.local', 'socio');
  async function pessoa(dados) {
    const r = await socio.chamar('POST', '/api/rede/pessoas', { id: randomUUID(), ...dados });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().pessoa;
  }
  const naEmpresa = (nome, cargo, senioridade = 'outro') => pessoa({ lado: 'mercado', nome, cargo, senioridade,
    organizacao: 'Química Alfa', empresaId: empresa.id });
  const responder = (corpo) => socio.chamar('POST', '/api/rede/reconhecimento', { id: randomUUID(), ...corpo });
  async function trabalho() {
    const r = await socio.chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Prospecção' });
    return r.json().conversa;
  }
  async function mapear(c, versao = 0) {
    const r = await socio.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`,
      { chave: randomUUID(), versao, tarefa: 'mapear_acesso', texto: '', contexto: { empresaId: empresa.id } });
    assert.equal(r.statusCode, 200, r.body);
    return r.json().turno.resultado;
  }
  return { db, anonimo, usuario, socio, pessoa, naEmpresa, responder, trabalho, mapear };
}

const bloco = (r, titulo) => r.blocos.find((b) => b.titulo.startsWith(titulo));

test('a qualificação da Receita vira cargo e senioridade, e menor de idade nunca entra', () => {
  assert.deepEqual(qualificacao('49'), { cargo: 'Sócio-administrador', senioridade: 'ceo', conhecida: true });
  assert.equal(qualificacao('10').senioridade, 'diretoria');
  assert.equal(qualificacao('08').senioridade, 'conselho');
  assert.equal(qualificacao('16').senioridade, 'ceo');
  assert.equal(qualificacao('22').senioridade, 'conselho');

  // Código novo da RFB entra conservador, com o código à vista, sem palpite de cargo.
  const desconhecida = qualificacao('99');
  assert.equal(desconhecida.conhecida, false);
  assert.equal(desconhecida.senioridade, 'outro');
  assert.match(desconhecida.cargo, /99/);

  // Lista de prospecção comercial não é lugar para menor nem para incapaz.
  for (const c of ['29', '30', '58', '67']) assert.equal(importavel(c), false, c);
  for (const c of ['17', '63', '20']) assert.equal(importavel(c), false, `${c} não é decisor`);
  for (const c of ['49', '10', '22', '99']) assert.equal(importavel(c), true, c);
  assert.equal(qualificacao(49).senioridade, 'ceo', 'número ou texto dá o mesmo resultado');
});

test('o quadro societário vira roster, descartando PJ, incapaz e nome ausente', () => {
  const socio = (nome, q, tipo = 'fisica') => ({ tipo, nome, qualificacao: q, entrada: '2009-03-11' });
  const r = pessoasDoQuadro({ id: 'cnpj12345678', nome: 'Química Alfa', socios: [
    socio('CARLOS NUNES', '49'),
    socio('ELZA PRADO', '08'),
    socio('BETA HOLDING LTDA', '48', 'juridica'),
    socio('MENOR PROTEGIDO', '30'),
    socio('', '49'),
  ] }, '2026-08');

  assert.equal(r.pessoas.length, 2);
  assert.deepEqual(r.pessoas.map((p) => p.nome), ['CARLOS NUNES', 'ELZA PRADO']);
  assert.equal(r.pessoas[0].senioridade, 'ceo');
  assert.equal(r.pessoas[0].empresaId, 'cnpj12345678');
  assert.equal(r.pessoas[0].nomeNormalizado, 'carlos nunes');
  assert.match(r.pessoas[0].referencia, /RFB CNPJ 2026-08 · qualificação 49 · no quadro desde 2009-03-11/);

  assert.equal(r.descartes.length, 3);
  assert.match(r.descartes.map((d) => d.motivo).join(' '), /pessoa jurídica/);
  assert.match(r.descartes.map((d) => d.motivo).join(' '), /menor/i);

  // Faixa etária existe na fonte e não pode vazar para o registro.
  const bruto = JSON.stringify(r.pessoas);
  assert.ok(!/faixa/i.test(bruto), 'idade de sócio não entra na rede');
});

test('a passada mostra quem decide primeiro e some da fila depois de respondida', async (t) => {
  const { db, socio, pessoa, naEmpresa, responder } = await montar(t);
  // Quem responde precisa existir na rede, ligado à conta.
  const eu = await pessoa({ lado: 'ght4', nome: 'Ana Ribeiro', cargo: 'Sócia', usuarioId: socio.id });
  const ceo = await naEmpresa('Carlos Nunes', 'Sócio-administrador', 'ceo');
  const gerente = await naEmpresa('Dora Lima', 'Gerente', 'gerencia');
  const diretor = await naEmpresa('Renata Alves', 'Diretora', 'diretoria');

  const fila = (await socio.chamar('GET', `/api/rede/reconhecimento?empresaId=${empresa.id}`)).json();
  assert.equal(fila.quem.id, eu.id, 'reconhece quem está respondendo pela conta');
  assert.deepEqual(fila.pendentes.map((p) => p.nome), ['Carlos Nunes', 'Renata Alves', 'Dora Lima'],
    'ordem por poder de decisão, não pelo banco');
  assert.equal(fila.total, 3);
  assert.equal(fila.respondidas, 0);
  assert.equal(fila.cobertura, 0);

  const r = await responder({ pessoaAlvoId: ceo.id, resposta: 'posso_apresentar', forca: 'direta',
    evidencia: 'Dividiram a diretoria comercial da Nordeste Química.' });
  assert.equal(r.statusCode, 201, r.body);
  assert.ok(r.json().reconhecimento.vinculo_id, 'resposta positiva cria o vínculo');

  const depois = (await socio.chamar('GET', `/api/rede/reconhecimento?empresaId=${empresa.id}`)).json();
  assert.deepEqual(depois.pendentes.map((p) => p.nome), ['Renata Alves', 'Dora Lima'], 'não pergunta de novo');
  assert.equal(depois.respondidas, 1);
  assert.equal(depois.cobertura, 33);

  // E o caminho existe, com a categoria que a resposta implica.
  const caminhos = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(caminhos.caminhos.length, 1);
  assert.equal(caminhos.caminhos[0].categoria, 'introducao_viavel');
  assert.equal(caminhos.caminhos[0].alvo.nome, 'Carlos Nunes');
  assert.equal(gerente.nome, 'Dora Lima');
  assert.equal(diretor.senioridade, 'diretoria');
});

test('"não conheço" é registrado, não vira vínculo, e distingue não apurado de sem caminho', async (t) => {
  const { db, socio, pessoa, naEmpresa, responder, trabalho, mapear } = await montar(t);
  await pessoa({ lado: 'ght4', nome: 'Ana Ribeiro', usuarioId: socio.id });
  const ceo = await naEmpresa('Carlos Nunes', 'Sócio-administrador', 'ceo');

  // Antes de perguntar: mapeado, não apurado.
  const c = await trabalho();
  const antes = await mapear(c);
  assert.equal(antes.caminhos.cobertura.situacao, 'nao_perguntada');
  assert.match(antes.resumo, /não apurado/);
  assert.ok(bloco(antes, 'Ninguém da casa foi perguntado ainda'));
  assert.match(bloco(antes, 'Ninguém da casa foi perguntado ainda').itens.join(' '), /Ausência de resposta não é resposta/);

  const r = await responder({ pessoaAlvoId: ceo.id, resposta: 'nao_conheco' });
  assert.equal(r.statusCode, 201, r.body);
  assert.equal(r.json().reconhecimento.vinculo_id, null, 'negativa não cria vínculo');

  const caminhos = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(caminhos.caminhos.length, 0);
  assert.equal(caminhos.cobertura.situacao, 'perguntada');
  assert.equal(caminhos.cobertura.negativas, 1);

  // Depois de perguntar: a busca por dentro da rede se esgotou, e o agente diz isso.
  const depois = await mapear(c, 1);
  assert.equal(depois.caminhos.cobertura.situacao, 'perguntada');
  assert.match(depois.resumo, /já foram perguntadas e nenhum vínculo apareceu/);
  assert.ok(bloco(depois, 'Perguntado, e sem caminho até aqui'));
  assert.equal(bloco(depois, 'Ninguém da casa foi perguntado ainda'), undefined);
});

test('empresa não mapeada continua distinta de empresa sem caminho', async (t) => {
  const { trabalho, mapear } = await montar(t);
  const r = await mapear(await trabalho());
  assert.equal(r.caminhos.cobertura.situacao, 'nao_mapeada');
  assert.ok(bloco(r, 'A casa ainda não mapeou'));
  assert.equal(bloco(r, 'Ninguém da casa foi perguntado ainda'), undefined);
  assert.equal(bloco(r, 'Perguntado, e sem caminho'), undefined);
});

test('responder de novo corrige a resposta sem duplicar pergunta nem vínculo', async (t) => {
  const { db, socio, pessoa, naEmpresa, responder } = await montar(t);
  await pessoa({ lado: 'ght4', nome: 'Ana Ribeiro', usuarioId: socio.id });
  const ceo = await naEmpresa('Carlos Nunes', 'Sócio-administrador', 'ceo');

  assert.equal((await responder({ pessoaAlvoId: ceo.id, resposta: 'nao_conheco' })).statusCode, 201);
  const segunda = await responder({ pessoaAlvoId: ceo.id, resposta: 'conheco', forca: 'indireta',
    evidencia: 'Lembrei: nos conhecemos no congresso da Abiquim.' });
  assert.equal(segunda.statusCode, 201, segunda.body);
  assert.equal(segunda.json().reconhecimento.versao, 2, 'a mesma pergunta, corrigida');

  assert.equal((await db.query('SELECT count(*)::int n FROM rede_reconhecimentos')).rows[0].n, 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM rede_vinculos')).rows[0].n, 1);
  const caminhos = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(caminhos.caminhos[0].categoria, 'relacao_confirmada');

  // Voltar para negativa desativa? Não: mantém o vínculo e muda a resposta — o
  // caminho continua auditável, e quem o retira é a disposição, não o apagamento.
  const terceira = await responder({ pessoaAlvoId: ceo.id, resposta: 'nao_conheco' });
  assert.equal(terceira.statusCode, 201, terceira.body);
  assert.equal((await db.query('SELECT count(*)::int n FROM rede_vinculos')).rows[0].n, 1);
});

test('resposta positiva sem evidência é recusada, e quem não está na rede é avisado', async (t) => {
  const { anonimo, socio, usuario, pessoa, naEmpresa, responder } = await montar(t);
  const ceo = await naEmpresa('Carlos Nunes', 'Sócio-administrador', 'ceo');

  // Sem pessoa na rede ligada à conta, a fila explica em vez de falhar.
  const fila = (await socio.chamar('GET', '/api/rede/reconhecimento')).json();
  assert.equal(fila.quem, null);
  assert.match(fila.aviso, /ainda não está cadastrado na rede/);
  assert.equal((await responder({ pessoaAlvoId: ceo.id, resposta: 'nao_conheco' })).statusCode, 422);

  await pessoa({ lado: 'ght4', nome: 'Ana Ribeiro', usuarioId: socio.id });
  assert.equal((await responder({ pessoaAlvoId: ceo.id, resposta: 'conheco', evidencia: 'curta' })).statusCode, 422);
  assert.equal((await responder({ pessoaAlvoId: ceo.id, resposta: 'posso_apresentar' })).statusCode, 422);
  assert.equal((await responder({ pessoaAlvoId: randomUUID(), resposta: 'nao_conheco' })).statusCode, 404);
  assert.equal((await responder({ pessoaAlvoId: ceo.id, resposta: 'inventada' })).statusCode, 422);
  // Negativa não precisa de evidência: não há relação a justificar.
  assert.equal((await responder({ pessoaAlvoId: ceo.id, resposta: 'nao_conheco' })).statusCode, 201);

  assert.equal((await anonimo('GET', '/api/rede/reconhecimento')).statusCode, 401);
  const leitura = await usuario('leitura@teste.local', 'leitura');
  assert.equal((await leitura.chamar('GET', '/api/rede/reconhecimento')).statusCode, 200, 'consultar é de todos');
  assert.equal((await leitura.chamar('POST', '/api/rede/reconhecimento',
    { id: randomUUID(), pessoaAlvoId: ceo.id, resposta: 'nao_conheco' })).statusCode, 403);
});

test('a resposta fica na trilha, inclusive a negativa', async (t) => {
  const { db, socio, pessoa, naEmpresa, responder } = await montar(t);
  await pessoa({ lado: 'ght4', nome: 'Ana Ribeiro', usuarioId: socio.id });
  const ceo = await naEmpresa('Carlos Nunes', 'Sócio-administrador', 'ceo');
  await responder({ pessoaAlvoId: ceo.id, resposta: 'nao_conheco' });

  const linha = (await db.query(
    "SELECT acao, depois, justificativa, usuario_id FROM auditoria WHERE entidade = 'rede_reconhecimento'")).rows[0];
  assert.equal(linha.acao, 'responder');
  assert.equal(linha.usuario_id, socio.id);
  assert.deepEqual([linha.depois.de, linha.depois.sobre, linha.depois.resposta],
    ['Ana Ribeiro', 'Carlos Nunes', 'nao_conheco']);
  assert.match(linha.justificativa, /não repetir a pergunta/);
});
