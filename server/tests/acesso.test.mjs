import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/app.mjs';
import { criarCatalogo } from '../src/agente/catalogo.mjs';
import { bancoDeTeste, criarUsuario } from './ajuda.mjs';
import { estruturaDeDecisao, canaisInstitucionais, posicaoNaDecisao, juizoDoDecisor } from '../src/acesso/plano.mjs';

const senha = 'Senha restrita aos testes 2026!';
const REF = '2026-08';
const ATR = { naturezaJuridica: '2062', qtdSocios: 2, qtdSociosPj: 0, socioEstrangeiro: false, dominio: 'quimicaalfa.com.br',
  dataAbertura: '1998-05-10', faixasEtarias: ['61–70', '61–70'] };
const empresa = { id: 'cnpj12345678', nome: 'Química Alfa', razaoSocial: 'Química Alfa Ltda', cnpjRaiz: '12345678',
  uf: 'SP', cidade: 'Campinas', cnaePrincipal: '4684299', subsetor: 'Distribuição e trading químico', estado: 'provavel', motivo: 'CNAE', referencia: REF, receita: null };
const catalogo = {
  buscar: async () => ({ empresas: [empresa], total: 1, referencia: REF, hash: 'h' }),
  obter: async (id) => id === empresa.id ? empresa : null,
  recorte: async () => ({ empresas: [{ ...empresa, atributos: ATR }], total: 1, truncado: false, proximo: null, referencia: REF, hash: 'h' }),
};

async function montar(t) {
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo });
  t.after(async () => { await app.close(); await db.close(); });
  async function usuario(email, papel, nome = 'Fulano de Teste') {
    const u = await criarUsuario(db, { email, papel, senha, nome });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha } });
    assert.equal(r.statusCode, 200, r.body);
    const cookie = r.headers['set-cookie'].split(';')[0];
    return { ...u, cookie, chamar: (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } }) };
  }
  return { db, app, usuario };
}

const linha = (plano, requisito, pessoa = 0) => plano.pessoas[pessoa].juizo.find((j) => j.requisito === requisito);

test('a estrutura do cadastro diz que tipo de pessoa decide, sem nome e sem idade', () => {
  assert.equal(estruturaDeDecisao(null).conhecida, false);
  const ltda = estruturaDeDecisao(ATR, REF);
  assert.match(ltda.leitura, /2 sócios pessoas físicas/);
  assert.deepEqual(ltda.decide, ['ceo', 'conselho']);
  assert.match(ltda.fonte, /2026-08/);
  assert.doesNotMatch(JSON.stringify(ltda), /61|70|idade|sucess/i, 'faixa etária nunca entra');
  assert.match(estruturaDeDecisao({ naturezaJuridica: '2062', qtdSocios: 1, qtdSociosPj: 0 }).leitura, /Sócio único/);
  assert.match(estruturaDeDecisao({ naturezaJuridica: '2135' }).leitura, /Titular único/);
  assert.match(estruturaDeDecisao({ naturezaJuridica: '2046', qtdSocios: 9 }).leitura, /Formulário de Referência/);
  const holding = estruturaDeDecisao({ naturezaJuridica: '2062', qtdSocios: 3, qtdSociosPj: 1, socioEstrangeiro: true });
  assert.match(holding.leitura, /holding/);
  assert.equal(holding.sinais.length, 2);
  assert.match(estruturaDeDecisao({ naturezaJuridica: '2062', qtdSocios: 2, qtdSociosPj: 2 }).leitura, /sociedade sócia/);
  assert.match(estruturaDeDecisao({ naturezaJuridica: '2062', qtdSocios: null }).leitura, /não informa o quadro/);

  // Em S.A., diretoria influencia; conselho e presidente decidem. Gerência é porta; "outro" pede revisão.
  const sa = estruturaDeDecisao({ naturezaJuridica: '2054', qtdSocios: 5 });
  assert.equal(posicaoNaDecisao('ceo', sa).id, 'decide');
  assert.equal(posicaoNaDecisao('diretoria', sa).id, 'influencia');
  assert.equal(posicaoNaDecisao('gerencia', sa).id, 'porta');
  assert.equal(posicaoNaDecisao('outro', sa).id, 'a_revisar');
  assert.equal(posicaoNaDecisao('diretoria', estruturaDeDecisao({ naturezaJuridica: '2143' })).id, 'decide', 'cooperativa: diretoria conduz');

  // O cargo prova a função, não o controle: só quem o cargo mostra como dono decide a venda (parecer da Rodada 20).
  const importada = juizoDoDecisor({ senioridade: 'ceo', cargo: 'Diretor', origem: 'importacao', origem_referencia: '', empresa_id: null, organizacao: 'Química Alfa' },
    { empresaId: empresa.id, estrutura: ltda, caminho: null, incompletos: 0, respostas: 2, negativas: 2, membros: 2 });
  assert.deepEqual(importada.juizo.map((j) => j.julgamento), ['indicio', 'indicio', 'indicio', 'nao_atende']);
  assert.equal(importada.posicao.id, 'influencia');
  const juizoDe = (cargo, senioridade = 'ceo', estrutura = sa) => juizoDoDecisor({ senioridade, cargo, origem: 'manual', origem_referencia: 'Página institucional: cargo', empresa_id: empresa.id },
    { empresaId: empresa.id, estrutura, caminho: null, incompletos: 0, respostas: 0, negativas: 0, membros: 1 });
  const profissional = juizoDe('Presidente profissional contratado');
  assert.equal(profissional.posicao.id, 'influencia');
  assert.equal(profissional.juizo[0].julgamento, 'indicio');
  assert.match(profissional.juizo[0].informacao, /não mostra participação no capital/);
  for (const cargo of ['Titular', 'Acionista controlador']) assert.equal(juizoDe(cargo).posicao.id, 'decide', cargo);
  // Sócio que administra decide na limitada de dois sócios; na S.A. de cinco, a participação não prova o controle (Rodada 28).
  for (const cargo of ['Sócio-administrador', 'Sócia-gerente']) {
    assert.equal(juizoDe(cargo, 'ceo', ltda).posicao.id, 'decide', cargo);
    assert.equal(juizoDe(cargo).posicao.id, 'influencia', cargo);
  }
  assert.equal(juizoDe('Conselheiro de administração', 'conselho').posicao.id, 'influencia');
  assert.equal(juizoDe('Presidente do conselho e controlador', 'conselho').juizo[0].julgamento, 'atende');
});

