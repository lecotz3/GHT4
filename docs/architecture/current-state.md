# Estado atual — diagnóstico verificado

**Data:** 27/08/2026
**Commit de baseline:** `c68aff5` na branch `baseline/pre-plano`
**Branch de trabalho:** `feat/agente-operacional`
**Plano em execução:** `PLANO-CLAUDE-CODE-AGENTE-PROSPECCAO.md`

Este documento registra o que foi **verificado no código**, não o que se supõe.
Ele existe porque a seção 3 do plano descreve o repositório com alguns erros, e
implementar sobre um diagnóstico errado custa mais caro do que corrigi-lo antes.

---

## 1. Ponto de partida no git

Antes da primeira alteração havia ~24 MB de trabalho não commitado e **sem backup
em lugar nenhum**: `origin/main` estava — e continua — em `b1a078b`.

O checkpoint `c68aff5` congelou esse estado na branch `baseline/pre-plano`. Ele
versiona a camada química inteira e deixa de fora apenas `.cache/` (2 GB de CSV
bruto do RAPP/IBAMA), seguindo a regra que o próprio `.gitignore` já declarava:
matéria-prima não é versionada, resultado convertido é.

`main` permanece intacta em `b1a078b`. Nada foi enviado ao origin.

> **Para voltar ao ponto de partida:** `git checkout baseline/pre-plano`.
> Nunca use `git reset --hard` nem `git clean` nesta árvore — parte do que existe
> aqui não tem outra cópia.

---

## 2. Inventário: fonte, gerado e demo

### Fonte — escrito à mão, é onde se edita

> Mudou na Fase 1. As regras saíram da raiz e viraram módulos ES em
> `packages/domain`. Os `.js` da raiz que correspondem a elas são **gerados** —
> ver a tabela seguinte.

| Arquivo | Papel |
|---|---|
| `packages/domain/taxonomia.mjs` | Taxonomia do setor foco: 10 subsetores, 33 CNAEs de enquadramento, adjacências, barreiras, consolidadores, faixa por subsetor. |
| `packages/domain/scoring.mjs` | Motor determinístico de índice por papel de M&A. |
| `packages/domain/evidencias.mjs` | Ligação afirmação ↔ fonte ↔ trecho ↔ confiança. |
| `packages/domain/configuracao.mjs` | DSL declarativa de critérios e pesos. |
| `packages/domain/mercado.mjs` | Mapa de mercado e ranking de subsegmentos. |
| `packages/domain/matchmaking.mjs` | Listas de compradores e alvos. |
| `packages/domain/conexoes.mjs` | Módulo 4 — rede GHT4. |
| `packages/domain/armazenamento.mjs` | Porta de persistência local. A Fase 2 troca a implementação por API. |
| `packages/schemas/dado.mjs` + `.d.ts` | Contrato `Dado<T>`: valor, estado, fonte, unidade, período. |
| `fontes.js` | Catálogo de fontes e pipeline de qualificação. Ainda na raiz. |
| `crm.js` | Módulo 7. Ainda na raiz — Fase 7. |
| `analises.js` | Módulo 5. Ainda na raiz, ainda lê `window.MERCADO` — Fase 7. |
| `exportar-excel.js` | Escrita de `.xlsx` à mão. Ainda lê 5 globais — Fase 8. |
| `data.js` | Base de demonstração, empresas fictícias. |
| `index.html`, `fundamentos.html` | Demonstração legada, roda por duplo-clique. |
| `v1/src/**` | Interface React 19 + Vite + Tailwind. |
| `ferramentas/*.mjs` | Ingestão, geração, verificação. |
| `tests/**` | Suíte em `node --test`. |

### Gerado — não editar à mão

Os scripts globais da raiz saem de `packages/domain` por
`node ferramentas/gerar-globais.mjs`, que reescreve os imports como leitura
tardia de `window` e fecha cada arquivo numa IIFE. São commitados: quem só quer
ver a demonstração não roda nada. A CI confere que estão em dia
(`--conferir`).

