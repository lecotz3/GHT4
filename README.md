# GHT4 · Agente de M&A

## Agente local com histórico salvo

Para iniciar a versão operacional local, use `npm run iniciar` ou abra **Iniciar Agente GHT4.cmd** no Windows. Acesse **http://127.0.0.1:5173** e configure seu primeiro acesso pela tela. Dependências e instruções: [guia do agente local](docs/runbooks/agente-local.md).

Já estão disponíveis busca no cadastro químico real, preparação de reuniões, registro de próximos passos e retomada de trabalhos com autenticação e banco persistente. O administrador também pode criar espaços, convidar membros e gerenciar acessos pela tela **Equipe**. O ambiente atual roda nesta máquina; o acesso remoto depende de implantação compartilhada. As tarefas são assistidas por roteiros e consultas; o provedor de IA generativa ainda será escolhido. Consulte [o checkpoint de implementação](docs/RETOMADA-AGENTE.md) para continuar o desenvolvimento.

O fluxo agora inclui **Revisar empresa → Priorizar → Criar oportunidade**. Em **Oportunidades**, acompanhe responsáveis, prazos, atividades e etapas, com histórico e acesso por espaço. Consulte o [plano de execução do agente](docs/PLANO-EXECUCAO-AGENTE.md) para as próximas entregas.

Para compilar a interface na Vercel, consulte [configuração do build](docs/runbooks/build-vercel.md). O `vercel.json` instala as dependências de `v1` e publica `v1/dist`. API, login e banco exigem a implantação do servidor descrita no guia; o build da interface sozinho não disponibiliza o agente completo.

## Demonstração anterior

As seções abaixo descrevem o protótipo anterior, preservado e acessível por **Explorar demonstração**. Para o estado atual do agente e seus limites, use os dois guias acima.

Protótipo **conceitual e visual** de um agente de IA para prospecção em Fusões e Aquisições,
criado para apoiar a conversa de levantamento de requisitos com os sócios da **GHT4**.

> ⚠️ **Isto é uma demonstração.** Todas as empresas são **fictícias**, todos os números são
> **simulados** e os scores são **meramente ilustrativos**. O sistema **não prevê transações**,
> não faz valuation, não substitui due diligence e **não substitui a análise humana**.
> O objetivo é mostrar *como* um agente poderia funcionar, para facilitar as decisões de negócio.

---

## Setor foco: Químicos

Decisão de diretoria: o agente ataca **um objetivo por vez**, e o primeiro é
**setor e subsetor**. O grande setor escolhido é **Químicos**, com prioridade no
subsetor de **Distribuição**. Saúde, Tecnologia, Varejo e Energia **foram
removidos** — não estão desligados por flag, saíram da base.

O recorte inteiro vive em **`setores.js`**: dez subsetores, cada um com os CNAEs
que o delimitam (conferidos contra a API oficial do IBGE), a tese de M&A, a
**faixa consolidável específica do subsetor** e a barreira regulatória que
incide sobre ele. Dois subsetores estão declarados **sem alvo de boutique**, com
o motivo escrito — petroquímica básica não tem middle market, e fingir que tem
produziria lista bonita e reunião vazia.

As adjacências (farmoquímicos, cosmético acabado, combustíveis, plástico
transformado) ficam listadas como fronteira, com o motivo da exclusão e a
condição para ligá-las. Decisão de escopo à vista, não filtro escondido.

---

## O que a demonstração faz

- **Seleção de subsetor químico** (10 subsetores, ver `setores.js`)
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
- **Link direto para um dossiê**: `index.html#empresa=dis07` abre o registro específico.
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

## Três bases, lado a lado

O seletor no alto da coluna esquerda troca entre:

| Base | O que é | O que ela prova |
|---|---|---|
| **Demonstração** | 32 empresas **fictícias** do setor químico | O modelo completo: tem eventos societários (rodada, mudança de controle, expansão), que é o que de fato antecipa uma transação. |
| **Real · CVM** | **6** companhias abertas do setor químico, com demonstrações auditadas | O padrão de qualidade contábil — e o tamanho do buraco: o setor inteiro tem seis listadas. |
| **Real · CNPJ** | O **universo** do setor químico brasileiro, quase todo de capital fechado | Quem realmente existe no setor. É a base primária do agente. |

### Por que a base da CVM deixou de ser a principal

Rode `node ferramentas/importar-cvm.mjs` e o terminal diz o problema na cara:

