/* Ensaio de concorrência da reserva da pesquisa por tese em PostgreSQL real, com
   várias conexões do pool disputando a mesma fila. PGlite serializa tudo e não
   certifica isso. Roda só com GHT4_TESTE_PG_URL apontando para um banco DESCARTÁVEL
   (as migrações são aplicadas e os dados do ensaio ficam lá). Ex.:
   GHT4_TESTE_PG_URL=postgres://postgres:senha@127.0.0.1:5432/ght4_ensaio npm test --prefix server */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { abrirPostgres } from '../src/db/cliente.mjs';
import { migrar } from '../src/db/migrar.mjs';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';
import { criarMotorPesquisa } from '../src/pesquisa/motor.mjs';

const URL_PG = process.env.GHT4_TESTE_PG_URL;

/* Fixture e asserções iguais nos dois bancos: em PGlite (sempre) valida o setup contra o
   schema migrado e a lógica em série; em PostgreSQL real certifica a disputa entre conexões. */
async function ensaio(db) {
  const u = await criarUsuario(db, { email: `pg-${randomUUID()}@teste.local` });
  const conversa = (await db.query(`INSERT INTO agente_conversas (usuario_id,titulo) VALUES ($1,'Ensaio PG') RETURNING id`, [u.id])).rows[0].id;
  const nova = async (itens, limiteWeb) => {
    const id = randomUUID();
    await db.query(`INSERT INTO pesquisas_tese (id,conversa_id,usuario_id,tese,frente,filtros,criterios,meta,limite_web,catalogo_hash,referencia,funil,modo,estado,execucao)
      VALUES ($1,$2,$3,'Ensaio de concorrência','venda','{}','[]',100,$4,$5,'2026-08','{}','regras','em_andamento',1)`, [id, conversa, u.id, limiteWeb, 'a'.repeat(64)]);
    await db.query(`INSERT INTO pesquisa_itens (pesquisa_id,empresa_id,ordem,empresa,etapa,vereditos,aderencia,categoria)
      SELECT $1,'cnpj'||lpad(n::text,8,'0'),n,'{}','aguardando','[]',0,'a_confirmar' FROM generate_series(1,$2::int) n`, [id, itens]);
    return id;
  };
  const motor = criarMotorPesquisa({ db, catalogo: null });
  // 20 reservas simultâneas sobre 10 empresas: cada empresa sai uma vez, as demais voltam vazias.
  const fila = await nova(10, 500);
  const r = await Promise.all(Array.from({ length: 20 }, () => motor.reservar(fila, 1)));
  const pegas = r.map((x) => x.item?.empresa_id).filter(Boolean);
  assert.equal(pegas.length, 10);
  assert.equal(new Set(pegas).size, 10, 'nenhuma empresa reservada duas vezes');
  // Orçamento 3 com 10 reservas simultâneas: no máximo 3 em voo.
  const orcamento = await nova(10, 3);
  const r2 = await Promise.all(Array.from({ length: 10 }, () => motor.reservar(orcamento, 1)));
  assert.equal(r2.filter((x) => x.item).length, 3);
  assert.equal(r2.filter((x) => x.limite === 3).length, 7);
  // Geração antiga não reserva.
  assert.equal((await motor.reservar(fila, 0)).interrompida, true);
}

test('ensaio de reserva: fixture válida no schema migrado e lógica em série (PGlite)', async (t) => {
  const db = await bancoDeTeste();
  t.after(() => db.close());
  await ensaio(db);
});

test('reserva em PostgreSQL: conexões concorrentes nunca pegam a mesma empresa nem passam do orçamento', { skip: !URL_PG && 'defina GHT4_TESTE_PG_URL para rodar' }, async (t) => {
  const db = await abrirPostgres(URL_PG);
  t.after(() => db.close());
  await migrar(db, { silencioso: true });
  await ensaio(db);
});
