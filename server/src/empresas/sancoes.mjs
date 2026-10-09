import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/* =============================================================================
 *  GHT4 · sanções públicas a empresas (CEIS e CNEP), consultadas por raiz de CNPJ
 * -----------------------------------------------------------------------------
 *  Lê `data-sancoes.js` (ferramentas/importar-sancoes.mjs). É fonte de DILIGÊNCIA,
 *  consultada na hora de abordar a empresa, e não atributo do catálogo: fica fora
 *  do hash da publicação, para que atualizar a lista de sanções não invalide
 *  pesquisa nenhuma em andamento.
 *
 *  SITUAÇÃO DE CADA REGISTRO, sem palpite
 *    vigente           data final informada e ainda não alcançada
 *    encerrada         data final informada e já passada
 *    sem_data_final    o órgão não informou fim: multa e publicação da Lei
 *                      Anticorrupção, ou impedimento cuja data final não veio
 *  Ausência na lista não prova idoneidade: ela cobre só o que os órgãos
 *  informaram à CGU, na data de referência.
 * ========================================================================== */

const ARQUIVO = fileURLToPath(new URL('../../../data-sancoes.js', import.meta.url));
export const FONTE_SANCOES = 'Portal da Transparência (CGU): CEIS e CNEP';
export const URL_PORTAL = 'https://portaldatransparencia.gov.br/sancoes/consulta';

/** Valor JSON de `const NOME = <valor><terminador>`, sem o ";" do terminador. */
function literal(texto, nome, terminador) {
  const de = texto.indexOf(`const ${nome} =`);
  if (de < 0) throw new Error(`Constante ausente: ${nome}`);
  const inicio = de + `const ${nome} =`.length;
  const fim = texto.indexOf(terminador, inicio);
  if (fim < 0) throw new Error(`Constante sem fim: ${nome}`);
  return JSON.parse(texto.slice(inicio, fim + terminador.length - 1));
}

/** Registros por raiz de CNPJ. Lê só literais JSON: não executa o arquivo. */
export function lerSancoes(texto) {
  const referencia = literal(texto, 'REFERENCIA_SANCOES', ';');
  const colunas = literal(texto, 'COLUNAS_SANCOES', '];');
  const linhas = literal(texto, 'LINHAS_SANCOES', '\n];');
  const i = Object.fromEntries(colunas.map((c, k) => [c, k]));
  const porRaiz = new Map();
  for (const l of linhas) {
    const raiz = l[i.raiz];
    if (!/^\d{8}$/.test(raiz)) continue;
    const r = { cadastro: l[i.cadastro], codigo: l[i.codigo], categoria: l[i.categoria], inicio: l[i.inicio] ?? null, fim: l[i.fim] ?? null,
      orgao: l[i.orgao], esfera: l[i.esfera], uf: l[i.uf] || null, abrangencia: l[i.abrangencia] || null };
    if (!porRaiz.has(raiz)) porRaiz.set(raiz, []);
    porRaiz.get(raiz).push(r);
  }
  return { referencia, porRaiz };
}

/** Situação de um registro na data `hoje` (AAAA-MM-DD). */
export const situacaoDe = (r, hoje) => !r.fim ? 'sem_data_final' : r.fim < hoje ? 'encerrada' : 'vigente';

/**
 * Diligência de uma empresa: os registros com a situação de cada um, e se pedem
 * atenção antes de abordar (qualquer registro que não esteja encerrado).
 */
export function diligencia(base, raiz, hoje = new Date().toISOString().slice(0, 10)) {
  if (!base) return { consultada: false, referencia: null, fonte: FONTE_SANCOES, url: URL_PORTAL, registros: [], atencao: false };
  const registros = (base.porRaiz.get(raiz) ?? []).map((r) => ({ ...r, situacao: situacaoDe(r, hoje) }))
    .sort((a, b) => (a.situacao === 'encerrada') - (b.situacao === 'encerrada') || String(b.inicio).localeCompare(String(a.inicio)));
  return { consultada: true, referencia: base.referencia, fonte: FONTE_SANCOES, url: URL_PORTAL, registros,
    atencao: registros.some((r) => r.situacao !== 'encerrada') };
}

/** Leitor com cache pelo arquivo (tamanho e data): a lista nova entra sem reiniciar o servidor. */
export function criarSancoes({ arquivo = ARQUIVO } = {}) {
  let cache = null, assinatura = null;
  async function carregar() {
    let info;
    try { info = await stat(arquivo); } catch { return null; }
    const nova = `${info.size}:${info.mtimeMs}`;
    if (nova !== assinatura) { cache = lerSancoes(await readFile(arquivo, 'utf8')); assinatura = nova; }
    return cache;
  }
  return {
    /** Diligência da empresa pela raiz do CNPJ; `consultada: false` quando a lista não está neste servidor. */
    async daEmpresa(raiz, hoje) {
      let base = null;
      try { base = await carregar(); } catch { base = null; }
      return diligencia(base, raiz, hoje);
    },
  };
}
