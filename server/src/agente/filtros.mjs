import { z } from 'zod';
export const FiltrosBusca=z.object({
  frente:z.enum(['compra','venda']).default('venda'),busca:z.string().trim().max(120).default(''),
  uf:z.string().regex(/^$|^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/).default(''),
  cnae:z.string().regex(/^$|^\d{7}$/).default(''),incluirPossiveis:z.boolean().default(false),
}).strict();
export const filtrosDoContexto=c=>FiltrosBusca.parse(Object.fromEntries(Object.keys(FiltrosBusca.shape).map(k=>[k,c[k]])));
export const ReferenciaModelo=z.object({id:z.string().uuid(),versao:z.number().int().min(1),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
