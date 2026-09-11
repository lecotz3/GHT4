# Implantação privada e continuidade

Preparação de 11/09/2026. A GHT4 ainda não escolheu hospedagem nem provedor de IA. Este pacote não foi publicado. O build da interface e os testes locais são verificáveis; Docker, Postgres em rede, certificados e uso em duas máquinas precisam ser ensaiados no destino escolhido.

## Desenho entregue

Uma instalação atende a boutique: Caddy recebe HTTPS, a API entrega a interface compilada e acessa Postgres 17. Banco e API não expõem portas ao host. A porta 443 fica vinculada a `127.0.0.1` por padrão; o operador deve escolher o endereço da rede privada/VPN e restringir o firewall. Não escalar a API antes do ensaio de concorrência e migrações.

Arquivos: `Dockerfile`, `.dockerignore`, `implantacao/compose.yaml`, `implantacao/Caddyfile` e `implantacao/api.env.example`. As versões exatas das dependências JavaScript estão nos lockfiles; as imagens Docker usam tags de versão e devem ter seus digests registrados no ensaio de implantação.

## Preparar o servidor

1. Disponibilizar um host com Docker e Compose, disco persistente e política de backup. Clonar o commit aprovado. Não copiar `node_modules` nem a pasta local `.dados` para o container.
2. Em `implantacao`, criar `segredos` com acesso somente ao operador. Criar `segredos/senha-banco.txt` com uma senha aleatória forte. Criar `segredos/api.env` a partir de `api.env.example`; usar a mesma senha, codificada para URL, em `DATABASE_URL=postgresql://ght4:...@db:5432/ght4`. Esses arquivos estão ignorados pelo Git. Não registrar seu conteúdo em terminal compartilhado.
3. Criar `implantacao/.env` com `GHT4_DOMINIO` e `GHT4_IP_BIND`. O domínio deve resolver para o IP privado do servidor. Em `segredos/api.env`, definir `GHT4_ORIGEM_PUBLICA=https://<mesmo-dominio>`, sem barra final. Não usar os exemplos literais.
4. `PG_TLS_MODE=disable` no Compose vale somente para o banco dentro da rede isolada dos containers. Para banco gerenciado externo, retirar essa opção e configurar o certificado de confiança; não usar `PGSSL_INSEGURO` nem parâmetros de URL que desliguem a validação TLS.
5. Manter `GHT4_CONFIGURACAO_INICIAL=0`. O primeiro administrador em produção é criado pelo comando interativo local. Configuração de IA é opcional e segue [Configurar IA](configurar-ia.md).

Executar a partir de `implantacao`:

```sh
docker compose config --quiet
docker compose build api
docker compose up -d db
docker compose run --rm api node ferramentas/administrar-acesso.mjs iniciar
docker compose up -d api web
docker compose ps
```

O comando `iniciar` solicita nome, e-mail e senha sem eco. Ele cria somente a primeira conta e um espaço piloto; recusa uma instalação existente. Migrações são aplicadas na abertura do banco e cada arquivo tem hash verificado. Por isso, fazer backup antes de subir um commit com novas migrações e manter uma única instância durante a atualização.

O Caddy usa `tls internal`. Distribuir a CA privada do Caddy aos computadores da equipe por um procedimento administrado, conferindo a identidade do certificado. Não instruir usuários a ignorar alertas do navegador. O volume `certificados` deve persistir. Se a organização já tem certificados próprios, substituir a diretiva TLS conforme sua política.

## Verificar antes do uso compartilhado

- Abrir o domínio por HTTPS em dois computadores; conferir login com contas distintas, convite e suspensão. Convites são links de uso único; o produto não envia mensagens.
- Criar oportunidade sintética compartilhada; atualizar responsável e prazo, recarregar na outra máquina e provocar uma edição concorrente. Esperado: conflito explícito, sem sobrescrita silenciosa.
- Tentar acessar trabalho privado e espaço não autorizado com outra conta. Esperado: bloqueio; revogação deve valer na requisição seguinte.
- Subir documento sintético, consultar trechos e exportar Excel/PDF/JSON. Conferir os dados e a identificação do corte. Não usar dados confidenciais antes desse ensaio.
- Reiniciar os serviços e verificar persistência. Executar e restaurar backup em banco novo; verificar documentos, oportunidades, trabalhos, contas e auditoria.
- Executar a avaliação de IA com modelo real somente após autorização de tratamento e configuração da chave. Não confundir os testes com respostas simuladas com essa aceitação.

Registrar commit, versões das imagens, responsáveis, data, evidências e falhas. Enquanto esse registro estiver vazio, a implantação compartilhada permanece **preparada, não homologada**.

## Recuperar acesso

No servidor compartilhado:

```sh
docker compose exec api node ferramentas/administrar-acesso.mjs redefinir
```

O operador informa o e-mail e a nova senha. O comando só altera uma conta existente, revoga suas sessões e registra auditoria. Não reativa uma conta suspensa e não muda seu papel. A identidade do solicitante deve ser confirmada pelo procedimento interno da boutique.

No modo local, encerrar o agente antes de abrir o mesmo PGlite por outro processo. Na raiz do repositório, usar `node ferramentas/administrar-acesso.mjs redefinir` com `GHT4_APENAS_LOCAL=1` e o mesmo `GHT4_DADOS_DIR` do iniciador. Não executar o comando contra um banco escolhido apenas por suposição.

## Backup local e restauração

