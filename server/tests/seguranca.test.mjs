/* =============================================================================
 *  GHT4 · testes de senha, sessão, RBAC e escopo de mandato
 * -----------------------------------------------------------------------------
 *  Cobrem dois dos três critérios de aceite da Fase 2:
 *    · dois usuários veem o mesmo dado conforme permissão;
 *    · usuário sem mandato não acessa dado confidencial daquele mandato.
 * ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';

import { derivar, conferir, precisaRederivar } from '../src/seguranca/senha.mjs';
import * as sessao from '../src/seguranca/sessao.mjs';
import {
  pode, podeNoMandato, alcancaMandato, papelEfetivo,
  filtrarMembroDaRede, PERMISSOES_CONHECIDAS,
} from '../src/seguranca/rbac.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso, comoUsuarioDoRbac } from './ajuda.mjs';

/* ---- senha ---------------------------------------------------------------- */

test('senha derivada confere, e senha errada não', async () => {
  const { hash, sal } = await derivar('uma senha razoavelmente longa');
  assert.ok(await conferir('uma senha razoavelmente longa', hash, sal));
  assert.ok(!await conferir('outra senha qualquer', hash, sal));
});

test('a mesma senha produz hashes diferentes', async () => {
  /* Sal aleatório: sem isso, duas pessoas com a mesma senha teriam o mesmo hash
     e um vazamento revelaria isso de graça. */
  const a = await derivar('senha repetida');
  const b = await derivar('senha repetida');
  assert.notEqual(a.hash, b.hash);
  assert.notEqual(a.sal, b.sal);
});

test('a senha em claro não aparece no que se grava', async () => {
  const { hash, sal } = await derivar('minha-senha-secreta');
  assert.ok(!hash.includes('minha-senha-secreta'));
  assert.ok(!sal.includes('minha-senha-secreta'));
});

test('entrada malformada devolve false em vez de estourar', async () => {
  assert.equal(await conferir('x', null, null), false);
  assert.equal(await conferir('x', 'lixo', 'sal'), false);
  assert.equal(await conferir('x', 'md5$1$1$1$abc', 'sal'), false);
  assert.equal(await conferir(null, 'a$b$c$d$e', 'sal'), false);
});

test('hash com custo antigo pede rederivação', () => {
  assert.ok(precisaRederivar('scrypt$1024$8$1$abc'));
  assert.ok(precisaRederivar('bcrypt$algumacoisa'));
  assert.ok(!precisaRederivar('scrypt$32768$8$1$abc'));
});

/* ---- sessão --------------------------------------------------------------- */

test('a sessão resolve no usuário, e o token não fica no banco', async () => {
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'a@ght4.com', papel: 'socio' });

  const { token } = await sessao.criar(db, { usuarioId: u.id });
  const resolvido = await sessao.resolver(db, token);

  assert.equal(resolvido.id, u.id);
  assert.equal(resolvido.papel, 'socio');

  const guardado = (await db.query('SELECT token_hash FROM sessoes')).rows[0].token_hash;
  assert.notEqual(guardado, token, 'o token foi guardado em claro');
  assert.equal(guardado, sessao.hashDoToken(token));
});

test('token inválido, encerrado ou de usuário desativado não resolve', async () => {
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'b@ght4.com' });

  assert.equal(await sessao.resolver(db, 'token-inventado-mas-longo-o-bastante'), null);

  const { token } = await sessao.criar(db, { usuarioId: u.id });
  await sessao.encerrar(db, token);
  assert.equal(await sessao.resolver(db, token), null);

  const { token: t2 } = await sessao.criar(db, { usuarioId: u.id });
  await db.query('UPDATE usuarios SET ativo = FALSE WHERE id = $1', [u.id]);
  assert.equal(await sessao.resolver(db, t2), null, 'usuário desativado continuou entrando');
});

test('sessão vencida não resolve', async () => {
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'c@ght4.com' });
  const { token } = await sessao.criar(db, { usuarioId: u.id, horas: -1 });
  assert.equal(await sessao.resolver(db, token), null);
});

test('desativar alguém derruba as sessões que já estavam abertas', async () => {
  /* Tirar o acesso precisa valer para quem já está dentro, não só para o
     próximo login. */
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'd@ght4.com' });
  const { token: t1 } = await sessao.criar(db, { usuarioId: u.id });
  const { token: t2 } = await sessao.criar(db, { usuarioId: u.id });

  await sessao.encerrarTodasDe(db, u.id);

  assert.equal(await sessao.resolver(db, t1), null);
  assert.equal(await sessao.resolver(db, t2), null);
});

test('o cookie de sessão não é legível por JavaScript', () => {
  const o = sessao.opcoesDoCookie({ producao: true });
  assert.equal(o.httpOnly, true);
  assert.equal(o.secure, true);
  assert.equal(o.sameSite, 'lax');
});

/* ---- papéis --------------------------------------------------------------- */

test('cada papel pode o que deve, e não o que não deve', () => {
  assert.ok(pode('admin', 'usuario.criar'));
  assert.ok(!pode('socio', 'usuario.criar'), 'sócio não administra usuários');

  assert.ok(pode('socio', 'valuation.revisar'));
  assert.ok(!pode('analista', 'valuation.revisar'), 'analista não aprova valuation');

  assert.ok(pode('analista', 'crm.editar'));
  assert.ok(!pode('analista', 'crm.mover'), 'mover estágio é decisão, não operação');

  assert.ok(pode('leitura', 'crm.ler'));
  assert.ok(!pode('leitura', 'crm.editar'));
});

