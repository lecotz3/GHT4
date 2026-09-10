from pathlib import Path
import os,sys,importlib.util,json
from pypdf import PdfReader

base=Path(__file__).parent
skill=Path(r'C:\Users\Leonardo\.codex\plugins\cache\openai-primary-runtime\documents\26.909.12148\skills\documents')
os.environ['PATH']=r'C:\Users\Leonardo\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'+os.pathsep+os.environ['PATH']
spec=importlib.util.spec_from_file_location('canonical_renderer',skill/'render_docx.py')
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
pdf=base/'qa'/'final'/'planejamento.pdf'
def existing_pdf(*args,**kwargs):
    assert pdf.exists() and pdf.stat().st_size>0
    return str(pdf),'Conversão nativa pelo Microsoft Word; LibreOffice indisponível. PDF validado e rasterização pelo renderizador canônico.'
renderer.convert_to_pdf=existing_pdf
sys.argv=[str(skill/'render_docx.py'),str(base/'GHT4 Pesquisa Ampliada de Prospeccao MA.docx'),'--output_dir',str(base/'qa'/'paginas-finais'),'--dpi','105']
renderer.main()
reader=PdfReader(pdf)
pages=[]
for i,p in enumerate(reader.pages):
    text=p.extract_text()
    pages.append({'page':i+1,'characters':len(text),'start':text[:170],'end':text[-160:]})
(base/'qa'/'page-text.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2),encoding='utf-8')
(base/'qa'/'texto-renderizado.txt').write_text('\n\n'.join(f'PAGE {i+1}\n'+p.extract_text() for i,p in enumerate(reader.pages)),encoding='utf-8')
print('Pages',len(reader.pages));print(json.dumps([{'page':p['page'],'chars':p['characters']} for p in pages]))
