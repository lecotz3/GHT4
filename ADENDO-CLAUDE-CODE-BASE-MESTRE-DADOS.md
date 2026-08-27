# Adendo obrigatório ao plano do agente de prospecção

## Base mestre de inteligência de mercado da GHT4

**Data:** 27/08/2026  
**Documento relacionado:** `PLANO-CLAUDE-CODE-AGENTE-PROSPECCAO.md`  
**Destinatário:** Claude Code  
**Natureza:** complemento obrigatório do plano já recebido; não substitui as demais fases e requisitos.

---

## 1. Instrução principal

Implemente o agente sobre uma **base mestre empresarial ampla, histórica e continuamente atualizável**. Não construa o produto em torno de uma planilha ou de um dataset limitado ao primeiro filtro.

O subsetor de Distribuição e Trading Químico é apenas a primeira coorte operacional. Ele não deve virar um silo de dados nem definir o limite estrutural do produto.

Os critérios impostos pela GHT4 — setor, subsetor, CNAE, porte, localização, atividade, sinais de sucessão, perfil acionário, eventos, riscos, pesos e papéis de M&A — devem funcionar como regras versionadas aplicadas sobre o universo mestre.

Alterar uma regra deve produzir uma nova coorte ou um novo ranking. Nunca deve exigir reconstruir manualmente a base, apagar empresas que ficaram fora do filtro ou sobrescrever os fatos originais.

---

## 2. Resultado esperado

Ao final desta extensão, a GHT4 deve conseguir:

- carregar o maior universo empresarial autorizado disponível, preferencialmente os arquivos completos da RFB/CNPJ;
- acrescentar fontes públicas, licenciadas e internas ao longo do tempo;
- pesquisar e filtrar milhões de empresas sem carregar o dataset no navegador;
- alterar requisitos, pesos e teses sem nova importação dos dados de origem;
- comparar versões de filtros e rankings;
- explicar por que cada empresa foi incluída, excluída ou recebeu determinado score;
- reconstruir qualquer lista usando o mesmo snapshot, taxonomia e versão de regra;
- preservar empresas hoje fora do escopo para futuras teses e subsetores;
- manter histórico de mudanças cadastrais, financeiras, societárias, regulatórias e de M&A;
- exportar recortes grandes sem bloquear a aplicação.

---

## 3. Princípios não negociáveis

1. **Universo antes do filtro:** ingerir e preservar o universo autorizado antes de aplicar a tese química.
2. **Fonte não é score:** fatos importados, classificações e resultados de ranking são entidades separadas.
3. **Nada de exclusão silenciosa:** registros fora do filtro continuam na base e recebem motivo de exclusão na coorte.
4. **Histórico append-only:** novos snapshots não sobrescrevem observações anteriores.
5. **Reprodutibilidade:** toda lista aponta para `snapshot_id`, versão de taxonomia, versão de regra e data de corte.
6. **Ausência não é zero:** informação não apurada permanece `null` com status de cobertura.
7. **Processamento no servidor:** filtros, joins, facetas, scores e exports não rodam sobre o universo inteiro no browser.
8. **Escala comprovada:** a arquitetura só é aceita após testes de carga e análise de planos de consulta.

---

## 4. Arquitetura de dados obrigatória

Implemente três camadas claramente separadas.

### 4.1 Raw/landing

Armazena os arquivos exatamente como recebidos:

- RFB/CNPJ;
- IBAMA/RAPP;
- CVM;
- ASSOCIQUIM, ABIQUIM e outras associações;
- imports autorizados de Capital IQ, EMIS e Econodata;
- documentos, notícias e dados internos da GHT4.

Cada ativo precisa de:

- fonte e proprietário;
- data de corte e coleta;
- hash SHA-256;
- tamanho, MIME type e encoding;
- schema detectado;
- licença, método de acesso e classificação de confidencialidade;
- contagens de origem;
- relatório de qualidade;
- estado de processamento.

CSV, Parquet, planilhas e documentos devem ficar em object storage compatível com S3. Arquivos recebidos são imutáveis.

### 4.2 Curated/master

É a fonte canônica de verdade do produto:

- entidades jurídicas e estabelecimentos;
- raiz CNPJ, matriz e filiais;
- nomes e aliases;
- endereços, contatos cadastrais e CNAEs;
- grupos econômicos e relacionamentos;
- fatos financeiros e proxies;
- registros regulatórios;
- eventos corporativos e transações;
- documentos, evidências e afirmações;
- histórico por fonte e período.

Filtros da GHT4 nunca removem registros desta camada.

### 4.3 Serving/analysis

Contém dados derivados e reconstruíveis:

- classificação por setor e subsetor;
- coortes e suas versões;
- resultados de screening;
- contribuições de score;
- cobertura e confiança;
- facetas e contagens pré-calculadas;
- rankings por papel M&A;
- read models e caches;
- snapshots de relatórios e exports.

