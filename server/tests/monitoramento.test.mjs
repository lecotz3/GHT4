import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso } from './ajuda.mjs';
import { verificarVencidos, definirMonitoramento } from '../src/pesquisa/monitoramento.mjs';
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

/* `gancho.antes(filtros)` roda no meio de cada recorte: revogar acesso, encerrar a sessão ou
   simular indisponibilidade enquanto a rota calcula. */
async function preparar(t) {
  const db = await bancoDeTeste();
  await importarCatalogo(db, { texto: fonte('2026-08', BASE), versaoRegras: 'teste' });
  const base = criarCatalogoBanco(db);
  const gancho = { antes: null };
  const catalogo = { ...base, recorte: async (...args) => { if (gancho.antes) await gancho.antes(...args); return base.recorte(...args); } };
  const app = await criarApp(db, { catalogo });
  t.after(async () => { await app.close(); await db.close(); });
  const entrar = async (email, papel = 'analista') => {
    await criarUsuario(db, { email, senha: 'senha-de-teste', papel });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha: 'senha-de-teste' } });
    const cookie = r.headers['set-cookie'].split(';')[0];
    return (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
  };
  return { db, entrar, gancho };
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
  assert.deepEqual(v, { verificados: 1, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
  const novidades = (await db.query('SELECT empresa_id,tipo FROM monitoramento_novidades ORDER BY tipo,empresa_id')).rows;
  assert.deepEqual(novidades, [{ empresa_id: 'cnpj11111111', tipo: 'evento' }, { empresa_id: 'cnpj44444444', tipo: 'nova' }]);
  const inicio = (await chamar('GET', '/api/inicio')).json().teses;
  assert.equal(inicio.monitoradas, 1);
  assert.equal(inicio.itens.length, 1);
  const { detectadoEm, titulo, ateId, ...resto } = inicio.itens[0];
  assert.deepEqual(resto, { pesquisaId: id, tese: 'Distribuidoras com mais de 20 anos', novas: 1, eventos: 1, aConferir: 0, exemplos: ['Delta Química', 'Alfa Química'], parcial: false });
  assert.ok(ateId > 0 && detectadoEm && titulo);
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

test('monitoramento: falha fica registrada até o próximo sucesso; chamada sem execução não a apaga; nova tentativa pedida tem intervalo mínimo', async (t) => {
  const { db, entrar } = await preparar(t);
  const chamar = await entrar('falha-monitor@teste.local');
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos' })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
  await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true });
  await db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  // Catálogo sem publicação ativa: o recorte falha.
  const ativa = (await db.query('SELECT snapshot_id FROM catalogo_controle')).rows[0].snapshot_id;
  await db.query('UPDATE catalogo_controle SET snapshot_id=NULL');
  const falha = (await chamar('POST', '/api/monitoramentos/verificar')).json();
  assert.deepEqual([falha.verificados, falha.falhas, falha.emFalha], [0, 1, 1], 'falha não conta como verificada');
  const m = (await db.query("SELECT proxima_em - now() < interval '61 minutes' AS breve, proxima_em, verificado_em, falha_em FROM monitoramentos_tese")).rows[0];
  assert.equal(m.breve, true); assert.equal(m.verificado_em, null); assert.ok(m.falha_em);
  assert.equal(new Date(falha.proximaTentativa).getTime(), new Date(m.proxima_em).getTime(), 'informa a tentativa agendada');
  assert.equal((await db.query('SELECT count(*)::int n FROM monitoramento_novidades')).rows[0].n, 0);
  assert.ok((await chamar('GET', `/api/pesquisas/${id}`)).json().monitoramento.falhaEm, 'o detalhe mostra a falha');
  // Chamada logo depois (recarga do Meu dia): nada executa, e a falha continua.
  const nada = (await chamar('POST', '/api/monitoramentos/verificar')).json();
  assert.deepEqual([nada.verificados, nada.falhas, nada.emFalha], [0, 0, 1], 'zero execuções não é recuperação');
  // Nova tentativa pedida logo em seguida: dentro do intervalo mínimo, não executa.
  const cedo = (await chamar('POST', '/api/monitoramentos/verificar', { repetir: true })).json();
  assert.deepEqual([cedo.verificados, cedo.falhas, cedo.emFalha], [0, 0, 1]);
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar', { repetir: 'sim' })).statusCode, 422);
  // Passado o intervalo, o pedido executa; ainda indisponível, a falha é renovada.
  await db.query("UPDATE monitoramentos_tese SET falha_em=now()-interval '1 minute'");
  const outra = (await chamar('POST', '/api/monitoramentos/verificar', { repetir: true })).json();
  assert.deepEqual([outra.verificados, outra.falhas, outra.emFalha], [0, 1, 1]);
  // Catálogo de volta: a nova tentativa pedida recupera de fato.
  await db.query('UPDATE catalogo_controle SET snapshot_id=$1', [ativa]);
  await db.query("UPDATE monitoramentos_tese SET falha_em=now()-interval '1 minute'");
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar', { repetir: true })).json(), { verificados: 1, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
  const ok = (await db.query("SELECT verificado_em, falha_em, proxima_em - now() > interval '6 days' AS semana FROM monitoramentos_tese")).rows[0];
  assert.ok(ok.verificado_em); assert.equal(ok.falha_em, null); assert.equal(ok.semana, true);
  // Sem falha registrada, o pedido de repetição não antecipa a semana.
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar', { repetir: true })).json(), { verificados: 0, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
});