```
RECORTE QUÍMICOS: 602 companhias fora do escopo, 6 dentro.
na faixa consolidável R$ 30–250 mi: 0
```

**Seis companhias, e nenhuma na faixa de alvo de boutique.** Não é base pequena: é
ausência de base. O middle market químico brasileiro é de capital fechado e não tem
obrigação de publicar demonstração — a CVM não o enxerga, e nunca vai enxergar.

A base da CVM continua no projeto e continua útil, em dois papéis menores: padrão de
qualidade contra o qual as estimativas de capital fechado são comparadas, e conjunto
de comparáveis listados locais.

### A base primária: dados abertos do CNPJ

```
node ferramentas/importar-cnpj.mjs --listar-meses   # o que a RFB publicou
node ferramentas/importar-cnpj.mjs                  # gera data-quimicos.js
```

O importador lê o cadastro inteiro das pessoas jurídicas do país, filtra pelos CNAEs
de `setores.js` e devolve o universo do setor. Sem dependência de npm, e sem gravar
os 5 GB em disco: o ZIP é inflado direto do fluxo HTTP.

### A segunda testemunha: o RAPP do IBAMA

```
node ferramentas/cruzar-ibama.mjs --cache     # baixa ~3 GB e cruza
node ferramentas/cruzar-ibama.mjs --sem-rede  # recruza pelo cache, sem rede
```

Dois terços do universo do CNPJ entraram por **CNAE secundário**, que é declaração no
cadastro e não prova de operação. O RAPP resolve por fora: quem exerce atividade
potencialmente poluidora declara ao IBAMA a **categoria de atividade** que exerce de
fato, sob obrigação legal e com fiscalização atrás — sem passar pelo CNAE.

Cinco formulários, 7,6 milhões de linhas. Resultado medido em 20/08/2026:

| | |
|---|---|
| com pegada viva (RAPP de 2022+) | **5.679** de 38.583 — 14,7% |
| CNAE **principal** confirmado | 2.843 de 12.933 — **22,0%** |
| só CNAE **secundário** confirmado | 2.836 de 25.650 — **11,1%** |
| declaram química ao IBAMA e estão **fora** do nosso universo | **1.225** |
| CNAE e IBAMA apontam subsetores **diferentes** | 485 |

O CNAE principal confirma **o dobro** do secundário — o filtro por CNAE principal é
melhor, e agora isso está medido em vez de suposto. Mas a separação não é limpa: 2.836
empresas de CNAE secundário têm pegada química viva e sumiriam num corte cego.

**Ausência de pegada não é desmentido.** A obrigação de RAPP depende de categoria e
porte; distribuidora pequena de escritório pode legitimamente não ter. O cruzamento
rebaixa confiança e declara o motivo — nunca descarta.

**O que essa base tem e nenhuma outra tem:** o universo de capital fechado; o quadro
societário com **faixa etária** de cada sócio; e as filiais por UF com data de
abertura.

**O que ela não tem, e sai nulo de propósito:** faturamento, EBITDA, margem e
funcionários. O cadastro não publica isso, e capital social **não é** proxy de
receita. Preencher produziria um filtro que funciona na tela e mente no resultado.
O porte entra na etapa seguinte do pipeline — ver `fontes.js`.

**A única afirmação de porte que o dado público sustenta:** ser optante do Simples
implica faturamento ≤ R$ 4,8 mi/ano, por definição legal. Não é estimativa, é
consequência da opção tributária. Serve para cortar, nunca para estimar.

### Quem controla: o perfil societário sai da natureza jurídica

O campo `perfil` responde "quem manda nesta empresa" a partir da **natureza
jurídica** declarada no cadastro, cruzada com o quadro de sócios. Os códigos vêm
da tabela oficial da RFB (`Naturezas.zip`), versionada em
`ferramentas/naturezas-rfb.csv` — o mapeamento fica conferível linha a linha, sem
rede e sem memória de ninguém.

| Perfil | De onde sai | No universo químico |
|---|---|---|
| Founder-led | Empresário Individual, EIRELI, ou sociedade com **um** sócio | 18.223 |
| Familiar | dois ou mais sócios, todos pessoa física e brasileiros | 13.220 |
| Holding de participações | há sócio **pessoa jurídica**, consórcio ou grupo | 3.949 |
| Multinacional | sócio no exterior, ou empresa domiciliada fora | 1.621 |
| Cooperativa | naturezas 2143 e 2330 | 1.130 |
| Quadro não informado | sociedade cujo quadro de sócios não veio no arquivo | 187 |
| Entidade sem fins lucrativos | associação, fundação, entidade sindical, org. religiosa | 184 |
| Capital aberto | **S.A. Aberta (2046)** — só ela | 56 |
| Estatal | Empresa Pública, Economia Mista, órgão público | 13 |

