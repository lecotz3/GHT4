/* Escolha de destino e de TLS na hospedagem gerenciada.
 *
 * Estas três decisões falham em silêncio quando erram, e cada uma já custou um
 * ciclo de deploy:
 *   · migration rodando no pooler de TRANSAÇÃO perde o advisory lock;
 *   · POSTGRES_URL_NON_POOLING é IPv6-only e o build da Vercel não a alcança;
 *   · sem a raiz do Supabase, o pg recusa a conexão antes de mandar a senha.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { urlBanco, urlDireta, descreverAlvo } from '../src/db/cliente.mjs';
import { CA_SUPABASE } from '../src/db/ca-supabase.mjs';
import { validarOperacao } from '../src/operacao/configuracao.mjs';

const CHAVES = ['DATABASE_URL', 'DATABASE_URL_DIRETA', 'POSTGRES_URL', 'GHT4_APENAS_LOCAL'];

/** Roda `corpo` com um ambiente controlado e devolve o anterior ao sair. */
function comAmbiente(valores, corpo) {
  const anterior = Object.fromEntries(CHAVES.map((k) => [k, process.env[k]]));
  try {
    for (const chave of CHAVES) delete process.env[chave];
    Object.assign(process.env, valores);
    return corpo();
  } finally {
    for (const chave of CHAVES) delete process.env[chave];
    for (const [chave, valor] of Object.entries(anterior)) if (valor !== undefined) process.env[chave] = valor;
  }
}

const POOLER = 'postgresql://postgres.abc:segredo@aws-1-sa-east-1.pooler.supabase.com';

test('a conexão de sessão vem da de transação trocando só a porta', () => {
  comAmbiente({ DATABASE_URL: `${POOLER}:6543/postgres` }, () => {
    const direta = new URL(urlDireta());
    assert.equal(direta.port, '5432', 'migrations precisam da porta de sessão');
    assert.equal(direta.hostname, 'aws-1-sa-east-1.pooler.supabase.com');
    assert.equal(direta.password, 'segredo', 'a credencial é a mesma nas duas portas');
  });
});

test('DATABASE_URL_DIRETA explícita manda sobre a derivação', () => {
  comAmbiente({ DATABASE_URL: `${POOLER}:6543/postgres`, DATABASE_URL_DIRETA: 'postgresql://eu:x@outro.host:5432/db' }, () => {
    assert.equal(new URL(urlDireta()).hostname, 'outro.host');
  });
});

test('Postgres que não é pooler do Supabase usa a mesma URL nas duas pontas', () => {
  // Render, Neon, banco próprio: não existe "porta de sessão" separada para derivar.
  const url = 'postgresql://u:s@dpg-algo.oregon-postgres.render.com:5432/ght4';
  comAmbiente({ DATABASE_URL: url }, () => assert.equal(urlDireta(), url));
});

test('a porta 5432 do pooler já é de sessão e não é mexida', () => {
  const url = `${POOLER}:5432/postgres`;
  comAmbiente({ DATABASE_URL: url }, () => assert.equal(urlDireta(), url));
});

test('POSTGRES_URL da integração Supabase-Vercel serve, e DATABASE_URL tem precedência', () => {
  comAmbiente({ POSTGRES_URL: `${POOLER}:6543/postgres` }, () => {
    assert.equal(new URL(urlBanco()).port, '6543');
    assert.equal(new URL(urlDireta()).port, '5432');
  });
  comAmbiente({ DATABASE_URL: 'postgresql://u:s@escolhido:5432/db', POSTGRES_URL: `${POOLER}:6543/postgres` }, () => {
    assert.equal(new URL(urlBanco()).hostname, 'escolhido');
  });
  comAmbiente({}, () => assert.equal(urlBanco(), null));
});

test('produção aceita a integração, e segue recusando banco local e TLS desligado', () => {
  const base = { NODE_ENV: 'production', GHT4_SERVIR_INTERFACE: '/app/v1/dist', GHT4_ORIGEM_PUBLICA: 'https://ght4.example.test' };
  assert.doesNotThrow(() => validarOperacao({ ...base, POSTGRES_URL: `${POOLER}:6543/postgres` }));
  assert.throws(() => validarOperacao(base), /Postgres persistente/);
  assert.throws(() => validarOperacao({ ...base, POSTGRES_URL: POOLER, GHT4_APENAS_LOCAL: '1' }), /Postgres persistente/);
  assert.throws(() => validarOperacao({ ...base, POSTGRES_URL: POOLER, PGSSL_INSEGURO: '1' }), /certificado/);
});

test('a raiz do Supabase embarcada é a autoridade certa e não expirou', () => {
  const certificado = new X509Certificate(CA_SUPABASE);
  assert.match(certificado.subject, /CN=Supabase Root 2021 CA/);
  // Autoassinada: é âncora de confiança, não um elo intermediário.
  assert.equal(certificado.issuer, certificado.subject);
  assert.equal(certificado.ca, true);
  assert.ok(new Date(certificado.validTo) > new Date(), 'a raiz embarcada expirou: trocar pela publicada pelo Supabase');
  /* Fixar a impressão digital é o ponto do exercício: sem isto, trocar o
     certificado por outro qualquer passaria despercebido na revisão. */
  assert.equal(
    certificado.fingerprint256,
    '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
  );
});

test('o alvo legível mostra onde conecta e nunca a credencial', () => {
  const descricao = descreverAlvo(`${POOLER}:6543/postgres`);
  assert.equal(descricao, 'aws-1-sa-east-1.pooler.supabase.com:6543/postgres');
  assert.doesNotMatch(descricao, /segredo|postgres\.abc/);
  assert.match(descreverAlvo(null), /PGlite/);
  assert.match(descreverAlvo('nao-e-uma-url'), /malformada/);
});
