import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarFluxos, AVISO_AMOSTRA, AVISO_LISTA } from '../v1/src/agente/pesquisa-fluxos.ts';
import { montarGrupos } from '../v1/src/agente/pesquisa-tela.ts';

/* Harness dos handlers reais da tela: API em que cada chamada fica pendente até o teste
   decidir a resposta, e efeitos que registram o que a tela mostraria. */
function harness() {
  const chamadas = [];
  const esperando = [];
  const api = new Proxy({}, {
    get: (_, metodo) => (...args) => new Promise((resolve, reject) => {
      const c = { metodo, args, resolve, reject };
      chamadas.push(c);
      for (const w of esperando.splice(0)) w();
    }),
  });
  /** Próxima chamada ainda não atendida do método (espera ela acontecer). */
  async function chamada(metodo) {
    for (;;) {
      const c = chamadas.find((x) => x.metodo === metodo && !x.atendida);
      if (c) { c.atendida = true; return c; }
      await new Promise((r) => esperando.push(r));
    }
  }
  const tela = { mostrado: null, aviso: '', erros: [], ocupado: false, rodando: false, paginas: null, entregue: null };
  let n = 0;
  const f = criarFluxos(api, {
    mostrar: (d) => { tela.mostrado = d; }, limparTela: () => { tela.aviso = ''; tela.entregue = null; },
    rodando: (v) => { tela.rodando = v; }, ocupado: (v) => { tela.ocupado = v; }, erro: (e) => tela.erros.push(e),
    aviso: (t) => { tela.aviso = t; }, limparPrevia: () => {}, limparSelecao: () => {}, entregue: (v) => { tela.entregue = v; },
    paginas: (p) => { tela.paginas = p; }, recarregarLista: () => {},
  }, { uuid: () => `uuid-${++n}`, amostra: 2 });
  const vazio = () => new Promise((r) => setImmediate(r));
  return { api, chamadas, chamada, tela, f, vazio, pausas: () => chamadas.filter((c) => c.metodo === 'pausar').map((c) => c.args) };
}

const det = (id, o = {}) => ({
  pesquisa: { id, estado: o.estado ?? 'em_andamento', versao: o.versao ?? 1, execucao: o.execucao ?? 1, meta: o.meta ?? 20, limite_web: 40,
    criterios: o.criterios ?? [], filtros: o.filtros ?? { uf: '', busca: '', cnae: '', incluirPossiveis: false } },
  contagens: { total: o.total ?? 10, revisadas: o.revisadas ?? 0, pendentes: 0, aderente: 0, provavel: o.provavel ?? 0, a_confirmar: 0, nao_aderente: 0 },
  itens: o.itens ?? [], ia: null, marca: o.marca ?? 'm1', execucaoLote: o.execucaoLote,
});

async function abrir(h, id, o) {
  const p = h.f.abrir(id);
  (await h.chamada('obter')).resolve(det(id, o));
  await p;
}

