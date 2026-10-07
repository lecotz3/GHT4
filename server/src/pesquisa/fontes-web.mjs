/* =============================================================================
 *  GHT4 · pesquisa por tese — evidência em páginas públicas
 * -----------------------------------------------------------------------------
 *  A fonte gratuita e verificável de "o que a empresa faz" é o site da própria
 *  empresa. O endereço sai do domínio do e-mail declarado no CNPJ (só quando é
 *  corporativo e exclusivo), e a leitura segue regras de boa vizinhança:
 *
 *    - só http(s) para host público: nada de IP privado, localhost ou porta
 *      estranha, conferido também depois da resolução DNS e a cada redirecionamento;
 *      a conexão usa o endereço aprovado (resolução fixada no `lookup` do socket),
 *      então trocar o DNS entre a conferência e a conexão não leva à rede interna;
 *    - respeita o robots.txt de cada origem visitada, também nos redirecionamentos
 *      e antes de devolver o cache;
 *    - redirecionamento só entre o domínio cadastral e o seu www: outro domínio
 *      não vira evidência da empresa; a evidência guarda URL final e cadeia;
 *    - lê no máximo a página inicial e três internas, com tempo e tamanho limitados;
 *    - guarda o texto em cache por 30 dias: a mesma página não é baixada de novo.
 *
 *  O texto das páginas é DADO, nunca instrução. Quem julga um critério só pode
 *  citar trechos que existem literalmente aqui.
 * ========================================================================== */

import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import { normalizar } from '../agente/catalogo.mjs';

export const AGENTE_USUARIO = 'GHT4-Pesquisa/1.0 (pesquisa de mercado; respeita robots.txt)';
const VALIDADE_MS = 30 * 24 * 3600 * 1000;
// Falha passageira não pode virar um mês de "site indisponível".
const VALIDADE_FALHA_MS = 24 * 3600 * 1000;
const MAX_BYTES = 1_500_000;
const MAX_TEXTO = 60_000;
const PALAVRAS_INTERNAS = /(sobre|quem-somos|quemsomos|empresa|institucional|historia|produtos|linhas|portfolio|representa|parceir|fornecedor|marcas|segmentos|mercados|servicos|solucoes|certifica|qualidade|unidades|distribui|about|products)/;

/** Endereço que não é unicast global: privado, local, reservado, documentação ou de tradução. Na dúvida, bloqueia. */
export function ipPrivado(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
      || (a === 192 && b === 88 && c === 99);
  }
  if (v !== 6) return true;
  // Só 2000::/3 é unicast global; fora dele (::1, ::ffff:, fc00::/7, fe80::/10, 64:ff9b::…) bloqueia.
  const x = ip.toLowerCase();
  if (x.startsWith(':')) return true;
  const primeiro = parseInt(x.split(':')[0], 16);
  if (!(primeiro >= 0x2000 && primeiro <= 0x3fff)) return true;
  const segundo = parseInt(x.split(':')[1] || '0', 16);
  return primeiro === 0x2002 || (primeiro === 0x2001 && (segundo === 0 || segundo === 0xdb8)); // 6to4, Teredo, documentação
}

/** `lookup` de socket que só entrega endereços públicos: a conexão usa exatamente o que foi aprovado. */
export function lookupPublico(resolver) {
  return (hostname, opcoes, callback) => {
    if (typeof opcoes === 'function') { callback = opcoes; opcoes = {}; }
    Promise.resolve().then(() => resolver(hostname)).then((enderecos) => {
      const lista = (enderecos ?? []).map((e) => ({ address: e.address, family: e.family || isIP(e.address) }));
      if (!lista.length || lista.some((e) => ipPrivado(e.address))) {
        throw Object.assign(new Error('Endereço não público.'), { code: 'ENDERECO_NAO_PUBLICO' });
      }
      if (opcoes?.all) callback(null, lista);
      else callback(null, lista[0].address, lista[0].family);
    }).catch((e) => callback(e));
  };
}

/**
 * GET sem seguir redirecionamento, com a resolução DNS fixada em `lookupPublico`.
 * Host e SNI continuam sendo o nome do site. Devolve um `Response` como o fetch.
 */
