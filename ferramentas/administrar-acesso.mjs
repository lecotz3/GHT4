import { abrir,fechar } from '../server/src/db/cliente.mjs';
import { migrar } from '../server/src/db/migrar.mjs';
import { administrarAcesso } from '../server/src/operacao/acesso.mjs';
import { perguntar,perguntarSenha } from './entrada-segura.mjs';

const acao=process.argv[2];
if(!['iniciar','redefinir'].includes(acao) || process.argv.length!==3) {
  console.log('Uso: node ferramentas/administrar-acesso.mjs iniciar|redefinir\nUse o mesmo ambiente de banco do servidor. No modo local, encerre o agente antes. Senhas serão solicitadas sem eco.');
  process.exitCode=acao==='--ajuda'?0:1;
} else {
  try {
    const nome=acao==='iniciar'?await perguntar('Nome do administrador: '):undefined;
    const email=await perguntar('E-mail da conta: ');
    const senha=await perguntarSenha('Nova senha (mínimo 12 caracteres): ');
    if(senha!==await perguntarSenha('Repita a nova senha: '))throw new Error('As senhas não coincidem.');
    const db=await abrir();await migrar(db,{silencioso:true});
    const r=await administrarAcesso(db,{acao,nome,email,senha});
    console.log(r.criada?'Administrador e espaço piloto criados.':`Senha redefinida e sessões revogadas.${r.ativo?'':' A conta continua suspensa.'}`);
  } catch(e) {console.error(e.name==='ZodError'?'Confira nome, e-mail e senha de pelo menos 12 caracteres.':e.message);process.exitCode=1}
  finally{await fechar()}
}
