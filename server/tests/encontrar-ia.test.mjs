import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/app.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { configurarIA, criarServicoIA } from '../src/agente/provedor.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso, atestarQuadro } from './ajuda.mjs';
import { interpretarPedido } from '../src/encontrar/pedido.mjs';
import { validarLeituraIA, lerPedidoComIA } from '../src/encontrar/ia.mjs';
import { cargoTemArea, conflitosDeCargoUnico } from '../src/encontrar/triagem.mjs';

const senha = 'Senha restrita aos testes 2026!';
const REF = '2026-08';

test('papéis numa lista com "e" viram um requisito cada; com "ou", qualquer um serve', () => {
  const lista = interpretarPedido('O CEO e o diretor de RH das distribuidoras de SP');
  assert.deepEqual(lista.papel.requisitos.map((r) => r.rotulo), ['CEO ou presidente', 'Diretoria · recursos humanos']);
  assert.equal(lista.papel.rotulo, 'Um de cada: CEO ou presidente; Diretoria · recursos humanos');
  assert.ok(lista.notas.some((n) => /cada um é procurado em cada empresa/.test(n)));
  assert.equal(lista.recorte.uf, 'SP');
  assert.deepEqual(interpretarPedido('o dono e o CFO das tradings').papel.requisitos.map((r) => r.rotulo), ['Quem decide a venda', 'CFO ou financeiro']);
  assert.deepEqual(interpretarPedido('CEO, CFO e conselheiros das distribuidoras').papel.requisitos.map((r) => r.rotulo),
    ['CEO ou presidente', 'CFO ou financeiro', 'Conselho ou controlador']);
  assert.equal(interpretarPedido('CEO ou CFO das distribuidoras').papel.requisitos, null);
  assert.equal(interpretarPedido('CFOs das distribuidoras e diretores de tintas').papel.requisitos, null, 'fora de uma lista, nada muda');
  assert.equal(interpretarPedido('CFOs de distribuidoras').papel.requisitos, null);
});

test('área do cargo pela lista de nomes: "RH" atende "Recursos Humanos"', () => {
  assert.equal(cargoTemArea('Diretora de Recursos Humanos', { texto: 'de RH', area: 'rh' }), true);
  assert.equal(cargoTemArea('Diretor de Pessoas e Cultura', { texto: 'de RH', area: 'rh' }), true);
  assert.equal(cargoTemArea('Diretor Comercial', { texto: 'de RH', area: 'rh' }), false);
  assert.equal(cargoTemArea('Gerente de Vendas', { texto: 'comerciais', area: 'comercial' }), true);
  // Fora da lista, valem as palavras do pedido, como antes.
  assert.equal(cargoTemArea('Gerente de exportação', { texto: 'de exportação', area: null }), true);
});

test('as regras dizem o que não souberam ler', () => {
  const vago = interpretarPedido('chefe de pessoas das distribuidoras');
  assert.equal(vago.modo, 'regras');
  assert.ok(vago.ambiguidades.some((a) => /"chefe" parece cargo/.test(a)), vago.ambiguidades.join(' | '));
  assert.deepEqual(interpretarPedido('Quem decide nas distribuidoras de SP com mais de 20 anos').ambiguidades, []);
  assert.ok(interpretarPedido('o COO das tradings de resinas').ambiguidades.length > 0);
});

