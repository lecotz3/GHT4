import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chavePaginas, criarVigencia, montarGrupos, paginasVazias, pedirMais, receberMais } from '../v1/src/agente/pesquisa-tela.ts';

const item = (id, categoria, etapa = 'revisada') => ({ empresa_id: id, categoria, etapa, aderencia: 1, vereditos: [] });
const detalhe = (itens, contagens, id = 'p1') => ({
  pesquisa: { id }, itens, ia: null,
  contagens: { total: 0, revisadas: 0, pendentes: 0, aderente: 0, provavel: 0, a_confirmar: 0, nao_aderente: 0, ...contagens },
});

test('categoria inteira fora da primeira resposta continua visível, com ação a partir do offset 0', () => {
  // 300 aderentes na primeira resposta; 1 provável e 1 não aderente ficaram de fora.
  const base = Array.from({ length: 300 }, (_, i) => item(`a${i}`, 'aderente'));
  const d = detalhe(base, { revisadas: 302, aderente: 300, provavel: 1, nao_aderente: 1 });
  const g = montarGrupos(d, paginasVazias());
  assert.deepEqual(g.map((x) => [x.categoria, x.itens.length, x.total, x.restantes, x.offset]),
    [['aderente', 300, 300, 0, 300], ['provavel', 0, 1, 1, 0], ['nao_aderente', 0, 1, 1, 0]]);
  // Carregar o grupo omitido usa o cursor do servidor e passa a mostrar a empresa.
  const chave = chavePaginas(d);
  let p = pedirMais(paginasVazias(), chave, 'provavel');
  p = receberMais(p, chave, 'provavel', { itens: [item('b0', 'provavel')], proximoOffset: null });
  const depois = montarGrupos(d, p).find((x) => x.categoria === 'provavel');
  assert.deepEqual([depois.itens.map((i) => i.empresa_id), depois.restantes], [['b0'], 0]);
});

test('clique repetido não duplica: um pedido por grupo, deduplicação e cursor do servidor', () => {
  const d = detalhe([item('a0', 'aderente')], { revisadas: 5, aderente: 5 });
  const chave = chavePaginas(d);
  const p1 = pedirMais(paginasVazias(), chave, 'aderente');
  assert.equal(montarGrupos(d, p1)[0].carregando, true);
  assert.equal(pedirMais(p1, chave, 'aderente'), null, 'segundo clique com pedido em voo é ignorado');
  // A resposta repete a empresa da base e uma interna: cada empresa aparece uma vez.
  const p2 = receberMais(p1, chave, 'aderente', { itens: [item('a0', 'aderente'), item('a1', 'aderente'), item('a1', 'aderente'), item('a2', 'aderente')], proximoOffset: 3 });
  const g = montarGrupos(d, p2)[0];
  assert.deepEqual(g.itens.map((i) => i.empresa_id), ['a0', 'a1', 'a2']);
  assert.equal(g.offset, 3, 'próximo offset é o devolvido pelo servidor, não a quantidade renderizada');
  assert.equal(g.restantes, 2);
  // Falha devolve o botão sem perder o cursor.
  const p3 = receberMais(pedirMais(p2, chave, 'aderente'), chave, 'aderente', null);
  assert.equal(montarGrupos(d, p3)[0].offset, 3);
  assert.equal(montarGrupos(d, p3)[0].carregando, false);
});

test('continuação é descartada quando outro lote revisa mais empresas ou outra pesquisa abre', () => {
  const d = detalhe([item('a0', 'aderente')], { revisadas: 5, aderente: 5 });
  const chave = chavePaginas(d);
  const p = receberMais(pedirMais(paginasVazias(), chave, 'aderente'), chave, 'aderente', { itens: [item('a1', 'aderente')], proximoOffset: 2 });
  // Novo lote: as categorias podem ter mudado; a continuação antiga não é misturada.
  const novo = detalhe([item('a0', 'aderente')], { revisadas: 6, aderente: 6 });
  assert.deepEqual(montarGrupos(novo, p)[0].itens.map((i) => i.empresa_id), ['a0']);
  assert.equal(montarGrupos(novo, p)[0].offset, 1);
  // Resposta que chega depois da troca de base ou de pesquisa é ignorada.
  const emVoo = pedirMais(paginasVazias(), chave, 'aderente');
  const trocada = pedirMais(emVoo, chavePaginas(detalhe([], { revisadas: 1, aderente: 1 }, 'p2')), 'aderente');
  assert.equal(receberMais(trocada, chave, 'aderente', { itens: [item('x', 'aderente')], proximoOffset: null }), trocada);
});

test('vigência: resposta de operação superada não troca a tela, e receber não promove pedido antigo', () => {
  const tela = criarVigencia();
  // Ajustar A em voo; o usuário abre B; o ajuste de A responde depois.
  const ajusteA = tela.tomar();
  const abrirB = tela.tomar();
  assert.equal(tela.vigente(ajusteA), false, 'ajuste de A não troca a tela de B');
  assert.equal(tela.vigente(abrirB), true);
  // Iniciar/entregar observam sem tomar: continuam valendo se nada trocou a tela...
  const entrega = tela.observar();
  assert.equal(tela.vigente(entrega), true);
  // ...e deixam de valer se outra pesquisa abriu no meio.
  tela.tomar();
  assert.equal(tela.vigente(entrega), false);
  assert.equal(tela.vigente(abrirB), false);
});

