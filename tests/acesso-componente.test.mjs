/* Componente PlanoAcesso real (TSX transpilado) com DOM do jsdom e fetch controlado: registrar quem
   decide com a fonte, responder "você conhece?" e chegar ao rascunho, sem nenhum envio. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { React, dom, montar, servidor, botao, clicar, esperar, responder } from './apoio/dom.mjs';

const { PlanoAcesso } = await import('../v1/src/componentes/PlanoAcesso.tsx');
const { resumoCobertura } = await import('../v1/src/agente/acesso.ts');

const PESQUISA = 'a0000000-0000-4000-8000-0000000000cc';
const digitar = (el, valor) => React.act(async () => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, valor);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const base = {
  empresa: { id: 'cnpj11111111', nome: 'Alfa Química', razaoSocial: 'Alfa Química Ltda', cnpjRaiz: '11111111', cidade: 'Campinas', uf: 'SP', subsetor: null },
  estrutura: { conhecida: true, natureza: 'ltda', naturezaRotulo: 'sociedade limitada', socios: 2, sociosPj: 0, socioEstrangeiro: false,
    leitura: '2 sócios pessoas físicas: a venda depende deles em conjunto.', sinais: [], fonte: 'Cadastro CNPJ (Receita Federal), referência 2026-08.' },
  canais: [{ tipo: 'site', rotulo: 'Site oficial', url: 'https://alfa.com.br', fonte: 'Domínio', dica: null },
    { tipo: 'institucional', rotulo: 'Página institucional', url: 'https://alfa.com.br/quem-somos', fonte: 'Lida pela pesquisa', dica: 'Onde procurar quem dirige a empresa.' }],
  caminhos: [], restricao: null, restricoesOutras: [], oportunidades: [], limitacoes: ['Nenhuma mensagem é enviada pelo sistema.'],
  eu: { naRede: true, pessoaId: 'p-eu' }, podeRegistrar: true,
  tiposFonte: [{ id: 'conhecimento_da_casa', rotulo: 'Conhecimento da casa' }, { id: 'site_oficial', rotulo: 'Site oficial da empresa' }],
  senioridades: [{ id: 'ceo', rotulo: 'CEO ou presidente' }, { id: 'diretoria', rotulo: 'Diretoria' }],
};
const carlos = (minhaResposta = null, casa = 'indeterminado') => ({ id: 'p-carlos', nome: 'Carlos Nunes', cargo: 'Sócio-administrador', senioridade: 'ceo', senioridadeRotulo: 'CEO ou presidente',
  organizacao: 'Alfa Química', empresaId: 'cnpj11111111', origem: 'manual', posicao: { id: 'decide', rotulo: 'Decide a venda' },
  juizo: [
    { requisito: 'Decide a venda', julgamento: 'atende', informacao: 'CEO ou presidente · Sócio-administrador', fonte: 'Site oficial da empresa: Página Quem somos' },
    { requisito: 'Cargo com fonte', julgamento: 'atende', informacao: 'Registrado pela casa com a fonte do cargo.', fonte: 'Site oficial da empresa: Página Quem somos' },
    { requisito: 'Pertence a esta empresa', julgamento: 'atende', informacao: 'Vinculada ao CNPJ 11111111.', fonte: 'Cadastro da rede' },
    { requisito: 'A casa chega até ela', julgamento: casa, informacao: 'Ninguém da casa foi perguntado sobre esta pessoa.', fonte: null },
  ], caminho: null, respostas: { respostas: 0, negativas: 0 }, minhaResposta });
const cobertura = (pendentes) => ({ membros: 1, perguntasPossiveis: 1, perguntasPendentes: pendentes, respostas: 1 - pendentes, situacao: 'perguntada', apuracaoCompleta: pendentes === 0 });
const P0 = { ...base, pessoas: [], cobertura: { membros: 1, perguntasPossiveis: 0, perguntasPendentes: 0, respostas: 0, situacao: 'nao_mapeada', apuracaoCompleta: false },
  passo: { acao: 'registrar_decisor', titulo: 'Descubra quem decide', texto: 'Ninguém desta empresa está na rede ainda.', rascunhos: [], regras: [] } };
const P1 = { ...base, pessoas: [carlos()], cobertura: cobertura(1),
  passo: { acao: 'perguntar_a_casa', titulo: 'Pergunte à casa', texto: '1 pergunta continua sem resposta.', rascunhos: [], regras: [] } };
const P2 = { ...base, pessoas: [carlos('posso_apresentar', 'atende')], cobertura: cobertura(0),
  caminhos: [{ rota: 'Helena Sócia → Carlos Nunes (Sócio-administrador)', categoria: 'introducao_viavel', categoriaRotulo: 'Introdução viável', categoriaDescricao: 'O titular confirmou.', saltos: 1, porque: '', ressalvas: [], alvoId: 'p-carlos' }],
  passo: { acao: 'falar_direto', titulo: 'Fale direto', texto: 'Helena Sócia → Carlos Nunes.', quem: 'Helena Sócia',
    rascunhos: [{ para: 'Carlos Nunes', texto: 'Carlos, tudo bem? Aqui é Helena Sócia, da GHT4.' }], regras: ['O sistema não envia nada: copie, revise e mande pelo seu próprio canal.'] } };

test('cobertura da casa em uma frase', () => {
  assert.equal(resumoCobertura({ membros: 0, perguntasPossiveis: 0, perguntasPendentes: 0 }), 'Nenhum membro da GHT4 está na rede ainda.');
  assert.match(resumoCobertura({ membros: 2, perguntasPossiveis: 0, perguntasPendentes: 0 }), /ninguém desta empresa mapeado/);
  assert.equal(resumoCobertura({ membros: 2, perguntasPossiveis: 4, perguntasPendentes: 1, apuracaoCompleta: false }), '3 de 4 perguntas respondidas pela casa.');
  assert.match(resumoCobertura({ membros: 1, perguntasPossiveis: 1, perguntasPendentes: 0, apuracaoCompleta: true }), /1 de 1 pergunta respondida pela casa — apuração completa/);
});

test('componente: registrar quem decide com a fonte, responder "você conhece?" e chegar ao rascunho', async () => {
  let plano = P0;
  const pedidos = servidor([
    { metodo: 'GET', url: /\/api\/acesso\/cnpj11111111\?pesquisaId=/, dados: () => plano },
    { metodo: 'POST', url: /\/api\/acesso\/cnpj11111111\/decisores$/, segurar: true },
    { metodo: 'POST', url: /\/api\/rede\/reconhecimento$/, segurar: true },
  ]);
  const t = await montar(React.createElement(PlanoAcesso, { empresaId: 'cnpj11111111', pesquisaId: PESQUISA }));
  try {
    await esperar();
    const texto = () => document.querySelector('.acesso').textContent;
    assert.match(texto(), /Próximo passo.*Descubra quem decide/);
    assert.match(texto(), /2 sócios pessoas físicas/);
    const form = document.querySelector('form[aria-label="Registrar quem decide"]');
    assert.ok(form, 'formulário de registro aberto quando falta quem decide');
    assert.equal(form.querySelector('input[type="url"]').value, 'https://alfa.com.br/quem-somos', 'a página institucional lida vem como fonte sugerida');
    assert.ok(botao(/^Registrar$/).disabled, 'sem nome, cargo e fonte não registra');
    const [nome, cargo, descricao] = form.querySelectorAll('input');
    await digitar(nome, 'Carlos Nunes');
    await digitar(cargo, 'Sócio-administrador');
    await digitar(descricao, 'Página Quem somos');
    await clicar(botao(/^Registrar$/));
    const post = pedidos.find((p) => p.url.endsWith('/decisores'));
    assert.deepEqual({ ...post.corpo, id: undefined }, { id: undefined, nome: 'Carlos Nunes', cargo: 'Sócio-administrador', senioridade: 'ceo',
      fonte: { tipo: 'site_oficial', descricao: 'Página Quem somos', url: 'https://alfa.com.br/quem-somos' }, pesquisaId: PESQUISA });
    assert.match(post.corpo.id, /^[0-9a-f-]{36}$/);
    plano = P1;
    await responder(post, { pessoa: { id: 'p-carlos' } }, 201);
    await esperar();

    // A pessoa aparece com o juízo (requisito · julgamento · informação · fonte) e a pergunta ao membro.
    assert.match(texto(), /Pergunte à casa/);
    const linhas = [...document.querySelectorAll('.acesso-juizo [role="row"]:not(.acesso-juizo-titulos)')].map((tr) => tr.textContent);
    assert.equal(document.querySelectorAll('.acesso-juizo [role="columnheader"]').length, 4, 'requisito · julgamento · informação · fonte');
    assert.equal(linhas.length, 4);
    assert.match(linhas[1], /Cargo com fonte.*Atende.*Site oficial da empresa: Página Quem somos/);
    assert.match(texto(), /Você conhece Carlos Nunes\?/);
    await clicar(botao(/^Conheço e posso apresentar$/));
    const evid = document.querySelector('.acesso-evidencia input');
    assert.ok(botao(/^Confirmar$/).disabled, 'resposta positiva pede a evidência');
    await digitar(evid, 'Trabalhamos juntos na Química Beta até 2019.');
    await clicar(botao(/^Confirmar$/));
    const resp = pedidos.find((p) => p.url.endsWith('/api/rede/reconhecimento'));
    assert.equal(resp.corpo.pessoaAlvoId, 'p-carlos');
    assert.equal(resp.corpo.resposta, 'posso_apresentar');
    assert.equal(resp.corpo.evidencia, 'Trabalhamos juntos na Química Beta até 2019.');
    plano = P2;
    await responder(resp, { reconhecimento: { id: 'r1' } }, 201);
    await esperar();

    assert.match(texto(), /lista de sanções públicas \(CEIS e CNEP\) não está carregada/, 'sem lista, o plano diz que não consultou');

    // Com o caminho confirmado, o passo é falar direto, com rascunho para copiar e nenhum botão de envio.
    assert.match(texto(), /Fale direto/);
    assert.equal(document.querySelector('.acesso-rascunho textarea').value, 'Carlos, tudo bem? Aqui é Helena Sócia, da GHT4.');
    assert.ok(document.querySelector('.acesso-rascunho textarea').readOnly);
    assert.ok(!botao(/^Enviar/), 'nada é enviado pelo plano');
    assert.match(texto(), /Sua resposta: você conhece e pode apresentar/);
    assert.equal(pedidos.filter((p) => p.metodo === 'GET' && p.url.includes('/api/acesso/')).length, 3, 'relido depois de cada mudança');
  } finally { await t.desmontar(); }
});

test('componente: sanção pública não encerrada aparece no passo e na diligência, com a referência', async () => {
  const diligencia = { consultada: true, referencia: '2026-10-08', fonte: 'Portal da Transparência (CGU): CEIS e CNEP', url: 'https://portaldatransparencia.gov.br/sancoes/consulta', atencao: true,
    registros: [{ cadastro: 'CEIS', codigo: '2', categoria: 'Impedimento/proibição de contratar com prazo determinado', inicio: '2024-12-10', fim: '2028-12-10',
      orgao: 'Governo do Estado (RS)', esfera: 'ESTADUAL', uf: 'RS', abrangencia: 'Sem Informação', situacao: 'vigente' }] };
  servidor([{ metodo: 'GET', url: /\/api\/acesso\/cnpj11111111$/, dados: () => ({ ...P1, diligencia,
    passo: { ...P1.passo, alerta: 'Diligência: 1 registro no CEIS sem encerramento (impedimento/proibição de contratar com prazo determinado). Leve ao compliance antes de abordar.' } }) }]);
  const t = await montar(React.createElement(PlanoAcesso, { empresaId: 'cnpj11111111' }));
  try {
    await esperar();
    assert.match(document.querySelector('.acesso-passo-alerta').textContent, /Leve ao compliance/);
    const item = document.querySelector('.acesso-sancoes li');
    assert.equal(item.className, 'vigente');
    assert.match(item.textContent, /CEIS · Impedimento.*Vigente · desde 10\/12\/2024 · até 10\/12\/2028 · Governo do Estado \(RS\)$/, 'a UF não se repete quando o órgão já a traz');
    assert.match(document.querySelector('[aria-label="Diligência"]').textContent, /referência 08\/10\/2026\. Ausência na lista não prova idoneidade/);
  } finally { await t.desmontar(); }
});

test('componente: restrição de contato esconde caminhos, pergunta e registro', async () => {
  servidor([{ metodo: 'GET', url: /\/api\/acesso\/cnpj11111111$/, dados: () => ({ ...P1, restricao: { ativa: true, categoria: 'solicitacao_da_empresa', motivo: 'Pediu para não ser procurada.' },
    passo: { acao: 'nao_contatar', titulo: 'Não contatar', texto: 'Esta empresa está marcada como não contatar.', rascunhos: [], regras: [] } }) }]);
  const t = await montar(React.createElement(PlanoAcesso, { empresaId: 'cnpj11111111' }));
  try {
    await esperar();
    const texto = document.querySelector('.acesso').textContent;
    assert.match(texto, /Não contatar/);
    assert.match(texto, /Nenhum caminho é sugerido enquanto a restrição estiver ativa/);
    assert.ok(!/Você conhece/.test(texto));
    assert.ok(!document.querySelector('form[aria-label="Registrar quem decide"]'));
  } finally { await t.desmontar(); }
});