test('monitoramento: sucesso e falha na mesma chamada; a falha continua registrada mesmo com outra tese verificada', async (t) => {
  const { db, entrar, gancho } = await preparar(t);
  const chamar = await entrar('misto-monitor@teste.local');
  const ids = [];
  for (const tese of ['Distribuidoras com mais de 20 anos', 'Distribuidoras com mais de 20 anos em SP']) {
    const id = randomUUID(); ids.push(id);
    const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese })).json();
    await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
    assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).statusCode, 200);
  }
  await db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  gancho.antes = async (filtros) => { if (filtros.uf === 'SP') throw new Error('recorte indisponível'); };
  const r = (await chamar('POST', '/api/monitoramentos/verificar')).json();
  assert.deepEqual([r.verificados, r.falhas, r.emFalha], [1, 1, 1]);
  assert.ok((await chamar('GET', `/api/pesquisas/${ids[1]}`)).json().monitoramento.falhaEm);
  assert.equal((await chamar('GET', `/api/pesquisas/${ids[0]}`)).json().monitoramento.falhaEm, null);
});

test('nova tentativa em andamento não apaga a falha: outra aba vê "falhou, em andamento"; falha tardia mantém o registro; só o sucesso apaga', async (t) => {
  const { db, entrar, gancho } = await preparar(t);
  const chamar = await entrar('andamento-monitor@teste.local');
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos' })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
  await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true });
  await db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  gancho.antes = async () => { throw new Error('recorte indisponível'); };
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().falhas, 1);
  await db.query("UPDATE monitoramentos_tese SET falha_em=now()-interval '1 minute'");
  const estado = async () => (await db.query('SELECT falha_em, reservada_ate > now() AS reservada, verificado_em FROM monitoramentos_tese')).rows[0];
  // A primeira nova tentativa fica presa no recorte.
  let soltar, chegou;
  const noRecorte = new Promise((r) => { chegou = r; });
  // Segura só o primeiro recorte: um segundo cálculo indevido passaria direto e apareceria na asserção, sem travar o teste.
  let segurou = false;
  gancho.antes = () => { if (segurou) return undefined; segurou = true; return new Promise((resolve, reject) => { chegou(); soltar = (ok) => (ok ? resolve() : reject(new Error('falhou de novo'))); }); };
  const primeira = chamar('POST', '/api/monitoramentos/verificar', { repetir: true });
  await noRecorte;
  const durante = await estado();
  assert.ok(durante.falha_em, 'a falha continua registrada durante a nova tentativa');
  assert.equal(durante.reservada, true);
  // Outra aba (ou segundo pedido) durante o cálculo: nada executa, e o estado não é um falso zero.
  const outra = (await chamar('POST', '/api/monitoramentos/verificar', { repetir: true })).json();
  assert.deepEqual(outra, { verificados: 0, falhas: 0, emFalha: 1, emAndamento: 1, proximaTentativa: outra.proximaTentativa });
  assert.ok(outra.proximaTentativa);
  assert.equal((await chamar('GET', `/api/pesquisas/${id}`)).json().monitoramento.emAndamento, true);
  // A primeira falha tarde: a falha é renovada e a reserva liberada.
  soltar(false);
  const tarde = (await primeira).json();
  assert.deepEqual([tarde.verificados, tarde.falhas, tarde.emFalha, tarde.emAndamento], [0, 1, 1, 0]);
  const depois = await estado();
  assert.ok(depois.falha_em); assert.equal(depois.reservada, null); assert.equal(depois.verificado_em, null);
  // Só um sucesso apaga.
  gancho.antes = null;
  await db.query("UPDATE monitoramentos_tese SET falha_em=now()-interval '1 minute'");
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar', { repetir: true })).json(), { verificados: 1, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
  const fim = await estado();
  assert.equal(fim.falha_em, null); assert.ok(fim.verificado_em);
});

