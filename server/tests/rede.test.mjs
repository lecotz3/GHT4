import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';
import { caminhosDeAcesso } from '../src/rede/caminhos.mjs';
import { categoriaDoCaminho } from '../src/rede/contratos.mjs';

const senha = 'Senha restrita aos testes 2026!';
const empresa = { id: 'cnpj12345678', nome: 'Química Alfa', razaoSocial: 'Química Alfa Ltda',
  cnpjRaiz: '12345678', uf: 'SP', cidade: 'Campinas', estado: 'provavel', referencia: '2026-08', receita: null };
const catalogo = { buscar: async () => ({ empresas: [empresa], total: 1, referencia: '2026-08', hash: 'hash-teste' }),
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
  async function ligar(a, b, dados = {}) {
    const r = await socio.chamar('POST', '/api/rede/vinculos', {
      id: randomUUID(), pessoaAId: a.id, pessoaBId: b.id, tipo: 'trabalharam_juntos', forca: 'direta',
      evidencia: 'Registrado por quem conhece a relação.', ...dados });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().vinculo;
  }
  async function trabalho() {
    const r = await socio.chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Prospecção química' });
    assert.equal(r.statusCode, 201, r.body);
    return r.json().conversa;
  }
  const naEmpresa = (nome, cargo, senioridade) => pessoa({ lado: 'mercado', nome, cargo, senioridade,
    organizacao: 'Química Alfa', empresaId: empresa.id });
  const daCasa = (nome, cargo = '') => pessoa({ lado: 'ght4', nome, cargo });

  async function mapear(c, versao = 0) {
    const r = await socio.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`,
      { chave: randomUUID(), versao, tarefa: 'mapear_acesso', texto: '', contexto: { empresaId: empresa.id } });
    assert.equal(r.statusCode, 200, r.body);
    return r.json().turno.resultado;
  }
  return { db, app, anonimo, usuario, socio, pessoa, ligar, trabalho, naEmpresa, daCasa, mapear };
}

const bloco = (r, titulo) => r.blocos.find((b) => b.titulo.startsWith(titulo));

test('a categoria de um caminho vem da sua ligação menos comprovada', () => {
  assert.equal(categoriaDoCaminho(['posso_apresentar']), 'introducao_viavel');
  assert.equal(categoriaDoCaminho(['posso_apresentar', 'posso_apresentar']), 'introducao_viavel');
  // Oferecer a apresentação só vale se a disposição alcança a cadeia inteira.
  assert.equal(categoriaDoCaminho(['posso_apresentar', 'conheco']), 'relacao_confirmada');
  assert.equal(categoriaDoCaminho(['conheco', 'nao_confirmado']), 'a_confirmar');
  assert.equal(categoriaDoCaminho(['posso_apresentar', 'nao_intermediar']), 'incompleto');
  assert.equal(categoriaDoCaminho(['conheco', 'desatualizado']), 'incompleto');
  assert.equal(categoriaDoCaminho([]), 'incompleto');
});

test('os caminhos saem ordenados por categoria, e a pontuação só desempata dentro dela', async (t) => {
  const { socio, ligar, naEmpresa, daCasa } = await montar(t);
  const ana = await daCasa('Ana Ribeiro', 'Sócia');
  const bruno = await daCasa('Bruno Dias', 'Analista');
  const ceo = await naEmpresa('Carlos Nunes', 'CEO', 'ceo');
  const gerente = await naEmpresa('Dora Lima', 'Gerente de compras', 'gerencia');

  // CEO com vínculo fraco e por confirmar; gerência com vínculo direto e apresentação oferecida.
  await ligar(ana, ceo, { tipo: 'evento', forca: 'fraca', evidencia: 'Trocaram cartões no congresso da Abiquim de 2024.' });
  await ligar(bruno, gerente, { forca: 'direta', periodo: '2015-2019', disposicao: 'posso_apresentar',
    evidencia: 'Mesma equipe de suprimentos na Petroquímica Sul.' });

  const r = (await socio.chamar('GET', `/api/rede/caminhos?empresaId=${empresa.id}`)).json();
  assert.equal(r.caminhos.length, 2);
  assert.equal(r.pessoasConhecidas, 2);
  assert.equal(r.lideresConhecidos, 1, 'gerência não conta como alta liderança');

  const [primeiro, segundo] = r.caminhos;
  assert.equal(primeiro.categoria, 'introducao_viavel');
  assert.equal(primeiro.alvo.nome, 'Dora Lima');
  assert.equal(primeiro.saltos, 1);
  assert.equal(primeiro.intermediario, null);
  assert.deepEqual(primeiro.parcelas, { senioridade: 1, vinculo: 5, confirmacao: 2, ligacoes: 0 });
  assert.equal(primeiro.pontuacao, 8);
  assert.match(primeiro.porque, /Ana Ribeiro|Bruno Dias/);
  assert.match(primeiro.ressalvas.join(' '), /fora da alta liderança/);

  // O CEO pontua mais alto em cargo, mas a categoria vem antes da pontuação.
  assert.equal(segundo.categoria, 'a_confirmar');
  assert.equal(segundo.alvo.nome, 'Carlos Nunes');
  assert.equal(segundo.pontuacao, 6);
  assert.match(segundo.ressalvas.join(' '), /ainda não foi confirmada pelo titular/);
  assert.match(segundo.ressalvas.join(' '), /ponto em comum, não um relacionamento/);
});

test('um caminho com intermediário aparece inteiro, paga o salto e avisa que a ponte não é da casa', async (t) => {
  const { db, socio, pessoa, ligar, naEmpresa, daCasa } = await montar(t);
  const ana = await daCasa('Ana Ribeiro', 'Sócia');
  const paulo = await pessoa({ lado: 'externo', nome: 'Paulo Mendes', cargo: 'Diretor', organizacao: 'Logística Beta' });
  const renata = await naEmpresa('Renata Alves', 'Diretora financeira', 'cfo');

  await ligar(ana, paulo, { forca: 'direta', periodo: 'de 2010 a 2014', disposicao: 'conheco',
    evidencia: 'Foram colegas de diretoria na Transportes Centro.' });
  await ligar(paulo, renata, { tipo: 'relacao_comercial', forca: 'direta', disposicao: 'conheco',
    evidencia: 'Paulo atende a Química Alfa como fornecedor desde 2021.' });

  const r = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(r.caminhos.length, 1);
  const c = r.caminhos[0];
  assert.equal(c.saltos, 2);
  assert.equal(c.ght4.nome, 'Ana Ribeiro');
  assert.equal(c.intermediario.nome, 'Paulo Mendes');
  assert.equal(c.alvo.nome, 'Renata Alves');
  assert.equal(c.rota, 'Ana Ribeiro (Sócia) → Paulo Mendes (Diretor) → Renata Alves (Diretora financeira)');
  assert.equal(c.categoria, 'relacao_confirmada');
  assert.equal(c.parcelas.ligacoes, -2, 'o salto extra custa');
  assert.equal(c.pontuacao, 4 + 5 + 2 - 2);
  assert.equal(c.ligacoes.length, 2);
  assert.match(c.porque, /Foram colegas de diretoria.*Paulo atende a Química Alfa/s);
  assert.match(c.ressalvas.join(' '), /passa por Paulo Mendes, que não é da GHT4/);

  // Três ligações é longe demais: o plano para em duas.
  const distante = await pessoa({ lado: 'externo', nome: 'Sofia Rocha', organizacao: 'Outra' });
  await ligar(socio.papel ? distante : distante, ana, { forca: 'direta', evidencia: 'Conhecidos de um projeto antigo.' });
  const depois = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(depois.caminhos.length, 1, 'nenhum caminho de três ligações entrou');
  assert.match(depois.limitacoes.join(' '), /até 2 ligações/);
});

test('quem conhece e não quer intermediar mantém o vínculo, e o caminho deixa de ser oferecido', async (t) => {
  const { db, socio, ligar, naEmpresa, daCasa, trabalho, mapear } = await montar(t);
  const ana = await daCasa('Ana Ribeiro', 'Sócia');
  const ceo = await naEmpresa('Carlos Nunes', 'CEO', 'ceo');
  await ligar(ana, ceo, { forca: 'direta', disposicao: 'nao_intermediar',
    evidencia: 'Dividiram a diretoria comercial da Nordeste Química.' });

  const r = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(r.caminhos.length, 1, 'o vínculo continua existindo');
  assert.equal(r.caminhos[0].categoria, 'incompleto');
  assert.equal(r.caminhos[0].recomendavel, false);
  assert.match(r.caminhos[0].ressalvas[0], /não quer intermediar/);

  const resultado = await mapear(await trabalho());
  assert.equal(bloco(resultado, 'Caminho recomendado'), undefined, 'nada é recomendado');
  assert.equal(bloco(resultado, 'Rascunho'), undefined);
  assert.match(bloco(resultado, 'Existem, mas não são oferecidos').itens.join(' '), /não quer intermediar/);
  assert.match(resultado.resumo, /nenhum utilizável hoje/);
  assert.equal(socio.papel, 'socio');
});

test('a habilidade entrega rota, rascunho de apresentação e o que falta mapear', async (t) => {
  const { pessoa, ligar, naEmpresa, daCasa, trabalho, mapear } = await montar(t);
  const ana = await daCasa('Ana Ribeiro', 'Sócia');
  const paulo = await pessoa({ lado: 'externo', nome: 'Paulo Mendes', organizacao: 'Logística Beta' });
  const ceo = await naEmpresa('Carlos Nunes', 'CEO', 'ceo');
  await naEmpresa('Elza Prado', 'Conselheira', 'conselho');

  await ligar(ana, paulo, { forca: 'direta', disposicao: 'posso_apresentar', evidencia: 'Colegas de diretoria na Transportes Centro.' });
  await ligar(paulo, ceo, { tipo: 'relacao_comercial', forca: 'direta', disposicao: 'posso_apresentar',
    evidencia: 'Paulo fornece para a Química Alfa desde 2021.' });

  const r = await mapear(await trabalho());
  assert.equal(r.titulo, 'Caminho até a liderança — Química Alfa');
  assert.equal(r.caminhos.caminhos[0].categoria, 'introducao_viavel');

  const recomendado = bloco(r, 'Caminho recomendado').itens.join(' ');
  assert.match(recomendado, /Rota: Ana Ribeiro \(Sócia\) → Paulo Mendes → Carlos Nunes \(CEO\)/);
  assert.match(recomendado, /Por meio de: Paulo Mendes.*não é da GHT4/);
  assert.match(recomendado, /não montar e-mail por padrão de domínio/);

  // Com ponte no meio, o primeiro texto pede a apresentação em vez de fingir que ela já aconteceu.
  const rascunho = bloco(r, 'Rascunho').itens;
  assert.match(rascunho[0], /Para Paulo Mendes, pedindo a apresentação/);
  assert.match(rascunho[0], /Faria sentido você nos apresentar\?/);
  assert.match(rascunho[1], /Depois do aceite, para Carlos Nunes/);
  assert.match(rascunho.join(' '), /Não antecipe mandato, cliente, tese ou valores/);
  assert.match(rascunho.join(' '), /não move a oportunidade para "contatada"/);

  assert.match(bloco(r, 'Mapeados, mas sem ninguém que alcance').itens.join(' '), /Elza Prado/);
  assert.ok(r.fontes.some((f) => f.titulo === 'Rede de relacionamento da GHT4'
    && /não informa dirigentes/.test(f.descricao) && /Sem conexão com/.test(f.descricao)));
});

test('a habilidade exibe no máximo três caminhos e diz quantos ficaram de fora', async (t) => {
  const { ligar, naEmpresa, daCasa, trabalho, mapear } = await montar(t);
  const ceo = await naEmpresa('Carlos Nunes', 'CEO', 'ceo');
  for (const nome of ['Ana Ribeiro', 'Bruno Dias', 'Célia Matos', 'Décio Paz', 'Elis Faro']) {
    await ligar(await daCasa(nome), ceo, { forca: 'direta', disposicao: 'conheco', evidencia: `Relação registrada por ${nome}.` });
  }
  const r = await mapear(await trabalho());
  assert.equal(r.caminhos.caminhos.length, 5, 'a API devolve todos');
  const outros = bloco(r, 'Outros caminhos').itens;
  assert.equal(outros.length, 3, 'dois além do recomendado, mais o aviso');
  assert.match(outros.at(-1), /Mais 2 em Rede, fora desta lista de 3/);
});

test('empresa sem ninguém mapeado diz que a casa não mapeou, e não que não há a quem recorrer', async (t) => {
  const { socio, trabalho, mapear } = await montar(t);
  const c = await trabalho();
  const r = await mapear(c);
  assert.equal(r.caminhos.caminhos.length, 0);
  assert.match(r.resumo, /Nenhuma pessoa desta empresa está mapeada/);
  assert.match(r.resumo, /diferente de não haver relacionamento/);
  assert.match(bloco(r, 'A casa ainda não mapeou').itens.join(' '), /não que não haja a quem recorrer/);

  const semEmpresa = await socio.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`,
    { chave: randomUUID(), versao: 1, tarefa: 'mapear_acesso', texto: '', contexto: { empresaId: null } });
  assert.equal(semEmpresa.statusCode, 200, semEmpresa.body);
  assert.match(semEmpresa.json().turno.resultado.titulo, /Escolha a empresa/);
});

