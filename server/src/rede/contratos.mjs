import { z } from 'zod';

export const Id = z.string().uuid();
export const EmpresaId = z.string().regex(/^cnpj\d{8}$/);
export const Versao = z.number().int().min(0);

/* Senioridade descreve o CARGO, não a pessoa, e existe para uma pergunta só:
   quem decide sobre uma transação. A escala é curta de propósito — inventar
   degraus finos convidaria a discussões sobre rótulo em vez de sobre acesso. */
export const SENIORIDADES = Object.freeze([
  { id: 'conselho',  rotulo: 'Conselho ou controlador', peso: 5, lideranca: true },
  { id: 'ceo',       rotulo: 'CEO ou presidente',       peso: 5, lideranca: true },
  { id: 'cfo',       rotulo: 'CFO ou financeiro',       peso: 4, lideranca: true },
  { id: 'diretoria', rotulo: 'Diretoria',               peso: 3, lideranca: true },
  { id: 'gerencia',  rotulo: 'Gerência',                peso: 1, lideranca: false },
  { id: 'outro',     rotulo: 'Outro cargo',             peso: 0, lideranca: false },
]);
export const Senioridade = z.enum(SENIORIDADES.map((s) => s.id));
export const senioridadeDe = (id) => SENIORIDADES.find((s) => s.id === id) ?? SENIORIDADES.at(-1);

export const LADOS = Object.freeze([
  { id: 'ght4',    rotulo: 'GHT4',        descricao: 'Por onde um caminho começa.' },
  { id: 'mercado', rotulo: 'Empresa',     descricao: 'Onde um caminho termina: gente das empresas que a casa quer alcançar.' },
  { id: 'externo', rotulo: 'Intermediário', descricao: 'Quem faz a ponte sem ser da casa nem da empresa-alvo.' },
]);
export const Lado = z.enum(LADOS.map((l) => l.id));

/* O tipo explica o vínculo em palavras; quem pontua é a força. A separação é
   deliberada: quanto vale conhecer alguém é julgamento de quem conhece, não
   uma constante do programa. Mesmo princípio da régua de triagem. */
export const TIPOS_VINCULO = Object.freeze([
  { id: 'trabalharam_juntos', rotulo: 'Trabalharam juntos',  frase: 'trabalharam juntos' },
  { id: 'relacao_comercial',  rotulo: 'Relação comercial',   frase: 'têm relação comercial' },
  { id: 'conselho',           rotulo: 'Conselho comum',      frase: 'dividem ou dividiram conselho' },
  { id: 'formacao',           rotulo: 'Formação comum',      frase: 'vêm da mesma formação' },
  { id: 'indicacao',          rotulo: 'Indicação de terceiro', frase: 'chegam por indicação de terceiro' },
  { id: 'evento',             rotulo: 'Evento ou associação', frase: 'se conheceram em evento ou associação setorial' },
  { id: 'familiar',           rotulo: 'Familiar',            frase: 'têm relação familiar' },
  { id: 'outro',              rotulo: 'Outro',               frase: 'têm uma relação registrada' },
]);
export const TipoVinculo = z.enum(TIPOS_VINCULO.map((t) => t.id));
export const tipoDe = (id) => TIPOS_VINCULO.find((t) => t.id === id) ?? TIPOS_VINCULO.at(-1);

export const FORCAS = Object.freeze([
  { id: 'direta',   rotulo: 'Direta',   peso: 5, explicacao: 'Falam-se hoje; uma mensagem é suficiente.' },
  { id: 'indireta', rotulo: 'Indireta', peso: 3, explicacao: 'Conhecem-se, mas a aproximação pede contexto.' },
  { id: 'fraca',    rotulo: 'Fraca',    peso: 1, explicacao: 'Existe um ponto em comum, não um relacionamento.' },
]);
export const Forca = z.enum(FORCAS.map((f) => f.id));
export const forcaDe = (id) => FORCAS.find((f) => f.id === id) ?? FORCAS.at(-1);

/* As quatro respostas que o plano pede do titular, mais o estado inicial.
   `utilizavel: false` não apaga o vínculo — quem conhece alguém e não quer
   intermediar continua conhecendo, e registrar isso evita que a mesma pessoa
   seja procurada de novo daqui a um mês por outro analista. */
export const DISPOSICOES = Object.freeze([
  { id: 'posso_apresentar', rotulo: 'Posso avaliar uma apresentação', confirmada: true,  utilizavel: true,  ordem: 0 },
  { id: 'conheco',          rotulo: 'Conheço',                        confirmada: true,  utilizavel: true,  ordem: 1 },
  { id: 'nao_confirmado',   rotulo: 'Ainda não confirmado',           confirmada: false, utilizavel: true,  ordem: 2 },
  { id: 'nao_intermediar',  rotulo: 'Não quero intermediar',          confirmada: true,  utilizavel: false, ordem: 3 },
  { id: 'desatualizado',    rotulo: 'Informação desatualizada',       confirmada: false, utilizavel: false, ordem: 4 },
]);
export const Disposicao = z.enum(DISPOSICOES.map((d) => d.id));
export const disposicaoDe = (id) => DISPOSICOES.find((d) => d.id === id) ?? DISPOSICOES.find((d) => d.id === 'nao_confirmado');

