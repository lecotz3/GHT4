import { createInterface } from 'node:readline/promises';
export async function perguntar(rotulo) {
  const rl=createInterface({input:process.stdin,output:process.stdout});
  try{return await rl.question(rotulo)}finally{rl.close()}
}
export function perguntarSenha(rotulo) {
  if(!process.stdin.isTTY)throw new Error('Use um terminal interativo para digitar a senha sem exibi-la.');
  process.stdout.write(rotulo);
  return new Promise((resolve,reject)=>{
    let valor='';
    const anterior=process.stdin.isRaw;
    const terminar=(erro)=>{process.stdin.off('data',ler);process.stdin.setRawMode(Boolean(anterior));process.stdin.pause();process.stdout.write('\n');erro?reject(erro):resolve(valor)};
    const ler=(bloco)=>{
      for(const c of bloco.toString('utf8')) {
        if(c==='\r'||c==='\n'){terminar();return}
        if(c==='\u0003'){terminar(new Error('Cancelado.'));return}
        if(c==='\u007f'||c==='\b')valor=Array.from(valor).slice(0,-1).join('');
        else if(c>=' ' && valor.length<256)valor+=c;
      }
    };
    process.stdin.setRawMode(true);process.stdin.resume();process.stdin.on('data',ler);
  });
}
