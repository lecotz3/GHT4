import { z } from 'zod';
import { subsetoresAcionaveis } from '../../../packages/domain/taxonomia.mjs';
/* Setores-alvo: os subsetores químicos com alvo de boutique declarados na taxonomia (sem os de
   contexto, como petroquímica básica). A base nacional já traz o setor inteiro; o escopo é este. */
export const SUBSETORES_ALVO=subsetoresAcionaveis().map(s=>s.rotulo);
export const TODOS_SUBSETORES='todos';
/** Um subsetor acionável ou `todos`. Opcional e sem padrão: modelos salvos antes mantêm a mesma forma. */
export const Subsetor=z.enum([TODOS_SUBSETORES,...SUBSETORES_ALVO]);
export const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
/** Uma ou mais UFs separadas por vírgula ("RJ,SP"). Normalizada em ordem alfabética e sem repetição,
 *  para que o mesmo recorte tenha sempre a mesma representação (comparação de modelos e hashes). */
export const ListaUf=z.string().transform(s=>[...new Set(s.split(',').map(u=>u.trim().toUpperCase()).filter(Boolean))].sort().join(','))
  .refine(s=>!s || s.split(',').every(u=>UFS.includes(u)),'UF inválida.');
export const FiltrosBusca=z.object({
  frente:z.enum(['compra','venda']).default('venda'),busca:z.string().trim().max(120).default(''),
  uf:ListaUf.default(''),
  // Município exato, comparado sem acento e sem caixa. Diferente de `busca`, não procura em nome nem CNPJ.
  municipio:z.string().trim().max(80).default(''),
  cnae:z.string().regex(/^$|^\d{7}$/).default(''),incluirPossiveis:z.boolean().default(false),
  // Só empresas com evento societário detectado nos últimos 12 meses (diferença entre meses do CNPJ).
  comEvento:z.boolean().default(false),
  /* 'prioridade' ordena por critérios em sequência, todos visíveis no resultado: evento societário
     recente, relação confirmada na rede, pessoas mapeadas e, por fim, a ordem de enquadramento. */
  ordem:z.enum(['enquadramento','prioridade']).default('enquadramento'),
  // Ausente: todos os subsetores acionáveis (setores-alvo).
  subsetor:Subsetor.optional(),
}).strict();
// Só as chaves presentes: `subsetor` ausente continua ausente (e não `undefined`, que a reserva gravada perderia).
export const filtrosDoContexto=c=>FiltrosBusca.parse(Object.fromEntries(Object.keys(FiltrosBusca.shape).filter(k=>c[k]!==undefined).map(k=>[k,c[k]])));
export const ReferenciaModelo=z.object({id:z.string().uuid(),versao:z.number().int().min(1),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
/** Mesma normalização usada no SQL (`translate` + `lower`) para comparar município. */
export const normalizarMunicipio=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
