/* Auditoria de acessibilidade das telas reais renderizadas no jsdom: nome acessível de todo
   controle, referências ARIA válidas, ids únicos, ícones decorativos ocultos, tabulação sem
   tabindex positivo e foco preservado no fluxo "Remover da lista". Não substitui um ensaio com
   leitor de tela real; pega as falhas estruturais que dá para provar sem ele. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, dom, montar, servidor, botao, clicar, esperar } from './apoio/dom.mjs';

const { PesquisaTese } = await import('../v1/src/componentes/PesquisaTese.tsx');
const { InicioAgente } = await import('../v1/src/componentes/InicioAgente.tsx');

/** Nome acessível simplificado (accname): aria-labelledby, aria-label, label, conteúdo, title, placeholder. */
function nomeAcessivel(el) {
  const texto = (n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1 || n.getAttribute('aria-hidden') === 'true') return '';
    return [...n.childNodes].map(texto).join(' ');
  };
  const por = el.getAttribute('aria-labelledby');
  if (por) return por.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
  if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label').trim();
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
    const rotulo = (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label');
    if (rotulo) return texto(rotulo).replace(/\s+/g, ' ').trim();
  } else {
    const t = texto(el).replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  return (el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
}

function auditar(contexto) {
  const problemas = [];
  const controles = document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="checkbox"]');
  for (const el of controles) if (!nomeAcessivel(el)) problemas.push(`${contexto}: ${el.tagName.toLowerCase()} sem nome acessível (${el.outerHTML.slice(0, 120)})`);
  for (const el of document.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls]')) {
    for (const atributo of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
      for (const id of (el.getAttribute(atributo) ?? '').split(/\s+/).filter(Boolean)) if (!document.getElementById(id)) problemas.push(`${contexto}: ${atributo}="${id}" aponta para nada`);
    }
  }
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) problemas.push(`${contexto}: id duplicado "${id}"`);
  for (const svg of document.querySelectorAll('svg')) if (svg.getAttribute('aria-hidden') !== 'true' && !svg.querySelector('title') && !svg.getAttribute('aria-label')) problemas.push(`${contexto}: svg sem aria-hidden nem título`);
  for (const el of document.querySelectorAll('[tabindex]')) if (Number(el.getAttribute('tabindex')) > 0) problemas.push(`${contexto}: tabindex positivo em ${el.tagName.toLowerCase()}`);
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) problemas.push(`${contexto}: img sem alt`);
  return problemas;
}

const FILTROS = { uf: 'SP', busca: '', cnae: '', incluirPossiveis: false };
const CRITERIOS = [
  { id: 'c1', texto: 'Mais de 20 anos', obrigatorio: true, tipo: 'cadastro', regra: { campo: 'idade_min', valor: 20 }, trecho: 'mais de 20 anos', origem: 'regras' },
  { id: 'c2', texto: 'Representa multinacionais', obrigatorio: false, tipo: 'pesquisa', regra: null, trecho: null, origem: 'regras' },
];
const FUNIL = { recorte: 30, avaliadas: 30, truncado: false, semAtributos: 2, eliminadas: 10, eliminadasPor: { c1: 10 }, exclusivas: { c1: 10 }, aprovadasCadastro: 20, comSite: 15, armazenadas: 20 };
const item = (id, categoria) => ({ empresa_id: id, ordem: 1, etapa: 'revisada', aderencia: 80, categoria, site: { dominio: 'alfa.com.br', estado: 'ok', identidade: 'cnpj', motivo: null, paginas: [{ url: 'https://alfa.com.br/', titulo: 'Alfa' }] },
  vereditos: [{ veredito: 'atende', resumo: 'Fundada em 1990', justificativa: 'Cadastro', lastro: 'cadastro', evidencias: [{ fonte: 'Receita', campo: 'dataAbertura' }] },
    { veredito: 'indicio', resumo: 'Cita multinacionais', justificativa: 'Site', lastro: 'site', evidencias: [{ fonte: 'site', url: 'https://alfa.com.br/', trecho: 'distribuidor autorizado' }] }],
  empresa: { id, nome: `Empresa ${id}`, razaoSocial: '', cidade: 'Campinas', uf: 'SP', cnpjRaiz: '11111111', cnaePrincipal: '4684299', dominio: 'alfa.com.br', porte: 'DEMAIS', capitalSocial: 500000, dataAbertura: '1990-01-01' } });
