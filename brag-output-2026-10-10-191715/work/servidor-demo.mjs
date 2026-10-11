// Servidor de demonstração para as capturas do vídeo: o app real (API + interface de v1/dist) num
// banco em memória, com o catálogo e o quadro fictícios de gerar-ficticio.mjs, uma equipe fictícia,
// vínculos confirmados, oportunidades em várias etapas e a IA simulada sem rede. Só em 127.0.0.1.
//   node servidor-demo.mjs   →  http://127.0.0.1:5190  (senha das contas: SENHA abaixo)
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const S = 'file:///C:/Users/Leonardo/GHT4/';
const { bancoDeTeste, criarUsuario, criarMandato, darAcesso } = await import(S + 'server/tests/ajuda.mjs');
const { criarApp } = await import(S + 'server/src/app.mjs');
const { criarCatalogo } = await import(S + 'server/src/agente/catalogo.mjs');
const { servirInterface } = await import(S + 'server/src/operacao/estatico.mjs');
const { configurarIA, criarServicoIA } = await import(S + 'server/src/agente/provedor.mjs');
const { normalizar } = await import(S + 'server/src/rede/contratos.mjs');
const { gravarQuadro } = await import(S + 'ferramentas/importar-quadro-societario.mjs');
const { encontrarPessoas } = await import(S + 'server/src/encontrar/buscar.mjs');
const { hoje } = await import(S + 'server/src/crm/contratos.mjs');

const SENHA = 'Demonstracao-local-2026!';
// DEMO_SEM_IA=1: como a produção hoje, sem provedor de IA (a pesquisa por tese mostra "Modo sem IA").
const SEM_IA = process.env.DEMO_SEM_IA === '1';
const PORTA = SEM_IA ? 5191 : 5190;
const db = await bancoDeTeste();
const catalogo = criarCatalogo({ arquivo: join(aqui, 'data-ficticio.js'), arquivoIbama: null });

/* A IA da demonstração: um provedor simulado, sem rede, que devolve a leitura de um pedido ambíguo. */
const PEDIDO_IA = 'Chefe de pessoas e o presidente das distribuidoras de SP';
const LEITURA = { papeis: [{ senioridades: ['diretoria'], area: 'rh', trecho: 'Chefe de pessoas' }, { senioridades: ['ceo'], area: null, trecho: 'o presidente' }],
  decide: null, excluidas: [], cadaUm: true, acesso: null, criterios: [], duvidas: ['"Chefe" pode ser gerência.'] };
