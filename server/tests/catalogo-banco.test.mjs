import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';
import { importarCatalogo } from '../src/agente/importar-catalogo.mjs';
import { criarCatalogoBanco } from '../src/agente/catalogo-banco.mjs';
import { ambienteDoServidor } from '../src/operacao/ambiente.mjs';

const colunas = ['id','cnpjRaiz','nome','razaoSocial','cidade','uf','cnaePrincipal','cnaeSecundarias','situacaoCadastral','naturezaJuridica','contato','sucessaoProvavel'];
function fonte({ referencia = '2026-08', nome = 'Química São Paulo', duplicar = false } = {}) {
  const linhas = [
    ['cnpj12345678','12345678',nome,'Química Teste Ltda','São Paulo','SP','4684299',[],'02','2062',{email:'privado@example.test'},true],
    ['cnpj87654321','87654321','Possível','Possível Ltda','Campinas','SP','4693100',['4684299'],'02','2062',null,false],
    ['cnpj11111111','11111111','Inativa','Inativa Ltda','Curitiba','PR','4684299',[],'08','2062',null,false],
    ['cnpj22222222','22222222','Outro subsetor','Outro Ltda','Curitiba','PR','2013401',[],'02','2062',null,false],
  ];
  if (duplicar) linhas.push(linhas[0]);
  return `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map(JSON.stringify).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${referencia}";\nglobalThis.catalogoExecutado=true;`;
}

test('importação persiste todo o universo e busca o piloto sem expor hipóteses ou contatos', async t => {
  const db = await bancoDeTeste(); t.after(() => db.close());
  const catalogo = criarCatalogoBanco(db);
  await assert.rejects(catalogo.buscar(), /ainda não foi importado/);
  const resultado = await importarCatalogo(db, { texto: fonte() });
  assert.equal(resultado.total, 4);
  assert.equal((await db.query('SELECT count(*)::int n FROM entidades_juridicas')).rows[0].n, 4);
  assert.equal((await db.query('SELECT count(*)::int n FROM estabelecimentos')).rows[0].n, 0);
  const r = await catalogo.buscar({ busca:'quimica sao', uf:'SP' });
  assert.equal(r.total, 1); assert.equal(r.totalOrigem, 4);
  assert.equal(r.empresas[0].id,'cnpj12345678'); assert.equal(r.empresas[0].receita, null);
  assert.equal(r.empresas[0].intencaoDeTransacao,'Não apurada');
  assert.equal(globalThis.catalogoExecutado,undefined);
  assert.ok(!JSON.stringify((await db.query('SELECT * FROM catalogo_registros')).rows).includes('privado@'));
  const primeira = await catalogo.buscar({ incluirPossiveis:true, limite:1 });
  assert.equal(primeira.total,2); assert.equal(primeira.proximoOffset,1);
  const segunda = await catalogo.buscar({ incluirPossiveis:true, limite:1, offset:1, catalogoHash:primeira.hash });
  assert.notEqual(primeira.empresas[0].id,segunda.empresas[0].id); assert.equal(segunda.proximoOffset,null);
  assert.equal((await catalogo.buscar({ incluirPossiveis:true,cnae:'4693100' })).total,1);
  assert.equal((await catalogo.buscar({ busca:'%' })).total,0);
  assert.equal((await catalogo.buscar({ busca:"' OR 1=1 --" })).total,0);
  assert.equal((await catalogo.buscar({ uf:'PR' })).total,0);
  assert.equal((await catalogo.buscar({ uf:'PR,SP', incluirPossiveis:true })).total,2);
  assert.equal((await catalogo.buscar({ municipio:'SÃO  paulo' })).total,1);
  assert.equal((await catalogo.buscar({ municipio:'Paulo' })).total,0, 'município é exato, não trecho');
  assert.equal((await catalogo.buscar({ municipio:'campinas', incluirPossiveis:true, uf:'PR,SP' })).empresas[0].id,'cnpj87654321');
  assert.equal((await catalogo.buscar({ municipio:'campinas', uf:'PR' , incluirPossiveis:true})).total,0);
  assert.equal((await catalogo.buscar({ municipio:"' OR 1=1 --" })).total,0);
  assert.equal((await catalogo.buscar({ offset:100 })).empresas.length,0);
  assert.equal((await catalogo.buscar({ limite:0 })).total,1);
  assert.equal((await catalogo.obter('cnpj12345678')).nome,'Química São Paulo');
  assert.equal(await catalogo.obter('cnpj11111111'),null);
});

