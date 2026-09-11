import { readFile,stat } from 'node:fs/promises';
import { restaurarBackup } from '../server/src/operacao/backup.mjs';
import { perguntarSenha } from './entrada-segura.mjs';
if(process.argv.length!==4) {
  console.log('Uso: node ferramentas/restaurar-backup.mjs arquivo.ght4 nova-pasta\nEncerre o agente. O destino não pode existir. O arquivo deve ser um backup da própria GHT4.');process.exitCode=1;
} else {
  try {
    if((await stat(process.argv[2])).size>256*1024*1024)throw new Error('Arquivo excede o limite de 256 MB.');
    const senha=await perguntarSenha('Senha do backup: ');
    const r=await restaurarBackup(await readFile(process.argv[2]),senha,process.argv[3]);
    console.log(`Restaurado em ${r.destino}. Sessões e convites anteriores foram revogados.\nConfigure GHT4_DADOS_DIR com esta pasta e reinicie. A base anterior permanece no local original.`);
  } catch(e){console.error(e.code==='EEXIST'?'O destino já existe. Escolha uma pasta nova.':e.message);process.exitCode=1}
}