test('execução abandonada: a reserva vigente impede outra execução e mantém a falha; vencido o prazo, a verificação roda', async (t) => {
  const { db, entrar } = await preparar(t);
  const chamar = await entrar('abandono-monitor@teste.local');
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos' })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
  await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true });
  // Falhou antes; uma nova tentativa reservou e o processo caiu no meio (nada concluiu).
  await db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute', falha_em=now()-interval '5 minutes', reservada_ate=now()+interval '9 minutes', execucao=execucao+1");
  const r = (await chamar('POST', '/api/monitoramentos/verificar', { repetir: true })).json();
  assert.deepEqual([r.verificados, r.falhas, r.emFalha, r.emAndamento], [0, 0, 1, 1], 'não reivindica de novo nem esconde a falha');
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().verificados, 0);
  // Prazo da reserva vencido: a verificação volta a rodar, sem esperar a semana.
  await db.query("UPDATE monitoramentos_tese SET reservada_ate=now()-interval '1 second'");
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar')).json(), { verificados: 1, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
});

/* Liga o monitoramento numa pesquisa nova e devolve o necessário para os ensaios abaixo. */
async function monitorada(t, { mandato = false } = {}) {
  const { db, entrar } = await preparar(t);
  const chamar = await entrar(`m-${randomUUID()}@teste.local`);
  const usuario = (await db.query("SELECT id FROM usuarios ORDER BY criado_em DESC LIMIT 1")).rows[0].id;
  let mandatoId = null;
  if (mandato) { mandatoId = (await criarMandato(db, { codigo: `M-${randomUUID().slice(0, 8)}`, confidencial: true })).id; await darAcesso(db, mandatoId, usuario); }
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos', mandatoId })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
  assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).statusCode, 200);
  const vencer = () => db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  const estado = async () => (await db.query('SELECT conhecidas, ultimo_evento::int AS ultimo, execucao, proxima_em, reservada_ate, falha_em, ultimo_resultado FROM monitoramentos_tese WHERE pesquisa_id=$1', [id])).rows[0];
  const novidades = async (tipo) => (await db.query('SELECT count(*)::int n FROM monitoramento_novidades WHERE pesquisa_id=$1 AND tipo=$2', [id, tipo])).rows[0].n;
  return { db, chamar, usuario, mandatoId, id, vencer, estado, novidades };
}
const eventos = (raizes) => `const EVENTOS_CNPJ = ${JSON.stringify({ de: mes(-2), ate: mes(-1), eventos: raizes.map((base) => ({ base, tipo: 'aumento_de_capital', rotulo: 'Aumento de capital', detalhe: '1 → 3', ambiguidade: 'y' })) })};\n`;

test('monitoramento: 201 empresas novas e depois 201 eventos viram aviso; nada é descartado nem repetido', async (t) => {
  const { db, chamar, vencer, estado, novidades } = await monitorada(t);
  const raizes = Array.from({ length: 201 }, (_, k) => String(50000000 + k));
  await importarCatalogo(db, { texto: fonte('2026-09', [...BASE, ...raizes.map((r) => linha(r, `Nova ${r}`, '1990-01-01'))]), versaoRegras: 'teste' });
  await vencer();
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar')).json(), { verificados: 1, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
  assert.equal(await novidades('nova'), 201, 'a 201ª também vira aviso');
  assert.ok((await estado()).conhecidas.includes('cnpj50000200'));
  await vencer();
  await chamar('POST', '/api/monitoramentos/verificar');
  assert.equal(await novidades('nova'), 201, 'sem repetição');
  // As descobertas continuam monitoradas: eventos de todas as 201 chegam na semana seguinte.
  await importarEventos(db, { texto: eventos(raizes) });
  await vencer();
  await chamar('POST', '/api/monitoramentos/verificar');
  assert.equal(await novidades('evento'), 201);
  await vencer();
  await chamar('POST', '/api/monitoramentos/verificar');
  assert.equal(await novidades('evento'), 201, 'evento não se repete');
});