test('permissão desconhecida é negada', () => {
  /* Nome digitado errado numa rota nova tem de FECHAR a porta, não abrir. */
  assert.ok(!pode('admin', 'permissao.que.nao.existe'));
  assert.ok(PERMISSOES_CONHECIDAS.length > 0);
});

test('o papel no mandato pode reduzir o global, nunca ampliá-lo', () => {
  assert.equal(papelEfetivo('socio', 'leitura'), 'leitura');
  assert.equal(papelEfetivo('analista', 'admin'), 'analista', 'o mandato ampliou o papel global');
  assert.equal(papelEfetivo('socio', null), 'socio');
});

/* ---- escopo de mandato ---------------------------------------------------- */

test('quem não participa não alcança mandato confidencial', async () => {
  const db = await bancoDeTeste();
  const dentro = await criarUsuario(db, { email: 'dentro@ght4.com', papel: 'socio' });
  const fora = await criarUsuario(db, { email: 'fora@ght4.com', papel: 'socio' });
  const m = await criarMandato(db, { codigo: 'QUIM-01' });
  await darAcesso(db, m.id, dentro.id, 'socio');

  const uDentro = await comoUsuarioDoRbac(db, dentro.id);
  const uFora = await comoUsuarioDoRbac(db, fora.id);

  assert.ok(alcancaMandato(uDentro, m));
  assert.ok(!alcancaMandato(uFora, m), 'sócio de fora alcançou mandato confidencial');

  /* Mesmo papel, mesma permissão — o que separa é a participação. */
  assert.ok(podeNoMandato(uDentro, m, 'crm.ler'));
  assert.ok(!podeNoMandato(uFora, m, 'crm.ler'));
});

test('admin alcança qualquer mandato', async () => {
  const db = await bancoDeTeste();
  const a = await criarUsuario(db, { email: 'admin@ght4.com', papel: 'admin' });
  const m = await criarMandato(db, { codigo: 'QUIM-02' });
  assert.ok(alcancaMandato(await comoUsuarioDoRbac(db, a.id), m));
});

test('mandato não confidencial é visível a qualquer autenticado', async () => {
  const db = await bancoDeTeste();
  const u = await criarUsuario(db, { email: 'qualquer@ght4.com', papel: 'leitura' });
  const aberto = await criarMandato(db, { codigo: 'PILOTO', confidencial: false });
  assert.ok(alcancaMandato(await comoUsuarioDoRbac(db, u.id), aberto));
});

test('dois usuários veem o mesmo CRM conforme o papel', async () => {
  /* Critério de aceite da Fase 2, literalmente. */
  const db = await bancoDeTeste();
  const socio = await criarUsuario(db, { email: 's@ght4.com', papel: 'socio' });
  const leitor = await criarUsuario(db, { email: 'l@ght4.com', papel: 'leitura' });
  const m = await criarMandato(db, { codigo: 'QUIM-03' });
  await darAcesso(db, m.id, socio.id, 'socio');
  await darAcesso(db, m.id, leitor.id, 'leitura');

  const uSocio = await comoUsuarioDoRbac(db, socio.id);
  const uLeitor = await comoUsuarioDoRbac(db, leitor.id);

  assert.ok(podeNoMandato(uSocio, m, 'crm.ler'));
  assert.ok(podeNoMandato(uLeitor, m, 'crm.ler'), 'os dois leem');

  assert.ok(podeNoMandato(uSocio, m, 'crm.mover'));
  assert.ok(!podeNoMandato(uLeitor, m, 'crm.mover'), 'só um move');
});

/* ---- política de campo ---------------------------------------------------- */

test('contato pessoal só aparece para quem pode ver contato', async () => {
  const db = await bancoDeTeste();
  const socio = await criarUsuario(db, { email: 's2@ght4.com', papel: 'socio' });
  const analista = await criarUsuario(db, { email: 'an@ght4.com', papel: 'analista' });
  const m = await criarMandato(db, { codigo: 'QUIM-04' });
  await darAcesso(db, m.id, socio.id, 'socio');
  await darAcesso(db, m.id, analista.id, 'analista');

  const membro = {
    nome: 'Contato Fictício', empresa: 'Distribuidora X',
    email: 'contato@exemplo.com', telefone: '+55 11 90000-0000',
    forcaConexao: 72,
  };

  const paraSocio = filtrarMembroDaRede(membro, await comoUsuarioDoRbac(db, socio.id), m);
  assert.equal(paraSocio.email, 'contato@exemplo.com');
  assert.deepEqual(paraSocio.camposOmitidos, []);

  const paraAnalista = filtrarMembroDaRede(membro, await comoUsuarioDoRbac(db, analista.id), m);
  assert.equal(paraAnalista.email, undefined);
  assert.equal(paraAnalista.telefone, undefined);
  /* O que não é sensível continua: a existência da conexão e sua força são o
     que faz o módulo 4 valer, e não são dado pessoal. */
  assert.equal(paraAnalista.nome, 'Contato Fictício');
  assert.equal(paraAnalista.forcaConexao, 72);
  /* Omissão declarada, não silenciosa: a tela pode dizer "há contato, você não
     tem acesso" em vez de sugerir que não existe. */
  assert.deepEqual(paraAnalista.camposOmitidos.sort(), ['email', 'telefone']);
});
