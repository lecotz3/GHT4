import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { lerFonteCatalogo, normalizar } from './catalogo.mjs';
import { classificar, forcaDoEstado, normalizarSituacao } from '../../../packages/domain/classificacao.mjs';

const sha = texto => createHash('sha256').update(texto).digest('hex');
export async function lerRegrasCatalogo() {
  const arquivos = await Promise.all(['classificacao', 'taxonomia'].map(nome =>
    readFile(new URL(`../../../packages/domain/${nome}.mjs`, import.meta.url), 'utf8')));
  return sha(['importador-catalogo-v1', ...arquivos.map(t => t.replaceAll('\r\n', '\n'))].join('\n'));
}

function registrosDaFonte(fonte) {
  const vistos = new Set();
  if (!fonte.linhas.length || new Set(fonte.colunas).size !== fonte.colunas.length) throw new Error('Catálogo vazio ou colunas repetidas.');
  return fonte.linhas.map((linha, indice) => {
    if (!Array.isArray(linha) || linha.length !== fonte.colunas.length) throw new Error(`Linha ${indice + 1} com formato inválido.`);
    const e = Object.fromEntries(fonte.colunas.map((c, i) => [c, linha[i]]));
    if (!/^\d{8}$/.test(e.cnpjRaiz) || e.id !== `cnpj${e.cnpjRaiz}` || vistos.has(e.cnpjRaiz)) {
      throw new Error(`Linha ${indice + 1}: CNPJ raiz inválido ou duplicado.`);
    }
    vistos.add(e.cnpjRaiz);
    const texto = (v, max = 500) => {
      if (v == null) return '';
      if (typeof v !== 'string' || v.length > max || v.includes('\0')) throw new Error(`Linha ${indice + 1}: texto inválido.`);
      return v;
    };
    const cnae = texto(e.cnaePrincipal, 7) || null;
    const secundarios = e.cnaeSecundarias ?? [];
    if ((cnae && !/^\d{7}$/.test(cnae)) || !Array.isArray(secundarios) || secundarios.some(c => typeof c !== 'string' || !/^\d{7}$/.test(c))) {
      throw new Error(`Linha ${indice + 1}: CNAE inválido.`);
    }
    const nome = texto(e.nome) || texto(e.razaoSocial) || e.cnpjRaiz;
    const razao = texto(e.razaoSocial) || nome;
    const cidade = texto(e.cidade), uf = texto(e.uf, 2);
    const natureza = texto(e.naturezaJuridica, 4), situacao = normalizarSituacao(texto(e.situacaoCadastral, 30));
    const c = classificar({ cnaePrincipal: cnae, cnaeSecundarias: secundarios, naturezaJuridica: natureza, situacaoCadastral: situacao });
    // Lista explícita: não persistir contatos, faixas etárias ou hipóteses do protótipo.
    return { raiz: e.cnpjRaiz, nome, razao, cidade, uf, cnae, secundarios, natureza, situacao,
      estado: c.estado, subsetor: c.subsetor || 'Sem enquadramento', motivo: c.motivo,
      sinais: c.sinais, confianca: c.confianca,
      busca: normalizar(`${nome} ${razao} ${e.cnpjRaiz} ${cidade}`) };
  }).sort((a, b) => forcaDoEstado(b.estado) - forcaDoEstado(a.estado)
    || a.nome.localeCompare(b.nome, 'pt-BR') || a.raiz.localeCompare(b.raiz))
    .map((e, ordem) => ({ ...e, ordem }));
}

const TIPO_LOTE = `raiz text, nome text, razao text, cidade text, uf text, cnae text,
  secundarios text[], natureza text, situacao text, estado text, subsetor text,
  motivo text, sinais text[], confianca numeric, busca text, ordem int`;

