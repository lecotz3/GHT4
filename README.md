# GHT4 · Agente de Prospecção M&A — Protótipo de Demonstração

Protótipo **conceitual e visual** de um agente de IA para prospecção em Fusões e Aquisições,
criado para apoiar a conversa de levantamento de requisitos com os sócios da **GHT4**.

> ⚠️ **Isto é uma demonstração.** Todas as empresas são **fictícias**, todos os números são
> **simulados** e os scores são **meramente ilustrativos**. O sistema **não prevê transações**,
> não faz valuation, não substitui due diligence e **não substitui a análise humana**.
> O objetivo é mostrar *como* um agente poderia funcionar, para facilitar as decisões de negócio.

---

## O que a demonstração faz

- **Seleção de setor** (Saúde, Tecnologia, Varejo, Energia — ilustrativos)
- **Filtros ilustrativos**: localização (UF), receita mínima, crescimento, margem EBITDA,
  nº de funcionários, perfil societário, classificação, **estado da triagem** e **lastro da evidência**.
- **Lista de empresas fictícias**, claramente marcadas como dados de demonstração.
- **Classificação em 3 grupos**: possíveis alvos de aquisição, potenciais compradores e
  possíveis candidatas a venda.
- **Score de atratividade ilustrativo** (0–100) por empresa.
- **Explicação dos sinais** que influenciaram o score (crescimento relevante, mercado
  fragmentado, margem comprimida, prejuízo operacional, rodada de investimento,
  mudança de controle, expansão geográfica,
  sucessão familiar, escala, etc.).
- **Painel de evidência**: cada sinal aparece com a fonte que o sustenta — veículo, data,
  confiança e o trecho citado — no padrão “afirmação de um lado, documento do outro”.
- **Lastro do índice**: quanto do score se apoia em documento, em indicador financeiro e
  quanto está **inferido sem fonte**. O que não tem lastro é declarado, não escondido.
- **Triagem humana com trilha de auditoria**: nenhum registro muda de estado sem um
  responsável nomeado; nome, data, estado anterior e justificativa ficam registrados.
- **Origem e data dos dados**, com nível de confiança e sinalização de dado simulado,
  incompleto ou hipótese.
- **Página de detalhes** de cada empresa (painel/modal), com: o que a empresa faz, situação
  relevante para M&A, um **contato fictício** (nome, cargo, e-mail e telefone — apenas demonstração),
  os indicadores, o desdobramento do score por papel, a evidência de cada sinal e a triagem.
- **Link direto para um dossiê**: `index.html#empresa=tec07` abre o registro específico.
- **Exportação em CSV** da lista filtrada, carregando junto as fontes citadas, o lastro, os
  sinais sem documentação e o histórico de triagem (com cabeçalho de aviso, compatível com
  Excel PT-BR).
- **Página de fundamentos** (`fundamentos.html`): cada decisão de produto ancorada num número
  da pesquisa Datasite/FT — material de apoio para a reunião com os sócios.

---

## Como executar

Não há instalação, dependências ou build. É um site estático que roda offline.

1. Abra a pasta do projeto.
2. Dê **duplo-clique em `index.html`** (ou arraste-o para o navegador — Chrome, Edge, Firefox).
3. Pronto. Use os filtros à esquerda, clique numa empresa para ver os detalhes e use
   **"Exportar CSV"** para baixar a lista.

> Opcional (se preferir servir por HTTP, por exemplo para apresentar em rede):
> ```
> # dentro da pasta do projeto
> python -m http.server 8000
> # depois acesse http://localhost:8000
> ```

---

## Duas interfaces

| Pasta | O que é | Como roda |
|---|---|---|
| raiz | **Protótipo** — HTML/CSS/JS puro, zero dependência | duplo-clique no `index.html`, funciona offline |
| `v1/` | **Aplicação React + Tailwind**, para receber componentes do 21st.dev | `cd v1 && npm install && npm run dev` |

As duas **compartilham o mesmo motor**. A v1 importa `scoring.js`, `evidencias.js`,
`data.js` e `data-real.js` da raiz — os mesmos arquivos que o protótipo carrega por
`<script>`. Mexeu na regra de negócio, mexe num lugar só.