test('reimportação é idempotente, versões são preservadas e falha não troca o catálogo ativo', async t => {
  const db = await bancoDeTeste(); t.after(() => db.close());
  const usuario = await criarUsuario(db,{email:'preservar@example.test'});
  const primeira = await importarCatalogo(db, { texto:fonte() });
  assert.equal((await importarCatalogo(db,{texto:fonte()})).reutilizado,true);
  assert.equal((await db.query('SELECT count(*)::int n FROM catalogo_publicacoes')).rows[0].n,1);
  await assert.rejects(importarCatalogo(db,{texto:fonte({duplicar:true})}),/duplicado/);
  await db.exec(`CREATE FUNCTION falha_qa_catalogo() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'falha QA'; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER falha_qa_catalogo BEFORE INSERT ON catalogo_registros FOR EACH ROW EXECUTE FUNCTION falha_qa_catalogo();`);
  await assert.rejects(importarCatalogo(db,{texto:fonte({nome:'Atualizada'})}),/falha QA/);
  assert.equal((await criarCatalogoBanco(db).buscar()).hash,primeira.hash);
  assert.equal((await db.query('SELECT count(*)::int n FROM snapshots_universo')).rows[0].n,1);
  await db.exec('DROP TRIGGER falha_qa_catalogo ON catalogo_registros');
  const segunda = await importarCatalogo(db,{texto:fonte({referencia:'2026-09',nome:'Atualizada'})});
  assert.notEqual(segunda.hash,primeira.hash);
  await assert.rejects(criarCatalogoBanco(db).buscar({catalogoHash:primeira.hash}), /catálogo foi atualizado/);
  assert.equal((await db.query('SELECT nome FROM catalogo_registros WHERE snapshot_id=$1 AND nome=$2',[primeira.snapshotId,'Química São Paulo'])).rows.length,1);
  assert.equal((await db.query('SELECT count(*)::int n FROM entidades_juridicas')).rows[0].n,4);
  assert.equal((await db.query('SELECT id FROM usuarios WHERE id=$1',[usuario.id])).rows.length,1);
  await assert.rejects(db.query('UPDATE catalogo_registros SET nome=$1',['indevido']),/imutável/);
  await assert.rejects(importarCatalogo(db,{texto:fonte({referencia:'2026-07',nome:'Antiga'})}),/mais antiga/);
});

test('Render usa PORT e origem do serviço; produção exige catálogo do banco', () => {
  const env = {NODE_ENV:'production',RENDER:'true',RENDER_EXTERNAL_URL:'https://ght4-test.onrender.com',PORT:'10000',PORTA:'3311'};
  assert.deepEqual(ambienteDoServidor(env),{porta:10000,host:'0.0.0.0',origemPublica:'https://ght4-test.onrender.com',catalogo:'banco'});
  assert.equal(ambienteDoServidor({...env,GHT4_ORIGEM_PUBLICA:'https://agente.example.test'}).origemPublica,'https://agente.example.test');
  assert.equal(ambienteDoServidor({}).catalogo,'arquivo');
  assert.throws(()=>ambienteDoServidor({...env,GHT4_CATALOGO_ORIGEM:'arquivo'}),/produção/);
  assert.throws(()=>ambienteDoServidor({...env,PORT:'abc'}),/Porta/);
});

