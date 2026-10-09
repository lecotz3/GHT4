import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/app.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { configurarIA, criarServicoIA } from '../src/agente/provedor.mjs';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';
import { interpretarPedido } from '../src/encontrar/pedido.mjs';
import { validarLeituraIA } from '../src/encontrar/ia.mjs';
import { cargoTemArea, conflitosDeCargoUnico } from '../src/encontrar/triagem.mjs';

const senha = 'Senha restrita aos testes 2026!';
const REF = '2026-08';

test('papéis numa lista com "e" viram um requisito cada; com "ou", qualquer um serve', () => {
  const lista = interpretarPedido('O CEO e o diretor de RH das distribuidoras de SP');
  assert.deepEqual(lista.papel.requisitos.map((r) => r.rotulo), ['CEO ou presidente', 'Diretoria · recursos humanos']);
  assert.equal(lista.papel.rotulo, 'Um de cada: CEO ou presidente · Diretoria · recursos humanos');
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
  assert.equal(validarLeituraIA({ papeis: [{ senioridades: ['ceo'], trecho: 'o CEO' }], cadaUm: true }, pedido).cadaUm, false);
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

test('cargo único com dois ocupantes: o quadro estatutário prevalece', () => {
  const p = (id, nome, cargo, senioridade, origem, empresa = 'cnpj1') => ({ id, nome, cargo, senioridade, origem, empresa_id: empresa });
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

async function montar(t, { servicoIA = null } = {}) {
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
  const app = await criarApp(db, { catalogo: criarCatalogo({ arquivo, arquivoIbama: null }), servicoIA: servicoIA ? servicoIA(db) : null });
  t.after(async () => { await app.close(); await db.close(); });
  const u = await criarUsuario(db, { email: 'socio@teste.local', papel: 'socio', senha, nome: 'Helena Sócia' });
  const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email: 'socio@teste.local', senha } });
  const cookie = r.headers['set-cookie'].split(';')[0];
  const socio = { ...u, chamar: (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } }) };
  const inserir = (nome, cargo, senioridade, empresaId, origem) => db.query(
    `INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,empresa_id,origem,origem_referencia,criado_por)
     VALUES ($1,'mercado',$2,lower($2),$3,$4,'x','x',$5,$6,'Fonte do teste',$7)`, [randomUUID(), nome, cargo, senioridade, empresaId, origem, u.id]);
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
