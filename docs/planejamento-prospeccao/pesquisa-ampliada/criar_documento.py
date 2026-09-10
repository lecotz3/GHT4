from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from copy import deepcopy
from lxml import etree as E
import json, re, hashlib

BASE = Path(__file__).parent
REF = Path(r'C:\Users\Leonardo\.codex\plugins\cache\openai-curated-remote\openai-templates\0.1.1\skills\artifact-template-strategy-memorandum\assets\reference.docx')
OUT = BASE / 'GHT4 Pesquisa Ampliada de Prospeccao MA.docx'
assert hashlib.sha256(REF.read_bytes()).hexdigest() == '13bd3ae7aef4b3ae76c5d65200acd654c922782974dac18672e973fad93bd453'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
NS = {'w': W, 'r': R}
def q(x): return '{'+W+'}'+x
def el(x, **attrs):
    t=E.Element(q(x))
    for k,v in attrs.items(): t.set(q(k), str(v))
    return t
def ser(x): return E.tostring(x, encoding='UTF-8', xml_declaration=True, standalone=True)
with ZipFile(REF) as z: parts={n:z.read(n) for n in z.namelist()}
root=E.fromstring(parts['word/document.xml']); body=root.find(q('body'))
ps=body.findall(q('p')); tbls=body.findall(q('tbl'))
protos={'Title':deepcopy(ps[3]),'Heading1':deepcopy(ps[31]),'Heading2':deepcopy(ps[39]),'Normal':deepcopy(ps[32]),'Bullet':deepcopy(ps[59])}
table_proto=deepcopy(tbls[2]); meta_proto=deepcopy(tbls[0])
section=deepcopy(body.find(q('sectPr')))
for child in list(body): body.remove(child)
sources={x['id']:x for x in json.loads((BASE/'fontes.json').read_text(encoding='utf-8'))}
notes=E.fromstring(parts['word/footnotes.xml'])
for note in list(notes):
    if int(note.get(q('id'),'0'))>0: notes.remove(note)
note_rels=E.Element('{'+PKG+'}Relationships', nsmap={None:PKG})
next_note=1

def run(text, bold=False, italic=False, size=None):
    r=el('r'); pr=el('rPr')
    pr.append(el('rFonts',ascii='Helvetica Neue',hAnsi='Helvetica Neue',eastAsia='Helvetica Neue',cs='Helvetica Neue'))
    if bold: pr.append(el('b'))
    if italic: pr.append(el('i'))
    if size:
        pr.append(el('sz',val=size)); pr.append(el('szCs',val=size))
    if len(pr):r.append(pr)
    t=el('t');t.set('{http://www.w3.org/XML/1998/namespace}space','preserve');t.text=text;r.append(t)
    return r

def hyperlink(parent,text,url,rels,size=18):
    rid='rIdGHTLink'+str(len(rels)+1)
    rel=E.SubElement(rels,'{'+PKG+'}Relationship',Id=rid,Type=R+'/hyperlink',Target=url,TargetMode='External')
    h=el('hyperlink');h.set('{'+R+'}id',rid)
    rr=run(text,size=size);pr=rr.find(q('rPr'))
    pr.append(el('color',val='112075'));pr.append(el('u',val='single'))
    h.append(rr);parent.append(h)

def footnote(source_id):
    global next_note
    sid=next_note;next_note+=1;s=sources[source_id]
    note=el('footnote',id=sid);p=el('p');pp=el('pPr')
    pp.append(el('spacing',after=45,line=220,lineRule='auto'));p.append(pp)
    r=el('r');pr=el('rPr');pr.append(el('vertAlign',val='superscript'));r.append(pr);r.append(el('footnoteRef'));p.append(r)
    p.append(run(' '+s['author']+'. ',size=18))
    if s['url']: hyperlink(p,s['title'],s['url'],note_rels)
    else:p.append(run(s['title'],size=18))
    p.append(run('. '+s['date']+'.',size=18))
    if source_id==1:p.append(run(' Fonte interna; seções 1 a 12.',size=18))
    note.append(p);notes.append(note)
    rr=el('r');pr=el('rPr');pr.append(el('vertAlign',val='superscript'));rr.append(pr);rr.append(el('footnoteReference',id=sid))
    return rr

def add_inline(p,text):
    previous_note=False
    for token in re.split(r'(\[\^\d+\]|\*\*.*?\*\*)',text):
        if not token:continue
        if re.fullmatch(r'\[\^\d+\]',token):
            if previous_note:
                comma=run('\u2060,\u00a0');comma.find(q('rPr')).append(el('vertAlign',val='superscript'));p.append(comma)
            p.append(footnote(int(token[2:-1])));previous_note=True
        elif token.startswith('**') and token.endswith('**'):p.append(run(token[2:-2],bold=True));previous_note=False
        else:p.append(run(token));previous_note=False