test('canais institucionais: site e páginas lidas, nunca telefone ou e-mail do cadastro', () => {
  const site = { dominio: 'quimicaalfa.com.br', paginas: [
    { url: 'https://quimicaalfa.com.br/', titulo: 'Química Alfa' },
    { url: 'https://quimicaalfa.com.br/fale-conosco', titulo: 'Fale conosco' },
    { url: 'https://quimicaalfa.com.br/quem-somos', titulo: 'Quem somos' },
  ] };
  const canais = canaisInstitucionais({ atributos: { ...ATR, contato: { telefone: '(19) 0000-0000', email: 'contabil@escritorio.com.br' } }, site });
  assert.deepEqual(canais.map((c) => c.tipo), ['site', 'contato', 'institucional']);
  assert.doesNotMatch(JSON.stringify(canais), /0000|contabil/);
  const ri = canaisInstitucionais({ atributos: null, site: null, estrutura: estruturaDeDecisao({ naturezaJuridica: '2046' }) });
  assert.deepEqual(ri.map((c) => c.tipo), ['ri']);
});

test('plano de acesso: descobrir quem decide, perguntar à casa, chegar e respeitar a restrição', async (t) => {
  const { db, app, usuario } = await montar(t);
  const socio = await usuario('socio@teste.local', 'socio', 'Helena Sócia');
  const analista = await usuario('analista@teste.local', 'analista');
  const plano = async (quem = socio) => { const r = await quem.chamar('GET', `/api/acesso/${empresa.id}`); assert.equal(r.statusCode, 200, r.body); return r.json(); };

  // Ninguém mapeado: o passo é descobrir quem decide, com a leitura da estrutura e o site.
  let p = await plano(analista);
  assert.equal(p.passo.acao, 'registrar_decisor');
  assert.match(p.passo.texto, /2 sócios pessoas físicas/);
  assert.equal(p.canais[0].url, 'https://quimicaalfa.com.br');
  assert.equal(p.podeRegistrar, false);
  assert.deepEqual(p.pessoas, []);

  // Registrar exige `rede.editar` e a fonte do cargo.
  const corpo = { id: randomUUID(), nome: 'Carlos Nunes', cargo: 'Sócio-administrador', senioridade: 'ceo',
    fonte: { tipo: 'site_oficial', descricao: 'Página Quem somos', url: 'https://quimicaalfa.com.br/quem-somos' } };
  assert.equal((await analista.chamar('POST', `/api/acesso/${empresa.id}/decisores`, corpo)).statusCode, 403);
  const semFonte = await socio.chamar('POST', `/api/acesso/${empresa.id}/decisores`, { ...corpo, fonte: undefined });
  assert.equal(semFonte.statusCode, 422);
  assert.equal((await socio.chamar('POST', `/api/acesso/${empresa.id}/decisores`, { ...corpo, fonte: { ...corpo.fonte, url: 'javascript:alert(1)' } })).statusCode, 422);
  const criado = await socio.chamar('POST', `/api/acesso/${empresa.id}/decisores`, corpo);
  assert.equal(criado.statusCode, 201, criado.body);
  assert.match(criado.json().pessoa.origemReferencia, /^Site oficial da empresa: Página Quem somos · https:\/\/quimicaalfa\.com\.br\/quem-somos$/);
  assert.equal(criado.json().pessoa.empresaId, empresa.id);
  assert.equal((await socio.chamar('POST', `/api/acesso/${empresa.id}/decisores`, corpo)).statusCode, 200, 'reenvio devolve o mesmo cadastro');
  const dupla = await socio.chamar('POST', `/api/acesso/${empresa.id}/decisores`, { ...corpo, id: randomUUID(), nome: 'CARLOS NUNES' });
  assert.equal(dupla.statusCode, 409);
  assert.equal(dupla.json().erro, 'pessoa_ja_mapeada');
  const auditoria = (await db.query("SELECT acao, justificativa FROM auditoria WHERE entidade='rede_pessoa' AND entidade_id=$1", [corpo.id])).rows;
  assert.deepEqual(auditoria.map((a) => a.acao), ['registrar_decisor']);
  assert.match(auditoria[0].justificativa, /Página Quem somos/);

  // Pessoa mapeada, casa sem ninguém na rede: o passo é cadastrar a casa, não "ninguém conhece".
  p = await plano();
  assert.equal(p.pessoas[0].posicao.id, 'decide');
  assert.equal(linha(p, 'Cargo com fonte').julgamento, 'atende');
  assert.match(linha(p, 'Cargo com fonte').fonte, /Site oficial/);
  assert.equal(linha(p, 'Pertence a esta empresa').julgamento, 'atende');
  assert.equal(linha(p, 'A casa chega até ela').julgamento, 'indeterminado');
  assert.equal(p.passo.acao, 'cadastrar_casa');
  assert.equal(p.eu.naRede, false);

  // A sócia entra na rede: falta perguntar a ela.
  const eu = await socio.chamar('POST', '/api/rede/pessoas', { id: randomUUID(), lado: 'ght4', nome: 'Helena Sócia', usuarioId: socio.id });
  assert.equal(eu.statusCode, 201, eu.body);
  p = await plano();
  assert.equal(p.passo.acao, 'perguntar_a_casa');
  assert.equal(p.eu.naRede, true);
  assert.equal(p.pessoas[0].minhaResposta, null);

  // "Não conheço" fecha a apuração: abordagem institucional, com rascunho para revisão.
  const responder = (corpoResposta) => socio.chamar('POST', '/api/rede/reconhecimento', { id: randomUUID(), pessoaAlvoId: corpo.id, ...corpoResposta });
  assert.equal((await responder({ resposta: 'nao_conheco' })).statusCode, 201);
  p = await plano();
  assert.equal(p.pessoas[0].minhaResposta, 'nao_conheco');
  assert.equal(linha(p, 'A casa chega até ela').julgamento, 'nao_atende');
  assert.equal(p.passo.acao, 'abordagem_institucional');
  assert.match(p.passo.rascunhos[0].texto, /Prezado\(a\) Carlos Nunes, sou Helena Sócia, da GHT4/);
  assert.doesNotMatch(p.passo.rascunhos[0].texto, /mandato|vend|@/i);
  assert.ok(p.passo.regras.some((r) => /não envia nada/.test(r)));

  // Ela se lembra: conhece e pode apresentar. O caminho aparece e o passo vira falar direto.
  assert.equal((await responder({ resposta: 'posso_apresentar', evidencia: 'Trabalhamos juntos na Química Beta até 2019.' })).statusCode, 201);
  p = await plano();
  assert.equal(linha(p, 'A casa chega até ela').julgamento, 'atende');
  assert.equal(p.passo.acao, 'falar_direto');
  assert.equal(p.passo.rascunhos[0].para, 'Carlos Nunes');
  assert.equal(p.caminhos.length, 1);

  // Restrição do escopo do membro encerra o assunto antes de qualquer sugestão.
  await db.query(`INSERT INTO crm_restricoes_contato(escopo,empresa_id,ativa,categoria,motivo,usuario_id) VALUES ($1,$2,true,'solicitacao_da_empresa','Pediu para não ser procurada.',$3)`,
    [`usuario:${socio.id}`, empresa.id, socio.id]);
  p = await plano();
  assert.equal(p.passo.acao, 'nao_contatar');
  assert.deepEqual(p.caminhos, []);
  assert.deepEqual(p.passo.rascunhos, []);

  assert.equal((await socio.chamar('GET', '/api/acesso/cnpj99999999')).statusCode, 404);
  const externo = await app.inject({ method: 'GET', url: `/api/acesso/${empresa.id}`, headers: { cookie: socio.cookie, 'x-ght4-canal': 'mcp' } });
  assert.equal(externo.statusCode, 403, 'nome de pessoa não sai pelo canal externo');
  assert.equal(externo.json().erro, 'canal_externo');
  assert.equal((await socio.chamar('GET', '/api/acesso/nao-e-cnpj')).statusCode, 422);
});

