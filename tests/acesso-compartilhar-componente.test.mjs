/* Rodada 27 na interface: registrar quem decide a partir de uma pesquisa de mandato confidencial
   pede a confirmação de que a fonte pode ir para a rede de toda a casa. Componente real, jsdom. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, dom, montar, servidor, botao, clicar, esperar } from './apoio/dom.mjs';

const { PlanoAcesso } = await import('../v1/src/componentes/PlanoAcesso.tsx');

const PESQUISA = 'a0000000-0000-4000-8000-0000000000dd';
const digitar = (el, valor) => React.act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, valor);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const plano = (compartilhamento) => ({
  empresa: { id: 'cnpj11111111', nome: 'Alfa Química', razaoSocial: 'Alfa Química Ltda', cnpjRaiz: '11111111', cidade: 'Campinas', uf: 'SP', subsetor: null },
  estrutura: { conhecida: true, natureza: 'ltda', naturezaRotulo: 'sociedade limitada', socios: 2, sociosPj: 0, socioEstrangeiro: false,
    leitura: '2 sócios pessoas físicas.', sinais: [], fonte: 'Cadastro CNPJ.' },
  canais: [], caminhos: [], restricao: null, restricoesOutras: [], oportunidades: [], limitacoes: [],
  eu: { naRede: true, pessoaId: 'p-eu' }, podeRegistrar: true, compartilhamento,
  tiposFonte: [{ id: 'conhecimento_da_casa', rotulo: 'Conhecimento da casa' }], senioridades: [{ id: 'ceo', rotulo: 'CEO ou presidente' }],
  pessoas: [], cobertura: { membros: 1, perguntasPossiveis: 0, perguntasPendentes: 0, respostas: 0, situacao: 'nao_mapeada', apuracaoCompleta: false },
  passo: { acao: 'registrar_decisor', titulo: 'Descubra quem decide', texto: 'Ninguém desta empresa está na rede ainda.', rascunhos: [], regras: [] },
});

async function preencher() {
  const form = document.querySelector('form[aria-label="Registrar quem decide"]');
  const [nome, cargo, descricao] = form.querySelectorAll('input:not([type="checkbox"])');
  await digitar(nome, 'Maria Exemplo');
  await digitar(cargo, 'Sócia-administradora');
  await digitar(descricao, 'Página Quem somos da Alfa');
  return form;
}

test('componente: em mandato confidencial, registrar exige confirmar o compartilhamento', async () => {
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/acesso\/cnpj11111111\?pesquisaId=/, dados: () => plano('confirmar') },
    { metodo: 'POST', url: /\/api\/acesso\/cnpj11111111\/decisores$/, segurar: true },
  ]);
  const t = await montar(React.createElement(PlanoAcesso, { empresaId: 'cnpj11111111', pesquisaId: PESQUISA }));
  try {
    await esperar();
    const form = await preencher();
    assert.match(form.textContent, /mandato confidencial.*rede de toda a casa/);
    assert.ok(botao(/^Registrar$/).disabled, 'sem a confirmação, não registra');
    await clicar(form.querySelector('input[type="checkbox"]'));
    assert.equal(botao(/^Registrar$/).disabled, false);
    await clicar(botao(/^Registrar$/));
    assert.equal(pedidos.find((p) => p.url.endsWith('/decisores')).corpo.compartilhar, true);
  } finally { await t.desmontar(); }
});

test('componente: fora de mandato confidencial, nem caixa nem campo novo', async () => {
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/acesso\/cnpj11111111\?pesquisaId=/, dados: () => plano(null) },
    { metodo: 'POST', url: /\/api\/acesso\/cnpj11111111\/decisores$/, segurar: true },
  ]);
  const t = await montar(React.createElement(PlanoAcesso, { empresaId: 'cnpj11111111', pesquisaId: PESQUISA }));
  try {
    await esperar();
    const form = await preencher();
    assert.ok(!form.querySelector('input[type="checkbox"]'));
    await clicar(botao(/^Registrar$/));
    assert.ok(!('compartilhar' in pedidos.find((p) => p.url.endsWith('/decisores')).corpo));
  } finally { await t.desmontar(); }
});