test('monitoramento: empresa descoberta numa semana recebe evento na seguinte (três verificações)', async (t) => {
  const { db, chamar, vencer, novidades } = await monitorada(t);
  await importarCatalogo(db, { texto: fonte('2026-09', [...BASE, linha('44444444', 'Delta Química', '1995-01-01')]), versaoRegras: 'teste' });
  await vencer(); await chamar('POST', '/api/monitoramentos/verificar');
  assert.equal(await novidades('nova'), 1);
  assert.equal(await novidades('evento'), 0);
  // Semana 2: evento da Delta, que não está em pesquisa_itens, só na linha de base.
  await importarEventos(db, { texto: eventos(['44444444']) });
  await vencer(); await chamar('POST', '/api/monitoramentos/verificar');
  const ev = (await db.query("SELECT empresa_id, empresa->>'nome' AS nome FROM monitoramento_novidades WHERE tipo='evento'")).rows;
  assert.deepEqual(ev, [{ empresa_id: 'cnpj44444444', nome: 'Delta Química' }]);
  // Semana 3: nada novo.
  await vencer(); await chamar('POST', '/api/monitoramentos/verificar');
  assert.equal((await db.query('SELECT count(*)::int n FROM monitoramento_novidades')).rows[0].n, 2);
});

test('monitoramento: mandato revogado não é verificado nem consome o cursor; revogação durante o cálculo descarta o resultado', async (t) => {
  const { db, chamar, usuario, mandatoId, id, vencer, estado, novidades } = await monitorada(t, { mandato: true });
  await importarCatalogo(db, { texto: fonte('2026-09', [...BASE, linha('44444444', 'Delta Química', '1995-01-01')]), versaoRegras: 'teste' });
  await importarEventos(db, { texto: eventos(['11111111']) });
  await vencer();
  const antes = await estado();
  await db.query('DELETE FROM mandato_membros WHERE mandato_id=$1 AND usuario_id=$2', [mandatoId, usuario]);
  assert.equal((await chamar('GET', `/api/pesquisas/${id}`)).statusCode, 404);
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar')).json(), { verificados: 0, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
  const depois = await estado();
  assert.equal(await novidades('nova') + await novidades('evento'), 0, 'nada gravado na pesquisa inacessível');
  assert.deepEqual([depois.conhecidas, depois.ultimo, depois.execucao], [antes.conhecidas, antes.ultimo, antes.execucao], 'cursor, linha de base e ficha intactos');
  assert.ok(new Date(depois.proxima_em) <= new Date(), 'nem reservada');
  // Revogada durante o cálculo: a política responde sim na seleção e não antes de gravar.
  await darAcesso(db, mandatoId, usuario);
  const { criarMotorPesquisa } = await import('../src/pesquisa/motor.mjs');
  const motor = criarMotorPesquisa({ db, catalogo: criarCatalogoBanco(db) });
  let chamadas = 0;
  const r = await verificarVencidos(db, motor, usuario, { escopo: { admin: false, mandatos: [mandatoId] }, podeAcessar: async () => ++chamadas === 1 });
  assert.deepEqual(r.map((x) => x.descartada), [true]);
  const fim = await estado();
  assert.equal(await novidades('nova') + await novidades('evento'), 0);
  assert.deepEqual([fim.conhecidas, fim.ultimo], [antes.conhecidas, antes.ultimo], 'cursor não avança');
  assert.ok(new Date(fim.proxima_em) <= new Date(), 'a semana não foi empurrada: continua vencida');
  assert.equal(fim.reservada_ate, null, 'reserva devolvida');
});