test('empresa marcada como não contatar não recebe sugestão de caminho nenhuma', async (t) => {
  const { db, socio, ligar, naEmpresa, daCasa, trabalho, mapear } = await montar(t);
  const ana = await daCasa('Ana Ribeiro', 'Sócia');
  const ceo = await naEmpresa('Carlos Nunes', 'CEO', 'ceo');
  await ligar(ana, ceo, { forca: 'direta', disposicao: 'posso_apresentar', evidencia: 'Dividiram a diretoria comercial da Nordeste Química.' });

  const c = await trabalho();
  await db.query(`INSERT INTO crm_restricoes_contato (escopo,empresa_id,ativa,categoria,motivo,usuario_id)
    VALUES ($1,$2,true,'solicitacao_da_empresa','A empresa pediu para não ser procurada neste ciclo.',$3)`,
  [`usuario:${socio.id}`, empresa.id, socio.id]);

  const r = await mapear(c);
  assert.match(r.titulo, /^Não contatar/);
  assert.equal(r.caminhos.caminhos.length, 0, 'nenhum caminho vaza junto com o aviso');
  assert.equal(r.caminhos.semCaminho.length, 0);
  assert.equal(bloco(r, 'Rascunho'), undefined);
  assert.match(r.blocos[0].itens.join(' '), /pediu para não ser procurada/);

  // Sem escopo consultável, o resultado não inventa que a restrição não existe.
  const semEscopo = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(semEscopo.restricao, null);
  assert.equal(semEscopo.caminhos.length, 1);
});