test('leitura da IA: só fica o que cita um trecho literal do pedido', () => {
  const pedido = 'Chefe de pessoas e o CEO das distribuidoras com mais de 20 anos, só se a casa conhecer';
  const l = validarLeituraIA({
    papeis: [
      { senioridades: ['diretoria', 'gerencia'], area: 'rh', trecho: 'Chefe de pessoas' },
      { senioridades: ['ceo'], area: null, trecho: 'o CEO' },
      { senioridades: ['cfo'], area: null, trecho: 'o diretor financeiro' }, // não está no pedido
      { senioridades: ['outro'], trecho: 'Chefe' }, // fora da escala: sai sozinho
      { senioridades: ['gerencia'], area: 'astrologia', trecho: 'pessoas' }, // área fora da lista
    ],
    decide: null, excluidas: [], cadaUm: true,
    acesso: { exigido: 'com_caminho', obrigatorio: true, trecho: 'só se a casa conhecer' },
    criterios: [
      { texto: 'Mais de 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 }, trecho: 'com mais de 20 anos' },
      { texto: 'Mais de 30 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 30 }, trecho: 'com mais de 20 anos' }, // número que o trecho não traz
      { texto: 'Faturamento alto', obrigatorio: true, tipo: 'pesquisa', trecho: 'faturamento acima de 100 milhões' }, // inventado
      'lixo',
    ],
    duvidas: ['"Chefe de pessoas" pode ser diretoria ou gerência.', 7],
  }, pedido);
  assert.deepEqual(l.papeis.map((p) => p.trecho), ['Chefe de pessoas', 'o CEO']);
  assert.equal(l.cadaUm, true);
  assert.deepEqual(l.acesso, { exigido: 'com_caminho', obrigatorio: true, trecho: 'só se a casa conhecer' });
  assert.deepEqual(l.criterios.map((c) => [c.id, c.regra.campo, c.regra.valor]), [['ia_1', 'idade_min', 20]]);
  assert.equal(l.descartes, 6);
  assert.deepEqual(l.duvidas, ['"Chefe de pessoas" pode ser diretoria ou gerência.']);
  assert.ok(l.notas.some((n) => /6 itens da leitura da IA foram descartados/.test(n)));
  // Um papel só não é "um de cada", diga a IA o que disser.
  assert.equal(validarLeituraIA({ papeis: [{ senioridades: ['ceo'], trecho: 'o CEO' }], cadaUm: true }, 'o CEO').cadaUm, false);
  assert.throws(() => validarLeituraIA('não é um objeto', pedido));

  // A leitura conferida substitui as regras em papel, acesso e critérios; o recorte segue das regras.
  const lido = interpretarPedido(pedido, { ia: l });
  assert.equal(lido.modo, 'ia');
  assert.deepEqual(lido.papel.requisitos.map((r) => r.rotulo), ['Diretoria ou Gerência · recursos humanos', 'CEO ou presidente']);
  assert.deepEqual(lido.papel.areas, [{ texto: 'recursos humanos', area: 'rh', senioridades: ['diretoria', 'gerencia'] }]);
  assert.equal(lido.acesso.exigido, 'com_caminho');
  assert.deepEqual(lido.criterios.map((c) => c.regra?.campo), ['idade_min']);
  assert.equal(lido.recorte.subsetor, 'Distribuição e trading químico');
  assert.deepEqual(lido.ambiguidades, []);
  assert.match(lido.notas[0], /Pedido lido com a IA/);
});

test('IA não pode omitir nem enfraquecer exigências explícitas ao resolver um cargo ambíguo', () => {
  const papeis = [{ senioridades: ['diretoria'], area: 'rh', trecho: 'Chefe de pessoas' }];
  for (const sufixo of ['sem gerentes', 'com caminho', 'com introdução viável', 'e o CFO']) {
    const pedido = `Chefe de pessoas das distribuidoras, ${sufixo}`;
    assert.throws(() => validarLeituraIA({ papeis }, pedido), { codigo: 'leitura_incompativel' }, sufixo);
  }
  // O critério de cadastro omitido pela IA não derruba a leitura: as regras o mantêm (Rodada 28).
  const idade = 'Chefe de pessoas das distribuidoras, com mais de 20 anos';
  assert.deepEqual(interpretarPedido(idade, { ia: validarLeituraIA({ papeis }, idade) }).criterios.map((c) => c.regra), [{ campo: 'idade_min', valor: 20 }]);
  assert.throws(() => validarLeituraIA({ papeis,
    acesso: { exigido: 'com_caminho', obrigatorio: false, trecho: 'com caminho' },
  }, 'Chefe de pessoas com caminho'), { codigo: 'leitura_incompativel' });
  assert.throws(() => validarLeituraIA({ papeis: [
    { senioridades: ['gerencia'], trecho: 'gerentes comerciais' },
  ] }, 'gerentes comerciais'), { codigo: 'leitura_incompativel' });
  assert.throws(() => validarLeituraIA({ papeis: [
    { senioridades: ['ceo'], trecho: 'CEO' }, { senioridades: ['cfo'], trecho: 'CFO' },
  ], cadaUm: false }, 'CEO e CFO'), { codigo: 'leitura_incompativel' });
  const pedido = 'Chefe de pessoas das distribuidoras, sem gerentes, com caminho, com mais de 20 anos';
  const aceita = validarLeituraIA({ papeis,
    excluidas: [{ senioridades: ['gerencia'], trecho: 'sem gerentes' }],
    acesso: { exigido: 'com_caminho', obrigatorio: true, trecho: 'com caminho' },
    criterios: [{ texto: 'Mais de 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 }, trecho: 'mais de 20 anos' }],
  }, pedido);
  const lida = interpretarPedido(pedido, { ia: aceita });
  assert.deepEqual(lida.papel.excluidas, ['gerencia']);
  assert.equal(lida.acesso.obrigatorio, true);
  assert.equal(lida.criterios[0].regra.valor, 20);
});

test('cargo único com dois ocupantes: o quadro estatutário prevalece', () => {
  const p = (id, nome, cargo, senioridade, origem, empresa = 'cnpj1') => ({ id, nome, cargo, senioridade, origem, empresa_id: empresa,
    quadro: origem === 'cadastro_publico' ? { nome, cargo, senioridade, empresaId: empresa } : null });
  const linhas = conflitosDeCargoUnico([
    p('a', 'Caio Dias', 'Diretor-presidente', 'ceo', 'cadastro_publico'),
    p('b', 'Bruno Melo', 'CEO', 'ceo', 'importacao'),
    p('c', 'Rita Alves', 'Sócia-administradora', 'ceo', 'cadastro_publico'), // não é cargo único
    p('d', 'Ana Costa', 'Presidente', 'ceo', 'cadastro_publico', 'cnpj2'),
    p('e', 'Ana  Costa', 'CEO', 'ceo', 'manual', 'cnpj2'), // a mesma pessoa, escrita de outro jeito
    p('f', 'Davi Luz', 'CFO', 'cfo', 'importacao', 'cnpj3'),
    p('g', 'Eva Rios', 'Diretora financeira', 'cfo', 'manual', 'cnpj3'),
    p('h', 'Ivo Paz', 'Presidente', 'ceo', 'cadastro_publico', 'cnpj4'),
    p('i', 'Leo Paz', 'Presidente', 'ceo', 'cadastro_publico', 'cnpj4'), // dois do quadro: o quadro é a fonte
    p('j', 'Mia Sol', 'Vice-presidente', 'ceo', 'manual', 'cnpj4'),
  ]);
  assert.deepEqual([...linhas.keys()].sort(), ['a', 'b', 'f', 'g']);
  assert.deepEqual([linhas.get('a').julgamento, linhas.get('a').obrigatorio], ['atende', false]);
  assert.match(linhas.get('a').informacao, /Bruno Melo como presidente ou CEO\. Vale o quadro estatutário/);
  assert.deepEqual([linhas.get('b').julgamento, linhas.get('b').obrigatorio], ['indicio', true]);
  assert.match(linhas.get('b').informacao, /quadro estatutário registra Caio Dias/);
  assert.match(linhas.get('f').informacao, /Eva Rios também aparece como diretor financeiro ou CFO/);
});

async function montar(t, { servicoIA = null, catalogo: envolver = (c) => c } = {}) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-encontrar-ia-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'base.js');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const empresa = (raiz, nome, cidade, uf, abertura) => [`cnpj${raiz}`, nome, `${nome} Ltda`, raiz, cidade, uf, '4684299', [], '02', '2062',
    500000, '05', abertura, 1, [uf], 2, 0, false, { email: `contato@${raiz}.com.br`, telefone: '(11) 0000-0000' }];
  const linhas = [
    empresa('11111111', 'Alfa Química', 'Campinas', 'SP', '1990-01-01'),
    empresa('22222222', 'Beta Química', 'Santos', 'SP', '1992-01-01'),
    empresa('33333333', 'Gama Química', 'Niterói', 'RJ', '1995-01-01'),
  ];
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${REF}";`);
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo: envolver(criarCatalogo({ arquivo, arquivoIbama: null })), servicoIA: servicoIA ? servicoIA(db) : null });
  t.after(async () => { await app.close(); await db.close(); });
  const u = await criarUsuario(db, { email: 'socio@teste.local', papel: 'socio', senha, nome: 'Helena Sócia' });
  const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email: 'socio@teste.local', senha } });
  const cookie = r.headers['set-cookie'].split(';')[0];
  const socio = { ...u, chamar: (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } }) };
  const inserir = (nome, cargo, senioridade, empresaId, origem) => db.query(
    `INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,empresa_id,origem,origem_referencia,criado_por)
     VALUES ($1,'mercado',$2,lower($2),$3,$4,'x','x',$5,$6,'Fonte do teste',$7)`, [randomUUID(), nome, cargo, senioridade, empresaId, origem, u.id]).then(() => atestarQuadro(db));
  // Alfa: presidente no quadro e um "CEO" de lista (conflito), e a diretora de RH. Beta: só o presidente.
  await inserir('Caio Dias', 'Diretor-presidente', 'ceo', 'cnpj11111111', 'cadastro_publico');
  await inserir('Bruno Melo', 'CEO', 'ceo', 'cnpj11111111', 'importacao');
  await inserir('Rita Alves', 'Diretora de Recursos Humanos', 'diretoria', 'cnpj11111111', 'manual');
  await inserir('Otto Lima', 'Presidente', 'ceo', 'cnpj22222222', 'cadastro_publico');
  return { db, socio };
}