export async function importarCatalogo(db, { texto, versaoRegras, ativar = true } = {}) {
  const fonte = lerFonteCatalogo(texto);
  const versao = versaoRegras ?? await lerRegrasCatalogo();
  const hash = sha(`${fonte.hash}\n${versao}`);
  const registros = registrosDaFonte(fonte);
  return db.transaction(async tx => {
    // Serializa publicações, inclusive a primeira; uma falha preserva o catálogo anterior.
    await tx.query('SELECT id FROM catalogo_controle WHERE id=true FOR UPDATE');
    const existente = (await tx.query('SELECT snapshot_id,total_origem FROM catalogo_publicacoes WHERE hash=$1', [hash])).rows[0];
    if (existente) return { hash, snapshotId: existente.snapshot_id, total: existente.total_origem, reutilizado: true };
    const atual = (await tx.query(`SELECT s.referencia FROM catalogo_controle c JOIN snapshots_universo s ON s.id=c.snapshot_id`)).rows[0];
    if (ativar && atual && atual.referencia > fonte.referencia) throw new Error('Referência mais antiga que o catálogo ativo. Não rebaixar a base automaticamente.');
    const schema = (await tx.query('SELECT COALESCE(max(versao_schema),0)+1 AS n FROM snapshots_universo WHERE referencia=$1', [fonte.referencia])).rows[0].n;
    const ativo = (await tx.query(`INSERT INTO ativos_de_dados
      (fonte,nome_arquivo,caminho_objeto,hash_sha256,tamanho_bytes,data_corte,contagem_origem,estado,confidencialidade)
      VALUES ('rfb_cnpj','data-quimicos.js',$1,$2,$3,$4,$5,'processado','publico')
      ON CONFLICT (fonte,hash_sha256) DO UPDATE SET estado='processado' RETURNING id`,
    [`repositorio:data-quimicos.js#sha256=${fonte.hash}`, fonte.hash, Buffer.byteLength(texto), `${fonte.referencia}-01`, registros.length])).rows[0];
    const snapshot = (await tx.query(`INSERT INTO snapshots_universo
      (rotulo,referencia,data_corte,versao_schema,manifesto,cobertura)
      VALUES ('Catálogo químico importado',$1,$2,$3,$4,$5) RETURNING id`,
    [fonte.referencia, `${fonte.referencia}-01`, schema,
      JSON.stringify([{ ativoId: ativo.id, sha256: fonte.hash, regras: versao }]),
      JSON.stringify({ fonte: 'rfb_cnpj', tipo: 'recorte_importado', financeiros: false, contatos: false, estabelecimentosIndividuais: false })])).rows[0];
    const sid = snapshot.id;
    await tx.query(`INSERT INTO catalogo_publicacoes(snapshot_id,hash,hash_origem,versao_regras,total_origem) VALUES ($1,$2,$3,$4,$5)`,
      [sid, hash, fonte.hash, versao, registros.length]);
    const execucao = (await tx.query(`INSERT INTO execucoes_importacao(snapshot_id,ativo_id,fonte,etapa)
      VALUES ($1,$2,'rfb_cnpj','importacao') RETURNING id`, [sid, ativo.id])).rows[0];
    for (let i = 0; i < registros.length; i += 500) {
      const lote = JSON.stringify(registros.slice(i, i + 500));
      await tx.query(`INSERT INTO entidades_juridicas(cnpj_raiz,razao_social,natureza_juridica,situacao,primeiro_snapshot,ultimo_snapshot)
        SELECT raiz,razao,natureza,situacao,$2,$2 FROM jsonb_to_recordset($1::jsonb) AS x(${TIPO_LOTE})
        ON CONFLICT(cnpj_raiz) DO UPDATE SET razao_social=EXCLUDED.razao_social,
          natureza_juridica=EXCLUDED.natureza_juridica,situacao=EXCLUDED.situacao,
          ultimo_snapshot=EXCLUDED.ultimo_snapshot,atualizado_em=now()`, [lote, sid]);
      await tx.query(`INSERT INTO catalogo_registros(snapshot_id,entidade_id,nome,razao_social,cidade,uf,cnae_principal,cnaes_secundarios,busca_normalizada,ordem)
        SELECT $2,e.id,x.nome,x.razao,x.cidade,x.uf,x.cnae,x.secundarios,x.busca,x.ordem
        FROM jsonb_to_recordset($1::jsonb) AS x(${TIPO_LOTE}) JOIN entidades_juridicas e ON e.cnpj_raiz=x.raiz`, [lote, sid]);
      await tx.query(`INSERT INTO classificacoes_subsetor(entidade_id,snapshot_id,setor,subsetor,estado,motivo,sinais,versao_taxonomia,confianca,execucao_id)
        SELECT e.id,$2,'Químicos',x.subsetor,x.estado,x.motivo,x.sinais,$3,x.confianca,$4
        FROM jsonb_to_recordset($1::jsonb) AS x(${TIPO_LOTE}) JOIN entidades_juridicas e ON e.cnpj_raiz=x.raiz`, [lote, sid, versao, execucao.id]);
    }
    const contagens = { origem: registros.length, importadas: registros.length, estados: {} };
    for (const e of registros) contagens.estados[e.estado] = (contagens.estados[e.estado] ?? 0) + 1;
    await tx.query(`UPDATE snapshots_universo SET estado='pronto',concluido_em=now(),contagens=$2 WHERE id=$1`, [sid, JSON.stringify(contagens)]);
    await tx.query(`UPDATE execucoes_importacao SET estado='concluida',concluido_em=now(),metricas=$2 WHERE id=$1`, [execucao.id, JSON.stringify(contagens)]);
    if (ativar) await tx.query('UPDATE catalogo_controle SET snapshot_id=$1 WHERE id=true', [sid]);
    return { hash, snapshotId: sid, total: registros.length, reutilizado: false, estados: contagens.estados };
  });
}