test('quem não pode ver contato recebe a pessoa sem e-mail e telefone, e sabe que eles existem', async (t) => {
  const { socio, usuario, pessoa, ligar, daCasa } = await montar(t);
  const casa = await daCasa('Ana Ribeiro', 'Sócia');
  const cfo = await pessoa({ lado: 'mercado', nome: 'Carlos Nunes', cargo: 'CFO', senioridade: 'cfo',
    organizacao: 'Química Alfa', empresaId: empresa.id, email: 'carlos@alfa.example', telefone: '+55 19 99999-0000' });
  await ligar(casa, cfo, { tipo: 'relacao_comercial', forca: 'direta', evidencia: 'Fornecedor comum durante a integração da Beta.' });

  const doSocio = (await socio.chamar('GET', `/api/rede/caminhos?empresaId=${empresa.id}`)).json();
  assert.equal(doSocio.caminhos[0].alvo.email, 'carlos@alfa.example');
  assert.deepEqual(doSocio.caminhos[0].alvo.camposOmitidos, []);

  const analista = await usuario('analista@teste.local', 'analista');
  const dele = (await analista.chamar('GET', `/api/rede/caminhos?empresaId=${empresa.id}`)).json();
  const alvo = dele.caminhos[0].alvo;
  assert.equal(alvo.nome, 'Carlos Nunes', 'o caminho continua visível');
  assert.equal(alvo.email, undefined);
  assert.equal(alvo.telefone, undefined);
  assert.deepEqual(alvo.camposOmitidos.sort(), ['email', 'telefone']);

  const lista = await analista.chamar('GET', '/api/rede/pessoas?lado=mercado');
  assert.equal(lista.headers['cache-control'], 'no-store');
  assert.equal(lista.json().pessoas[0].email, undefined);
});