test('monitoramento: reserva curta com ficha; desligar e religar durante o cálculo descarta o resultado em voo', async (t) => {
  const { db, usuario, id, vencer, estado, novidades } = await monitorada(t);
  await vencer();
  let soltar, chamado;
  const emCalculo = new Promise((r) => { chamado = r; });
  const motor = { aprovadasCadastro: async () => { chamado(); await new Promise((r) => { soltar = r; });
    return { funil: { recorte: 3, avaliadas: 3, truncado: false }, empresas: [{ id: 'cnpj99999999', nome: 'Fantasma', cidade: 'X', uf: 'SP', aderencia: 100 }] }; } };
  const execucao = verificarVencidos(db, motor, usuario);
  await emCalculo;
  const reservada = await estado();
  assert.ok(new Date(reservada.reservada_ate) - Date.now() < 11 * 60e3, 'reserva curta: processo interrompido aqui libera em minutos');
  assert.ok(new Date(reservada.proxima_em) <= new Date(), 'reservar não empurra a semana');
  await definirMonitoramento(db, { pesquisaId: id, usuarioId: usuario, ativo: false });
  await definirMonitoramento(db, { pesquisaId: id, usuarioId: usuario, ativo: true, aprovadas: ['cnpj11111111', 'cnpj33333333'] });
  soltar();
  assert.deepEqual((await execucao).map((x) => x.descartada), [true]);
  assert.equal(await novidades('nova'), 0, 'resultado da ficha antiga não é gravado');
  assert.ok(!(await estado()).conhecidas.includes('cnpj99999999'));
});

test('ficha superada: A perde a reserva por prazo e B assume; o sucesso tardio de A não libera a reserva de B nem apaga a falha; só B grava', async (t) => {
  const { db, usuario, vencer, estado, novidades } = await monitorada(t);
  await vencer();
  await db.query("UPDATE monitoramentos_tese SET falha_em=now()-interval '5 minutes'");
  /* Cálculo preso até o teste soltar; cada execução devolve uma empresa nova diferente. */
  const preso = (empresa) => {
    let soltar, chegou;
    const noCalculo = new Promise((r) => { chegou = r; });
    const motor = { aprovadasCadastro: async () => { chegou(); await new Promise((r) => { soltar = r; });
      return { funil: { recorte: 3, avaliadas: 3, truncado: false }, empresas: [{ id: empresa, nome: empresa, cidade: 'X', uf: 'SP', aderencia: 100 }] }; } };
    return { motor, noCalculo, soltar: () => soltar() };
  };
  const a = preso('cnpj88888888');
  const execA = verificarVencidos(db, a.motor, usuario);
  await a.noCalculo;
  // O prazo da reserva de A vence no meio do cálculo; B reivindica e também fica calculando.
  await db.query("UPDATE monitoramentos_tese SET reservada_ate=now()-interval '1 second'");
  const b = preso('cnpj99999999');
  const execB = verificarVencidos(db, b.motor, usuario);
  await b.noCalculo;
  const fichaB = (await estado()).execucao;
  // A termina com sucesso, mas a ficha é antiga: descartada, sem tocar na reserva de B nem na falha.
  a.soltar();
  assert.deepEqual((await execA).map((x) => x.descartada), [true]);
  const entre = await estado();
  assert.equal(entre.execucao, fichaB);
  assert.ok(new Date(entre.reservada_ate) > new Date(), 'a reserva de B continua vigente');
  assert.ok(entre.falha_em, 'a falha continua registrada');
  assert.equal(await novidades('nova'), 0, 'o resultado de A não é gravado');
  // B conclui: grava só a sua novidade e encerra a falha e a reserva.
  b.soltar();
  assert.deepEqual((await execB).map((x) => Boolean(x.descartada)), [false]);
  const fim = await estado();
  assert.equal(fim.falha_em, null); assert.equal(fim.reservada_ate, null);
  assert.ok(fim.conhecidas.includes('cnpj99999999')); assert.ok(!fim.conhecidas.includes('cnpj88888888'));
  assert.equal(await novidades('nova'), 1);
  assert.deepEqual((await db.query("SELECT empresa->>'id' AS id FROM monitoramento_novidades WHERE tipo='nova'")).rows.map((r) => r.id), ['cnpj99999999']);
});

