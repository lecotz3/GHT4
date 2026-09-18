# Agente completo na Vercel

Destino solicitado pelo usuário: projeto existente `leoleal11/ght-4`. Interface React e API Fastify são publicadas juntas; o PostgreSQL fica no Supabase (`sa-east-1`, São Paulo), alcançado pelo pooler compartilhado. O `render.yaml` é uma alternativa de piloto, não o deployment final escolhido.

## Configuração

- Raiz: raiz do Git, onde ficam `vercel.json`, `api/` e `v1/`.
- Node: 24.x; preset Vite; saída `v1/dist`.
- Instalação e build: usar os valores versionados em `vercel.json` (dependências de interface e servidor).
- A versão completa está integrada à `main`, branch de produção do projeto. Publicar o commit atual dessa branch; repetir um deployment antigo não inclui os arquivos novos.
- Manter um único projeto na Vercel apontando para este repositório. A detecção de monorepo já criou um projeto paralelo chamado `server`, com Root Directory `server`, que falhava em segundos a cada push: herdava o `vercel.json` da raiz e executava `cd v1` de dentro de `server/`.

Variáveis configuradas somente em **Production**, com valores secretos fora do Git:

| Nome | Valor / função |
| --- | --- |
| `POSTGRES_URL` | Escrita pela integração Supabase↔Vercel e **preferida na instalação atual**: é gerada pelo próprio Supabase, com a senha já codificada, e re-sincroniza sozinha depois de um "Reset database password". Montar a string à mão custou cinco deploys falhos a caracteres reservados mal codificados. |
| `DATABASE_URL` | Opcional, tem precedência sobre a anterior. Pooler de **transação** do Supabase, porta 6543: `postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:6543/postgres`. A conexão direta do Supabase é IPv6 e a Vercel não a alcança; o pooler compartilhado é IPv4. Se a senha contiver caractere reservado de URL (`@`, `/`, `:`, `#`), codificar em percent — sem isso o libpq corta a string no primeiro `@` e trata o resto como nome de socket local. |
| `DATABASE_URL_DIRETA` | Opcional. Sem ela, `urlDireta()` deriva a porta 5432 a partir da 6543. |
| `PG_POOL_MAX` | `5`, inicialmente; acompanhar o total de conexões com a escala. |
| `GHT4_ORIGEM_PUBLICA` | `https://ght-4.vercel.app` |
| `GHT4_ADMIN_EMAIL` | E-mail escolhido pelo administrador, apenas para a primeira instalação. |
| `GHT4_ADMIN_NOME` | Nome do administrador. |
| `GHT4_ADMIN_SENHA_INICIAL` | Definida pelo usuário na hospedagem, pelo menos 12 caracteres. Remover após confirmar a primeira entrada. |

Na instalação atual, o usuário cadastrou a senha com a chave secreta `ght4`. O bootstrap aceita essa chave como alias quando `GHT4_ADMIN_SENHA_INICIAL` não está definida. Ela segue as mesmas validações e só serve para criar o primeiro administrador; contas existentes nunca têm a senha redefinida pelo build.

`POSTGRES_URL` é aceita como alias de `DATABASE_URL`, porque é o nome que a integração Supabase↔Vercel cadastra. `DATABASE_URL` tem precedência. A integração **não** re-sincroniza as variáveis depois de um "Reset database password" no Supabase: as cópias dela ficam com a senha antiga. Por isso a instalação define `DATABASE_URL` explicitamente em vez de depender do que a integração escreveu.

Migrations, advisory lock e importação do catálogo precisam de uma sessão que sobreviva ao fim da transação. O pooler de transação (6543) devolve a conexão ao pool a cada commit, e ali o `pg_advisory_lock` evapora — dois deploys simultâneos deixariam de ser serializados. Daí a conexão de sessão separada (5432).

Não configurar `PG_TLS_MODE=disable`, `PGSSL_INSEGURO=1`, `GHT4_APENAS_LOCAL=1` ou bootstrap público. A conexão externa valida TLS. A cadeia do Supabase ancora em `Supabase Root 2021 CA`, que não está no bundle de raízes do Node: a raiz é embarcada em `server/src/db/ca-supabase.mjs` e passada como `ca` ao driver. Sem ela a conexão morre com `SELF_SIGNED_CERT_IN_CHAIN` antes mesmo de enviar a senha. Essa raiz expira em 2031; `server/tests/conexao-hospedagem.test.mjs` falha quando isso se aproximar. Não colocar segredos em variáveis `VITE_*`.

