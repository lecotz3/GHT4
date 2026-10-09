# Ponte MCP da pesquisa por tese

`ferramentas/mcp-ght4.mjs` deixa o membro usar a **pesquisa por tese** de dentro de um cliente de IA que fale MCP (Claude Desktop, Claude Code e outros), sem abrir a interface do GHT4. É a versão da casa do "MCP / CLI / SDK" que o Lessie oferece na plataforma aberta (ver `PESQUISA-LESSIE-AI.md`, §4 e §5.2).

## O que ela faz

| Ferramenta | O que faz | Rota do GHT4 |
| --- | --- | --- |
| `listar_pesquisas` | As 30 pesquisas mais recentes do membro, com estado e empresas boas | `GET /api/pesquisas` |
| `pesquisar_tese` | Cria a pesquisa a partir da tese e devolve os critérios propostos | `POST /api/pesquisas` |
| `ajustar_criterios` | Em rascunho: opcional/obrigatório, remover, acrescentar critério de site, meta. Iniciada: `tornarOpcionais` abre uma nova rodada | `PATCH /api/pesquisas/:id`, `POST …/ajustar` |
| `iniciar_pesquisa` | Roda o funil cadastral | `POST …/iniciar` |
| `revisar_empresas` | Revisa o próximo lote no site (até 5) | `POST …/avancar` |
| `resultado_pesquisa` | Empresas revisadas por categoria, com aderência e vereditos | `GET /api/pesquisas/:id` |
| `evidencias_empresa` | Justificativa e fontes de cada critério para uma empresa | `GET …/itens/:empresaId` |
| `registro_execucao` | O passo a passo da pesquisa, com quem fez cada passo | `GET …/eventos` |

## O que ela não faz, de propósito

- **Não entrega ao trabalho nem faz revisão humana.** São decisões com autoria e trilha, e ficam na interface.
- **Não lê o plano de acesso nem a rede.** Nome de pessoa de terceiro não sai para um cliente de IA que a casa não controla.
- **Mandato confidencial não passa.** Cada pedido vai marcado `X-GHT4-Canal: mcp`; o servidor tira as pesquisas de mandato confidencial da lista e recusa lê-las, criá-las ou rodá-las por esse canal (`403 canal_externo_confidencial`). As pesquisas criadas pela ponte ficam no trabalho pessoal do membro.
- **Não tem acesso próprio.** Usa a conta do membro, com as mesmas permissões: leitura não cria nem roda pesquisa.

## Configurar

Variáveis de ambiente do processo da ponte (ficam na configuração do cliente MCP, nunca no repositório):

| Variável | Padrão | O que é |
| --- | --- | --- |
| `GHT4_URL` | `http://127.0.0.1:3311` | Endereço da API do GHT4 (local ou publicada) |
| `GHT4_EMAIL` | — | E-mail da conta do membro |
| `GHT4_SENHA` | — | Senha da conta do membro |

**Claude Code**, na pasta do repositório:

```
claude mcp add ght4 -e GHT4_URL=http://127.0.0.1:3311 -e GHT4_EMAIL=voce@ght4.com.br -e GHT4_SENHA=... -- node ferramentas/mcp-ght4.mjs
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{ "mcpServers": { "ght4": { "command": "node", "args": ["C:/caminho/para/GHT4/ferramentas/mcp-ght4.mjs"],
  "env": { "GHT4_URL": "https://endereco-do-ght4", "GHT4_EMAIL": "voce@ght4.com.br", "GHT4_SENHA": "..." } } } }
```

Requer Node 20 ou mais novo. Sem dependências.

## Conferir

- `npm test --prefix server` inclui `tests/mcp.test.mjs`: o fluxo inteiro contra um servidor local em memória, a recusa do mandato confidencial e o protocolo por stdio.
- No cliente, peça "liste minhas pesquisas no GHT4". Uma senha errada aparece como erro legível da ferramenta, não como falha do cliente.

## Limites

- Uma sessão por processo; se ela expirar, a ponte entra de novo uma vez antes de devolver erro.
- A revisão no site roda em lotes de até 5 empresas por chamada, como na interface; a pausa automática do provedor gratuito de IA também vale aqui.
- O texto devolvido é JSON. A fonte de cada veredito vai junto, e "indeterminado" quer dizer que não se achou fonte, nunca que a empresa não atende.
