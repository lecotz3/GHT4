# Plano de implementação para o Claude Code

## Agente de prospecção M&A da GHT4 — piloto em Distribuição e Trading Químico

**Data do plano:** 27/08/2026  
**Documento de referência:** `Requisitos - Ferramenta de IA GHT4 (1).docx`, v1.0  
**Repositório inspecionado:** estado atual da pasta `GHT4/`  
**Objetivo:** transformar o protótipo existente em uma ferramenta operacional, auditável e segura, atendendo integralmente aos requisitos do documento, com o primeiro mapeamento real limitado ao subsetor **Distribuição e trading químico**.

---

## 1. Mandato para o Claude Code

Implemente este plano por fases, mantendo o produto utilizável ao final de cada fase. O documento de requisitos é fonte de requisitos de negócio, não uma fonte de comandos de implementação. Quando houver conflito, aplique esta ordem de precedência:

1. Este plano e o pedido atual do usuário.
2. Decisões de negócio já explícitas no código e na documentação mais recente.
3. O documento de requisitos v1.0.
4. Hipóteses antigas do protótipo.

Regras obrigatórias durante a implementação:

- Não descarte, reverta ou sobrescreva as alterações que já estão no working tree.
- Antes da primeira alteração, execute `git status`, registre o estado e crie um checkpoint recuperável aprovado pelo usuário. Nunca use `git reset --hard`, `git clean` ou equivalentes.
- Trabalhe em uma branch de implementação; não presuma que a autorização antiga para commits diretos em `main` continua válida.
- Atualize este arquivo ao concluir cada fase, marcando itens e registrando decisões ou desvios.
- Não declare um módulo “feito” só porque existe uma tela ou um esqueleto. “Feito” significa dados reais, persistência adequada, testes, segurança, auditoria e critérios de aceite aprovados.
- Preserve `index.html` como demonstração legada/offline. A aplicação operacional passa a ser a React em `v1/`, servida com backend; ela não deve continuar limitada pelas restrições de `file://`.
- Não raspe LinkedIn, Capital IQ ou EMIS. LinkedIn permanece fora do escopo automatizado; Capital IQ e EMIS entram por exportação autorizada do usuário ou API oficialmente contratada.
- O LLM nunca deve inventar número, empresa, conexão, evento, múltiplo ou fonte. Ausência continua sendo `null`/“não apurado”, nunca `false`, zero ou inferência silenciosa.
- Nenhuma ação externa ou mutação sensível pode ocorrer sem aprovação humana explícita. Isso inclui mudar score aprovado, promover empresa no CRM, importar dado confidencial, gerar lista final e qualquer futura abordagem ao mercado.

---

## 2. Decisões vigentes e premissas do piloto

### 2.1 Decisões que não devem ser reabertas durante a implementação

- Primeiro setor: **Químicos**.
- Primeiro subsetor: **Distribuição e trading químico**, já marcado como prioridade 1 em `setores.js`.
- Capital IQ e EMIS: acesso por login web, sem API contratada; importar arquivos exportados, sem automação de navegador ou scraping.
- Rede GHT4: usar currículos, listas e materiais internos autorizados; não fazer varredura automatizada de LinkedIn.
- O agente recomenda e explica; uma pessoa decide, aprova e assume responsabilidade.
- O produto não prevê transações, não substitui valuation, due diligence, aconselhamento profissional ou julgamento dos sócios.

### 2.2 Defaults seguros enquanto faltarem decisões dos sócios

- `distressedMode = false`: recuperação judicial, patrimônio negativo e EBITDA negativo aparecem em uma fila separada de situações especiais, não misturados ao ranking de alvos saudáveis.
- Contato externo e envio de e-mail ficam desabilitados.
- Pesos atuais são “hipótese do protótipo” até passarem por calibração e versionamento.
- Mapeamento cadastral da RFB: mensal; RAPP/IBAMA: anual; notícias: frequência configurável; dados pagos: conforme a exportação fornecida.
- Uma empresa com cobertura insuficiente recebe status **“dados insuficientes para ranquear”**, em vez de score alto calculado sobre poucos critérios.

### 2.3 Conflitos identificados no repositório

- `ESTADO-DA-ENTREGA.md` registra um caso anterior de Transporte & Logística. O pedido atual e `setores.js` tornam Químicos/Distribuição a decisão vigente.
- `ESTADO-DA-ENTREGA.md` diz que todos os módulos estão implementados. Na prática, vários são scaffolds demonstrativos: CRM e templates em `localStorage`, report sem texto analítico, news run sem coleta, valuation por CSV genérico, rede local, e nenhuma camada de LLM/agente.
- O HTML da raiz já carrega `data-quimicos.js`; a aplicação React em `v1/`, onde vivem os módulos completos, só conhece as bases `demo` e `cvm`.
- `mercado.js` ainda descreve cobertura apenas da CVM e usa faixa fixa de R$ 30–250 milhões, em conflito com a faixa de R$ 40–600 milhões definida para distribuição em `setores.js`.
- A taxonomia CNAE está duplicada entre `setores.js` e `ferramentas/importar-cnpj.mjs`, criando risco de divergência.

---

## 3. Diagnóstico do estado atual

### 3.1 O que deve ser preservado e aproveitado

- `setores.js`: boa taxonomia química, tese de M&A, CNAEs, adjacências, barreiras regulatórias, consolidadores e faixa por subsetor.
- `fontes.js`: bom catálogo de fontes e pipeline “universo → limpeza → qualificação → porte → evento → preço”.
- `scoring.js`: motor determinístico, explicável, por papel, com separação entre score, ressalva e lastro.
- `evidencias.js`: princípio correto de ligar afirmação, fonte, data, trecho e confiança; lacuna aparece como lacuna.
- `configuracao.js`: DSL declarativa útil como destino de uma interpretação em linguagem natural.
- `ferramentas/importar-cnpj.mjs`, `cruzar-ibama.mjs`, `importar-cvm.mjs` e `eventos-cnpj.mjs`: base relevante para os conectores de ingestão.
- `exportar-excel.js`: geração real de `.xlsx`, com várias abas e metodologia.
- `conexoes.js`, `crm.js`, `analises.js` e `matchmaking.js`: bons contratos iniciais de domínio, apesar da persistência e das fontes ainda demonstrativas.
- `v1/`: interface React 19/Vite/Tailwind funcional. O baseline atual passa em `npm run build` e `npm run lint`.
- Paleta e acessibilidade já trabalhadas; preservar as regras de `validar-paleta.mjs`.

