/* =============================================================================
 *  GHT4 · testes do object storage
 * -----------------------------------------------------------------------------
 *  A camada raw só cumpre o que promete se o arquivo guardado for exatamente o
 *  arquivo recebido, e se ninguém conseguir escrever fora do armazenamento.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

/* Cada execução usa um diretório próprio: os testes não veem o dado um do
   outro, e nada sobra na árvore do projeto. */
process.env.OBJETOS_DIR = await fsp.mkdtemp(path.join(os.tmpdir(), 'ght4-objetos-'));

const objetos = await import('../src/armazenamento/objetos.mjs');

test('gravar devolve o hash e o tamanho do que foi gravado', async () => {
  const conteudo = Buffer.from('cnpj;razao_social\n12345678000199;Distribuidora X\n');
  const esperado = crypto.createHash('sha256').update(conteudo).digest('hex');

  const r = await objetos.por('raw/teste/arquivo.csv', conteudo);

  assert.equal(r.hash, esperado);
  assert.equal(r.tamanho, conteudo.length);
  assert.deepEqual(await objetos.obter('raw/teste/arquivo.csv'), conteudo);
});

test('o hash é calculado em streaming, sem juntar o arquivo na memória', async () => {
  /* Um arquivo da RFB tem gigabytes. Se o hash exigisse o conteúdo inteiro em
     memória, streamar não adiantaria nada. */
  const pedacos = Array.from({ length: 500 }, (_, i) => Buffer.from(`linha ${i}\n`));
  const inteiro = Buffer.concat(pedacos);
  const esperado = crypto.createHash('sha256').update(inteiro).digest('hex');

  const r = await objetos.por('raw/teste/grande.txt', Readable.from(pedacos));

  assert.equal(r.hash, esperado);
  assert.equal(r.tamanho, inteiro.length);
});

test('escrita interrompida não deixa objeto pela metade', async () => {
  /* Um objeto truncado que a próxima leitura tomasse por completo seria pior
     que objeto nenhum. */
  const quebrado = new Readable({
    read() {
      this.push(Buffer.from('comeco'));
      this.destroy(new Error('rede caiu'));
    },
  });

  await assert.rejects(() => objetos.por('raw/teste/quebrado.bin', quebrado), /rede caiu/);
  assert.equal(await objetos.existe('raw/teste/quebrado.bin'), false);

  const sobrou = (await fsp.readdir(path.join(objetos.raiz(), 'raw', 'teste')))
    .filter((n) => n.endsWith('.tmp'));
  assert.deepEqual(sobrou, [], 'sobrou arquivo temporário');
});

test('chave com ../ não escreve fora do armazenamento', async () => {
  /* A chave pode vir de nome de arquivo enviado por gente. */
  for (const chave of ['../fora.txt', 'raw/../../fora.txt', '/etc/passwd', 'raw/a/../../../fora']) {
    await assert.rejects(
      () => objetos.por(chave, Buffer.from('x')),
      /fora do armazenamento/,
      `a chave "${chave}" passou`,
    );
  }
});

test('chave vazia ou com byte nulo é recusada', async () => {
  await assert.rejects(() => objetos.por('', Buffer.from('x')), /vazia/);
  await assert.rejects(() => objetos.por('raw/a\0b', Buffer.from('x')), /byte nulo/);
});

test('a chave de ativo carrega o hash, então o mesmo arquivo ocupa um lugar só', async () => {
  const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const a = objetos.chaveDeAtivo({ fonte: 'rfb_cnpj', referencia: '2026-08', hash, nomeArquivo: 'empresas.zip' });
  const b = objetos.chaveDeAtivo({ fonte: 'rfb_cnpj', referencia: '2026-08', hash, nomeArquivo: 'empresas.zip' });

  assert.equal(a, b);
  assert.match(a, /^raw\/rfb_cnpj\/2026-08\/abcdef0123456789-empresas\.zip$/);
});

test('nome de arquivo hostil é neutralizado na chave', async () => {
  const chave = objetos.chaveDeAtivo({
    fonte: 'rfb_cnpj', referencia: '2026-08', hash: 'a'.repeat(64),
    nomeArquivo: '../../etc/pas swd;rm -rf.zip',
  });
  assert.ok(!chave.includes('..'), `a chave manteve travessia: ${chave}`);
  assert.ok(!chave.includes(' '), 'a chave manteve espaço');
  assert.ok(!chave.includes(';'), 'a chave manteve ponto e vírgula');
});

test('listar traz o que existe sob o prefixo, e nada de temporário', async () => {
  await objetos.por('raw/lista/a.txt', Buffer.from('a'));
  await objetos.por('raw/lista/sub/b.txt', Buffer.from('b'));
  await fsp.writeFile(path.join(objetos.raiz(), 'raw', 'lista', 'c.tmp'), 'lixo');

  const achadas = await objetos.listar('raw/lista');
  assert.deepEqual(achadas, ['raw/lista/a.txt', 'raw/lista/sub/b.txt']);
});

test('prefixo inexistente é lista vazia, não erro', async () => {
  assert.deepEqual(await objetos.listar('raw/nao-existe'), []);
});

test('estatísticas não leem o conteúdo', async () => {
  const conteudo = Buffer.alloc(4096, 7);
  await objetos.por('raw/teste/stat.bin', conteudo);
  const s = await objetos.estatisticas('raw/teste/stat.bin');
  assert.equal(s.tamanho, 4096);
  assert.ok(s.modificadoEm instanceof Date);
});

test('hashDe confere o que está gravado', async () => {
  const conteudo = Buffer.from('conteudo para conferir');
  const { hash } = await objetos.por('raw/teste/conferir.txt', conteudo);
  assert.equal(await objetos.hashDe('raw/teste/conferir.txt'), hash);
});

test.after(async () => {
  await fsp.rm(objetos.raiz(), { recursive: true, force: true });
});