| Arquivo | Gerado de |
|---|---|
| `setores.js` | `packages/domain/taxonomia.mjs` |
| `armazenamento.js` | `packages/domain/armazenamento.mjs` |
| `evidencias.js` | `packages/domain/evidencias.mjs` |
| `conexoes.js` | `packages/domain/conexoes.mjs` |
| `scoring.js` | `packages/domain/scoring.mjs` |
| `configuracao.js` | `packages/domain/configuracao.mjs` |
| `mercado.js` | `packages/domain/mercado.mjs` |
| `matchmaking.js` | `packages/domain/matchmaking.mjs` |

As bases saem dos importadores:

| Arquivo | Gerado por | Tamanho |
|---|---|---|
| `data-quimicos.js` | `node ferramentas/importar-cnpj.mjs` | 22 MB |
| `data-ibama.js` | `node ferramentas/cruzar-ibama.mjs` | 1,4 MB |
| `data-real.js` | `node ferramentas/importar-cvm.mjs` | 17 KB |
| `ibama-fora-do-escopo.csv` | `cruzar-ibama.mjs` | 312 KB |
| `v1/dist/**` | `npm run build --prefix v1` | — |

### Matéria-prima — fora do git por decisão

| Caminho | Conteúdo | Recriado por |
|---|---|---|
| `.cache/` | ~2 GB de CSV do RAPP/IBAMA | `cruzar-ibama.mjs --cache` |
| `ferramentas/.cache-cvm/` | ~22 MB de downloads da CVM | `importar-cvm.mjs` |

### Demonstração legada — preservar funcionando offline

`index.html` e `fundamentos.html` rodam por duplo-clique, sem servidor e sem
rede. O plano manda preservar isso, e essa exigência é a causa de duas restrições
de arquitetura que valem para todo o código da raiz: **sem `import`/`export`** e
**sem dependência de npm no motor**.

---

## 3. Verificação contra o diagnóstico do plano

### Confirmado

- **`mercado.js:121` contradiz `setores.js`.** O braço filtra
  `receita >= 30 && receita <= 250` embutido no código, enquanto `setores.js`
  define `faixaConsolidavel: { min: 40, max: 600 }` para distribuição e já expõe
  `naFaixaConsolidavel(empresa)`, que resolve a faixa **por subsetor**. O
  conflito é real e a correção é trocar o número fixo pela função que já existe.
- **`localStorage` como única persistência** em `analises.js`, `conexoes.js`,
  `configuracao.js` e `crm.js`. Não atende colaboração entre o time.
- **Regras entram por efeito colateral em `window.*`**, sem fronteira de módulo.
- **Não há backend, banco, autenticação, jobs, camada de LLM nem testes
  automatizados.** Confirmado: nenhum arquivo de teste no repositório.
- **`ESTADO-DA-ENTREGA.md` marca todos os módulos como "✅ Feito"** enquanto
  vários são scaffolds, e registra Transporte & Logística como setor do caso —
  decisão superada por Químicos/Distribuição.

### Corrigido — o plano erra aqui

- **§2.3 diz que a v1 em React "só conhece as bases `demo` e `cvm`".** Correto.
  Mas a mesma seção sugere que só o HTML da raiz carrega a base química: de fato
  `index.html` carrega `setores.js`, `fontes.js`, `data.js`, `data-real.js`,
  `data-quimicos.js`, `data-ibama.js`, `evidencias.js` e `scoring.js`. A lacuna é
  **exclusivamente** da v1, e é o que a Fase 6 precisa fechar.

