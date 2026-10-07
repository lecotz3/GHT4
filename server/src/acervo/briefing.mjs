import { PDFDocument } from 'pdfkit';

const COR = { tinta: '#111111', suave: '#5A5A5A', fio: '#D9DDE0', azul: '#0F4C81', laranja: '#9A4200', alerta: '#C0392F', fundo: '#F4F6F7' };
const ETAPAS = { identificada: 'Identificada', qualificada: 'Qualificada para abordagem', contatada: 'Contatada', conversa_realizada: 'Conversa realizada', oportunidade_mandato: 'Oportunidade de mandato', proposta_enviada: 'Proposta enviada', negociacao: 'Negociação', mandato_assinado: 'Mandato assinado', nutricao: 'Nutrição ou pausa', perdida: 'Perdida ou não contatar' };
const limpo = (v) => String(v ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

/**
 * Briefing de reunião em uma página (ou poucas): o que levar para a conversa.
 * Usa só a ficha já filtrada por acesso; não acrescenta nada que a tela não mostraria.
 */
export async function briefingPdf(ficha, { frente, roteiro, autor, data = new Date() }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 50, left: 45, right: 45 }, bufferPages: true,
    info: { Title: `Briefing — ${limpo(ficha.empresa.nome)}`, Author: 'GHT4', CreationDate: data } });
  const partes = [];
  const pronto = new Promise((resolve, reject) => { doc.on('data', (p) => partes.push(p)); doc.on('end', () => resolve(Buffer.concat(partes))); doc.on('error', reject); });
  const largura = doc.page.width - 90;
  const espaco = (h = 60) => { if (doc.y + h > doc.page.height - 60) doc.addPage(); };
  const secao = (titulo) => {
    espaco(70); doc.moveDown(.8);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COR.suave).text(titulo.toUpperCase(), { characterSpacing: 1.2 });
    doc.moveTo(45, doc.y + 3).lineTo(45 + largura, doc.y + 3).lineWidth(.6).strokeColor(COR.fio).stroke(); doc.moveDown(.6);
  };
  const item = (texto, cor = COR.tinta) => {
    espaco(24); const y = doc.y;
    // Marcador diagonal da marca.
    doc.save().moveTo(49, y + 9).lineTo(52, y + 2).lineWidth(1.4).strokeColor('#FF6E00').stroke().restore();
    doc.font('Helvetica').fontSize(10).fillColor(cor).text(limpo(texto), 60, y, { width: largura - 15, lineGap: 2 }); doc.moveDown(.35); doc.x = 45;
  };
  const e = ficha.empresa;

  // Cabeçalho
  doc.rect(0, 0, doc.page.width, 6).fill('#FF6E00');
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COR.azul).text(`GHT4 | BRIEFING DE REUNIÃO | ${frente === 'compra' ? 'FRENTE DE COMPRA' : 'FRENTE DE VENDA'}`, 45, 30, { characterSpacing: .8 });
  doc.moveDown(.5).font('Helvetica-Bold').fontSize(22).fillColor(COR.tinta).text(limpo(e.nome), { width: largura });
  doc.moveDown(.2).font('Helvetica').fontSize(10).fillColor(COR.suave)
    .text(`${limpo(e.razaoSocial)} · ${limpo(e.cidade)}/${limpo(e.uf)} · CNPJ raiz ${limpo(e.cnpjRaiz)} · CNAE ${limpo(e.cnaePrincipal) || 'não informado'}`, { width: largura });
  const enquadramento = { confirmada: 'confirmado', provavel: 'provável', possivel: 'possível' }[e.estado] || e.estado;
  doc.moveDown(.2).text(`Enquadramento ${enquadramento} em distribuição e trading químico · cadastro Receita Federal, referência ${limpo(e.referencia)}`, { width: largura });

  const restricoes = ficha.situacao?.restricoes ?? [];
  if (restricoes.length) {
    espaco(60); doc.moveDown(.8); const y = doc.y;
    const texto = restricoes.map((r) => `${r.espaco ? `Espaço ${r.espaco}` : 'Restrição pessoal'}: ${r.motivo}`).join('\n');
    const h = doc.font('Helvetica').fontSize(10).heightOfString(limpo(texto), { width: largura - 30 }) + 30;
    doc.rect(45, y, largura, h).fill('#FBEDEC'); doc.rect(45, y, 3, h).fill(COR.alerta);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COR.alerta).text('NÃO CONTATAR', 60, y + 8);
    doc.font('Helvetica').fontSize(10).fillColor(COR.tinta).text(limpo(texto), 60, y + 22, { width: largura - 30 });
    doc.y = y + h; doc.x = 45;
  }

  if (ficha.eventos?.length) {
    secao('Sinais no registro público');
    for (const ev of ficha.eventos.slice(0, 5)) item(`${ev.rotulo} (entre ${ev.de} e ${ev.ate}): ${ev.detalhe}. Atenção: ${ev.ambiguidade}`);
  }
  if (ficha.situacao) {
    secao('Na casa');
    if (!ficha.situacao.oportunidades.length) item('Nenhuma oportunidade registrada que você possa acessar.', COR.suave);
    if (ficha.situacao.totalOportunidades > ficha.situacao.oportunidades.length) item(`Mostrando as ${ficha.situacao.oportunidades.length} atualizadas mais recentemente, de ${ficha.situacao.totalOportunidades}.`, COR.suave);
    for (const o of ficha.situacao.oportunidades) item(`${o.frente === 'compra' ? 'Compra' : 'Venda'} · ${ETAPAS[o.etapa] || o.etapa} · responsável ${o.responsavel_nome} · ${o.espaco || 'privada'} · próximo passo em ${o.prazo.split('-').reverse().join('/')}: ${o.proxima_acao}`);
  }
  if (ficha.acesso) {
    secao('Acesso pela rede');
    const m = ficha.acesso.melhor;
    item(m ? `Melhor caminho (${m.categoria}): ${m.de} → ${m.ate}${m.cargo ? `, ${m.cargo}` : ''}. Confirme com o titular antes de pedir a apresentação.`
      : 'Nenhum caminho utilizável hoje. Considere abordagem direta ou ampliar a passada de reconhecimento.', m ? COR.tinta : COR.suave);
    item(`${ficha.acesso.pessoasConhecidas} pessoa(s) da empresa na rede, ${ficha.acesso.lideresConhecidos} na liderança; ${ficha.acesso.utilizaveis} caminho(s) utilizável(is).`, COR.suave);
  }
  if (ficha.pessoas?.length) {
    secao('Quem é quem');
    for (const p of ficha.pessoas.slice(0, 8)) item(`${p.nome}${p.cargo ? ` — ${p.cargo}` : ''}${p.senioridade ? ` (${p.senioridade})` : ''}`);
    if (ficha.pessoas.length > 8) item(`e mais ${ficha.pessoas.length - 8} pessoa(s) na ficha.`, COR.suave);
  }
  const revisados = (ficha.acervo?.registros ?? []).filter((r) => r.revisado);
  if (revisados.length) {
    secao('Acervo revisado');
    // Cada registro leva sua origem: teses de oportunidades diferentes não são uma conclusão única da empresa.
    for (const r of revisados.slice(0, 6)) item(`${{ evidencia: 'Evidência', tese: 'Tese', comparavel: 'Comparável', noticia: 'Notícia' }[r.tipo] || r.tipo}: ${r.titulo}${r.fonte ? ` (${r.fonte}${r.referencia ? `, ${r.referencia}` : ''})` : ''} · versão ${r.versao} · ${r.oportunidade}, ${r.espaco ? `espaço ${r.espaco}` : 'privada'}`);
  }
  for (const b of roteiro) { secao(b.titulo); for (const i of b.itens) item(i); }

  secao('Limites');
  item('O cadastro não informa faturamento, porte financeiro, intenção de venda ou interesse em contratar assessoria. As perguntas são sugestões de qualificação, não fatos sobre a empresa.', COR.suave);

  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(i); doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(COR.suave).text(
      `Confidencial · GHT4 · preparado por ${limpo(autor)} em ${data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${i + 1}/${paginas.count}`,
      45, doc.page.height - 30, { width: largura, align: 'center', lineBreak: false });
  }
  doc.end(); return pronto;
}