Isso funciona porque esses arquivos não usam sintaxe de módulo: o Vite executa o corpo
deles e as atribuições em `window.*` acontecem normalmente. Convertê-los para ESM
**quebraria o protótipo** — navegador bloqueia módulos ES em `file://`, e é justamente
o duplo-clique que faz ele funcionar numa sala de reunião sem rede.

A paleta validada está no `@theme` de `v1/src/index.css`, como tokens do Tailwind
(`bg-alvo`, `text-tinta`). Assim qualquer componente de terceiro colado no projeto veste
a identidade da GHT4 em vez do visual genérico de SaaS.

---

## Duas bases, lado a lado

O seletor no alto da coluna esquerda troca entre:

| Base | O que é | O que ela prova |
|---|---|---|
| **Demonstração** | 32 empresas **fictícias** | O modelo completo: tem eventos societários (rodada, mudança de controle, expansão), que é o que de fato antecipa uma transação. |
| **Real · CVM** | 537 **companhias abertas brasileiras reais**, com demonstrações auditadas | O que dá para fazer hoje com dado público — e, sobretudo, **o que não dá**. |

A base real vem do Portal de Dados Abertos da CVM. Para gerá-la ou atualizá-la:

```
node ferramentas/importar-cvm.mjs
```

O script baixa, cruza e converte os dados públicos, e escreve `data-real.js`. Não tem
dependência de npm — usa só a biblioteca padrão do Node. Se o arquivo não existir, o
seletor de base some sozinho e o razão funciona normalmente com a base fictícia.

**A descoberta que a base real entrega para a reunião:** dado público brasileiro publica
**números**, não **eventos**. Receita, margem, crescimento e empregados vêm auditados e com
citação da conta contábil exata. Já rodada de investimento, mudança de controle, expansão
geográfica e fragmentação setorial **não existem em nenhuma fonte aberta** — o dossiê lista
esses sinais em "não avaliado · sem fonte disponível", com o motivo de cada um. É a lista de
compras de dados da GHT4, escrita pelo próprio sistema.

Duas ressalvas que os sócios precisam ouvir: só **56 das 537** empresas estão na faixa de
R$ 30–250 mi que o modelo trata como alvo consolidável, e o
middle market de capital fechado — o cliente típico de uma boutique — **não aparece aqui**,
porque não tem obrigação de publicar demonstração.

> **De onde vieram 537.** A versão anterior lia só a DFP **consolidada** e ficava em 386.
> Companhia sem controladas não publica consolidada, só **individual** — eram 217 companhias
> ativas descartadas inteiras, e elas pendem para o lado pequeno: a faixa consolidável subiu
> de 39 para 56 registros. Cada empresa carrega em `cvm.demonstrativo` de qual das duas veio,
> e o dossiê exibe isso: individual e consolidada não descrevem o mesmo perímetro econômico.

---

## Critérios de triagem de boutique

Além dos sinais de mercado, o agente aplica o **screening financeiro** que uma casa de M&A faz
antes de abrir um alvo. Cada um sai de conta padronizada da própria DFP, então o dossiê cita a
linha contábil exata — mesmo padrão de "afirmação de um lado, documento do outro".

| Critério | Conta CVM | Limiar em `scoring.js` |
|---|---|---|
| Dívida líquida / EBITDA | `2.01.04` + `2.02.01` − `1.01.01` − `1.01.02` | limpo ≤ 1,5× · alerta ≥ 3× |
| Liquidez corrente | `1.01` ÷ `2.01` | aperto < 1,0 |
| Conversão de caixa (FCO/EBITDA) | `6.01` | boa ≥ 70% |
| Contingências / patrimônio | `2.01.01`+`2.01.03`+`2.01.06`+`2.02.04` ÷ `2.03` | relevante ≥ 30% |
| Intensidade de investimento | `6.02` ÷ receita | alta ≥ 15% |
| Tendência de margem | `3.05` e `7.04.01`, dois exercícios | move ≥ 2 p.p. |
| Patrimônio líquido negativo | `2.03` | negativo |

**Ressalvas de triagem.** Os critérios de risco não entram no índice — aparecem **ao lado**
dele, como o lastro. Um ativo pode ser excelente alvo *e* ter alavancagem de 4×; as duas coisas
são verdade ao mesmo tempo. O índice responde "vale olhar?", a ressalva responde "olhando o
quê?", e quem pondera é a pessoa. Ver `RESSALVAS` em `scoring.js`.

