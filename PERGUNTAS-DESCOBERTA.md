# Perguntas de Descoberta — Agente de Prospecção M&A da GHT4

> Roteiro para a reunião de levantamento de requisitos com os sócios.
> Objetivo: transformar o protótipo de demonstração em uma ferramenta útil e confiável.
> Nada no protótipo atual é definitivo — estas perguntas existem justamente para
> substituir as suposições por decisões dos sócios.

---

## 1. Usuários e contexto de uso
- Quem usará o agente no dia a dia? (sócios, analistas, originadores, estagiários?)
- O uso será individual (cada profissional filtra o que quer) ou centralizado (um time cura e distribui listas)?
- Em que momento do trabalho o agente entra? (originação/prospecção ativa, resposta a mandato de cliente, monitoramento contínuo de um setor?)
- Preferem uma ferramenta de **descoberta** (achar oportunidades novas) ou de **monitoramento** (acompanhar uma lista-alvo já conhecida)? Ou ambos?
- Quantas oportunidades por semana/mês seriam um volume útil — e não excessivo?

## 2. Setores e escopo
- Quais setores são prioritários de fato para a GHT4? (os 4 do protótipo são ilustrativos)
- Há subsetores/nichos onde a boutique tem tese ou relacionamento diferenciado?
- Qual o recorte geográfico? (Brasil todo, regiões específicas, cross-border?)
- Existe faixa de porte ("sweet spot") de negócios que a GHT4 costuma assessorar? (por receita, valuation, EBITDA)
- Há setores/empresas que devem ser **excluídos** por conflito de interesse ou política interna?

## 3. Fontes de dados
- Quais fontes vocês já usam hoje para originar? (Receita/CNPJ, bases pagas, imprensa, LinkedIn, associações setoriais, relacionamento?)
- Há bases proprietárias/CRM da GHT4 que deveriam alimentar o agente? (histórico de contatos, pipeline, mandatos anteriores)
- Quais dados são realmente decisivos e quais são "bom ter"? (receita, crescimento, EBITDA, sócios, endividamento, notícias)
- Qual a tolerância a **dados incompletos ou estimados**? Preferem menos empresas com dado confiável, ou mais empresas com dado aproximado?
- Frequência de atualização esperada? (tempo real, semanal, mensal)
- Há restrições de licenciamento/LGPD nas fontes que pretendem usar?

## 4. Critérios de priorização e scoring
- O que, na experiência de vocês, torna uma empresa um **bom alvo de aquisição**? E um bom **comprador**? E uma provável **candidata a venda**?
- Quais sinais realmente antecipam uma transação? (sucessão, rodada, mudança de controle, endividamento, consolidação setorial, saída de fundo…)
- Como esses fatores deveriam ser **pesados** entre si? Algum é eliminatório (knock-out)?
- Faz sentido a lógica de 3 papéis (alvo / comprador / candidata a venda) ou vocês pensam em outras categorias?
- O score deve ser um número (0–100), faixas (A/B/C), ou apenas um ranqueamento relativo?
- Como querem tratar o **conflito**: uma mesma empresa pode ser alvo e comprador ao mesmo tempo?

## 5. Fluxo de trabalho e integração
- Depois que o agente prioriza, o que acontece? (vira tarefa, entra no CRM, gera um one-pager, dispara um contato?)
- Precisa integrar com alguma ferramenta existente? (CRM, e-mail, planilhas, pipeline de deals)
- Querem recursos de colaboração? (marcar como "em análise", atribuir a um sócio, anotar, arquivar, favoritar)
- Precisam de histórico/auditoria? (por que uma empresa entrou ou saiu da lista; como o score mudou no tempo)
- Alertas fazem sentido? (avisar quando surge um novo sinal em uma empresa monitorada)

## 6. Confidencialidade, compliance e risco
- Qual a política de confidencialidade para as listas geradas? Quem pode ver o quê?
- Como lidar com informação sensível/material não pública? Há barreiras de informação (chinese walls) a respeitar?
- Requisitos de LGPD para dados de pessoas (sócios, contatos)?
- Onde os dados podem residir? (nuvem, on-premise, restrições de fornecedor)
- Qual o nível de rastreabilidade exigido para justificar uma recomendação a um cliente?
- Como deixar explícito, para o usuário final, o que é dado real, estimado ou hipótese? (o protótipo já sinaliza isso — validar o padrão)

## 7. Métricas de sucesso
- Como saberemos que o agente está funcionando? (nº de mandatos originados, taxa de conversão de contato→reunião, tempo de originação, qualidade percebida das listas)
- Qual seria um resultado que já justificaria o investimento em uma v1?
- Que erro é mais custoso: um **falso positivo** (perder tempo com empresa irrelevante) ou um **falso negativo** (deixar passar um bom alvo)?
- Existe um "caso de uso âncora" — um setor ou mandato específico — onde poderíamos pilotar primeiro?

---

## Decisões que este protótipo deliberadamente NÃO tomou
Todas listadas para deixar claro que são hipóteses a validar:
- Os **4 setores** e seus subsetores.
- Os **filtros** disponíveis e suas faixas.
- A definição dos **3 papéis** e seus critérios.
- Os **sinais** considerados e o **peso** de cada um no score.
- A escala do **score** (0–100) e como interpretá-lo.
- O que significa cada **nível de confiança** e **origem** de dado.
- Quais **fontes** alimentarão o sistema.
