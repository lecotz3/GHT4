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
