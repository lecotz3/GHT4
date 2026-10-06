import { z } from 'zod';
import { EmpresaId } from '../crm/contratos.mjs';
import { ESTADOS } from '../../../packages/domain/classificacao.mjs';

const CAMPOS = [
  ['nome', 'cadastro'],
  ['razaoSocial', 'cadastro'],
  ['cidade', 'cadastro'],
  ['uf', 'cadastro'],
  ['cnaePrincipal', 'cadastro'],
  ['estado', 'enquadramento'],
];
const Texto = z.string().max(500).refine((s) => !s.includes('\0')).nullish();
const Referencia = z.union([z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), z.literal('')]).nullish();
const Cadastro = z.object({
  id: EmpresaId,
  cnpjRaiz: z.string().regex(/^\d{8}$/).nullish(),
  nome: Texto,
  razaoSocial: Texto,
  cidade: Texto,
  uf: z.string().regex(/^(?:[A-Z]{2})?$/).nullish(),
  cnaePrincipal: z.string().regex(/^(?:\d{7})?$/).nullish(),
  estado: z.enum([...ESTADOS, '']).nullish(),
  referencia: Referencia,
}).refine((c) => c.cnpjRaiz == null || c.cnpjRaiz === c.id.slice(4), {
  path: ['cnpjRaiz'], message: 'A raiz do CNPJ deve corresponder ao identificador.',
});

function projetar(cadastro) {
  return {
    id: cadastro.id,
    cnpjRaiz: cadastro.cnpjRaiz ?? cadastro.id.slice(4),
    referencia: cadastro.referencia || null,
    ...Object.fromEntries(CAMPOS.map(([campo]) => [campo, cadastro[campo] ?? null])),
  };
}

function resultado(estado, anterior, atual = null, mudancas = null) {
  return {
    estado,
    empresaId: anterior.id,
    referencias: { anterior: anterior.referencia, atual: atual?.referencia ?? null },
    anterior,
    atual,
    mudancas,
  };
}

const normalizar = (valor) => valor?.normalize('NFC').trim().replace(/\s+/gu, ' ') || null;

function comparar(anterior, atual) {
  if (atual === null) return resultado('empresa_nao_encontrada', anterior);
  if (anterior.id !== atual.id) throw new TypeError('Compare cadastros da mesma empresa.');
  if (anterior.referencia && atual.referencia && atual.referencia < anterior.referencia) {
    return resultado('referencia_atual_mais_antiga', anterior, atual);
  }
  const mudancas = CAMPOS.flatMap(([campo, grupo]) => {
    const antes = normalizar(anterior[campo]);
    const depois = normalizar(atual[campo]);
    if (antes === depois) return [];
    return [{
      campo, grupo, anterior: anterior[campo], atual: atual[campo],
      tipo: antes === null ? 'preenchido' : depois === null ? 'nao_informado' : 'alterado',
    }];
  });
  return resultado('comparado', anterior, atual, mudancas);
}

/** Compara sem modificar/persistir o historico nem inferir eventos societarios. */
export function compararCadastro(anterior, atual) {
  const salvo = projetar(Cadastro.parse(anterior));
  const vigente = atual === null ? null : projetar(Cadastro.parse(atual));
  return comparar(salvo, vigente);
}

/** O chamador deve obter o historico autorizado antes de consultar o catalogo. */
export async function compararCadastroAtual(anterior, { catalogo } = {}) {
  const salvo = projetar(Cadastro.parse(anterior));
  if (typeof catalogo?.obter !== 'function') throw new TypeError('Informe um catalogo com obter(id).');
  let recebido;
  try {
    recebido = await catalogo.obter(salvo.id);
  } catch {
    return resultado('catalogo_indisponivel', salvo);
  }
  if (recebido === null) return comparar(salvo, null);
  const validado = Cadastro.safeParse(recebido);
  if (!validado.success || validado.data.id !== salvo.id) {
    return resultado('catalogo_indisponivel', salvo);
  }
  return comparar(salvo, projetar(validado.data));
}
