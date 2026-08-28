# ADR 0001 — Camadas raw, master e serving

**Data:** 27/08/2026
**Estado:** aceito
**Origem:** `ADENDO-CLAUDE-CODE-BASE-MESTRE-DADOS.md`, §4 e §12 Etapa A

---

## Contexto

O produto foi construído em torno de um recorte: 38.583 empresas químicas ativas,
já filtradas pela tese de Distribuição e Trading. Isso funciona para demonstrar e
falha para operar, por três motivos que apareceram na prática:

1. **Mudar a régua exigiria reimportar.** Incluir um CNAE, mexer na faixa de
   receita ou trocar o subsetor-alvo hoje significa rodar o importador de novo
   sobre 5 GB de dados abertos. Uma decisão de negócio de trinta segundos vira
   uma tarefa de horas.

2. **O que ficou fora sumiu.** Empresas excluídas pelo filtro não estão na base.
   Quando a GHT4 abrir a segunda tese — especialidades, tintas, um subsetor
   adjacente — não há de onde tirá-las, e a pergunta "quantas ficaram de fora, e
   por quê?" não tem resposta.

3. **Nenhuma lista se explica.** Sem registro de qual snapshot, qual taxonomia e
   qual versão de regra produziram um resultado, "por que esta empresa entrou na
   shortlist?" depende de memória de quem rodou.

O adendo trata isso como requisito, não como melhoria, e acrescenta uma meta de
capacidade: dezenas de milhões de estabelecimentos.

## Decisão

Três camadas, com responsabilidades separadas e regras diferentes de mutação.

### Raw / landing — o que chegou, como chegou

Arquivos exatamente como recebidos, **imutáveis**. Cada ativo carrega fonte,
proprietário, licença, data de corte, data de coleta, hash SHA-256, tamanho,
MIME type, encoding, schema detectado, contagens de origem e classificação de
confidencialidade.

Nada aqui é editado. Reprocessar significa ler de novo o mesmo arquivo, e é isso
que torna qualquer resultado reconstruível.

### Master / curated — a verdade canônica

Entidades jurídicas, estabelecimentos, aliases, endereços, CNAEs, grupos
econômicos, fatos financeiros, registros regulatórios, eventos e evidências.
Histórico **append-only**: um snapshot novo não sobrescreve observação anterior.

**Filtro da GHT4 nunca remove registro desta camada.** É a regra que separa esta
arquitetura da anterior: o que fica fora de uma coorte continua na base e ganha
motivo de exclusão *na coorte*, não sumiço.

### Serving / analysis — derivado e descartável

Classificações, coortes e suas versões, resultados de screening, contribuições de
score, cobertura, facetas, rankings, read models e snapshots de export.

Tudo aqui pode ser apagado e recalculado a partir de raw + master. Se não puder,
está na camada errada.

## Consequências

**O que melhora**

- Mudar requisito produz uma `cohort_version` nova; não reimporta nada.
- Comparar duas versões de regra passa a ser uma consulta, não uma arqueologia.
- Empresa fora do escopo de hoje continua disponível para a tese de amanhã.
- Toda lista aponta para `snapshot_id` + versão de taxonomia + versão de regra.

**O que custa**

- Mais tabelas e mais escrita: o mesmo fato existe como arquivo raw, linha
  canônica e possivelmente linha derivada.
- Ingestão fica mais lenta: staging, reconciliação e merge em vez de gravar
  direto.
- Exige disciplina: gravar em master a partir da aplicação, fora do pipeline,
  quebra o lineage sem produzir erro visível. Mitigado por `import_run_id`
  obrigatório nas tabelas importadas.

## Banco: PostgreSQL, e só

`pgvector` entra apenas para busca semântica de texto selecionado. Nunca
substitui filtro relacional — o produto precisa explicar por que uma empresa
entrou numa lista, e similaridade de vetor não explica.

Não se adota OpenSearch, ClickHouse ou outro mecanismo distribuído por
antecipação. Só entra se benchmark real mostrar que Postgres com particionamento,
índices e read models não atinge os critérios do §13 do adendo — e a decisão vira
um ADR próprio, com os números que a motivaram.

## Ambiente de desenvolvimento: PGlite, com uma ressalva declarada

A máquina de desenvolvimento não tem Docker nem Postgres. Adotou-se **PGlite** —
Postgres compilado para WebAssembly, mesmo parser e mesmos tipos — para que o
backend seja executado e testado de verdade, e não apenas escrito.

O esquema, os índices, o particionamento e a ingestão são escritos para o
**Postgres real**. PGlite roda a verificação funcional.

**Ressalva que não pode ser esquecida:** os benchmarks do §13 do adendo — 10
milhões de estabelecimentos, 100 milhões de observações, p95 < 2 s, planos de
consulta reais — **não foram executados**. PGlite é single-process em WASM e não
serve para medi-los. Enquanto não rodarem em Postgres de verdade, o requisito de
escala está **pendente**, nunca aprovado. O adendo é explícito: "não aceite um
benchmark executado somente sobre os 38.583 registros atuais".

## Object storage

Interface compatível com S3. Em desenvolvimento, implementação em disco local sob
`server/.dados/objetos`, com o mesmo contrato — `pôr`, `obter`, `listar`, `hash` —
para que trocar por S3 real seja trocar a implementação, e não o código que chama.

## Alternativas descartadas

**Manter uma camada só, filtrando na importação.** É o que existia. Barato de
construir e caro de operar: cada mudança de regra vira reimportação, e o que ficou
fora não volta.

**Data lake em arquivos (Parquet + engine de consulta).** Boa leitura analítica,
má transação. O produto precisa de revisão humana com trilha, decisão append-only
e escrita concorrente — que é banco relacional, não lake.

**Postgres agora e um motor de busca desde já.** Dois lugares para a mesma verdade
antes de existir evidência de que um não basta. O adendo proíbe explicitamente, e
com razão: sincronizar dois mecanismos é um custo permanente.
