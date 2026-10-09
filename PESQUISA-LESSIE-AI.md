# Lessie AI — engenharia reversa do agente de busca de pessoas
### Como o produto funciona por dentro, e o que serve ao agente de M&A da GHT4

> Investigação feita em 06/10/2026 com o REA (Chrome isolado, perfil temporário, sem login),
> sobre `https://lessie.ai/pt` e `https://app.lessie.ai`. Só material público: a página
> de marketing, o bundle JavaScript do app e as **demonstrações públicas** (`/showcase/<id>`),
> que guardam a transcrição completa de buscas reais do agente.
> Nenhuma conta foi criada e nenhum dado pessoal das demonstrações foi copiado para cá.

**Legenda de confiança:** **[obs]** observado diretamente no artefato · **[inf]** inferência
a partir do observado · **[?]** desconhecido (roda no servidor, fora do alcance do cliente).

**Evidências REA:**

| Evidence ID | O que contém |
|---|---|
| `ev_c8b9b963561e…a26186d6` | Inspeção passiva de `lessie.ai/pt`: DOM, acessibilidade, scripts, storage |
| `ev_68dc8a8b0657…68d5e2538` | Análise do bundle da landing (Next.js/Turbopack) |
| `ev_c6e8dfb36fe7…ae3727bd` | Análise do bundle do app (`app.lessie.ai`), 18 scripts, 1,97 mi de nós AST |

O `main.8635114d.js` do app (7,2 MB) baixado para leitura tem SHA-256
`f57383ed6e11…71490f26dd`, **idêntico** ao capturado pelo REA no navegador.

---

## 1. Em uma frase

Lessie é um **supervisor de IA que transforma um pedido em critérios verificáveis, busca
candidatos em bases pagas de pessoas, manda cada candidato para um revisor de IA que julga
critério por critério com evidência, e repete trocando de fonte e relaxando a busca até
atingir a meta** — depois redige e envia o contato.

A peça que faz o produto funcionar não é a busca: é a **revisão por critério com evidência**.

---

## 2. Arquitetura observada

### 2.1 Agentes [obs]

Contagem nas 8 demonstrações públicas recuperadas (a 9ª retornou "Showcase not found"):

| Agente | Aparições | Papel |
|---|---:|---|
| **Lessie Supervisor** | 26 | Planeja, gera critérios, decide nova rodada, escreve o resumo |
| **Lessie Search Agent** | 28 | Traduz critérios em filtros de cada base e busca ("Try N times") |
| **Lessie Review Agent** / "Lessie Review Engine" | 24 | Julga cada perfil contra cada critério, com evidência |

No app há ainda um **Outreach Agent** (rotinas de tarefa: "Search agent" / "Outreach agent") [obs].

### 2.2 Fontes de dados efetivamente usadas [obs]

| Fonte | Buscas nas demonstrações | Natureza |
|---|---:|---|
| Apollo People Database | 24 | Base B2B de pessoas com e-mail verificado |
| PDL (People Data Labs) | 8 | Base de perfis profissionais |
| CoreSignal | 6 | Base de perfis/empresas raspados da web |
| "DeepSearch Database" | 2 | Pesquisa aberta na web [inf: agente com busca web, acionado quando as bases falham] |

A página promete "100+ fontes" e "95% de contatos verificados"; nas demonstrações aparecem
**quatro**. Trate os números de marketing como marketing.

### 2.3 Serviços de back-end [obs — pelos caminhos chamados no bundle]

| Serviço | Responsabilidade | Exemplos de rota |
|---|---|---|
| `sourcing-api` | O agente: conversa, plano, busca, checkpoint | `chat/v1/stream`, `chat/v1/interrupt`, `chat/v1/refresh_plan`, `chat/v1/task_status`, `conversation/v1/review_checkpoint/new`, `showcases/v1/:id`, `searches/v1/:id` |
| `api` | Resultados, perfis, rede, memória, tarefas proativas, chaves | `search/:id/view`, `view/versions`, `view/rollback`, `profile/summary`, `profile/translate-evidence`, `v1/memory/*`, `proactive/tasks`, `proactive/plan-drafts`, `keys` |
| `email-api` | E-mail: Gmail/Outlook/IMAP, rascunhos, personalização, follow-up | `personalized-email/batch-generate`, `followup/cancel-plan`, `proactive-outreach/reply-insights` |
| `message-api` | LinkedIn/WhatsApp com fila de envio seguro | `safe-send/enqueue`, `safe-send/settings/*`, `channels/authorize-url` |