A `POSTGRES_URL` da integração vem com `?sslmode=require`. O `pg` monta a própria configuração de TLS a partir desse parâmetro e **sobrepõe** a que passamos em `ssl`, levando junto a raiz embarcada: o deploy morre em `SELF_SIGNED_CERT_IN_CHAIN` com a CA correta ali no código. Por isso `semParametrosTls()` tira os parâmetros de TLS da string antes de ela chegar ao pool. Uma `DATABASE_URL` escrita à mão não costuma ter query nenhuma, e esse caminho fica invisível até a integração entrar em uso.

O build de Production exige banco configurado, aplica migrations e importa o catálogo antes da publicação. Chamadas comuns da API não executam migrations. Importação em transação: se falhar, o snapshot anterior continua ativo. O administrador inicial só é criado se não houver usuários; o mesmo ambiente não redefine a senha de contas existentes.

Preview recebe o build da interface, mas não deve receber os segredos do banco de produção. Para testar a API em Preview, preparar um banco isolado e configurar explicitamente suas variáveis nesse ambiente.

## Mudar de hospedagem de banco

O schema e o catálogo deste projeto são reprodutíveis: as migrations versionadas criam as tabelas e `data-quimicos.js`, no repositório, gera os 38.583 registros. Um banco novo se constrói rodando `node ferramentas/preparar-banco.mjs` com `DATABASE_URL` apontando para ele — não é preciso `pg_dump`, e isso evita restaurar entre versões diferentes do PostgreSQL, que não é suportado para trás.

Só a conta de administrador e suas linhas associadas (`usuarios`, `mandatos`, `mandato_membros`, `auditoria`, `instalacao_inicial`, `acesso_limites`) não se reproduzem — o próprio build de Production as recria a partir de `GHT4_ADMIN_EMAIL` e da senha inicial.

`ferramentas/migrar-banco.mjs` existe para o caso em que houver dado de verdade a preservar. Ele copia um Postgres inteiro para outro via Docker, com as credenciais entrando por ambiente e nunca por argumento. O cliente precisa ser de versão maior ou igual à do servidor de **origem**.

## Verificação antes de declarar a entrega

1. Confirmar commit e status Ready no deployment Production.
2. Abrir `/` e `/api/saude` no domínio final; saúde deve responder JSON com `ok: true`.
3. Sem sessão, `/api/eu` deve negar acesso; bootstrap administrativo público deve continuar indisponível.
4. Entrar com a conta remota, executar busca e confirmar total e referência; salvar trabalho e conferir persistência após nova sessão.
5. Remover a senha inicial do ambiente depois do primeiro acesso. A senha derivada permanece no banco; não se deve copiar a pasta PGlite local para a Vercel.

## Continuidade e limites

O banco Free do Render expirava em 15/10/2026 e não oferecia a recuperação dos planos pagos; foi o que motivou a mudança para o Supabase. O Free do Supabase tem o seu próprio limite: **pausa o projeto após uma semana sem atividade**, e um deploy contra banco pausado falha na preparação. Este projeto já foi encontrado pausado uma vez. Para uso contínuo, avaliar o plano Pro, que também libera as configurações de compute e os backups. A configuração do código não ativa backups pagos nem armazenamento externo de documentos. Documentos do agente atualmente permanecem no banco; armazenamento de objetos para arquivos grandes é evolução separada. Nenhum provedor de IA foi contratado/configurado automaticamente.

O compute é `t4g.nano` (NANO, até 0,5 GB de memória) e o pooler compartilhado oferece um número limitado de conexões. `PG_POOL_MAX` multiplica por instância de função: manter baixo.

O schema suporta empresas e estabelecimentos separados; a importação atual dispõe somente de CNPJ raiz e não inventa filiais. O catálogo bruto tem 38.583 registros, incluindo outros subsegmentos e exclusões. A interface operacional ainda consulta o piloto de distribuição química.

Fontes: [Vercel Node.js](https://vercel.com/docs/functions/runtimes/node-js), [variáveis de ambiente](https://vercel.com/docs/environment-variables), [pooler do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [limites do Supabase Free](https://supabase.com/docs/guides/platform/billing-on-supabase).
