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
  const { detectadoEm, titulo, ateId, ...resto } = inicio.itens[0];
  assert.deepEqual(resto, { pesquisaId: id, tese: 'Distribuidoras com mais de 20 anos', novas: 1, eventos: 1, exemplos: ['Delta Química', 'Alfa Química'], parcial: false });
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
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar')).json(), { verificados: 0, falhas: 1 }, 'falha não conta como verificada');
  const m = (await db.query("SELECT proxima_em - now() < interval '61 minutes' AS breve, verificado_em FROM monitoramentos_tese")).rows[0];
  assert.equal(m.breve, true); assert.equal(m.verificado_em, null);
  assert.equal((await db.query('SELECT count(*)::int n FROM monitoramento_novidades')).rows[0].n, 0);
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
  const estado = async () => (await db.query('SELECT conhecidas, ultimo_evento::int AS ultimo, execucao, proxima_em, ultimo_resultado FROM monitoramentos_tese WHERE pesquisa_id=$1', [id])).rows[0];
  const novidades = async (tipo) => (await db.query('SELECT count(*)::int n FROM monitoramento_novidades WHERE pesquisa_id=$1 AND tipo=$2', [id, tipo])).rows[0].n;
  return { db, chamar, usuario, mandatoId, id, vencer, estado, novidades };
}
const eventos = (raizes) => `const EVENTOS_CNPJ = ${JSON.stringify({ de: mes(-2), ate: mes(-1), eventos: raizes.map((base) => ({ base, tipo: 'aumento_de_capital', rotulo: 'Aumento de capital', detalhe: '1 → 3', ambiguidade: 'y' })) })};\n`;

test('monitoramento: 201 empresas novas e depois 201 eventos viram aviso; nada é descartado nem repetido', async (t) => {
  const { db, chamar, vencer, estado, novidades } = await monitorada(t);
  const raizes = Array.from({ length: 201 }, (_, k) => String(50000000 + k));
  await importarCatalogo(db, { texto: fonte('2026-09', [...BASE, ...raizes.map((r) => linha(r, `Nova ${r}`, '1990-01-01'))]), versaoRegras: 'teste' });
  await vencer();
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar')).json(), { verificados: 1, falhas: 0 });
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
  assert.deepEqual((await chamar('POST', '/api/monitoramentos/verificar')).json(), { verificados: 0, falhas: 0 });
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
  assert.ok(new Date(fim.proxima_em) - Date.now() < 11 * 60e3, 'só a reserva curta: volta a vencer em minutos, não numa semana');
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
  assert.ok(new Date(reservada.proxima_em) - Date.now() < 11 * 60e3, 'processo interrompido aqui volta a vencer em minutos');
  await definirMonitoramento(db, { pesquisaId: id, usuarioId: usuario, ativo: false });
  await definirMonitoramento(db, { pesquisaId: id, usuarioId: usuario, ativo: true, aprovadas: ['cnpj11111111', 'cnpj33333333'] });
  soltar();
  assert.deepEqual((await execucao).map((x) => x.descartada), [true]);
  assert.equal(await novidades('nova'), 0, 'resultado da ficha antiga não é gravado');
  assert.ok(!(await estado()).conhecidas.includes('cnpj99999999'));
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

test('monitoramento ligado antes da cobertura: a primeira verificação completa a linha de base sem avisar como novas', async (t) => {
  const { db, usuario, id, vencer, estado, novidades } = await monitorada(t);
  // Estado da Rodada 15: linha de base só com os itens da pesquisa e sem cobertura gravada.
  await db.query("UPDATE monitoramentos_tese SET cobertura=NULL, conhecidas=ARRAY['cnpj11111111','cnpj33333333']");
  await vencer();
  const alem = [{ id: 'cnpj66666666', nome: 'Além do corte', cidade: 'X', uf: 'SP', aderencia: 80 }];
  const motor = { aprovadasCadastro: async () => ({ funil: { recorte: 3, avaliadas: 3, truncado: false }, empresas: alem }) };
  const [r] = await verificarVencidos(db, motor, usuario);
  assert.equal(r.linhaDeBaseRefeita, true);
  assert.equal(await novidades('nova'), 0, 'aprovada que só estava além do corte não vira aviso');
  const depois = await estado();
  assert.ok(depois.conhecidas.includes('cnpj66666666'));
  // Daqui em diante, regime normal: empresa realmente nova vira aviso.
  await vencer();
  const motor2 = { aprovadasCadastro: async () => ({ funil: { recorte: 4, avaliadas: 4, truncado: false }, empresas: [...alem, { id: 'cnpj12121212', nome: 'Nova de verdade', cidade: 'X', uf: 'SP', aderencia: 90 }] }) };
  await verificarVencidos(db, motor2, usuario);
  assert.equal(await novidades('nova'), 1);
  assert.equal((await db.query('SELECT pesquisa_id FROM monitoramentos_tese')).rows[0].pesquisa_id, id);
});