test('a rede recusa par repetido, pessoa inexistente, evidência curta e papel sem permissão', async (t) => {
  const { anonimo, socio, usuario, pessoa, daCasa } = await montar(t);
  const casa = await daCasa('Ana Ribeiro');
  const alvo = await pessoa({ lado: 'mercado', nome: 'Carlos Nunes', organizacao: 'Química Alfa' });
  const base = { pessoaAId: casa.id, pessoaBId: alvo.id, tipo: 'indicacao', forca: 'indireta',
    evidencia: 'Apresentados por um cliente comum em 2025.' };
  const criar = (corpo) => socio.chamar('POST', '/api/rede/vinculos', { id: randomUUID(), ...corpo });

  assert.equal((await criar(base)).statusCode, 201);
  assert.equal((await criar(base)).statusCode, 409, 'o mesmo par e tipo não entra duas vezes');
  // Conhecer é recíproco: inverter a ordem do formulário não cria um segundo vínculo.
  assert.equal((await criar({ ...base, pessoaAId: alvo.id, pessoaBId: casa.id })).statusCode, 409);
  assert.equal((await criar({ ...base, pessoaBId: randomUUID() })).statusCode, 404);
  assert.equal((await criar({ ...base, pessoaBId: casa.id })).statusCode, 422, 'vínculo consigo');
  assert.equal((await criar({ ...base, evidencia: 'curta' })).statusCode, 422, 'evidência é obrigatória');

  assert.equal((await socio.chamar('POST', '/api/rede/pessoas', { id: randomUUID(), lado: 'mercado', nome: 'Sem casa' })).statusCode, 422);
  assert.equal((await socio.chamar('POST', '/api/rede/pessoas', { id: randomUUID(), lado: 'ght4', nome: 'Da casa', empresaId: empresa.id })).statusCode, 422);

  for (const [method, url] of [['GET', '/api/rede'], ['GET', '/api/rede/pessoas'], ['POST', '/api/rede/pessoas'], ['GET', '/api/rede/caminhos?nome=alfa']]) {
    assert.equal((await anonimo(method, url)).statusCode, 401, url);
  }
  for (const papel of ['analista', 'leitura']) {
    const u = await usuario(`${papel}@teste.local`, papel);
    assert.equal((await u.chamar('GET', '/api/rede/pessoas')).statusCode, 200, papel);
    assert.equal((await u.chamar('POST', '/api/rede/pessoas', { id: randomUUID(), lado: 'ght4', nome: 'X Y' })).statusCode, 403, papel);
    assert.equal((await u.chamar('POST', '/api/rede/vinculos', { id: randomUUID(), ...base })).statusCode, 403, papel);
  }
});