test('laço abandonado só pausa a geração em que ele rodou, e nada se o pedido não rodou', async () => {
  // Lote em voo quando outra pesquisa abre; ele termina na própria geração 1.
  {
    const h = harness();
    await abrir(h, 'A');
    const laco = h.f.revisar('meta', h.tela.mostrado);
    (await h.chamada('avancar')).resolve(det('A', { execucaoLote: 1 }));
    const segundo = await h.chamada('avancar');
    assert.equal(segundo.args[2], 1, 'continua com a ficha da própria geração');
    await abrir(h, 'B');
    segundo.resolve(det('A', { execucaoLote: 1 }));
    (await h.chamada('pausar')).resolve(det('A', { estado: 'em_andamento', execucao: 2 }));
    await laco;
    assert.deepEqual(h.pausas(), [['A', 1]], 'pausa automática leva a ficha 1');
    assert.equal(h.tela.mostrado.pesquisa.id, 'B');
  }
  // Outra aba retomou A (geração 2): a continuação não roda e o laço não pausa nada.
  {
    const h = harness();
    await abrir(h, 'A');
    const laco = h.f.revisar('meta', h.tela.mostrado);
    (await h.chamada('avancar')).resolve(det('A', { execucaoLote: 1 }));
    const segundo = await h.chamada('avancar');
    await abrir(h, 'B');
    segundo.resolve(det('A', { execucao: 2, execucaoLote: null }));
    await laco;
    assert.deepEqual(h.pausas(), []);
  }
  // Primeira resposta tardia que não rodou: sem pausa; que rodou na própria geração 3: pausa só a 3.
  for (const [lote, esperado] of [[null, []], [3, [['A', 3]]]]) {
    const h = harness();
    await abrir(h, 'A');
    const laco = h.f.revisar('meta', h.tela.mostrado);
    const primeiro = await h.chamada('avancar');
    assert.equal(primeiro.args[2], undefined, 'o primeiro pedido é a retomada explícita');
    await abrir(h, 'B');
    primeiro.resolve(det('A', { execucao: 3, execucaoLote: lote }));
    if (lote) (await h.chamada('pausar')).resolve(det('A', { estado: 'pausada' }));
    await laco;
    assert.deepEqual(h.pausas(), esperado);
    assert.equal(h.tela.mostrado.pesquisa.id, 'B');
  }
  // Pausar clicado na própria tela é humano: sem ficha.
  {
    const h = harness();
    await abrir(h, 'A');
    const laco = h.f.revisar('meta', h.tela.mostrado);
    (await h.chamada('avancar')).resolve(det('A', { execucaoLote: 1 }));
    const segundo = await h.chamada('avancar');
    h.f.pausar();
    segundo.resolve(det('A', { execucaoLote: 1 }));
    (await h.chamada('pausar')).resolve(det('A', { estado: 'pausada' }));
    await laco;
    assert.deepEqual(h.pausas(), [['A', undefined]]);
    assert.equal(h.tela.mostrado.pesquisa.estado, 'pausada');
  }
});

test('pausa da amostra que responde depois de abrir outra não põe o aviso na outra', async () => {
  const h = harness();
  await abrir(h, 'A', { total: 2 });
  const laco = h.f.revisar('amostra', h.tela.mostrado);
  (await h.chamada('avancar')).resolve(det('A', { execucaoLote: 1, revisadas: 2, total: 2 }));
  const pausa = await h.chamada('pausar');
  assert.deepEqual(pausa.args, ['A', 1]);
  await abrir(h, 'B');
  pausa.resolve(det('A', { estado: 'pausada', revisadas: 2 }));
  await laco;
  assert.equal(h.tela.mostrado.pesquisa.id, 'B');
  assert.notEqual(h.tela.aviso, AVISO_AMOSTRA(2));
  assert.equal(h.tela.rodando, false);
});

test('resposta antiga não apaga a chave de retry do pedido mais novo (ajustar, criar, entregar)', async () => {
  // Ajustar: A suspenso -> abrir B -> ajustar B suspenso -> A responde -> B falha -> retry de B usa a mesma chave.
  {
    const h = harness();
    await abrir(h, 'A', { estado: 'concluida' });
    const a = h.f.ajustar(h.tela.mostrado);
    const pa = await h.chamada('ajustar');
    await abrir(h, 'B', { estado: 'concluida' });
    const b = h.f.ajustar(h.tela.mostrado);
    const pb = await h.chamada('ajustar');
    pa.resolve(det('A2', { estado: 'rascunho' }));
    await a;
    assert.equal(h.tela.mostrado.pesquisa.id, 'B', 'a resposta de A não troca a tela');
    pb.reject(new Error('rede'));
    await b;
    const retry = h.f.ajustar(h.tela.mostrado);
    const pb2 = await h.chamada('ajustar');
    assert.equal(pb2.args[1], pb.args[1], 'mesma chave no retry de B');
    pb2.resolve(det('B2', { estado: 'rascunho' }));
    await retry;
    assert.equal(h.tela.mostrado.pesquisa.id, 'B2');
  }
  // Criar: tese X suspensa -> nova tese Y suspensa -> X responde -> Y falha -> retry de Y usa a mesma chave.
  {
    const h = harness();
    const x = h.f.montar('Tese X com mais de dez letras', null);
    const px = await h.chamada('criar');
    h.f.esvaziar();
    const y = h.f.montar('Tese Y com mais de dez letras', null);
    const py = await h.chamada('criar');
    px.resolve(det('X', { estado: 'rascunho' }));
    await x;
    assert.equal(h.tela.mostrado, null, 'X não ocupa a tela de Y');
    py.reject(new Error('rede'));
    await y;
    const y2 = h.f.montar('Tese Y com mais de dez letras', null);
    const py2 = await h.chamada('criar');
    assert.equal(py2.args[0].id, py.args[0].id);
    py2.resolve(det('Y', { estado: 'rascunho' }));
    await y2;
  }
  // Entregar: A suspenso -> abrir B -> entregar B suspenso -> A responde -> B falha -> retry com a mesma chave.
  {
    const h = harness();
    await abrir(h, 'A');
    const a = h.f.registrar(h.tela.mostrado, ['cnpj11111111']);
    const pa = await h.chamada('registrar');
    await abrir(h, 'B');
    const b = h.f.registrar(h.tela.mostrado, ['cnpj22222222']);
    const pb = await h.chamada('registrar');
    pa.resolve({ conversa: { id: 'c1' } });
    await a;
    assert.equal(h.tela.entregue, null, 'o aviso de A não aparece em B');
    pb.reject(new Error('rede'));
    await b;
    const b2 = h.f.registrar(h.tela.mostrado, ['cnpj22222222']);
    const pb2 = await h.chamada('registrar');
    assert.equal(pb2.args[1], pb.args[1]);
    pb2.resolve({ conversa: { id: 'c2' } });
    await b2;
    assert.deepEqual(h.tela.entregue, { conversaId: 'c2', n: 1 });
  }
});