test('eventos societários: importação idempotente, ligação ao cadastro, filtro recente e ambiguidade preservada', async t => {
  const { importarEventos, lerFonteEventos } = await import('../src/agente/eventos.mjs');
  const db = await bancoDeTeste(); t.after(() => db.close());
  await importarCatalogo(db, { texto: fonte() });
  const catalogo = criarCatalogoBanco(db);
  const mes = (d) => { const x = new Date(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + d); return x.toISOString().slice(0, 7); };
  const arquivo = (de, ate, eventos) => `/* gerado */\nconst EVENTOS_CNPJ = ${JSON.stringify({ de, ate, total: eventos.length, eventos })};\n\nwindow.EVENTOS_CNPJ = EVENTOS_CNPJ;\n`;
  const recentes = [
    { base: '12345678', tipo: 'entrada_capital_estrangeiro', rotulo: 'Sócio no exterior entrou no quadro', detalhe: 'País diferente do Brasil.', ambiguidade: 'Confirmar antes de tratar como transação.' },
    { base: '12345678', tipo: 'saiu_de_ativa', rotulo: 'Deixou a situação ATIVA', detalhe: '02 → 08', ambiguidade: 'Baixa pode ser incorporação.' },
    { base: '99999999', tipo: 'aumento_de_capital', rotulo: 'Capital subiu', detalhe: 'x', ambiguidade: 'y' },
  ];
  const r = await importarEventos(db, { texto: arquivo(mes(-2), mes(-1), recentes) });
  assert.deepEqual({ ...r, periodo: undefined }, { periodo: undefined, total: 3, importados: 2, jaExistentes: 0, foraDoCadastro: 1 });
  assert.equal((await importarEventos(db, { texto: arquivo(mes(-2), mes(-1), recentes) })).importados, 0, 'reimportar não duplica');
  const comEvento = await catalogo.buscar({ comEvento: true });
  assert.equal(comEvento.total, 1); assert.equal(comEvento.empresas[0].id, 'cnpj12345678');
  const ev = comEvento.empresas[0].eventos;
  // A projeção do cartão traz só eventos que qualificam (não "outro"); a ficha lista todos.
  assert.equal(ev.length, 1); assert.ok(ev.every((e) => e.ambiguidade && e.de === mes(-2) && e.ate === mes(-1)));
  assert.ok(!('entidade_id' in comEvento.empresas[0]));
  // Evento só do tipo "outro" (sair de ATIVA) não conta como sinal recente; evento antigo também não.
  await db.query("DELETE FROM eventos_corporativos WHERE detalhes->>'tipoOrigem'='entrada_capital_estrangeiro'");
  assert.equal((await catalogo.buscar({ comEvento: true })).total, 0);
  await importarEventos(db, { texto: arquivo(mes(-30), mes(-24), [recentes[0]]) });
  assert.equal((await catalogo.buscar({ comEvento: true })).total, 0);
  assert.equal((await catalogo.buscar({})).empresas[0].eventos.length, 1);
  for (const ruim of [arquivo(mes(-1), mes(-2), []), arquivo(mes(-2), mes(-1), [{ ...recentes[0], base: '123' }]),
    arquivo(mes(-2), mes(-1), [{ ...recentes[0], tipo: 'vende_amanha' }]), 'window.X = 1;'])
    assert.throws(() => lerFonteEventos(ruim));
});

