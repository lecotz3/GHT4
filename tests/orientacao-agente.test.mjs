import test from 'node:test';
import assert from 'node:assert/strict';
import { impedimentoDaTarefa } from '../v1/src/agente/orientacao.ts';

const estado = { base: { disponivel: true }, iaConfigurada: false, ia: null };
const empresa = { empresaId: 'cnpj12345678', frente: 'venda' };
const motivo = (tarefa, contexto = {}, texto = '', configuracao = estado, permite = true) => impedimentoDaTarefa(tarefa, contexto, texto, configuracao, permite);

test('reunião e acesso explicam a seleção ausente e liberam a empresa escolhida sem IA', () => {
  for (const tarefa of ['preparar_reuniao', 'mapear_acesso']) {
    assert.match(motivo(tarefa), /selecione uma empresa/);
    assert.equal(motivo(tarefa, empresa), null);
  }
});
test('pesquisa cadastral e interpretação local continuam utilizáveis sem IA', () => {
  assert.equal(motivo('buscar_empresas'), null);
  assert.equal(motivo('interpretar_busca', {}, 'Distribuidoras em SP para compra'), null);
  assert.match(motivo('interpretar_busca', {}, '   SP   '), /10 caracteres/);
});
test('conversa e web distinguem falta de integração, falta de web e pedido curto', () => {
  assert.match(motivo('conversar', {}, 'Explique o mercado'), /IA configurada/);
  const comIA = { ...estado, iaConfigurada: true, ia: { web: false } };
  assert.match(motivo('pesquisar_web', {}, 'Pesquise fontes públicas', comIA), /web ainda não/);
  assert.match(motivo('conversar', {}, 'Ajude', comIA), /10 caracteres/);
  assert.equal(motivo('conversar', {}, 'Explique o mercado', comIA), null);
  assert.equal(motivo('pesquisar_web', {}, 'Pesquise fontes públicas', { ...comIA, ia: { web: true } }), null);
});
test('perfil de consulta e desconexão nunca liberam uma execução', () => {
  assert.match(motivo('buscar_empresas', {}, '', estado, false), /perfil permite consulta/);
  assert.match(motivo('buscar_empresas', {}, '', null), /Aguarde/);
});
test('catálogo indisponível não bloqueia o registro e a revisão de próximos passos', () => {
  const semBase = { ...estado, base: { disponivel: false } };
  assert.match(motivo('buscar_empresas', {}, '', semBase), /catálogo/);
  assert.equal(motivo('ver_pendencias', {}, '', semBase), null);
  assert.equal(motivo('registrar_passo', {}, 'Confirmar a reunião', semBase), null);
  assert.match(motivo('registrar_passo', {}, '  ', semBase), /Escreva a ação/);
});
