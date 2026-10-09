// Medição local do "encontrar quem decide" com o catálogo real e uma rede sintética do tamanho do
// quadro societário estatutário de 2026-08 (8.736 dirigentes em 2.477 empresas), para decidir a
// melhoria de desempenho do roteiro (só entra acima de 5 s). Banco em memória (PGlite, mais lento
// que o PostgreSQL de produção, sem a latência de rede até o Supabase), nenhuma chamada externa, e
// nenhum nome real: as pessoas são "Pessoa sintética N".
//
//   node ferramentas/medir-encontrar.mjs [--pessoas=8736] [--empresas=2477] [--membros=8] [--vinculos=400] [--repeticoes=3]
import { randomUUID } from 'node:crypto';
import { bancoDeTeste, criarUsuario } from '../server/tests/ajuda.mjs';
import { criarCatalogo } from '../server/src/agente/catalogo.mjs';
import { encontrarPessoas } from '../server/src/encontrar/buscar.mjs';

const opcao = (nome, padrao) => Number(process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1] ?? padrao);
const PESSOAS = opcao('pessoas', 8736), EMPRESAS = opcao('empresas', 2477), MEMBROS = opcao('membros', 8);
const VINCULOS = opcao('vinculos', 400), REPETICOES = Math.max(1, opcao('repeticoes', 3));

const db = await bancoDeTeste();
const catalogo = criarCatalogo();
const usuario = await criarUsuario(db, { email: 'medicao@teste.local', nome: 'Medição', papel: 'socio', senha: 'Medicao-local-2026!' });
const conta = { ...usuario, mandatos: [] };

// Empresas espalhadas pelo recorte inteiro (uma a cada `passo`), para não concentrar num subsetor.
const todas = (await catalogo.recorte({}, { limite: 10000 })).empresas;
const passo = Math.max(1, Math.floor(todas.length / Math.min(EMPRESAS, todas.length)));
const escolhidas = todas.filter((_, i) => i % passo === 0).slice(0, EMPRESAS);
const CARGOS = [['ceo', 'Diretor-presidente'], ['conselho', 'Conselheiro de administração'], ['diretoria', 'Diretor'], ['cfo', 'Diretor financeiro']];
const ids = [];
const t0 = performance.now();
for (let i = 0; i < PESSOAS; i += 500) {
  const lote = [];
  for (let k = i; k < Math.min(PESSOAS, i + 500); k++) {
    const [senioridade, cargo] = CARGOS[k % CARGOS.length];
    const id = randomUUID(); ids.push(id);
    lote.push([id, `Pessoa sintética ${k + 1}`, cargo, senioridade, escolhidas[k % escolhidas.length].id]);
  }
  const valores = lote.map((_, j) => `($${j * 5 + 1}::uuid,'mercado',$${j * 5 + 2},lower($${j * 5 + 2}),$${j * 5 + 3},$${j * 5 + 4},'','',$${j * 5 + 5},'cadastro_publico','Quadro societário sintético',$${lote.length * 5 + 1}::uuid)`);
  await db.query(`INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,cargo,senioridade,organizacao,organizacao_normalizada,empresa_id,origem,origem_referencia,criado_por)
    VALUES ${valores.join(',')}`, [...lote.flat(), usuario.id]);
}
const membros = [];
for (let m = 0; m < MEMBROS; m++) {
  const id = randomUUID(); membros.push(id);
  await db.query(`INSERT INTO rede_pessoas (id,lado,nome,nome_normalizado,criado_por) VALUES ($1,'ght4',$2,lower($2),$3)`, [id, `Membro sintético ${m + 1}`, usuario.id]);
}
for (let v = 0; v < VINCULOS; v++) {
  const [a, b] = [membros[v % membros.length], ids[(v * 7919) % ids.length]].sort();
  await db.query(`INSERT INTO rede_vinculos (id,pessoa_a_id,pessoa_b_id,tipo,forca,evidencia,disposicao,confirmado_em,criado_por)
    VALUES ($1,$2,$3,'trabalharam_juntos','direta','Vínculo sintético da medição.',$4,now(),$5) ON CONFLICT DO NOTHING`,
  [randomUUID(), a, b, v % 3 ? 'conheco' : 'posso_apresentar', usuario.id]);
}
console.log(`Carga: ${PESSOAS.toLocaleString('pt-BR')} pessoas em ${escolhidas.length.toLocaleString('pt-BR')} empresas, ${MEMBROS} membros, ${VINCULOS} vínculos (${Math.round(performance.now() - t0)} ms).`);

const PEDIDOS = [
  'Quem decide nas empresas químicas',
  'Quem decide nas distribuidoras de SP com mais de 20 anos',
  'CFOs das distribuidoras químicas que a casa conhece',
  // Um nome de verdade do catálogo (há nome fantasia vazio ou de um caractere).
  `Quem decide na ${escolhidas.find((e) => /[A-Za-zÀ-ÿ]{5,}/.test(e.nome))?.nome ?? escolhidas[0].razaoSocial}`,
];
let pior = 0;
for (const texto of PEDIDOS) {
  const tempos = [];
  let r;
  for (let k = 0; k < REPETICOES; k++) {
    const ini = performance.now();
    r = await encontrarPessoas(db, catalogo, { texto, usuario: conta });
    tempos.push(performance.now() - ini);
  }
  const mediana = tempos.sort((a, b) => a - b)[Math.floor(tempos.length / 2)];
  pior = Math.max(pior, mediana);
  console.log(`${Math.round(mediana).toString().padStart(6)} ms  "${texto}" → recorte ${r.funil.recorte.toLocaleString('pt-BR')}, pessoas ${r.funil.pessoas.toLocaleString('pt-BR')}, atendem ${r.funil.forte}, lacunas ${r.lacunas.total.toLocaleString('pt-BR')}`);
}
console.log(pior > 5000 ? `Acima de 5 s (${Math.round(pior)} ms): a melhoria de desempenho entra.` : `Abaixo de 5 s (pior mediana ${Math.round(pior)} ms): a melhoria de desempenho fica para quando a medição em produção pedir.`);
await db.close();
