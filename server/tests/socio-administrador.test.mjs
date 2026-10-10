/* O sócio-administrador das limitadas no "Quem decide" (decisão da casa de 10/10/2026). No aceite em
   produção, só com o recorte estatutário, nenhuma das 26 pessoas atendeu: eram todas de S.A. Na
   limitada de poucos sócios, quem tem cota e administra decide a venda; com o capital dividido, não
   basta. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { interpretarPedido } from '../src/encontrar/pedido.mjs';
import { avaliarEmpresa, julgarPessoa } from '../src/encontrar/triagem.mjs';

const REF = '2026-08';
const contexto = (empresa) => ({ empresa, avaliacao: avaliarEmpresa(empresa, [], REF), caminho: null, incompletos: 0,
  respostas: 0, negativas: 0, membros: 1, restricao: null });
const doQuadro = (empresa, cargo = 'Sócio-administrador') => {
  const p = { id: randomUUID(), nome: 'Carlos Nunes', cargo, senioridade: 'ceo', origem: 'cadastro_publico',
    origem_referencia: 'RFB CNPJ 2026-08 · qualificação 49 · no quadro desde 2009-03-11', empresa_id: empresa.id };
  return { ...p, quadro: { nome: p.nome, cargo: p.cargo, senioridade: p.senioridade, empresaId: empresa.id } };
};
const limitada = (qtdSocios, qtdSociosPj = 0) => ({ id: 'cnpj12345678', nome: 'Química Alfa Ltda', cnpjRaiz: '12345678',
  atributos: { naturezaJuridica: '2062', qtdSocios, qtdSociosPj } });
const linha = (julgada, requisito) => julgada.juizo.find((l) => l.requisito === requisito);

test('sócio-administrador de limitada com poucos sócios decide a venda, com a fonte do quadro', () => {
  const empresa = limitada(2);
  const julgada = julgarPessoa(doQuadro(empresa), contexto(empresa), interpretarPedido('Quem decide'));
  assert.equal(julgada.grupo, 'forte');
  assert.equal(linha(julgada, 'Decide a venda').julgamento, 'atende');
  assert.equal(linha(julgada, 'Cargo com fonte').julgamento, 'atende');
  assert.match(linha(julgada, 'Cargo com fonte').informacao, /quadro societário público/);
  // O sócio único também.
  assert.equal(julgarPessoa(doQuadro(limitada(1)), contexto(limitada(1)), interpretarPedido('Quem decide')).grupo, 'forte');
});

test('com o capital dividido (mais de três sócios ou sócio pessoa jurídica), o sócio-administrador fica para revisar', () => {
  for (const empresa of [limitada(5), limitada(3, 1)]) {
    const julgada = julgarPessoa(doQuadro(empresa), contexto(empresa), interpretarPedido('Quem decide'));
    assert.equal(julgada.grupo, 'revisar', JSON.stringify(empresa.atributos));
    assert.equal(linha(julgada, 'Decide a venda').julgamento, 'indicio');
    assert.match(linha(julgada, 'Decide a venda').informacao, /tem participação, mas o capital se divide/);
  }
});
