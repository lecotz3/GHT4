// Catálogo público real; contas e trabalhos descartáveis. Nunca conecta ao banco de produção.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { bancoDeTeste, criarUsuario } from '../server/tests/ajuda.mjs';
import { criarApp } from '../server/src/app.mjs';
import { criarCatalogo } from '../server/src/agente/catalogo.mjs';
import { criarCatalogoBanco } from '../server/src/agente/catalogo-banco.mjs';
import { importarCatalogo } from '../server/src/agente/importar-catalogo.mjs';
import { servirInterface } from '../server/src/operacao/estatico.mjs';

const db = await bancoDeTeste();
let app;
try {
  const texto = await readFile(new URL('../data-quimicos.js', import.meta.url), 'utf8');
  const textoIbama = await readFile(new URL('../data-ibama.js', import.meta.url), 'utf8');
  const carga = await importarCatalogo(db, { texto, textoIbama });
  const esperado = await criarCatalogo().buscar({ limite: 12 });
  const ampliado = await criarCatalogo().buscar({ incluirPossiveis: true, limite: 0 });
  assert.equal(carga.total, esperado.totalOrigem);
  const segundaCarga = await importarCatalogo(db, { texto, textoIbama });
  assert.equal(segundaCarga.reutilizado, true);
  assert.equal(segundaCarga.snapshotId, carga.snapshotId);

  const senha = 'Ensaio-local-2026!';
  const usuario = await criarUsuario(db, { email: 'operador@teste.local', nome: 'Operador de teste', papel: 'admin', senha });
  app = await criarApp(db, { catalogo: criarCatalogoBanco(db) });
  await servirInterface(app, fileURLToPath(new URL('../v1/dist', import.meta.url)));
  const host = await app.listen({ host: '127.0.0.1', port: process.argv.includes('--interface') ? 5188 : 0 });
  async function entrar() {
    const r = await fetch(`${host}/api/sessao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: usuario.email, senha }) });
    assert.equal(r.status, 200);
    return r.headers.get('set-cookie').split(';')[0];
  }
  let cookie = await entrar();
  async function chamar(method, caminho, body) {
    const r = await fetch(`${host}${caminho}`, { method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    assert.ok(r.ok, `${method} ${caminho}: ${r.status} ${j.mensagem ?? ''}`);
    return j;
  }
  assert.equal((await fetch(`${host}/api/agente/empresas`)).status, 401);
  const { base } = await chamar('GET', '/api/agente');
  assert.deepEqual(base, { disponivel: true, total: esperado.total, referencia: esperado.referencia, totalOrigem: esperado.totalOrigem, fonte: esperado.fonte, subsetor: esperado.subsetor });
  const primeira = await chamar('GET', '/api/agente/empresas');
  assert.deepEqual(primeira.empresas.map(e => e.id), esperado.empresas.map(e => e.id));
  const proxima = await chamar('GET', `/api/agente/empresas?offset=${primeira.proximoOffset}&catalogoHash=${primeira.hashPaginacao}`);
  assert.equal(new Set([...primeira.empresas, ...proxima.empresas].map(e => e.id)).size, 24);
  assert.equal((await chamar('GET', '/api/agente/empresas?incluirPossiveis=true')).total, ampliado.total);
  const filtro = await chamar('GET', '/api/agente/empresas?busca=Adequim&uf=SP');
  assert.ok(filtro.empresas.some(e => e.id === 'cnpj02929140'));
  assert.ok(filtro.empresas.every(e => e.uf === 'SP' && e.receita === null));
  assert.equal((await chamar('GET', '/api/agente/empresas?busca=Adequim&uf=AC')).total, 0);
  const id = randomUUID();
  await chamar('POST', '/api/agente/conversas', { id, titulo: 'Validação do catálogo real' });
  const busca = await chamar('POST', `/api/agente/conversas/${id}/mensagens`, {
    chave: randomUUID(), versao: 0, tarefa: 'buscar_empresas', contexto: { busca: 'Adequim', uf: 'SP' },
  });
  assert.ok(busca.turno.resultado.empresas.some(e => e.id === 'cnpj02929140'));
  cookie = await entrar();
  const retomado = await chamar('GET', `/api/agente/conversas/${id}`);
  assert.equal(retomado.turnos.length, 1);
  assert.equal(retomado.conversa.contexto.busca, 'Adequim');
  // Pesquisa por tese sobre o catálogo real: proposta, funil cadastral e itens (sem ler sites).
  const pesquisaId = randomUUID();
  const rascunho = await chamar('POST', '/api/pesquisas', { id: pesquisaId, tese: 'Distribuidoras em SP com mais de 15 anos, sem sócio estrangeiro, com filiais' });
  assert.equal(rascunho.pesquisa.filtros.uf, 'SP');
  assert.ok(rascunho.pesquisa.criterios.every(c => c.tipo === 'cadastro'));
  const previa = await chamar('POST', `/api/pesquisas/${pesquisaId}/previa`, { criterios: rascunho.pesquisa.criterios, filtros: rascunho.pesquisa.filtros });
  assert.ok(previa.funil.aprovadasCadastro > 0 && previa.funil.aprovadasCadastro < previa.funil.recorte && previa.funil.semAtributos === 0);
  const aplicada = await chamar('POST', `/api/pesquisas/${pesquisaId}/iniciar`, { versao: rascunho.pesquisa.versao });
  assert.equal(aplicada.pesquisa.estado, 'concluida');
  assert.equal(aplicada.contagens.aderente, previa.funil.aprovadasCadastro);
  console.log(`Pesquisa por tese: ${previa.funil.recorte} no recorte SP → ${previa.funil.aprovadasCadastro} atendem aos critérios cadastrais.`);
  console.log(`Catálogo real aprovado: ${base.totalOrigem} registros de origem; ${base.total} empresas no recorte; ${ampliado.total} incluindo possíveis; referência ${base.referencia}. Carga idempotente, autenticação, filtros, paginação e retomada conferidos.`);
  if (process.argv.includes('--interface')) {
    console.log(`Interface em ${host}. PID ${process.pid}. Conta de teste: ${usuario.email}; senha exclusivamente sintética: ${senha}`);
    await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  }
} finally {
  await app?.close();
  await db.close();
}
