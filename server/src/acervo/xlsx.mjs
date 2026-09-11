// Gerador ZIP/XML extraído do exportador existente da GHT4; células de texto nunca viram fórmulas.
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
    + `<dimension ref="A1:${_coluna(Math.max(1,...linhas.map(l=>l.length))-1)}${Math.max(1,linhas.length)}"/>`
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
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
    + `<cellXfs count="2"><xf xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf xfId="0" fontId="1" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>`
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
    + `</styleSheet>`;
}

/** Nome de aba válido: até 31 caracteres, sem os proibidos pelo Excel. */
function _nomeAba(nome) {
  return String(nome).replace(/[[\]:*?/\\]/g, '-').slice(0, 31);
}

/** Gera o .xlsx completo. `abas` = [{nome, linhas:[[...]]}]. */
export function gerarXlsx(abas) {
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