test('salvar rascunho atrasado não traz de volta versão antiga depois de reabrir a mesma pesquisa', async () => {
  const h = harness();
  await abrir(h, 'A', { estado: 'rascunho', versao: 4, meta: 20 });
  const ini = h.f.iniciar('meta', { detalhe: h.tela.mostrado, criterios: [], filtros: h.tela.mostrado.pesquisa.filtros, meta: 25, limiteWeb: 40 });
  const patch = await h.chamada('editar');
  await abrir(h, 'A', { estado: 'rascunho', versao: 9, meta: 90 });
  patch.resolve(det('A', { estado: 'rascunho', versao: 5, meta: 25 }));
  await ini;
  assert.deepEqual([h.tela.mostrado.pesquisa.versao, h.tela.mostrado.pesquisa.meta], [9, 90]);
  assert.ok(!h.chamadas.some((c) => c.metodo === 'iniciar'), 'o laço antigo não inicia');
});

test('paginação: resposta recebida depois de sair não volta ao reabrir; lista mudada recarrega', async () => {
  {
    const h = harness();
    await abrir(h, 'A', { provavel: 1, revisadas: 1 });
    const mais = h.f.mostrarMais(h.tela.mostrado, 'provavel', 0);
    const p = await h.chamada('itens');
    assert.equal(p.args[3], 'm1', 'a continuação leva a marca da página de origem');
    await abrir(h, 'B');
    await abrir(h, 'A', { provavel: 1, revisadas: 1 });
    p.resolve({ itens: [{ empresa_id: 'cnpj00000001', categoria: 'provavel', etapa: 'revisada', vereditos: [] }], total: 1, proximoOffset: null, marca: 'm1' });
    await mais;
    const g = montarGrupos(h.tela.mostrado, h.tela.paginas).find((x) => x.categoria === 'provavel');
    assert.deepEqual([g.itens.length, g.restantes, g.carregando], [0, 1, false]);
  }
  {
    const h = harness();
    await abrir(h, 'A', { provavel: 1, revisadas: 1 });
    const mais = h.f.mostrarMais(h.tela.mostrado, 'provavel', 0);
    (await h.chamada('itens')).reject(Object.assign(new Error('mudou'), { status: 409 }));
    (await h.chamada('obter')).resolve(det('A', { provavel: 2, revisadas: 2, marca: 'm2' }));
    await mais;
    assert.equal(h.tela.mostrado.marca, 'm2');
    assert.equal(h.tela.aviso, AVISO_LISTA);
    assert.deepEqual(h.tela.erros, []);
    assert.equal(montarGrupos(h.tela.mostrado, h.tela.paginas).find((x) => x.categoria === 'provavel').carregando, false);
  }
});