**As cooperativas merecem leitura à parte.** São 1.130, das quais 1.030 em
fertilizantes, e **não são alvo de aquisição**: não têm quotas para vender. Ficam
na base porque são compradoras e concorrentes reais no subsetor — mas entrar numa
lista de alvos seria erro de originação, não filtro apertado demais.

> **Correção de 21/08/2026.** Até esta data o mapeamento tratava LTDA (2062) e
> S.A. Fechada (2054) como "Capital aberto" — 33.268 dos 38.583 registros, o
> universo de capital fechado carimbado como aberto — e a S.A. Aberta (2046), a
> única de fato aberta, caía na regra de estatal. O efeito não era cosmético:
> `sucessao_familiar` em `scoring.js` exige `perfil === 'Familiar'`, então o sinal
> central da tese ficava **desligado em silêncio** na base primária. Ele acende
> agora em 13.220 empresas, contra 3.867 antes — e nenhuma das anteriores era
> LTDA, que é a forma de 86% do universo.

### O sinal que só esta base sustenta: sucessão sem sucessor

Empresa com mais de 20 anos, todos os sócios pessoa física acima de 60, nenhum
abaixo de 50 no quadro. Não prova que há venda a caminho; prova que a estrutura de
controle **vai ter de mudar** — e é exatamente isso que abre a conversa de
originação no middle market industrial brasileiro.

### E os eventos societários, que o projeto declarava impossíveis

A versão anterior deste README afirmava que dado público brasileiro publica
**números**, não **eventos** — e que rodada, mudança de controle e expansão
geográfica não existiriam em fonte aberta. **Isso vale para a CVM e não vale para o
CNPJ.** O cadastro é republicado inteiro todo mês, e a Receita mantém os meses
anteriores: havia **40 meses publicados**, de 2023-05 em diante.

Comparar dois meses transforma um cadastro estático num registro de acontecimentos:

```
node ferramentas/importar-cnpj.mjs --mes=2026-02 --arquivar
node ferramentas/importar-cnpj.mjs --mes=2026-08 --arquivar
node ferramentas/eventos-cnpj.mjs
```

| Diferença observada | Sinal |
|---|---|
| Troca de sócios | mudança de controle |
| Entrada de sócio no exterior | comprador estratégico chegou |
| Salto de capital social | aporte |
| Filial em UF nova | expansão geográfica |

Cada evento carrega o campo `ambiguidade` preenchido: o registro público afirma o
**fato**, nunca a **intenção** nem o **valor**. Saída de sócio pode ser venda,
herança ou briga de família. O sistema nomeia isso em vez de esconder.

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
Na base do CNPJ o efeito é radical: sem faturamento publicado, qualquer exigência financeira reprova o universo inteiro — e está certo que reprove, porque o dado não existe naquela fonte. É o próprio filtro dizendo em que etapa do pipeline a casa está.

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
| `setores.js` | **Taxonomia do setor foco** — os 10 subsetores químicos, com CNAE, tese de M&A, faixa consolidável própria, barreira regulatória e adjacências declaradas. **Este é o recorte do produto.** |
| `fontes.js` | **Catálogo das bases de dados do setor** — o que cada uma entrega, o que não entrega, custo, via de acesso, e a ordem do pipeline (filtrar antes de enriquecer). |
| `data-quimicos.js` | **Base primária** (CNPJ) gerada pelo importador. Não editar à mão. |
| `data-eventos.js` | **Eventos societários** por diferença entre dois meses do CNPJ. Não editar à mão. |
| `data-real.js` | **Base CVM** gerada pelo importador — 6 companhias. Não editar à mão. |
| `ferramentas/importar-cnpj.mjs` | Lê os dados abertos do CNPJ e monta o universo do setor químico. |
| `ferramentas/naturezas-rfb.csv` | **Tabela oficial de naturezas jurídicas da RFB**, versionada. É a fonte do mapeamento de perfil societário no importador — código de natureza não se adivinha. |
| `ferramentas/eventos-cnpj.mjs` | Compara dois meses do cadastro e extrai os eventos societários. |
| `ferramentas/medir-render.mjs` | Mede quantas fichas e quantos nós de DOM a tela entrega ao navegador. Rode depois de mexer no render. |
| `ferramentas/cruzar-ibama.mjs` | Cruza o universo do CNPJ com o RAPP do IBAMA. Confirma quem opera de fato, e descobre quem o filtro de CNAE perde. |
| `data-ibama.js` | **Pegada ambiental** por raiz de CNPJ, gerada pelo cruzamento. Não editar à mão. |
| `ibama-fora-do-escopo.csv` | Empresas que declaram indústria química ao IBAMA e não estão no universo — entrada da próxima ingestão. |
| `ferramentas/importar-cvm.mjs` | Baixa e converte os dados abertos da CVM, restrito ao escopo químico. |
| `ferramentas/validar-paleta.mjs` | **Validador da paleta** — contraste WCAG, ΔE e simulação de daltonismo. Rode antes de commitar qualquer troca de cor. |
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
| 1 · Mapeamento de mercado | setor → subsegmentos → empresas | **Feito** — `setores.js` (taxonomia) + `mercado.js` (cálculo): 1 setor foco e 10 subsetores |
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
  Atenção às cores dos papéis: existem três famílias, `--alvo` (marca: barras e selos),
  `--alvo-ink` (texto) e `--alvo-fio` (o limite, que é quem carrega o contraste).
  Se trocar qualquer uma, rode `node ferramentas/validar-paleta.mjs` antes de commitar —
  e lembre que a paleta vive em **três** arquivos: `index.html`, `fundamentos.html` e
  `v1/src/index.css`.

