/* =============================================================================
 *  GHT4 · testes das camadas raw / master / serving
 * -----------------------------------------------------------------------------
 *  O adendo tem princípios que só valem se forem impostos pelo BANCO. Convenção
 *  documentada é convenção quebrada: o arquivo raw acaba editado, a coorte
 *  materializada acaba corrigida no lugar, e a lista de ontem deixa de se
 *  explicar sem ninguém perceber.
 *
 *  Estes testes verificam que as regras têm dente.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';

import { bancoDeTeste, criarUsuario, criarMandato } from './ajuda.mjs';

/** Um snapshot pronto, que é pré-requisito de quase tudo na serving. */
async function comSnapshot(db, { estado = 'pronto' } = {}) {
  const r = await db.query(
    `INSERT INTO snapshots_universo (rotulo, referencia, data_corte, estado, contagens)
     VALUES ('Químicos 2026-08', '2026-08', '2026-08-01', $1, '{"universo": 38583}'::jsonb)
     RETURNING *`, [estado]);
  return r.rows[0];
}

async function comEntidade(db, cnpjRaiz = '12345678') {
  const r = await db.query(
    `INSERT INTO entidades_juridicas (cnpj_raiz, razao_social)
     VALUES ($1, 'Distribuidora de Teste Ltda') RETURNING *`, [cnpjRaiz]);
  return r.rows[0];
}

/* ---- raw ------------------------------------------------------------------ */

test('o catálogo de fontes grava o método permitido, e o LinkedIn está proibido', async () => {
  /* A decisão de negócio "não raspar LinkedIn" vira dado, não folclore oral. */
  const db = await bancoDeTeste();
  const r = await db.query(
    `SELECT chave, metodo_permitido FROM fontes_de_dados WHERE chave IN ('linkedin','capital_iq','rfb_cnpj') ORDER BY chave`);
  const porChave = Object.fromEntries(r.rows.map((x) => [x.chave, x.metodo_permitido]));
  assert.equal(porChave.linkedin, 'proibido');
  assert.equal(porChave.capital_iq, 'exportacao_autorizada');
  assert.equal(porChave.rfb_cnpj, 'dados_abertos');
});

test('arquivo recebido é imutável no que importa', async () => {
  const db = await bancoDeTeste();
  const a = (await db.query(
    `INSERT INTO ativos_de_dados (fonte, nome_arquivo, caminho_objeto, hash_sha256, tamanho_bytes)
     VALUES ('rfb_cnpj', 'empresas.zip', 'raw/rfb/empresas.zip', 'abc123', 1000)
     RETURNING *`)).rows[0];

  await assert.rejects(
    () => db.query('UPDATE ativos_de_dados SET hash_sha256 = $1 WHERE id = $2', ['outro', a.id]),
    /imutavel/,
  );
  await assert.rejects(
    () => db.query('UPDATE ativos_de_dados SET tamanho_bytes = 2000 WHERE id = $1', [a.id]),
    /imutavel/,
  );

  /* Mas o estado e o relatório de qualidade mudam: é o ciclo de processamento. */
  await db.query(
    `UPDATE ativos_de_dados SET estado = 'processado', relatorio_qualidade = '{"lidos":100}'::jsonb WHERE id = $1`,
    [a.id]);
  const depois = (await db.query('SELECT estado FROM ativos_de_dados WHERE id = $1', [a.id])).rows[0];
  assert.equal(depois.estado, 'processado');
});

test('o mesmo arquivo da mesma fonte é um ativo só', async () => {
  const db = await bancoDeTeste();
  const inserir = () => db.query(
    `INSERT INTO ativos_de_dados (fonte, nome_arquivo, caminho_objeto, hash_sha256, tamanho_bytes)
     VALUES ('rfb_cnpj', 'x.zip', 'raw/x.zip', 'mesmo-hash', 10)`);
  await inserir();
  await assert.rejects(inserir, /duplicate key|unique/i);
});

test('snapshot pronto não muda de conteúdo', async () => {
  const db = await bancoDeTeste();
  const s = await comSnapshot(db);

  await assert.rejects(
    () => db.query(`UPDATE snapshots_universo SET data_corte = '2026-09-01' WHERE id = $1`, [s.id]),
    /imutavel/,
  );

  /* Arquivar é permitido: muda o estado, não o conteúdo. */
  await db.query(`UPDATE snapshots_universo SET estado = 'arquivado' WHERE id = $1`, [s.id]);
});