const det = (id, estado, o = {}) => ({
  pesquisa: { id, conversa_id: 'conv', anterior_id: null, tese: `Tese ${id}`, frente: 'venda', filtros: FILTROS, criterios: CRITERIOS, meta: 20, limite_web: 40,
    referencia: '2026-08', funil: FUNIL, estado, motivo_estado: o.motivo ?? null, modo: 'regras', notas: ['Nota de teste'], turno_id: null, versao: 1, execucao: 1, atualizado_em: '2026-10-07T12:00:00Z' },
  contagens: { total: 20, revisadas: 2, pendentes: 18, aderente: 1, provavel: 3, a_confirmar: 0, nao_aderente: 0 },
  itens: o.itens ?? [], ia: null, marca: 'm1',
});

test('acessibilidade: pesquisa por tese (composição, rascunho, resultados com detalhe aberto)', async () => {
  const R = det('a0000000-0000-4000-8000-0000000000a1', 'rascunho');
  const C = det('a0000000-0000-4000-8000-0000000000a2', 'pausada', { motivo: 'Limite de 40 sites.', itens: [item('cnpj11111111', 'aderente'), item('cnpj22222222', 'provavel')] });
  servidor([
    { metodo: 'GET', url: /\/api\/pesquisas$/, dados: () => ({ pesquisas: [], ia: null }) },
    { metodo: 'GET', url: new RegExp(`${R.pesquisa.id}$`), dados: () => R },
    { metodo: 'GET', url: new RegExp(`${C.pesquisa.id}$`), dados: () => C },
    { metodo: 'POST', url: /\/previa$/, dados: () => ({ funil: FUNIL, referencia: '2026-08', amostra: [{ id: 'cnpj1', nome: 'Alfa', cidade: 'Campinas', uf: 'SP', aderencia: 80 }] }) },
  ]);
  const props = { usuario: { id: 'u', nome: 'Ana', papel: 'analista' }, aoConsumirInicial: () => {}, aoAbrirTrabalho: () => {}, aoExpirar: () => {} };
  const problemas = [];
  let t = await montar(React.createElement(PesquisaTese, { ...props, inicial: null }));
  await esperar();
  problemas.push(...auditar('composição'));
  await t.desmontar();
  t = await montar(React.createElement(PesquisaTese, { ...props, inicial: { pesquisaId: R.pesquisa.id } }));
  await esperar(); await React.act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  assert.ok(botao(/Revisar até a meta/) && document.querySelectorAll('input, select, button').length > 15, 'rascunho completo renderizado');
  problemas.push(...auditar('rascunho'));
  await t.desmontar();
  t = await montar(React.createElement(PesquisaTese, { ...props, inicial: { pesquisaId: C.pesquisa.id } }));
  await esperar();
  await clicar(botao(/Empresa cnpj11111111/));
  assert.ok(document.querySelector('.pesquisa-detalhe-linha') && document.querySelectorAll('input[type="checkbox"]').length >= 2, 'resultados com detalhe aberto');
  problemas.push(...auditar('resultados'));
  await t.desmontar();
  assert.deepEqual(problemas, []);
});

