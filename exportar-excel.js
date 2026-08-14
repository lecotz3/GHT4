/* =============================================================================
 *  GHT4 · EXPORTAÇÃO EM EXCEL  (Módulo 9 — Formato dos Outputs)
 * -----------------------------------------------------------------------------
 *  O documento é específico sobre a forma (seção 9):
 *
 *    "Cada subsegmento como uma coluna, com as companhias nas linhas
 *     correspondentes; uma aba separada de valuation, contendo as análises de
 *     transações precedentes e de empresas comparáveis (comps)."
 *
 *  Este arquivo gera um .xlsx de verdade — não um CSV renomeado. A diferença
 *  importa porque o formato pedido é multi-aba, e CSV não tem abas.
 *
 *  POR QUE ESCREVER O XLSX NA MÃO
 *  Um .xlsx é um ZIP de XMLs. Bibliotecas prontas (SheetJS e afins) resolveriam
 *  isso em três linhas, mas entrariam como dependência npm — e o protótipo da
 *  raiz roda por duplo-clique em file://, sem build e sem node_modules. Uma
 *  dependência aqui mataria a única característica que faz o protótipo funcionar
 *  numa sala de reunião sem rede. São ~120 linhas de ZIP e XML; o preço é menor
 *  que o da dependência.
 *
 *  Escopo deliberado: método de compressão STORE (sem deflate). O arquivo sai
 *  maior, mas o gerador cabe em um arquivo sem dependência, e a planilha de uma
 *  consulta tem centenas de linhas, não milhões.
 * ========================================================================== */

/* ---- 1. ZIP ---------------------------------------------------------------- */

const _TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[i] = c >>> 0;
  }
  return tabela;
})();

function _crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = _TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function _texto(str) {
  return new TextEncoder().encode(str);
}

/**
 * Monta um ZIP a partir de [{nome, dados:Uint8Array}].
 * Flag 0x0800 marca os nomes como UTF-8 — sem ela, acento em nome de arquivo
 * interno quebra em Excel PT-BR.
 */
function _zip(arquivos) {
  const pedacos = [];
  const central = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = _texto(arquivo.nome);
    const dados = arquivo.dados;
    const crc = _crc32(dados);

    const cabecalho = new DataView(new ArrayBuffer(30));
    cabecalho.setUint32(0, 0x04034b50, true);
    cabecalho.setUint16(4, 20, true);
    cabecalho.setUint16(6, 0x0800, true);
    cabecalho.setUint16(8, 0, true);          // método STORE
    cabecalho.setUint16(10, 0, true);         // hora
    cabecalho.setUint16(12, 0x21, true);      // data (1980-01-01, determinístico)
    cabecalho.setUint32(14, crc, true);
    cabecalho.setUint32(18, dados.length, true);
    cabecalho.setUint32(22, dados.length, true);
    cabecalho.setUint16(26, nome.length, true);
    cabecalho.setUint16(28, 0, true);

    pedacos.push(new Uint8Array(cabecalho.buffer), nome, dados);

    const entrada = new DataView(new ArrayBuffer(46));
    entrada.setUint32(0, 0x02014b50, true);
    entrada.setUint16(4, 20, true);
    entrada.setUint16(6, 20, true);
    entrada.setUint16(8, 0x0800, true);
    entrada.setUint16(10, 0, true);
    entrada.setUint16(12, 0, true);
    entrada.setUint16(14, 0x21, true);
    entrada.setUint32(16, crc, true);
    entrada.setUint32(20, dados.length, true);
    entrada.setUint32(24, dados.length, true);
    entrada.setUint16(28, nome.length, true);
    entrada.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(entrada.buffer), nome);

    deslocamento += 30 + nome.length + dados.length;
  }

  const inicioCentral = deslocamento;
  let tamanhoCentral = 0;
  for (const p of central) tamanhoCentral += p.length;

  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, inicioCentral, true);

  const todos = [...pedacos, ...central, new Uint8Array(fim.buffer)];
  let total = 0;
  for (const p of todos) total += p.length;

  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of todos) { saida.set(p, pos); pos += p.length; }
  return saida;
}

/* ---- 2. XML DA PLANILHA ---------------------------------------------------- */

