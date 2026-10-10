import test from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeTeste,criarUsuario } from './ajuda.mjs';
import { gravarQuadro,validarDestinoImportacao } from '../../ferramentas/importar-quadro-societario.mjs';
import { avaliarConfiguracao } from '../../ferramentas/verificar-prontidao-rede.mjs';
test('importação remota não cai no banco local nem aceita destino diferente',()=>{
  assert.throws(()=>validarDestinoImportacao(null,'teste'),/Nenhum banco local/);
  assert.throws(()=>validarDestinoImportacao('postgresql://localhost/teste','localhost:5432/teste','1'),/Nenhum banco local/);
  assert.throws(()=>validarDestinoImportacao('postgresql://localhost/teste','outro'),/Confira o destino/);
  assert.equal(validarDestinoImportacao('postgresql://localhost/teste','localhost:5432/teste'),'postgresql://localhost/teste');
  assert.equal(avaliarConfiguracao({}).bancoConfigurado,false);
  assert.equal(avaliarConfiguracao({POSTGRES_URL:'credencial somente de teste'}).bancoConfigurado,true);
  assert.equal(avaliarConfiguracao({GHT4_ADMIN_SENHA_REDEFINIR:'teste'}).redefinicaoAdminPendente,true);
});
test('quadro societário grava e audita atomicamente; reexecução não duplica; falha desfaz a carga',async t=>{
  const db=await bancoDeTeste();t.after(()=>db.close());const u=await criarUsuario(db,{email:'admin@teste.local',papel:'admin'});
  const p={nome:'Presidente Sintético',nomeNormalizado:'presidente sintetico',cargo:'Presidente',senioridade:'ceo',organizacao:'Química Teste',empresaId:'cnpj12345678',referencia:'RFB 2026-08'};
  const op={operadorId:u.id,referencia:'2026-08',empresasAlcancadas:1};
  assert.deepEqual(await gravarQuadro(db,[p],op),{criadas:1,atualizadas:0});
  assert.deepEqual(await gravarQuadro(db,[p],op),{criadas:0,atualizadas:1});
  // O que o quadro atestou fica gravado: a precedência estatutária depende dele (migração 0032).
  assert.deepEqual((await db.query("SELECT quadro FROM rede_pessoas WHERE origem='cadastro_publico'")).rows[0].quadro,
    {nome:'Presidente Sintético',cargo:'Presidente',senioridade:'ceo',empresaId:'cnpj12345678'});
  await assert.rejects(gravarQuadro(db,[{...p,nome:'Outra Pessoa',nomeNormalizado:'outra pessoa'},{...p,nome:'Erro',nomeNormalizado:'erro',senioridade:'invalida'}],op));
  assert.equal((await db.query("SELECT count(*)::int n FROM rede_pessoas WHERE origem='cadastro_publico'")).rows[0].n,1);
  assert.equal((await db.query("SELECT count(*)::int n FROM auditoria WHERE entidade='rede_quadro_societario'")).rows[0].n,2);
  // A auditoria diz qual recorte entrou.
  const socio={...p,nome:'Sócia Administradora',nomeNormalizado:'socia administradora',cargo:'Sócio-administrador'};
  assert.deepEqual(await gravarQuadro(db,[socio],{...op,socioAdministrador:true}),{criadas:1,atualizadas:0});
  const recortes=(await db.query("SELECT depois->>'recorte' r, justificativa j FROM auditoria WHERE entidade='rede_quadro_societario'")).rows;
  assert.deepEqual(recortes.map(x=>x.r).sort(),['cargos_estatutarios','cargos_estatutarios','cargos_estatutarios_e_socio_administrador_ltda']);
  assert.ok(recortes.some(x=>/sócio-administrador das limitadas/.test(x.j)));
});