def paragraph(text='',kind='Normal',page_before=False):
    p=deepcopy(protos[kind]);
    for c in list(p):
        if c.tag!=q('pPr'):p.remove(c)
    for a in list(p.attrib): del p.attrib[a]
    pp=p.find(q('pPr'))
    if pp is None:pp=el('pPr');p.insert(0,pp)
    if kind.startswith('Heading'):
        pp.append(el('keepNext'));pp.append(el('keepLines'))
    if page_before:pp.append(el('pageBreakBefore'))
    add_inline(p,text)
    return p

def add_table(rows, widths=None):
    n=len(rows[0]);t=deepcopy(table_proto)
    head=deepcopy(t.findall(q('tr'))[0]);ordinary=deepcopy(t.findall(q('tr'))[1])
    for rr in t.findall(q('tr')):t.remove(rr)
    if widths is None:
        weights={2:[1,1],3:[1.1,1.6,1.6],4:[1.1,1.45,1.45,1.1],5:[.5,.6,2.4,1.05,1.35]}.get(n,[1]*n)
        widths=[round(9360*x/sum(weights)) for x in weights];widths[-1]=9360-sum(widths[:-1])
    grid=t.find(q('tblGrid'))
    for c in list(grid):grid.remove(c)
    for w in widths:grid.append(el('gridCol',w=w))
    for i,values in enumerate(rows):
        tr=deepcopy(head if i==0 else ordinary)
        template_cells=tr.findall(q('tc'));proto=deepcopy(template_cells[0])
        for tc in template_cells:tr.remove(tc)
        trpr=tr.find(q('trPr'))
        if trpr is None:trpr=el('trPr');tr.insert(0,trpr)
        trpr.append(el('cantSplit'))
        for j,text in enumerate(values):
            tc=deepcopy(proto);tcpr=tc.find(q('tcPr'));tcpr.find(q('tcW')).set(q('w'),str(widths[j]))
            shd=tcpr.find(q('shd'))
            if shd is None:shd=el('shd',val='clear');tcpr.append(shd)
            shd.set(q('fill'),'112075' if i==0 else ('F2F5FA' if i%2==0 else 'FFFFFF'))
            for p in tc.findall(q('p')):tc.remove(p)
            p=el('p');pp=el('pPr');pp.append(el('spacing',after=35,before=35,line=240,lineRule='auto'))
            pp.append(el('jc',val='center' if (n==5 and j<2) or text.endswith('%') else 'left'));p.append(pp)
            rr=run(text,bold=i==0,size=20);pr=rr.find(q('rPr'));pr.append(el('rFonts',ascii='Helvetica Neue',hAnsi='Helvetica Neue'))
            pr.append(el('color',val='FFFFFF' if i==0 else '000000'));p.append(rr);tc.append(p);tr.append(tc)
        t.append(tr)
    body.append(t)
    spacer=paragraph();pp=spacer.find(q('pPr'));pp.append(el('spacing',after=35,line=60,lineRule='exact'));body.append(spacer)

# Cover reuses original title, metadata and recurring page furniture.
p=paragraph('Pesquisa ampliada de prospecção GHT4','Title')
pp=p.find(q('pPr'));sp=el('spacing',before=1080,after=360);pp.append(sp);body.append(p)
p=paragraph('Evidências e refinamentos para originação de mandatos e ferramenta de IA')
p.find(q('pPr')).append(el('jc',val='center'));body.append(p)
meta=[['Tema','Originação e suporte a mandatos de compra e venda'],['Piloto','Distribuição e Trading Químico'],['Destinatários','Sócios, equipe Advisory e responsável técnico'],['Data de corte','10 de setembro de 2026'],['Versão','Pesquisa ampliada e refinamentos do planejamento']]
mt=deepcopy(meta_proto)
for row,vals in zip(mt.findall(q('tr')),meta):
    for cell,txt in zip(row.findall(q('tc')),vals):
        p=cell.find(q('p'));pr=deepcopy(p.find(q('pPr')));r0=p.find(q('r'));rp=deepcopy(r0.find(q('rPr'))) if r0 is not None else None
        for c in list(p):p.remove(c)
        if pr is not None:p.append(pr)
        rr=run(txt)
        if rp is not None:rr.insert(0,rp)
        p.append(rr)
sp=paragraph();sp.find(q('pPr')).append(el('spacing',before=1400,after=0));body.append(sp);body.append(mt)
p=paragraph('Documento destinado à GHT4 para orientar prioridades, operação e implementação. Metas e estimativas propostas dependem de validação pelos responsáveis.');body.append(p)

text=(BASE/'plano.md').read_text(encoding='utf-8')+'\n'+(BASE/'plano-parte-2.md').read_text(encoding='utf-8')
lines=text.splitlines()
headings=[x[3:] for x in lines if x.startswith('## ')]
body.append(paragraph('Conteúdo','Heading1',True))
for h in headings:
    p=paragraph();link=el('hyperlink',anchor='ghtsection'+h.split()[0]);link.append(run(h));p.append(link);body.append(p)