Esta camada pode ser descartada e recalculada a partir das camadas raw e master.

---

## 5. Escala de projeto

Dimensione o pipeline para **dezenas de milhões de estabelecimentos e centenas de milhões de observações históricas**, embora o primeiro recorte conhecido possua 38.583 empresas químicas.

Esses volumes são metas de capacidade arquitetural, não uma afirmação sobre a quantidade atual de dados disponível.

Use PostgreSQL como fonte estruturada de verdade no primeiro estágio. `pgvector` serve apenas para busca semântica de textos selecionados, nunca para substituir filtros relacionais.

Não introduza OpenSearch, ClickHouse ou outro banco distribuído antecipadamente. Só adicione um segundo mecanismo se benchmarks reais mostrarem que PostgreSQL, particionamento, índices e read models não atingem os critérios. Registre a decisão em ADR.

---

## 6. Modelo de dados adicional

Além das entidades descritas no plano principal, implemente:

- `universe_snapshots`: data de corte, cobertura, fontes, versão de schema, contagens, manifesto e estado;
- `data_assets`: arquivo raw, hash, localização, fonte, licença, tamanho e confidencialidade;
- `import_runs`: parâmetros, checkpoint, métricas, erros, início, fim e status;
- `staging_batches`: lote, faixa processada, tentativas e reconciliação;
- `canonical_entity_links`: ligação entre registro de origem e entidade canônica, método e confiança;
- `cohorts`: definição lógica e proprietário;
- `cohort_versions`: snapshot-base, expressão de filtro, taxonomia, parâmetros e autor;
- `cohort_memberships`: empresa, status, motivo de inclusão/exclusão e versão;
- `materialization_runs`: construção ou atualização dos read models;
- `query_audit`: consulta funcional, usuário, mandato, filtros, duração e volume retornado, sem registrar conteúdo confidencial indevido.

Todas as tabelas importadas ou derivadas precisam de lineage suficiente para chegar ao arquivo e registro de origem.

---

## 7. Requisitos técnicos de ingestão

- Usar streaming e bulk load (`COPY` ou equivalente).
- Nunca carregar o universo inteiro em memória.
- Usar staging tables antes do merge canônico.
- Fazer jobs idempotentes, resumíveis e seguros para repetição.
- Gravar checkpoints por arquivo e lote.
- Reconciliar contagens e rejeições com o manifesto da fonte.
- Quarentenar registros inválidos sem interromper toda a importação.
- Produzir relatório de duplicidade, campos ausentes, schema drift e conflitos.
- Separar importação, normalização, entity resolution, enriquecimento e classificação.
- Calcular diferenças entre snapshots sem apagar o passado.
- Permitir reprocessar uma regra sem reimportar os arquivos raw.

---

## 8. Requisitos técnicos de consulta

- Filtros e facetas devem rodar no backend.
- Usar keyset pagination; evitar paginação profunda com `OFFSET`.
- Nunca retornar a base completa ao frontend.
- Indexar CNPJ completo, raiz CNPJ, `snapshot_id`, UF, município, CNAE, subsetor, status, porte e datas conforme os planos de consulta.
- Usar B-tree, GIN e BRIN quando apropriado e comprovado por `EXPLAIN ANALYZE`.
- Particionar tabelas históricas por snapshot ou data; subparticionar somente com evidência de benefício.
- Criar read models ou materialized views para facetas e contagens frequentes.
- Atualizar agregações incrementalmente quando possível.
- Usar connection pooling, timeout, limites de linhas e cancelamento.
- Registrar e acompanhar queries lentas, cache hit, linhas examinadas e tamanho de índices.
- Tratar busca textual e semântica como complemento, não como substituto das regras determinísticas.

---

## 9. Alteração dos requisitos da GHT4

Os seguintes tipos de mudança devem gerar uma nova `cohort_version` ou `screening_template_version`:

- inclusão ou exclusão de CNAE;
- mudança de subsetor ou adjacência;
- faixa de receita, EBITDA, funcionários ou outras proxies;
- UF, município, raio ou presença geográfica;
- idade da empresa;
- matriz, filial ou grupo econômico;
- sinais de sucessão ou perfil familiar;
- barreiras e licenças regulatórias;
- eventos corporativos;
- perfil de comprador, alvo ou situação especial;
- política de dado ausente;
- peso, filtro duro, preferência ou ressalva.

O sistema deve mostrar antes da execução:

- regra anterior e nova;
- universo-base;
- estimativa de empresas afetadas;
- filtros adicionados ou removidos;
- versão que será criada.

Depois da execução, deve mostrar entradas, saídas, mudanças de score e motivos.

---

## 10. Primeiro recorte químico

Use os 38.583 registros químicos atuais como fixture, teste de regressão e primeira coorte reproduzível — não como limite do banco.

