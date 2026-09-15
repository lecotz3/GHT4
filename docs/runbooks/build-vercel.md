# Build da interface na Vercel

## Correção do erro 127

O log informado em 14/09/2026 termina em `sh: line 1: tsc: command not found`. A Vercel executou a instalação na raiz, cujo `package.json` não tem dependências. O build da raiz delega para `v1`, onde estão TypeScript, Vite e o lockfile. A instalação padrão da raiz não instala esse subprojeto.

O `vercel.json` da raiz define a instalação correta, incluindo as dependências de desenvolvimento necessárias para compilar. Não é necessário instalar TypeScript globalmente ou mover o compilador para dependências de produção.

| Configuração | Valor |
| --- | --- |
| Root Directory | Raiz do repositório (`.`); deixar o campo vazio quando essa for a representação da raiz no painel |
| Framework Preset | Vite |
| Install Command | `npm ci --prefix v1 --include=dev` |
| Build Command | `npm run build` |
| Output Directory | `v1/dist` |
| Node.js Version | `24.x` |

O Node da raiz fica em `24.x`, alinhado ao CI e ao Dockerfile. Isso também elimina o aviso sobre futuras atualizações automáticas de versão principal causado por `>=22`.

Após disponibilizar o commit na branch usada pelo projeto da Vercel, criar um deployment desse commit. Repetir o deployment de um commit antigo não inclui a correção. Conferir o hash no log; se necessário, refazer sem reutilizar o cache anterior. Para corrigir pelo painel enquanto a branch ainda não recebeu o arquivo, aplicar os mesmos valores da tabela.

Manter a raiz em `.`: a interface usa módulos e dados de outras pastas do repositório. O caminho local duplicado `GHT4/GHT4` não deve ser copiado para a configuração; o diretório que contém este `vercel.json` é a raiz do Git.

## Verificação reproduzível

Em um clone limpo e com Node 24:

```sh
npm ci --prefix v1 --include=dev
npm run build
```

O resultado esperado é TypeScript e Vite com código de saída zero e `v1/dist/index.html`, ativos da interface e `data-real.js` gerados. A existência de `node_modules` na máquina do desenvolvedor não comprova que a instalação na Vercel esteja correta; testar em uma cópia sem dependências pré-instaladas.

Verificação realizada em 15/09/2026 em cópia isolada no Windows, Node 24.14.1: 63 pacotes instalados pelo lockfile; TypeScript e Vite 8.2.1 concluíram com saída zero, 473 módulos compilados. O resultado remoto depende de executar um novo deployment na Vercel com a configuração corrigida; não foi verificado nesta etapa.

## Limite desta configuração

Este arquivo publica a interface compilada. O agente operacional usa a API Fastify em `server/`, que atende autenticação, catálogo, conversas e CRM; os dados persistentes ficam no banco. Esses serviços não são implantados pelo build do Vite. O proxy `/api` em `vite.config.ts` só atende ao desenvolvimento local.

Assim, build verde na Vercel não comprova login ou agente online. A implantação completa exige API e Postgres persistente, uma origem HTTPS configurada e as rotas `/api` atendidas no mesmo domínio da interface. A Vercel suporta Fastify, mas o servidor atual exige adaptação e validação do ciclo de execução, arquivos, migrações, conexões e operação antes de ser usado como Function. A alternativa de implantação conjunta em container já está descrita em [implantação privada](implantacao-privada.md). Escolher e configurar o destino da API/banco é uma etapa separada; não inventar uma URL de backend nem usar o banco local em uma função efêmera.

Não copiar senhas ou chaves para variáveis `VITE_*`, que entram no código entregue ao navegador. Conferir saúde da API, entrada na conta, busca e persistência entre sessões antes de declarar a implantação completa.

## Referências

- [Configuração versionada da Vercel](https://vercel.com/docs/project-configuration/vercel-json): `installCommand`, `buildCommand`, `framework` e `outputDirectory`.
- [Versões do Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions): seleção por `engines.node`.
- [Fastify na Vercel](https://vercel.com/docs/frameworks/backend/fastify): detecção e execução como Function.
