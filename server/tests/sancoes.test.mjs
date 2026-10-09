import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { primeiroArquivoDoZip, sancoesDoCsv, gerarArquivo } from '../../ferramentas/importar-sancoes.mjs';
import { lerSancoes, diligencia, situacaoDe } from '../src/empresas/sancoes.mjs';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';

/** ZIP mínimo de um arquivo, com diretório central, como o da CGU. */
function zip(nome, conteudo) {
  const dados = zlib.deflateRawSync(conteudo);
  const n = Buffer.from(nome);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(dados.length, 18);
  local.writeUInt32LE(conteudo.length, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(dados.length, 20);
  central.writeUInt32LE(conteudo.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42);
  const inicioCentral = local.length + n.length + dados.length;
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(1, 8); fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(central.length + n.length, 12); fim.writeUInt32LE(inicioCentral, 16);
  return Buffer.concat([local, n, dados, central, n, fim]);
}

const CAB = '"CADASTRO";"CÓDIGO DA SANÇÃO";"TIPO DE PESSOA";"CPF OU CNPJ DO SANCIONADO";"NOME DO SANCIONADO";"NÚMERO DO PROCESSO";"CATEGORIA DA SANÇÃO";"DATA INÍCIO SANÇÃO";"DATA FINAL SANÇÃO";"ABRAGÊNCIA DA SANÇÃO";"ÓRGÃO SANCIONADOR";"UF ÓRGÃO SANCIONADOR";"ESFERA ÓRGÃO SANCIONADOR";"FUNDAMENTAÇÃO LEGAL"';
const CSV = [CAB,
  '"CEIS";"1";"F";"12345678901";"PESSOA FISICA";"P1";"Suspensão";"01/01/2025";"01/01/2027";"";"Órgão A";"SP";"ESTADUAL";"LEI X"',
  '"CEIS";"2";"J";"12345678000190";"QUIMICA ALFA LTDA";"P2";"Impedimento/proibição de contratar com prazo determinado";"10/12/2024";"10/12/2028";"Em todos os Poderes";"Governo do Estado (RS)";"RS";"ESTADUAL";"LEI 14133 ""ART. 156"""',
  '"CEIS";"3";"J";"12345678000271";"QUIMICA ALFA LTDA";"P3";"Suspensão";"01/02/2020";"01/02/2021";"";"Prefeitura B";"MG";"MUNICIPAL";"LEI Y"',
  '"CEIS";"4";"J";"99999999000100";"FORA DO CATALOGO";"P4";"Suspensão";"01/02/2020";"";"";"Órgão C";"PR";"ESTADUAL";"LEI Z"',
].join('\r\n');

test('importador de sanções: lê o ZIP, descarta pessoa física e fica só com o catálogo e os campos da sanção', () => {
  const texto = primeiroArquivoDoZip(zip('20261008_CEIS.csv', Buffer.from(CSV, 'latin1'))).toString('latin1');
  assert.equal(texto, CSV);
  const r = sancoesDoCsv(texto, new Set(['12345678']));
  assert.equal(r.pessoasFisicasDescartadas, 1);
  assert.equal(r.foraDoCatalogo, 1);
  assert.equal(r.registros.length, 2);
  assert.deepEqual(r.registros[0], ['12345678', '12345678000190', 'CEIS', '2', 'Impedimento/proibição de contratar com prazo determinado', '2024-12-10', '2028-12-10',
    'Governo do Estado (RS)', 'ESTADUAL', 'RS', 'Em todos os Poderes']);
  const arquivo = gerarArquivo(r.registros, '2026-10-08', { empresas: 1 });
  assert.doesNotMatch(arquivo, /PESSOA FISICA|12345678901|QUIMICA ALFA|P2|LEI/, 'nome, CPF, processo e fundamentação ficam fora');
  assert.throws(() => sancoesDoCsv('"OUTRA";"COISA"\r\n"a";"b"', new Set()), /Coluna ausente/);

  // O leitor do servidor lê o arquivo gerado e classifica sem palpite.
  const base = lerSancoes(arquivo);
  assert.equal(base.referencia, '2026-10-08');
  const d = diligencia(base, '12345678', '2026-10-09');
  assert.deepEqual(d.registros.map((x) => x.situacao), ['vigente', 'encerrada']);
  assert.equal(d.atencao, true);
  assert.equal(situacaoDe({ fim: null }, '2026-10-09'), 'sem_data_final');
  assert.equal(diligencia(base, '87654321', '2026-10-09').atencao, false);
  assert.equal(diligencia(null, '12345678').consultada, false);
});

test('plano de acesso: sanção não encerrada vira alerta antes da mensagem; lista ausente é dita', async (t) => {
  const empresa = { id: 'cnpj12345678', nome: 'Química Alfa', razaoSocial: 'Química Alfa Ltda', cnpjRaiz: '12345678', uf: 'SP', cidade: 'Campinas', estado: 'provavel', referencia: '2026-08' };
  const catalogo = { buscar: async () => ({ empresas: [empresa], total: 1, referencia: '2026-08', hash: 'h' }), obter: async (id) => id === empresa.id ? empresa : null };
  const base = lerSancoes(gerarArquivo(sancoesDoCsv(CSV, new Set(['12345678'])).registros, '2026-10-08', { empresas: 1 }));
  const montar = async (sancoes) => {
    const db = await bancoDeTeste();
    const app = await criarApp(db, { catalogo, sancoes });
    t.after(async () => { await app.close(); await db.close(); });
    await criarUsuario(db, { email: 'socio@teste.local', papel: 'socio', senha: 'Senha restrita aos testes 2026!' });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email: 'socio@teste.local', senha: 'Senha restrita aos testes 2026!' } });
    const cookie = r.headers['set-cookie'].split(';')[0];
    return (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
  };
  const chamar = await montar({ daEmpresa: async (raiz) => diligencia(base, raiz, '2026-10-09') });
  const p = (await chamar('GET', '/api/acesso/cnpj12345678')).json();
  assert.equal(p.diligencia.registros.length, 2);
  assert.match(p.passo.alerta, /^Diligência: 1 registro no CEIS sem encerramento \(impedimento\/proibição de contratar/);
  assert.match(p.passo.alerta, /compliance/);
  assert.equal(p.passo.acao, 'registrar_decisor', 'o alerta não esconde o passo');

  const semLista = await montar({ daEmpresa: async (raiz) => diligencia(null, raiz) });
  const q = (await semLista('GET', '/api/acesso/cnpj12345678')).json();
  assert.equal(q.diligencia.consultada, false);
  assert.equal(q.passo.alerta, undefined);
});