---

## A identidade visual

As cores e o logotipo vêm do kit da marca em **ght4.com** — não são invenção do protótipo:

| | |
|---|---|
| Acento | `#FF6E00` — o único acento da marca |
| Primária | `#000000` |
| Texto | `#7A7A7A` · superfície `#ECEFF1` · fio `#D2D2D2` |
| Tipografia | Mena Grotesk (licenciada) |
| Logotipo | wordmark "ght4" em caixa baixa, com uma **diagonal a 45°** atravessando o "4" |

Três decisões que valem explicar numa reunião:

1. **A diagonal virou linguagem, não enfeite.** O mesmo corte a 45° que atravessa o "4" marca,
   na barra de lastro, o trecho **inferido, sem fonte** — em hachura, não em cor. A ausência de
   evidência é a informação mais grave da tela e não pode depender de o leitor enxergar cor:
   hachura sobrevive ao daltonismo, ao projetor mal calibrado e à impressão em preto e branco.
2. **O laranja tem UM significado.** Sendo o único acento da marca, ele marca o papel *alvo* e
   os estados de "onde você está / onde mexer". O resto da tela é preto e branco. Onde a
   consequência é diferente — os chips de **exigir**, que reprovam quem não publicou o dado —
   a cor é o laranja justamente para não se confundir com o preto do "selecionado comum".
3. **Uma ressalva de acessibilidade ficou registrada, não escondida.** `#FF6E00` sobre branco
   dá 2,81:1, abaixo do piso de 3:1 — nenhum laranja vivo alcança. Em vez de escurecer a cor da
   GHT4, todo preenchimento laranja sobre claro leva um fio `--alvo-ink`, e é o fio que responde
   pelo limite do componente (6,66:1). Sobre preto o laranja vai sozinho (7,48:1), e **texto
   sobre laranja é sempre preto, nunca branco**.

Dos três papéis, só *alvo* usa cor de marca. *Comprador* e *vendedora* são extensão funcional —
uma paleta de dados não cabe em preto e laranja sozinhos. Estão escolhidos para passar em três
testes: azul/laranja é o par seguro para daltonismo, e os três degraus de luminosidade
(L\* 63,7 / 31,5 / 5,1) mantêm a leitura em escala de cinza.

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
  Três lacunas são propositais na base de demonstração (Interquímica, Tecnoquímica, Limpec) —
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

1. ~~**Setores e subsetores**~~ — **DECIDIDO.** Setor foco: Químicos, prioridade em
   Distribuição. Os demais setores foram removidos. Taxonomia em `setores.js`.
   O que ainda precisa de validação dentro dessa decisão: as **faixas consolidáveis
   por subsetor** (hoje são estimativa do protótipo, não régua da casa) e se as
   adjacências excluídas — sobretudo farmoquímicos — devem mesmo ficar de fora.
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