test('ordem "por onde começar": evento recente, depois relação confirmada, depois pessoas, depois enquadramento — tudo exposto', async t => {
  const { randomUUID } = await import('node:crypto');
  const { importarEventos } = await import('../src/agente/eventos.mjs');
  const db = await bancoDeTeste(); t.after(() => db.close());
  await importarCatalogo(db, { texto: fonte() });
  const catalogo = criarCatalogoBanco(db);
  const u = await criarUsuario(db, { email: 'ordem@example.test' });
  const ids = (r) => r.empresas.map((e) => e.id);
  const base = await catalogo.buscar({ incluirPossiveis: true });
  assert.deepEqual(ids(base), ['cnpj12345678', 'cnpj87654321']);
  assert.deepEqual(ids(await catalogo.buscar({ incluirPossiveis: true, ordem: 'prioridade' })), ids(base), 'sem sinais, prioridade = enquadramento');
  // A possível ganha uma relação confirmada: passa à frente só na ordem de prioridade.
  const [ght4, alvo] = [randomUUID(), randomUUID()];
  await db.query(`INSERT INTO rede_pessoas (id,lado,nome,empresa_id,criado_por) VALUES ($1,'ght4','Sócia',NULL,$3),($2,'mercado','Diretor','cnpj87654321',$3)`, [ght4, alvo, u.id]);
  const [a, b] = [ght4, alvo].sort();
  await db.query(`INSERT INTO rede_vinculos (id,pessoa_a_id,pessoa_b_id,tipo,forca,evidencia,disposicao,criado_por) VALUES ($1,$2,$3,'trabalharam_juntos','direta','Trabalharam juntos','posso_apresentar',$4)`, [randomUUID(), a, b, u.id]);
  const comRelacao = await catalogo.buscar({ incluirPossiveis: true, ordem: 'prioridade' });
  assert.deepEqual(ids(comRelacao), ['cnpj87654321', 'cnpj12345678']);
  assert.deepEqual(ids(await catalogo.buscar({ incluirPossiveis: true })), ids(base));
  const possivel = comRelacao.empresas[0];
  assert.equal(possivel.relacaoConfirmada, true); assert.equal(possivel.pessoasMapeadas, 1); assert.equal(possivel.eventoRecente, false);
  // Evento recente na provável vence a relação confirmada da outra.
  const mes = (d) => { const x = new Date(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + d); return x.toISOString().slice(0, 7); };
  await importarEventos(db, { texto: `const EVENTOS_CNPJ = ${JSON.stringify({ de: mes(-2), ate: mes(-1), eventos: [{ base: '12345678', tipo: 'aumento_de_capital', rotulo: 'Capital subiu', detalhe: '1 → 3', ambiguidade: 'Pode ser capitalização de lucros.' }] })};\n` });
  const comEvento = await catalogo.buscar({ incluirPossiveis: true, ordem: 'prioridade' });
  assert.deepEqual(ids(comEvento), ['cnpj12345678', 'cnpj87654321']);
  assert.equal(comEvento.empresas[0].eventoRecente, true);
  // Paginação estável na ordem de prioridade.
  const p1 = await catalogo.buscar({ incluirPossiveis: true, ordem: 'prioridade', limite: 1 });
  const p2 = await catalogo.buscar({ incluirPossiveis: true, ordem: 'prioridade', limite: 1, offset: 1 });
  assert.deepEqual([...ids(p1), ...ids(p2)], ids(comEvento));
  // Valor de ordem desconhecido não entra no SQL.
  assert.deepEqual(ids(await catalogo.buscar({ incluirPossiveis: true, ordem: 'nome; DROP TABLE x' })), ids(base));
});

test('rótulo do evento vem do que o detector mede, não do texto do arquivo', async () => {
  const { lerFonteEventos } = await import('../src/agente/eventos.mjs');
  const { eventos } = lerFonteEventos(`const EVENTOS_CNPJ = ${JSON.stringify({ de: '2026-06', ate: '2026-08', eventos: [
    { base: '12345678', tipo: 'aquisicao_provavel', rotulo: 'Pessoa jurídica assumiu o quadro societário', detalhe: 'Sócios: 2 → 2 · sócios PJ: 0 → 1', ambiguidade: 'Pode ser reorganização.' }] })};\n`);
  assert.equal(eventos[0].rotulo, 'Entrou sócio pessoa jurídica no quadro');
  assert.match(eventos[0].ambiguidade, /Pode ser reorganização\. A comparação usa a quantidade de sócios/);
});

