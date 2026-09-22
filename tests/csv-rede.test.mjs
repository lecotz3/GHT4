import test from 'node:test';
import assert from 'node:assert/strict';
import { lerCsvRede,mapearCabecalho,empresaDoCsv } from '../v1/src/agente/csv-rede.ts';
test('CSV de contatos suporta BOM, vírgula, ponto e vírgula, aspas e quebras internas',()=>{
  assert.deepEqual(lerCsvRede('\uFEFFNome;Empresa;Evidencia\r\n"Ana; Maria";"Química ""Teste""";"Primeira linha\nsegunda linha"',';'),[
    ['Nome','Empresa','Evidencia'],['Ana; Maria','Química "Teste"','Primeira linha\nsegunda linha']]);
  assert.equal(mapearCabecalho(['First Name','Last Name','Company','Email Address','URL']).linkedin,4);
  assert.equal(empresaDoCsv('12.345.678/0001-90'),'cnpj12345678');assert.equal(empresaDoCsv(''),null);
  assert.throws(()=>empresaDoCsv('123'),/CNPJ/);assert.throws(()=>lerCsvRede('a,b\n"sem fechamento'),/aspas/);
  assert.throws(()=>lerCsvRede('a,b\n"nome"resto,x'),/depois/);
  assert.throws(()=>lerCsvRede('a'.repeat(2_000_001)),/2 MB/);
});
