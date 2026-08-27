/* =============================================================================
 *  GHT4 · testes da trilha de auditoria
 * -----------------------------------------------------------------------------
 *  Cobre o terceiro critério de aceite da Fase 2: "toda mutação registra quem,
 *  quando, antes/depois e justificativa".
 *
 *  E cobre a parte que costuma faltar: que a trilha não pode ser reescrita.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';

import { registrar, registrarDecisao, historicoDe, limpar, trilhaEhImutavel } from '../src/auditoria/registrar.mjs';
import { bancoDeTeste, criarUsuario, criarMandato } from './ajuda.mjs';

test('um evento registra quem, quando, antes e depois', async () => {
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'a@ght4.com', papel: 'socio' });
  const m = await criarMandato(db, { codigo: 'QUIM-01' });

  await db.transaction(async (tx) => {
    await registrar(tx, {
      usuarioId: u.id,
      mandatoId: m.id,
      acao: 'editar',
      entidade: 'empresa',
      entidadeId: 'cnpj:12345678000199',
      antes: { estadoTriagem: 'nova', score: 61 },
      depois: { estadoTriagem: 'qualificada', score: 61 },
      justificativa: 'Confirmada operação de distribuição pelo RAPP/IBAMA.',
    });
  });

  const [ev] = await historicoDe(db, 'empresa', 'cnpj:12345678000199');
  assert.equal(ev.acao, 'editar');
  assert.equal(ev.usuario_nome, 'Fulano de Teste');
  assert.equal(ev.usuario_email, 'a@ght4.com');
  assert.ok(ev.ocorrido_em instanceof Date);
  assert.equal(ev.antes.estadoTriagem, 'nova');
  assert.equal(ev.depois.estadoTriagem, 'qualificada');
  assert.match(ev.justificativa, /RAPP\/IBAMA/);
});

test('a trilha recusa UPDATE e DELETE', async () => {
  /* A regra é do banco, não de quem chama. Uma trilha que a aplicação pode
     reescrever não serve de trilha. */
  const db = await bancoDeTeste();
  await db.transaction(async (tx) => {
    await registrar(tx, { acao: 'criar', entidade: 'teste', entidadeId: '1' });
  });

  await assert.rejects(
    () => db.query('UPDATE auditoria SET acao = $1 WHERE id = 1', ['adulterada']),
    /append-only/,
  );
  await assert.rejects(
    () => db.query('DELETE FROM auditoria WHERE id = 1'),
    /append-only/,
  );
  assert.equal(await trilhaEhImutavel(db), true);
});

test('a mutação e o registro sobem ou caem juntos', async () => {
  /* Se a empresa mudasse e a auditoria não, a trilha mentiria por omissão. */
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'b@ght4.com' });

  await db.exec(`CREATE TABLE empresas_teste (id TEXT PRIMARY KEY, estado TEXT)`);
  await db.query(`INSERT INTO empresas_teste VALUES ('e1', 'nova')`);

  await assert.rejects(() => db.transaction(async (tx) => {
    await tx.query(`UPDATE empresas_teste SET estado = 'qualificada' WHERE id = 'e1'`);
    await registrar(tx, {
      usuarioId: u.id, acao: 'editar', entidade: 'empresa', entidadeId: 'e1',
      antes: { estado: 'nova' }, depois: { estado: 'qualificada' },
    });
    throw new Error('falha depois de tudo');
  }));

  const linha = (await db.query(`SELECT estado FROM empresas_teste WHERE id = 'e1'`)).rows[0];
  assert.equal(linha.estado, 'nova', 'a mudança sobreviveu ao rollback');

  const trilha = await historicoDe(db, 'empresa', 'e1');
  assert.equal(trilha.length, 0, 'o registro sobreviveu ao rollback');
});

test('auditar fora de transação é recusado', async () => {
  const db = await bancoDeTeste();
  await assert.rejects(
    () => registrar(null, { acao: 'x', entidade: 'y' }),
    /precisa da transação/,
  );
  await assert.rejects(
    () => registrar({}, { acao: 'x', entidade: 'y' }),
    /precisa da transação/,
  );
});

test('decisão humana exige responsável e justificativa', async () => {
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'c@ght4.com', papel: 'socio' });

  await db.transaction(async (tx) => {
    await assert.rejects(
      () => registrarDecisao(tx, {
        usuarioId: u.id, entidade: 'empresa', entidadeId: 'e2',
        depois: { estado: 'descartada' },
      }),
      /exige justificativa/,
    );
    await assert.rejects(
      () => registrarDecisao(tx, {
        entidade: 'empresa', entidadeId: 'e2',
        justificativa: 'fora do escopo', depois: { estado: 'descartada' },
      }),
      /responsável nomeado/,
    );
  });

  await db.transaction(async (tx) => {
    await registrarDecisao(tx, {
      usuarioId: u.id, entidade: 'empresa', entidadeId: 'e2',
      antes: { estado: 'nova' }, depois: { estado: 'descartada' },
      justificativa: 'Combustível, não química — fora do recorte.',
    });
  });

  const [ev] = await historicoDe(db, 'empresa', 'e2');
  assert.equal(ev.acao, 'decidir');
  assert.match(ev.justificativa, /fora do recorte/);
});

test('segredo não entra na trilha, nem aninhado', async () => {
  const limpo = limpar({
    email: 'a@b.com',
    senha_hash: 'scrypt$32768$8$1$xxx',
    interno: { token: 'abc123', nome: 'ok', mais: { api_key: 'sk-secreta' } },
  });
  assert.equal(limpo.email, 'a@b.com');
  assert.equal(limpo.senha_hash, '[omitido]');
  assert.equal(limpo.interno.token, '[omitido]');
  assert.equal(limpo.interno.nome, 'ok');
  assert.equal(limpo.interno.mais.api_key, '[omitido]');
});

test('o histórico vem do mais recente para o mais antigo', async () => {
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'd@ght4.com' });

  for (const estado of ['nova', 'qualificada', 'aprovada']) {
    await db.transaction(async (tx) => {
      await registrar(tx, {
        usuarioId: u.id, acao: 'editar', entidade: 'empresa', entidadeId: 'e3',
        depois: { estado },
      });
    });
  }

  const trilha = await historicoDe(db, 'empresa', 'e3');
  assert.equal(trilha.length, 3);
  assert.equal(trilha[0].depois.estado, 'aprovada');
  assert.equal(trilha[2].depois.estado, 'nova');
});

test('a trilha guarda o run do agente quando a mutação veio dele', async () => {
  /* É o que permite responder "qual execução do agente mexeu nisto?" — o plano
     exige rastrear cada tool call até o efeito. */
  const db = await bancoDeTeste();
  await db.transaction(async (tx) => {
    await registrar(tx, {
      acao: 'criar', entidade: 'lista', entidadeId: 'l1',
      depois: { itens: 35 }, runId: 'run_abc123',
    });
  });
  const [ev] = await historicoDe(db, 'lista', 'l1');
  assert.equal(ev.run_id, 'run_abc123');
});