O funil atual deve continuar reproduzível:

- 38.583 empresas químicas ativas;
- 6.592 associadas a Distribuição e Trading;
- 1.670 com CNAE primário do subsetor;
- 204 com sinais de sucessão na coorte estudada;
- 35 com evidência IBAMA viva nessa coorte.

Essas contagens devem apontar para um snapshot específico. Nenhum número deve ser hardcoded como verdade permanente.

O filtro de sucessão continua opcional. CNAE secundário, evidência regulatória e confirmação por associação precisam permanecer como dimensões separadas para permitir novas combinações.

---

## 11. Exportações em grande volume

- Gerar exports de forma assíncrona e em streaming.
- Exibir progresso, cancelamento e falha recuperável.
- Limitar volume de forma configurável e informar quando houver truncamento.
- Salvar o resultado no object storage com expiração e permissão.
- Registrar snapshot, coorte, filtros, regra, usuário, data de corte e hash.
- Proteger contra CSV/Excel formula injection.
- Não manter uma conexão HTTP aberta durante toda a geração de arquivos muito grandes.

---

## 12. Implementação por etapas

### Etapa A — Fundação

- Criar ADR da arquitetura raw/master/serving.
- Adicionar migrations das entidades deste adendo.
- Criar object storage local no ambiente de desenvolvimento.
- Implementar manifestos, hashes e `import_run`.
- Definir catálogo inicial de queries e volumes esperados.

### Etapa B — Pipeline mestre

- Converter os importadores atuais para streaming e bulk load.
- Implementar staging, merge, checkpoint e quarentena.
- Carregar o maior universo empresarial autorizado disponível.
- Reconciliar contagens por arquivo e tabela.
- Implementar entity resolution por CNPJ e grupo sem depender do LLM.

### Etapa C — Coortes versionadas

- Modelar filtros da GHT4 como DSL validada.
- Criar `cohort_version` imutável.
- Registrar motivo de inclusão e exclusão.
- Reprocessar a coorte química sobre o universo mestre.
- Comparar duas versões e explicar diferenças.

### Etapa D — Serving e performance

- Criar filtros, facetas e keyset pagination.
- Criar read models das consultas mais frequentes.
- Implementar exports assíncronos.
- Executar e documentar os benchmarks.
- Ajustar particionamento e índices com base nos planos reais.

### Etapa E — Integração com o agente

- O agente consulta coortes e agregados por ferramentas tipadas.
- O agente não recebe milhões de registros no contexto.
- A ferramenta devolve resultados paginados, estatísticas e referências.
- A criação ou alteração de coorte exige preview e aprovação humana.
- Runs registram snapshot, regra, queries funcionais e artefatos produzidos.

---

## 13. Testes e benchmarks obrigatórios

Testar:

- idempotência da importação;
- retomada após falha no meio de um arquivo;
- schema drift;
- duplicidade e conflito de fontes;
- matriz, filial, raiz CNPJ, alias e grupo econômico;
- preservação de snapshots antigos;
- alteração de requisito sem mutação do resultado anterior;
- keyset pagination sem perda ou duplicação;
- concorrência de imports, filtros e revisões;
- export streaming e cancelamento;
- autorização por mandato;
- reconstrução integral de uma coorte a partir do snapshot e da regra.

Benchmark mínimo:

- pelo menos 10 milhões de estabelecimentos;
- pelo menos 100 milhões de observações sintéticas, ou o snapshot real se for maior;
- filtros indexados usuais com p95 inferior a 2 segundos;
- abertura de dossiê inferior a 1 segundo após cache;
- ingestão sem estouro de memória;
- paginação estável;
- falha e retomada comprovadas;
- export grande sem bloquear a API interativa.

Documente hardware, configuração, volume, distribuição dos dados, índices, planos de consulta, resultados e gargalos. Não aceite um benchmark executado somente sobre os 38.583 registros atuais.

---

## 14. Critérios de aceite deste adendo

Este adendo só está concluído quando:

- existe uma base mestre separada dos filtros da GHT4;
- o universo bruto autorizado foi preservado e reconciliado com a origem;
- o recorte químico é uma coorte versionada e reproduzível;
- mudar um requisito gera nova versão sem reimportar ou apagar dados;
- cada inclusão, exclusão e score é explicável;
- histórico e lineage chegam ao arquivo de origem;
- nenhuma tela baixa o universo inteiro;
- consultas e exports atendem aos benchmarks definidos;
- pipeline retoma após falha;
- decisões de particionamento e índices estão documentadas;
- a integração do agente usa ferramentas tipadas, paginação e aprovação humana;
- README e documentação deixam claro que a base química é o primeiro recorte, não o limite do produto.

Até esses critérios serem atendidos, descreva a base como protótipo ou piloto, nunca como infraestrutura de dados pronta para produção.
