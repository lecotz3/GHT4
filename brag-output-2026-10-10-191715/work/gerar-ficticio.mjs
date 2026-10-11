// Catálogo e quadro societário fictícios para o vídeo: a estrutura é a real (cidades, naturezas,
// datas, contagens de sócios, qualificações), mas nomes, CNPJs e contatos são inventados. Assim os
// números da tela batem com a produção e nenhuma empresa ou pessoa real aparece no vídeo.
//   node gerar-ficticio.mjs  →  work/data-ficticio.js e work/quadro-ficticio.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = 'C:/Users/Leonardo/GHT4';
const { lerFonteCatalogo } = await import('file:///C:/Users/Leonardo/GHT4/server/src/agente/catalogo.mjs');
const { qualificacao, estatutaria, socioAdministradorDeLimitada } = await import('file:///C:/Users/Leonardo/GHT4/server/src/rede/qualificacoes.mjs');

let semente = 0x2f6a1c3d;
const rnd = () => { semente |= 0; semente = (semente + 0x6d2b79f5) | 0; let t = Math.imul(semente ^ (semente >>> 15), 1 | semente); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const um = (lista) => lista[Math.floor(rnd() * lista.length)];

const PREFIXOS = ['Alquimi', 'Aquar', 'Brasquim', 'Cristal', 'Delta', 'Ecoquim', 'Ferrox', 'Fluor', 'Geoquim', 'Isoquim', 'Lumen', 'Nativa', 'Neoquim', 'Orbital', 'Poliquim', 'Prisma', 'Quimi', 'Resin', 'Sigmaquim', 'Solven',
  'Terraquim', 'Vertex', 'Ômega', 'Atlas', 'Boreal', 'Cobal', 'Duna', 'Estrel', 'Fênix', 'Granit', 'Horiz', 'Íris', 'Jade', 'Kron', 'Lira', 'Mercur', 'Nimbu', 'Opal', 'Pampa', 'Rubi'];
const SUFIXOS = ['brás', 'vale', 'sul', 'norte', 'tec', 'flex', 'mix', 'lab', 'plus', 'chem', 'nova', 'forte', 'real', 'vita', 'campo', 'serra', 'mar', 'rio', 'lux', 'max', 'som', 'bel', 'via', 'zon', 'tra'];
const COMPLEMENTOS = ['', 'Química', 'Distribuidora', 'Brasil', 'Paulista', 'Industrial', 'Comercial', 'Trading', 'do Sul', 'Nordeste', 'Minas', 'Paraná', 'Sudeste', 'Global', 'Química Fina', 'Insumos', 'Aditivos', 'Solventes', 'Resinas', 'Polímeros',
  'Especialidades', 'Agro', 'Gases', 'Tintas', 'Têxtil', 'Pharma', 'Cosméticos', 'Óleos', 'Lubrificantes', 'Fertilizantes', 'Embalagens', 'Ambiental', 'Logística', 'Atacado', 'Importadora', 'Exportadora', 'Laboratórios', 'Tecnologia', 'Serviços', 'Participações'];
// Todas as combinações, embaralhadas: cada empresa recebe uma diferente.
const NOMES_EMPRESA = PREFIXOS.flatMap((p) => SUFIXOS.flatMap((s) => COMPLEMENTOS.map((c) => `${p}${s}${c ? ` ${c}` : ''}`)));
for (let i = NOMES_EMPRESA.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [NOMES_EMPRESA[i], NOMES_EMPRESA[j]] = [NOMES_EMPRESA[j], NOMES_EMPRESA[i]]; }
const NOMES = ['Ana', 'Beatriz', 'Camila', 'Carla', 'Clara', 'Daniela', 'Elisa', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Juliana', 'Laura', 'Luiza', 'Marina', 'Patrícia', 'Renata', 'Sofia', 'Tatiana', 'Vanessa',
  'André', 'Bruno', 'Caio', 'Daniel', 'Eduardo', 'Felipe', 'Gustavo', 'Henrique', 'Igor', 'João', 'Leonardo', 'Lucas', 'Marcelo', 'Mateus', 'Otávio', 'Paulo', 'Rafael', 'Rodrigo', 'Thiago', 'Vinícius'];
const SOBRENOMES = ['Almeida', 'Amaral', 'Barros', 'Bastos', 'Campos', 'Cardoso', 'Castro', 'Correia', 'Costa', 'Cunha', 'Dias', 'Duarte', 'Farias', 'Fonseca', 'Freitas', 'Gomes', 'Lacerda', 'Lima', 'Lopes', 'Machado',
  'Martins', 'Medeiros', 'Moraes', 'Moreira', 'Nogueira', 'Pacheco', 'Peixoto', 'Pires', 'Prado', 'Queiroz', 'Ramos', 'Rezende', 'Rocha', 'Sampaio', 'Siqueira', 'Teixeira', 'Valente', 'Vieira', 'Xavier', 'Torres'];

const texto = readFileSync(join(RAIZ, 'data-quimicos.js'), 'utf8');
const cat = lerFonteCatalogo(texto);
const col = (n) => cat.colunas.indexOf(n);
const [iId, iNome, iRazao, iRaiz, iContato, iNat] = ['id', 'nome', 'razaoSocial', 'cnpjRaiz', 'contato', 'naturezaJuridica'].map(col);

const usados = new Set();
const novoId = new Map();
const natureza = new Map();
if (NOMES_EMPRESA.length < cat.linhas.length) throw new Error('Poucos nomes fictícios para o catálogo.');
const linhas = cat.linhas.map((l, k) => {
  const r = [...l];
  let raiz;
  do raiz = '99' + String(Math.floor(rnd() * 1e6)).padStart(6, '0'); while (usados.has(raiz));
  usados.add(raiz);
  const fantasia = NOMES_EMPRESA[k];
  const sa = ['2054', '2046'].includes(l[iNat]);
  novoId.set(l[iId], 'cnpj' + raiz);
  natureza.set(l[iId], l[iNat]);
  r[iId] = 'cnpj' + raiz; r[iRaiz] = raiz; r[iNome] = fantasia;
  r[iRazao] = `${fantasia} ${sa ? 'S.A.' : 'Ltda'}`;
  r[iContato] = null; // sem e-mail: nada de domínio real, e a pesquisa não lê site de ninguém
  return r;
});
const corpo = `const COLUNAS_QUIMICOS = ${JSON.stringify(cat.colunas)};\nconst LINHAS_QUIMICOS = [\n${linhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\nconst REFERENCIA_QUIMICOS = ${JSON.stringify(cat.referencia)};\n`;
writeFileSync(join(aqui, 'data-ficticio.js'), corpo);

// O quadro: a mesma estrutura do recorte da casa (estatutários e sócio-administrador das limitadas).
const q = lerFonteCatalogo(readFileSync(join(RAIZ, '.cache/quadro-societario-2026-08.js'), 'utf8'));
const [qId, qSocios] = ['id', 'socios'].map((n) => q.colunas.indexOf(n));
const nomeDe = new Map(linhas.map((l) => [l[iId], l[iNome]]));
const pessoas = [];
const nomesNaEmpresa = new Set();
for (const l of q.linhas) {
  const id = novoId.get(l[qId]); if (!id) continue;
  for (const s of l[qSocios] ?? []) {
    if (s.tipo !== 'fisica') continue;
    if (!estatutaria(s.qualificacao) && !socioAdministradorDeLimitada(s.qualificacao, natureza.get(l[qId]))) continue;
    let nome;
    do nome = `${um(NOMES)} ${um(SOBRENOMES)} ${um(SOBRENOMES)}`; while (nomesNaEmpresa.has(id + nome));
    nomesNaEmpresa.add(id + nome);
    const qu = qualificacao(s.qualificacao);
    pessoas.push({ nome, cargo: qu.cargo, senioridade: qu.senioridade, empresaId: id, organizacao: nomeDe.get(id),
      referencia: [`RFB CNPJ ${q.referencia}`, `qualificação ${String(s.qualificacao).padStart(2, '0')}`, s.entrada ? `no quadro desde ${s.entrada}` : null].filter(Boolean).join(' · ') });
  }
}
writeFileSync(join(aqui, 'quadro-ficticio.json'), JSON.stringify(pessoas));
console.log(`catálogo: ${linhas.length} empresas · quadro: ${pessoas.length} pessoas em ${new Set(pessoas.map((p) => p.empresaId)).size} empresas`);