170 caminhos de API distintos foram extraídos do bundle.

### 2.4 Pilha técnica [obs/inf]

- Landing: Next.js (Turbopack) atrás de Cloudflare [obs]. App: React SPA com Ant Design e axios [obs].
- O hook do chat expõe `messages`, `handleSubmit`, `append`, `reload`, `experimental_throttle`,
  `experimental_prepareRequestBody` — a assinatura do `useChat` do Vercel AI SDK [inf], com
  reconexão própria por SSE [obs].
- Analytics PostHog (dois projetos) [obs]; pagamento com `setup_intent`/`payment_intent`/`checkout_url` [inf: Stripe]; parâmetro `pix` presente [obs].
- Empresa: SUPERLINEAR TECHNOLOGY PTE. LTD. (Singapura) [obs]; textos internos e logs em chinês [obs].
- **Qual LLM usam, os prompts e o código do servidor: [?]** — nada disso vai ao navegador.

---

## 3. O algoritmo, passo a passo

Reconstruído das transcrições das demonstrações (`/sourcing-api/showcases/v1/<id>`).

```
pedido em linguagem natural
  └─ Supervisor: plano em 4 passos (critérios → busca → revisão → resumo)
  └─ Supervisor: lista de CRITÉRIOS, cada um "Required" ou "Optional"
        (o usuário pode editar e "Confirmar & iniciar Autopilot")
  └─ repetir rodada r = 1, 2, 3…
        Search Agent: escolhe a base e traduz critérios em facetas
            ex.: "CEO,C-Suite,Founder,Ohio,Construction,…,Verified Email"
        Review Agent: para cada perfil × cada critério →
            veredito (1 atende · 2 não atende · 3/-1 indeterminado),
            resumo do dado, justificativa, evidências [fonte, url]
        placar: "Reviewed N · Passed M"
        se M < meta: trocar de base e/ou relaxar critérios de menor prioridade
  └─ "Scanning All Profiles" → "Confirming results" (consolidação/deduplicação)
  └─ Supervisor: resumo + tabela agrupada em Full Match / Partial Match
```

**Regra de relaxamento [obs, texto do próprio app]:** "Lessie primeiro retorna os melhores
resultados com prioridade mais alta e relaxa os critérios de prioridade mais baixa quando
eles são restritivos demais."

### 3.1 O que as demonstrações mostram

| Demonstração | Rodadas | Comportamento |
|---|---|---|
| Pesquisadores de IA influentes | 3 | CoreSignal → 2 perfis, **0 aprovados**; PDL → 50, **0 aprovados**; DeepSearch → **15 aprovados**; resumo final com 6 |
| Fundadores de construtoras em Ohio | 1 | Apollo em 4 páginas; 41 revisados, 36 aprovados na parcial; resumo final com 54 |
| 50 investidores-semente para IA | 5 revisões / 7 buscas | Apollo, PDL, CoreSignal, DeepSearch; 214 revisados → **71 completos + 143 parciais** |

Duas lições: (1) a revisão é um **portão real** — ela reprova bases inteiras; (2) o laço só
para quando atinge a meta, esgota as fontes ou estoura o orçamento de créditos.

### 3.2 O formato do resultado — o que vale copiar [obs]

Cada critério vira uma **coluna** da tabela; cada célula é um veredito estruturado:

```json
{
  "keypoint": "company_location_ohio",
  "required": "Required",
  "adopt": 1,                     // 1 atende · 2 não atende · 3 ou -1 indeterminado
  "summary": "<o dado encontrado, curto>",
  "reason":  "<por que o revisor concluiu isso>",
  "evidence": [ { "source": "<nome da fonte>", "url": "<link>" } ]
}
```