const fetchIA = async () => Response.json({ choices: [{ message: { content: JSON.stringify(LEITURA) }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 60 } });
const servicoIA = criarServicoIA(db, configurarIA({ GHT4_IA_PROVEDOR: 'groq', GROQ_API_KEY: 'somente-demonstracao', GHT4_IA_PEDIDOS_USUARIO_DIA: '20' }), { fetchImpl: fetchIA });

const app = await criarApp(db, { catalogo, servicoIA: SEM_IA ? null : servicoIA, web: { fetchImpl: async () => { throw new Error('Demonstração sem rede.'); } } });
await servirInterface(app, 'C:/Users/Leonardo/GHT4/v1/dist');
const host = await app.listen({ host: '127.0.0.1', port: PORTA });

/* Equipe fictícia. */
const marina = await criarUsuario(db, { email: 'marina@demo.local', nome: 'Marina Costa', papel: 'admin', senha: SENHA });
const equipe = [
  ['rafael@demo.local', 'Rafael Duarte', 'socio', 'Sócio'],
  ['gustavo@demo.local', 'Gustavo Ramos', 'socio', 'Sócio'],
  ['beatriz@demo.local', 'Beatriz Lacerda', 'analista', 'Analista'],
  ['helena@demo.local', 'Helena Prado', 'analista', 'Analista'],
];
const usuarios = [marina];
for (const [email, nome, papel] of equipe) usuarios.push(await criarUsuario(db, { email, nome, papel, senha: SENHA }));
const mandato = await criarMandato(db, { codigo: 'PS-01', rotulo: 'Projeto Solvente · venda', confidencial: true });
await darAcesso(db, mandato.id, marina.id, 'socio').catch(() => {});
for (const u of usuarios.slice(1, 4)) await darAcesso(db, mandato.id, u.id, u.papel === 'analista' ? 'analista' : 'socio').catch(() => {});

async function sessao(email) {
  const r = await fetch(`${host}/api/sessao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha: SENHA }) });
  if (!r.ok) throw new Error(`sessão ${email}: ${r.status}`);
  return r.headers.get('set-cookie').split(';')[0];
}
async function chamar(cookie, metodo, caminho, corpo) {
  const r = await fetch(`${host}${caminho}`, { method: metodo, headers: { Cookie: cookie, ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${j.mensagem ?? JSON.stringify(j).slice(0, 200)}`);
  return j;
}
const cookie = await sessao(marina.email);

/* O quadro societário fictício: 47.599 pessoas, com o atestado do quadro, como a importação real. */
const pessoas = JSON.parse(readFileSync(join(aqui, 'quadro-ficticio.json'), 'utf8'))
  .map((p) => ({ ...p, nomeNormalizado: normalizar(p.nome) }));
const t0 = Date.now();
await gravarQuadro(db, pessoas, { operadorId: marina.id, referencia: '2026-08', empresasAlcancadas: 32001, socioAdministrador: true });
console.log(`quadro: ${pessoas.length} pessoas em ${Date.now() - t0} ms`);

/* A casa: cada conta ligada à sua pessoa na rede. */
const casa = [];
const cargos = ['Sócia', 'Sócio', 'Sócio', 'Analista', 'Analista'];
for (const [k, u] of usuarios.entries()) {
  casa.push((await chamar(cookie, 'POST', '/api/rede/pessoas', { id: randomUUID(), lado: 'ght4', nome: u.nome, usuarioId: u.id, cargo: `${cargos[k]} da GHT4` })).pessoa);
}

/* Vínculos confirmados com quem decide nas distribuidoras de SP com mais de 20 anos. */
const conta = { id: marina.id, papel: 'admin', mandatos: [] };
const base = await encontrarPessoas(db, catalogo, { texto: 'Quem decide nas distribuidoras de SP com mais de 20 anos', usuario: conta });
const alvos = base.grupos.forte.slice(0, 48);
for (const [k, alvo] of alvos.entries()) {
  const membro = casa[k % casa.length];
  const [a, b] = [membro.id, alvo.id].sort();
  await db.query(`INSERT INTO rede_vinculos (id,pessoa_a_id,pessoa_b_id,tipo,forca,evidencia,disposicao,confirmado_em,criado_por)
    VALUES ($1,$2,$3,'trabalharam_juntos','direta',$4,$5,now(),$6) ON CONFLICT DO NOTHING`,
  [randomUUID(), a, b, 'Trabalharam juntos no setor químico (relato da demonstração).', k % 3 ? 'conheco' : 'posso_apresentar', membro.usuario_id ?? marina.id]);
}
console.log(`vínculos: ${alvos.length}`);

/* Oportunidades em várias etapas, criadas como a interface cria: pesquisa, seleção priorizada, oportunidade. */
const ETAPAS = ['qualificada', 'contatada', 'conversa_realizada', 'oportunidade_mandato', 'proposta_enviada', 'negociacao'];
const conversa = (await chamar(cookie, 'POST', '/api/agente/conversas', { id: randomUUID(), titulo: 'Distribuidoras de SP com mais de 20 anos', mandatoId: null, contexto: { frente: 'venda', objetivo: 'Carteira de demonstração' } })).conversa;
const turno = (await chamar(cookie, 'POST', `/api/agente/conversas/${conversa.id}/mensagens`, { chave: randomUUID(), versao: 0, tarefa: 'buscar_empresas', texto: 'distribuidoras de SP' })).turno;
// A busca devolve a primeira página em ordem alfabética; para a carteira, empresas variadas das que
// têm decisor mapeado, gravadas no resultado do turno (é dele que a seleção aceita empresas).
const empresaDe = (p) => p.empresa_id ?? p.empresaId ?? p.empresa?.id;
const ids = [...new Set(base.grupos.forte.map(empresaDe).filter(Boolean))].filter((_, k) => k % 4 === 1).slice(0, 9);
if (ids.length < 7) throw new Error(`Poucas empresas para a carteira: ${ids.length}. Chaves da pessoa: ${Object.keys(base.grupos.forte[0] ?? {}).join(',')}`);
const empresasTurno = (await Promise.all(ids.map((id) => catalogo.obter(id)))).filter(Boolean);
await db.query(`UPDATE agente_turnos SET resultado = jsonb_set(resultado, '{empresas}', $1::jsonb) WHERE id = $2`, [JSON.stringify(empresasTurno), turno.id]);
const planos = [
  ['Sucessão familiar · avaliar venda', 'Entender se os sócios consideram a venda nos próximos 24 meses.', 'Reunião com o sócio-administrador', 4],
  ['Consolidação regional', 'Mapear interesse em combinação com distribuidora do interior.', 'Enviar material institucional', 2],
  ['Venda de participação minoritária', 'Testar apetite por sócio financeiro.', 'Preparar teaser', 5],
  ['Expansão para o Sul', 'Avaliar aquisição de base no Paraná.', 'Lista de alvos no PR', 1],
  ['Saída de fundador', 'Fundador sinalizou aposentadoria em evento do setor.', 'Conversa exploratória', 3],
  ['Carve-out de linha de solventes', 'Linha de solventes fora do foco do grupo.', 'Validar números com o CFO', 6],
  ['Primeiro contato', 'Empresa aderente à tese, sem relação ainda.', 'Pedir apresentação pela rede', 0],
];
for (const [k, empresaId] of ids.slice(0, planos.length).entries()) {
  const [titulo, objetivo, proximaAcao, ate] = planos[k];
  const s = (await chamar(cookie, 'PUT', `/api/agente/conversas/${conversa.id}/selecao/${empresaId}`, { turnoId: turno.id, versao: 0, estado: 'priorizar', justificativa: 'Aderente à tese de venda; prioridade da carteira.' })).selecao;
  let o = (await chamar(cookie, 'POST', '/api/crm/oportunidades', { id: randomUUID(), selecaoId: s.id, titulo, objetivo, proximaAcao, prazo: hoje() })).oportunidade;
  for (const etapa of ETAPAS.slice(0, ate)) {
    await chamar(cookie, 'POST', `/api/crm/oportunidades/${o.id}/atividades`, { chave: randomUUID(), versao: o.versao, etapa, descricao: `Avanço registrado: ${etapa.replace(/_/g, ' ')}.`, ocorridoEm: hoje(),
      canal: 'Reunião', participantes: 'Sócio-administrador e equipe GHT4', referencia: 'Proposta de assessoria v1' });
    o = (await chamar(cookie, 'GET', `/api/crm/oportunidades/${o.id}`)).oportunidade;
  }
}
const criadas = (await chamar(cookie, 'GET', '/api/crm/oportunidades')).total;
if (criadas !== planos.length) throw new Error(`Oportunidades criadas: ${criadas} de ${planos.length}`);
console.log(`oportunidades: ${criadas}`);
writeFileSync(join(aqui, SEM_IA ? 'demo-sem-ia.json' : 'demo.json'), JSON.stringify({ host, email: marina.email, senha: SENHA, pedidoIA: PEDIDO_IA }));
console.log(`Demonstração em ${host} · conta ${marina.email}`);
await new Promise((resolve) => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
await app.close(); await db.close();
