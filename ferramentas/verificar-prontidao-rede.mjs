import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { abrir,fechar,urlDireta,descreverAlvo } from '../server/src/db/cliente.mjs';
import { migracoesEmDisco } from '../server/src/db/migrar.mjs';
const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export function avaliarConfiguracao(env=process.env) {
  return {
    bancoConfigurado:Boolean(env.DATABASE_URL_DIRETA||env.DATABASE_URL||env.POSTGRES_URL),
    apenasLocal:env.GHT4_APENAS_LOCAL==='1',
    redefinicaoAdminPendente:Boolean(env.GHT4_ADMIN_SENHA_REDEFINIR),
    iaConfigurada:Boolean(env.GHT4_IA_PROVEDOR&&env.GHT4_IA_MODELO&&env.OPENAI_API_KEY),
  };
}
export async function verificarProntidao({conectar=false}={}) {
  const config=avaliarConfiguracao();
  const resultado={configuracao:config,destino:descreverAlvo(urlDireta()),quadroDisponivel:existsSync(path.join(raiz,'.cache/quadro-societario-2026-08.js')),
    migracoesEsperadas:migracoesEmDisco().length,conexao:'nao_testada',pendencias:[],rede:null};
  if(!config.bancoConfigurado) resultado.pendencias.push('Configurar a credencial válida do PostgreSQL no ambiente do operador.');
  if(config.apenasLocal) resultado.pendencias.push('Desligar GHT4_APENAS_LOCAL para ativar a instalação compartilhada.');
  if(config.redefinicaoAdminPendente) resultado.pendencias.push('Depois de conferir o acesso do administrador, retirar GHT4_ADMIN_SENHA_REDEFINIR do ambiente.');
  if(!resultado.quadroDisponivel) resultado.pendencias.push('Reconstruir o arquivo de dirigentes: node ferramentas/dimensionar-quadro-societario.mjs --mes=2026-08 --cache');
  if(conectar&&config.bancoConfigurado&&!config.apenasLocal){
    try{
      const db=await abrir({url:urlDireta()});await db.query('SELECT 1');resultado.conexao='ok';
      const existe=(await db.query("SELECT to_regclass('public.migracoes') IS NOT NULL AS existe")).rows[0].existe;
      const aplicadas=existe?(await db.query('SELECT nome,hash FROM migracoes')).rows:[];
      const divergentes=migracoesEmDisco().filter(m=>!aplicadas.some(a=>a.nome===m.nome&&a.hash===m.hash));
      if(divergentes.length) resultado.pendencias.push(`Aplicar/verificar ${divergentes.length} migrações pelo deploy antes de importar.`);
      else{
        resultado.rede=(await db.query(`SELECT
          (SELECT count(*)::int FROM usuarios WHERE ativo AND papel='admin') AS administradores,
          (SELECT count(*)::int FROM rede_pessoas WHERE ativo AND lado='ght4') AS membros,
          (SELECT count(*)::int FROM rede_pessoas WHERE ativo AND lado='ght4' AND usuario_id IS NOT NULL) AS membros_com_conta,
          (SELECT count(*)::int FROM rede_pessoas WHERE ativo AND lado='mercado') AS pessoas_das_empresas,
          (SELECT count(*)::int FROM rede_pessoas WHERE ativo AND origem='cadastro_publico') AS dirigentes_publicos,
          (SELECT count(*)::int FROM rede_vinculos WHERE ativo) AS vinculos,
          (SELECT count(*)::int FROM rede_reconhecimentos) AS respostas`)).rows[0];
        if(!resultado.rede.administradores)resultado.pendencias.push('Configurar o primeiro administrador na hospedagem.');
        if(!resultado.rede.dirigentes_publicos)resultado.pendencias.push('Executar a importação dos dirigentes com o destino conferido.');
        if(!resultado.rede.membros)resultado.pendencias.push('Cadastrar os participantes informados pela GHT4 e vincular suas contas.');
        if(!resultado.rede.respostas)resultado.pendencias.push('Pedir aos participantes a rodada de reconhecimento.');
      }
    }catch(e){resultado.conexao='falhou';resultado.pendencias.push(e.code==='28P01'?'Credencial do PostgreSQL recusada. Obter a atual com o administrador da hospedagem.':`Não foi possível consultar o banco (${/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'erro de conexão'}). Conferir acesso e disponibilidade com o operador.`)}
    finally{await fechar()}
  }
  // A presença de uma chave não comprova conta ativa, crédito ou modelo acessível.
  resultado.ia='Opcional para busca, rede, reconhecimento e rascunhos por roteiro. Credencial presente não equivale a teste do provedor.';
  return resultado;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const r=await verificarProntidao({conectar:process.argv.includes('--conectar')});
  if(process.argv.includes('--json'))console.log(JSON.stringify(r,null,2));
  else{
    console.log('GHT4 · prontidão da rede (verificação sem escrita)');
    console.log(`Banco: ${r.destino} · conexão: ${r.conexao}`);
    console.log(`Arquivo de dirigentes: ${r.quadroDisponivel?'disponível':'ausente'}`);
    if(r.rede)console.log(JSON.stringify(r.rede,null,2));
    for(const p of r.pendencias)console.log(`Pendente: ${p}`);
    console.log(r.ia);
  }
  if(r.pendencias.length)process.exitCode=2;
}