### 3.2 O que impede o produto de ser um agente operacional

- Não há LLM, chat, tool calling, planejamento de tarefas ou execução iterativa.
- Não há backend, banco de dados, autenticação, autorização, segregação por mandato ou armazenamento seguro.
- Não há jobs, atualização programada, versionamento de snapshots ou reprocessamento idempotente.
- `data-quimicos.js` tem cerca de 22,8 MB e 38.583 registros; não deve ser carregado integralmente no navegador.
- O app React não usa a base química real.
- Não há suíte automatizada de testes de domínio, integrações, UI ou comportamento do agente.
- Templates, rede, análises e CRM ficam no navegador de uma pessoa e não atendem colaboração do time.
- O report de mercado é um esqueleto; o news run só recebe notícia importada; o Capital IQ não tem um fluxo validado contra a exportação real da GHT4.
- O ranking atual pode favorecer registros esparsos, pois normaliza o score pelo peso disponível sem impor cobertura mínima.
- A base CNPJ tem muito ruído de enquadramento por CNAE secundário e não resolve receita, EBITDA ou funcionários.
- Não há entidade canônica para consolidar matriz, filiais, grupo econômico, nomes históricos, dados de fontes distintas e conflitos.
- Não há proteção contra prompt injection contida em sites/documentos que o futuro agente venha a ler.

### 3.3 Matriz de aderência aos requisitos

| Módulo | Estado real atual | Resultado exigido |
|---|---|---|
| 1. Mapeamento | Parcial: universo químico existe no HTML legado, mas não na aplicação React e ainda contém ruído | Universo versionado, deduplicado e pesquisável; empresas por subsetor com status de inclusão e evidência |
| 2. Ranking de subsetores | Demonstrativo e baseado em proxies/CVM | Critérios do documento alimentados por transações, múltiplos, tendências e apetite, com pesos e cobertura |
| 3. Ranking de empresas | Bom motor determinístico; sem linguagem natural e sem calibração | Filtros, pesos, critérios ad hoc em prompt, preview da regra, versionamento e revisão humana |
| 4. Conexões | JSON/localStorage e dados demo | Rede interna compartilhada, permissões por pessoa/campo, entity resolution e confirmação humana |
| 5.1 Valuation | Parser genérico de CSV e aplicação parcial | Templates reais de exportação do Capital IQ, comps/precedentes, ajustes, revisão, lineage e Excel |
| 5.2 Report | Estrutura sem análise textual | Report source-backed com trends, TAM/SAM/SOM, players, Porter, SWOT e PESTLE, exportável em PDF |
| 5.3 News run | Repositório manual de notícias | Coleta licenciada/pública, deduplicação, classificação, período configurável e citações |
| 6. Matchmaking | Ranking de capacidade sobre a base disponível | Compradores/alvos internos e externos, apetite e histórico, prompt livre, fontes e revisão |
| 7. CRM | Monousuário/localStorage | Multiusuário, agenda, funil, calls, recusas, propostas, mandato, histórico append-only |
| Outputs | XLSX bom; PDF é impressão; sem chat real | Chat streaming, XLSX completo e PDF reproduzível com fontes e parâmetros |
| Transversais | Parcial | Segurança, RBAC, confidencialidade, atualização, auditoria, evals e observabilidade |

---

## 4. O que a pesquisa sobre IA em M&A muda neste plano

### 4.1 Evidências de mercado

