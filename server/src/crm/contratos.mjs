import { z } from 'zod';

export const Id = z.string().uuid();
export const EmpresaId = z.string().regex(/^cnpj\d{8}$/);
export const Versao = z.number().int().min(0);
export const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
}, 'Informe uma data válida.');
export const hoje = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const ETAPAS = Object.freeze([
  { id: 'identificada', nome: 'Identificada' }, { id: 'qualificada', nome: 'Qualificada para abordagem' },
  { id: 'contatada', nome: 'Contatada' }, { id: 'conversa_realizada', nome: 'Conversa realizada' },
  { id: 'oportunidade_mandato', nome: 'Oportunidade de mandato' }, { id: 'proposta_enviada', nome: 'Proposta enviada' },
  { id: 'negociacao', nome: 'Negociação' }, { id: 'mandato_assinado', nome: 'Mandato assinado' },
  { id: 'nutricao', nome: 'Nutrição ou pausa' }, { id: 'perdida', nome: 'Perdida ou não contatar' },
]);
export const Etapa = z.enum(ETAPAS.map((e) => e.id));
export const Criacao = z.object({ id: Id, selecaoId: Id, titulo: z.string().trim().min(3).max(120),
  objetivo: z.string().trim().min(10).max(4000), proximaAcao: z.string().trim().min(3).max(2000), prazo: Data }).strict();
export const Atualizacao = z.object({ chave: Id, versao: Versao, titulo: z.string().trim().min(3).max(120),
  objetivo: z.string().trim().min(10).max(4000), proximaAcao: z.string().trim().min(3).max(2000), prazo: Data,
  responsavelId: Id, acaoConcluida: z.boolean() }).strict();
export const Atividade = z.object({ chave: Id, versao: Versao, etapa: Etapa.nullable().default(null),
  descricao: z.string().trim().min(10).max(4000), ocorridoEm: Data.refine((s) => s <= hoje(), 'Registre apenas eventos já ocorridos.'),
  canal: z.string().trim().max(120).default(''), participantes: z.string().trim().max(500).default(''),
  referencia: z.string().trim().max(1000).default(''), motivo: z.string().trim().max(500).default(''),
}).strict().superRefine((p, ctx) => {
  const falta = (campo, texto) => { if (p[campo].length < 3) ctx.addIssue({ code: 'custom', path: [campo], message: texto }); };
  if (p.etapa === 'contatada') { falta('canal', 'Informe o canal utilizado.'); falta('participantes', 'Informe quem foi contatado.'); }
  if (['qualificada', 'conversa_realizada', 'oportunidade_mandato'].includes(p.etapa)) falta('participantes', 'Informe o contato ou os participantes envolvidos.');
  if (['proposta_enviada','mandato_assinado'].includes(p.etapa)) falta('referencia', 'Identifique a proposta enviada ou o contrato assinado.');
  if (['nutricao','perdida'].includes(p.etapa)) falta('motivo', 'Registre o motivo da pausa ou perda.');
});