export function fetchFixado(url, { signal, headers = {}, resolver = (h) => lookup(h, { all: true }) } = {}) {
  const u = new URL(url);
  const modulo = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = modulo.request(u, { method: 'GET', headers, signal, lookup: lookupPublico(resolver), agent: false }, (res) => {
      const cabecalhos = new Headers();
      for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) cabecalhos.set(k, Array.isArray(v) ? v.join(', ') : String(v));
      const semCorpo = res.statusCode === 204 || res.statusCode === 304;
      if (semCorpo) res.resume();
      resolve(new Response(semCorpo ? null : Readable.toWeb(res), { status: res.statusCode, headers: cabecalhos }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** URL aceitável para leitura: http(s), host com ponto, sem credencial, porta padrão. */
export function urlLegivel(valor) {
  try {
    const u = new URL(valor);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port || !u.hostname.includes('.')
      || isIP(u.hostname.replace(/^\[|\]$/g, '')) || /(^|\.)(localhost|local|internal|lan)$/i.test(u.hostname)) return null;
    u.hash = '';
    return u;
  } catch { return null; }
}

async function hostPublico(hostname, resolver) {
  try {
    const enderecos = await resolver(hostname);
    return enderecos.length > 0 && enderecos.every((e) => !ipPrivado(e.address));
  } catch { return false; }
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', ordm: 'º', ordf: 'ª', copy: '©', reg: '®', trade: '™',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', ccedil: 'ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Atilde: 'Ã', Otilde: 'Õ', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', Agrave: 'À', Ccedil: 'Ç', uuml: 'ü' };
const decodificar = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' '; }
  return ENTIDADES[e] ?? m;
});

/** Texto legível, título e links de um HTML. Sem executar nada. */
export function extrairPagina(html, base) {
  const semRuido = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  const titulo = decodificar((semRuido.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 200);
  const links = [];
  for (const m of semRuido.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(decodificar(m[1]), base);
      if (u.hostname.replace(/^www\./, '') !== new URL(base).hostname.replace(/^www\./, '') || !/^https?:$/.test(u.protocol)) continue;
      u.hash = '';
      links.push({ url: u.href, texto: decodificar(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 80) });
    } catch { /* link inválido */ }
    if (links.length >= 200) break;
  }
  const corpo = semRuido.replace(/<head\b[\s\S]*?<\/head>/i, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|td|th|section|article|header|footer|nav|ul|ol|table|blockquote|dd|dt|figcaption)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const texto = decodificar(corpo).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1).join('\n').slice(0, MAX_TEXTO);
  return { titulo, texto, links };
}