test('um de cada: cobertura por papel e lacunas com o que falta; conflito de cargo único vai para revisão', async (t) => {
  const { socio } = await montar(t);
  const r = (await socio.chamar('POST', '/api/encontrar', { pedido: 'O CEO e o diretor de RH das distribuidoras de SP' })).json();
  assert.deepEqual(r.cobertura, [
    { rotulo: 'CEO ou presidente', empresas: 2, pessoas: 3 },
    { rotulo: 'Diretoria · recursos humanos', empresas: 1, pessoas: 1 },
  ]);
  assert.deepEqual(r.lacunas.empresas.map((l) => [l.empresa.nome, l.faltam]), [['Beta Química', ['Diretoria · recursos humanos']]]);
  const todas = [...r.grupos.forte, ...r.grupos.revisar, ...r.grupos.excluido];
  const de = (nome) => todas.find((p) => p.nome === nome);
  assert.equal(de('Caio Dias').grupo, 'forte');
  assert.ok(de('Caio Dias').juizo.some((l) => l.requisito === 'Cargo único sem conflito' && !l.obrigatorio));
  assert.equal(de('Bruno Melo').grupo, 'revisar');
  assert.ok(de('Bruno Melo').pendencias.includes('Cargo único sem conflito'));
  assert.equal(de('Rita Alves').juizo.find((l) => l.requisito.startsWith('Área do cargo')).julgamento, 'atende');
  assert.equal(r.leitura.modo, 'regras');
  assert.deepEqual(r.ia, { disponivel: false, falha: null });
  // Sem IA configurada, pedir a leitura com IA é recusado com motivo.
  const recusa = await socio.chamar('POST', '/api/encontrar', { pedido: 'chefe de pessoas', ia: { chave: randomUUID() } });
  assert.equal(recusa.statusCode, 409);
  assert.equal(recusa.json().codigo ?? recusa.json().erro, 'ia_indisponivel');
});

