import { createHash } from 'node:crypto';
import { ErroHttp } from '../app.mjs';
const protegidas=new Set(['/api/sessao','/api/instalacao','/api/convites/aceitar','/api/convites/consultar','/api/operacao/backup','/api/eu/senha']);
export function limitarAcesso(app) {
  app.addHook('preValidation',async(req,res)=>{
    const rota=req.url.split('?')[0];if(req.method!=='POST'||!protegidas.has(rota))return;
    const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase().slice(0,200):null;
    const chaves=[{chave:'ip:'+req.ip,max:120}];
    if(rota==='/api/sessao' && email)chaves.push({chave:'email:'+email,max:12});
    for(const item of chaves) {
      const hash=createHash('sha256').update(item.chave).digest('hex');
      const r=(await app.db.query(`INSERT INTO acesso_limites (chave) VALUES ($1)
        ON CONFLICT (chave) DO UPDATE SET
          tentativas=CASE WHEN acesso_limites.janela<now()-interval '15 minutes' THEN 1 ELSE acesso_limites.tentativas+1 END,
          janela=CASE WHEN acesso_limites.janela<now()-interval '15 minutes' THEN now() ELSE acesso_limites.janela END
        RETURNING tentativas`,[hash])).rows[0];
      if(r.tentativas>item.max){res.header('Retry-After','900');throw new ErroHttp(429,'acesso_limitado','Muitas tentativas de acesso. Aguarde 15 minutos antes de tentar novamente.')}
    }
    await app.db.query("DELETE FROM acesso_limites WHERE janela<now()-interval '1 day'");
  });
}