**Filtro "Exigir".** Os chips de exigência têm semântica inversa aos demais filtros: começam
desligados, e cada um ligado **impõe** o critério. Empresa que não publicou o dado é reprovada —
dar por atendido o que não foi verificado é exatamente como uma triagem gera falso positivo.
Na base real o funil vai de 537 para 25 registros com três exigências ligadas.

### O que nenhuma fonte pública responde

Quatro critérios centrais de qualquer boutique **não existem em dado aberto**, nem para
companhia de capital aberto. O agente os declara com o motivo e a via de obtenção, em vez de
omiti-los — critério silenciado parece critério atendido. Na prática, é a pauta da primeira
reunião com o alvo (ver `CRITERIOS_SEM_FONTE` em `evidencias.js`):

- **Concentração de clientes** — a DFP não abre receita por cliente.
- **Receita recorrente e churn** — a conta `3.01` não separa contrato de venda avulsa.
- **Dependência do fundador** — nenhum campo público mede isso.
- **Passivo trabalhista e fiscal não provisionado** — o balanço só mostra o já reconhecido, e é
  justamente o não reconhecido que a diligência procura.

---

## Estrutura dos arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | A aplicação: interface, filtros, listas, dossiê, triagem e exportação CSV. |
| `data-real.js` | **Base real** gerada pelo importador. Não editar à mão. |
| `ferramentas/importar-cvm.mjs` | Baixa e converte os dados abertos da CVM. |
| `fundamentos.html` | Peça de apresentação: por que o agente é assim, com os dados da pesquisa. |
| `data.js` | Base de **empresas fictícias** com metadados de origem/data/confiança. **Trocar por dados validados no futuro.** |
| `evidencias.js` | **Camada de evidência** — fontes fictícias por empresa e por sinal, e a regra que decide o que sustenta cada afirmação. **Aqui entram as fontes reais no futuro.** |
| `conexoes.js` | **Rede GHT4** (Mód. 4) — cruzamento de currículos e contatos com as companhias. |
| `crm.js` | **Pipeline** (Mód. 7) — funil por colaborador, trilha append-only, retrato de entrada. |
| `analises.js` | **Valuation, report e news run** (Mód. 5) — ingestão de CSV, múltiplos, Porter/SWOT/PESTLE com lacunas declaradas. |
| `scoring.js` | **Motor de scoring** — limiares, catálogo de sinais, pesos por papel e cálculo do lastro. **Este é o ponto de edição após as reuniões.** |
| `configuracao.js` | **Critérios e pesos em tempo de uso** (Mód. 3.2 e 3.3) — catálogo de campos, operadores, critérios ad hoc e templates. |
| `mercado.js` | **Mapa e ranking de subsegmentos** (Mód. 1 e 2) — HHI, faixa consolidável e os quatro critérios declarados sem fonte. |
| `matchmaking.js` | **Listas de compradores e alvos** (Mód. 6) — sell-side e buy-side com justificativa por critério. |
| `exportar-excel.js` | **Saída em .xlsx** (Mód. 9) — ZIP e XML escritos à mão, sem dependência de npm. |
| `PESQUISA-DATASITE-FT.md` | Resumo estruturado da pesquisa Datasite/FT que embasa o desenho, com todos os números. |
| `PERGUNTAS-DESCOBERTA.md` | Roteiro de perguntas para os sócios (usuários, setores, fontes, critérios, fluxo, confidencialidade, métricas). |
| `README.md` | Este arquivo. |

Continua sem instalação, sem dependências e sem build.

---

## Os módulos do documento de requisitos

O documento *"Requisitos — Ferramenta de IA GHT4"* descreve sete módulos. O que existe hoje:

| Módulo | O que pede | Estado |
|---|---|---|
| 1 · Mapeamento de mercado | setor → subsegmentos → empresas | **Feito** — `mercado.js`, 13 setores e 46 subsegmentos |
| 2 · Ranking de subsegmentos | atratividade para M&A, pesos configuráveis | **Feito** — 6 critérios calculáveis, 4 declarados sem fonte |
| 3 · Ranking de empresas | critérios fixos + ad hoc + templates | **Feito** — `scoring.js` + `configuracao.js` |
| 4 · Conexões da rede GHT4 | quem da casa conhece quem do alvo | **Fase 2** — decidido usar só material interno |
| 5.1 · Valuation (Capital IQ) | trading comps e transações precedentes | **Bloqueado** — acesso é login web; caminho é importar a exportação da plataforma |
| 5.2 e 5.3 · Report e news run | TAM/SAM/SOM, Porter, SWOT, PESTLE, notícias | **Fase 2** — exigem camada de linguagem natural |
| 6 · Listas de compradores/alvos | matchmaking sobre a base mapeada | **Feito** — `matchmaking.js`, sell-side e buy-side |
| 7 · CRM / pipeline | funil por colaborador | **Fase 2** — a triagem com trilha é o embrião |
| 9 · Formato dos outputs | Excel com subsegmento em coluna + aba de valuation | **Feito** — `exportar-excel.js`, até 6 abas |
| 9 · Report em PDF | análise de mercado exportada em PDF | **Feito** — folha de impressão em `v1/src/index.css` |

### Como a configuração em tempo de uso funciona

`scorePapel(empresa, papel, config)` aceita uma configuração opcional. **Sem ela, o resultado é
idêntico ao de antes** — os pesos fixos de `CONFIG_PAPEIS`. Com ela:

- `config.pesos[papel]` substitui o peso de cada sinal do catálogo;
- `config.criterios` acrescenta critérios criados na hora, sobre qualquer campo de `CAMPOS`.

Duas regras que não são detalhe de implementação:

1. **O denominador cresce junto com os critérios.** Criar um critério novo não infla o índice de
   toda a base — ele continua significando "que fração do que eu pedi esta empresa atende".
2. **Critério ad hoc nunca é documental.** Ele entra sem evidência anexada, então o cálculo de
   lastro o classifica como indicador estruturado. Um critério inventado na hora não consegue
   elevar o lastro documental do índice.

### O que o Módulo 2 não consegue calcular

Dos quatro critérios que o documento pede para o ranking de subsegmentos, **nenhum existe em dado
público brasileiro**: volume de transações, múltiplos praticados, interesse de compradores e
tendências setoriais. Eles aparecem declarados em `CRITERIOS_SEM_FONTE_MERCADO`, com motivo e via de
obtenção — mesmo padrão de `CRITERIOS_SEM_FONTE` em `evidencias.js`. No lugar do terceiro, a
ferramenta usa "consolidadores presentes", que é proxy interno e está marcado como tal.

---

## Como ajustar depois das reuniões (sem quebrar nada)

O protótipo foi feito para ser fácil de alterar:

- **Mudar critérios/pesos do score** → edite `scoring.js`:
  - `LIMIARES` (ex.: a partir de quanto o crescimento "conta", o que é margem comprimida/alta,
    onde fica o piso do prejuízo operacional, o que é "escala").
  - `CONFIG_PAPEIS` → o objeto `pesos` de cada papel (`alvo`, `comprador`, `vendedora`).
  - Para criar um **novo sinal**, adicione uma entrada em `SINAIS` (com sua `natureza`) e
    referencie-a nos `pesos`. Se a natureza for `documental`, acrescente também a regra
    correspondente em `evidenciaDe()` no `evidencias.js`.
- **Adicionar/editar empresas ou setores** → edite a lista em `data.js`
  (mantendo os campos de `origem`, `dataAtualizacao` e `confianca` para preservar a transparência).
- **Anexar ou trocar fontes** → edite `evidencias.js`. Sinal documental sem fonte vira lacuna
  explícita na interface — é o comportamento desejado, não um bug.
- **Ajustar textos, cores e rótulos** → estão no topo do `<style>` e nos rótulos de `CONFIG_PAPEIS`.
  Atenção às cores dos papéis: existem duas famílias, `--alvo` (marca: barras e selos) e
  `--alvo-ink` (texto). As cores de marca foram validadas para contraste e para distinção por
  quem tem daltonismo — se trocá-las, revalide.

---

## Transparência (decisões de design importantes)

