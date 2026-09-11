import { Worker } from 'node:worker_threads';
let ativas=0;
export async function extrairDocumento(bytes,formato) {
  if(ativas>=2) throw new Error('extracao_ocupada');
  ativas++;
  try {
    return await new Promise((resolve) => {
      const w=new Worker(new URL('./extrair-worker.mjs',import.meta.url),{ workerData:{ bytes,formato },
        resourceLimits:{ maxOldGenerationSizeMb:128 },stdout:true,stderr:true });
      // Conteúdo do documento e mensagens do parser não vão para os logs da API.
      w.stdout.resume(); w.stderr.resume();
      let encerrado=false;
      function fim(r) { if(encerrado)return; encerrado=true; clearTimeout(prazo); void w.terminate(); resolve(r); }
      const prazo=setTimeout(() => fim({ estado:'falha_extracao',trechos:[] }),15000);
      w.on('message',(r) => fim(r.erro ? { estado:'falha_extracao',trechos:[] }
        : { estado:r.trechos.length ? 'extraido':'sem_texto',trechos:r.trechos }));
      w.on('error',() => fim({ estado:'falha_extracao',trechos:[] }));
      w.on('exit',() => fim({ estado:'falha_extracao',trechos:[] }));
    });
  } finally { ativas--; }
}