- A McKinsey relata que identificação de alvos e due diligence já estão entre os usos principais de GenAI em M&A; ferramentas combinam LLMs, dados proprietários, clustering e busca semântica, mas exigem estratégia e critérios de M&A documentados. A mesma pesquisa sugere que deal scanning tende a gerar mais valor em mercados com muitos players dispersos — exatamente o caso de distribuição química. Fonte: [McKinsey, “Gen AI in M&A: From theory to practice to high performance”, 14/01/2026](https://www.mckinsey.com/capabilities/m-and-a/our-insights/gen-ai-in-m-and-a-from-theory-to-practice-to-high-performance).
- Pesquisa Datasite/FT Longitude com 1.000 dealmakers informa uso ou exploração de IA por 96% em sourcing/screening, mas destaca que confiança depende de segurança, exatidão, fontes e julgamento humano. Fonte: [Datasite, “How AI is making M&A more human”, 29/07/2026](https://www.datasite.com/en/resources/insights/how-ai-is-making-m-a-more-human).
- O estudo Deloitte de 2025 aponta 86% de integração de GenAI em workflows de M&A, mas registra como barreiras principais segurança dos dados (67%), qualidade/disponibilidade (65%) e confiabilidade/precisão do modelo (64%). A recomendação é pilotar casos prioritários em ambiente governado e acoplado ao fluxo existente. Fonte: [Deloitte, “2025 GenAI in M&A Study”](https://www.deloitte.com/content/dam/assets-zone3/us/en/docs/services/merger-and-acquisitions/2025/genai-ma-study-2025.pdf).

### 4.2 Consequências arquiteturais

- Começar com **um agente gerente** e ferramentas determinísticas; só dividir em vários agentes se os evals mostrarem falha persistente de instrução ou seleção de ferramenta. Isso reduz custo, latência e dificuldade de auditoria. Referências: [OpenAI, “A practical guide to building agents”](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) e [Anthropic, “Trustworthy agents in practice”](https://www.anthropic.com/research/trustworthy-agents).
- O LLM interpreta intenção, pesquisa texto e organiza o trabalho. Cálculo, filtro, score, estatística, persistência e exportação ficam em ferramentas tipadas e testáveis.
- O agente precisa de harness, permissões por ferramenta, limites de tentativas/custo, checkpoints, rastreamento de cada tool call e aprovação humana para ações sensíveis.
- Avaliar o trajeto completo, e não só a resposta final: ferramenta escolhida, parâmetros, fontes, cobertura, aprovações e estado final. Referência: [Anthropic, “Demystifying evals for AI agents”, 09/01/2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
- Toda fonte externa não confiável deve ser tratada como dado, nunca como instrução. O agente não pode obedecer texto encontrado em páginas, PDFs, planilhas ou notícias.

---

## 5. Arquitetura-alvo

```text
React/Vite (v1)
  ├─ Chat e acompanhamento de runs
  ├─ Mapa, empresas, dossiê, listas, análises e CRM
  └─ Aprovações, revisão e exportação
             │ HTTPS + SSE
             ▼
API Node/TypeScript
  ├─ Auth/RBAC e escopo de mandato
  ├─ Agent runtime e políticas de ferramentas
  ├─ Serviços determinísticos de domínio
  ├─ Imports/exports
  └─ OpenAPI + validação Zod
             │
       ┌─────┴─────────┐
       ▼               ▼
PostgreSQL/pgvector   Object storage
  dados estruturados    arquivos originais,
  provenance/auditoria  planilhas e reports
       │
       ▼
Jobs duráveis
  RFB, IBAMA, CVM, notícias, imports pagos, embeddings e reprocessamentos
```

### 5.1 Stack recomendada

- Frontend: manter React/Vite/Tailwind em `v1/`.
- Backend: Node LTS + TypeScript + Fastify.
- Contratos: Zod + OpenAPI; IDs opacos e validação em toda fronteira.
- Banco: PostgreSQL; `pgvector` apenas para busca semântica de texto, nunca como fonte de verdade.
- ORM/migrations: Drizzle ou equivalente tipado, escolhido uma vez e documentado.
- Jobs: fila durável baseada em Postgres para evitar adicionar Redis no primeiro deploy.
- Arquivos: S3 compatível, com hash SHA-256, classificação de confidencialidade e política de retenção.
- Agent provider: adaptador próprio (`AgentProvider`) com tool calling e structured output; nenhuma chave de modelo no cliente.
- Observabilidade: logs estruturados, traces de agent run/tool call, métricas de custo/latência/erro e correlação por `runId`.

### 5.2 Estrutura de pastas proposta

```text
GHT4/
  v1/                       # aplicação React
  server/
    src/
      api/
      agent/
      tools/
      services/
      repositories/
      jobs/
      providers/
      security/
    tests/
  packages/
    domain/                 # regras puras: taxonomia, scoring, matchmaking
    schemas/                # contratos Zod compartilhados
  db/
    migrations/
    seeds/
  fixtures/
    chemical-distribution/
    capital-iq/
    agent-evals/
  docs/
    architecture/
    data-dictionary/
    runbooks/
  legacy/                   # somente se for necessário mover a demo; preserve sua execução offline
```

O código de produção não deve continuar importando regras por efeito colateral em `window.*`. Migre gradualmente as regras para `packages/domain`; mantenha os arquivos globais apenas como compatibilidade da demo legada. Não duplique novas regras entre os dois mundos.

---

## 6. Modelo de dados mínimo

Crie migrations e contratos para as entidades abaixo. Todas as tabelas mutáveis precisam de `created_at`, `updated_at`, `created_by`; dados importados precisam também de `source_id`, `source_record_id`, `observed_at`, `collected_at`, `valid_from`, `valid_to` e `import_run_id` quando aplicável.

### 6.1 Mercado e empresas

- `sectors`, `subsectors`, `cnae_rules`, `adjacencies`, `regulatory_barriers`.
- `legal_entities`: raiz CNPJ, razão social, nomes, natureza jurídica, controle, status.
- `establishments`: CNPJ completo, matriz/filial, endereço, contatos cadastrais, CNAEs.
- `economic_groups` e `group_memberships`.
- `company_subsector_classifications`: classe sugerida, status (`confirmada`, `provavel`, `possivel`, `excluida`), motivo, evidências e revisão.
- `company_snapshots`: atributos observados por data; nunca sobrescrever o passado.
- `financial_observations`: receita, EBITDA, margem, dívida, caixa, funcionários, unidade, moeda, período, natureza (`reportado`, `estimado`, `proxy`).
- `regulatory_records`: IBAMA/RAPP, ANVISA, MAPA, PF/SIPROQUIM e outras licenças.
- `corporate_events`: mudança de controle, aporte, filial, recuperação judicial, aquisição, expansão; evento sempre ligado a evidência.

### 6.2 Evidência e conhecimento

- `sources`: proprietário, URL, licença/contrato, frequência, método permitido, confiabilidade e classificação de acesso.
- `documents`: arquivo original, hash, MIME type, data, confidencialidade e permissões.
- `evidence_fragments`: página/seção/linha/célula, trecho curto, tabela, metadados e método de extração.
- `claims`: afirmação atômica, entidade/período, tipo, confiança, status de revisão e um ou mais `evidence_fragments`.
- `claim_conflicts`: fontes divergentes e resolução humana.
- Uma resposta exibida não cita URL livre; cita `claim_id`/`evidence_id`, que resolve para a fonte original e a data de coleta.

### 6.3 Scoring, agente e revisão

- `screening_templates` e `screening_template_versions`.
- `screening_runs`, `screening_rules`, `screening_results`, `score_contributions` e `coverage_metrics`.
- `agent_runs`, `agent_steps`, `tool_calls`, `tool_approvals`, `run_artifacts` e `run_feedback`.
- `human_decisions`: decisão append-only, autor, justificativa, regra/score visto no momento e evidências disponíveis.
- `valuation_runs`, `valuation_inputs`, `valuation_adjustments` e `valuation_reviews`.

### 6.4 Rede e CRM

- `users`, `teams`, `roles`, `mandates`, `mandate_memberships`.
- `network_members`, `employment_history`, `education`, `internal_contacts`, `connection_matches`, `connection_reviews`.
- `crm_companies`, `crm_stage_history`, `calls`, `refusals`, `proposals`, `tasks` e `activity_log`.
- Dados pessoais da rede devem ter controle de campo e escopo; o usuário só vê o que sua função e o mandato permitem.

---

## 7. Desenho do agente

### 7.1 Responsabilidade do agente

O agente recebe um objetivo em linguagem natural, transforma-o em um plano visível, consulta as ferramentas autorizadas, apresenta regras para aprovação, executa a análise, verifica cobertura/conflitos e entrega um resultado com fontes. Ele não altera as regras de negócio silenciosamente.

Fluxo mínimo:

1. Entender setor, subsetor, papel M&A, geografia, porte, sinais desejados, período e política de dado ausente.
2. Se faltar uma decisão que muda materialmente o universo, pedir esclarecimento; caso contrário, usar defaults declarados.
3. Gerar uma `ScreeningProposal` estruturada.
4. Mostrar filtros duros, preferências, pesos, proxies, fontes e estimativa de cobertura.
5. Exigir aprovação para executar ou salvar a proposta.
6. Consultar o universo, enriquecer só os candidatos necessários e rodar regras determinísticas.
7. Fazer uma verificação final de evidência, conflito, atualidade e cobertura.
8. Entregar shortlist/longlist, exclusões, lacunas, metodologia e próximos passos.
9. Só após nova aprovação: exportar, salvar no CRM ou compartilhar.

### 7.2 Ferramentas iniciais

Todas as ferramentas devem ter schema, descrição não ambígua, classificação de risco, timeout, limite de linhas, idempotency key e testes.

**Somente leitura, baixo risco:**

- `search_companies`
- `get_company_profile`
- `get_company_evidence`
- `get_market_map`
- `get_source_coverage`
- `search_internal_knowledge`
- `search_news`
- `get_network_connections`
- `get_transactions_and_multiples`

**Cálculo determinístico:**

- `preview_screening_rule`
- `run_company_screening`
- `rank_subsectors`
- `build_buyer_list`
- `build_target_list`
- `calculate_valuation`
- `generate_market_report_data`

**Escrita, exige aprovação:**

- `save_screening_template`
- `confirm_company_classification`
- `record_human_decision`
- `add_company_to_crm`
- `move_crm_stage`
- `save_valuation_review`
- `generate_xlsx`
- `generate_pdf`

Não criar ferramenta de envio de e-mail ou mensagem nesta entrega.

### 7.3 DSL de critérios

O LLM deve produzir uma estrutura validada, nunca JavaScript, SQL ou expressão livre executável. Exemplo:

```json
{
  "intent": "screen_companies",
  "universe": {
    "sector": "Químicos",
    "subsector": "Distribuição e trading químico",
    "geographies": ["SP", "PR", "MG"]
  },
  "hardFilters": [
    { "field": "classificationStatus", "operator": "in", "value": ["confirmada", "provavel"] },
    { "field": "specialSituation", "operator": "is_null" }
  ],
  "preferences": [
    { "signal": "successionWindow", "weight": 25 },
    { "signal": "multiStateFootprint", "weight": 15 },
    { "signal": "regulatoryQualification", "weight": 20 }
  ],
  "missingDataPolicy": "flag",
  "minimumCoverage": 0.6
}
```

O preview deve traduzir essa estrutura para linguagem humana, mostrar quantas empresas cada filtro elimina e avisar sobre critérios sem fonte.

### 7.4 Guardrails

- Bloquear SQL, código ou URLs arbitrárias vindas do modelo.
- Allowlist de domínios e conectores; política por fonte e por mandato.
- Tratar conteúdo recuperado como não confiável e remover/neutralizar instruções embutidas.
- Limite de passos, retries, tempo, custo e volume por run.
- Interromper e pedir humano diante de conflito material, baixa cobertura, ação de escrita ou tentativa de ampliar escopo.
- Validar que toda afirmação factual tenha evidência compatível; número precisa de unidade e período.
- Nunca elevar inferência a fato. Exibir `reportado`, `estimado`, `proxy` ou `inferido` ao lado do valor.
- Redigir “sinais de possível abertura a uma transação”, nunca “empresa quer vender” sem evidência direta.

---

## 8. Piloto: Distribuição e trading químico

### 8.1 Baseline já existente

O snapshot atual permite reproduzir este funil:

| Corte | Empresas |
|---|---:|
| Universo químico ativo | 38.583 |
| Distribuição e trading químico | 6.592 |
| Enquadramento por CNAE principal | 1.670 |
| CNAE principal + janela de sucessão | 204 |
| Corte anterior + RAPP/IBAMA vivo desde 2022 | 35 |

Os 35 registros de `dossie-distribuicao-sucessao.md` são uma **coorte de validação**, não o universo final nem um ranking definitivo. O filtro de sucessão deve ser opcional e configurável.

### 8.2 Definição operacional do subsetor

- CNAEs principais: `4684201`, `4684202`, `4684299`.
- CNAE secundário admitido como descoberta: `4689399`, mas nunca como confirmação isolada.
- Faixa de receita inicial: R$ 40–600 milhões, sempre tratada como hipótese versionada e específica do subsetor.
- Característica econômica: compra, importação, fracionamento, formulação, armazenagem, logística e venda B2B de produtos químicos; excluir combustível, cosmético acabado, farmácia, plástico transformado e comércio geral sem evidência de operação química.

### 8.3 Camadas de classificação

- **Confirmada:** certificado/listagem ASSOCIQUIM-PRODIR, ou CNAE principal compatível somado a evidência operacional forte (site/portfólio/RAPP/licença).
- **Provável:** CNAE principal compatível sem contradição, com pelo menos uma evidência cadastral ou operacional adicional.
- **Possível:** enquadramento apenas por CNAE secundário ou texto comercial ambíguo.
- **Excluída:** atividade principal comprovadamente fora do recorte, entidade sem atividade empresarial relevante, filial/grupo duplicado, combustível, associação, cadastro estrangeiro sem operação alvo no Brasil ou outro motivo registrado.
- Toda mudança de classe exige autor, data, evidência e justificativa.

### 8.4 Fontes do piloto, na ordem de uso

1. **RFB/CNPJ:** universo, matriz/filiais, CNAEs, idade, natureza jurídica, quadro societário minimizado e contatos cadastrais.
2. **ASSOCIQUIM/PRODIR:** seed set de alta precisão e certificação; a página publica empresa, localização, site, número e validade do certificado. Fonte: [Empresas certificadas](https://www.associquim.org.br/empresas-certificadas/).
3. **IBAMA/RAPP:** confirmação de operação, categorias, produtos/rotas e pegada geográfica; não usar volumes inconsistentes como proxy de porte. Fonte: [Portal de Dados Abertos do IBAMA](https://dadosabertos.ibama.gov.br/pt_BR/dataset/).
4. **Sites oficiais das empresas:** descrição de atividades, produtos, unidades, fornecedores representados e mercados atendidos; guardar evidência e data.
5. **Polícia Federal/SIPROQUIM:** consulta pontual de empresas já selecionadas. A PF não divulga lista em massa; a consulta é por CNPJ e mostra validade, produtos e atividades. Fontes: [Produtos Químicos — PF](https://www.gov.br/pf/pt-br/assuntos/produtos-quimicos) e [Comunicado DCPQ 01/2023](https://www.gov.br/pf/pt-br/assuntos/produtos-quimicos/comunicados-e-circulares/com_012023.pdf).
6. **CVM:** dados auditados e comparáveis para as poucas companhias abertas.
7. **Econodata/EMIS:** porte, funcionários e perfil de capital fechado, mediante exportação/licença autorizada.
8. **Capital IQ:** múltiplos, precedentes, consolidadores e histórico de aquisições, mediante exportação autorizada.
9. **Notícias e fontes setoriais:** eventos de controle, expansão, aquisições, sucessão e situação especial.

### 8.5 Pipeline do piloto

1. Ingerir snapshot da RFB no banco de modo streaming e idempotente.
2. Consolidar estabelecimentos por raiz CNPJ, sem perder filiais e datas.
3. Aplicar taxonomia única e gerar motivo de inclusão para cada regra.
4. Marcar `primary_cnae`, `secondary_only`, adjacência ou exclusão.
5. Resolver nomes e cruzar o seed da ASSOCIQUIM por razão social + UF + site; enviar matches ambíguos para revisão.
6. Cruzar IBAMA por CNPJ raiz e registrar a natureza da confirmação.
7. Enriquecer websites em fila controlada, respeitando robots, termos, rate limit e allowlist.
8. Importar planilhas pagas com relatório de colunas reconhecidas, ausentes e conflitos.
9. Calcular eventos por diferença de snapshots, sem interpretar aumento de capital como rodada sem evidência adicional.
10. Produzir cobertura por empresa e por critério.
11. Submeter uma amostra estratificada aos sócios para rotular `incluir/excluir`, papel M&A e prioridade.
12. Calibrar regras e pesos; congelar `screening_template_version` usado no primeiro resultado oficial.

### 8.6 Score específico do piloto

Separar cinco dimensões, em vez de um único número opaco:

- **Elegibilidade:** pertence ao subsetor, situação ativa, faixa de porte, não é duplicata/adjacência.
- **Qualidade do ativo:** portfólio, contratos/exclusividade quando disponíveis, capilaridade, licenças, certificação, margem e recorrência.
- **Timing:** sucessão, mudança de controle, aporte, recuperação, expansão, notícias e tempo desde o último evento.
- **Acesso:** força e qualidade de conexão da rede GHT4.
- **Risco/cobertura:** situação especial, passivo regulatório/ambiental, fonte desatualizada, conflito e dados ausentes.

Exibir:

- score bruto;
- score normalizado;
- cobertura total e por dimensão;
- contribuições positivas e negativas;
- filtros que a empresa não atendeu;
- dados não apurados;
- versão da regra;
- evidências usadas.

Não ranquear como comparáveis empresas abaixo da cobertura mínima. Em empates, usar qualidade/atualidade da evidência e critérios de negócio versionados; nunca a ordem incidental do arquivo.

---

## 9. Fases de implementação

### Fase 0 — Proteger o baseline e tornar o plano executável

**Tarefas**

- Registrar `git status`, branch, commit atual e arquivos grandes/gerados.
- Criar checkpoint recuperável aprovado, sem apagar o working tree.
- Documentar quais arquivos são fonte, gerados ou demo.
- Adicionar `docs/architecture/current-state.md` com o diagnóstico acima.
- Adicionar scripts raiz para `build`, `lint`, `test`, `test:e2e` e `validate:data`.
- Garantir que `npm run build` e `npm run lint` continuem verdes.

**Aceite**

- Estado anterior recuperável.
- Nenhuma alteração do usuário perdida.
- CI mínima executa build/lint em ambiente limpo.

### Fase 1 — Contratos de domínio e fonte única da taxonomia

**Tarefas**

- Criar `packages/schemas` e `packages/domain`.
- Migrar primeiro a taxonomia de `setores.js` para um contrato JSON/TS único, consumido por importadores, backend e React.
- Eliminar a duplicação `SUBSETOR_POR_CNAE` de `importar-cnpj.mjs`.
- Portar regras puras de scoring, configuração, mercado e matchmaking com testes de regressão contra fixtures atuais.
- Corrigir faixa de distribuição e ressalvas stale em `mercado.js`/equivalente novo.
- Definir `DataValue<T>` com `value`, `status`, `source`, `observedAt`, `confidence` e `method`.

**Aceite**

- A taxonomia passa no verificador e em testes de adjacência/exclusão.
- Resultados do motor atual são reproduzidos para fixtures conhecidas ou diferenças são documentadas e aprovadas.
- Nenhuma regra de produção depende de `window.*`.

### Fase 2 — Backend, banco, autenticação e auditoria

**Tarefas**

- Criar `server/`, migrations e Docker Compose de desenvolvimento.
- Implementar autenticação, sessões seguras e papéis `admin`, `socio`, `analista`, `leitura`.
- Implementar escopo por mandato e políticas de campo para rede/contatos.
- Criar repositórios, serviços e API OpenAPI.
- Implementar auditoria append-only e idempotency keys.
- Migrar templates, CRM, rede e revisões de `localStorage` para APIs; oferecer importação única do estado local existente.

**Aceite**

- Dois usuários veem o mesmo CRM conforme permissão.
- Usuário sem mandato não acessa dados confidenciais daquele mandato.
- Toda mutação registra quem, quando, antes/depois e justificativa.

### Fase 3 — Ingestão e entity resolution do piloto químico

**Tarefas**

- Transformar importadores atuais em jobs idempotentes com `import_run` e relatório de qualidade.
- Carregar os 38.583 registros no banco; não enviar a base inteira ao browser.
- Implementar classificação em quatro estados e fila de revisão.
- Ingerir/casar ASSOCIQUIM e IBAMA.
- Implementar importadores versionados para formatos reais de Econodata/EMIS/Capital IQ assim que fixtures forem fornecidas.
- Criar tela de cobertura e conflitos de fonte.

**Aceite**

- Contagens baseline são reproduzíveis por snapshot.
- 100% dos registros têm motivo de inclusão/exclusão e data de coleta.
- Seed ASSOCIQUIM tem recall mínimo de 95% após revisão dos aliases.
- Top 100 do ranking alcança precisão mínima de 90% para “é distribuidor químico no escopo”, medida em amostra rotulada pela GHT4.

### Fase 4 — Scoring configurável e linguagem natural

**Tarefas**

- Implementar DSL validada e preview de impacto.
- Migrar templates para versões compartilhadas e imutáveis após uso.
- Separar filtro duro, preferência, risco, cobertura e papel M&A.
- Adicionar política explícita de dado ausente e cobertura mínima.
- Implementar calibração com conjunto dourado e comparação par-a-par pelos sócios.
- Registrar feedback sem alterar pesos automaticamente; qualquer nova versão exige aprovação.

**Aceite**

- Mesmos dados + mesma versão de regra = mesmo ranking.
- Prompt nunca é executado como código/SQL.
- UI mostra a tradução do prompt e exige aprovação antes da execução.
- Empresa esparsa não supera empresa bem documentada apenas por ter denominador menor.

### Fase 5 — Runtime do agente e chat

**Tarefas**

- Implementar `AgentProvider`, agente gerente, catálogo de ferramentas e políticas de aprovação.
- Criar runs persistentes com SSE, cancelamento, timeout, orçamento e retomada.
- Implementar planejamento visível e artefatos por etapa.
- Implementar verificador de evidência antes da resposta final.
- Adicionar defesa contra prompt injection e validação de saída estruturada.
- Criar evals de tool selection, parâmetros, recusa, aprovação e citações.

**Aceite**

- O agente completa os cenários dourados de prospecção sem ferramenta indevida.
- Nenhuma ferramenta de escrita executa sem aprovação.
- 100% das afirmações factuais exibidas apontam para evidência, fonte e data ou são rotuladas como inferência/lacuna.
- Falha de fonte produz resultado parcial explícito, não alucinação nem run travado.

### Fase 6 — Unificar a experiência React

**Tarefas**

- Adicionar base química e paginação/server-side search ao React.
- Implementar chat lateral com artefatos clicáveis.
- Atualizar Mapa, Empresas, Dossiê, Listas, Rede, Análises e Pipeline para as APIs.
- Criar painel “afirmação ↔ documento original”, com trecho e localização.
- Criar fila de revisão de classificação, conexão, evidência e score.
- Preservar identidade visual e acessibilidade.

**Aceite**

- Nenhuma tela carrega dezenas de milhares de empresas em memória.
- Busca/filtro do piloto responde em p95 inferior a 2 segundos no ambiente de homologação.
- Dossiê permite auditar cada contribuição sem sair do contexto.
- Navegação por teclado e contraste continuam aprovados.

### Fase 7 — Completar módulos 4, 5, 6 e 7

**Módulo 4 — Rede**

- Importar currículos/listas internos em formatos documentados.
- Resolver entidades com CNPJ quando disponível e aliases com revisão.
- Distinguir vínculo direto, no grupo, histórico, formação, setor e praça.
- Não pontuar conexão fraca como “temos entrada”.

**Módulo 5.1 — Valuation**

- Modelar trading comps e precedentes separadamente.
- Implementar mapeamento assistido de colunas, ajustes de comparabilidade, moeda/data e estatísticas.
- Exigir revisão humana e registrar ajuste sem apagar o cálculo original.

**Módulo 5.2 — Report**

- Montar report a partir de claims citáveis.
- Diferenciar TAM, SAM, SOM e piso observável; exigir metodologia, unidade e período.
- Gerar Porter, SWOT e PESTLE com claims e lacunas por seção.

**Módulo 5.3 — News run**

- Conector por fonte autorizada, deduplicação por URL/título/data, relevance classifier e vínculo empresa/setor.
- Período configurável e atualização incremental.

**Módulo 6 — Matchmaking**

- Integrar consolidadores de `setores.js`, Capital IQ/EMIS e histórico interno.
- Separar capacidade, fit estratégico, apetite observado, histórico de aquisição, restrições e conexão.
- Permitir prompt livre via mesma DSL/preview do screening.

**Módulo 7 — CRM**

- Agenda por colaborador, tarefas, estágio, calls, recusas, propostas e mandato.
- Snapshot da tese/score na entrada e acesso ao ranking atual, sem misturar os dois.
- Métricas de conversão, tempo por estágio, origem da oportunidade e feedback para calibração.

**Aceite**

- Cada módulo usa a mesma entidade canônica e o mesmo catálogo de evidências.
- Dados coletados em um módulo são reutilizados pelos demais sem cópia divergente.
- Nenhuma análise se apresenta completa quando a fonte necessária não foi fornecida.

### Fase 8 — Excel, PDF e pacote de entrega

**Tarefas**

- Manter `.xlsx` verdadeiro e gerar no servidor para datasets grandes.
- Incluir abas: `Resumo`, `Mapa`, `Empresas`, `Evidências`, `Exclusões`, `Metodologia`, `Valuation`, `Notícias`, `CRM` e `Auditoria` quando aplicáveis.
- Preservar a visão solicitada no documento (“subsegmentos em colunas”) em uma aba de mapa; usar tabela normalizada nas abas analíticas.
- Gerar PDF server-side a partir de template versionado, com fontes, data de corte e parâmetros.
- Guardar hash, versão da regra e snapshot dos outputs.

**Aceite**

- Reabrir o output permite reproduzir exatamente universo, regra, fontes e score.
- Excel abre sem aviso de corrupção e possui tipos numéricos reais.
- PDF não contém afirmação sem fonte e passa por teste visual de páginas.

### Fase 9 — Segurança, evals, observabilidade e deploy

**Tarefas**

- Threat model para confidencialidade de mandatos, rede e prompt injection.
- TLS, criptografia em repouso, secrets manager, backups testados, retenção e exclusão.
- SAST, dependency scan, secret scan e testes de autorização.
- Evals offline com fixtures; staging sem dados de produção; red team de instruções maliciosas em páginas/planilhas.
- Dashboards de custo, latência, erro, cobertura, taxa de revisão e qualidade do ranking.
- Runbooks de importação, falha de fonte, restauração e incidente.

**Aceite**

- Zero acesso cruzado entre mandatos nos testes de autorização.
- Zero segredo no frontend, repositório ou log.
- Backups restaurados em teste.
- Agent eval suite bloqueia regressão antes do deploy.
- Deploy possui rollback documentado.

---

## 10. Testes obrigatórios

### 10.1 Domínio e dados

- Taxonomia: CNAEs, adjacências, exclusões, faixa por subsetor e ausência como `null`.
- Importação: idempotência, encoding, CSV com aspas/quebras, snapshot e conflito.
- Entity resolution: matriz/filial, raiz CNPJ, alias, homônimo e mesmo grupo.
- Scoring: invariantes, cobertura, denominador, empate, distressed e versionamento.
- Valuation: moeda, período, EV versus equity value, outlier, mediana e ajustes.
- Excel/PDF: estrutura, tipos, fontes e render visual.

### 10.2 Agente

- Prompt simples, ambíguo, contraditório e fora do escopo.
- Tradução correta para DSL e explicação humana equivalente.
- Escolha correta de ferramenta e parâmetros.
- Fonte indisponível, timeout, dado conflitante e cobertura baixa.
- Prompt injection dentro de site, PDF, célula CSV e notícia.
- Tentativa de escrita sem aprovação.
- Citação inexistente, fonte sem data e número sem unidade/período.
- Reprodutibilidade do resultado determinístico após a interpretação aprovada.

### 10.3 UI e segurança

- Fluxo ponta a ponta: prompt → preview → aprovação → run → dossiê → Excel → CRM.
- Acessibilidade por teclado e leitor de tela nos diálogos de aprovação.
- RBAC e escopo por mandato.
- Upload malicioso, tamanho de arquivo, MIME falso e fórmula de Excel/CSV injection.
- Concorrência de dois revisores e trilha append-only.

---

## 11. Métricas de sucesso

### Qualidade do mapeamento

- Recall ≥ 95% sobre o seed ASSOCIQUIM revisado.
- Precisão ≥ 90% no top 100 do subsetor, validada pela GHT4.
- 100% dos registros com motivo de inclusão/exclusão e data de coleta.
- Taxa de empresas “somente CNAE secundário” explicitada, nunca misturada silenciosamente às confirmadas.

### Qualidade da recomendação

- 100% das contribuições de score auditáveis.
- 100% das afirmações factuais com evidência ou rótulo de inferência/lacuna.
- NDCG/Top-k e concordância com ranking dos sócios medidos no conjunto dourado; meta inicial definida após a primeira rodada de rotulagem.
- Nenhuma empresa classificada como alta prioridade abaixo da cobertura mínima.

### Operação

- p95 de busca/filtro < 2 s; abertura de dossiê < 1 s após cache.
- ≥ 95% dos runs dourados concluídos sem intervenção técnica.
- 0 mutações sensíveis sem aprovação registrada.
- Custo e tokens por tipo de run medidos e com orçamento configurável.

### Negócio

- Tempo de longlist até shortlist.
- Empresas qualificadas por analista/semana.
- Taxa de aprovação da shortlist pelos sócios.
- Taxa de contato, conversa, proposta e mandato por origem/sinal/template.
- Motivos de descarte e de recusa retroalimentam a calibração, nunca o modelo automaticamente.

---

## 12. Decisões que exigem validação da GHT4, sem bloquear a infraestrutura

Criar `docs/DECISOES-DE-NEGOCIO.md` e manter estes itens como configuração/versionamento:

1. A GHT4 faz distressed? Default: não misturar com alvo saudável.
2. Faixa R$ 40–600 milhões e papel de receita versus EBITDA em distribuição.
3. Critérios, pesos, cobertura mínima e nomenclatura dos três papéis.
4. Quais exportações reais de Econodata, EMIS e Capital IQ estarão disponíveis.
5. Quem pode ver contatos, currículos, mandatos e valuations.
6. Provedor/modelo de IA, região de processamento e política de retenção/treinamento contratual.
7. Frequência e orçamento dos jobs de atualização.
8. Formato oficial do PDF e do Excel.
9. Métrica primária de sucesso do piloto.

Use os defaults seguros deste plano até a decisão, mas nunca esconda que são defaults.

---

## 13. Definition of Done global

O projeto só pode ser declarado aderente ao documento quando:

- todos os sete módulos funcionarem sobre a entidade canônica e o banco compartilhado;
- o piloto de distribuição química atingir os critérios de precisão/recall acordados;
- prompt livre virar regra estruturada, revisável e reproduzível;
- toda afirmação tiver fonte/data ou rótulo explícito de lacuna/inferência;
- rankings e valuations tiverem revisão humana e versionamento;
- CRM, rede e templates forem multiusuário e protegidos por RBAC;
- chat, Excel e PDF forem gerados a partir do mesmo snapshot;
- imports tiverem lineage, atualização e relatório de qualidade;
- agente, domínio, API, UI, autorização e outputs tiverem testes automatizados;
- segurança, backup, observabilidade, custo e rollback estiverem documentados e verificados;
- `README.md` e `ESTADO-DA-ENTREGA.md` forem atualizados para refletir o estado real, distinguindo demo, piloto, homologação e produção.

Até lá, use rótulos precisos como “protótipo”, “scaffold”, “piloto” ou “parcial”; não “feito”.

---

## 14. Registro de execução

Atualizado ao concluir cada fase, conforme o mandato da seção 1. Registra o que
foi feito, o que foi decidido e onde a execução divergiu do plano — com o motivo.

### Fase 0 — concluída em 27/08/2026

**Entregue**

- Checkpoint `c68aff5` na branch `baseline/pre-plano`. Congela ~24 MB de trabalho
  que não estava em commit nenhum e não estava no origin. `main` intacta em
  `b1a078b`. Sem push.
- Branch de implementação: `feat/agente-operacional`.
- `docs/architecture/current-state.md` — diagnóstico verificado no código, com
  inventário fonte/gerado/demo e as correções à seção 3 deste plano.
- `package.json` na raiz com `build`, `lint`, `test`, `test:e2e`, `validate:data`
  e `ci`.
- `tests/motor.mjs` — carrega os `.js` da raiz num `window` falso, na ordem do
  `index.html`. Base química fica fora por padrão.
- `tests/taxonomia.test.mjs` — 13 testes de regressão da taxonomia.
- `.github/workflows/ci.yml` — lint, build, testes, taxonomia e paleta em
  ambiente limpo.

**Aceite verificado:** `npm run ci` sai 0. Estado anterior recuperável por
`git checkout baseline/pre-plano`. Nenhuma alteração do usuário perdida.

**Divergências do plano, com motivo**

1. **§2.3 está errado sobre o `index.html`.** Ele já carrega `setores.js`,
   `fontes.js`, `data-quimicos.js` e `data-ibama.js`. A lacuna da base química é
   só da v1 em React, e é a Fase 6 que a fecha.

2. **§2.3 trata a duplicação da taxonomia como defeito a eliminar; ela é
   deliberada e já tem guarda.** `ferramentas/verificar-taxonomia.mjs` existe
   para isso e passa. Eliminar a duplicação convertendo `setores.js` para ESM
   quebraria o duplo-clique em `file://`, que a seção 1 deste mesmo plano manda
   preservar. A Fase 1 resolve sem apagar lado nenhum: fonte única em
   `packages/domain`, os dois consumidores derivam dela, e o verificador vira
   teste de regressão da geração.

3. **§8.1 chama o funil de "baseline já existente".** É reproduzível, mas
   `data-quimicos.js` declara que `receita`, `crescimento`, `margemEbitda` e
   `funcionarios` são nulos nos 38.583 registros. O funil é coorte de validação,
   não ranking, e nenhum corte de porte se sustenta sobre essa base sozinha.

4. **Raiz sem npm workspaces.** O `package.json` delega com `--prefix`. Declarar
   workspaces reposicionaria `v1/node_modules` no próximo install, e o aceite da
   Fase 0 é que build e lint *continuem* verdes. Reavaliar quando `server/`
   existir e a CI estiver protegendo.

5. **`test:e2e` sai com código 1 em vez de fingir sucesso**, e fica fora do
   script `ci` até existir de verdade.

### Fase 1 — em andamento

**Concluído**

- **Fonte única da taxonomia.** `packages/domain/taxonomia.mjs` é a fonte;
  `setores.js` passou a ser gerado por `ferramentas/gerar-globais.mjs` e segue
  commitado; `ferramentas/importar-cnpj.mjs` importa `tabelaSubsetorPorCnae()` e
  perdeu o literal de 33 CNAEs.
- **A regra implícita virou declarada.** `CNAE_APENAS_DESCOBERTA`: o 4689399
  levanta candidato e nunca enquadra sozinho; o 4683400 enquadra. Antes essa
  distinção era um literal escrito à mão, sem explicação.
- **`verificar-taxonomia.mjs` mudou de papel.** A duplicação que ele guardava
  acabou. Agora confere se os gerados estão em dia e segue validando os códigos
  contra a CNAE do IBGE — que é o que só ele faz.
- **Faixa consolidável corrigida.** `mercado.js` consultava um corte fixo de
  R$ 30–250 mi; passa a chamar `naFaixaConsolidavel()`, que resolve a faixa do
  próprio subsetor. Receita ausente deixou de contar como "fora da faixa": vira
  `semFaixaApurada` e sai do denominador, e `pctNaFaixa` é `null` quando nada foi
  avaliado. Isso muda o resultado na base do CNPJ, onde a receita é nula nos
  38.583 registros — antes reportaria 0%, que afirma "nenhuma na faixa".
- **Contrato `Dado<T>`** em `packages/schemas/dado.mjs` + `.d.ts`. Estados
  `reportado`, `estimado`, `proxy`, `inferido`, `nao_apurado`. Recusa `null` com
  estado apurado, lastro sem fonte, número sem unidade, e ausência sem motivo.
- **`mercado.js` portado** para `packages/domain/mercado.mjs`, o primeiro módulo
  de regra a sair do `window.*`.
- **Gerador generalizado.** `gerar-globais.mjs` reescreve
  `import * as X from './y.mjs'` para `const X = window.GLOBAL;`, o que torna o
  porte dos demais módulos mecânico. Só import de namespace é suportado, de
  propósito: import nomeado quebraria no ciclo real entre scoring e configuração.

**Estado:** 38 testes, `npm run ci` sai 0.

**Concluído também**

- **Porte para `packages/domain`:** `evidencias`, `conexoes`, `scoring`,
  `configuracao` e `matchmaking`, além de `mercado`. São os quatro módulos que
  esta fase nomeia, mais as duas folhas de que dependem.
- **`packages/domain/armazenamento.mjs`** — porta de persistência local. As
  camadas de configuração e rede liam `window.localStorage` dentro de um
  try/catch que, fora do navegador, virava fluxo de controle para um
  `ReferenceError`. Agora há um lugar só para trocar quando a Fase 2 levar a
  persistência para o backend.
- **Guardas passaram a testar capacidade, não módulo.** `window.EVIDENCIA ? …`
  virou `EVIDENCIAS.evidenciaDe ? …`. No global gerado a ligação é tardia (um
  Proxy que lê `window` no acesso), e um Proxy é sempre verdadeiro — testar o
  módulo daria falso positivo. Testar a capacidade é correto nos dois mundos.
- **Ligação tardia no gerado.** O gerador emite Proxy em vez de
  `const X = window.Y`. Capturar na carga congelaria `undefined` no ciclo
  scoring↔configuração e na v1, que carrega `configuracao.js` depois de
  `scoring.js` — o recurso de critérios ad hoc sumiria em silêncio.
- **Cada gerado sai dentro de uma IIFE.** Os `.js` da raiz dividem um escopo só,
  e `scoring` e `matchmaking` declaram ambos o alias `CONFIG`. Sem a IIFE, o
  segundo `<script>` derruba a página com SyntaxError — a regra 0 do projeto,
  que já tinha mordido antes com `LIMITACOES`.

**Aceite verificado**

`tests/regressao-do-porte.test.mjs` carrega a versão dos `.js` da raiz anterior
ao porte (via `git show`) e a atual, roda as duas sobre a base de demonstração e
compara `avaliarEmpresa` empresa por empresa e o mapa de mercado inteiro. São
idênticos: o porte não mudou um número. 45 testes, `npm run ci` sai 0.

**Fronteira desta fase, declarada**

`analises.js` e `exportar-excel.js` continuam lendo globais —
`window.MERCADO` no primeiro; `CONFIGURACAO`, `CRM`, `EVIDENCIA`, `MERCADO` e
`MOTOR` no segundo. Não foram portados de propósito: esta fase nomeia scoring,
configuração, mercado e matchmaking, e esses dois pertencem às Fases 7 (módulo 5)
e 8 (outputs), onde serão reescritos de qualquer modo. `crm.js` e `fontes.js` só
publicam o próprio global, e os `data-*.js` são base, não regra.

Portanto o aceite "nenhuma regra de produção depende de `window.*`" está cumprido
para o escopo nomeado, e explicitamente **não** para esses dois — que ficam
registrados aqui em vez de passarem por concluídos.