test('registro inválido vai para quarentena com o bruto e o motivo', async () => {
  /* Sem isto, 500 linhas mal formadas viram ou uma importação que nunca termina,
     ou 500 empresas que ninguém sabe que faltam. */
  const db = await bancoDeTeste();
  const s = await comSnapshot(db);
  const e = (await db.query(
    `INSERT INTO execucoes_importacao (snapshot_id, fonte, etapa)
     VALUES ($1, 'rfb_cnpj', 'importacao') RETURNING *`, [s.id])).rows[0];

  await db.query(
    `INSERT INTO registros_quarentena (execucao_id, linha_origem, bruto, motivo)
     VALUES ($1, 42, '{"cnpj":"nao-e-cnpj"}'::jsonb, 'cnpj fora do formato')`, [e.id]);

  const q = (await db.query(
    'SELECT bruto, motivo FROM registros_quarentena WHERE execucao_id = $1', [e.id])).rows[0];
  assert.equal(q.bruto.cnpj, 'nao-e-cnpj');
  assert.match(q.motivo, /formato/);
});

/* ---- master --------------------------------------------------------------- */

test('raiz do CNPJ é única: 40 filiais não viram 40 empresas', async () => {
  /* Confundir raiz com estabelecimento faz o mapa de mercado mentir sobre
     fragmentação, que é justamente o que o produto mede. */
  const db = await bancoDeTeste();
  const e = await comEntidade(db, '11111111');

  await db.query(
    `INSERT INTO estabelecimentos (entidade_id, cnpj, matriz, uf) VALUES
      ($1, '11111111000101', TRUE,  'SP'),
      ($1, '11111111000202', FALSE, 'PR'),
      ($1, '11111111000303', FALSE, 'MG')`, [e.id]);

  const empresas = (await db.query('SELECT count(*)::int n FROM entidades_juridicas')).rows[0].n;
  const estabs = (await db.query('SELECT count(*)::int n FROM estabelecimentos')).rows[0].n;
  assert.equal(empresas, 1);
  assert.equal(estabs, 3);

  await assert.rejects(() => comEntidade(db, '11111111'), /duplicate key|unique/i);
});

test('observação financeira exige unidade e período', async () => {
  /* "R$ 300" — mil ou milhões? De que ano? É a porta de entrada do erro caro. */
  const db = await bancoDeTeste();
  const e = await comEntidade(db);

  await assert.rejects(
    () => db.query(
      `INSERT INTO observacoes_financeiras (entidade_id, metrica, valor, unidade, observado_em, estado, fonte)
       VALUES ($1, 'receita', 300, NULL, '2026-01-01', 'reportado', 'cvm_dfp')`, [e.id]),
    /null value|not-null/i,
  );

  await db.query(
    `INSERT INTO observacoes_financeiras
       (entidade_id, metrica, valor, unidade, periodo, observado_em, estado, fonte)
     VALUES ($1, 'receita', 300, 'BRL_milhoes', '2025', '2026-01-01', 'reportado', 'cvm_dfp')`, [e.id]);
});

test('duas fontes podem discordar sem uma apagar a outra', async () => {
  /* O conflito é resolvido por gente, na camada serving. A master guarda os dois
     fatos. */
  const db = await bancoDeTeste();
  const e = await comEntidade(db);

  for (const [valor, fonte, estado] of [[300, 'cvm_dfp', 'reportado'], [280, 'econodata', 'estimado']]) {
    await db.query(
      `INSERT INTO observacoes_financeiras
         (entidade_id, metrica, valor, unidade, periodo, observado_em, estado, fonte)
       VALUES ($1, 'receita', $2, 'BRL_milhoes', '2025', '2026-01-01', $3, $4)`,
      [e.id, valor, estado, fonte]);
  }

  const linhas = (await db.query(
    `SELECT valor, fonte FROM observacoes_financeiras WHERE entidade_id = $1 ORDER BY fonte`, [e.id])).rows;
  assert.equal(linhas.length, 2, 'uma observação apagou a outra');
});

