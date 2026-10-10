/* Regressões do parecer do Codex sobre as Rodadas 26 e 27 (AI_COLLAB.md, commit b1cc7e0), na parte
   da Rodada 27 que ficou parcial: negação com área ou ", e", cidade em alternativa sem repetir a
   locução e o dono pelo cargo. As da Rodada 26 estão em encontrar-ia.test.mjs ("28 [P1]"/"28 [P2]"). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { interpretarPedido } from '../src/encontrar/pedido.mjs';
import { avaliarEmpresa, julgarPessoa } from '../src/encontrar/triagem.mjs';
import { interpretarTese, verificarCadastro } from '../src/pesquisa/criterios.mjs';
import { posicaoNaDecisao, estruturaDeDecisao } from '../src/acesso/plano.mjs';

const REF = '2026-08';
const contexto = (empresa) => ({ empresa, avaliacao: avaliarEmpresa(empresa, [], REF), caminho: null, incompletos: 0,
  respostas: 0, negativas: 0, membros: 1, restricao: null });
const pessoa = (cargo, senioridade, empresa) => ({ id: randomUUID(), nome: 'Pessoa do teste', cargo, senioridade, origem: 'manual',
  origem_referencia: 'Página institucional: cargo', empresa_id: empresa.id });

test('27 [P2]: a negação alcança o cargo com área e a enumeração fechada por ", e", até o grupo final', () => {
  const alfa = { id: 'cnpj11111111', nome: 'Alfa', cnpjRaiz: '11111111' };
  const grupo = (pedido, cargo, senioridade) => julgarPessoa(pessoa(cargo, senioridade, alfa), contexto(alfa), interpretarPedido(pedido)).grupo;

  const comArea = interpretarPedido('CEOs sem gerentes comerciais e diretores');
  assert.deepEqual(comArea.papel.senioridades, ['ceo']);
  assert.deepEqual(comArea.papel.excluidas.sort(), ['diretoria', 'gerencia']);
  assert.equal(grupo('CEOs sem gerentes comerciais e diretores', 'Diretor Comercial', 'diretoria'), 'excluido');

  const enumeracao = interpretarPedido('CFOs exceto CEOs, gerentes, e conselheiros');
  assert.deepEqual(enumeracao.papel.senioridades, ['cfo']);
  assert.deepEqual(enumeracao.papel.excluidas.sort(), ['ceo', 'conselho', 'gerencia']);
  assert.equal(grupo('CFOs exceto CEOs, gerentes, e conselheiros', 'Conselheiro', 'conselho'), 'excluido');
  // Com a negação já em lista, a vírgula antes dela não reabre o último cargo.
  assert.deepEqual(interpretarPedido('CFOs, exceto CEOs, gerentes, e conselheiros').papel.excluidas.sort(), ['ceo', 'conselho', 'gerencia']);

  // A oração intercalada de um cargo continua fechando em ", e": o CFO volta a ser pedido.
  assert.deepEqual(interpretarPedido('CEOs, sem gerentes, e CFOs').papel.senioridades.sort(), ['ceo', 'cfo']);
  assert.deepEqual(interpretarPedido('CEOs, sem gerentes comerciais, e CFOs').papel.senioridades.sort(), ['ceo', 'cfo']);
  assert.deepEqual(interpretarPedido('CFOs exceto CEOs e gerentes').papel.excluidas.sort(), ['ceo', 'gerencia']);
});

test('27 [P2]: cidade explícita seguida de outra sem a locução vale para as duas, positiva ou negada', () => {
  const municipios = new Set(['campinas', 'osasco']);
  const campinas = { cidade: 'Campinas', uf: 'SP' }, osasco = { cidade: 'Osasco', uf: 'SP' }, santos = { cidade: 'Santos', uf: 'SP' };
  const regraDe = (r) => r.criterios.filter((c) => /municipio/.test(c.regra?.campo ?? '')).map((c) => c.regra);
  for (const [texto, regra, esperado] of [
    ['Distribuidoras na cidade de Campinas ou Osasco', { campo: 'municipios', valor: ['Campinas', 'Osasco'] },
      { campinas: 'atende', osasco: 'atende', santos: 'nao_atende' }],
    ['Distribuidoras fora da cidade de Campinas ou Osasco', { campo: 'municipio_fora', valor: ['Campinas', 'Osasco'] },
      { campinas: 'nao_atende', osasco: 'nao_atende', santos: 'atende' }],
  ]) {
    assert.deepEqual(regraDe(interpretarTese(texto, { municipios })), [regra], `tese: ${texto}`);
    assert.deepEqual(regraDe(interpretarPedido(`Quem decide nas ${texto.replace(/^Distribuidoras/, 'distribuidoras')}`, { municipios })), [regra], `find: ${texto}`);
    for (const [nome, v] of Object.entries(esperado)) assert.equal(verificarCadastro(regra, { campinas, osasco, santos }[nome], REF).veredito, v, `${texto} · ${nome}`);
  }
  // A outra cidade fora do catálogo: a alternativa fica incompleta, sem filtro destrutivo, com nota.
  const incompleta = interpretarTese('Distribuidoras na cidade de Campinas ou Jundiaí', { municipios });
  assert.deepEqual(regraDe(incompleta), []);
  assert.ok(incompleta.notas.some((n) => /"Jundiaí"/.test(n) && /não virou filtro/.test(n)), incompleta.notas.join(' | '));
  // Sem o catálogo de municípios, o mesmo: nada de valer só Campinas.
  assert.deepEqual(regraDe(interpretarTese('Distribuidoras fora da cidade de Campinas ou Osasco', {})), []);
  // E o que já funcionava continua.
  assert.deepEqual(regraDe(interpretarTese('Distribuidoras na cidade de Campinas e com mais de 20 anos', { municipios })), [{ campo: 'municipio', valor: 'Campinas' }]);
});

test('27 [P2]: negar a participação ou declará-la minoritária não prova que a pessoa vende o controle', () => {
  const sa = { id: 'cnpj22222222', nome: 'Beta S.A.', cnpjRaiz: '22222222', atributos: { naturezaJuridica: '2054', qtdSocios: 5, qtdSociosPj: 0 } };
  const estrutura = estruturaDeDecisao(sa.atributos, REF);
  // Na S.A., ser acionista ou sócio sem dizer que controla também não basta.
  for (const cargo of ['Presidente, não sócio', 'Presidente e acionista minoritário', 'Sócio minoritário', 'Conselheiro titular', 'Presidente e acionista', 'CEO e sócio']) {
    assert.notEqual(posicaoNaDecisao(cargo === 'Conselheiro titular' ? 'conselho' : 'ceo', estrutura, cargo).id, 'decide', cargo);
    const julgada = julgarPessoa(pessoa(cargo, cargo === 'Conselheiro titular' ? 'conselho' : 'ceo', sa), contexto(sa), interpretarPedido('Quem decide'));
    assert.equal(julgada.grupo, 'revisar', cargo);
    assert.notEqual(julgada.juizo.find((l) => l.requisito === 'Decide a venda').julgamento, 'atende', cargo);
  }
  for (const cargo of ['Acionista controlador', 'Sócio controlador', 'Acionista majoritário', 'Presidente e dono']) assert.equal(posicaoNaDecisao('ceo', estrutura, cargo).id, 'decide', cargo);
  const acionista = julgarPessoa(pessoa('Presidente e acionista', 'ceo', sa), contexto(sa), interpretarPedido('Quem decide'));
  assert.match(acionista.juizo.find((l) => l.requisito === 'Decide a venda').informacao, /tem participação, mas o capital se divide/);
  // Numa limitada de dois sócios, o sócio que preside continua decidindo; sem estrutura, como antes.
  assert.equal(posicaoNaDecisao('ceo', estruturaDeDecisao({ naturezaJuridica: '2062', qtdSocios: 2, qtdSociosPj: 0 }, REF), 'Presidente e sócio').id, 'decide');
  assert.equal(posicaoNaDecisao('ceo', null, 'CEO e acionista').id, 'decide');
});
