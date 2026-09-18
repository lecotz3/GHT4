/* =============================================================================
 *  GHT4 · migra um PostgreSQL inteiro para outro
 * -----------------------------------------------------------------------------
 *  Escrito para a mudança de hospedagem (Render → Supabase), mas não sabe nada
 *  sobre nenhuma das duas: são duas connection strings.
 *
 *  POR QUE DOCKER
 *  `pg_dump` precisa ser da mesma versão do servidor ou mais nova — dump feito
 *  por binário antigo é recusado na restauração. Esta máquina não tem cliente
 *  PostgreSQL instalado, e fixar a imagem resolve as duas coisas de uma vez:
 *  versão previsível e nada para instalar.
 *
 *  A CREDENCIAL NÃO APARECE
 *  As duas strings saem de server/.env (que está no .gitignore) e entram no
 *  container por variável de ambiente, nunca por argumento — argumento aparece
 *  em `docker ps`, em `ps aux` e no histórico do shell. O que este script
 *  imprime é host:porta/banco, que não serve para entrar em lugar nenhum. É o
 *  mesmo cuidado de ferramentas/preparar-banco.mjs.
 *
 *  USO
 *    Em server/.env:
 *      MIGRAR_ORIGEM=postgresql://...     banco atual, de onde sai
 *      MIGRAR_DESTINO=postgresql://...    banco novo, porta de SESSÃO (5432)
 *
 *      node ferramentas/migrar-banco.mjs --conferir   só testa as duas pontas
 *      node ferramentas/migrar-banco.mjs --dump       para depois do dump
 *      node ferramentas/migrar-banco.mjs --restaurar  usa o dump já existente
 *      node ferramentas/migrar-banco.mjs              dump + restauração
 * ========================================================================== */

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { descreverAlvo, sessaoDoPooler } from '../server/src/db/cliente.mjs';

/* O cliente precisa ser >= o servidor de ORIGEM: com 17.6 aqui, o pg_dump
   recusava o Render (18.6) antes de ler uma linha.
   Tag fixa de propósito: "postgres:18" flutua, e um dia deixaria de casar com o
   servidor de origem sem ninguém aqui ter mudado nada. */
const IMAGEM = 'postgres:18.6-alpine';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(RAIZ, '.cache', 'migracao');
const NOME_DUMP = 'origem.dump';
const CAMINHO_DUMP = path.join(PASTA, NOME_DUMP);

const argumentos = new Set(process.argv.slice(2));

function exigir(nome) {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`\n  ✗ defina ${nome} em server/.env — ver o cabeçalho deste arquivo.\n`);
    process.exit(1);
  }
  return valor;
}

/**
 * Roda um comando no container com a credencial em `PGURL`.
 *
 * `sh -c` porque o comando precisa expandir $PGURL DENTRO do container: passar a
 * string expandida daqui a devolveria para a linha de comando, que é justamente
 * o que se quer evitar.
 */