test('aberto de uma pesquisa, o plano usa a empresa gravada no item e só para o dono da pesquisa', async (t) => {
  // Catálogo de arquivo de verdade: o caminho sem pesquisa lê os atributos públicos pelo recorte.
  const pasta = await mkdtemp(path.join(tmpdir(), 'ght4-acesso-'));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  const arquivo = path.join(pasta, 'base.js');
  const colunas = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'cidade', 'uf', 'cnaePrincipal', 'cnaeSecundarias', 'situacaoCadastral', 'naturezaJuridica',
    'capitalSocial', 'porteDeclarado', 'dataAbertura', 'estabelecimentosAtivos', 'ufsAtuacao', 'qtdSocios', 'qtdSociosPj', 'socioEstrangeiro', 'contato'];
  const linhas = [['cnpj11111111', 'Alfa Química', 'Alfa Química Ltda', '11111111', 'Campinas', 'SP', '4684299', [], '02', '2062',
    500000, '05', '1990-01-01', 2, ['SP'], 2, 1, false, { email: 'contato@alfa.com.br', telefone: '(19) 0000-0000' }]];
  await writeFile(arquivo, `const COLUNAS_QUIMICOS = ${JSON.stringify(colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = "${REF}";`);
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo: criarCatalogo({ arquivo, arquivoIbama: null }) });
  t.after(async () => { await app.close(); await db.close(); });
  const entrar = async (email, papel) => {
    await criarUsuario(db, { email, papel, senha });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha } });
    const cookie = r.headers['set-cookie'].split(';')[0];
    return (method, url, payload) => app.inject({ method, url, payload, headers: { cookie } });
  };
  const analista = await entrar('analista@teste.local', 'analista');
  const outro = await entrar('outro@teste.local', 'socio');

  const avulso = await analista('GET', '/api/acesso/cnpj11111111');
  assert.equal(avulso.statusCode, 200, avulso.body);
  assert.equal(avulso.json().estrutura.natureza, 'ltda');
  assert.equal(avulso.json().estrutura.sociosPj, 1);
  assert.equal(avulso.json().canais[0].url, 'https://alfa.com.br');
  assert.doesNotMatch(avulso.body, /0000-0000|contato@alfa/, 'telefone e e-mail do cadastro não saem');

  const id = randomUUID();
  const criada = await analista('POST', '/api/pesquisas', { id, tese: 'Distribuidoras em SP' });
  assert.equal(criada.statusCode, 201, criada.body);
  const iniciada = await analista('POST', `/api/pesquisas/${id}/iniciar`, { versao: criada.json().pesquisa.versao });
  assert.equal(iniciada.statusCode, 200, iniciada.body);
  const r = await analista('GET', `/api/acesso/cnpj11111111?pesquisaId=${id}`);
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().empresa.nome, 'Alfa Química');
  assert.equal(r.json().estrutura.natureza, 'ltda');
  assert.equal((await outro('GET', `/api/acesso/cnpj11111111?pesquisaId=${id}`)).statusCode, 404, 'pesquisa de outro membro');
  assert.equal((await analista('GET', `/api/acesso/cnpj99999999?pesquisaId=${id}`)).statusCode, 404, 'empresa fora da pesquisa');
});
