import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';
import { criarApp } from '../src/app.mjs';
import { importarCatalogo } from '../src/agente/importar-catalogo.mjs';
import { criarCatalogoBanco } from '../src/agente/catalogo-banco.mjs';
import { importarEventos } from '../src/agente/eventos.mjs';

const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
  'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro'];
const linha = (raiz, nome, abertura) => [`cnpj${raiz}`, nome, `${nome} Ltda`, raiz, 'Campinas', 'SP', '4684299', [], '02', '2062', 500000, '05', abertura, 1, ['SP'], 2, 0, false];
const fonte = (referencia, linhas) => `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${referencia}";`;
const BASE = [linha('11111111', 'Alfa Química', '1990-01-01'), linha('22222222', 'Beta Química', '2020-01-01'), linha('33333333', 'Gama Química', '1988-01-01')];
const mes = (d) => { const x = new Date(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + d); return x.toISOString().slice(0, 7); };

async function preparar(t) {
  const db = await bancoDeTeste();
  await importarCatalogo(db, { texto: fonte('2026-08', BASE), versaoRegras: 'teste' });
  const app = await criarApp(db, { catalogo: criarCatalogoBanco(db) });
  t.after(async () => { await app.close(); await db.close(); });
  const entrar = async (email, papel = 'analista') => {
    await criarUsuario(db, { email, senha: 'senha-de-teste', papel });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha: 'senha-de-teste' } });
    const cookie = r.headers['set-cookie'].split(';')[0];
    return (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
  };
  return { db, entrar };
}

test('monitoramento semanal: linha de base, empresa nova e evento novo viram aviso no Meu dia, uma vez só', async (t) => {
  const { db, entrar } = await preparar(t);
  const chamar = await entrar('monitor@teste.local');
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos' })).json();
  assert.equal(pesquisa.filtros.subsetor, 'Distribuição e trading químico');
  const rascunho = await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true });
  assert.equal(rascunho.statusCode, 409, 'rascunho não é monitorado');
  const iniciada = (await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao })).json();
  assert.deepEqual(iniciada.itens.map((i) => i.empresa_id).sort(), ['cnpj11111111', 'cnpj33333333'], 'só as com mais de 20 anos');
  assert.equal(iniciada.monitoramento, null);

  const ligado = (await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).json().monitoramento;
  assert.equal(ligado.ativo, true);
  assert.ok(new Date(ligado.proximaEm) - Date.now() > 6.9 * 864e5, 'próxima verificação em uma semana');
  assert.equal((await chamar('GET', `/api/pesquisas/${id}`)).json().monitoramento.ativo, true);
  const base = (await db.query('SELECT conhecidas FROM monitoramentos_tese WHERE pesquisa_id=$1', [id])).rows[0].conhecidas;
  assert.deepEqual(base, ['cnpj11111111', 'cnpj33333333'], 'linha de base: o que a pessoa já viu');
  // Antes do vencimento, nada roda.
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().verificados, 0);
  assert.deepEqual((await chamar('GET', '/api/inicio')).json().teses, { monitoradas: 1, itens: [] });

  // Um mês depois: publicação nova com uma empresa que passa a atender, e evento societário na Alfa.
  await importarCatalogo(db, { texto: fonte('2026-09', [...BASE, linha('44444444', 'Delta Química', '1995-01-01')]), versaoRegras: 'teste' });
  await importarEventos(db, { texto: `const EVENTOS_CNPJ = ${JSON.stringify({ de: mes(-2), ate: mes(-1), eventos: [{ base: '11111111', tipo: 'aumento_de_capital', rotulo: 'Aumento de capital', detalhe: '1 → 3', ambiguidade: 'y' }] })};\n` });
  await db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  const v = (await chamar('POST', '/api/monitoramentos/verificar')).json();
  assert.deepEqual(v, { verificados: 1, falhas: 0 });
  const novidades = (await db.query('SELECT empresa_id,tipo FROM monitoramento_novidades ORDER BY tipo,empresa_id')).rows;
  assert.deepEqual(novidades, [{ empresa_id: 'cnpj11111111', tipo: 'evento' }, { empresa_id: 'cnpj44444444', tipo: 'nova' }]);
  const inicio = (await chamar('GET', '/api/inicio')).json().teses;
  assert.equal(inicio.monitoradas, 1);
  assert.equal(inicio.itens.length, 1);
  assert.deepEqual({ ...inicio.itens[0], detectadoEm: undefined, titulo: undefined },
    { pesquisaId: id, tese: 'Distribuidoras com mais de 20 anos', novas: 1, eventos: 1, exemplos: ['Delta Química', 'Alfa Química'], detectadoEm: undefined, titulo: undefined });
  const resultado = (await chamar('GET', `/api/pesquisas/${id}`)).json().monitoramento.ultimoResultado;
  assert.equal(resultado.totalNovas, 1); assert.equal(resultado.novas[0].nome, 'Delta Química');
  assert.equal(resultado.eventos[0].nome, 'Alfa Química');
  // Logo em seguida, não roda de novo (outra aba, recarga).
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().verificados, 0);

  // Abrir a pesquisa pelo aviso marca como visto; outra pessoa não marca nem vê.
  const intruso = await entrar('intruso-monitor@teste.local');
  assert.equal((await intruso('POST', `/api/pesquisas/${id}/novidades/vistas`)).statusCode, 404);
  assert.equal((await intruso('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: false })).statusCode, 404);
  assert.deepEqual((await intruso('GET', '/api/inicio')).json().teses, { monitoradas: 0, itens: [] });
  assert.deepEqual((await chamar('POST', `/api/pesquisas/${id}/novidades/vistas`)).json(), { vistas: 2 });
  assert.deepEqual((await chamar('GET', '/api/inicio')).json().teses.itens, []);

  // Semana seguinte sem mudança: a linha de base avançou, nada se repete.
  await db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().verificados, 1);
  assert.equal((await db.query('SELECT count(*)::int n FROM monitoramento_novidades')).rows[0].n, 2);
  assert.deepEqual((await chamar('GET', '/api/inicio')).json().teses.itens, []);

  // Desligar para; leitura não liga.
  assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: false })).json().monitoramento.ativo, false);
  await db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().verificados, 0);
  assert.equal((await chamar('GET', '/api/inicio')).json().teses.monitoradas, 0);
  const leitor = await entrar('leitor-monitor@teste.local', 'leitura');
  assert.equal((await leitor('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).statusCode, 403);
});

test('monitoramento: falha ao verificar tenta de novo em uma hora, sem perder a semana', async (t) => {
  const { db, entrar } = await preparar(t);
  const chamar = await entrar('falha-monitor@teste.local');
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos' })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
  await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true });
  await db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  // Catálogo sem publicação ativa: o recorte falha.
  await db.query('UPDATE catalogo_controle SET snapshot_id=NULL');
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar')).json(), { verificados: 1, falhas: 1 });
  const m = (await db.query("SELECT proxima_em - now() < interval '61 minutes' AS breve, verificado_em FROM monitoramentos_tese")).rows[0];
  assert.equal(m.breve, true); assert.equal(m.verificado_em, null);
  assert.equal((await db.query('SELECT count(*)::int n FROM monitoramento_novidades')).rows[0].n, 0);
});