test('leitura com IA: só o pedido vai ao provedor, na cota comum, idempotente pela chave, e a falha cai nas regras', async (t) => {
  const corpos = [];
  let resposta = null;
  const fetchIA = async (url, opcoes) => {
    corpos.push(JSON.parse(opcoes.body));
    if (!resposta) return new Response('falhou', { status: 500 });
    return Response.json({ choices: [{ message: { content: JSON.stringify(resposta) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  };
  const config = configurarIA({ GHT4_IA_PROVEDOR: 'groq', GROQ_API_KEY: 'chave-de-teste', GHT4_IA_PEDIDOS_USUARIO_DIA: '3' });
  const { db, socio } = await montar(t, { servicoIA: (db) => criarServicoIA(db, config, { fetchImpl: fetchIA }) });
  const pedido = 'Chefe de pessoas e o presidente das distribuidoras de SP';
  resposta = { papeis: [{ senioridades: ['diretoria'], area: 'rh', trecho: 'Chefe de pessoas' }, { senioridades: ['ceo'], area: null, trecho: 'o presidente' }],
    decide: null, excluidas: [], cadaUm: true, acesso: null, criterios: [], duvidas: ['"Chefe" pode ser gerência.'] };

  // Primeiro pelas regras: o "chefe" fica ambíguo, e a tela oferece a IA com a cota do dia.
  const regras = (await socio.chamar('POST', '/api/encontrar', { pedido })).json();
  assert.equal(regras.leitura.modo, 'regras');
  assert.ok(regras.leitura.ambiguidades.length > 0);
  assert.deepEqual({ ...regras.ia, modelo: undefined }, { disponivel: true, provedor: 'groq', modelo: undefined, gratuito: true, restantes: 3, falha: null });
  assert.equal(corpos.length, 0, 'sem o clique, nada vai à IA');

  const chave = randomUUID();
  const comIA = await socio.chamar('POST', '/api/encontrar', { pedido, ia: { chave } });
  assert.equal(comIA.statusCode, 200, comIA.body);
  const r = comIA.json();
  assert.equal(r.leitura.modo, 'ia');
  assert.deepEqual(r.leitura.ia.duvidas, ['"Chefe" pode ser gerência.']);
  assert.deepEqual(r.cobertura.map((c) => [c.rotulo, c.empresas]), [['Diretoria · recursos humanos', 1], ['CEO ou presidente', 2]]);
  assert.equal(r.ia.restantes, 2);
  // O provedor recebe o pedido e mais nada: nem pessoas, nem empresas, nem o resultado.
  assert.equal(corpos.length, 1);
  const enviado = corpos[0].messages[1].content;
  assert.deepEqual(JSON.parse(enviado), { pedido });
  for (const nome of ['Caio', 'Rita', 'Alfa', 'cnpj']) assert.ok(!enviado.includes(nome), nome);
  const exec = (await db.query("SELECT conversa_id, tarefa, estado FROM ia_execucoes")).rows;
  assert.deepEqual(exec, [{ conversa_id: null, tarefa: 'leitura_find', estado: 'concluida' }]);

  // A mesma chave não chama a IA de novo nem gasta cota.
  const repetida = (await socio.chamar('POST', '/api/encontrar', { pedido, ia: { chave } })).json();
  assert.equal(repetida.leitura.modo, 'ia');
  assert.equal(corpos.length, 1);
  assert.equal(repetida.ia.restantes, 2);
  // A mesma chave com outro pedido é recusada.
  assert.equal((await socio.chamar('POST', '/api/encontrar', { pedido: 'Outro pedido qualquer', ia: { chave } })).statusCode, 409);

  // Provedor fora do ar: a busca sai pelas regras, com o motivo, e a tentativa conta na cota.
  resposta = null;
  const falha = (await socio.chamar('POST', '/api/encontrar', { pedido, ia: { chave: randomUUID() } })).json();
  assert.equal(falha.leitura.modo, 'regras');
  assert.match(falha.ia.falha, /A IA não respondeu agora/);
  assert.match(falha.leitura.notas[0], /A IA não respondeu agora/);
  assert.equal(falha.ia.restantes, 1);

  // Leitura que não se apoia no pedido também cai nas regras.
  resposta = { papeis: [{ senioridades: ['cfo'], trecho: 'o CFO' }], criterios: [] };
  const vazia = (await socio.chamar('POST', '/api/encontrar', { pedido, ia: { chave: randomUUID() } })).json();
  assert.equal(vazia.leitura.modo, 'regras');
  assert.match(vazia.ia.falha, /não propôs nada que se apoiasse/);
  assert.equal(vazia.ia.restantes, 0);

  // Cota esgotada: nada vai ao provedor.
  const antes = corpos.length;
  const esgotada = (await socio.chamar('POST', '/api/encontrar', { pedido, ia: { chave: randomUUID() } })).json();
  assert.match(esgotada.ia.falha, /cota diária/);
  assert.equal(corpos.length, antes);
});

test('leitura incompatível volta às regras, preserva exclusão e não chama novamente no reenvio', async (t) => {
  let chamadas = 0;
  const config = configurarIA({ GHT4_IA_PROVEDOR: 'groq', GROQ_API_KEY: 'chave-de-teste' });
  const { socio } = await montar(t, { servicoIA: (db) => criarServicoIA(db, config, { fetchImpl: async () => {
    chamadas++;
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      papeis: [{ senioridades: ['ceo'], trecho: 'chefe' }],
    }) }, finish_reason: 'stop' }] });
  } }) });
  const payload = { pedido: 'chefe das distribuidoras, sem CEOs, com caminho, com mais de 20 anos', ia: { chave: randomUUID() } };
  for (let i = 0; i < 2; i++) {
    const r = await socio.chamar('POST', '/api/encontrar', payload);
    assert.equal(r.statusCode, 200, r.body);
    const resultado = r.json();
    assert.equal(resultado.leitura.modo, 'regras');
    assert.match(resultado.ia.falha, /alterou uma exigência explícita/);
    assert.deepEqual(resultado.leitura.papel.excluidas, ['ceo']);
    assert.equal(resultado.leitura.acesso.obrigatorio, true);
    assert.ok(resultado.leitura.criterios.some((c) => /20 anos/.test(c.texto)));
    assert.equal(resultado.grupos.forte.length, 0);
    assert.ok(resultado.grupos.excluido.some((p) => p.nome === 'Caio Dias'));
  }
  assert.equal(chamadas, 1);
});