body.append(paragraph('Leitura sugerida: a seção 1 apresenta as decisões; 2 a 7 aprofundam evidências e mercado; 8 a 11 refinam a ferramenta; 12 e 13 orientam incorporação e aceite.'))

docrels=E.fromstring(parts['word/_rels/document.xml.rels'])
source_links=docrels
i=0
new_pages={1}
while i<len(lines):
    line=lines[i].strip()
    if not line or line.startswith('# '):i+=1;continue
    if line=='{{SOURCES}}':
        for sid,s in sources.items():
            p=paragraph();p.append(run(str(sid)+'. '+s['author']+'. ',bold=True))
            if s['url']:hyperlink(p,s['title'],s['url'],source_links,size=22)
            else:p.append(run(s['title']))
            p.append(run('. '+s['date']+'. '+s['note']));body.append(p)
        i+=1;continue
    if line.startswith('## '):
        h=line[3:];chapter=int(h.split()[0]);p=paragraph(h,'Heading1',chapter in new_pages)
        p.insert(1,el('bookmarkStart',id=100+chapter,name='ghtsection'+str(chapter)))
        p.append(el('bookmarkEnd',id=100+chapter));body.append(p);i+=1;continue
    if line.startswith('### '):body.append(paragraph(line[4:],'Heading2'));i+=1;continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            vals=[v.strip() for v in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[-: ]+',v) for v in vals):rows.append(['Prio' if v=='Prioridade' else v for v in vals])
            i+=1
        add_table(rows);continue
    if line.startswith('- '):body.append(paragraph(line[2:],'Bullet'));i+=1;continue
    body.append(paragraph(line));i+=1
body.append(section)

# Source links use unique relationship IDs even though original image/header relationships are retained.
ids=[]
for rel in docrels:
    rid=rel.get('Id')
    if rid in ids:
        new='rIdGHT'+str(len(ids)+1)
        # Only newly added source hyperlinks point at that most recently created number.
        for h in root.findall('.//'+q('hyperlink')):
            if h.get('{'+R+'}id')==rid:h.set('{'+R+'}id',new)
        rel.set('Id',new);rid=new
    ids.append(rid)

parts['word/document.xml']=ser(root)
parts['word/footnotes.xml']=ser(notes)
parts['word/_rels/footnotes.xml.rels']=ser(note_rels)
parts['word/_rels/document.xml.rels']=ser(docrels)
settings=E.fromstring(parts['word/settings.xml'])
uf=settings.find(q('updateFields'))
if uf is None:uf=el('updateFields');settings.append(uf)
uf.set(q('val'),'true');parts['word/settings.xml']=ser(settings)
for path,replacements in [('word/header1.xml',{'Strategy Memo':'GHT4 Advisory'}),('word/footer1.xml',{'[Confidentiality] — ':'Confidencial  |  Uso interno  |  ',' of ':' de '})]:
    rr=E.fromstring(parts[path])
    for node in rr.findall('.//'+q('t')):
        if node.text in replacements:node.text=replacements[node.text]
    parts[path]=ser(rr)
core=E.fromstring(parts['docProps/core.xml'])
for node in core:
    name=E.QName(node).localname
    if name=='title':node.text='Pesquisa ampliada de prospecção GHT4'
    if name in ('creator','lastModifiedBy'):node.text=''
    if name=='description':node.text='Pesquisa ampliada e refinamentos de prospecção M&A para GHT4'
parts['docProps/core.xml']=ser(core)

with ZipFile(OUT,'w',ZIP_DEFLATED) as z:
    for n,data in parts.items():z.writestr(n,data)
allowed={'word/document.xml','word/header1.xml','word/footer1.xml','word/footnotes.xml','word/settings.xml','docProps/core.xml','word/_rels/document.xml.rels'}
with ZipFile(REF) as z:
    changed=[n for n in z.namelist() if z.read(n)!=parts[n]]
assert set(changed)<=allowed,changed
assert b'Lorem ipsum' not in parts['word/document.xml']
assert not root.findall('.//'+q('drawing'))
assert len(set(x.get('Id') for x in docrels))==len(docrels)
(BASE/'qa'/'package-check.json').write_text(json.dumps({'changed':changed,'preserved_parts':len(parts)-len(changed)-1,'footnotes':next_note-1,'sections':len(root.findall('.//'+q('sectPr'))),'source_reference_sha256':hashlib.sha256(REF.read_bytes()).hexdigest()},indent=2),encoding='utf-8')
print(OUT)
print('Paragraphs',len(body.findall(q('p'))),'Tables',len(body.findall(q('tbl'))),'Footnotes',next_note-1)