test('acessibilidade: início com "Continue de onde parou" e confirmação de remoção', async () => {
  servidor([{ metodo: 'GET', url: /\/api\/inicio$/, dados: () => ({ hoje: '2026-10-07', compromissos: { atrasados: 0, hoje: 1, semana: 1, itens: [{ oportunidade_id: 'o1', titulo: 'Op', descricao: 'Ligar', prazo: '2026-10-07', tipo: 'contato', empresa: 'Alfa' }] }, semProximoPasso: { total: 1, itens: [{ id: 'o2', titulo: 'Op 2', etapa: 'contato', empresa: 'Beta' }] }, rede: { naRede: false, perguntasPendentes: 1, vinculosParaConfirmar: 0 } }) }]);
  const conversas = [1, 2].map((n) => ({ id: `c${n}`, titulo: `Trabalho ${n}`, mandato_id: null, contexto: { frente: 'venda' }, versao: 1, atualizado_em: '2026-10-07T12:00:00Z' }));
  // Pai com estado real, como o Agente: remove das props quando o servidor confirma; na falha,
  // mostra o erro (aqui, registra) e devolve false.
  const tentativas = [];
  let falhar = false;
  function Pai() {
    const [lista, setLista] = React.useState(conversas);
    return React.createElement(InicioAgente, { usuario: { id: 'u', nome: 'Ana Souza', papel: 'analista' }, estado: { tarefas: [{ id: 'conversar', titulo: 'Conversar com o agente', descricao: 'Pergunte' }], iaConfigurada: false, ia: null, base: { disponivel: true, total: 1613, referencia: '2026-08', fonte: 'Receita Federal', subsetor: 'Distribuição química' } }, conversas: lista,
      aoComecar: () => {}, aoRetomar: () => {}, aoRede: () => {}, aoAjuda: () => {}, aoPesquisar: () => {}, bloqueado: false, visivel: true,
      aoAbrirCrm: () => {}, aoOportunidades: () => {}, aoExpirar: () => {},
      aoExcluir: async (id) => { tentativas.push(id); if (falhar) return false; setLista((l) => l.filter((c) => c.id !== id)); return true; } });
  }
  const t = await montar(React.createElement(Pai));
  await esperar();
  assert.deepEqual(auditar('início'), []);
  // Teclado: a lixeira focada abre a confirmação; o foco vai para a confirmação, não para o body.
  const lixeira = document.querySelector('button[aria-label="Remover Trabalho 1 da lista"]');
  lixeira.focus();
  await clicar(lixeira);
  assert.deepEqual(auditar('confirmação'), []);
  assert.notEqual(document.activeElement, document.body, 'foco não se perde ao abrir a confirmação');
  assert.ok(document.activeElement.closest('[role="group"]'), 'foco dentro da confirmação');
  // Esc cancela e devolve o foco à lixeira do mesmo item.
  await React.act(async () => { document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(document.querySelector('[role="group"]'), null);
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'Remover Trabalho 1 da lista');
  // Cancelar pelo botão também devolve o foco.
  await clicar(document.activeElement);
  await clicar(botao(/^Cancelar$/));
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'Remover Trabalho 1 da lista');
  // Falha na remoção: o item fica e o foco volta exatamente à lixeira dele.
  falhar = true;
  await clicar(document.activeElement);
  await clicar(botao(/^Remover da lista$/));
  await esperar();
  assert.deepEqual(tentativas, ['c1']);
  assert.ok(document.querySelector('button[aria-label="Remover Trabalho 1 da lista"]'), 'o item continua na lista');
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'Remover Trabalho 1 da lista');
  // Sucesso: o pai tira o item das props e o foco vai exatamente ao título da seção.
  falhar = false;
  await clicar(document.activeElement);
  await clicar(botao(/^Remover da lista$/));
  await esperar();
  assert.deepEqual(tentativas, ['c1', 'c1']);
  assert.equal(document.querySelector('button[aria-label="Remover Trabalho 1 da lista"]'), null, 'o item saiu');
  assert.ok(document.querySelector('button[aria-label="Remover Trabalho 2 da lista"]'), 'o outro continua');
  assert.equal(document.activeElement?.tagName, 'H3');
  assert.equal(document.activeElement?.textContent, 'Continue de onde parou');
  await t.desmontar();
});
