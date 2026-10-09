// Ensaio isolado do "encontrar quem decide": banco em memória, catálogo e pessoas fictícios,
// nenhuma chamada externa. `--interface` deixa a tela no ar para conferência no navegador.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bancoDeTeste, criarUsuario } from '../server/tests/ajuda.mjs';
import { criarApp } from '../server/src/app.mjs';
import { criarCatalogo } from '../server/src/agente/catalogo.mjs';
import { servirInterface } from '../server/src/operacao/estatico.mjs';

const interface_ = process.argv.includes('--interface');
const senha = 'Ensaio-local-2026!';
const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-ensaio-encontrar-'));
const arquivo = path.join(pasta, 'base.js');
const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
  'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
const empresa = (raiz, nome, cidade, uf, abertura, socios = 2, pj = 0, estrangeiro = false) => [`cnpj${raiz}`, `${nome} — teste`, `${nome} de Teste Ltda`, raiz, cidade, uf,
  '4684299', [], '02', '2062', 800000, '05', abertura, 2, [uf], socios, pj, estrangeiro, null];
const linhas = [
  empresa('90000001', 'Química Aurora', 'Campinas', 'SP', '1991-03-01'),
  empresa('90000002', 'Solvex Distribuidora', 'São Paulo', 'SP', '1998-07-15', 3, 1),
  empresa('90000003', 'Polímeros Vale', 'Jundiaí', 'SP', '2019-02-01'),
  empresa('90000004', 'Insumos Paulista', 'Sorocaba', 'SP', '1987-11-20'),
  empresa('90000005', 'Atlântica Química', 'Santos', 'SP', '2001-05-05', 4, 0, true),
  empresa('90000006', 'Fluminense Trading', 'Niterói', 'RJ', '1995-01-10'),
];
await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "2026-08";`);

const db = await bancoDeTeste();
const socio = await criarUsuario(db, { email: 'socio@teste.local', nome: 'Helena Sócia (teste)', papel: 'socio', senha });
const app = await criarApp(db, { catalogo: criarCatalogo({ arquivo, arquivoIbama: null }) });
await servirInterface(app, fileURLToPath(new URL('../v1/dist', import.meta.url)));
const host = await app.listen({ host: '127.0.0.1', port: interface_ ? 5189 : 0 });
const cookie = await (async () => {
  const r = await fetch(`${host}/api/sessao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: socio.email, senha }) });
  assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0];
})();
async function chamar(metodo, caminho, corpo) {
  const r = await fetch(`${host}${caminho}`, { method: metodo, headers: { Cookie: cookie, ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json(); assert.ok(r.ok, `${metodo} ${caminho}: ${r.status} ${j.mensagem ?? ''}`); return j;
}
const decisor = (empresaId, nome, cargo, senioridade) => chamar('POST', `/api/acesso/${empresaId}/decisores`, { id: randomUUID(), nome, cargo, senioridade,
  fonte: { tipo: 'site_oficial', descricao: 'Página institucional fictícia do ensaio', url: `https://${empresaId}.exemplo.test/quem-somos` } });
const inserir = (empresaId, nome, cargo, senioridade, origem, referencia = '') => db.query(
  `INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,empresa_id,origem,origem_referencia,criado_por)
   VALUES ($1,'mercado',$2,lower($2),$3,$4,'Empresa fictícia','empresa ficticia',$5,$6,$7,$8)`, [randomUUID(), nome, cargo, senioridade, empresaId, origem, referencia, socio.id]);

try {
  await chamar('POST', '/api/rede/pessoas', { id: randomUUID(), lado: 'ght4', nome: 'Helena Sócia (teste)', usuarioId: socio.id });
  const carla = (await decisor('cnpj90000001', 'Carla Mendes (fictícia)', 'Sócia-administradora', 'ceo')).pessoa;
  await decisor('cnpj90000002', 'Rui Teixeira (fictício)', 'Diretor-presidente', 'ceo');
  await inserir('cnpj90000002', 'Lia Campos (fictícia)', 'Diretora comercial', 'diretoria', 'importacao', 'Lista fictícia da equipe');
  await inserir('cnpj90000003', 'Otto Prado (fictício)', 'Sócio', 'conselho', 'cadastro_publico');
  await inserir('cnpj90000005', 'Bento Reis (fictício)', 'Gerente de compras', 'gerencia', 'importacao', 'Lista fictícia da equipe');
  await chamar('POST', '/api/rede/reconhecimento', { id: randomUUID(), pessoaAlvoId: carla.id, resposta: 'posso_apresentar', evidencia: 'Relação fictícia criada para o ensaio visual.' });

  const r = await chamar('POST', '/api/encontrar', { pedido: 'Quem decide nas distribuidoras de SP com mais de 20 anos' });
  // Rodada 27: o diretor-presidente dirige, mas o cargo não mostra participação; vai para revisão.
  assert.deepEqual(r.grupos.forte.map((p) => p.nome), ['Carla Mendes (fictícia)']);
  assert.deepEqual(r.grupos.revisar.find((p) => p.nome.startsWith('Rui')).pendencias, ['Decide a venda']);
  assert.equal(r.grupos.forte.find((p) => p.nome.startsWith('Carla')).caminho.categoria, 'introducao_viavel');
  assert.ok(r.lacunas.empresas.some((l) => l.empresa.id === 'cnpj90000004'), 'Insumos Paulista: ninguém mapeado');
  // Rodada 22: empresa pelo nome e pessoa só com o nome da organização, à espera do vínculo ao CNPJ.
  const peloNome = await chamar('POST', '/api/encontrar', { pedido: 'Quem decide na Química Aurora' });
  assert.deepEqual(peloNome.grupos.forte.map((p) => p.nome), ['Carla Mendes (fictícia)']);
  const semCnpj = (await chamar('POST', '/api/rede/pessoas', { id: randomUUID(), lado: 'mercado', nome: 'Davi Lopes (fictício)', cargo: 'Diretor financeiro',
    senioridade: 'cfo', organizacao: 'Aurora Química Ltda.' })).pessoa;
  const sugestoes = await chamar('GET', `/api/rede/pessoas/${semCnpj.id}/empresas-sugeridas`);
  assert.equal(sugestoes.empresas[0]?.id, 'cnpj90000001', 'a Química Aurora é a sugestão mais parecida');
  // Rodada 23: o find dentro de uma pesquisa por tese só de cadastro (o resultado sai na hora).
  const pesquisaId = randomUUID();
  const { pesquisa } = await chamar('POST', '/api/pesquisas', { id: pesquisaId, tese: 'Distribuidoras de SP com mais de 20 anos' });
  await chamar('POST', `/api/pesquisas/${pesquisaId}/iniciar`, { versao: pesquisa.versao });
  const naPesquisa = await chamar('POST', '/api/encontrar', { pedido: 'Quem decide', pesquisaId });
  assert.ok(naPesquisa.leitura.pesquisa?.empresas > 0, 'a pesquisa tem aderentes');
  assert.ok(naPesquisa.grupos.forte.some((p) => p.nome.startsWith('Carla')));
  // Rodada 26: um de cada, com a cobertura por papel, e o pedido ambíguo (sem IA no ensaio, a dica é reescrever).
  const umDeCada = await chamar('POST', '/api/encontrar', { pedido: 'O CEO e o diretor comercial das distribuidoras de SP' });
  assert.deepEqual(umDeCada.cobertura.map((c) => c.rotulo), ['CEO ou presidente', 'Diretoria · comercial']);
  assert.ok(umDeCada.lacunas.empresas.some((l) => l.faltam?.length));
  const ambiguo = await chamar('POST', '/api/encontrar', { pedido: 'Chefe de compras das distribuidoras de SP' });
  assert.ok(ambiguo.leitura.ambiguidades.length > 0);
  assert.equal(ambiguo.ia.disponivel, false);
  if (interface_) {
    console.log(`Ensaio visual isolado em ${host}. PID ${process.pid}. Conta socio@teste.local; senha exclusivamente sintética: ${senha}`);
    await new Promise((resolve) => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
  } else console.log('Ensaio aprovado: pedido, triagem, introdução viável e lacuna, com catálogo e pessoas fictícios. Banco descartado.');
} finally {
  await app.close(); await db.close(); await rm(pasta, { recursive: true, force: true });
}