test('regressões da revisão: relação exige as duas pontas ativas, evento qualificante não some, continuação recomeça se os sinais mudam', async t => {
  const { randomUUID } = await import('node:crypto');
  const { importarEventos } = await import('../src/agente/eventos.mjs');
  const db = await bancoDeTeste(); t.after(() => db.close());
  await importarCatalogo(db, { texto: fonte() });
  const catalogo = criarCatalogoBanco(db);
  const u = await criarUsuario(db, { email: 'revisao@example.test' });
  const mes = (d) => { const x = new Date(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + d); return x.toISOString().slice(0, 7); };
  const arquivo = (de, ate, eventos) => `const EVENTOS_CNPJ = ${JSON.stringify({ de, ate, eventos })};
`;
  const daPossivel = async () => (await catalogo.buscar({ incluirPossiveis: true })).empresas.find((e) => e.id === 'cnpj87654321');
  // Relação confirmada: cada ponta inativa derruba o selo.
  const [ght4, alvo] = [randomUUID(), randomUUID()];
  await db.query(`INSERT INTO rede_pessoas (id,lado,nome,empresa_id,criado_por) VALUES ($1,'ght4','Sócia',NULL,$3),($2,'mercado','Diretor','cnpj87654321',$3)`, [ght4, alvo, u.id]);
  const [a, b] = [ght4, alvo].sort();
  await db.query(`INSERT INTO rede_vinculos (id,pessoa_a_id,pessoa_b_id,tipo,forca,evidencia,disposicao,criado_por) VALUES ($1,$2,$3,'trabalharam_juntos','direta','Trabalharam juntos','posso_apresentar',$4)`, [randomUUID(), a, b, u.id]);
  assert.equal((await daPossivel()).relacaoConfirmada, true);
  await db.query('UPDATE rede_pessoas SET ativo=false WHERE id=$1', [ght4]);
  assert.equal((await daPossivel()).relacaoConfirmada, false, 'pessoa da GHT4 inativa');
  await db.query('UPDATE rede_pessoas SET ativo=(id=$1) WHERE id IN ($1,$2)', [ght4, alvo]);
  assert.equal((await daPossivel()).relacaoConfirmada, false, 'pessoa da empresa inativa');
  await db.query('UPDATE rede_pessoas SET ativo=true'); await db.query('UPDATE rede_vinculos SET ativo=false');
  assert.equal((await daPossivel()).relacaoConfirmada, false, 'vínculo inativo');
  // Evento qualificante seguido de três "outro" mais novos continua no cartão.
  await importarEventos(db, { texto: arquivo(mes(-3), mes(-2), [{ base: '12345678', tipo: 'aumento_de_capital', rotulo: 'x', detalhe: '1 → 3', ambiguidade: 'y' }]) });
  await importarEventos(db, { texto: arquivo(mes(-2), mes(-1), ['saiu_de_ativa', 'entrada_no_escopo', 'saida_do_escopo'].map((tipo) => ({ base: '12345678', tipo, rotulo: 'x', detalhe: 'd', ambiguidade: 'y' }))) });
  const comEvento = await catalogo.buscar({ comEvento: true });
  assert.equal(comEvento.empresas[0].eventoRecente, true);
  assert.deepEqual(comEvento.empresas[0].eventos.map((e) => e.tipo), ['aumento_de_capital']);
  // Continuação da prioridade: evento novo entre as páginas força recomeço; sem mudança, continua.
  const p1 = await catalogo.buscar({ incluirPossiveis: true, ordem: 'prioridade', limite: 1 });
  assert.match(p1.hashPaginacao, /^[a-f0-9]{64}$/); assert.notEqual(p1.hashPaginacao, p1.hash);
  const continuar = () => catalogo.buscar({ incluirPossiveis: true, ordem: 'prioridade', limite: 1, offset: 1, catalogoHash: p1.hashPaginacao });
  assert.equal((await continuar()).empresas.length, 1);
  await importarEventos(db, { texto: arquivo(mes(-2), mes(-1), [{ base: '87654321', tipo: 'aumento_de_capital', rotulo: 'x', detalhe: '1 → 3', ambiguidade: 'y' }]) });
  await assert.rejects(continuar, (e) => e.codigo === 'base_atualizada');
  // Mudança na rede também.
  const p1b = await catalogo.buscar({ incluirPossiveis: true, ordem: 'prioridade', limite: 1 });
  await db.query('UPDATE rede_vinculos SET ativo=true, versao=versao+1, atualizado_em=now()');
  await assert.rejects(catalogo.buscar({ incluirPossiveis: true, ordem: 'prioridade', limite: 1, offset: 1, catalogoHash: p1b.hashPaginacao }), (e) => e.codigo === 'base_atualizada');
  // Ordem por enquadramento segue usando só o hash da publicação.
  const e1 = await catalogo.buscar({ incluirPossiveis: true, limite: 1 });
  assert.equal(e1.hashPaginacao, e1.hash);
});