test('relaxamento sugerido: só obrigatórios que eliminam sozinhos, mais recuperação primeiro, empate no de menor prioridade', async () => {
  const { sugerirRelaxamento } = await import('../v1/src/agente/pesquisa-tela.ts');
  const c = (id, obrigatorio = true) => ({ id, texto: `Critério ${id}`, obrigatorio, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 1 }, origem: 'regras' });
  const criterios = [c('a'), c('b'), c('c', false), c('d'), c('e')];
  const funil = { aprovadasCadastro: 7, exclusivas: { a: 5, b: 30, c: 99, d: 5, e: 0 } };
  const s = sugerirRelaxamento(criterios, funil, 20);
  // "c" é opcional (não elimina), "e" não elimina sozinho; "d" vem antes de "a" no empate (menor prioridade).
  assert.deepEqual(s.map((x) => [x.id, x.recupera, x.total, x.basta]), [['b', 30, 37, true], ['d', 5, 12, false], ['a', 5, 12, false]]);
  assert.equal(sugerirRelaxamento(criterios, funil, 20, 1).length, 1);
  assert.deepEqual(sugerirRelaxamento(criterios, {}, 20), [], 'funil de rascunho ainda sem cálculo');
  assert.deepEqual(sugerirRelaxamento(criterios, null, 20), []);
});

test('memória no rascunho: mesmo critério não repete, regra do mesmo campo é substituída e os limites valem', async () => {
  const { adicionarDaMemoria, sugestoesDaMemoria, mesmoCriterio } = await import('../v1/src/agente/pesquisa-tela.ts');
  const cad = (id, campo, valor) => ({ id, texto: `${campo} ${valor}`, obrigatorio: true, tipo: 'cadastro', regra: { campo, valor }, trecho: null, origem: 'regras' });
  const pes = (id, texto) => ({ id, texto, obrigatorio: true, tipo: 'pesquisa', regra: null, trecho: null, origem: 'regras' });
  const mem = (chave, c) => ({ chave: chave.padEnd(32, '0'), texto: c.texto, tipo: c.tipo, regra: c.regra, obrigatorio: c.obrigatorio, usos: 3, ultimoUso: '' });
  const lista = [cad('idade', 'idade_min', 15), pes('rep', 'Representem fabricantes multinacionais')];
  assert.ok(mesmoCriterio(pes('x', 'Representem  FABRICANTES multinacionais'), lista[1]), 'texto normalizado');
  assert.equal(adicionarDaMemoria(lista, mem('a', cad('y', 'idade_min', 15))), null, 'a mesma regra não entra de novo');
  const trocada = adicionarDaMemoria(lista, mem('b', cad('y', 'idade_min', 20)));
  assert.deepEqual(trocada.map((c) => [c.id.slice(0, 4), c.regra?.valor ?? null]), [['rep', null], ['mem_', 20]], 'regra do mesmo campo é substituída');
  assert.equal(trocada[1].origem, 'usuario');
  assert.match(trocada[1].id, /^mem_[a-f0-9b]{12}$/);
  const cinco = [1, 2, 3, 4, 5].map((n) => pes(`p${n}`, `Critério de site ${n}`));
  assert.equal(adicionarDaMemoria(cinco, mem('c', pes('z', 'Outro critério de site'))), null, 'no máximo 5 de pesquisa');
  const sugestoes = sugestoesDaMemoria(lista, [mem('a', cad('y', 'idade_min', 15)), mem('d', pes('w', 'Laboratório próprio'))]);
  assert.deepEqual(sugestoes.map((m) => m.texto), ['Laboratório próprio']);
});

test('registro da execução: frase de cada passo, sem depender de React', async () => {
  const { descreverEvento } = await import('../v1/src/agente/pesquisa-tela.ts');
  const f = (tipo, dados) => descreverEvento({ tipo, dados });
  assert.equal(f('criterios', { total: 4, cadastro: 3, pesquisa: 1, modo: 'regras' }), '4 critérios propostos por regras locais: 3 de cadastro e 1 de site.');
  assert.equal(f('criterios', { origem: 'ajuste', total: 4, opcionais: 1 }), 'Nova rodada a partir da anterior, com 4 critérios (1 tornado opcional).');
  assert.equal(f('funil', { recorte: 725, aprovadasCadastro: 93 }), 'Funil cadastral: 93 de 725 empresas passaram.');
  assert.equal(f('lote', { revisadas: 2, empresas: [{ nome: 'Alfa', categoria: 'provavel' }, { nome: 'Beta', categoria: 'a_confirmar' }] }), '2 empresas revisadas: Alfa (provável), Beta (a confirmar).');
  assert.equal(f('pausa', { motivo: 'O provedor gratuito pediu uma pausa.', automatica: true }), 'Pausada pelo agente: O provedor gratuito pediu uma pausa.');
  assert.equal(f('revisao_humana', { acao: 'revisar', criterio: 'Laboratório próprio', empresa: 'Alfa', veredito: 'nao_atende' }), 'Revisou “Laboratório próprio” em Alfa: não atende.');
  assert.equal(f('entrega', { empresas: 1 }), '1 empresa levada ao trabalho.');
  assert.equal(f('monitoramento', { ativo: false }), 'Monitoramento semanal desligado.');
});
