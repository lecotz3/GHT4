import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario, criarMandato } from './ajuda.mjs';

const senha = 'Senha restrita aos testes 2026!';
async function montar(t) {
  const db = await bancoDeTeste();
  const app = await criarApp(db);
  t.after(async () => { await app.close(); await db.close(); });
  const anonimo = (method, url, payload) => app.inject({ method, url, payload });
  const comCookie = (cookie) => (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
  async function login(email) {
    const r = await anonimo('POST', '/api/sessao', { email, senha });
    assert.equal(r.statusCode, 200, r.body);
    return comCookie(r.headers['set-cookie'].split(';')[0]);
  }
  async function usuario(email, papel) {
    const u = await criarUsuario(db, { email, papel, senha });
    return { ...u, chamar: await login(email) };
  }
  const admin = await usuario('admin@teste.local', 'admin');
  async function convidar(email = 'membro@teste.local', espacos = [], papel = 'analista') {
    const r = await admin.chamar('POST', '/api/equipe/convites', { nome: 'Membro convidado', email, papel, espacos });
    assert.equal(r.statusCode, 201, r.body);
    return r.json();
  }
  return { db, app, admin, anonimo, comCookie, login, usuario, convidar };
}

test('gestão de equipe é exclusiva de administrador em todas as rotas', async (t) => {
  const { anonimo, usuario } = await montar(t);
  const id = randomUUID();
  const rotas = [['GET', '/api/equipe'], ['POST', '/api/equipe/convites'], ['DELETE', `/api/equipe/convites/${id}`],
    ['PATCH', `/api/equipe/usuarios/${id}`], ['POST', '/api/equipe/espacos'], ['PUT', `/api/equipe/espacos/${id}/membros/${id}`]];
  for (const [method, url] of rotas) assert.equal((await anonimo(method, url)).statusCode, 401, url);
  for (const papel of ['socio', 'analista', 'leitura']) {
    const u = await usuario(`${papel}@teste.local`, papel);
    for (const [method, url] of rotas) assert.equal((await u.chamar(method, url)).statusCode, 403, `${papel} ${url}`);
  }
});

test('convite cria conta com senha própria e apenas os espaços escolhidos, sem expor segredos', async (t) => {
  const { db, admin, anonimo, comCookie, convidar } = await montar(t);
  const r = await admin.chamar('POST', '/api/equipe/espacos', { rotulo: 'Compra · Distribuição SP' });
  assert.equal(r.statusCode, 201, r.body);
  const m = r.json().espaco;
  const outro = await criarMandato(db, { codigo: 'PRIVADO' });
  const c = await convidar('CONVIDADO@teste.local', [m.id]);
  const consulta = await anonimo('POST', '/api/convites/consultar', { token: c.token });
  assert.equal(consulta.json().convite.email, 'convidado@teste.local');
  assert.equal(consulta.headers['cache-control'], 'no-store');
  const aceite = await anonimo('POST', '/api/convites/aceitar', { token: c.token, senha });
  assert.equal(aceite.statusCode, 201, aceite.body);
  const u = aceite.json();
  assert.equal(u.papel, 'analista');
  const chamar = comCookie(aceite.headers['set-cookie'].split(';')[0]);
  assert.deepEqual((await chamar('GET', '/api/mandatos')).json().mandatos.map((v) => v.id), [m.id]);
  assert.equal((await chamar('GET', `/api/mandatos/${outro.id}`)).statusCode, 404);
  assert.equal((await chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Minha pesquisa', mandatoId: m.id })).statusCode, 201);
  const dados = JSON.stringify({ lista: (await admin.chamar('GET', '/api/equipe')).json(),
    auditoria: (await db.query('SELECT * FROM auditoria')).rows, convites: (await db.query('SELECT * FROM convites_equipe')).rows });
  assert.ok(!dados.includes(c.token));
  assert.ok(!dados.includes(senha));
  assert.ok(!aceite.body.includes('senha_hash'));
  assert.equal((await anonimo('POST', '/api/convites/aceitar', { token: c.token, senha })).statusCode, 410);
  assert.equal((await admin.chamar('POST', '/api/equipe/convites', { nome: 'Duplicado', email: 'convidado@teste.local', papel: 'socio' })).statusCode, 409);
});

test('reemitir, cancelar ou vencer convite invalida o link anterior; aceita só uma vez sob concorrência', async (t) => {
  const { db, admin, anonimo, convidar } = await montar(t);
  const antigo = await convidar(); const atual = await convidar();
  assert.equal((await anonimo('POST', '/api/convites/consultar', { token: antigo.token })).statusCode, 410);
  assert.equal((await admin.chamar('DELETE', `/api/equipe/convites/${atual.convite.id}`)).statusCode, 200);
  assert.equal((await anonimo('POST', '/api/convites/aceitar', { token: atual.token, senha })).statusCode, 410);
  const vencido = await convidar();
  await db.query("UPDATE convites_equipe SET expira_em = now() - INTERVAL '1 hour' WHERE id = $1", [vencido.convite.id]);
  assert.equal((await anonimo('POST', '/api/convites/aceitar', { token: vencido.token, senha })).statusCode, 410);
  const valido = await convidar();
  const respostas = await Promise.all([1, 2].map(() => anonimo('POST', '/api/convites/aceitar', { token: valido.token, senha })));
  assert.deepEqual(respostas.map((r) => r.statusCode).sort(), [201, 410]);
  assert.equal(Number((await db.query("SELECT count(*) n FROM usuarios WHERE email = 'membro@teste.local'")).rows[0].n), 1);
});

test('retirar espaço e suspender conta interrompem acesso já aberto, com reativação reversível', async (t) => {
  const { admin, usuario, login, anonimo } = await montar(t);
  const u = await usuario('membro@teste.local', 'analista');
  const m = (await admin.chamar('POST', '/api/equipe/espacos', { rotulo: 'Pesquisa restrita' })).json().espaco;
  const url = `/api/equipe/espacos/${m.id}/membros/${u.id}`;
  assert.equal((await admin.chamar('PUT', url, { participa: true })).statusCode, 200);
  const c = (await u.chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Pesquisa restrita', mandatoId: m.id })).json().conversa;
  assert.equal((await u.chamar('GET', `/api/agente/conversas/${c.id}`)).statusCode, 200);
  assert.equal((await admin.chamar('PUT', url, { participa: false })).statusCode, 200);
  assert.equal((await u.chamar('GET', `/api/agente/conversas/${c.id}`)).statusCode, 404);
  assert.equal((await admin.chamar('PUT', url, { participa: true })).statusCode, 200);
  assert.equal((await u.chamar('GET', `/api/agente/conversas/${c.id}`)).statusCode, 200);
  assert.equal((await admin.chamar('PATCH', `/api/equipe/usuarios/${u.id}`, { ativo: false })).statusCode, 200);
  assert.equal((await u.chamar('GET', '/api/eu')).statusCode, 401);
  assert.equal((await anonimo('POST', '/api/sessao', { email: u.email, senha })).statusCode, 401);
  assert.equal((await admin.chamar('PATCH', `/api/equipe/usuarios/${u.id}`, { ativo: true })).statusCode, 200);
  assert.equal((await u.chamar('GET', '/api/eu')).statusCode, 401);
  assert.equal((await (await login(u.email))('GET', '/api/eu')).statusCode, 200);
  assert.equal((await admin.chamar('PATCH', `/api/equipe/usuarios/${admin.id}`, { ativo: false })).statusCode, 422);
  const outro = await usuario('admin2@teste.local', 'admin');
  assert.equal((await admin.chamar('PATCH', `/api/equipe/usuarios/${outro.id}`, { ativo: false })).statusCode, 422);
});

test('convites recusam papéis privilegiados, espaços inexistentes e dados inválidos', async (t) => {
  const { admin, anonimo, convidar } = await montar(t);
  const corpo = { nome: 'Membro', email: 'membro@teste.local', papel: 'analista' };
  for (const extra of [{ papel: 'admin' }, { espacos: [randomUUID()] }, { nome: ' ' }, { email: 'errado' }, { senha: 'não permitido' }]) {
    assert.equal((await admin.chamar('POST', '/api/equipe/convites', { ...corpo, ...extra })).statusCode, 422);
  }
  const c = await convidar();
  assert.equal((await anonimo('POST', '/api/convites/aceitar', { token: c.token, senha: 'curta' })).statusCode, 422);
  assert.equal((await anonimo('POST', '/api/convites/aceitar', { token: c.token, senha, papel: 'admin' })).statusCode, 422);
  assert.equal((await anonimo('POST', '/api/convites/consultar', { token: 'inválido' })).statusCode, 422);
  assert.equal((await admin.chamar('DELETE', '/api/equipe/convites/invalido')).statusCode, 422);
});

test('cadastro direto cria conta pronta para entrar e cancela convite pendente do mesmo e-mail', async (t) => {
  const { admin, anonimo, usuario, convidar } = await montar(t);
  const inicial = 'Senha inicial dada pelo administrador 2026';

  // Um convite pendente para o mesmo e-mail perde o sentido quando a conta nasce aqui.
  const pendente = await convidar('novo@teste.local');
  const r = await admin.chamar('POST', '/api/equipe/usuarios',
    { nome: 'Pessoa nova', email: 'Novo@Teste.Local', papel: 'analista', senha: inicial, espacos: [] });
  assert.equal(r.statusCode, 201, r.body);
  const criado = r.json();
  assert.equal(criado.email, 'novo@teste.local', 'e-mail é normalizado, como no convite');
  assert.equal(criado.papel, 'analista');
  assert.equal(criado.ativo, true);
  assert.ok(!('senha' in criado) && !('senha_hash' in criado), 'a resposta não devolve segredo');
  assert.equal((await anonimo('POST', '/api/convites/consultar', { token: pendente.token })).statusCode, 410);

  // O que importa: a pessoa entra com a senha que o administrador definiu.
  const entrada = await anonimo('POST', '/api/sessao', { email: 'novo@teste.local', senha: inicial });
  assert.equal(entrada.statusCode, 200, entrada.body);

  // E-mail já em uso não vira segunda conta.
  assert.equal((await admin.chamar('POST', '/api/equipe/usuarios',
    { nome: 'Outra', email: 'novo@teste.local', papel: 'leitura', senha: inicial })).statusCode, 409);

  const analista = await usuario('analista@teste.local', 'analista');
  assert.equal((await analista.chamar('POST', '/api/equipe/usuarios',
    { nome: 'X', email: 'x@teste.local', papel: 'leitura', senha: inicial })).statusCode, 403);
});

test('cadastro direto recusa papel privilegiado, senha curta e espaço inexistente', async (t) => {
  const { admin } = await montar(t);
  const corpo = { nome: 'Pessoa', email: 'pessoa@teste.local', papel: 'analista', senha: 'Senha longa o bastante 2026' };
  for (const extra of [{ papel: 'admin' }, { senha: 'curta' }, { espacos: [randomUUID()] }, { email: 'errado' }, { nome: ' ' }]) {
    assert.equal((await admin.chamar('POST', '/api/equipe/usuarios', { ...corpo, ...extra })).statusCode, 422, JSON.stringify(extra));
  }
});

test('administrador redefine a senha de um membro, derruba as sessões dele e não alcança outro admin', async (t) => {
  const { db, admin, anonimo, usuario } = await montar(t);
  const membro = await usuario('membro@teste.local', 'analista');
  assert.equal((await membro.chamar('GET', '/api/eu')).statusCode, 200);

  const nova = 'Senha redefinida pelo administrador 2026';
  assert.equal((await admin.chamar('POST', `/api/equipe/usuarios/${membro.id}/senha`, { senha: nova })).statusCode, 200);

  /* A sessão que estava aberta morre junto: redefinir senha por administração
     costuma ser resposta a suspeita, e deixar a sessão viva anularia o gesto. */
  assert.equal((await membro.chamar('GET', '/api/eu')).statusCode, 401);
  assert.equal((await anonimo('POST', '/api/sessao', { email: 'membro@teste.local', senha })).statusCode, 401, 'a senha antiga morreu');
  assert.equal((await anonimo('POST', '/api/sessao', { email: 'membro@teste.local', senha: nova })).statusCode, 200);

  // Conta administradora fica fora: a recuperação dela exige acesso ao banco.
  const outro = await criarUsuario(db, { email: 'admin2@teste.local', papel: 'admin', senha });
  assert.equal((await admin.chamar('POST', `/api/equipe/usuarios/${outro.id}/senha`, { senha: nova })).statusCode, 422);
  assert.equal((await membro.chamar('POST', `/api/equipe/usuarios/${outro.id}/senha`, { senha: nova })).statusCode, 401);
  assert.equal((await admin.chamar('POST', `/api/equipe/usuarios/${randomUUID()}/senha`, { senha: nova })).statusCode, 404);
  assert.equal((await admin.chamar('POST', `/api/equipe/usuarios/${membro.id}/senha`, { senha: 'curta' })).statusCode, 422);
});

test('trocar a própria senha exige a atual, revoga as outras sessões e mantém a de quem trocou', async (t) => {
  const { admin, anonimo, comCookie, login } = await montar(t);
  const outraSessao = await login('admin@teste.local');
  const nova = 'Senha trocada pelo proprio titular 2026';

  assert.equal((await admin.chamar('POST', '/api/eu/senha', { atual: 'errada', nova })).statusCode, 401);
  assert.equal((await admin.chamar('POST', '/api/eu/senha', { atual: senha, nova: senha })).statusCode, 422, 'repetir a senha não é troca');
  assert.equal((await admin.chamar('POST', '/api/eu/senha', { atual: senha, nova: 'curta' })).statusCode, 422);
  assert.equal((await anonimo('POST', '/api/eu/senha', { atual: senha, nova })).statusCode, 401);

  const r = await admin.chamar('POST', '/api/eu/senha', { atual: senha, nova });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.headers['cache-control'], 'no-store');

  /* Quem troca a senha está tirando cópias de circulação. A outra sessão cai; a
     desta chamada é reemitida no cookie da resposta, senão trocar a senha
     deslogaria quem acabou de trocá-la. */
  assert.equal((await outraSessao('GET', '/api/eu')).statusCode, 401);
  const renovada = comCookie(r.headers['set-cookie'].split(';')[0]);
  assert.equal((await renovada('GET', '/api/eu')).statusCode, 200);
  assert.equal((await anonimo('POST', '/api/sessao', { email: 'admin@teste.local', senha })).statusCode, 401);
  assert.equal((await anonimo('POST', '/api/sessao', { email: 'admin@teste.local', senha: nova })).statusCode, 200);
});
