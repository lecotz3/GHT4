/* Rodada 23 na interface: "Quem decide nestas empresas" na pesquisa por tese leva ao find só nas
   aderentes e prováveis dela; avisos de restrição de outros espaços no cartão e na lacuna.
   Componentes reais (TSX transpilado), DOM do jsdom e fetch controlado. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, dom, montar, servidor, botao, clicar, esperar, responder } from './apoio/dom.mjs';

const { PesquisaTese } = await import('../v1/src/componentes/PesquisaTese.tsx');
const { EncontrarPessoas } = await import('../v1/src/componentes/EncontrarPessoas.tsx');

const PESQUISA_ID = 'a0000000-0000-4000-8000-0000000000ee';
const AVISO = 'Há restrição de contato no espaço "Mandato Aberto": Em negociação com outro assessor. Fale com o responsável antes de abordar.';

test('pesquisa por tese: "Quem decide nestas empresas" leva a pesquisa ao find', async () => {
  const FUNIL = { recorte: 1, avaliadas: 1, truncado: false, semAtributos: 0, eliminadas: 0, eliminadasPor: {}, exclusivas: {}, aprovadasCadastro: 1, comSite: 1, armazenadas: 1 };
  const detalhe = {
    pesquisa: { id: PESQUISA_ID, conversa_id: 'conv', anterior_id: null, tese: 'Distribuidoras com mais de 20 anos', frente: 'venda',
      filtros: { uf: 'SP', busca: '', cnae: '', incluirPossiveis: false },
      criterios: [{ id: 'c1', texto: 'Mais de 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 }, trecho: null, origem: 'regras' }],
      meta: 20, limite_web: 40, referencia: '2026-08', funil: FUNIL, estado: 'concluida', motivo_estado: null, modo: 'regras', notas: [], turno_id: null,
      versao: 1, execucao: 0, atualizado_em: '2026-10-09T12:00:00Z' },
    contagens: { total: 3, revisadas: 3, pendentes: 0, aderente: 2, provavel: 1, a_confirmar: 0, nao_aderente: 0 },
    itens: [], ia: null, marca: 'm1',
  };
  servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${PESQUISA_ID}$`), dados: () => detalhe },
  ]);
  const chamadas = [];
  const t = await montar(React.createElement(PesquisaTese, { usuario: { id: 'u', nome: 'Ana', papel: 'socio' }, inicial: { pesquisaId: PESQUISA_ID },
    aoConsumirInicial: () => {}, aoAbrirTrabalho: () => {}, aoExpirar: () => {}, aoEncontrar: (p) => chamadas.push(p) }));
  try {
    await esperar(); await esperar();
    await clicar(botao(/^Quem decide nestas empresas/));
    assert.deepEqual(chamadas, [{ id: PESQUISA_ID, tese: 'Distribuidoras com mais de 20 anos', boas: 3 }]);
  } finally { await t.desmontar(); }
});

const empresa = (id, nome) => ({ id, nome, cidade: 'Campinas', uf: 'SP', subsetor: null });
const RESULTADO = {
  leitura: { pedido: 'Quem decide', tese: '', papel: { decide: true, senioridades: [], rotulo: 'Quem decide a venda', padrao: false, trechos: ['Quem decide'] },
    acesso: { exigido: null, obrigatorio: false, trecho: null }, recorte: { uf: '', subsetor: 'todos', cnae: '', incluirPossiveis: false }, criterios: [], notas: [],
    empresas: [], pesquisa: { id: PESQUISA_ID, tese: 'Distribuidoras com mais de 20 anos', empresas: 2, categorias: ['aderente', 'provavel'] } },
  funil: { recorte: 2, lidas: 2, truncado: false, nosCriterios: 2, comPessoas: 1, pessoas: 1, foraDosCriterios: 0, forte: 1, revisar: 0, excluido: 0 },
  grupos: {
    forte: [{ id: 'p1', nome: 'Carlos Nunes', cargo: 'Sócio-administrador', senioridade: 'ceo', senioridadeRotulo: 'CEO ou presidente', origem: 'manual',
      empresa: empresa('cnpj11111111', 'Alfa Química'), posicao: { id: 'decide', rotulo: 'Decide a venda' }, grupo: 'forte', motivo: null, pendencias: [], pedePesquisa: false,
      juizo: [{ requisito: 'Na pesquisa por tese', julgamento: 'atende', informacao: 'Aderente (aderência 100%)', fonte: 'Pesquisa por tese do GHT4', obrigatorio: true }],
      caminho: null, respostas: { respostas: 0, negativas: 0 }, avisos: [AVISO] }],
    revisar: [], excluido: [] },
  lacunas: { total: 1, ninguemMapeado: 1, empresas: [{ empresa: empresa('cnpj44444444', 'Delta Química'), mapeadas: 0, estrutura: 'Leitura da estrutura.', pendentes: 1, avisos: [AVISO] }] },
  membros: 1, referencia: '2026-08', fonte: 'Receita Federal · CNPJ', limitacoes: [],
};

test('find dentro da pesquisa: recorte da pesquisa, pedido pronto, avisos e volta a todas as empresas', async () => {
  const pedidos = servidor([{ metodo: 'POST', url: /\/api\/encontrar$/, segurar: true }]);
  const saidas = [];
  const t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => {},
    pesquisa: { id: PESQUISA_ID, tese: 'Distribuidoras com mais de 20 anos', boas: 2 }, aoSairDaPesquisa: () => saidas.push(1) }));
  try {
    await esperar();
    assert.match(document.querySelector('.encontrar-escopo').textContent, /Nas empresas da pesquisa “Distribuidoras com mais de 20 anos”: 2 aderentes ou prováveis/);
    assert.equal(document.querySelector('#pedido-encontrar').value, 'Quem decide', 'o pedido começa pronto');
    await clicar(botao(/^Encontrar/));
    const post = pedidos.find((p) => p.metodo === 'POST');
    assert.deepEqual(post.corpo, { pedido: 'Quem decide', pesquisaId: PESQUISA_ID });
    await responder(post, RESULTADO);
    await esperar();
    const leitura = document.querySelector('.encontrar-leitura').textContent;
    assert.match(leitura, /EmpresaAs 2 aderentes e prováveis da pesquisa “Distribuidoras com mais de 20 anos”/);
    assert.match(leitura, /RecorteSó as empresas da pesquisa/);
    const avisos = [...document.querySelectorAll('.encontrar-aviso')].map((p) => p.textContent);
    assert.deepEqual(avisos, [AVISO, AVISO], 'no cartão e na lacuna');
    await clicar(botao(/^Procurar em todas as empresas/));
    assert.deepEqual(saidas, [1]);
  } finally { await t.desmontar(); }
});

// Plano montado só com o que o PlanoAcesso lê.
const plano = (id, nome, passo) => ({
  empresa: { id, nome, razaoSocial: nome, cnpjRaiz: id.slice(4), cidade: 'Campinas', uf: 'SP', subsetor: null },
  estrutura: { conhecida: true, natureza: 'ltda', naturezaRotulo: 'sociedade limitada', socios: 2, sociosPj: 0, socioEstrangeiro: false,
    leitura: 'Leitura da estrutura.', sinais: [], fonte: 'Cadastro CNPJ' },
  canais: [], caminhos: [], restricoesOutras: [], oportunidades: [], limitacoes: [],
  restricao: passo.acao === 'nao_contatar' ? { ativa: true, categoria: 'nao_contatar', motivo: 'Em negociação com outro assessor.' } : null,
  eu: { naRede: true, pessoaId: 'p-eu' }, podeRegistrar: true,
  tiposFonte: [{ id: 'conhecimento_da_casa', rotulo: 'Conhecimento da casa' }], senioridades: [{ id: 'ceo', rotulo: 'CEO ou presidente' }],
  pessoas: [], cobertura: { membros: 1, perguntasPossiveis: 0, perguntasPendentes: 0, respostas: 0, situacao: 'nao_mapeada', apuracaoCompleta: false },
  passo: { rascunhos: [], regras: [], ...passo },
});
const digitar = (el, valor) => React.act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, valor);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});

test('find dentro da pesquisa: o plano do cartão e o da lacuna levam a pesquisa, até o registro de quem decide', async () => {
  const pedidos = servidor([
    { metodo: 'POST', url: /\/api\/encontrar$/, segurar: true },
    { metodo: 'GET', url: /\/api\/acesso\/cnpj11111111/,
      dados: () => plano('cnpj11111111', 'Alfa Química', { acao: 'nao_contatar', titulo: 'Não contatar', texto: 'Restrição ativa no mandato.' }) },
    { metodo: 'GET', url: /\/api\/acesso\/cnpj44444444/,
      dados: () => plano('cnpj44444444', 'Delta Química', { acao: 'registrar_decisor', titulo: 'Descubra quem decide', texto: 'Ninguém desta empresa está na rede ainda.' }) },
    { metodo: 'POST', url: /\/api\/acesso\/cnpj44444444\/decisores$/, segurar: true },
  ]);
  const t = await montar(React.createElement(EncontrarPessoas, { aoPesquisar: () => {}, aoExpirar: () => {},
    pesquisa: { id: PESQUISA_ID, tese: 'Distribuidoras com mais de 20 anos', boas: 2 } }));
  try {
    await esperar();
    await clicar(botao(/^Encontrar/));
    await responder(pedidos.find((p) => p.metodo === 'POST'), RESULTADO);
    await esperar();
    const planos = () => pedidos.filter((p) => p.metodo === 'GET' && p.url.includes('/api/acesso/')).map((p) => { const u = new URL(p.url, 'http://127.0.0.1'); return u.pathname + u.search; });

    await clicar(botao(/Plano de acesso$/));
    await esperar();
    assert.deepEqual(planos(), [`/api/acesso/cnpj11111111?pesquisaId=${PESQUISA_ID}`], 'o cartão abre o plano no contexto da pesquisa');
    assert.match(document.querySelector('.acesso').textContent, /Não contatar/, 'a restrição do mandato continua valendo no plano');

    await clicar(botao(/^Abrir o plano e registrar quem decide/));
    await esperar();
    assert.deepEqual(planos().slice(1), [`/api/acesso/cnpj44444444?pesquisaId=${PESQUISA_ID}`], 'a lacuna também');
    const [nome, cargo, descricao] = document.querySelector('form[aria-label="Registrar quem decide"]').querySelectorAll('input');
    await digitar(nome, 'Marta Lima');
    await digitar(cargo, 'Diretora');
    await digitar(descricao, 'Conversa com a diretora em 05/10');
    await clicar(botao(/^Registrar$/));
    const registro = pedidos.find((p) => p.url.endsWith('/decisores'));
    assert.equal(registro.corpo.pesquisaId, PESQUISA_ID, 'quem decide é registrado no contexto da pesquisa');
  } finally { await t.desmontar(); }
});