test('monitoramento: cobertura parcial fica gravada e aparece no detalhe e no Meu dia; visto só até o aviso mostrado', async (t) => {
  const { db, chamar, usuario, id, vencer } = await monitorada(t);
  await vencer();
  const motor = { aprovadasCadastro: async () => ({ funil: { recorte: 12000, avaliadas: 10000, truncado: true },
    empresas: [{ id: 'cnpj77777777', nome: 'Parcial Um', cidade: 'X', uf: 'SP', aderencia: 90 }] }) };
  await verificarVencidos(db, motor, usuario);
  const m = (await chamar('GET', `/api/pesquisas/${id}`)).json().monitoramento;
  assert.deepEqual(m.cobertura, { recorte: 12000, avaliadas: 10000, completa: false });
  assert.deepEqual(m.ultimoResultado.cobertura, { recorte: 12000, avaliadas: 10000, completa: false });
  const item = (await chamar('GET', '/api/inicio')).json().teses.itens[0];
  assert.equal(item.parcial, true);
  // Chega outra novidade depois de o aviso ser montado: marcar até `ateId` não a esconde.
  await db.query(`INSERT INTO monitoramento_novidades (pesquisa_id,empresa_id,tipo,empresa) VALUES ($1,'cnpj88888888','nova','{"nome":"Depois"}')`, [id]);
  assert.deepEqual((await chamar('POST', `/api/pesquisas/${id}/novidades/vistas`, { ateId: item.ateId })).json(), { vistas: 1 });
  const restante = (await chamar('GET', '/api/inicio')).json().teses.itens;
  assert.equal(restante.length, 1);
  assert.deepEqual(restante[0].exemplos, ['Depois']);
  assert.equal((await chamar('POST', `/api/pesquisas/${id}/novidades/vistas`, { ateId: -1 })).statusCode, 422);
});

/* Estado da Rodada 15: linha de base só com os itens da pesquisa e sem cobertura gravada.
   `cortada`: a pesquisa teve corte de itens (simulado no funil; só Alfa ficou na linha de base,
   Gama aprovava mas estava além do corte). Depois, uma publicação nova traz Delta, que é
   realmente nova. `hash`: publicação da pesquisa que o catálogo não tem. */
async function legado(t, { cortada = false, hash = null, linhas = [...BASE, linha('44444444', 'Delta Química', '1995-01-01')] } = {}) {
  const ctx = await monitorada(t);
  const { db, id } = ctx;
  await db.query('UPDATE monitoramentos_tese SET cobertura=NULL, conhecidas=$1', [cortada ? ['cnpj11111111'] : ['cnpj11111111', 'cnpj33333333']]);
  if (cortada) await db.query(`UPDATE pesquisas_tese SET funil = funil || '{"aprovadasCadastro": 2500, "armazenadas": 2000}'::jsonb WHERE id=$1`, [id]);
  if (hash) await db.query('UPDATE pesquisas_tese SET catalogo_hash=$2 WHERE id=$1', [id, hash]);
  await importarCatalogo(db, { texto: fonte('2026-09', linhas), versaoRegras: 'teste' });
  await ctx.vencer();
  return ctx;
}
const novasGravadas = async (db) => (await db.query("SELECT empresa_id, empresa->>'aConferir' AS conferir, detalhe FROM monitoramento_novidades WHERE tipo='nova' ORDER BY empresa_id")).rows;

test('monitor legado com corte: empresa que já existia e só passou a atender na publicação nova vira aviso (atributos da publicação antiga)', async (t) => {
  // Beta existia na publicação da pesquisa, mas com abertura em 2020 (não atendia "mais de 20 anos");
  // a publicação nova corrige a data. Pela publicação antiga ela não aprovava: é novidade real.
  const corrigida = BASE.map((l) => (l[0] === 'cnpj22222222' ? linha('22222222', 'Beta Química', '1990-01-01') : l));
  const { db, chamar } = await legado(t, { cortada: true, linhas: corrigida });
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().verificados, 1);
  assert.deepEqual((await novasGravadas(db)).map((x) => [x.empresa_id, x.conferir]), [['cnpj22222222', null]], 'Gama absorvida; Beta, que passou a atender, vira aviso');
});

test('monitor legado sem corte: a linha de base já estava completa; empresa nova de publicação posterior vira aviso', async (t) => {
  const { db, chamar, id, vencer, estado } = await legado(t);
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().verificados, 1);
  assert.deepEqual((await novasGravadas(db)).map((x) => [x.empresa_id, x.conferir]), [['cnpj44444444', null]], 'Delta chegou depois: não é absorvida');
  const r = (await chamar('GET', `/api/pesquisas/${id}`)).json().monitoramento.ultimoResultado;
  assert.deepEqual([r.transicao, r.totalNovas, r.aConferir], ['pesquisa', 1, undefined]);
  assert.ok((await estado()).conhecidas.includes('cnpj44444444'));
  await vencer(); await chamar('POST', '/api/monitoramentos/verificar');
  assert.equal((await novasGravadas(db)).length, 1, 'regime normal depois: sem repetição');
});

