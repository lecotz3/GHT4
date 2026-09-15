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