/* As cinco categorias do plano de relações, na ordem em que se apresentam.
   São estados de confirmação, não probabilidades: o plano é explícito em não
   anunciar chance estatística de fechar negócio, e uma categoria que se lê é
   mais honesta e mais útil para decidir a quem ligar hoje. */
export const CATEGORIAS = Object.freeze([
  { id: 'introducao_viavel', rotulo: 'Introdução viável', ordem: 0,
    descricao: 'O titular confirmou a relação e aceita avaliar a apresentação.' },
  { id: 'relacao_confirmada', rotulo: 'Relação confirmada', ordem: 1,
    descricao: 'Conhecimento declarado em todas as ligações; a disponibilidade da apresentação ainda não foi respondida.' },
  { id: 'a_confirmar', rotulo: 'Vínculo profissional a confirmar', ordem: 2,
    descricao: 'Há evidência registrada, mas alguma ligação ainda não foi confirmada pelo titular.' },
  { id: 'incompleto', rotulo: 'Caminho incompleto', ordem: 3,
    descricao: 'Alguma ligação necessária está desatualizada ou o titular não quer intermediar. O caminho existe e não é oferecido.' },
]);
export const categoriaDe = (id) => CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS.at(-1);

/* O caminho herda a fragilidade da ligação menos comprovada — palavras do
   plano. Por isso a categoria sai da PIOR ligação da cadeia, nunca da melhor. */
export function categoriaDoCaminho(disposicoes) {
  if (!disposicoes.length) return 'incompleto';
  const piores = disposicoes.map(disposicaoDe);
  if (piores.some((d) => !d.utilizavel)) return 'incompleto';
  if (piores.some((d) => !d.confirmada)) return 'a_confirmar';
  return piores.every((d) => d.id === 'posso_apresentar') ? 'introducao_viavel' : 'relacao_confirmada';
}

/* Um vínculo confirmado há pouco vale mais do que um vínculo antigo, porque o
   que envelhece aqui não é o fato de terem se conhecido — é a chance de a
   ligação ser bem recebida. Dezoito meses é a janela adotada, e o resultado
   sempre mostra a data para quem quiser discordar dela. */
export const MESES_CONFIRMACAO = 18;

/* Até duas ligações entre pessoas, como o plano determina. Cada salto a mais
   multiplica o número de suposições e, na prática, ninguém liga para um
   conhecido de um conhecido de um conhecido pedindo apresentação. */
export const MAXIMO_LIGACOES = 2;
export const CAMINHOS_EXIBIDOS = 3;

/** Mesma normalização do módulo de conexões da interface: acentos fora, caixa baixa. */
export const normalizar = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const Texto = (min, max) => z.string().trim().min(min).max(max);
const Opcional = (max) => z.string().trim().max(max).default('');
const Contato = z.string().trim().max(200).nullable().default(null);

export const PessoaBase = z.object({
  id: Id,
  lado: Lado,
  nome: Texto(2, 120),
  cargo: Opcional(120),
  senioridade: Senioridade.default('outro'),
  organizacao: Opcional(160),
  empresaId: EmpresaId.nullable().default(null),
  usuarioId: Id.nullable().default(null),
  email: Contato, telefone: Contato, linkedin: Contato,
  observacoes: Opcional(2000),
}).strict();

/* `PessoaBase` fica exposta porque as rotas de edição precisam de `.omit()`,
   que o refinamento não oferece: um schema refinado deixa de ser objeto. */
export const Pessoa = PessoaBase.superRefine((p, ctx) => {
  /* Uma pessoa do mercado sem organização não é localizável por empresa nenhuma,
     e entraria na base como registro órfão que ninguém encontra depois. */
  if (p.lado === 'mercado' && !p.organizacao && !p.empresaId) {
    ctx.addIssue({ code: 'custom', path: ['organizacao'], message: 'Informe a empresa desta pessoa, ou vincule-a a uma empresa do catálogo.' });
  }
  if (p.lado === 'ght4' && p.empresaId) {
    ctx.addIssue({ code: 'custom', path: ['empresaId'], message: 'Empresa do catálogo é para pessoas do mercado.' });
  }
});

export const Vinculo = z.object({
  id: Id,
  pessoaAId: Id,
  pessoaBId: Id,
  tipo: TipoVinculo,
  forca: Forca,
  periodo: Opcional(120),
  evidencia: Texto(10, 2000),
  disposicao: Disposicao.default('nao_confirmado'),
}).strict();