test('monitor legado com corte: a publicação da pesquisa reconstrói a linha de base; só a empresa realmente nova vira aviso', async (t) => {
  const { db, chamar, id, estado } = await legado(t, { cortada: true });
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().verificados, 1);
  assert.deepEqual((await novasGravadas(db)).map((x) => [x.empresa_id, x.conferir]), [['cnpj44444444', null]],
    'Gama aprovava na publicação da pesquisa (estava além do corte): absorvida; Delta chegou depois: aviso');
  const m = (await chamar('GET', `/api/pesquisas/${id}`)).json().monitoramento;
  assert.equal(m.ultimoResultado.transicao, 'historica');
  assert.ok(m.cobertura, 'daqui em diante, regime normal');
  const base = (await estado()).conhecidas;
  assert.ok(base.includes('cnpj33333333') && base.includes('cnpj44444444'));
});

test('monitor legado com corte e sem a publicação da pesquisa: nada é absorvido; candidatas viram aviso "a conferir"', async (t) => {
  const { db, chamar, id } = await legado(t, { cortada: true, hash: 'f'.repeat(64) });
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).json().verificados, 1);
  const novas = await novasGravadas(db);
  assert.deepEqual(novas.map((x) => [x.empresa_id, x.conferir]), [['cnpj33333333', 'true'], ['cnpj44444444', 'true']]);
  assert.match(novas[0].detalhe, /a conferir/);
  const r = (await chamar('GET', `/api/pesquisas/${id}`)).json().monitoramento.ultimoResultado;
  assert.deepEqual([r.transicao, r.aConferir, r.totalNovas], ['incerta', 2, 2]);
  const item = (await chamar('GET', '/api/inicio')).json().teses.itens[0];
  assert.deepEqual([item.novas, item.aConferir], [2, 2]);
});

test('ativar o monitoramento confere sessão e mandato depois do cálculo: revogação ou sessão encerrada no meio não grava', async (t) => {
  const { db, entrar, gancho } = await preparar(t);
  const email = `ativa-${randomUUID()}@teste.local`;
  const chamar = await entrar(email);
  const usuario = (await db.query('SELECT id FROM usuarios WHERE email=$1', [email])).rows[0].id;
  const mandatoId = (await criarMandato(db, { codigo: `M-${randomUUID().slice(0, 8)}`, confidencial: true })).id;
  await darAcesso(db, mandatoId, usuario);
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos', mandatoId })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
  const revogar = async () => { await db.query('DELETE FROM mandato_membros WHERE mandato_id=$1 AND usuario_id=$2', [mandatoId, usuario]); };
  const ativo = async () => (await db.query('SELECT ativo FROM monitoramentos_tese WHERE pesquisa_id=$1', [id])).rows[0]?.ativo ?? null;
  // Ativação: mandato revogado durante o recorte.
  gancho.antes = revogar;
  assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).statusCode, 404);
  assert.equal(await ativo(), null, 'nada gravado');
  // Reativação: liga, desliga, e a revogação no meio da religação também barra.
  gancho.antes = null; await darAcesso(db, mandatoId, usuario);
  assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).statusCode, 200);
  assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: false })).statusCode, 200);
  gancho.antes = revogar;
  assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).statusCode, 404);
  assert.equal(await ativo(), false, 'continua desligado');
  // Sessão encerrada durante o recorte: 401, nada gravado.
  gancho.antes = null; await darAcesso(db, mandatoId, usuario);
  gancho.antes = async () => { await db.query('UPDATE sessoes SET encerrada_em=now() WHERE usuario_id=$1', [usuario]); };
  assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).statusCode, 401);
  assert.equal(await ativo(), false);
});