test('o histórico é particionado por data e a gravação encontra a partição', async () => {
  const db = await bancoDeTeste();
  const s = await comSnapshot(db);
  const e = await comEntidade(db);

  await db.query(
    `INSERT INTO observacoes_cadastrais (snapshot_id, entidade_id, data_corte, situacao, estabelecimentos, fonte)
     VALUES ($1, $2, '2026-08-01', 'ativa', 3, 'rfb_cnpj')`, [s.id, e.id]);

  const n = (await db.query('SELECT count(*)::int n FROM observacoes_cadastrais')).rows[0].n;
  assert.equal(n, 1);

  const particionada = (await db.query(
    `SELECT relkind FROM pg_class WHERE relname = 'observacoes_cadastrais'`)).rows[0];
  assert.equal(particionada.relkind, 'p', 'a tabela histórica não é particionada');
});

test('evento corporativo sempre diz como se soube', async () => {
  /* "Houve mudança de controle" sem fonte é boato, e o produto inteiro se apoia
     em não confundir os dois. */
  const db = await bancoDeTeste();
  const e = await comEntidade(db);

  await assert.rejects(
    () => db.query(
      `INSERT INTO eventos_corporativos (entidade_id, tipo, detectado_em, metodo, fonte)
       VALUES ($1, 'mudanca_controle', '2026-08-01', 'adivinhacao', 'rfb_cnpj')`, [e.id]),
    /check constraint|violates/i,
  );

  await db.query(
    `INSERT INTO eventos_corporativos (entidade_id, tipo, detectado_em, metodo, fonte)
     VALUES ($1, 'mudanca_controle', '2026-08-01', 'diferenca_snapshot', 'rfb_cnpj')`, [e.id]);
});

/* ---- serving -------------------------------------------------------------- */

test('classificação exige motivo e um dos quatro estados', async () => {
  const db = await bancoDeTeste();
  const s = await comSnapshot(db);
  const e = await comEntidade(db);

  await assert.rejects(
    () => db.query(
      `INSERT INTO classificacoes_subsetor (entidade_id, snapshot_id, setor, subsetor, estado, motivo, versao_taxonomia)
       VALUES ($1, $2, 'Químicos', 'Distribuição e trading químico', 'talvez', 'x', 'v1')`, [e.id, s.id]),
    /check constraint|violates/i,
  );

  await assert.rejects(
    () => db.query(
      `INSERT INTO classificacoes_subsetor (entidade_id, snapshot_id, setor, subsetor, estado, motivo, versao_taxonomia)
       VALUES ($1, $2, 'Químicos', 'Distribuição e trading químico', 'provavel', NULL, 'v1')`, [e.id, s.id]),
    /null value|not-null/i,
  );
});

test('empresa excluída da coorte tem linha, com o motivo', async () => {
  /* "Nada de exclusão silenciosa": é o princípio que permite a segunda tese não
     começar do zero. */
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'a@ght4.com', papel: 'socio' });
  const s = await comSnapshot(db);
  const dentro = await comEntidade(db, '22222222');
  const fora = await comEntidade(db, '33333333');

  const c = (await db.query(
    `INSERT INTO coortes (chave, rotulo, criado_por) VALUES ('dist-quimica', 'Distribuição química', $1) RETURNING *`,
    [u.id])).rows[0];
  const v = (await db.query(
    `INSERT INTO coorte_versoes (coorte_id, versao, snapshot_id, versao_taxonomia, expressao_filtro, conteudo_hash, criado_por)
     VALUES ($1, 1, $2, 'v1', '{"cnae":["4684201"]}'::jsonb, 'h1', $3) RETURNING *`,
    [c.id, s.id, u.id])).rows[0];

  await db.query(
    `INSERT INTO coorte_membros (coorte_versao_id, entidade_id, situacao, motivo, filtro_decisivo) VALUES
      ($1, $2, 'incluida', 'CNAE principal 4684201 e RAPP vivo desde 2023', 'cnae_principal'),
      ($1, $3, 'excluida', 'CNAE principal 4681801 — combustível, fora do recorte', 'cnae_principal')`,
    [v.id, dentro.id, fora.id]);

  const todos = (await db.query(
    `SELECT situacao, motivo FROM coorte_membros WHERE coorte_versao_id = $1 ORDER BY situacao`, [v.id])).rows;

  assert.equal(todos.length, 2, 'a excluída sumiu em vez de ficar com motivo');
  assert.equal(todos[0].situacao, 'excluida');
  assert.match(todos[0].motivo, /combustível/);

  /* Motivo é obrigatório nos dois casos. */
  await assert.rejects(
    () => db.query(
      `INSERT INTO coorte_membros (coorte_versao_id, entidade_id, situacao, motivo)
       VALUES ($1, $2, 'incluida', NULL)`, [v.id, dentro.id]),
    /null value|not-null/i,
  );
});

