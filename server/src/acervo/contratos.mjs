import { z } from 'zod';
import { Data } from '../crm/contratos.mjs';
import { urlPublica } from '../agente/provedor.mjs';
const c = (id, rotulo, tipo = 'texto', opcoes) => ({ id, rotulo, tipo, ...(opcoes ? { opcoes } : {}) });
const fonte = [c('titulo','Título'), c('fonte','Fonte ou documento'), c('referencia','Página, trecho ou referência'), c('data','Data da informação','data')];
export const FORMULARIOS = {
  evidencia: { titulo: 'Evidência da empresa', campos: [...fonte,
    c('campo','Informação','opcao',['atividade','receita','ebitda','funcionarios','controle','produtos','geografia']),
    c('estado','Natureza da informação','opcao',['reportado','estimado','inferido','ausente']),
    c('descricao','Fato, hipótese ou motivo da ausência','longo'), c('valor','Valor numérico, quando aplicável','numero'),
    c('unidade','Unidade (ex.: BRL milhões, pessoas)'), c('periodo','Período (ex.: exercício 2025)'), c('url','URL pública (opcional)')] },
  relacao: { titulo: 'Relação autorizada', campos: [...fonte, c('pessoa','Nome'), c('cargo','Cargo e organização'),
    c('vinculo','Relação com a empresa','longo'), c('confirmacao','Confirmação','opcao',['a_confirmar','confirmada']),
    c('autorizacao','Origem autorizada e limites de uso','longo'), c('email','E-mail (acesso restrito)'), c('telefone','Telefone (acesso restrito)')] },
  tese: { titulo: 'Tese e perfil para contrapartes', campos: [...fonte,
    c('papel','Papel na transação','opcao',['comprador','alvo']), c('mandato','Vínculo comercial','opcao',['prospect','cliente_compra','cliente_venda','contraparte']),
    c('descricao','Tese e justificativa','longo'), c('produtos','Produtos e aplicações, separados por vírgula'),
    c('regioes','Regiões ou UFs, separadas por vírgula'), c('receitaMin','Receita mínima / da companhia (BRL milhões)','numero'),
    c('receitaMax','Receita máxima / da companhia (BRL milhões)','numero'), c('controle','Controle pretendido ou disponível','opcao',['majoritario','minoritario','indiferente','nao_apurado'])] },
  comparavel: { titulo: 'Comparável ou transação precedente', campos: [...fonte,
    c('tipo','Tipo','opcao',['companhia_aberta','transacao']), c('empresa','Empresa ou ativo'), c('segmento','Subsegmento'),
    c('ev','Enterprise value (BRL milhões)','numero'), c('receita','Receita (BRL milhões)','numero'), c('ebitda','EBITDA (BRL milhões)','numero'),
    c('periodo','Período das métricas'), c('descricao','Ajustes, participação, dívida e limitações','longo'), c('licenca','Direito de uso / licença da fonte')] },
  noticia: { titulo: 'Notícia ou evento corporativo', campos: [...fonte, c('evento','Tipo de evento','opcao',['aquisicao','expansao','resultado','fornecedor','regulatorio','outro']),
    c('descricao','O que aconteceu e por que investigar','longo'), c('url','URL pública'), c('publicadaEm','Data de publicação','data')] },
  passagem: { titulo: 'Passagem para execução do mandato', campos: [...fonte, c('contrato','Contrato assinado e versão'), c('escopo','Escopo contratado','longo'),
    c('equipe','Equipe responsável'), c('pendencias','Documentos e decisões pendentes','longo'), c('marco','Próximo marco e responsável','longo'), c('prazo','Data do próximo marco','data')] },
};
const texto = z.string().trim().max(4000);
const numero = z.preprocess((v) => v === '' || v == null ? null : typeof v === 'string' ? Number(v) : v, z.number().finite().min(-1e9).max(1e9).nullable());
export function validarRegistro(tipo, dados) {
  const f = FORMULARIOS[tipo];
  if (!f) throw new Error('tipo_invalido');
  const shape = Object.fromEntries(f.campos.map((c) => [c.id, c.tipo === 'numero' ? numero : c.tipo === 'opcao' ? z.enum(c.opcoes) : c.tipo === 'data' ? Data : texto]));
  const schema = z.object(shape).strict().superRefine((p, ctx) => {
    const erro = (campo,mensagem) => ctx.addIssue({ code:'custom',path:[campo],message:mensagem });
    for (const chave of ['titulo','fonte','referencia']) if (p[chave].length < 3) erro(chave,'Informe pelo menos 3 caracteres.');
    for (const chave of ['descricao','autorizacao','vinculo','escopo','contrato','equipe','pendencias','marco','licenca','pessoa','cargo','empresa','segmento']) {
      if (chave in p && p[chave].length < 3) erro(chave,'Este campo precisa ser preenchido.');
    }
    if (p.url && !urlPublica(p.url)) erro('url','Use um endereço público HTTP ou HTTPS.');
    if (tipo === 'noticia' && !p.url) erro('url','Identifique a notícia original.');
    if (tipo === 'evidencia') {
      if (p.campo !== 'ebitda' && p.valor !== null && p.valor < 0) erro('valor','Este campo não aceita número negativo.');
      if (p.estado === 'ausente' && p.valor !== null) erro('valor','Ausência não pode conter valor.');
      if (['receita','ebitda','funcionarios'].includes(p.campo) && p.estado !== 'ausente' && p.valor === null) erro('valor','Informe o valor ou marque como ausente.');
      if (p.valor !== null && (!p.unidade || !p.periodo)) erro('unidade','Todo número exige unidade e período.');
    }
    if (tipo === 'tese' && p.receitaMin !== null && p.receitaMax !== null && p.receitaMin > p.receitaMax) erro('receitaMax','O teto não pode ser menor que o piso.');
    for (const campo of ['receitaMin','receitaMax','ev','receita']) if (p[campo] != null && p[campo] < 0) erro(campo,'Este campo não aceita número negativo.');
    if (tipo === 'comparavel' && !p.periodo) erro('periodo','Informe o período das métricas.');
    if (tipo === 'relacao' && p.email && !z.string().email().safeParse(p.email).success) erro('email','E-mail inválido.');
  });
  return schema.parse(dados);
}
export const permissaoDe = (tipo, escrita = false, revisao = false) => tipo === 'relacao' ? escrita ? 'rede.editar' : 'rede.ler'
  : tipo === 'comparavel' ? escrita ? 'valuation.revisar' : 'valuation.ler'
    : tipo === 'passagem' || revisao ? escrita ? 'crm.mover' : 'crm.ler' : escrita ? 'crm.editar' : 'crm.ler';