test('o banco guarda o par sempre ordenado, mesmo sem passar pela rota', async (t) => {
  const { db, socio, pessoa, daCasa } = await montar(t);
  const casa = await daCasa('Ana Ribeiro');
  const alvo = await pessoa({ lado: 'mercado', nome: 'Carlos Nunes', organizacao: 'Química Alfa' });
  const [menor, maior] = casa.id < alvo.id ? [casa.id, alvo.id] : [alvo.id, casa.id];
  const inserir = (a, b) => db.query(
    `INSERT INTO rede_vinculos (id,pessoa_a_id,pessoa_b_id,tipo,forca,evidencia,criado_por)
     VALUES ($1,$2,$3,'outro','fraca','Inserção direta no banco.',$4)`, [randomUUID(), a, b, socio.id]);
  await inserir(menor, maior);
  await assert.rejects(inserir(maior, menor), /par_ordenado|violates/i);
});

test('a resposta do titular muda a categoria, e desativar tira o caminho sem apagar a pessoa', async (t) => {
  const { db, socio, ligar, naEmpresa, daCasa } = await montar(t);
  const ana = await daCasa('Ana Ribeiro');
  const ceo = await naEmpresa('Carlos Nunes', 'CEO', 'ceo');
  const v = await ligar(ana, ceo, { forca: 'direta', evidencia: 'Dividiram a diretoria comercial da Nordeste Química.' });
  assert.equal(v.disposicao, 'nao_confirmado');
  assert.equal(v.confirmado_em, null);

  const antes = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(antes.caminhos[0].categoria, 'a_confirmar');
  assert.equal(antes.caminhos[0].pontuacao, 10);

  const corpo = { versao: v.versao, forca: 'direta', periodo: '2012-2016',
    evidencia: 'Dividiram a diretoria comercial da Nordeste Química.', disposicao: 'posso_apresentar' };
  const confirmado = await socio.chamar('PATCH', `/api/rede/vinculos/${v.id}`, corpo);
  assert.equal(confirmado.statusCode, 200, confirmado.body);
  const depois = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(depois.caminhos[0].categoria, 'introducao_viavel');
  assert.equal(depois.caminhos[0].pontuacao, 12);
  assert.equal(depois.caminhos[0].ligacoes[0].confirmadoPor, socio.nome);
  assert.deepEqual(depois.caminhos[0].ressalvas, []);

  assert.equal((await socio.chamar('PATCH', `/api/rede/vinculos/${v.id}`, corpo)).statusCode, 409, 'versão antiga não sobrescreve');

  const solto = await socio.chamar('PATCH', `/api/rede/vinculos/${v.id}`,
    { ...corpo, versao: confirmado.json().vinculo.versao, disposicao: 'desatualizado' });
  assert.equal(solto.statusCode, 200, solto.body);
  const stale = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(stale.caminhos[0].categoria, 'incompleto');
  assert.match(stale.caminhos[0].ressalvas.join(' '), /desatualizada/);

  const desativado = await socio.chamar('PATCH', `/api/rede/vinculos/${v.id}`,
    { ...corpo, versao: solto.json().vinculo.versao, disposicao: 'conheco', ativo: false });
  assert.equal(desativado.statusCode, 200, desativado.body);
  const semVinculo = await caminhosDeAcesso(db, { empresaId: empresa.id });
  assert.equal(semVinculo.caminhos.length, 0);
  assert.equal(semVinculo.semCaminho.length, 1, 'o CEO continua mapeado, agora como lacuna');
});

