import { PDFDocument } from 'pdfkit';
import { gerarXlsx } from './xlsx.mjs';
export const serializar = (v) => JSON.stringify(v, (_k,x) => x && typeof x==='object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k)=>[k,x[k]])) : x);
export const xlsxDe = (p, hash) => Buffer.from(gerarXlsx([
  { nome:'Identificação',linhas:[['GHT4',p.titulo],['Gerado em',p.data],['Escopo',p.escopo],['Versão SHA-256',hash],['Limites',p.limites]] },
  ...p.secoes.map((s) => ({ nome:s.titulo,linhas:[s.colunas,...s.linhas] })),
]));
export async function pdfDe(p,hash) {
  const doc=new PDFDocument({ size:'A4',margins:{ top:45,bottom:55,left:45,right:45 },bufferPages:true,
    info:{ Title:p.titulo,Author:'GHT4',CreationDate:new Date(p.data) } });
  const partes=[];
  const pronto=new Promise((resolve,reject)=>{doc.on('data',(p)=>partes.push(p));doc.on('end',()=>resolve(Buffer.concat(partes)));doc.on('error',reject)});
  const texto=(v) => v===null || v===undefined || v==='' ? 'Não apurado' : String(v).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
  const espaco=(h=60) => {if(doc.y+h>doc.page.height-65)doc.addPage()};
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0F4C81').text('GHT4 | M&A');
  doc.moveDown().fontSize(20).fillColor('#111111').text(p.titulo);
  doc.moveDown(.5).font('Helvetica').fontSize(9).fillColor('#555555').text(`${p.escopo} | ${new Date(p.data).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}`);
  doc.moveDown().fontSize(10).text(p.limites).moveDown();
  for(const s of p.secoes) {
    espaco(100);doc.font('Helvetica-Bold').fontSize(14).fillColor('#0F4C81').text(s.titulo).moveDown(.5);
    if(!s.linhas.length)doc.font('Helvetica').fontSize(10).fillColor('#555555').text('Sem registros neste corte.');
    for(const linha of s.linhas) {
      espaco(80);doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(texto(linha[0]));
      for(let i=1;i<s.colunas.length;i++)doc.font('Helvetica').fontSize(9).fillColor('#333333').text(`${s.colunas[i]}: ${texto(linha[i])}`,{lineGap:2});
      doc.moveDown(.7);
    }
    doc.moveDown();
  }
  const paginas=doc.bufferedPageRange();
  for(let i=0;i<paginas.count;i++) {
    doc.switchToPage(i);doc.page.margins.bottom=0;
    doc.font('Helvetica').fontSize(8).fillColor('#555555').text(`Confidencial | GHT4 | ${hash.slice(0,16)} | ${i+1}/${paginas.count}`,45,doc.page.height-30,{width:doc.page.width-90,align:'center',lineBreak:false});
  }
  doc.end();return pronto;
}
