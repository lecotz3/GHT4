import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { criarApp } from '../src/app.mjs';
import { bancoDeTeste, criarUsuario, criarMandato, darAcesso } from './ajuda.mjs';
import { hoje } from '../src/crm/contratos.mjs';
import { compararTeses, analisarComparaveis } from '../src/acervo/analises.mjs';
import { PDFDocument } from 'pdfkit';
import { extrairDocumento } from '../src/acervo/extrair.mjs';
import { serializar } from '../src/acervo/exports.mjs';

const empresa = { id: 'cnpj12345678', nome: 'Química de teste', razaoSocial: 'Química de teste Ltda', cnpjRaiz: '12345678',
  cidade: 'Campinas', uf: 'SP', estado: 'provavel', referencia: '2026-08', receita: null };
const fontes = [{ titulo: 'Receita Federal — cadastro CNPJ', referencia: '2026-08' }];
async function montar(t) {
  const db = await bancoDeTeste();
  const app = await criarApp(db, { catalogo: { buscar: async () => ({ empresas: [empresa], total: 1, referencia: '2026-08' }), obter: async (id) => id === empresa.id ? empresa : null } });
  t.after(async () => { await app.close(); await db.close(); });
  async function usuario(email, papel = 'analista') {
    const u = await criarUsuario(db, { email, papel, senha: 'Senha para testes somente!' });
    const r = await app.inject({ method: 'POST', url: '/api/sessao', payload: { email, senha: 'Senha para testes somente!' } });
    const cookie = r.headers['set-cookie'].split(';')[0];
    return { ...u, chamar: (method,url,payload) => app.inject({ method,url,payload,headers: { cookie } }) };
  }
  async function selecionar(u, mandatoId = null, frente = 'compra') {
    const r = await u.chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Pesquisa privada de teste', mandatoId, contexto: { frente, objetivo: 'Nota pessoal que não deve ir ao CRM' } });
    assert.equal(r.statusCode, 201, r.body); const c = r.json().conversa;
    const pesquisa = await u.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`, { chave: randomUUID(), versao: 0, tarefa: 'buscar_empresas' });
    assert.equal(pesquisa.statusCode, 200, pesquisa.body); const turno = pesquisa.json().turno;
    const corpo = { turnoId: turno.id, versao: 0, estado: 'priorizar', justificativa: 'Adequação ao recorte geográfico, a validar.' };
    const selecao = await u.chamar('PUT', `/api/agente/conversas/${c.id}/selecao/${empresa.id}`, corpo);
    assert.equal(selecao.statusCode, 200, selecao.body);
    return { c, turno, s: selecao.json().selecao, corpo };
  }
  function criarCorpo(s) { return { id: randomUUID(), selecaoId: s.id, titulo: 'Distribuição SP · teste', objetivo: 'Verificar a tese de expansão territorial.', proximaAcao: 'Revisar produtos e fabricantes representados', prazo: hoje() }; }
  async function criar(u, s) {
    const corpo = criarCorpo(s); const r = await u.chamar('POST', '/api/crm/oportunidades', corpo);
    assert.equal(r.statusCode, 201, r.body); return { o: r.json().oportunidade, corpo };
  }
  return { db, app, usuario, selecionar, criar, criarCorpo };
}

test('Excel, PDF e JSON usam corte congelado verificável, sem notas privadas nem vazamento de escopo',async(t)=>{
  const { usuario,selecionar,criar }=await montar(t);const a=await usuario('a@teste.local'),b=await usuario('b@teste.local');
  const { c,s }=await selecionar(a),{ o }=await criar(a,s);
  const pedido={id:randomUUID(),oportunidadeId:o.id,versao:o.versao};
  const r=await a.chamar('POST','/api/exportacoes',pedido);assert.equal(r.statusCode,200,r.body);
  const id=r.json().exportacao.id;
  assert.equal((await a.chamar('POST','/api/exportacoes',pedido)).json().exportacao.id,id);
  assert.equal((await a.chamar('POST','/api/exportacoes',{...pedido,versao:0})).statusCode,409);
  const json=(await a.chamar('GET',`/api/exportacoes/${id}/json`)).json(),{hash,...payload}=json;
  assert.equal(createHash('sha256').update(serializar(payload)).digest('hex'),hash);
  assert.ok(!JSON.stringify(json).includes('Nota pessoal'));
  const xlsx=await a.chamar('GET',`/api/exportacoes/${id}/xlsx`);assert.equal(xlsx.statusCode,200,xlsx.body);
  assert.equal(xlsx.rawPayload.subarray(0,2).toString(),'PK');assert.ok(xlsx.rawPayload.includes(Buffer.from(hash)));
  const pdf=await a.chamar('GET',`/api/exportacoes/${id}/pdf`);assert.equal(pdf.statusCode,200,pdf.body.slice(0,200));
  const extraido=await extrairDocumento(pdf.rawPayload,'pdf');assert.equal(extraido.estado,'extraido');
  assert.ok(extraido.trechos.some((t)=>t.texto.includes('Química de teste')));
  assert.equal((await b.chamar('GET',`/api/exportacoes/${id}/json`)).statusCode,404);
  const lista={id:randomUUID(),conversaId:c.id,versao:1,selecao:[{id:s.id,versao:s.versao}]};
  assert.equal((await a.chamar('POST','/api/exportacoes',lista)).statusCode,200);
  assert.equal((await a.chamar('POST','/api/exportacoes',{...lista,id:randomUUID(),selecao:[]})).statusCode,409);
});

test('acervo mantém versões, revisão exige sócio e contatos pessoais são omitidos da leitura do analista', async (t) => {
  const { usuario,selecionar,criar,db }=await montar(t);
  const a=await usuario('a@teste.local'),s=await usuario('s@teste.local','socio'),b=await usuario('b@teste.local');
  const m=await criarMandato(db,{codigo:'ACERVO'});await darAcesso(db,m.id,a.id);await darAcesso(db,m.id,s.id,'socio');
  const { o }=await criar(a,(await selecionar(a,m.id)).s),url=`/api/crm/oportunidades/${o.id}/acervo`;
  const dados={titulo:'Receita informada',fonte:'Demonstração fornecida',referencia:'Página 7',data:hoje(),campo:'receita',estado:'reportado',descricao:'Receita líquida informada no demonstrativo.',valor:80,unidade:'BRL milhões',periodo:'2025',url:''};
  const p={id:randomUUID(),serieId:null,versao:0,tipo:'evidencia',dados,revisado:false};
  assert.equal((await a.chamar('POST',url,{...p,revisado:true})).statusCode,403);
  assert.equal((await a.chamar('POST',url,p)).statusCode,200);
  assert.equal((await a.chamar('POST',url,p)).statusCode,200);
  const segunda={...p,id:randomUUID(),serieId:p.id,versao:1,dados:{...dados,valor:85},revisado:true};
  assert.equal((await s.chamar('POST',url,segunda)).statusCode,200);
  assert.equal((await s.chamar('POST',url,{...segunda,id:randomUUID()})).statusCode,409);
  const versoes=(await a.chamar('GET',`${url}/${p.id}/versoes`)).json().versoes;
  assert.deepEqual(versoes.map((v)=>v.dados.valor),[85,80]);
  assert.equal((await b.chamar('GET',url)).statusCode,404);
  const relacao={id:randomUUID(),serieId:null,versao:0,tipo:'relacao',revisado:true,dados:{titulo:'Contato confirmado',fonte:'Contato direto autorizado',referencia:'Reunião com a equipe',data:hoje(),pessoa:'Pessoa Teste',cargo:'Diretor de teste',vinculo:'Relação profissional declarada.',confirmacao:'confirmada',autorizacao:'Autorizado para este mandato.',email:'contato-restrito@teste.local',telefone:'11999999999'}};
  assert.equal((await a.chamar('POST',url,relacao)).statusCode,403);
  assert.equal((await s.chamar('POST',url,relacao)).statusCode,200);
  const leitura=await a.chamar('GET',url);assert.ok(!leitura.body.includes('contato-restrito@'));assert.ok(!leitura.body.includes('11999999999'));
  const historico=await a.chamar('GET',`${url}/${relacao.id}/versoes`);assert.ok(!historico.body.includes('contato-restrito@'));
  assert.ok((await s.chamar('GET',url)).body.includes('contato-restrito@'));
});

test('documentos preservam original e hash, isolam escopo e alimentam somente conversa autorizada', async (t) => {
  const { usuario,selecionar,criar }=await montar(t);const a=await usuario('a@teste.local'),b=await usuario('b@teste.local');
  const { o }=await criar(a,(await selecionar(a)).s),url=`/api/crm/oportunidades/${o.id}/documentos`;
  const texto='Atuação em especialidades químicas.\n\nConfirmar fabricantes representados.';
  const p={id:randomUUID(),nome:'memoria.txt',base64:Buffer.from(texto).toString('base64'),autorizado:true};
  const r=await a.chamar('POST',url,p);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().documento.estado,'extraido');
  const id=r.json().documento.id;
  assert.equal((await a.chamar('POST',url,{...p,id:randomUUID()})).json().documento.id,id);
  assert.equal((await a.chamar('GET',`${url}/${id}?baixar=1`)).body,texto);
  assert.equal((await a.chamar('GET',`${url}/${id}`)).json().documento.trechos.length,2);
  assert.equal((await b.chamar('GET',`${url}/${id}`)).statusCode,404);
  assert.equal((await b.chamar('GET',`${url}/${id}?baixar=1`)).statusCode,404);
  assert.equal((await a.chamar('POST',url,{...p,autorizado:false})).statusCode,422);
  assert.equal((await a.chamar('POST',url,{...p,nome:'falso.pdf'})).statusCode,422);
  const c=(await a.chamar('POST','/api/agente/conversas',{id:randomUUID(),titulo:'Análise do documento',contexto:{oportunidadeId:o.id,documentoIds:[id]}})).json().conversa;
  const analise=await a.chamar('POST',`/api/agente/conversas/${c.id}/mensagens`,{chave:randomUUID(),versao:0,tarefa:'conversar',texto:'Resuma o documento selecionado.'});
  assert.equal(analise.statusCode,200,analise.body);assert.ok(analise.json().turno.resultado.avisoIA);
  assert.ok(analise.json().turno.resultado.fontes.some((f)=>f.titulo==='memoria.txt'));
});

test('extração de PDF conserva referências por página e recusa conteúdo inválido',async()=>{
  const pdf=new PDFDocument(),partes=[];
  const pronto=new Promise((resolve,reject)=>{pdf.on('data',(p)=>partes.push(p));pdf.on('end',()=>resolve(Buffer.concat(partes)));pdf.on('error',reject)});
  pdf.text('Documento de teste da GHT4.');pdf.addPage().text('Segunda pagina da pesquisa.');pdf.end();
  const r=await extrairDocumento(await pronto,'pdf');
  assert.equal(r.estado,'extraido');assert.equal(r.trechos[1].local,'Página 2');assert.match(r.trechos[1].texto,/Segunda pagina/);
  assert.equal((await extrairDocumento(Buffer.from('PKinvalido'),'docx')).estado,'falha_extracao');
});

test('encaixe separa cobertura de aderência e múltiplos não usam valores ausentes ou não revisados',()=>{
  const a={produtos:'resinas',regioes:'SP',receitaMin:null,receitaMax:null,controle:'nao_apurado'};
  const b={...a,produtos:'Resinas, solventes'};
  const r=compararTeses(a,b);assert.equal(r.aderencia,1);assert.equal(r.cobertura,.5);
  const linha={id:'x',revisado:true,dados:{empresa:'Teste',tipo:'transacao',periodo:'2025',fonte:'Fonte',ev:100,receita:50,ebitda:-10}};
  assert.equal(analisarComparaveis([linha])[0].evReceita,2);assert.equal(analisarComparaveis([linha])[0].evEbitda,null);
  assert.equal(analisarComparaveis([{...linha,revisado:false}])[0].evReceita,null);
});

test('lote aceita somente empresas do turno e preserva decisões anteriores', async (t) => {
  const { usuario, selecionar, db } = await montar(t); const a = await usuario('a@teste.local');
  const { c,turno } = await selecionar(a);
  const url = `/api/agente/conversas/${c.id}/selecao/lote`;
  const p = { turnoId: turno.id, empresas: [empresa.id], justificativa: 'Investigar o lote com a equipe.' };
  assert.equal((await a.chamar('POST',url,p)).json().adicionadas,0);
  const r = (await db.query('SELECT estado FROM agente_selecao WHERE conversa_id=$1',[c.id])).rows[0];
  assert.equal(r.estado,'priorizar');
  assert.equal((await a.chamar('POST',url,{ ...p,empresas: [empresa.id,'cnpj87654321'] })).statusCode,422);
  const b = await usuario('b@teste.local');
  assert.equal((await b.chamar('POST',url,p)).statusCode,404);
});

test('agenda persiste várias tarefas, exige responsável do espaço e protege atualizações concorrentes', async (t) => {
  const { usuario, selecionar, criar } = await montar(t); const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local');
  const { s } = await selecionar(a); const { o } = await criar(a,s);
  const id = randomUUID(), url = `/api/crm/oportunidades/${o.id}/tarefas/${id}`;
  const p = { chave: randomUUID(), versao: 1, descricao: 'Revisar os produtos da companhia', tipo: 'pesquisa', prazo: hoje(), responsavelId: a.id, concluida: false };
  assert.equal((await a.chamar('PUT',url,{ ...p,responsavelId: b.id })).statusCode,422);
  assert.equal((await a.chamar('PUT',url,p)).statusCode,200);
  assert.equal((await a.chamar('PUT',url,p)).statusCode,200);
  assert.equal((await a.chamar('PUT',url,{ ...p,chave: randomUUID(),concluida: true })).statusCode,409);
  assert.equal((await a.chamar('PUT',url,{ ...p,chave: randomUUID(),versao: 2,concluida: true })).statusCode,200);
  const rotina = (await a.chamar('GET',`/api/crm/oportunidades/${o.id}/rotina`)).json();
  assert.equal(rotina.tarefas.length,1); assert.equal(rotina.tarefas[0].concluida,true);
  assert.equal((await b.chamar('GET',`/api/crm/oportunidades/${o.id}/rotina`)).statusCode,404);
  const painel = (await a.chamar('GET','/api/crm/painel')).json();
  assert.equal(painel.funil[0].quantidade,1); assert.equal(painel.pendencias.length,1);
  assert.equal((await b.chamar('GET','/api/crm/painel')).json().pendencias.length,0);
});

test('painel informa totais exatos de compromissos e atrasos além do corte de 100', async (t) => {
  const { db, usuario, selecionar, criar } = await montar(t); const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local');
  const { s } = await selecionar(a); const { o } = await criar(a,s);
  const ontem = new Date(`${hoje()}T12:00:00Z`); ontem.setUTCDate(ontem.getUTCDate() - 1);
  const futuro = new Date(`${hoje()}T12:00:00Z`); futuro.setUTCDate(futuro.getUTCDate() + 30);
  const inserir = (prazo, concluida = false) => db.query(`INSERT INTO crm_tarefas (id,oportunidade_id,responsavel_id,descricao,tipo,prazo,concluida)
    VALUES ($1,$2,$3,'Tarefa de volume','pesquisa',$4,$5)`, [randomUUID(), o.id, a.id, prazo.toISOString().slice(0,10), concluida]);
  await inserir(ontem); await inserir(ontem, true);
  for (let i = 0; i < 98; i++) await inserir(futuro);
  // exatamente no corte: lista e total coincidem em 100
  const noCorte = (await a.chamar('GET','/api/crm/painel')).json();
  assert.equal(noCorte.pendencias.length, 100);
  assert.deepEqual(noCorte.totais, { compromissos: 100, atrasados: 1 });
  for (let i = 0; i < 22; i++) await inserir(futuro);
  const painel = (await a.chamar('GET','/api/crm/painel')).json();
  assert.equal(painel.pendencias.length, 100);
  // próximo passo da oportunidade (prazo hoje) + 1 atrasada + 120 futuras; a concluída não conta
  assert.deepEqual(painel.totais, { compromissos: 122, atrasados: 1 });
  assert.equal(painel.pendencias[0].prazo < painel.hoje, true);
  assert.deepEqual((await b.chamar('GET','/api/crm/painel')).json().totais, { compromissos: 0, atrasados: 0 });
});

test('não contatar vale para compra e venda da empresa no espaço e sócio controla retirada', async (t) => {
  const { usuario, selecionar, criar, db } = await montar(t);
  const a = await usuario('a@teste.local'); const socio = await usuario('s@teste.local','socio');
  const m = await criarMandato(db,{ codigo: 'RESTRITO' }); await darAcesso(db,m.id,a.id); await darAcesso(db,m.id,socio.id,'socio');
  const primeira = await selecionar(a,m.id,'compra'); const { o } = await criar(a,primeira.s);
  const outra = await selecionar(a,m.id,'venda'); const venda = (await criar(a,outra.s)).o;
  const url = `/api/crm/oportunidades/${o.id}/restricao`;
  const p = { chave: randomUUID(), versao: 1, versaoRestricao: 0, ativa: true, categoria: 'solicitacao_da_empresa', motivo: 'Solicitação expressa registrada na reunião.' };
  assert.equal((await a.chamar('PUT',url,p)).statusCode,200);
  assert.equal((await a.chamar('PUT',url,p)).statusCode,200);
  assert.equal((await a.chamar('GET',`/api/crm/oportunidades/${venda.id}/rotina`)).json().restricao.ativa,true);
  const contato = { chave: randomUUID(),versao: 1,etapa: 'contatada',descricao: 'Registro declarado de contato da equipe',ocorridoEm: hoje(),canal: 'E-mail',participantes: 'Contato teste' };
  assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${venda.id}/atividades`,contato)).statusCode,422);
  assert.equal((await a.chamar('PUT',url,{ ...p,chave: randomUUID(),versao: 2,versaoRestricao: 1,ativa: false })).statusCode,403);
  assert.equal((await socio.chamar('PUT',url,{ ...p,chave: randomUUID(),versao: 2,versaoRestricao: 1,ativa: false })).statusCode,200);
  assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${venda.id}/atividades`,contato)).statusCode,200);
});

test('seleção guarda decisão e fonte do resultado; revisão é reversível e independente por frente', async (t) => {
  const { usuario } = await montar(t); const u = await usuario('an@teste.local');
  const r = await u.chamar('POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Tese em duas frentes', contexto: { frente: 'compra' } });
  const c = r.json().conversa;
  async function pesquisar(versao, frente) {
    return (await u.chamar('POST', `/api/agente/conversas/${c.id}/mensagens`, { chave: randomUUID(), versao, tarefa: 'buscar_empresas', contexto: { frente } })).json().turno;
  }
  const turno = await pesquisar(0, 'compra');
  const url = `/api/agente/conversas/${c.id}/selecao/${empresa.id}`;
  const p = { turnoId: turno.id, versao: 0, estado: 'descartar', justificativa: 'Fora da tese de aplicações neste momento.' };
  const primeira = await u.chamar('PUT', url, p);
  assert.equal(primeira.statusCode, 200, primeira.body);
  assert.deepEqual(primeira.json().selecao.empresa, empresa);
  assert.equal(primeira.json().selecao.fontes[0].referencia, fontes[0].referencia);
  assert.equal((await u.chamar('PUT', url, p)).json().selecao.versao, 1);
  assert.equal((await u.chamar('PUT', url, { ...p, estado: 'priorizar' })).statusCode, 409);
  const revisao = await u.chamar('PUT', url, { ...p, versao: 1, estado: 'investigar', justificativa: 'Reabrir investigação após ajuste da tese.' });
  assert.equal(revisao.json().selecao.versao, 2);
  const venda = await pesquisar(1, 'venda');
  assert.equal((await u.chamar('PUT', url, { ...p, turnoId: venda.id, estado: 'priorizar' })).statusCode, 200);
  const lista = (await u.chamar('GET', `/api/agente/conversas/${c.id}/selecao`)).json().selecao;
  assert.deepEqual(lista.map((s) => s.frente).sort(), ['compra','venda']);
  assert.equal((await u.chamar('PUT', `/api/agente/conversas/${c.id}/selecao/cnpj87654321`, p)).statusCode, 422);
  assert.equal((await u.chamar('PUT', url, { ...p, empresa: { nome: 'Dado inventado' } })).statusCode, 422);
});

test('oportunidade nasce da seleção priorizada, conserva escopo e não copia notas privadas', async (t) => {
  const { db, usuario, selecionar, criar, criarCorpo } = await montar(t);
  const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local', 'socio');
  const m = await criarMandato(db, { codigo: 'EQUIPE' }); await darAcesso(db,m.id,a.id); await darAcesso(db,m.id,b.id,'socio');
  const { c,s } = await selecionar(a,m.id);
  const { o,corpo } = await criar(a,s);
  assert.equal(o.mandato_id,m.id); assert.equal(o.frente,'compra'); assert.equal(o.responsavel_id,a.id);
  assert.equal(o.etapa,'identificada'); assert.equal(o.prazo,hoje()); assert.deepEqual(o.empresa,empresa);
  const compartilhada = await b.chamar('GET', `/api/crm/oportunidades/${o.id}`);
  assert.equal(compartilhada.statusCode,200);
  assert.ok(!compartilhada.body.includes('Nota pessoal')); assert.ok(!compartilhada.body.includes(c.id));
  assert.equal((await b.chamar('GET', `/api/agente/conversas/${c.id}/selecao`)).statusCode,404);
  assert.equal((await a.chamar('POST', '/api/crm/oportunidades',corpo)).json().oportunidade.id,o.id);
  assert.equal((await a.chamar('POST', '/api/crm/oportunidades',criarCorpo(s))).statusCode,409);
  const excluida = await selecionar(a,null,'venda');
  await a.chamar('PUT', `/api/agente/conversas/${excluida.c.id}/selecao/${empresa.id}`, { ...excluida.corpo, versao:1,estado:'descartar' });
  assert.equal((await a.chamar('POST','/api/crm/oportunidades',criarCorpo(excluida.s))).statusCode,422);
});

test('CRM nega anônimos, isola trabalhos pessoais e responde à retirada de acesso ao espaço', async (t) => {
  const { app,db,usuario,selecionar,criar } = await montar(t);
  const a = await usuario('a@teste.local'); const fora = await usuario('fora@teste.local','admin');
  const pessoal = await criar(a,(await selecionar(a)).s);
  for (const [method,url] of [['GET','/api/crm/oportunidades'],['POST','/api/crm/oportunidades'],['GET',`/api/crm/oportunidades/${pessoal.o.id}`],['PATCH',`/api/crm/oportunidades/${pessoal.o.id}`],['POST',`/api/crm/oportunidades/${pessoal.o.id}/atividades`]]) {
    assert.equal((await app.inject({method,url})).statusCode,401,url);
  }
  assert.equal((await fora.chamar('GET',`/api/crm/oportunidades/${pessoal.o.id}`)).statusCode,404);
  assert.equal((await fora.chamar('GET','/api/crm/oportunidades')).json().total,0);
  const m = await criarMandato(db,{codigo:'SIGILO'}); await darAcesso(db,m.id,a.id);
  const compartilhada = await criar(a,(await selecionar(a,m.id)).s);
  assert.equal((await fora.chamar('GET',`/api/crm/oportunidades/${compartilhada.o.id}`)).statusCode,200);
  await db.query('DELETE FROM mandato_membros WHERE mandato_id=$1 AND usuario_id=$2',[m.id,a.id]);
  assert.equal((await a.chamar('GET',`/api/crm/oportunidades/${compartilhada.o.id}`)).statusCode,404);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades')).json().total,1);
});

test('responsável e ação têm controle de versão; tentativas repetidas não duplicam histórico', async (t) => {
  const { db,usuario,selecionar,criar } = await montar(t);
  const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local'); const fora = await usuario('fora@teste.local');
  const m = await criarMandato(db,{codigo:'EQUIPE'}); await darAcesso(db,m.id,a.id); await darAcesso(db,m.id,b.id);
  const { o } = await criar(a,(await selecionar(a,m.id)).s);
  const p = { chave:randomUUID(),versao:1,titulo:o.titulo,objetivo:o.objetivo,proximaAcao:'Agendar conversa de qualificação',prazo:'2020-01-01',responsavelId:b.id,acaoConcluida:false };
  const r = await a.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,p);
  assert.equal(r.statusCode,200,r.body); assert.equal(r.json().oportunidade.versao,2);
  assert.equal((await a.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,p)).json().oportunidade.versao,2);
  assert.equal((await a.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,{...p,chave:randomUUID()})).statusCode,409);
  assert.equal((await a.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,{...p,versao:2,responsavelId:fora.id})).statusCode,422);
  assert.equal((await b.chamar('GET','/api/crm/oportunidades?pendentes=minhas')).json().total,1);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades?pendentes=atrasadas')).json().total,1);
  const fim = { ...p,chave:randomUUID(),versao:2,acaoConcluida:true };
  assert.equal((await b.chamar('PATCH',`/api/crm/oportunidades/${o.id}`,fim)).statusCode,200);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades?pendentes=atrasadas')).json().total,0);
  assert.equal((await a.chamar('GET',`/api/crm/oportunidades/${o.id}`)).json().historico.length,3);
});

test('avanço comercial exige papel e evidência; nota do analista preserva etapa', async (t) => {
  const { db,usuario,selecionar,criar } = await montar(t);
  const a = await usuario('a@teste.local'); const socio = await usuario('s@teste.local','socio');
  const leitura = await usuario('l@teste.local','leitura');
  const m = await criarMandato(db,{codigo:'FLUXO'}); await darAcesso(db,m.id,a.id); await darAcesso(db,m.id,socio.id,'socio'); await darAcesso(db,m.id,leitura.id,'leitura');
  const { o } = await criar(a,(await selecionar(a,m.id)).s);
  const base = { chave:randomUUID(),versao:1,ocorridoEm:hoje(),descricao:'Registro de teste informado pelo participante.' };
  assert.equal((await leitura.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,base)).statusCode,403);
  assert.equal((await a.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,{...base,etapa:'negociacao'})).statusCode,403);
  for (const etapa of ['contatada','conversa_realizada','proposta_enviada','mandato_assinado','perdida']) {
    assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,{...base,etapa})).statusCode,422,etapa);
  }
  const nota = await a.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,base);
  assert.equal(nota.statusCode,200,nota.body); assert.equal(nota.json().oportunidade.etapa,'identificada');
  const contato = { ...base,chave:randomUUID(),versao:2,etapa:'contatada',canal:'Reunião por vídeo',participantes:'Responsável comercial (teste)' };
  assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,contato)).statusCode,200);
  assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,contato)).json().oportunidade.versao,3);
  await assert.rejects(db.query("UPDATE crm_eventos SET descricao='alterado' WHERE oportunidade_id=$1",[o.id]));
  assert.equal((await socio.chamar('POST',`/api/crm/oportunidades/${o.id}/atividades`,{...base,chave:randomUUID(),versao:3,ocorridoEm:'2099-01-01'})).statusCode,422);
});

test('criações concorrentes geram uma oportunidade e um evento, sem duplicar seleção', async (t) => {
  const { db,usuario,selecionar,criarCorpo } = await montar(t);
  const a = await usuario('a@teste.local'); const { s } = await selecionar(a); const corpo=criarCorpo(s);
  const respostas = await Promise.all([1,2].map(() => a.chamar('POST','/api/crm/oportunidades',corpo)));
  assert.deepEqual(respostas.map((r) => r.statusCode),[201,201]);
  assert.equal(Number((await db.query('SELECT count(*) n FROM crm_oportunidades')).rows[0].n),1);
  assert.equal(Number((await db.query('SELECT count(*) n FROM crm_eventos')).rows[0].n),1);
});

test('valida datas, filtros, IDs e campos sem permitir alterar fonte ou escopo pelo cliente', async (t) => {
  const { usuario,selecionar,criarCorpo } = await montar(t);
  const a=await usuario('a@teste.local'); const {s}=await selecionar(a); const p=criarCorpo(s);
  for (const extra of [{prazo:'2026-02-31'},{prazo:'amanhã'},{mandatoId:randomUUID()},{empresa:{nome:'Inventado'}},{frente:'venda'}]) {
    assert.equal((await a.chamar('POST','/api/crm/oportunidades',{...p,...extra})).statusCode,422);
  }
  assert.equal((await a.chamar('GET','/api/crm/oportunidades/invalido')).statusCode,422);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades?offset=-1')).statusCode,422);
  assert.equal((await a.chamar('GET','/api/crm/oportunidades?busca=%25')).json().total,0);
});

test('situação da empresa mostra só oportunidades e restrições alcançáveis, sem revelar mandato confidencial', async (t) => {
  const { db, usuario, selecionar, criar } = await montar(t);
  const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local'); const admin = await usuario('adm@teste.local','admin');
  const url = `/api/empresas/${empresa.id}/situacao`;
  assert.equal((await a.chamar('GET',url)).json().oportunidades.length,0);
  const privada = await criar(a,(await selecionar(a)).s);
  const sigilo = await criarMandato(db,{ codigo: 'SIGILO-EMP', confidencial: true }); await darAcesso(db,sigilo.id,a.id,'socio');
  const confidencial = await criar(a,(await selecionar(a,sigilo.id,'venda')).s);
  const restricao = { chave: randomUUID(), versao: 1, versaoRestricao: 0, ativa: true, categoria: 'conflito_de_interesse', motivo: 'Conflito registrado com outro mandato da casa.' };
  assert.equal((await a.chamar('PUT',`/api/crm/oportunidades/${confidencial.o.id}/restricao`,restricao)).statusCode,200);
  const deA = (await a.chamar('GET',url)).json();
  assert.deepEqual(deA.oportunidades.map((o) => o.id).sort(),[privada.o.id,confidencial.o.id].sort());
  assert.equal(deA.restricoes.length,1); assert.equal(deA.restricoes[0].espaco,'Mandato de teste');
  // b não participa do mandato confidencial nem é autor da privada: nada, nem contagem.
  const deB = (await b.chamar('GET',url));
  assert.equal(deB.statusCode,200); assert.deepEqual(deB.json(),{ empresaId: empresa.id, oportunidades: [], restricoes: [] });
  assert.doesNotMatch(deB.body,/SIGILO|Conflito|Mandato/);
  // admin alcança o mandato confidencial, mas não a privada de outro usuário.
  assert.deepEqual((await admin.chamar('GET',url)).json().oportunidades.map((o) => o.id),[confidencial.o.id]);
  assert.equal((await a.chamar('GET','/api/empresas/xx/situacao')).statusCode,422);
});

test('meu dia mostra só compromissos do próprio usuário, por prazo, e pendências da sua pessoa na rede', async (t) => {
  const { db, usuario, selecionar, criar } = await montar(t);
  const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local'); const leitura = await usuario('l@teste.local','leitura');
  const vazio = (await a.chamar('GET','/api/inicio')).json();
  assert.deepEqual(vazio.compromissos,{ atrasados: 0, hoje: 0, semana: 0, itens: [] });
  assert.deepEqual(vazio.rede,{ naRede: false, perguntasPendentes: 0, vinculosParaConfirmar: 0 });
  const { o } = await criar(a,(await selecionar(a)).s); // próximo passo com prazo hoje
  const dia = (d) => { const x = new Date(`${hoje()}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0,10); };
  const tarefa = (prazo, resp = a.id, concluida = false) => db.query(`INSERT INTO crm_tarefas (id,oportunidade_id,responsavel_id,descricao,tipo,prazo,concluida)
    VALUES ($1,$2,$3,'Tarefa','contato',$4,$5)`, [randomUUID(), o.id, resp, prazo, concluida]);
  await tarefa(dia(-2)); await tarefa(dia(3)); await tarefa(dia(30)); await tarefa(dia(-1), a.id, true); await tarefa(dia(-1), b.id);
  const meu = (await a.chamar('GET','/api/inicio')).json();
  assert.equal(meu.compromissos.atrasados,1); assert.equal(meu.compromissos.hoje,1); assert.equal(meu.compromissos.semana,1);
  assert.deepEqual(meu.compromissos.itens.map((i) => i.prazo),[dia(-2),hoje(),dia(3)]);
  assert.equal(meu.semProximoPasso.total,0);
  await db.query('UPDATE crm_oportunidades SET acao_concluida=true WHERE id=$1',[o.id]);
  assert.equal((await a.chamar('GET','/api/inicio')).json().semProximoPasso.itens[0].id,o.id);
  // b só enxerga a própria tarefa se tiver acesso à oportunidade (privada de a): nada.
  assert.deepEqual((await b.chamar('GET','/api/inicio')).json().compromissos.itens,[]);
  // Leitura consulta o CRM, mas não é responsável por nada: bloco presente e vazio.
  const l = (await leitura.chamar('GET','/api/inicio')).json(); assert.deepEqual(l.compromissos.itens,[]);
  // Rede: a pessoa de a, duas pessoas do mercado (uma respondida) e um vínculo a confirmar.
  const [eu, x, y] = [randomUUID(), randomUUID(), randomUUID()];
  await db.query(`INSERT INTO rede_pessoas (id,lado,nome,usuario_id,criado_por) VALUES ($1,'ght4','A',$2,$2),($3,'mercado','X',NULL,$2),($4,'mercado','Y',NULL,$2)`,[eu,a.id,x,y]);
  await db.query(`INSERT INTO rede_reconhecimentos (id,pessoa_ght4_id,pessoa_alvo_id,resposta,registrado_por) VALUES ($1,$2,$3,'nao_conheco',$4)`,[randomUUID(),eu,x,a.id]);
  const [pa, pb] = [eu, y].sort();
  await db.query(`INSERT INTO rede_vinculos (id,pessoa_a_id,pessoa_b_id,tipo,forca,evidencia,criado_por) VALUES ($1,$2,$3,'evento','fraca','Evento setorial registrado',$4)`,[randomUUID(),pa,pb,a.id]);
  assert.deepEqual((await a.chamar('GET','/api/inicio')).json().rede,{ naRede: true, perguntasPendentes: 1, vinculosParaConfirmar: 1 });
  assert.equal((await b.chamar('GET','/api/inicio')).json().rede.naRede,false);
});

