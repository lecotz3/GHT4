import { createCipheriv,createDecipheriv,randomBytes,scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { mkdir,realpath } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { registrar } from '../auditoria/registrar.mjs';
const entrada=createRequire(import.meta.url).resolve('@electric-sql/pglite');
const versao=JSON.parse(readFileSync(path.resolve(path.dirname(entrada),'../package.json'),'utf8')).version;
const scrypt=promisify(scryptCallback);
const MAX=256*1024*1024;
const aad=Buffer.from(`ght4-backup:1:pglite:${versao}`);
function senhaValida(senha){if(typeof senha!=='string'||senha.length<12||senha.length>256)throw new Error('A senha do backup deve ter entre 12 e 256 caracteres.')}
async function chave(senha,sal){return scrypt(senha,sal,32,{N:32768,r:8,p:1,maxmem:64*1024*1024})}

export async function criarBackup(db,senha) {
  senhaValida(senha);
  if(db.tipo!=='pglite')throw new Error('Use pg_dump para o banco compartilhado.');
  const bruto=Buffer.from(await (await db.dumpDataDir('gzip')).arrayBuffer());
  if(bruto.length>MAX/2)throw new Error('Backup excede o limite local. Solicite uma cópia ao operador.');
  const sal=randomBytes(16),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',await chave(senha,sal),iv);c.setAAD(aad);
  const cifrado=Buffer.concat([c.update(bruto),c.final()]);
  return Buffer.from(JSON.stringify({formato:'ght4-backup',versao:1,banco:'pglite',driver:versao,sal:sal.toString('base64'),iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),conteudo:cifrado.toString('base64')}));
}
function base64(texto,tamanho) {
  if(typeof texto!=='string')throw new Error('Backup inválido.');
  const b=Buffer.from(texto,'base64');
  if(b.toString('base64')!==texto || (tamanho && b.length!==tamanho))throw new Error('Backup inválido.');
  return b;
}
// Dumps PGlite usam nomes iniciados em / relativos ao PGDATA virtual.
// Só aceitamos arquivos e diretórios comuns: sem links, extensões TAR ou traversal.
function validarTar(gzip) {
  const tar=gunzipSync(gzip,{maxOutputLength:1024*1024*1024});let entradas=0;
  for(let i=0;i+512<=tar.length;) {
    const h=tar.subarray(i,i+512);if(h.every(b=>b===0))return;
    const nome=h.subarray(0,100).toString().split('\0')[0];
    if(!/^\/[A-Za-z0-9_./-]+$/.test(nome)||nome.split('/').some(p=>p==='..'||p==='.')||h.subarray(345,476).some(b=>b!==0)||![0,48,53].includes(h[156]))throw new Error('Arquivo de backup contém uma entrada não permitida.');
    const campo=h.subarray(124,136).toString().replaceAll('\0','').trim();
    if(!/^[0-7]+$/.test(campo))throw new Error('Tamanho inválido no backup.');
    const tamanho=parseInt(campo,8);i+=512+Math.ceil(tamanho/512)*512;
    if(i>tar.length || ++entradas>100000)throw new Error('Backup incompleto ou excessivo.');
  }
  throw new Error('Backup incompleto.');
}
export async function restaurarBackup(bytes,senha,destino) {
  senhaValida(senha);if(bytes.length>MAX)throw new Error('Arquivo excede o limite de restauração.');
  const p=JSON.parse(bytes.toString());
  if(p.formato!=='ght4-backup'||p.versao!==1||p.banco!=='pglite'||p.driver!==versao)throw new Error('Use a mesma versão do PGlite que gerou este backup.');
  const d=createDecipheriv('aes-256-gcm',await chave(senha,base64(p.sal,16)),base64(p.iv,12));d.setAAD(aad);d.setAuthTag(base64(p.tag,16));
  let bruto;try{bruto=Buffer.concat([d.update(base64(p.conteudo)),d.final()])}catch{throw new Error('Senha incorreta ou backup adulterado. Nenhuma pasta foi criada.')}
  validarTar(bruto);
  const resolvido=path.resolve(destino),pai=await realpath(path.dirname(resolvido)),alvo=path.join(pai,path.basename(resolvido));
  await mkdir(alvo,{recursive:false,mode:0o700}); // EEXIST nunca sobrescreve uma base.
  let db;
  try {
    db=await PGlite.create({dataDir:alvo,loadDataDir:new Blob([bruto])});
    await db.transaction(async tx=>{
      await tx.query('UPDATE sessoes SET encerrada_em=now() WHERE encerrada_em IS NULL');
      await tx.query('UPDATE convites_equipe SET revogado_em=now() WHERE usado_em IS NULL AND revogado_em IS NULL');
      await registrar(tx,{entidade:'operacao',entidadeId:'restauracao',acao:'restaurar_backup',justificativa:'Cópia restaurada em novo diretório. Sessões e convites anteriores revogados.'});
    });
    return {destino:alvo,migracoes:(await db.query('SELECT nome FROM migracoes ORDER BY nome')).rows.map(r=>r.nome)};
  } finally {if(db)await db.close()}
}
