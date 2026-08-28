/* =============================================================================
 *  GHT4 · confere a conexão com o banco
 * -----------------------------------------------------------------------------
 *  Responde quatro perguntas sem imprimir credencial nenhuma:
 *    · qual driver está em uso;
 *    · o banco responde, e em qual versão;
 *    · quais extensões necessárias existem;
 *    · quais migrations já foram aplicadas.
 *
 *  A connection string NUNCA é impressa. O que sai é host e nome do banco, que
 *  bastam para saber se você está falando com o banco certo — e não servem para
 *  entrar nele.
 *
 *  USO
 *    npm run conferir --prefix server
 * ========================================================================== */

import { abrir, fechar, tipoDeBanco, consultar } from './cliente.mjs';
import { migracoesEmDisco } from './migrar.mjs';

/** Host e banco, sem usuário e sem senha. */
function alvoLegivel(url) {
  if (!url) return 'PGlite local (sem DATABASE_URL)';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(DATABASE_URL malformada)';
  }
}

console.log('\nGHT4 · conferindo a conexão\n');

const tipo = tipoDeBanco();
console.log(`  driver:  ${tipo}`);
console.log(`  alvo:    ${alvoLegivel(process.env.DATABASE_URL)}`);

if (tipo === 'pglite') {
  console.log('\n  Sem DATABASE_URL: rodando em PGlite (Postgres em WebAssembly).');
  console.log('  Serve a desenvolvimento e teste. Os benchmarks de escala do adendo');
  console.log('  NÃO podem ser medidos aqui — ver docs/architecture/adr/0001.');
  console.log('  Para apontar ao Supabase, copie server/.env.example para server/.env.\n');
}

let db;
try {
  db = await abrir();
} catch (erro) {
  console.error(`\n  ✗ não conectou: ${erro.message}\n`);
  console.error('  Coisas que costumam ser: senha errada na string, projeto do Supabase');
  console.error('  pausado por inatividade, ou IP bloqueado nas restrições de rede.\n');
  process.exit(1);
}

try {
  const [{ versao }] = await consultar(db, 'SELECT version() AS versao');
  console.log(`  versão:  ${versao.split(',')[0]}`);

  const extensoes = await consultar(
    db,
    `SELECT name, installed_version FROM pg_available_extensions
      WHERE name IN ('vector', 'pg_trgm', 'btree_gin', 'pgcrypto')
      ORDER BY name`,
  );
  console.log('\n  extensões:');
  for (const e of extensoes) {
    const estado = e.installed_version ? `instalada (${e.installed_version})` : 'disponível, não instalada';
    console.log(`    ${e.installed_version ? '✓' : '·'} ${e.name} — ${estado}`);
  }
  if (extensoes.length === 0) console.log('    (nenhuma das procuradas está disponível)');

  const temTabela = await consultar(
    db, `SELECT to_regclass('public.migracoes') IS NOT NULL AS existe`,
  );
  if (temTabela[0]?.existe) {
    const aplicadas = new Set((await consultar(db, 'SELECT nome FROM migracoes')).map((r) => r.nome));
    console.log('\n  migrations:');
    for (const m of migracoesEmDisco()) {
      console.log(`    ${aplicadas.has(m.nome) ? '✓' : '·'} ${m.nome}`);
    }
    const faltam = migracoesEmDisco().filter((m) => !aplicadas.has(m.nome)).length;
    if (faltam) console.log(`\n  ${faltam} migration(s) por aplicar: npm run migrar --prefix server`);
  } else {
    console.log('\n  migrations: nenhuma aplicada ainda.');
    console.log('  Rode: npm run migrar --prefix server');
  }

  console.log('\n  ✓ conexão ok\n');
} finally {
  await fechar();
}
