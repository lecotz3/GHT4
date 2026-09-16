# Agente completo na Vercel

Destino solicitado pelo usuário: projeto existente `leoleal11/ght-4`. Interface React e API Fastify são publicadas juntas; PostgreSQL permanece no Render. O `render.yaml` é uma alternativa de piloto, não o deployment final escolhido.

## Configuração

- Raiz: raiz do Git, onde ficam `vercel.json`, `api/` e `v1/`.
- Node: 24.x; preset Vite; saída `v1/dist`.
- Instalação e build: usar os valores versionados em `vercel.json` (dependências de interface e servidor).
- A versão completa está integrada à `main`, branch de produção do projeto. Publicar o commit atual dessa branch; repetir um deployment antigo não inclui os arquivos novos.

Variáveis configuradas somente em **Production**, com valores secretos fora do Git:

| Nome | Valor / função |
| --- | --- |
| `DATABASE_URL` | External Database URL do PostgreSQL `ght4` no Render. A conexão interna do Render não é acessível pela Vercel. |
| `PG_POOL_MAX` | `5`, inicialmente; acompanhar o total de conexões com a escala. |
| `GHT4_ORIGEM_PUBLICA` | `https://ght-4.vercel.app` |
| `GHT4_ADMIN_EMAIL` | E-mail escolhido pelo administrador, apenas para a primeira instalação. |
| `GHT4_ADMIN_NOME` | Nome do administrador. |
| `GHT4_ADMIN_SENHA_INICIAL` | Definida pelo usuário na hospedagem, pelo menos 12 caracteres. Remover após confirmar a primeira entrada. |

Não configurar `PG_TLS_MODE=disable`, `PGSSL_INSEGURO=1`, `GHT4_APENAS_LOCAL=1` ou bootstrap público. A conexão externa valida TLS. Não colocar segredos em variáveis `VITE_*`.

O build de Production exige banco configurado, aplica migrations e importa o catálogo antes da publicação. Chamadas comuns da API não executam migrations. O comando de preparação usa um advisory lock para serializar builds sobre o mesmo banco. Importação em transação: se falhar, o snapshot anterior continua ativo. O administrador inicial só é criado se não houver usuários; o mesmo ambiente não redefine a senha de contas existentes.

Preview recebe o build da interface, mas não deve receber os segredos do banco de produção. Para testar a API em Preview, preparar um banco isolado e configurar explicitamente suas variáveis nesse ambiente.

## Verificação antes de declarar a entrega

1. Confirmar commit e status Ready no deployment Production.
2. Abrir `/` e `/api/saude` no domínio final; saúde deve responder JSON com `ok: true`.
3. Sem sessão, `/api/eu` deve negar acesso; bootstrap administrativo público deve continuar indisponível.
4. Entrar com a conta remota, executar busca e confirmar total e referência; salvar trabalho e conferir persistência após nova sessão.
5. Remover a senha inicial do ambiente depois do primeiro acesso. A senha derivada permanece no banco; não se deve copiar a pasta PGlite local para a Vercel.

## Continuidade e limites

O banco Free observado no Render expira em 15/10/2026 e não oferece a recuperação dos planos pagos. Escolher plano pago e validar restauração antes de adotar o ambiente como instalação definitiva da boutique. A configuração do código não ativa backups pagos nem armazenamento externo de documentos. Documentos do agente atualmente permanecem no banco; armazenamento de objetos para arquivos grandes é evolução separada. Nenhum provedor de IA foi contratado/configurado automaticamente.

O schema suporta empresas e estabelecimentos separados; a importação atual dispõe somente de CNPJ raiz e não inventa filiais. O catálogo bruto tem 38.583 registros, incluindo outros subsegmentos e exclusões. A interface operacional ainda consulta o piloto de distribuição química.

Fontes: [Vercel Node.js](https://vercel.com/docs/functions/runtimes/node-js), [variáveis de ambiente](https://vercel.com/docs/environment-variables), [conexão Render Postgres](https://render.com/docs/postgresql-creating-connecting), [limites do Render Free](https://render.com/docs/free).
