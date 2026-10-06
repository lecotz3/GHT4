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

function resultado(estado, anterior = null, atual = null, mudancas = null) {
  return {
    estado,
    empresaId: anterior?.id ?? null,
    referencias: { anterior: anterior?.referencia ?? null, atual: atual?.referencia ?? null },
    anterior,
    atual,
    mudancas,
  };
}

const normalizar = (valor) => valor?.normalize('NFC').trim().replace(/\s+/gu, ' ') || null;

function comparar(anterior, atual) {
  // Ausencia no recorte publicado nao significa encerramento da empresa.
  if (atual === null) return resultado('empresa_nao_encontrada', anterior);
  const validado = Cadastro.safeParse(atual);
  if (!validado.success || validado.data.id !== anterior.id) {
    return resultado('catalogo_resposta_invalida', anterior);
  }
  atual = projetar(validado.data);
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
  const validado = Cadastro.safeParse(anterior);
  if (!validado.success) return resultado('historico_invalido');
  return comparar(projetar(validado.data), atual);
}

/** Historico autorizado pelo chamador; politica sincrona classifica falhas esperadas. */
export async function compararCadastroAtual(anterior, { catalogo, ehIndisponibilidade } = {}) {
  const validado = Cadastro.safeParse(anterior);
  if (!validado.success) return resultado('historico_invalido');
  const salvo = projetar(validado.data);
  if (typeof catalogo?.obter !== 'function') throw new TypeError('Informe um catalogo com obter(id).');
  if (ehIndisponibilidade !== undefined && typeof ehIndisponibilidade !== 'function') {
    throw new TypeError('ehIndisponibilidade deve ser uma funcao sincrona.');
  }
  let recebido;
  try {
    recebido = await catalogo.obter(salvo.id);
  } catch (erro) {
    if (ehIndisponibilidade?.(erro) === true) return resultado('catalogo_indisponivel', salvo);
    throw erro;
  }
  return comparar(salvo, recebido);
}