test('a organização localiza a empresa pelo nome normalizado, e uma grafia diferente não se encontra sozinha', async (t) => {
  const { db, pessoa, ligar, daCasa } = await montar(t);
  const ana = await daCasa('Ana Ribeiro');
  const alvo = await pessoa({ lado: 'mercado', nome: 'Carlos Nunes', cargo: 'CFO', senioridade: 'cfo', organizacao: 'QUÍMICA ALFA' });
  await ligar(ana, alvo, { tipo: 'formacao', forca: 'indireta', evidencia: 'Mesma turma de engenharia química na Unicamp.' });

  assert.equal((await caminhosDeAcesso(db, { nomeEmpresa: 'Quimica Alfa' })).caminhos.length, 1, 'acento e caixa não separam a mesma empresa');
  assert.equal((await caminhosDeAcesso(db, { nomeEmpresa: 'Alfa Química Ltda' })).caminhos.length, 0);
  assert.match((await caminhosDeAcesso(db, { nomeEmpresa: 'Quimica Alfa' })).limitacoes.join(' '), /Grafias diferentes/);
});

test('toda escrita na rede deixa rastro na auditoria', async (t) => {
  const { db, socio, pessoa, ligar, daCasa } = await montar(t);
  const ana = await daCasa('Ana Ribeiro');
  const ceo = await pessoa({ lado: 'mercado', nome: 'Carlos Nunes', organizacao: 'Química Alfa' });
  const v = await ligar(ana, ceo, { tipo: 'conselho', forca: 'indireta', evidencia: 'Dividiram o conselho da associação setorial em 2023.' });

  const trilha = (await db.query(
    `SELECT entidade, entidade_id, acao, usuario_id, justificativa FROM auditoria
      WHERE entidade IN ('rede_pessoa','rede_vinculo') ORDER BY ocorrido_em, id`)).rows;
  assert.deepEqual(trilha.map((l) => `${l.entidade}:${l.acao}`), ['rede_pessoa:criar', 'rede_pessoa:criar', 'rede_vinculo:criar']);
  assert.ok(trilha.every((l) => l.usuario_id === socio.id));
  assert.match(trilha.at(-1).justificativa, /associação setorial/);
  assert.equal(trilha.at(-1).entidade_id, v.id);

  await socio.chamar('PATCH', `/api/rede/vinculos/${v.id}`, { versao: v.versao, forca: 'indireta',
    evidencia: 'Dividiram o conselho da associação setorial em 2023.', disposicao: 'nao_intermediar' });
  const confirmacao = (await db.query(
    "SELECT acao, antes, depois FROM auditoria WHERE entidade='rede_vinculo' ORDER BY ocorrido_em DESC, id DESC LIMIT 1")).rows[0];
  assert.equal(confirmacao.acao, 'confirmar');
  assert.equal(confirmacao.antes.disposicao, 'nao_confirmado');
  assert.equal(confirmacao.depois.disposicao, 'nao_intermediar');
});