test('eventos: raiz numérica é rejeitada e o rótulo do quadro não afirma mudança no total', async () => {
  const { lerFonteEventos } = await import('../src/agente/eventos.mjs');
  const arquivo = (eventos) => `const EVENTOS_CNPJ = ${JSON.stringify({ de: '2026-06', ate: '2026-08', eventos })};
`;
  assert.throws(() => lerFonteEventos(arquivo([{ base: 12345678, tipo: 'aumento_de_capital', detalhe: 'x', ambiguidade: 'y' }])), /raiz de CNPJ/);
  assert.equal(lerFonteEventos(arquivo([{ base: '01234567', tipo: 'aumento_de_capital', detalhe: 'x', ambiguidade: 'y' }])).eventos[0].base, '01234567');
  // Total igual e PJ diferente: o rótulo cobre os dois casos sem afirmar mudança no total.
  const { eventos } = lerFonteEventos(arquivo([{ base: '12345678', tipo: 'mudanca_quadro_societario', rotulo: 'Número de sócios mudou', detalhe: 'Sócios: 2 → 2 · sócios PJ: 1 → 0', ambiguidade: 'y' }]));
  assert.equal(eventos[0].rotulo, 'Contagem de sócios mudou (total ou pessoa jurídica)');
});

test('mudar, acrescentar ou retirar a fonte IBAMA publica um snapshot novo com o dado atual', async (t) => {
  const db = await bancoDeTeste(); t.after(() => db.close());
  const ibama = (grau, ano) => `const COLUNAS_IBAMA = ["raiz","grau","viva","ano"];\nconst LINHAS_IBAMA = [\n${JSON.stringify(['12345678', grau, true, ano])}\n];\n`;
  const atributo = async () => (await db.query(`SELECT r.atributos->'ibama' AS i FROM catalogo_controle c JOIN catalogo_registros r ON r.snapshot_id=c.snapshot_id
    JOIN entidades_juridicas e ON e.id=r.entidade_id WHERE e.cnpj_raiz='12345678'`)).rows[0].i;
  const sem = await importarCatalogo(db, { texto: fonte() });
  assert.equal(await atributo(), null);
  const comercio = await importarCatalogo(db, { texto: fonte(), textoIbama: ibama('comercio', 2024) });
  assert.equal(comercio.reutilizado, false, 'IBAMA acrescentado');
  assert.deepEqual(await atributo(), { grau: 'comercio', viva: true, ano: 2024 });
  const industria = await importarCatalogo(db, { texto: fonte(), textoIbama: ibama('industria', 2026) });
  assert.equal(industria.reutilizado, false, 'IBAMA alterado');
  assert.notEqual(industria.hash, comercio.hash);
  assert.deepEqual(await atributo(), { grau: 'industria', viva: true, ano: 2026 });
  assert.equal((await importarCatalogo(db, { texto: fonte(), textoIbama: ibama('industria', 2026) })).reutilizado, true);
  const retirado = await importarCatalogo(db, { texto: fonte() });
  assert.equal(retirado.hash, sem.hash, 'sem IBAMA volta à publicação sem IBAMA');
  assert.equal(retirado.reutilizado, true);
  assert.equal(await atributo(), null, 'a publicação sem IBAMA volta a ser a ativa');
  const manifesto = (await db.query('SELECT manifesto FROM snapshots_universo WHERE id=$1', [industria.snapshotId])).rows[0].manifesto;
  assert.match(manifesto[0].ibama, /^ibama:[0-9a-f]{64}$/);
});