Estas escolhas não são estéticas: cada uma responde a um achado da pesquisa Datasite/FT
(“The New Deal Team”, 2026, 1.000 dealmakers). O detalhamento está em `fundamentos.html`
e os números em `PESQUISA-DATASITE-FT.md`.

- Faixa fixa no topo e rodapés reforçam que os dados são fictícios e os scores ilustrativos.
- Cada empresa exibe **origem**, **data de referência** e **nível de confiança**.
- **Cada sinal abre a fonte que o sustenta** — padrão que 43% dos dealmakers citam como passo
  para confiar em IA, e que Freshfields e Blueflame implementam da mesma forma.
- **O sistema declara o que não sabe.** Sinal sem fonte vira lacuna vermelha e alerta.
  Três lacunas são propositais na base de demonstração (EduPlay, MercaBom, ComerLuz) —
  existem para mostrar o comportamento diante da ausência de evidência.
- **O lastro fica ao lado do índice, nunca embutido nele.** Quem interpreta é a pessoa.
- **"Margem comprimida" tem piso.** A tese de margem baixa num alvo é upside de eficiência:
  uma empresa de 4% pode chegar a 12% sob gestão nova. Essa tese não sobrevive a EBITDA
  negativo. Abaixo de zero o sinal vira **prejuízo operacional**, que pontua para *candidata
  a venda*, não para *alvo*. Sem esse piso o motor colocava a OSX Brasil (recuperação
  judicial, 8 empregados) como alvo de aquisição nº 1 da base real, exibindo "possível upside
  de eficiência" ao lado de uma margem de −293,9%.
- **Nenhuma decisão sem responsável nomeado**, e a trilha não pode ser apagada — 58% aplicam
  revisão humana, 45% exigem accountability explícita, e 0% dizem não tomar medida alguma.
- O modal separa claramente *sinais*, *score por papel*, *evidência*, *triagem* e
  *transparência dos dados*, e repete o aviso de que não é recomendação de transação.
- O CSV exportado inclui cabeçalho de aviso e **carrega a rastreabilidade junto** — fontes,
  lastro, sinais sem documentação e histórico de triagem.

### O que o protótipo deliberadamente não faz

Não recomenda transação, não faz valuation, não sugere preço nem estrutura, não redige
aproximação ao alvo. A aceitação de liderança da IA cai de 46% (montar listas) para 22%
(decidir assinar) — o produto para onde o mercado para.

---

## Decisões que ainda precisam ser validadas com os sócios

Tudo abaixo é **hipótese do protótipo**, não decisão de negócio:

1. **Setores e subsetores** — os 4 atuais são apenas exemplos.
2. **Filtros e faixas** — quais fazem sentido para a originação real da GHT4.
3. **Definição dos 3 papéis** — se essa é a taxonomia certa (ou se há outras categorias).
4. **Sinais e pesos do score** — quais sinais antecipam transações e quanto cada um vale.
   - **A GHT4 faz distressed?** É a pergunta que decide o item seguinte. Hoje o papel *alvo*
     ainda pontua `situação especial` (+12) e `crescimento` (+22), então empresas em
     recuperação judicial continuam aparecendo entre os primeiros alvos da base real — a OSX
     e a Bardella ficam em 57, empatadas com a TS Agro, que é saudável. Isso está **certo**
     se a casa faz distressed e **errado** se não faz. O protótipo não decide isso sozinho:
     se a resposta for "não fazemos", tire `situacao_especial` dos pesos de `alvo` e
     considere exigir EBITDA positivo para o sinal de crescimento contar como consolidação.
5. **Escala do score** — número (0–100), faixas (A/B/C) ou apenas ranqueamento.
6. **Fontes de dados** — quais alimentarão o sistema e com que frequência/confiança.
7. **Significado de "confiança" e "origem"** — padronizar os rótulos com o time.
8. **Fluxo pós-priorização** — CRM, one-pager, tarefas, alertas, colaboração.
9. **Confidencialidade e LGPD** — quem vê o quê, onde os dados residem, barreiras de informação.
10. **Métricas de sucesso** — como medir se o agente gera valor.

Ver o roteiro completo em **`PERGUNTAS-DESCOBERTA.md`**.

---

*GHT4 — Boutique de Fusões e Aquisições. Protótipo de demonstração, sem integração com fontes reais.*