function charsetDe(tipo, bytes) {
  const doCabecalho = /charset=([\w-]+)/i.exec(tipo || '')?.[1];
  const doHtml = /<meta[^>]+charset=["']?([\w-]+)/i.exec(Buffer.from(bytes.slice(0, 4096)).toString('latin1'))?.[1];
  const c = (doCabecalho || doHtml || 'utf-8').toLowerCase();
  return ['iso-8859-1', 'latin1', 'windows-1252', 'cp1252'].includes(c) ? 'windows-1252' : 'utf-8';
}

/** `seguir(url)` devolve o motivo para não seguir um redirecionamento (robots, outra origem) ou null. */
async function baixar(url, { fetchImpl, resolver, redirecionamentos = 3, seguir = null }) {
  let atual = urlLegivel(url);
  const cadeia = [];
  for (let i = 0; i <= redirecionamentos && atual; i++) {
    if (i > 0) {
      const motivo = seguir ? await seguir(atual) : null;
      if (motivo) return { estado: 'bloqueada', motivo, url: atual.href, cadeia };
    }
    cadeia.push(atual.href);
    if (!await hostPublico(atual.hostname, resolver)) return { estado: 'bloqueada', motivo: 'endereço não público' };
    let r;
    try {
      r = await fetchImpl(atual.href, { redirect: 'manual', signal: AbortSignal.timeout(6000), resolver,
        headers: { 'User-Agent': AGENTE_USUARIO, Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5' } });
    } catch (e) { return e?.code === 'ENDERECO_NAO_PUBLICO' ? { estado: 'bloqueada', motivo: 'endereço não público' } : { estado: 'falhou', motivo: 'sem resposta' }; }
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const destino = r.headers.get('location');
      atual = destino ? urlLegivel(new URL(destino, atual).href) : null;
      continue;
    }
    if (!r.ok) return { estado: 'falhou', motivo: `HTTP ${r.status}`, url: atual.href, cadeia };
    const tipo = r.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml|text\/plain/i.test(tipo)) return { estado: 'sem_html', motivo: tipo.slice(0, 60), url: atual.href, cadeia };
    const partes = []; let bytes = 0;
    try {
      for await (const parte of r.body) {
        bytes += parte.length;
        if (bytes > MAX_BYTES) break;
        partes.push(parte);
      }
    } catch { return { estado: 'falhou', motivo: 'leitura interrompida', url: atual.href, cadeia }; }
    const buf = Buffer.concat(partes);
    return { estado: 'ok', url: atual.href, cadeia, tipo, corpo: new TextDecoder(charsetDe(tipo, buf)).decode(buf) };
  }
  return { estado: 'bloqueada', motivo: 'redirecionamento inválido', cadeia };
}

/** Regras do robots.txt: grupo do nosso agente, senão o grupo "*". Prefixo mais longo vence. */
export function permitidoPeloRobots(robots, caminho) {
  if (!robots) return true;
  const grupos = [];
  let atual = null, agenteAnterior = false;
  for (const bruta of robots.split(/\r?\n/)) {
    const linha = bruta.replace(/#.*/, '').trim();
    const i = linha.indexOf(':');
    if (i < 0) continue;
    const chave = linha.slice(0, i).trim().toLowerCase(), valor = linha.slice(i + 1).trim();
    if (chave === 'user-agent') {
      if (!atual || !agenteAnterior) { atual = { agentes: [], regras: [] }; grupos.push(atual); }
      atual.agentes.push(valor.toLowerCase()); agenteAnterior = true;
      continue;
    }
    agenteAnterior = false;
    if ((chave === 'disallow' || chave === 'allow') && atual && valor) atual.regras.push({ permitir: chave === 'allow', prefixo: valor.replace(/[*$].*$/, '') });
  }
  const nossos = grupos.filter((g) => g.agentes.some((a) => a.includes('ght4')));
  const regras = (nossos.length ? nossos : grupos.filter((g) => g.agentes.includes('*'))).flatMap((g) => g.regras);
  const melhor = regras.filter((r) => caminho.startsWith(r.prefixo)).sort((a, b) => b.prefixo.length - a.prefixo.length || Number(b.permitir) - Number(a.permitir))[0];
  return !melhor || melhor.permitir;
}

/**
 * Página com cache. `db` guarda o texto extraído, nunca o HTML bruto.
 * `robots` é o texto do robots.txt da origem pedida; `regras(url)` devolve o motivo
 * para não ler uma URL (robots da sua origem, origem não aceita) e vale para a URL
 * pedida, para cada redirecionamento e para a URL final de um cache.
 * Devolve { url (final), pedida, cadeia, estado, titulo, texto, links, obtidaEm }.
 */
export async function obterPagina(db, url, { fetchImpl = fetchFixado, resolver = (h) => lookup(h, { all: true }), agora = Date.now(), robots = null, regras = null } = {}) {
  const u = urlLegivel(url);
  if (!u) return { url, estado: 'bloqueada', texto: '', links: [] };
  const bloqueio = async (x) => (x.origin === u.origin && !permitidoPeloRobots(robots, x.pathname) ? 'robots.txt' : null) ?? (regras ? await regras(x) : null);
  const bloqueada = (motivo, extra = {}) => ({ url: u.href, pedida: u.href, cadeia: [], estado: 'bloqueada', texto: '', links: [], motivo, ...extra });
  // Robots antes do cache: uma regra nova vale também para o que já foi lido.
  const motivo = await bloqueio(u);
  if (motivo) return bloqueada(motivo);
  const cache = (await db.query('SELECT * FROM paginas_publicas WHERE url=$1', [u.href])).rows[0];
  const validade = cache?.estado === 'falhou' ? VALIDADE_FALHA_MS : VALIDADE_MS;
  if (cache && agora - new Date(cache.obtida_em).getTime() < validade) {
    const final = cache.url_final ? urlLegivel(cache.url_final) : u;
    const motivoFinal = final && final.href !== u.href ? await bloqueio(final) : null;
    if (motivoFinal) return bloqueada(motivoFinal, { cadeia: cache.cadeia || [] });
    return { url: final?.href ?? u.href, pedida: u.href, cadeia: cache.cadeia || [], estado: cache.estado, titulo: cache.titulo, texto: cache.texto || '', links: cache.links || [], obtidaEm: cache.obtida_em };
  }
  const r = await baixar(u.href, { fetchImpl, resolver, seguir: bloqueio });
  const pagina = r.estado === 'ok' ? { ...extrairPagina(r.corpo, r.url), estado: 'ok' } : { estado: r.estado, titulo: null, texto: '', links: [] };
  const hash = pagina.texto ? createHash('sha256').update(pagina.texto).digest('hex') : null;
  const obtidaEm = new Date(agora).toISOString();
  const urlFinal = r.url ?? u.href, cadeia = r.cadeia ?? [];
  await db.query(`INSERT INTO paginas_publicas (url,dominio,estado,titulo,texto,links,hash,obtida_em,url_final,cadeia) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (url) DO UPDATE SET estado=EXCLUDED.estado,titulo=EXCLUDED.titulo,texto=EXCLUDED.texto,links=EXCLUDED.links,hash=EXCLUDED.hash,obtida_em=EXCLUDED.obtida_em,
      url_final=EXCLUDED.url_final,cadeia=EXCLUDED.cadeia`,
  [u.href, u.hostname.replace(/^www\./, ''), pagina.estado, pagina.titulo, pagina.texto, JSON.stringify(pagina.links.slice(0, 200)), hash, obtidaEm, urlFinal, JSON.stringify(cadeia)]);
  return { url: urlFinal, pedida: u.href, cadeia, ...pagina, obtidaEm, motivo: r.motivo };
}

const DESCARTAVEIS = new Set(['ltda', 'eireli', 'epp', 'me', 'sa', 'cia', 'comercio', 'comercial', 'industria', 'industrial', 'importacao', 'exportacao',
  'importadora', 'exportadora', 'distribuidora', 'distribuicao', 'distribuidor', 'produtos', 'quimicos', 'quimica', 'quimico', 'quimicas', 'brasil',
  'brasileira', 'do', 'da', 'de', 'dos', 'das', 'e', 'participacoes', 'representacoes', 'servicos', 'solucoes', 'grupo', 'holding', 'resinas', 'tintas']);

/** O site fala desta empresa? CNPJ na página vale mais que o nome. */
export function identidadeDoSite(texto, empresa) {
  const raiz = empresa.cnpjRaiz;
  const formatado = `${raiz.slice(0, 2)}.${raiz.slice(2, 5)}.${raiz.slice(5, 8)}`;
  if (texto.includes(formatado) || texto.replace(/\D/g, ' ').includes(raiz)) return 'cnpj';
  const t = normalizar(texto);
  const marcas = [...new Set(normalizar(`${empresa.nome} ${empresa.razaoSocial}`).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !DESCARTAVEIS.has(w)))];
  return marcas.some((w) => new RegExp(`\\b${w}\\b`).test(t)) ? 'nome' : 'dominio';
}

/**
 * Lê o site cadastral de uma empresa: página inicial e até três internas
 * escolhidas por relevância. Nunca adivinha domínio.
 */
export async function lerSite(db, empresa, opcoes = {}) {
  const dominio = empresa.atributos?.dominio;
  if (!dominio) return { dominio: null, estado: 'sem_site', paginas: [], motivo: 'Sem domínio corporativo no cadastro.' };
  // Orçamento por site: a revisão roda dentro de funções com limite de 60 s.
  const prazo = Date.now() + (opcoes.prazoSiteMs ?? 20000);
  // Robots por origem (https://www.x e https://x podem ter regras diferentes), lido uma vez por leitura.
  const robotsPorOrigem = new Map();
  const robotsDe = (origem) => {
    if (!robotsPorOrigem.has(origem)) robotsPorOrigem.set(origem, obterPagina(db, `${origem}/robots.txt`, { ...opcoes, robots: null, regras: null })
      .then((p) => (p.estado === 'ok' && !/<html/i.test(p.texto) ? p.texto : null)));
    return robotsPorOrigem.get(origem);
  };
  // Só o domínio cadastral e o seu www: outro domínio pode ser estacionado ou de terceiro.
  const regras = async (x) => {
    if (x.hostname.replace(/^www\./, '') !== dominio) return 'outra origem';
    return permitidoPeloRobots(await robotsDe(x.origin), x.pathname) ? null : 'robots.txt';
  };
  let inicial = null, motivoBloqueio = null;
  for (const url of [`https://www.${dominio}/`, `https://${dominio}/`, `http://www.${dominio}/`]) {
    if (Date.now() > prazo) break;
    const p = await obterPagina(db, url, { ...opcoes, robots: null, regras });
    if (p.estado === 'ok' && p.texto.length > 20) { inicial = p; break; }
    if (p.motivo === 'robots.txt' || p.motivo === 'outra origem') motivoBloqueio ??= p.motivo;
  }
  if (!inicial && motivoBloqueio) return { dominio, estado: 'bloqueada', paginas: [], motivo: motivoBloqueio === 'robots.txt'
    ? 'O robots.txt do site não permite a leitura.' : 'O endereço do cadastro redireciona para outro domínio; o conteúdo não foi atribuído à empresa.' };
  if (!inicial) return { dominio, estado: 'indisponivel', paginas: [], motivo: 'O site não respondeu com uma página legível.' };
  const internas = [...new Map(inicial.links.map((l) => [l.url, l])).values()]
    .filter((l) => l.url !== inicial.url && PALAVRAS_INTERNAS.test(normalizar(`${new URL(l.url).pathname} ${l.texto}`)))
    .slice(0, 3);
  const paginas = [inicial];
  for (const l of internas) {
    if (Date.now() > prazo) break;
    const p = await obterPagina(db, l.url, { ...opcoes, robots: null, regras });
    if (p.estado === 'ok' && p.texto.length > 20) paginas.push(p);
  }
  const identidade = identidadeDoSite(paginas.map((p) => p.texto).join('\n'), empresa);
  return { dominio, estado: 'lido', identidade, paginas: paginas.map(({ url, pedida, cadeia, titulo, texto, obtidaEm }) => ({ url, pedida, cadeia, titulo, texto, obtidaEm })) };
}

/* ---- relevância sem IA -------------------------------------------------- */

const VAZIAS = new Set(('que com sem para por dos das nos nas uma uns umas seu sua seus suas pela pelo pelos pelas entre sobre como mais menos muito ' +
  'empresa empresas tenham tenha possuam possua sejam seja atuem atue atuam atua estao esta ser sao foram tem ter fazer faz ' +
  'proprio propria proprios proprias alguma algum algumas alguns qualquer cada todo toda todos todas outro outra outros outras').split(' '));
const SINONIMOS = {
  multin: ['multin', 'global', 'internac', 'mundial', 'lider mundial'],
  repres: ['repres', 'distribuidor autoriz', 'distribuidora autoriz', 'distribuidor oficial', 'distribuidora oficial', 'parceir', 'marcas que', 'principais marcas'],
  fabric: ['fabric', 'produtor'],
  agrone: ['agrone', 'agro', 'agric', 'fertiliz', 'defensiv', 'rural', 'lavoura'],
  labora: ['labora'],
  certif: ['certif', 'iso', 'sassmaq', 'prodir', 'atuacao responsavel'],
  import: ['import', 'comercio exterior'],
  export: ['export', 'comercio exterior'],
  armaze: ['armaze', 'estoque', 'deposito', 'centro de distribuicao', 'tancagem'],
  logist: ['logist', 'frota', 'entrega', 'transport'],
};

/** Grupos de termos de um critério: cada palavra relevante e seus sinônimos. */
export function termosDoCriterio(texto) {
  const palavras = normalizar(texto).split(/[^a-z0-9]+/).filter((w) => (w.length >= 4 || /\d/.test(w) || w === 'iso') && !VAZIAS.has(w));
  return [...new Set(palavras)].slice(0, 8).map((w) => {
    const raiz = /\d/.test(w) || w.length <= 5 ? w : w.slice(0, 6);
    return SINONIMOS[raiz] ?? [raiz];
  });
}

/** Frases das páginas, cada uma com sua origem. */
export function frasesDoSite(site) {
  const frases = [];
  for (const p of site.paginas || []) {
    for (const linha of p.texto.split('\n')) {
      for (const f of linha.split(/(?<=[.!?;])\s+/)) {
        const t = f.trim();
        if (t.length >= 25) frases.push({ url: p.url, texto: t.length > 400 ? `${t.slice(0, 397)}…` : t });
      }
    }
  }
  return frases;
}

/** As frases mais relevantes para um critério, com a fração de grupos atendidos. */
export function trechosRelevantes(frases, texto, quantidade = 5) {
  const grupos = termosDoCriterio(texto);
  if (!grupos.length) return [];
  const vistas = new Set();
  return frases.map((f) => {
    // Termo só conta no início de palavra: "labora" não pode casar com "colaboradores".
    const t = ` ${normalizar(f.texto).replace(/[^a-z0-9]+/g, ' ')} `;
    const achados = grupos.filter((g) => g.some((termo) => t.includes(` ${termo}`))).length;
    return { ...f, pontuacao: achados / grupos.length };
  }).filter((f) => f.pontuacao > 0 && !vistas.has(f.texto) && vistas.add(f.texto)).sort((a, b) => b.pontuacao - a.pontuacao || a.texto.length - b.texto.length).slice(0, quantidade);
}
