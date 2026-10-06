import { z } from 'zod';
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
}).strict();
export const filtrosDoContexto=c=>FiltrosBusca.parse(Object.fromEntries(Object.keys(FiltrosBusca.shape).map(k=>[k,c[k]])));
export const ReferenciaModelo=z.object({id:z.string().uuid(),versao:z.number().int().min(1),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
/** Mesma normalização usada no SQL (`translate` + `lower`) para comparar município. */
export const normalizarMunicipio=s=>String(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