test('execução sem conversa isola a mesma chave por usuário e cobra cada reserva uma vez', async (t) => {
  const db = await bancoDeTeste();
  t.after(() => db.close());
  const usuarios = await Promise.all(['um', 'dois'].map((nome) => criarUsuario(db, { email: `${nome}@teste.local` })));
  let chamadas = 0;
  const servico = criarServicoIA(db, configurarIA({ GHT4_IA_PROVEDOR: 'groq', GROQ_API_KEY: 'teste' }), {
    fetchImpl: async () => {
      chamadas++;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ papeis: [{ senioridades: ['ceo'], trecho: 'CEO' }] }) }, finish_reason: 'stop' }] });
    },
  });
  const chave = randomUUID();
  for (const u of usuarios) {
    const execucao = { usuarioId: u.id, conversaId: null, chave };
    await lerPedidoComIA(servico, 'CEO', execucao);
    await lerPedidoComIA(servico, 'CEO', execucao);
  }
  assert.equal(chamadas, 2);
  const reservas = (await db.query('SELECT usuario_id, conversa_id, tarefa FROM ia_execucoes')).rows;
  assert.equal(reservas.length, 2);
  assert.equal(new Set(reservas.map((r) => r.usuario_id)).size, 2);
  assert.ok(reservas.every((r) => r.conversa_id === null && r.tarefa === 'leitura_find'));
});