test('verificação pela rota: mandato revogado durante o recorte descarta; sessão encerrada durante o recorte responde 401 e devolve a reserva', async (t) => {
  const { db, entrar, gancho } = await preparar(t);
  const email = `rota-${randomUUID()}@teste.local`;
  const chamar = await entrar(email);
  const usuario = (await db.query('SELECT id FROM usuarios WHERE email=$1', [email])).rows[0].id;
  const mandatoId = (await criarMandato(db, { codigo: `M-${randomUUID().slice(0, 8)}`, confidencial: true })).id;
  await darAcesso(db, mandatoId, usuario);
  const id = randomUUID();
  const { pesquisa } = (await chamar('POST', '/api/pesquisas', { id, tese: 'Distribuidoras com mais de 20 anos', mandatoId })).json();
  await chamar('POST', `/api/pesquisas/${id}/iniciar`, { versao: pesquisa.versao });
  assert.equal((await chamar('PUT', `/api/pesquisas/${id}/monitoramento`, { ativo: true })).statusCode, 200);
  await importarCatalogo(db, { texto: fonte('2026-09', [...BASE, linha('44444444', 'Delta Química', '1995-01-01')]), versaoRegras: 'teste' });
  const estado = async () => (await db.query('SELECT conhecidas, ultimo_evento::int AS ultimo, proxima_em <= now() AS vencida FROM monitoramentos_tese WHERE pesquisa_id=$1', [id])).rows[0];
  const vencer = () => db.query("UPDATE monitoramentos_tese SET proxima_em=now()-interval '1 minute'");
  const novidades = async () => (await db.query('SELECT count(*)::int n FROM monitoramento_novidades')).rows[0].n;
  await vencer();
  const antes = await estado();
  // Mandato revogado durante o recorte: a política real (sessão relida + carregar) descarta.
  gancho.antes = async () => { await db.query('DELETE FROM mandato_membros WHERE mandato_id=$1 AND usuario_id=$2', [mandatoId, usuario]); };
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar')).json(), { verificados: 0, falhas: 0, emFalha: 0, emAndamento: 0, proximaTentativa: null });
  assert.equal(await novidades(), 0);
  assert.deepEqual((await estado()).conhecidas, antes.conhecidas, 'linha de base intacta');
  // Sessão encerrada durante o recorte: o cliente recebe 401 (vai ao login), não "nada verificado".
  gancho.antes = null; await darAcesso(db, mandatoId, usuario); await vencer();
  gancho.antes = async () => { await db.query('UPDATE sessoes SET encerrada_em=now() WHERE usuario_id=$1', [usuario]); };
  assert.equal((await chamar('POST', '/api/monitoramentos/verificar')).statusCode, 401);
  assert.equal(await novidades(), 0);
  const depois = await estado();
  assert.deepEqual([depois.conhecidas, depois.ultimo], [antes.conhecidas, antes.ultimo]);
  assert.equal(depois.vencida, true, 'a semana não foi empurrada: verifica no próximo login');
  assert.equal((await db.query('SELECT reservada_ate FROM monitoramentos_tese WHERE pesquisa_id=$1', [id])).rows[0].reservada_ate, null, 'reserva devolvida');
});

test('monitoramento: mais de um lote de novidades; falha no segundo lote desfaz tudo', async (t) => {
  const { db, usuario, vencer, estado, novidades } = await monitorada(t);
  await vencer();
  const empresas = Array.from({ length: 501 }, (_, k) => ({ id: `cnpj${60000000 + k}`, nome: `Lote ${k}`, cidade: 'X', uf: 'SP', aderencia: 90 }));
  const motor = { aprovadasCadastro: async () => ({ funil: { recorte: 503, avaliadas: 503, truncado: false }, empresas }) };
  const antes = await estado();
  let insercoes = 0;
  const falho = { query: (sql, p) => db.query(sql, p), transaction: (fn) => db.transaction((tx) => fn({ query: async (sql, p) => {
    if (/INSERT INTO monitoramento_novidades/.test(sql) && ++insercoes === 2) throw new Error('segundo lote falhou');
    return tx.query(sql, p);
  } })) };
  const [r] = await verificarVencidos(falho, motor, usuario);
  assert.equal(r.falhou, true);
  assert.equal(insercoes, 2, 'o primeiro lote chegou a ser inserido');
  assert.equal(await novidades('nova'), 0, 'rollback conjunto: nenhum lote fica');
  const meio = await estado();
  assert.deepEqual([meio.conhecidas, meio.ultimo], [antes.conhecidas, antes.ultimo], 'linha de base e cursor intactos');
  await vencer();
  await verificarVencidos(db, motor, usuario);
  assert.equal(await novidades('nova'), 501, 'dois lotes gravados');
  assert.ok((await estado()).conhecidas.includes('cnpj60000500'));
});