function comBanco(url, comando, { montar = false, capturar = false } = {}) {
  const volume = montar ? ['-v', `${PASTA}:/trabalho`] : [];
  return spawnSync('docker', ['run', '--rm', '-e', 'PGURL', ...volume, IMAGEM, 'sh', '-c', comando], {
    env: { ...process.env, PGURL: url },
    stdio: capturar ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
}

const origem = exigir('MIGRAR_ORIGEM');

/* Quem copia a connection string do painel pega a de transação (6543), que é a
   que a hospedagem usa. pg_restore precisa da de sessão. Corrigir aqui é melhor
   que exigir que a pessoa edite a porta na mão: o erro sairia como um timeout
   no meio da restauração, difícil de ligar à causa. */
const colada = exigir('MIGRAR_DESTINO');
const sessao = sessaoDoPooler(colada);
const destino = sessao ?? colada;

if (origem === destino) {
  console.error('\n  ✗ MIGRAR_ORIGEM e MIGRAR_DESTINO são o mesmo banco. Nada a fazer.\n');
  process.exit(1);
}

console.log('\nGHT4 · migração de banco\n');
console.log(`  de:     ${descreverAlvo(origem)}`);
console.log(`  para:   ${descreverAlvo(destino)}`);
if (sessao) console.log('          (porta de sessão aplicada no lugar da 6543 que veio colada)');

const motor = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
if (motor.status !== 0) {
  console.error('\n  ✗ o Docker não respondeu. Abra o Docker Desktop e espere "Engine running".\n');
  process.exit(1);
}
console.log(`  docker: ${motor.stdout.trim()}`);

/* Provar que as duas pontas atendem ANTES de mover dado. Descobrir senha errada
   depois de dez minutos de dump é o pior jeito de descobrir. */
console.log('\n  conferindo as duas pontas...');
for (const [rotulo, url] of [['origem ', origem], ['destino', destino]]) {
  const r = comBanco(url, 'psql "$PGURL" -tAc "SELECT version()"', { capturar: true });
  if (r.status !== 0) {
    console.error(`\n  ✗ ${rotulo.trim()} não respondeu.`);
    console.error('    Costuma ser: senha errada na string, projeto do Supabase pausado,');
    console.error('    ou porta de transação (6543) onde devia ser a de sessão (5432).\n');
    process.exit(1);
  }
  console.log(`    ✓ ${rotulo} ${r.stdout.trim().split(',')[0]}`);
}

if (argumentos.has('--conferir')) {
  console.log('\n  ✓ as duas pontas respondem. Rode sem --conferir para migrar.\n');
  process.exit(0);
}

/* ---- dump ---------------------------------------------------------------- */
mkdirSync(PASTA, { recursive: true });

if (!argumentos.has('--restaurar')) {
  console.log('\n  gerando o dump...');
  /* Formato custom: comprimido e restaurável seletivamente. --no-owner e
     --no-privileges porque o dono e os GRANTs do banco antigo não existem no
     destino, e cada um viraria um erro na restauração. */
  const r = comBanco(origem,
    `pg_dump "$PGURL" --format=custom --no-owner --no-privileges --file=/trabalho/${NOME_DUMP}`,
    { montar: true });
  if (r.status !== 0) {
    console.error('\n  ✗ o dump falhou. Nada foi escrito no destino.\n');
    process.exit(1);
  }
  console.log(`    ✓ ${(statSync(CAMINHO_DUMP).size / 1024 / 1024).toFixed(1)} MB em .cache/migracao/${NOME_DUMP}`);
}

if (argumentos.has('--dump')) {
  console.log('\n  ✓ dump pronto. Rode com --restaurar quando quiser aplicá-lo.\n');
  process.exit(0);
}

/* ---- restauração --------------------------------------------------------- */
if (!existsSync(CAMINHO_DUMP)) {
  console.error('\n  ✗ não há dump em .cache/migracao. Rode sem --restaurar.\n');
  process.exit(1);
}

console.log('\n  restaurando no destino...');
/* Sem --exit-on-error de propósito: o Supabase já traz extensões instaladas e
   um CREATE EXTENSION repetido reclama. Isso não é motivo para abortar uma
   restauração inteira — quem decide se deu certo é a contagem logo abaixo. */
comBanco(destino, `pg_restore --dbname "$PGURL" --no-owner --no-privileges /trabalho/${NOME_DUMP}`,
  { montar: true });

console.log('\n  conferindo o que chegou...');
const contagem = comBanco(destino,
  'psql "$PGURL" -tAc "SELECT \'usuarios=\' || (SELECT count(*) FROM usuarios)' +
  ' || \'  migracoes=\' || (SELECT count(*) FROM migracoes)' +
  ' || \'  catalogo=\' || (SELECT count(*) FROM catalogo_registros)"',
  { capturar: true });

if (contagem.status !== 0) {
  console.error('\n  ✗ a contagem final falhou: a restauração pode estar incompleta.');
  console.error(`    ${(contagem.stderr || '').trim().split('\n').slice(-1)[0]}\n`);
  process.exit(1);
}

console.log(`    ${contagem.stdout.trim()}`);
console.log('\n  ✓ migração concluída. Confira os números contra o banco antigo antes');
console.log('    de trocar a DATABASE_URL da hospedagem.\n');