O administrador abre **Equipe → Operação e continuidade → Preparar backup protegido por senha**. Digita sua senha de acesso, escolhe outra senha para a cópia e confirma que ela inclui toda a instalação, inclusive trabalhos privados. O arquivo `.ght4` é cifrado com AES-256-GCM e chave derivada por scrypt. Guardar a senha separada do arquivo, em local administrado. Sem ela não existe recuperação.

A indicação “última solicitação” não comprova que o navegador salvou o arquivo. Conferir o download e manter cópia fora desta máquina em armazenamento autorizado. O arquivo inclui usuários, hashes de senha, trabalhos, anexos e auditoria; não inclui `server/.env`, chave do provedor, código ou snapshot cadastral. Guardar também a referência do commit e as configurações de forma segura.

Para restaurar, parar o agente e executar na raiz:

```sh
node ferramentas/restaurar-backup.mjs caminho/backup.ght4 caminho/pasta-nova
```

O diretório pai deve existir; `pasta-nova` não pode existir. O programa verifica a versão do PGlite e a integridade autenticada, solicita a senha sem eco, recusa entradas de arquivo não permitidas e nunca sobrescreve a base original. Se falhar depois de criar a pasta nova, ela permanece para diagnóstico; escolher outro destino após corrigir o problema. Usar somente backups conhecidos da própria instalação.

Depois do sucesso, configurar `GHT4_DADOS_DIR` com a pasta informada e iniciar normalmente. Sessões e convites antigos são revogados na cópia restaurada. Verificar o fluxo e somente depois considerar a cópia apta para uso. A base anterior permanece preservada. Limites atuais: arquivo cifrado de até 256 MB e conteúdo TAR de até 1 GB, com a mesma versão do PGlite. O backup PGlite **não é um backup nativo de Postgres** nem um procedimento de migração para o servidor compartilhado.

## Backup e restauração de Postgres

Definir responsável, frequência e retenção com a GHT4. Proposta para aprovação operacional: cópia diária, antes de cada atualização e após importações relevantes, retenção de 30 dias e ensaio mensal. Isso não cria um agendamento nem declara um SLA aceito. O volume `backups` no mesmo host não protege contra perda do host: copiar os arquivos para destino autorizado fora dele, com criptografia e controle de acesso.

Com o stack ativo, um exemplo de comando manual é:

```sh
docker compose exec db pg_dump -U ght4 -d ght4 -Fc -f /backups/ght4-AAAAMMDD-HHMM.dump
docker compose exec db pg_restore --list /backups/ght4-AAAAMMDD-HHMM.dump
docker compose cp db:/backups/ght4-AAAAMMDD-HHMM.dump ./backups/ght4-AAAAMMDD-HHMM.dump
```

Substituir a data e criar a pasta local `backups` antes. Conferir código de saída, tamanho e hash do arquivo. Testar com `pg_restore` em **novo banco vazio**, sem `--clean` contra a base em uso:

```sh
docker compose exec db createdb -U ght4 ght4_ensaio_AAAAMMDD
docker compose exec db pg_restore -U ght4 --exit-on-error --single-transaction --no-owner -d ght4_ensaio_AAAAMMDD /backups/ght4-AAAAMMDD-HHMM.dump
```

Antes de expor uma cópia restaurada, o operador deve revogar as sessões (`UPDATE sessoes SET encerrada_em=now() WHERE encerrada_em IS NULL`) e convites pendentes (`UPDATE convites_equipe SET revogado_em=now() WHERE usado_em IS NULL AND revogado_em IS NULL`) nesse banco novo e registrar o ensaio. Conferir as mesmas entidades do teste local. `pg_dump` não copia segredos do ambiente, certificados, código nem papéis globais do cluster; preservar essas dependências em procedimento próprio. Não há migração automática dos dados locais para Postgres neste pacote.

## Atualização, retorno e suporte

Guardar commit e imagens anteriores, fazer backup e anunciar uma janela de manutenção. Construir o novo commit, parar a API e subir uma única instância com as migrações. Verificar saúde e fluxo principal antes de liberar a equipe. Em falha, preservar o banco atual e restaurar o backup em uma nova base junto do commit compatível. Não desfazer migrações manualmente nem iniciar código antigo sobre esquema novo por tentativa.

A tela de operação exibe pedidos de IA, falhas, pendências e tokens do dia de São Paulo. Pendências podem representar chamadas interrompidas; não se repetem automaticamente, pois podem ter sido cobradas. Os limites diários são persistentes. O custo monetário depende do modelo e da conta do provedor.

Tentativas de acesso são limitadas em 15 minutos por e-mail (12) e IP observado pelo servidor (120). Atrás do proxy, o limite de IP é compartilhado pela equipe; cabeçalhos externos não são aceitos como identidade do cliente. A regra persiste entre reinícios. Um bloqueio orienta aguardar 15 minutos. Não publicar esta instalação diretamente na internet sem a revisão operacional do destino.

As respostas da API não devem ser armazenadas em cache. As páginas compiladas têm política de conteúdo restrita à própria origem. Logs de erro são acessíveis somente ao operador e podem conter detalhes de consulta; não compartilhar logs brutos com pessoas sem acesso aos dados correspondentes. Usar o commit, horário, ação e mensagem exibida para iniciar um chamado interno.

## Fontes técnicas

- [PGlite: dumpDataDir e loadDataDir](https://pglite.dev/docs/api).
- [PostgreSQL 17: pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).
- [Docker Compose: secrets](https://docs.docker.com/reference/compose-file/secrets/).
- [Caddy: reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
