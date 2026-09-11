import { parentPort, workerData } from 'node:worker_threads';
import { inflateRawSync } from 'node:zlib';

const MAX_TEXTO = 120000;
function xmlDocx(bytes) {
  let fim = bytes.length - 22;
  while (fim >= Math.max(0,bytes.length - 65557) && bytes.readUInt32LE(fim) !== 0x06054b50) fim--;
  if (fim < 0 || bytes.length < 22) throw new Error('zip_invalido');
  let p = bytes.readUInt32LE(fim+16), total = bytes.readUInt16LE(fim+10), encontrado;
  if (total > 5000) throw new Error('zip_excessivo');
  for (let i=0; i<total; i++) {
    if (p+46>bytes.length || bytes.readUInt32LE(p)!==0x02014b50) throw new Error('zip_invalido');
    const nomeLen=bytes.readUInt16LE(p+28), extra=bytes.readUInt16LE(p+30), comentario=bytes.readUInt16LE(p+32);
    const nome=bytes.subarray(p+46,p+46+nomeLen).toString('utf8');
    if (/vbaProject|embeddings\//i.test(nome)) throw new Error('documento_com_conteudo_ativo');
    if (nome==='word/document.xml') {
      const tamanho=bytes.readUInt32LE(p+24), comprimido=bytes.readUInt32LE(p+20), local=bytes.readUInt32LE(p+42), metodo=bytes.readUInt16LE(p+10);
      if ((bytes.readUInt16LE(p+8)&1) || tamanho>4*1024*1024 || local+30>bytes.length || ![0,8].includes(metodo)) throw new Error('zip_excessivo');
      if (bytes.readUInt32LE(local)!==0x04034b50) throw new Error('zip_invalido');
      const inicio=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
      if (inicio+comprimido>bytes.length) throw new Error('zip_invalido');
      const parte=bytes.subarray(inicio,inicio+comprimido);
      const xml=metodo===8 ? inflateRawSync(parte,{ maxOutputLength:4*1024*1024 }) : parte;
      if (xml.length!==tamanho) throw new Error('zip_invalido');
      encontrado=xml.toString('utf8');
    }
    p+=46+nomeLen+extra+comentario;
  }
  if (!encontrado) throw new Error('docx_sem_corpo');
  return encontrado;
}
function entidades(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,k) => {
    const conhecidas={ amp:'&',lt:'<',gt:'>',quot:'"',apos:"'" };
    if (conhecidas[k]) return conhecidas[k];
    const n=k.startsWith('#x') ? parseInt(k.slice(2),16) : Number(k.slice(1));
    return n>0 && n<=0x10ffff ? String.fromCodePoint(n) : '';
  });
}
async function extrair() {
  const bytes=Buffer.from(workerData.bytes), tipo=workerData.formato;
  if (tipo==='pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const tarefa=getDocument({ data:new Uint8Array(bytes), isEvalSupported:false, useSystemFonts:false,
      disableFontFace:true, useWorkerFetch:false, isOffscreenCanvasSupported:false, verbosity:0 });
    const doc=await tarefa.promise;
    try {
      if (doc.numPages>100) throw new Error('pdf_excessivo');
      const trechos=[]; let caracteres=0;
      for (let n=1;n<=doc.numPages;n++) {
        const pagina=await doc.getPage(n), texto=(await pagina.getTextContent()).items.map((s) => s.str || '').join(' ').trim();
        caracteres+=texto.length; if(caracteres>MAX_TEXTO) throw new Error('texto_excessivo');
        if(texto) trechos.push({ local:`Página ${n}`,texto });
        pagina.cleanup();
      }
      return trechos;
    } finally { await tarefa.destroy(); }
  }
  const partes=tipo==='docx' ? [...xmlDocx(bytes).matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) =>
    [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => entidades(t[1])).join(''))
    : bytes.toString('utf8').split(/\r?\n\s*\r?\n/);
  if (partes.join('').length>MAX_TEXTO) throw new Error('texto_excessivo');
  return partes.map((texto,i) => ({ local:`Parágrafo ${i+1}`,texto:texto.trim() })).filter((p) => p.texto);
}
try { parentPort.postMessage({ trechos:await extrair() }); }
catch { parentPort.postMessage({ erro:true }); }