test('versão de coorte materializada é imutável', async () => {
  /* Há lista que se explica por ela. Corrigir no lugar faria a lista passada
     apontar para uma regra que nunca a produziu. */
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'b@ght4.com', papel: 'socio' });
  const s = await comSnapshot(db);

  const c = (await db.query(
    `INSERT INTO coortes (chave, rotulo, criado_por) VALUES ('x', 'X', $1) RETURNING *`, [u.id])).rows[0];
  const v = (await db.query(
    `INSERT INTO coorte_versoes (coorte_id, versao, snapshot_id, versao_taxonomia, expressao_filtro, conteudo_hash, criado_por, materializado_em)
     VALUES ($1, 1, $2, 'v1', '{"a":1}'::jsonb, 'h1', $3, now()) RETURNING *`,
    [c.id, s.id, u.id])).rows[0];

  await assert.rejects(
    () => db.query(`UPDATE coorte_versoes SET expressao_filtro = '{"a":2}'::jsonb WHERE id = $1`, [v.id]),
    /imutavel/,
  );
  await assert.rejects(
    () => db.query('DELETE FROM coorte_versoes WHERE id = $1', [v.id]),
    /nao pode ser apagada/,
  );

  /* Gravar as contagens depois de materializar é permitido. */
  await db.query(`UPDATE coorte_versoes SET contagens = '{"incluidas":35}'::jsonb WHERE id = $1`, [v.id]);
});

test('a coorte aponta para snapshot, taxonomia e regra — os três', async () => {
  /* Com os três, qualquer lista se reconstrói. Sem qualquer um deles, não. */
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'c@ght4.com', papel: 'socio' });
  const s = await comSnapshot(db);
  const c = (await db.query(
    `INSERT INTO coortes (chave, rotulo, criado_por) VALUES ('y', 'Y', $1) RETURNING *`, [u.id])).rows[0];

  for (const coluna of ['snapshot_id', 'versao_taxonomia', 'expressao_filtro']) {
    const valores = {
      snapshot_id: s.id, versao_taxonomia: 'v1', expressao_filtro: '{"a":1}',
    };
    valores[coluna] = null;
    await assert.rejects(
      () => db.query(
        `INSERT INTO coorte_versoes (coorte_id, versao, snapshot_id, versao_taxonomia, expressao_filtro, conteudo_hash, criado_por)
         VALUES ($1, 99, $2, $3, $4, 'h', $5)`,
        [c.id, valores.snapshot_id, valores.versao_taxonomia, valores.expressao_filtro, u.id]),
      /null value|not-null/i,
      `${coluna} deveria ser obrigatória`,
    );
  }
});

test('coorte de mandato some junto com o mandato', async () => {
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'd@ght4.com', papel: 'socio' });
  const m = await criarMandato(db, { codigo: 'QUIM-01' });
  await db.query(
    `INSERT INTO coortes (mandato_id, chave, rotulo, criado_por) VALUES ($1, 'z', 'Z', $2)`, [m.id, u.id]);

  await db.query('DELETE FROM mandatos WHERE id = $1', [m.id]);
  const n = (await db.query('SELECT count(*)::int n FROM coortes')).rows[0].n;
  assert.equal(n, 0, 'a coorte sobreviveu ao mandato que a continha');
});

test('a auditoria de consulta guarda o filtro, não o resultado', async () => {
  /* Gravar o retorno duplicaria dado confidencial num lugar com política de
     acesso mais frouxa. O que se guarda é o que foi perguntado e quanto voltou. */
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'e@ght4.com' });

  await db.query(
    `INSERT INTO auditoria_consultas (usuario_id, consulta, filtros, linhas_retornadas, duracao_ms)
     VALUES ($1, 'listar_empresas_da_coorte', '{"uf":"SP"}'::jsonb, 120, 340)`, [u.id]);

  const colunas = (await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'auditoria_consultas'`
  )).rows.map((r) => r.column_name);

  assert.ok(colunas.includes('filtros'));
  assert.ok(colunas.includes('linhas_retornadas'));
  assert.ok(!colunas.includes('resultado'), 'a auditoria de consulta guarda resultado — não deveria');
});