- **§2.3 trata a duplicação da taxonomia como "risco de divergência" a eliminar.**
  A duplicação entre `setores.js` e `ferramentas/importar-cnpj.mjs` existe, mas é
  **deliberada e já guardada**: `ferramentas/verificar-taxonomia.mjs` foi escrito
  para exatamente isso e passa hoje — confere que os 32 CNAEs batem nos dois
  arquivos, que o importador não inventa código fora da taxonomia, que os rótulos
  coincidem e que faixas, barreiras e adjacências são coerentes.

  O motivo da duplicação está no cabeçalho do verificador: converter `setores.js`
  para ESM resolveria a duplicação e **quebraria o duplo-clique em `file://`**, que
  é o que faz a demonstração rodar numa sala de reunião sem rede. Como o plano
  também manda preservar a demo offline, "eliminar a duplicação" e "preservar
  `index.html`" são objetivos em conflito direto.

  **Decisão adotada na Fase 1:** não apagar nenhum dos dois lados. Criar a fonte
  única em `packages/domain` e fazer os dois consumidores **derivarem** dela —
  `setores.js` como artefato gerado para o navegador, o importador por import
  normal de Node. `verificar-taxonomia.mjs` deixa de ser um remendo e vira o teste
  de regressão que garante que a geração não divergiu.

- **§8.1 apresenta o funil como "baseline já existente".** Os cortes
  (38.583 → 6.592 → 1.670 → 204 → 35) são reproduzíveis, mas `data-quimicos.js`
  declara no próprio cabeçalho que `receita`, `crescimento`, `margemEbitda` e
  `funcionarios` saem **nulos para todos os 38.583 registros** — o cadastro do
  CNPJ não publica faturamento. Qualquer corte de porte sobre essa base sozinha
  devolve lista vazia, e está certo que devolva. Porte depende de fonte que ainda
  não chegou (Econodata/EMIS/Capital IQ). Isso não invalida o funil; invalida
  tratá-lo como ranking.

---

## 4. Baseline verde

Verificado nesta cópia, nesta data:

| Comando | Resultado |
|---|---|
| `npm run lint --prefix v1` | exit 0 |
| `npm run build --prefix v1` | exit 0, 458 módulos |
| `node ferramentas/verificar-taxonomia.mjs --sem-rede` | 10 subsetores, 32 CNAEs, sem falha |

Ambiente: Node v24.14.1, npm 11.11.0.

---

## 5. Decisões de arquitetura tomadas na Fase 0

1. **Raiz sem npm workspaces, por ora.** O `package.json` da raiz delega para a
   v1 com `--prefix` em vez de declarar `workspaces`. Declarar workspaces faria o
   próximo `npm install` reposicionar `v1/node_modules`, e o critério de aceite da
   Fase 0 é justamente que build e lint **continuem** verdes. Migrar para
   workspaces é seguro depois que `server/` existir e houver CI verificando.

2. **`node --test` como runner, sem dependência nova.** Node 24 traz o runner
   embutido. Isso respeita a regra do projeto de não adicionar npm ao motor e
   mantém os testes rodando sem instalar nada na raiz.

3. **`test:e2e` falha explicitamente em vez de fingir sucesso.** Não há infra de
   e2e; o script existe, sai com código 1 e diz onde ler. Ele **não** entra no
   script `ci` até ser implementado, para não deixar a CI vermelha por um
   placeholder.

---

## 6. Lacunas conhecidas nesta data

- Sem backend, banco, autenticação, RBAC ou escopo por mandato.
- Sem camada de LLM, chat, tool calling ou runtime de agente.
- Sem jobs, agendamento, versionamento de snapshot ou reprocessamento idempotente.
- Sem testes automatizados de domínio, integração, UI ou comportamento do agente.
- Sem `test:e2e`.
- Porte (receita, EBITDA, funcionários) não resolvido para a base química.
- Templates, rede, análises e CRM ainda presos ao `localStorage` de um navegador.
  A porta `packages/domain/armazenamento.mjs` já isola o ponto de troca; a Fase 2
  substitui a implementação por API.
- `analises.js` e `exportar-excel.js` ainda leem globais (ver o registro da Fase 1
  no plano). Serão reescritos nas Fases 7 e 8.
- A v1 em React não enxerga a base química.
