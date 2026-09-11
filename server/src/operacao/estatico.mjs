import { readdir,readFile,realpath } from 'node:fs/promises';
import path from 'node:path';
export async function servirInterface(app,pasta) {
  const raiz=await realpath(pasta),arquivos=new Map();
  async function percorrer(dir) {
    for(const item of await readdir(dir,{withFileTypes:true})) {
      if(item.isSymbolicLink())continue;
      const absoluto=path.join(dir,item.name);
      if(item.isDirectory())await percorrer(absoluto);
      else if(/\.(html|js|css|svg|png|jpg|webp|ico|woff2?|ttf)$/.test(item.name))arquivos.set('/'+path.relative(raiz,absoluto).split(path.sep).join('/'),absoluto);
    }
  }
  await percorrer(raiz);
  if(!arquivos.has('/index.html'))throw new Error('Execute o build da interface antes de iniciar a instalação compartilhada.');
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
  app.get('/*',async(req,res)=>{
    let url;try{url=decodeURIComponent(req.url.split('?')[0])}catch{return res.status(400).send({erro:'caminho_invalido'})}
    const arquivo=arquivos.get(url==='/'?'/index.html':url);
    if(!arquivo)return res.status(404).send({erro:'nao_encontrado'});
    return res.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer')
      .header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
      .header('Cache-Control',url.startsWith('/assets/')?'public, max-age=3600':'no-store').type(mime[path.extname(arquivo)]).send(await readFile(arquivo));
  });
}