function _escapar(valor) {
  return String(valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    /* Caracteres de controle são ilegais em XML 1.0 e fazem o Excel recusar o
       arquivo inteiro com "conteúdo ilegível" — sem dizer qual célula. */
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function _coluna(indice) {
  let nome = '';
  let n = indice;
  while (n >= 0) {
    nome = String.fromCharCode(65 + (n % 26)) + nome;
    n = Math.floor(n / 26) - 1;
  }
  return nome;
}

function _celula(referencia, valor, estilo) {
  const atributoEstilo = estilo ? ` s="${estilo}"` : '';
  if (valor === null || valor === undefined || valor === '') {
    return `<c r="${referencia}"${atributoEstilo}/>`;
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return `<c r="${referencia}"${atributoEstilo}><v>${valor}</v></c>`;
  }
  return `<c r="${referencia}"${atributoEstilo} t="inlineStr"><is><t xml:space="preserve">${_escapar(valor)}</t></is></c>`;
}

/**
 * Uma aba a partir de uma matriz de linhas.
 * `cabecalhos` (a primeira linha) recebe o estilo 1 — negrito, definido em
 * `_estilos()`.
 */
function _planilha(linhas) {
  const xmlLinhas = linhas.map((linha, i) => {
    const celulas = linha
      .map((valor, j) => _celula(_coluna(j) + (i + 1), valor, i === 0 ? 1 : 0))
      .join('');
    return `<row r="${i + 1}">${celulas}</row>`;
  }).join('');

  /* Largura generosa nas primeiras colunas: nome de companhia e descrição de
     critério são longos, e planilha que abre com tudo truncado passa a
     impressão de output malfeito. */
  const colunas = '<cols><col min="1" max="1" width="38" customWidth="1"/>'
                + '<col min="2" max="40" width="20" customWidth="1"/></cols>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + colunas
    + `<sheetData>${xmlLinhas}</sheetData></worksheet>`;
}

function _estilos() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>`
    + `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
    + `<fills count="2"><fill><patternFill patternType="none"/></fill>`
    + `<fill><patternFill patternType="gray125"/></fill></fills>`
    + `<borders count="1"><border/></borders>`
    + `<cellStyleXfs count="1"><xf/></cellStyleXfs>`
    + `<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>`
    + `</styleSheet>`;
}

/** Nome de aba válido: até 31 caracteres, sem os proibidos pelo Excel. */
function _nomeAba(nome) {
  return String(nome).replace(/[[\]:*?/\\]/g, '-').slice(0, 31);
}

/** Gera o .xlsx completo. `abas` = [{nome, linhas:[[...]]}]. */
function gerarXlsx(abas) {
  const arquivos = [];

  const tiposConteudo = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + `</Types>`;

  const relacoesRaiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const pasta = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
    + `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`
    + abas.map((aba, i) => `<sheet name="${_escapar(_nomeAba(aba.nome))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
    + `</sheets></workbook>`;

  const relacoesPasta = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `</Relationships>`;

  arquivos.push({ nome: '[Content_Types].xml', dados: _texto(tiposConteudo) });
  arquivos.push({ nome: '_rels/.rels', dados: _texto(relacoesRaiz) });
  arquivos.push({ nome: 'xl/workbook.xml', dados: _texto(pasta) });
  arquivos.push({ nome: 'xl/_rels/workbook.xml.rels', dados: _texto(relacoesPasta) });
  arquivos.push({ nome: 'xl/styles.xml', dados: _texto(_estilos()) });
  abas.forEach((aba, i) => {
    arquivos.push({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: _texto(_planilha(aba.linhas)) });
  });

  return _zip(arquivos);
}

/* ---- 3. AS ABAS DA GHT4 ---------------------------------------------------- */

function _hoje() {
  return new Date().toLocaleDateString('pt-BR');
}

/**
 * ABA 1 — o formato literal do documento: subsegmento como COLUNA, companhias
 * nas linhas. Layout de leitura para a reunião, não de análise: cada coluna é
 * um subsegmento e desce a lista de quem atua nele.
 */
function abaMapaDeMercado(mapa) {
  const colunas = mapa.subsegmentos;
  const linhas = [];

  linhas.push(colunas.map((s) => s.subsegmento));
  linhas.push(colunas.map((s) => `${s.contagem} empresas · ${s.concentracao.rotulo}`));
  linhas.push(colunas.map(() => ''));

  const maisLongo = Math.max(0, ...colunas.map((s) => s.empresas.length));
  for (let i = 0; i < maisLongo; i++) {
    linhas.push(colunas.map((s) => {
      const e = s.empresas[i];
      if (!e) return '';
      const receita = e.receita ? ` (R$ ${e.receita.toLocaleString('pt-BR')} mi)` : '';
      return e.nome + receita;
    }));
  }

  return { nome: 'Mapa de mercado', linhas };
}

/** ABA 2 — ranking de subsegmentos (Módulo 2), com a régua à mostra. */
function abaRankingSubsegmentos(ranking) {
  const criterios = window.MERCADO ? window.MERCADO.CRITERIOS_SUBSEGMENTO : {};
  const chaves = Object.keys(criterios);

  const linhas = [[
    'Posição', 'Subsegmento', 'Índice (0-100)', 'Empresas', 'HHI', 'Concentração',
    'Alvos R$ 30-250mi', 'Crescimento mediano %', 'Margem mediana %', 'Receita total (R$ mi)',
    ...chaves.map((c) => `Peso: ${criterios[c].rotulo}`),
  ]];

  ranking.subsegmentos.forEach((s, i) => {
    linhas.push([
      i + 1, s.subsegmento, s.score, s.contagem, s.hhi, s.concentracao.rotulo,
      s.alvosNaFaixa, s.crescimentoMediano, s.margemMediana, s.receitaTotal,
      ...chaves.map((c) => ranking.pesos[c]),
    ]);
  });

  return { nome: 'Ranking subsegmentos', linhas };
}

/** ABA 3 — ranking de empresas com a rastreabilidade junto, como já faz o CSV. */
function abaRankingEmpresas(avaliadas) {
  const linhas = [[
    'Empresa', 'Setor', 'Subsegmento', 'UF', 'Classificação', 'Índice', 'Lastro',
    '% documentado', '% indicador', '% inferido', 'Receita (R$ mi)', 'Crescimento %',
    'Margem EBITDA %', 'Dívida líq./EBITDA', 'Liquidez corrente', 'Funcionários',
    'Sinais ativos', 'Ressalvas', 'Sinais sem documentação', 'Origem', 'Data do dado', 'Confiança',
  ]];

  for (const e of avaliadas) {
    const lastro = e.lastroPrincipal || {};
    linhas.push([
      e.nome, e.setor, e.subsetor, e.uf,
      /* O rótulo do papel vive em CONFIG_PAPEIS, não no resultado do scoring —
         `scorePapel` devolve números, não texto de interface. */
      window.MOTOR && window.MOTOR.CONFIG_PAPEIS[e.classificacao]
        ? window.MOTOR.CONFIG_PAPEIS[e.classificacao].rotulo
        : e.classificacao,
      e.scorePrincipal,
      e.rotuloLastro ? e.rotuloLastro.rotulo : '',
      lastro.pctDocumentado, lastro.pctEstruturado, lastro.pctInferido,
      e.receita, e.crescimento, e.margemEbitda, e.alavancagem, e.liquidezCorrente, e.funcionarios,
      (e.sinais || []).map((s) => s.rotulo).join(' · '),
      (e.ressalvas || []).map((r) => r.rotulo || r).join(' · '),
      (lastro.lacunas || []).join(' · '),
      e.origem, e.dataAtualizacao, e.confianca,
    ]);
  }

  return { nome: 'Ranking empresas', linhas };
}

/**
 * ABA 4 — valuation.
 *
 * O documento pede esta aba com trading comps e transações precedentes, ambos
 * vindos do Capital IQ (seção 6.1). A GHT4 tem login web, não API — então a aba
 * sai ESTRUTURADA e VAZIA, pronta para receber a exportação da plataforma, com
 * as colunas na ordem em que a análise é montada.
 *
 * A escolha entre entregar a aba vazia ou não entregar aba nenhuma é a mesma de
 * sempre neste projeto: a estrutura declarada mostra o que falta e onde encaixa;
 * a ausência apenas esconde. O que a DFP sustenta (receita, EBITDA, margem) vai
 * preenchido, para a conta de múltiplo precisar só do numerador.
 */
function abaValuation(avaliadas) {
  const linhas = [];

  linhas.push(['ANÁLISE DE VALUATION — PENDENTE DE CAPITAL IQ']);
  linhas.push(['Os múltiplos exigem valor de firma, que a DFP da CVM não publica. As colunas de EV e múltiplo']);
  linhas.push(['ficam em branco até a exportação do Capital IQ ser carregada. Receita, EBITDA e margem já vêm da DFP.']);
  linhas.push([`Gerado em ${_hoje()} · fonte dos dados preenchidos: CVM · DFP`]);
  linhas.push([]);

  linhas.push(['1. EMPRESAS COMPARÁVEIS LISTADAS (TRADING COMPS)']);
  linhas.push([
    'Empresa', 'Subsegmento', 'Receita (R$ mi)', 'EBITDA (R$ mi)', 'Margem EBITDA %',
    'Valor de mercado', 'Dívida líquida (R$ mi)', 'EV', 'EV/Receita', 'EV/EBITDA', 'Fonte', 'Data',
  ]);

  for (const e of avaliadas.slice(0, 40)) {
    const ebitda = e.receita && e.margemEbitda !== null && e.margemEbitda !== undefined
      ? Math.round(e.receita * (e.margemEbitda / 100))
      : null;
    const dividaLiquida = e.cvm && e.cvm.dividaLiquidaValor !== undefined
      ? Math.round(e.cvm.dividaLiquidaValor / 1e6)
      : null;
    linhas.push([
      e.nome, e.subsetor, e.receita, ebitda, e.margemEbitda,
      '', dividaLiquida, '', '', '',
      e.origem, e.dataAtualizacao,
    ]);
  }

  linhas.push([]);
  linhas.push(['2. TRANSAÇÕES PRECEDENTES']);
  linhas.push([
    'Data', 'Alvo', 'Adquirente', 'Subsegmento', '% adquirido', 'Valor da transação',
    'Receita do alvo', 'EBITDA do alvo', 'EV/Receita', 'EV/EBITDA', 'Fonte', 'Observações',
  ]);
  linhas.push(['— sem dados: requer exportação do Capital IQ (transações precedentes) —']);

  return { nome: 'Valuation', linhas };
}

/**
 * ABA 5 — a régua e as lacunas.
 * Sem esta aba, a planilha circula fora da ferramenta como se fosse verdade
 * absoluta. Com ela, quem receber o arquivo por e-mail vê sob qual configuração
 * o ranking foi produzido e o que a base não responde.
 */
function abaMetodologia(contexto) {
  const linhas = [];

  linhas.push(['METODOLOGIA, CONFIGURAÇÃO E LACUNAS']);
  linhas.push([`Gerado em ${_hoje()}`]);
  linhas.push([`Base: ${contexto.base || 'CVM · companhias abertas'}`]);
  linhas.push([`Setor consultado: ${contexto.setor || 'todos'}`]);
  linhas.push([]);

  if (contexto.ressalvaCobertura) {
    linhas.push(['RESSALVA DE COBERTURA']);
    linhas.push([contexto.ressalvaCobertura.titulo]);
    linhas.push([contexto.ressalvaCobertura.texto]);
    linhas.push([`Via de obtenção: ${contexto.ressalvaCobertura.viaDeObtencao}`]);
    linhas.push([]);
  }

  const config = contexto.configuracao;
  if (config) {
    linhas.push(['CONFIGURAÇÃO APLICADA NESTA CONSULTA']);
    linhas.push(['Papel', 'Sinal / critério', 'Peso']);
    for (const papel in config.pesos || {}) {
      for (const sinal in config.pesos[papel]) {
        const peso = config.pesos[papel][sinal];
        if (!peso) continue;
        const rotulo = window.MOTOR && window.MOTOR.SINAIS[sinal] ? window.MOTOR.SINAIS[sinal].rotulo : sinal;
        linhas.push([papel, rotulo, peso]);
      }
    }
    for (const criterio of config.criterios || []) {
      linhas.push([
        criterio.papel,
        'AD HOC: ' + (window.CONFIGURACAO ? window.CONFIGURACAO.descreverCriterio(criterio) : criterio.campo),
        criterio.peso,
      ]);
    }
    linhas.push([]);
  }

  linhas.push(['CRITÉRIOS SEM FONTE PÚBLICA']);
  linhas.push(['Critério', 'Por que importa', 'Por que falta', 'Via de obtenção']);
  const semFonte = (contexto.criteriosSemFonte || [])
    .concat(window.EVIDENCIA && window.EVIDENCIA.CRITERIOS_SEM_FONTE ? window.EVIDENCIA.CRITERIOS_SEM_FONTE : []);
  for (const c of semFonte) {
    linhas.push([
      c.criterio || c.rotulo,
      c.porQueImporta || c.porQue || '',
      c.porQueFalta || c.motivo || '',
      c.viaDeObtencao || c.via || '',
    ]);
  }

  return { nome: 'Metodologia e lacunas', linhas };
}

/* ---- 4. MONTAGEM E DOWNLOAD ------------------------------------------------ */

/**
 * Monta a pasta de trabalho completa de uma consulta.
 * `dados` = { mapa, ranking, avaliadas, configuracao, setor, base }
 */
function gerarPastaDeTrabalho(dados) {
  const abas = [];
  if (dados.mapa) abas.push(abaMapaDeMercado(dados.mapa));
  if (dados.ranking) abas.push(abaRankingSubsegmentos(dados.ranking));
  if (dados.avaliadas) abas.push(abaRankingEmpresas(dados.avaliadas));
  if (dados.avaliadas) abas.push(abaValuation(dados.avaliadas));
  abas.push(abaMetodologia({
    base: dados.base,
    setor: dados.setor,
    configuracao: dados.configuracao,
    ressalvaCobertura: dados.mapa ? dados.mapa.ressalvaCobertura : null,
    criteriosSemFonte: dados.ranking ? dados.ranking.criteriosSemFonte : [],
  }));
  return gerarXlsx(abas);
}

/** Dispara o download no navegador. */
function baixar(bytes, nomeArquivo) {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  /* Revogar na hora corta o download em Firefox; um tick resolve. */
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

window.EXCEL = {
  gerarXlsx, gerarPastaDeTrabalho, baixar,
  abaMapaDeMercado, abaRankingSubsegmentos, abaRankingEmpresas, abaValuation, abaMetodologia,
};