test('ficha da empresa reúne cadastro, situação, pessoas e acervo acessíveis, sem contatos', async (t) => {
  const { db, usuario, selecionar, criar } = await montar(t);
  const a = await usuario('a@teste.local'); const b = await usuario('b@teste.local');
  const { o } = await criar(a,(await selecionar(a)).s);
  await db.query(`INSERT INTO crm_registros (id,serie_id,oportunidade_id,tipo,versao,dados,revisado,usuario_id) VALUES
    ($1,$1,$3,'tese',1,'{"titulo":"Tese v1"}',false,$4),($2,$1,$3,'tese',2,'{"titulo":"Tese v2","fonte":"Reunião"}',true,$4)`,[randomUUID(),randomUUID(),o.id,a.id]);
  await db.query(`INSERT INTO crm_registros (id,serie_id,oportunidade_id,tipo,versao,dados,usuario_id) VALUES ($1,$1,$2,'relacao',1,'{"titulo":"Contato privado"}',$3)`,[randomUUID(),o.id,a.id]);
  await db.query(`INSERT INTO rede_pessoas (id,lado,nome,cargo,senioridade,empresa_id,email,criado_por) VALUES ($1,'mercado','Diretora X','Diretora','diretoria',$2,'segredo@example.test',$3)`,[randomUUID(),empresa.id,a.id]);
  const f = (await a.chamar('GET',`/api/empresas/${empresa.id}/ficha`)).json();
  assert.equal(f.empresa.nome,empresa.nome);
  assert.deepEqual(f.situacao.oportunidades.map((x) => x.id),[o.id]);
  assert.deepEqual(f.acervo.registros.map((r) => [r.titulo,r.versao,r.revisado]),[['Tese v2',2,true]]);
  assert.equal(f.pessoas.length,1); assert.equal(f.pessoas[0].senioridade,'Diretoria');
  assert.equal(f.acesso.pessoasConhecidas,1); assert.equal(f.acesso.utilizaveis,0);
  const bruto = JSON.stringify(f); assert.doesNotMatch(bruto,/segredo@|Contato privado/);
  const deB = (await b.chamar('GET',`/api/empresas/${empresa.id}/ficha`)).json();
  assert.deepEqual(deB.situacao.oportunidades,[]); assert.deepEqual(deB.acervo,{ registros: [], documentos: [] });
  assert.equal((await a.chamar('GET','/api/empresas/cnpj99999999/ficha')).statusCode,404);
});