- `match` = fração de critérios atendidos (nas demonstrações: 1 · 0,67 · 0,33) [obs].
- `_match_category`: `full_match` / `partial_match`; a tabela agrupa por isso [obs].
- A visão tem **versões** (`view/versions`, `view/rollback`) e campos travados quando o usuário
  edita (`row_metadata.locked_fields`) [obs].
- Exemplo real de reprovação (anonimizado): critério "fundador de construtora" → `adopt: 2`,
  razão "o candidato é fundador na área de educação imobiliária, não de construção".

### 3.3 Checkpoint de revisão [obs]

Antes de revisar a lista inteira, o usuário pode rodar a "revisão profunda" só nos
**10 primeiros** e ajustar critérios ("Tiefgehendes Schlussfolgern ist erforderlich… liefert
die Belege sowie einen Match-Score"). É calibração barata antes do gasto grande.

---

## 4. Funcionalidades além da busca [obs]

| Funcionalidade | Como funciona |
|---|---|
| **Tarefas proativas** (`/task`, `/goals`) | Rodadas agendadas (por dia/semana/mês) com **meta** ("N por semana"), **orçamento de créditos**, modo **Auto** ou **Revisão** (aprovação humana), amostra de calibração com feedback ("diga à Lessie por que este candidato não serve") e um "relatório de estratégia para a próxima rodada" |
| **Memória** | Perfil do usuário (empresa, função, quem costuma buscar), notas que o agente escreve, atividade recente; o chat mostra "Lessie usou o que você disse sobre X" com opção "não use mais"; exportar e apagar tudo |
| **Contato** | E-mail personalizado por pessoa, follow-ups, inbox unificada, LinkedIn e WhatsApp |
| **Envio seguro** | Fila com cota diária, intervalo aleatório entre envios e limites por idade da conta (ex.: conta LinkedIn com < 100 conexões → 2 convites / 3 envios por dia) |
| **Plataforma aberta** | Chaves de API para "MCP / CLI / SDK" — o agente pode ser usado a partir de outros clientes de IA |
| **Compartilhamento** | Conversas e tabelas compartilháveis; as demonstrações públicas são isso |

---

## 5. Lessie × GHT4 — o que serve, o que adaptar, o que evitar

A diferença de fundo: **Lessie é centrada em pessoa; a GHT4 é centrada em empresa.** Na GHT4
a empresa é a entidade que se avalia, e as pessoas são caminho de acesso (módulo de rede).
As bases da Lessie (Apollo, PDL, CoreSignal) são majoritariamente americanas e de pessoas;
o catálogo Receita Federal/CNPJ da GHT4 (38.583 registros, 1.613–6.165 no recorte) é um
ponto de partida melhor para M&A no Brasil.

### 5.1 Adotar

1. **Critério como objeto, não como filtro.** Hoje `server/src/agente/interpretacao.mjs`
   converte o pedido em filtros cadastrais e manda para `pendencias` tudo que não é filtro
   (faturamento, sucessão, controle, intenção). No modelo Lessie, esses itens viram
   **critérios de revisão**, verificados empresa a empresa, com evidência e com
   "indeterminado" permitido. Isso respeita a regra da casa de não inferir intenção: o
   veredito sem fonte fica `indeterminado`, nunca `atende`.
2. **Duas fases: recall barato, revisão cara.** Recall = consulta SQL ao catálogo (CNAE, UF,
   enquadramento). Revisão = IA com pesquisa web (o `provedor.mjs` já usa `web_search`)
   julgando cada empresa contra cada critério.
3. **Veredito por critério no formato da §3.2**, ligado ao conceito de lastro que já existe
   em `packages/domain/evidencias.mjs` (documento · indicador · inferido sem fonte).
4. **Checkpoint nos 10 primeiros** antes de revisar a lista inteira — controla custo e deixa
   o membro corrigir a tese cedo, alinhado ao "resultado revisável" da diretriz de produto.
5. **Laço com meta e orçamento:** rodar até N empresas aderentes, trocar de fonte, relaxar
   critérios opcionais na ordem de prioridade, parar no teto de custo; mostrar o placar
   "revisadas · aprovadas" em tempo real.
6. **Streaming de eventos tipados** (`agent`, `criteria`, `card`, `event`, `output`) para tarefas
   longas, com interromper/retomar — hoje as respostas do agente GHT4 são síncronas.
7. **Resultado versionado** com edição humana travada, coerente com a trilha de auditoria.

### 5.2 Adaptar

- **Tarefas proativas → monitoramento de tese/mandato:** rodada semanal que procura empresas
  novas no recorte e sinais públicos (notícia, mudança societária, captação), sempre em modo
  Revisão. Nada de envio automático.
- **Memória:** a GHT4 já salva contexto por trabalho; faltaria preferência por membro
  ("critérios que este sócio sempre usa"), visível e apagável como na Lessie.
- **MCP:** expor busca e revisão como ferramentas MCP permitiria ao membro usar o agente de
  dentro do Claude, sem abrir a interface.

### 5.3 Evitar

- **Contato automatizado e LinkedIn.** Conflita com decisões já registradas: Módulo 4 só com
  material interno, sem varredura automatizada de LinkedIn; envio externo exige autorização.
  No máximo, rascunhos para revisão.
- **Bases de pessoas compradas sem base legal LGPD** definida pela casa.
- **Números de marketing** ("100+ fontes", "95%") como meta interna sem medir.

---

## 6. Desconhecidos e limites desta investigação

- Prompts, modelo de linguagem, ranking dentro de cada grupo, regra de deduplicação e de
  "Confirming results": rodam no servidor. **[?]**
- Como o "DeepSearch" e o revisor coletam evidência na web (qual buscador, quantas páginas). **[?]**
- O app logado (tarefas, inbox, checkpoint em uso real) não foi observado: exigiria uma
  conta. As funções da §4 vêm de rotas e textos da interface, não de execução observada.
- A tabela pública de cada demonstração expõe só parte das linhas (ex.: 15 de 59).
- A análise estática do bundle não prova que cada rota é usada em produção.

---

## 7. O que já foi levado para o GHT4 (07/10/2026)

Implementado no código, sem custo de dados nem de IA:

| Mecanismo do Lessie | Como ficou no GHT4 | Onde |
|---|---|---|
| Caixa única "descreva quem você procura" | Início com a tese no centro e exemplos por frente (venda, compra, consolidação, nicho) | `v1/src/componentes/InicioAgente.tsx` |
| Supervisor transforma pedido em critérios obrigatórios/opcionais | Regras locais (sempre) e IA gratuita (opcional) propõem critérios; cada um traz o trecho da tese que o sustenta; o membro edita antes de rodar | `server/src/pesquisa/criterios.mjs`, `motor.mjs` |
| Funil "Reviewed N · Passed M" | Funil ao vivo: recorte → passam no cadastro → com site → revisadas → aderentes; cada critério mostra quantas elimina e quantas voltam se for opcional | `PesquisaTese.tsx` |
| Revisão por critério com evidência (`adopt`, `reason`, `evidence[]`) | Veredito por critério: atende / indício / sem evidência / não atende, com resumo, justificativa e fonte (campo da Receita, trecho e URL do site) | `pesquisa_itens.vereditos` |
| Full / Partial match | Aderentes, prováveis, a confirmar e não aderentes; aderência 0–100 | `consolidar()` |
| Checkpoint "first 10 people" | "Revisar as 10 primeiras" pausa para conferência antes de seguir até a meta | `PesquisaTese.tsx` |
| Rodadas até a meta, com orçamento | Meta de aderentes e limite de sites por rodada; pausa automática quando o provedor gratuito pede | `motor.avancar()` |
| Bases pagas (Apollo, PDL, CoreSignal) | Cadastro da Receita (já no GHT4) + IBAMA + site oficial pelo domínio declarado no CNPJ | `atributos.mjs`, `fontes-web.mjs` |
| Resultado vira ação | "Levar para o trabalho" cria um resultado comum, que segue para seleção, reunião, caminho de acesso e oportunidade | `POST /api/pesquisas/:id/registrar` |

Diferenças deliberadas em relação ao Lessie: nada de contato automático; ausência de evidência nunca vira reprovação; a IA só pode citar trecho que existe literalmente na página lida; camada gratuita não recebe documento confidencial; o site é lido respeitando robots.txt e só em endereço público.

---

## 8. O `/find` e a chegada à pessoa (08/10/2026)

> Segunda passada com o REA, focada em `https://app.lessie.ai/find`: como o produto mostra a
> pessoa certa dentro da empresa e como chega até ela. A rota exige login (o REA observou o
> redirecionamento para `/login` e o desafio Cloudflare Turnstile); **não se criou conta, não se
> contornou o desafio e não se entrou com conta alguma**. A extensão do Claude no Chrome, que
> permitiria observar o app logado com a conta do usuário, não estava conectada nesta sessão.
> Tudo abaixo vem do bundle público, lido de forma estática, sem executar o JavaScript.
> O `main.8635114d.js` continua com o mesmo SHA-256 da §0 (`f57383ed6e11…71490f26dd`):
> é a mesma versão do app.

**Evidências REA desta passada:**

| Evidence ID | O que contém |
|---|---|
| `ev_2820bc77d021…715c1b12` | Cenário de navegador em `/find`: redireciona para `/login`, com Turnstile |
| `ev_67c066fff6ca…a04816f73bb` | `analyze-web-bundle` do app: 20 scripts, rotas e endpoints (cobertura parcial, sem source maps) |
| `ev_22239f471eb2…2c060e34b` | `analyze-javascript-application` sobre os 5 bundles públicos (`main`, `1602`, `8282`, `6787`, `7288`) |

### 8.1 Rotas e chamadas ligadas à pessoa [obs]

- Rotas do cliente: `/find`, `/find/:id`, `/mylist` ("Minha lista"), `/network`, `/linkedin`,
  `/email`, `/whatsapp`, `/process` (histórico de campanhas), `/goals`, `/task`, `/inbox`.
- Perfil: `POST /api/profile/summary`, `/api/profile/profile`, `/api/profile/translate-evidence`,
  `/api/profile/batch_status`, `/api/person/contact_status`.
- Contato pago: `POST /api/email/unlock_person_info`; o roteador de paywall classifica qualquer
  URL com `unlock_person_info` como gatilho `unlock_email`.
- Lista e grupos: `/api/network/person/add`, `/api/network/export/`, `/api/network/precheck_export`.
- Mensagens: `email-api/personalized-email/batch-generate`, `regenerate-by-person`,
  `update-by-id`; tarefas com horário (`email-api/task/*`), follow-up (`email-api/followup/*`),
  convite do LinkedIn com nota e "polir" (`/api/linkedin-invitation/polish`), WhatsApp.
- Checkpoint de revisão: `sourcing-api/conversation/v1/review_checkpoint/new` e `/delete`.

### 8.2 O que a tela mostra [obs, pelos textos da interface]

- **"Match Judgment"** (`profile.evidence_chain`): para cada pessoa, uma tabela com as colunas
  **Requirement · Judgment · Candidate info · Source** (`profile.checkpoint_*`), e o selo
  **Matched / Mismatched**. Acompanham resumo de IA, experiência, formação e atividade recente.
- **Contato**: botões **"Check email"** e **"Check telephone"**. Cada um consome créditos
  ("Unlock email address", "Unlock phone number", "Contact enrichment"), e o estado do
  contato fica `locked` / `unlocked` [inf, pelo código que monta o cartão].
- **Minha lista**: a pessoa é salva em grupos e passa por **Saved → Contacted → In touch**.
- **Checkpoint**: "Deep reasoning is required"; o membro acrescenta um critério novo e escolhe
  aplicá-lo às **10 primeiras pessoas** ou a **todas as da lista**.
- **Critérios**: obrigatório/opcional, com a regra "devolve primeiro os melhores e relaxa os
  critérios de menor prioridade quando a busca fica estreita demais" (confirma a §2).
- **Envio seguro**: fila com cota diária, intervalo aleatório e faixas por maturidade da conta
  ("conta com menos de 100 conexões: 2 convites / 3 envios por dia"), pausa ao sinal de restrição.
- **"Warm intro"**: aparece só nos textos da animação de marketing ("31 têm apresentação calorosa
  pela sua rede"). Não há rota nem tela que a sustente no bundle: **[?]** se existe de fato.

### 8.3 Desconhecidos [?]

- De que bases vêm as pessoas e como cada julgamento é calculado: roda no servidor.
- Se o "warm intro" é funcionalidade real ou só peça de marketing.
- O fluxo logado em uso real (ordem das telas, o que aparece antes de pagar créditos).
  Fica para uma passada com a extensão do Chrome conectada e a conta do próprio usuário.

### 8.4 O que foi levado para o GHT4: "Chegar a quem decide"

| No Lessie | No GHT4 | Onde |
|---|---|---|
| Match Judgment por pessoa (requisito · julgamento · informação · fonte) | **Juízo do decisor**: decide a venda · cargo com fonte · pertence a esta empresa · a casa chega até ela, com os vereditos da pesquisa (atende, indício, sem evidência, não atende) | `server/src/acesso/plano.mjs` |
| Pessoas vindas de bases compradas | **Estrutura de decisão pelo cadastro** (natureza jurídica, quantos sócios, sócio PJ ou no exterior) diz *que tipo* de pessoa decide; *quem* é a pessoa entra pelo **caminho de recall**: alguém da casa registra, com a fonte obrigatória | `POST /api/acesso/:empresaId/decisores` |
| Saved / Contacted / In touch | Passada de reconhecimento ("você conhece?") direto no plano, caminhos da rede com confirmação do titular e a etapa da oportunidade na carteira | `GET /api/acesso/:empresaId`, `PlanoAcesso.tsx` |
| "Check email / telephone" pago | **Não adotado.** Canal institucional: site oficial, página de contato e página institucional que a pesquisa leu; RI na CVM para companhia aberta. Telefone e e-mail do cadastro não aparecem | `canaisInstitucionais()` |
| E-mail personalizado + fila de envio | **Rascunho para revisão**, com as regras da casa (sem mandato, tese ou valores; nada é enviado) | `proximoPasso()` |
| LinkedIn e WhatsApp | **Não adotado** (§5.3) | — |

O próximo passo é um só, na ordem em que se trabalha: restrição de contato encerra; sem ninguém
mapeado, descobrir quem decide; com caminho, usá-lo (falar direto, pedir apresentação ou usar a
porta de entrada); sem caminho e com perguntas pendentes, perguntar à casa; só com a apuração
completa, a abordagem institucional. Faixa etária de sócio não entra em nada disso: o produto se
proíbe de inferir sucessão pela idade.

---

## 9. Segunda leva levada para o GHT4 (08/10/2026)

Os itens da §5.1 e da §5.2 que faltavam depois da §7, mais as fontes gratuitas por CNPJ:

| Mecanismo do Lessie | Como ficou no GHT4 | Onde |
|---|---|---|
| "Relaxa primeiro os critérios de menor prioridade" | **Sugestão de relaxamento**, sem automatismo: o obrigatório que mais elimina sozinho aparece com quantas empresas voltariam; no rascunho vira opcional com um clique, e na pesquisa concluída abaixo da meta abre uma **nova rodada** com ele opcional (a anterior fica no histórico) | `sugerirRelaxamento()`, `POST /api/pesquisas/:id/ajustar` (`opcionais`) |
| Memória visível e apagável | **Memória do membro**: critérios que ele usa voltam como sugestão no rascunho; tela para pausar, esquecer um ou apagar tudo. Pesquisa de mandato confidencial não alimenta a memória | migração `0027`, `/api/memoria`, `pesquisa/memoria.mjs` |
| Resultado versionado com edição humana travada | **Revisão humana do veredito**: confirmar, contestar ou deixar em aberto, com justificativa obrigatória; a revisão automática não sobrescreve; desfazer devolve o veredito automático; histórico só cresce; a entrega leva o bloco "Decisões da equipe" | migração `0028`, `pesquisa/revisao.mjs` |
| Fluxo de eventos tipados (`agent`, `criteria`, `card`…) | **Registro da execução** por eventos gravados e lidos por cursor (a hospedagem serverless não mantém SSE): critérios, funil, lotes, pausas, revisões humanas, ajustes, entregas, monitoramento, cada um com o ator (agente ou pessoa) | migração `0029`, `GET /api/pesquisas/:id/eventos` |
| Plataforma aberta ("MCP / CLI / SDK") | **Ponte MCP** com 8 ferramentas da pesquisa por tese, com a conta do membro. Não entrega, não revisa e não lê pessoas; mandato confidencial é recusado pelo servidor no canal externo | `ferramentas/mcp-ght4.mjs`, `docs/runbooks/mcp-ght4.md` |
| Bases pagas de pessoas e empresas | **Fontes gratuitas por CNPJ**: sanções do CEIS e do CNEP (CGU) como diligência no plano de acesso; só pessoa jurídica do catálogo e só os campos da sanção. A CVM já entra pelo `importar-cvm.mjs` e, no plano, como canal de RI da companhia aberta | `ferramentas/importar-sancoes.mjs`, `data-sancoes.js`, `server/src/empresas/sancoes.mjs` |

Ficou de fora, de propósito: sanção como **critério** da pesquisa. Exigiria levar a lista para os atributos do catálogo e para o hash da publicação, o que invalidaria pesquisas em andamento a cada atualização da lista. Como diligência lida na hora, a lista se atualiza sem mexer em pesquisa nenhuma.

---

## 10. O `/find` por dentro, pela documentação pública do próprio Lessie (09/10/2026)

> Terceira passada, sem login: a extensão do Claude no Chrome continuou desconectada. O Lessie
> publica uma **skill e uma CLI para agentes** que chamam o mesmo servidor do `/find`, e a
> documentação delas descreve o fluxo, as respostas e o custo de cada passo. Lido de forma
> estática, numa pasta temporária fora do repositório, **sem instalar nem executar nada**:
> - repositório `github.com/LessieAI/lessie-skill`, commit `d42b4a5913d4` (01/07/2026), skill `people-search` 2.5.0;
> - pacotes npm `@lessie/cli` 0.11.0 (só um lançador de binário por plataforma) e `@lessie/mcp-server` 0.1.4 (procurador OAuth; os esquemas das ferramentas ficam no servidor).
>
> Uma chamada `initialize` sem credencial a `app.lessie.ai/mcp-server/mcp` devolveu 401, e a
> investigação parou ali. Nenhuma conta foi criada e nenhum crédito foi gasto.

**Legenda desta seção:** **[doc]** documentação pública do próprio Lessie · **[3º]** análise
de terceiros, com data · **[inf]** e **[?]** como no topo.

### 10.1 O fluxo, passo a passo [doc]

1. **Desambiguar a empresa antes de buscar.** Domínio errado desperdiça os 20 créditos da busca.
   O caminho é `web-search` → `enrich-org` → pedido com `"(dominio.com)"`.
2. **`find_people`:**
   - **Entrada:** o pedido em linguagem natural, **literal**, sem parafrasear termos de nicho.
   - **Escolhas do agente remoto:** as fontes (B2B, KOL ou web), as palavras-chave e a hora de parar.
   - **Teto:** 3 chamadas de ferramenta e 60 s por pedido. `target_count` de 1 a 100 (padrão 30) é o sinal de parada, e não há paginação.
   - **Resposta:** `search_id`, `people`, `total_found`, `after_hard_filter`, `strategy_used` (`"hybrid"`), `checkpoints_used`, `sources_used` e `points_deducted` (20).
   - **Teto atingido:** a resposta traz `partial: true` com `timeout_reason: "wall_clock_60s"`.
3. **Triagem pelo próprio agente.**
   - O que é obviamente bom fica, e o que é obviamente ruim sai.
   - Só o **ambíguo** vai à revisão profunda.
   - Antes da revisão, o resultado é mostrado agrupado em "forte · precisa de revisão · excluído", para o usuário ajustar os critérios.
4. **`review_people` é o "Match Judgment" da §8.2.**
   - Recebe checkpoints `{key, title, description, category}`, com `category` em `company`, `school`, `career` ou `other`.
   - Faz pesquisa web por pessoa: 1 a 3 minutos e 1 crédito cada.
   - Com zero resultados, não se revisa: relaxa-se o pedido.
5. **Desbloqueio de contato.**
   - Na busca, o e-mail vem mascarado (`****@dominio.com`).
   - `unlock_emails` custa 3 créditos e `unlock_phones` custa 8, por pessoa nova.
   - É idempotente por usuário entre buscas: quem já foi desbloqueado sai de graça.
   - `non_unlockable`, `failed` e `not_in_search` não são cobrados. E-mail e telefone são cobrados em separado.
   - Telefone pelo identificador só resolve LinkedIn, via ContactOut.
6. **Regra que o Lessie impõe ao agente:** confirmar o custo antes de cada ação que gasta crédito e relatar o gasto depois de cada turno.

### 10.2 O que aparece antes de pagar

- **Pela API [doc]:** a busca custa 20 créditos fixos. Cada pessoa vem com nome, LinkedIn, setor, cargo e empresa, mais a indicação de que há e-mail ou telefone, com o e-mail mascarado.
- **No app web [3º, ai-deck.app, 06/05/2026, preços "atuais em agosto de 2026"]:** iniciar a tarefa e ver as correspondências parciais não custa nada. Ver um candidato com correspondência completa custa 2 créditos, o e-mail 3 e o telefone 8.
- Isso responde em parte à §8.3. A ordem é tarefa → parciais de graça → candidato completo → contato.
- **[?]** Continua sem confirmação se a tela mostra o custo antes do clique.

### 10.3 Fontes e "warm intro"

- **Fontes [doc]:** bases profissionais "baseadas no LinkedIn", redes sociais no modo KOL e ContactOut para telefone. O FAQ fala em mais de 20 fontes (LinkedIn, Crunchbase, AngelList, G2); terceiros falam em mais de 100. Como cada julgamento é calculado continua no servidor **[?]**.
- **"Warm intro" [inf]:** nenhuma das ferramentas documentadas trata de rede, apresentação ou caminho por conhecidos. A expressão só aparece no marketing, como "e-mails verificados para warm intros".
  - No Lessie, "warm intro" é e-mail frio para endereço verificado.
  - Os **caminhos da rede** do GHT4, com confirmação do titular, não têm equivalente lá.

### 10.4 O que pode servir ao GHT4 (candidatos, nada implementado nesta passada)

| No Lessie | Ideia para o GHT4 |
|---|---|
| Triagem antes da revisão profunda, com o grupo "precisa de revisão" mostrado antes de gastar | Só a pesquisa no site oficial custa (tempo e cota de IA). Mostrar quantas empresas o cadastro já decide e quantas pedem o site, antes do lote |
| `partial: true` com o motivo | Já existe: o funil marca `truncado` e a tela diz "limitado às primeiras 10 mil" |
| Custo anunciado antes da ação | Não há crédito no GHT4, mas a cota diária de IA (`GHT4_IA_REVISOES_DIA`) pode aparecer antes de rodar o lote |
| Checkpoints com categoria | Já existe: cada critério da tese tem `tipo`: `cadastro` ou `pesquisa` (site oficial) |
| Desbloqueio pago de contato pessoal | **Não adotar**, como na §8.4 |

### 10.5 O que só se vê logado, e os dois caminhos

Faltam a tela real, a ordem visual dos cartões e se o custo aparece antes do clique. Há dois caminhos, ambos com a conta do próprio usuário:
1. **Extensão do Claude no Chrome conectada à mesma conta do Claude Code.** Ela observa o `/find` no navegador em que o usuário já está logado.
2. **A CLI ou o MCP oficial do Lessie, autorizado pelo próprio usuário no navegador.**
   - `lessie tools` lista os esquemas reais das ferramentas, e a listagem não aparece na tabela de custos.
   - Uma busca de verdade custa 20 créditos e só roda com o sim explícito do usuário.
   - Instalar a CLI executa um binário de terceiro nesta máquina, e essa decisão é do usuário.
