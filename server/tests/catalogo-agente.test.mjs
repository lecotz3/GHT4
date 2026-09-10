import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarCatalogo } from '../src/agente/catalogo.mjs';

test('catálogo interpreta JSON, filtra por atividade e não propaga inferências de sucessão ou contatos', async (t) => {
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-catalogo-'));
  const arquivo = path.join(pasta, 'base.js');
  t.after(async () => { await rm(arquivo, { force: true }); await rmdir(pasta); });
  const colunas = ['id','nome','razaoSocial','cnpjRaiz','cidade','uf','cnaePrincipal','cnaeSecundarias','situacaoCadastral','naturezaJuridica','sucessaoProvavel','contato'];
  const linhas = [
    ['cnpj12345678','Química Teste','Química Teste Ltda','12345678','São Paulo','SP','4684299',[],'02','2062',true,{ email: 'privado@teste.local' }],
    ['cnpj87654321','Nome Secundário','Nome Secundário Ltda','87654321','Campinas','SP','4693100',['4684299'],'02','2062',false,null],
    ['cnpj11111111','Inativa','Inativa Ltda','11111111','Curitiba','PR','4684299',[],'08','2062',false,null],
  ];
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map(JSON.stringify).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "2026-08";\nglobalThis.naoExecutar = true;`);
  const catalogo = criarCatalogo({ arquivo });
  const r = await catalogo.buscar({ busca: 'quimica sao', uf: 'SP' });
  assert.equal(r.total, 1);
  assert.equal(r.empresas[0].estado, 'provavel');
  assert.equal(r.empresas[0].receita, null);
  assert.equal(r.empresas[0].intencaoDeTransacao, 'Não apurada');
  assert.ok(!JSON.stringify(r).includes('privado@'));
  assert.ok(!JSON.stringify(r).includes('sucessaoProvavel'));
  assert.equal(globalThis.naoExecutar, undefined);
  assert.equal((await catalogo.buscar({ incluirPossiveis: true })).total, 2);
  assert.equal((await catalogo.buscar({ uf: 'PR' })).total, 0);
});