test('briefing em PDF traz ficha, restrição em destaque e roteiro da frente; registra auditoria; leitura não exporta', async (t) => {
  const { db, usuario, selecionar, criar } = await montar(t);
  const a = await usuario('a@teste.local'); const leitura = await usuario('l@teste.local','leitura');
  const { o } = await criar(a,(await selecionar(a)).s);
  const restricao = { chave: randomUUID(), versao: 1, versaoRestricao: 0, ativa: true, categoria: 'solicitacao_da_empresa', motivo: 'Pediu para não ser procurada até 2027.' };
  assert.equal((await a.chamar('PUT',`/api/crm/oportunidades/${o.id}/restricao`,restricao)).statusCode,200);
  await db.query(`INSERT INTO rede_pessoas (id,lado,nome,cargo,senioridade,empresa_id,email,criado_por) VALUES ($1,'mercado','Diretora X','Diretora','diretoria',$2,'segredo@example.test',$3)`,[randomUUID(),empresa.id,a.id]);
  const r = await a.chamar('GET',`/api/empresas/${empresa.id}/briefing?frente=compra`);
  assert.equal(r.statusCode,200,r.body.slice(0,200)); assert.equal(r.headers['content-type'],'application/pdf');
  assert.match(r.headers['content-disposition'],/briefing-12345678-compra\.pdf/);
  const texto = (await extrairDocumento(r.rawPayload,'pdf')).trechos.map((x) => x.texto).join(' ');
  for (const esperado of ['Química de teste','NÃO CONTATAR','2027','Diretora X','lacuna de produto','não informa faturamento']) assert.ok(texto.includes(esperado), esperado);
  assert.ok(!texto.includes('segredo@'));
  const auditoria = (await db.query("SELECT * FROM auditoria WHERE entidade='briefing_empresa'")).rows;
  assert.equal(auditoria.length,1); assert.equal(auditoria[0].entidade_id,empresa.id);
  assert.equal((await leitura.chamar('GET',`/api/empresas/${empresa.id}/briefing`)).statusCode,403);
  assert.equal((await a.chamar('GET',`/api/empresas/${empresa.id}/briefing?frente=xx`)).statusCode,422);
});
