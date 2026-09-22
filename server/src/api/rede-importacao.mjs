import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ErroHttp } from '../app.mjs';
import { registrar } from '../auditoria/registrar.mjs';
import { Id, Pessoa, normalizar } from '../rede/contratos.mjs';
import { alterarRede } from '../rede/estado.mjs';

const Linha = z.object({
  nome: z.string().trim().min(2).max(120),
  cargo: z.string().trim().max(120).default(''),
  organizacao: z.string().trim().max(160).default(''),
  empresaId: z.string().regex(/^cnpj\d{8}$/).nullable().default(null),
  email: z.union([z.string().email().max(200), z.literal('')]).default(''),
  telefone: z.string().trim().max(200).default(''),
  linkedin: z.union([z.string().url().max(200).refine((v) => /^https?:\/\//i.test(v)), z.literal('')]).default(''),
  evidencia: z.string().trim().min(10).max(2000),
  acao: z.enum(['nova', 'existente', 'ignorar']).default('nova'),
  pessoaId: Id.optional(),
  identidadeRevisada: z.boolean().default(false),
}).strict();
const Lote = z.object({
  id: Id, pessoaGht4Id: Id, fonte: z.string().trim().min(3).max(160),
  autorizacao: z.string().trim().min(10).max(1000),
  compartilhado: z.literal(true), linhas: z.array(Linha).min(1).max(500),
}).strict();
const hashDe = (p) => createHash('sha256').update(JSON.stringify({ ...p, id: undefined })).digest('hex');

async function conferir(tx, p) {
  const titular = (await tx.query("SELECT id,nome FROM rede_pessoas WHERE id=$1 AND lado='ght4' AND ativo", [p.pessoaGht4Id])).rows[0];
  if (!titular) throw new ErroHttp(422, 'titular_necessario', 'Escolha uma pessoa ativa da GHT4 como titular dos contatos.');
  const vistos = new Set();
  const linhas = [];
  const encontrados = (await tx.query(`SELECT id,nome,nome_normalizado,cargo,organizacao,lado,email,linkedin,versao FROM rede_pessoas
    WHERE ativo AND (nome_normalizado=ANY($1::text[]) OR lower(email)=ANY($2::text[]) OR linkedin=ANY($3::text[])) ORDER BY nome,id`,
  [p.linhas.map(l=>normalizar(l.nome)),p.linhas.map(l=>l.email.toLowerCase()).filter(Boolean),p.linhas.map(l=>l.linkedin).filter(Boolean)])).rows;
  for (const [indice, l] of p.linhas.entries()) {
    const chave = [normalizar(l.nome), normalizar(l.organizacao), l.email.toLowerCase()].join('|');
    const repetida = vistos.has(chave);
    if(l.acao!=='ignorar')vistos.add(chave);
    const candidatos = encontrados.filter(c=>c.nome_normalizado===normalizar(l.nome)
      || (l.email && c.email?.toLowerCase()===l.email.toLowerCase()) || (l.linkedin && c.linkedin===l.linkedin))
      .slice(0,21).map(({id,nome,cargo,organizacao,lado})=>({id,nome,cargo,organizacao,lado}));
    let erro = repetida && l.acao !== 'ignorar' ? 'Linha repetida no arquivo. Ignore a repetição.' : null;
    if (l.acao === 'nova' && candidatos.length && !l.identidadeRevisada) erro = 'Confirme que se trata de outra pessoa ou escolha um cadastro existente.';
    if (l.acao === 'existente' && !candidatos.some((c) => c.id === l.pessoaId && c.lado !== 'ght4')) {
      erro = 'Selecione uma das pessoas encontradas, ou cadastre uma pessoa distinta.';
    }
    linhas.push({ indice, nome: l.nome, organizacao: l.organizacao, candidatos, erro,
      aviso: candidatos.length ? 'Confira a identidade. Nome igual não confirma que seja a mesma pessoa.' : null });
  }
  const hash=createHash('sha256').update(JSON.stringify([hashDe(p),encontrados.map(c=>[c.id,c.versao])])).digest('hex');
  return { titular, linhas, hash, selecionadas: p.linhas.filter((l) => l.acao !== 'ignorar').length };
}

export async function registrarImportacaoRede(app) {
  const { db } = app;
  app.post('/api/rede/importacoes/previa', async (req, res) => {
    req.exigir('rede.editar');
    const p = Lote.parse(req.body);
    res.header('Cache-Control', 'no-store');
    return conferir(db, p);
  });
  app.get('/api/rede/importacoes', async (req, res) => {
    const u = req.exigir('rede.ler');
    res.header('Cache-Control', 'no-store');
    return { lotes: (await db.query(`SELECT l.id,l.fonte,l.criado_em,l.retirado_em,p.nome AS titular,
      (SELECT count(*)::int FROM rede_pessoas WHERE lote_id=l.id) AS pessoas,
      (SELECT count(*)::int FROM rede_vinculos WHERE lote_id=l.id) AS vinculos
      FROM rede_lotes l JOIN rede_pessoas p ON p.id=l.pessoa_ght4_id
      WHERE $1 OR p.usuario_id=$2 ORDER BY l.criado_em DESC LIMIT 100`,
    [['admin','socio'].includes(u.papel), u.id])).rows };
  });
  app.post('/api/rede/importacoes', async (req, res) => {
    const u = req.exigir('rede.editar');
    const { previaHash, ...corpo } = z.object({ ...Lote.shape, previaHash: z.string().length(64) }).strict().parse(req.body);
    const conteudoHash=hashDe(corpo);
    const resultado = await db.transaction(async (tx) => {
      await alterarRede(tx);
      const anterior = (await tx.query('SELECT id,conteudo_hash,retirado_em FROM rede_lotes WHERE id=$1 OR (pessoa_ght4_id=$2 AND conteudo_hash=$3)',
        [corpo.id, corpo.pessoaGht4Id, conteudoHash])).rows[0];
      if (anterior) {
        if (anterior.retirado_em || anterior.conteudo_hash !== conteudoHash) throw new ErroHttp(409, 'lote_existente', 'Lote já utilizado ou retirado. Prepare uma nova seleção.');
        return { id: anterior.id, repetido: true };
      }
      const previa = await conferir(tx, corpo);
      if(previa.hash!==previaHash)throw new ErroHttp(409,'previa_alterada','A seleção ou os cadastros mudaram. Confira novamente a prévia antes de importar.');
      if (!previa.selecionadas || previa.linhas.some((l) => l.erro)) throw new ErroHttp(422, 'revisao_necessaria', 'Corrija a prévia e selecione pelo menos um contato.');
      await tx.query('INSERT INTO rede_lotes(id,pessoa_ght4_id,fonte,autorizacao,conteudo_hash,criado_por) VALUES ($1,$2,$3,$4,$5,$6)',
        [corpo.id, corpo.pessoaGht4Id, corpo.fonte, corpo.autorizacao, conteudoHash, u.id]);
      const novas=[],ligacoes=[];
      for (const l of corpo.linhas) {
        if (l.acao === 'ignorar') continue;
        let pessoaId = l.pessoaId;
        if (l.acao === 'nova') {
          const p = Pessoa.parse({ nome:l.nome, cargo:l.cargo, organizacao:l.organizacao, empresaId:l.empresaId,
            id: randomUUID(), lado: l.organizacao || l.empresaId ? 'mercado' : 'externo',
            senioridade: 'outro', email: l.email || null, telefone: l.telefone || null, linkedin: l.linkedin || null,
          });
          pessoaId = p.id;
          novas.push({...p,nome_normalizado:normalizar(p.nome),organizacao_normalizada:normalizar(p.organizacao)});
        }
        const [a,b] = [corpo.pessoaGht4Id,pessoaId].sort();
        ligacoes.push({id:randomUUID(),a,b,evidencia:l.evidencia});
      }
      // Duas gravações por lote, sem uma ida ao banco remoto para cada contato.
      if(novas.length)await tx.query(`INSERT INTO rede_pessoas(id,lado,nome,nome_normalizado,cargo,organizacao,organizacao_normalizada,
        empresa_id,email,telefone,linkedin,criado_por,origem,origem_referencia,lote_id)
        SELECT p.id,p.lado,p.nome,p.nome_normalizado,p.cargo,p.organizacao,p.organizacao_normalizada,p."empresaId",p.email,p.telefone,p.linkedin,$2,'importacao',$3,$4
        FROM jsonb_to_recordset($1::jsonb) AS p(id uuid,lado text,nome text,nome_normalizado text,cargo text,organizacao text,organizacao_normalizada text,"empresaId" text,email text,telefone text,linkedin text)`,
      [JSON.stringify(novas),u.id,corpo.fonte,corpo.id]);
      // A importação nunca confirma o vínculo nem sobrescreve uma resposta humana.
      const gravadas=await tx.query(`INSERT INTO rede_vinculos(id,pessoa_a_id,pessoa_b_id,tipo,forca,evidencia,criado_por,lote_id)
        SELECT v.id,v.a,v.b,'outro','fraca',v.evidencia,$2,$3 FROM jsonb_to_recordset($1::jsonb) AS v(id uuid,a uuid,b uuid,evidencia text)
        ON CONFLICT (pessoa_a_id,pessoa_b_id,tipo) DO NOTHING RETURNING id`,[JSON.stringify(ligacoes),u.id,corpo.id]);
      const pessoas=novas.length,vinculos=gravadas.rows.length;
      await registrar(tx, { usuarioId: u.id, entidade:'rede_lote', entidadeId:corpo.id, acao:'importar',
        depois:{ pessoas,vinculos,fonte:corpo.fonte }, justificativa:corpo.autorizacao });
      return { id:corpo.id,pessoas,vinculos,repetido:false };
    });
    res.header('Cache-Control','no-store');
    return res.status(201).send(resultado);
  });
  app.post('/api/rede/importacoes/:id/retirar', async (req, res) => {
    const u = req.exigir('rede.ler');
    const id = Id.parse(req.params.id);
    const { motivo } = z.object({ motivo:z.string().trim().min(10).max(1000) }).strict().parse(req.body);
    await db.transaction(async (tx) => {
      await alterarRede(tx);
      const lote = (await tx.query(`SELECT l.*,p.usuario_id FROM rede_lotes l JOIN rede_pessoas p ON p.id=l.pessoa_ght4_id WHERE l.id=$1 FOR UPDATE OF l`,[id])).rows[0];
      if (!lote || (!['admin','socio'].includes(u.papel) && lote.usuario_id !== u.id)) throw new ErroHttp(404,'lote_inexistente','Lote não encontrado.');
      if (lote.retirado_em) return;
      await tx.query('UPDATE rede_lotes SET retirado_em=now(),retirado_por=$2 WHERE id=$1',[id,u.id]);
      await tx.query('UPDATE rede_vinculos SET ativo=false,versao=versao+1,atualizado_em=now() WHERE lote_id=$1',[id]);
      // Um cadastro reutilizado por outra fonte permanece. Os vínculos deste lote somem.
      await tx.query(`UPDATE rede_pessoas p SET ativo=false,versao=versao+1,atualizado_em=now() WHERE lote_id=$1
        AND NOT EXISTS (SELECT 1 FROM rede_vinculos v WHERE v.ativo AND (v.pessoa_a_id=p.id OR v.pessoa_b_id=p.id))`,[id]);
      await registrar(tx,{usuarioId:u.id,entidade:'rede_lote',entidadeId:id,acao:'retirar',justificativa:motivo});
    });
    res.header('Cache-Control','no-store');
    return { retirado:true };
  });
}
