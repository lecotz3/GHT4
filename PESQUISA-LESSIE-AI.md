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