test('find de mandato confidencial recusa provedor que retém dados antes de reservar ou enviar', async (t) => {
  let chamadas = 0;
  const config = configurarIA({ GHT4_IA_PROVEDOR: 'groq', GROQ_API_KEY: 'teste' });
  const { db, socio } = await montar(t, { servicoIA: (db) => criarServicoIA(db, config, { fetchImpl: async () => { chamadas++; throw new Error('Não deveria enviar'); } }) });
  const mandato = await criarMandato(db, { codigo: 'CONF-FIND' });
  await darAcesso(db, mandato.id, socio.id, 'socio');
  const conversa = (await db.query(`INSERT INTO agente_conversas (usuario_id, mandato_id, titulo, contexto)
    VALUES ($1,$2,'Teste reservado','{}') RETURNING id`, [socio.id, mandato.id])).rows[0];
  const pesquisaId = randomUUID();
  await db.query(`INSERT INTO pesquisas_tese (id,conversa_id,usuario_id,tese,frente,filtros,criterios,meta,limite_web,catalogo_hash,referencia,funil,modo)
    VALUES ($1,$2,$3,'Distribuidoras','venda','{}','[]',20,40,$4,'2026-08','{}','regras')`, [pesquisaId, conversa.id, socio.id, 'a'.repeat(64)]);
  const r = await socio.chamar('POST', '/api/encontrar', { pesquisaId, pedido: 'chefe de pessoas', ia: { chave: randomUUID() } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().leitura.modo, 'regras');
  assert.match(r.json().ia.falha, /mandato confidencial/);
  assert.equal(chamadas, 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM ia_execucoes')).rows[0].n, 0);
});

test('28 [P1]: acesso revogado ou conta suspensa durante a espera pela IA encerra o pedido', async (t) => {
  // Ollama local: o provedor não retém dados, então a leitura do mandato confidencial vai à IA.
  const config = configurarIA({ GHT4_IA_PROVEDOR: 'ollama', GHT4_IA_MODELO: 'modelo-local' });
  let durante = async () => {};
  const { db, socio } = await montar(t, { servicoIA: (db) => criarServicoIA(db, config, { fetchImpl: async () => {
    await durante();
    return Response.json({ choices: [{ message: { content: JSON.stringify({ papeis: [{ senioridades: ['ceo'], trecho: 'chefe' }] }) }, finish_reason: 'stop' }] });
  } }) });
  const mandato = await criarMandato(db, { codigo: 'CONF-REVOGA' });
  await darAcesso(db, mandato.id, socio.id, 'socio');
  const conversa = (await db.query(`INSERT INTO agente_conversas (usuario_id, mandato_id, titulo, contexto)
    VALUES ($1,$2,'Teste reservado','{}') RETURNING id`, [socio.id, mandato.id])).rows[0];
  const pesquisaId = randomUUID();
  await db.query(`INSERT INTO pesquisas_tese (id,conversa_id,usuario_id,tese,frente,filtros,criterios,meta,limite_web,catalogo_hash,referencia,funil,modo)
    VALUES ($1,$2,$3,'Distribuidoras — segredo do mandato','venda','{}','[]',20,40,$4,'2026-08','{}','regras')`, [pesquisaId, conversa.id, socio.id, 'a'.repeat(64)]);

  // Sai do mandato enquanto a IA responde: a resposta em voo não traz a tese.
  durante = () => db.query('DELETE FROM mandato_membros WHERE mandato_id=$1 AND usuario_id=$2', [mandato.id, socio.id]);
  const revogado = await socio.chamar('POST', '/api/encontrar', { pesquisaId, pedido: 'chefe', ia: { chave: randomUUID() } });
  assert.equal(revogado.statusCode, 404, revogado.body);
  assert.equal(revogado.json().erro, 'mandato_inexistente');
  assert.doesNotMatch(revogado.body, /segredo do mandato/);

  // Conta suspensa durante a espera, fora de pesquisa: 401, sem pessoas na resposta.
  durante = () => db.query('UPDATE usuarios SET ativo=false WHERE id=$1', [socio.id]);
  const suspenso = await socio.chamar('POST', '/api/encontrar', { pedido: 'chefe das distribuidoras', ia: { chave: randomUUID() } });
  assert.equal(suspenso.statusCode, 401, suspenso.body);
  assert.doesNotMatch(suspenso.body, /Caio Dias/);
});

test('28 [P2]: cargo editado pela Rede depois da importação não ganha a precedência do quadro', async (t) => {
  const { db, socio } = await montar(t);
  const duda = randomUUID();
  // Gama: Duda veio do quadro como diretor; Ana foi cadastrada à mão como CEO.
  await db.query(`INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,empresa_id,origem,origem_referencia,criado_por)
    VALUES ($1,'mercado','Duda Reis','duda reis','Diretor','diretoria','x','x','cnpj33333333','cadastro_publico','RFB 2026-08',$2)`, [duda, socio.id]);
  await atestarQuadro(db);
  await db.query(`INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,empresa_id,origem,origem_referencia,criado_por)
    VALUES ($1,'mercado','Ana Prado','ana prado','CEO','ceo','x','x','cnpj33333333','manual','Site institucional',$2)`, [randomUUID(), socio.id]);
  // A edição passa pela rota normal da Rede, e a linha continua com origem pública.
  const editada = await socio.chamar('PATCH', `/api/rede/pessoas/${duda}`, { nome: 'Duda Reis', cargo: 'CEO', senioridade: 'ceo',
    organizacao: 'x', empresaId: 'cnpj33333333', versao: 1 });
  assert.equal(editada.statusCode, 200, editada.body);
  assert.equal((await db.query('SELECT origem FROM rede_pessoas WHERE id=$1', [duda])).rows[0].origem, 'cadastro_publico');

  const r = (await socio.chamar('POST', '/api/encontrar', { pedido: 'CEOs das distribuidoras do RJ' })).json();
  const todas = [...r.grupos.forte, ...r.grupos.revisar, ...r.grupos.excluido];
  const dela = (nome) => todas.find((p) => p.nome === nome);
  for (const nome of ['Duda Reis', 'Ana Prado']) {
    assert.equal(dela(nome).grupo, 'revisar', nome);
    const conflito = dela(nome).juizo.find((l) => l.requisito === 'Cargo único sem conflito');
    assert.equal(conflito.julgamento, 'indicio', nome);
    assert.doesNotMatch(conflito.informacao, /Vale o quadro|O quadro estatutário registra/, nome);
  }
  const fonte = dela('Duda Reis').juizo.find((l) => l.requisito === 'Cargo com fonte');
  assert.equal(fonte.julgamento, 'indicio');
  assert.match(fonte.informacao, /editado depois da importação/);
  assert.doesNotMatch(JSON.stringify(dela('Duda Reis').juizo), /Receita Federal\) · RFB/);
});

test('28 [P2]: trecho largo citado pela IA não apaga o nome da empresa nem a UF', async (t) => {
  const pedido = 'Chefe de pessoas da Alfa Química em SP';
  let trecho = 'Chefe de pessoas';
  const config = configurarIA({ GHT4_IA_PROVEDOR: 'groq', GROQ_API_KEY: 'teste' });
  const { socio } = await montar(t, { servicoIA: (db) => criarServicoIA(db, config, { fetchImpl: async () => Response.json({ choices: [{ message: {
    content: JSON.stringify({ papeis: [{ senioridades: ['gerencia'], area: 'rh', trecho }] }) }, finish_reason: 'stop' }] }) }) });
  for (trecho of ['Chefe de pessoas', pedido]) {
    const r = (await socio.chamar('POST', '/api/encontrar', { pedido, ia: { chave: randomUUID() } })).json();
    assert.equal(r.leitura.modo, 'ia', trecho);
    assert.deepEqual(r.leitura.empresas.map((e) => e.empresas.map((x) => x.nome)), [['Alfa Química']], trecho);
    assert.equal(r.leitura.recorte.uf, 'SP', trecho);
    assert.equal(r.funil.recorte, 1, trecho);
  }
  // O mesmo vale para a leitura com os nomes já conferidos (o caminho de dentro da pesquisa).
  const nomes = [{ ini: 20, fim: 32, empresas: [{ id: 'cnpj11111111', nome: 'Alfa Química' }] }];
  const ia = validarLeituraIA({ papeis: [{ senioridades: ['gerencia'], area: 'rh', trecho: pedido }] }, pedido);
  const lida = interpretarPedido(pedido, { ia, nomes });
  assert.deepEqual(lida.empresas.map((e) => e.trecho), ['Alfa Química']);
  assert.equal(lida.recorte.uf, 'SP');
  assert.deepEqual(lida.papel.senioridades, ['gerencia']);
});

test('28 [P1]: revogação durante a leitura do catálogo, depois da IA, também barra a entrega', async (t) => {
  const config = configurarIA({ GHT4_IA_PROVEDOR: 'ollama', GHT4_IA_MODELO: 'modelo-local' });
  let durante = async () => {};
  const { db, socio } = await montar(t, {
    servicoIA: (db) => criarServicoIA(db, config, { fetchImpl: async () => Response.json({ choices: [{ message: {
      content: JSON.stringify({ papeis: [{ senioridades: ['ceo'], trecho: 'chefe' }] }) }, finish_reason: 'stop' }] }) }),
    // A busca lê os municípios do catálogo depois da IA: é aí que o acesso cai.
    catalogo: (c) => ({ ...c, municipios: async () => { await durante(); return c.municipios(); } }),
  });
  const mandato = await criarMandato(db, { codigo: 'CONF-CATALOGO' });
  const conversa = (await db.query(`INSERT INTO agente_conversas (usuario_id, mandato_id, titulo, contexto)
    VALUES ($1,$2,'Teste reservado','{}') RETURNING id`, [socio.id, mandato.id])).rows[0];
  const pesquisaId = randomUUID();
  await db.query(`INSERT INTO pesquisas_tese (id,conversa_id,usuario_id,tese,frente,filtros,criterios,meta,limite_web,catalogo_hash,referencia,funil,modo)
    VALUES ($1,$2,$3,'Distribuidoras — segredo do mandato','venda','{}','[]',20,40,$4,'2026-08','{}','regras')`, [pesquisaId, conversa.id, socio.id, 'a'.repeat(64)]);
  durante = () => db.query('DELETE FROM mandato_membros WHERE mandato_id=$1 AND usuario_id=$2', [mandato.id, socio.id]);
  // Com e sem a leitura com IA: a conferência antes da entrega vale para os dois.
  for (const corpo of [{ pesquisaId, pedido: 'chefe', ia: { chave: randomUUID() } }, { pesquisaId, pedido: 'chefe' }]) {
    await darAcesso(db, mandato.id, socio.id, 'socio');
    const r = await socio.chamar('POST', '/api/encontrar', corpo);
    assert.equal(r.statusCode, 404, r.body);
    assert.doesNotMatch(r.body, /segredo do mandato/);
  }
});

test('28 [P2]: a IA não apaga a cidade que as regras reconhecem pelo catálogo, nem inverte a idade', async (t) => {
  const pedido = 'Chefe de pessoas das distribuidoras em Campinas';
  const config = configurarIA({ GHT4_IA_PROVEDOR: 'groq', GROQ_API_KEY: 'teste' });
  const { socio } = await montar(t, { servicoIA: (db) => criarServicoIA(db, config, { fetchImpl: async () => Response.json({ choices: [{ message: {
    content: JSON.stringify({ papeis: [{ senioridades: ['gerencia'], area: 'rh', trecho: 'Chefe de pessoas' }] }) }, finish_reason: 'stop' }] }) }) });
  const regras = (await socio.chamar('POST', '/api/encontrar', { pedido })).json();
  const comIA = (await socio.chamar('POST', '/api/encontrar', { pedido, ia: { chave: randomUUID() } })).json();
  assert.equal(comIA.leitura.modo, 'ia');
  assert.deepEqual(comIA.leitura.criterios.map((c) => c.texto), regras.leitura.criterios.map((c) => c.texto));
  assert.ok(comIA.leitura.criterios.some((c) => /Campinas/.test(c.texto)), JSON.stringify(comIA.leitura.criterios));
  assert.equal(comIA.funil.nosCriterios, regras.funil.nosCriterios);
  assert.equal(comIA.funil.nosCriterios, 1);

  // Na leitura conferida, a regra da idade fica com as regras mesmo que a IA cite o trecho invertido.
  const municipios = new Set(['campinas']);
  const texto = 'Chefe de pessoas das distribuidoras em Campinas com mais de 20 anos';
  const ia = { papeis: [{ senioridades: ['gerencia'], trecho: 'Chefe de pessoas' }], decide: null, excluidas: [], cadaUm: false, acesso: null,
    criterios: [{ id: 'idade_max_1', texto: 'Até 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_max', valor: 20 }, trecho: 'mais de 20 anos' }],
    duvidas: [], notas: [], descartes: 0 };
  const lida = interpretarPedido(texto, { municipios, ia });
  assert.deepEqual(lida.criterios.map((c) => c.regra).sort((a, b) => a.campo.localeCompare(b.campo)),
    [{ campo: 'idade_min', valor: 20 }, { campo: 'municipio', valor: 'Campinas' }]);
});
