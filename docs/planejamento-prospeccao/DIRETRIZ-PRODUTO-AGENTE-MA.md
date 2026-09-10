# Diretriz de produto do agente de M&A da GHT4

Atualização em 10 de setembro de 2026 após orientação do usuário.

## Objetivo confirmado

O objetivo do projeto é criar um agente que ajude os membros da GHT4 no processo de M&A e seja facilmente utilizável no dia a dia. A pesquisa, as bases de dados, o ranking e os relatórios devem servir às tarefas que a equipe precisa concluir.

Continuam confirmados o piloto em Distribuição e Trading Químico e o equilíbrio entre mandatos de compra e de venda. A prospecção é a primeira frente de aplicação. O produto deve preservar o contexto para apoiar a continuidade do trabalho após a contratação, com expansão gradual conforme os requisitos e a validação com a equipe.

Esta diretriz complementa o planejamento e a pesquisa ampliada já entregues. Nas próximas revisões e decisões de implementação, a facilidade de uso e a utilidade de uma tarefa completa orientam a prioridade entre funcionalidades. O texto registra uma decisão de produto; não declara funcionalidades já implementadas.

## Experiência proposta para o dia a dia

O membro da boutique entra, escolhe ou retoma uma oportunidade ou mandato e descreve o que precisa. A tela inicial oferece tarefas prontas e trabalhos recentes. O agente aproveita informações já registradas e pergunta apenas o que falta para produzir uma entrega útil ou evitar um erro relevante.

O caminho principal combina conversa com listas, fichas e ações visíveis. O usuário pode selecionar empresas e editar campos diretamente. Não precisa aprender a escrever prompts, escolher modelos de IA, configurar fontes ou entender o funcionamento do ranking para começar.

Cada resposta apresenta primeiro o resultado e uma próxima ação possível. Fontes, critérios e histórico ficam acessíveis junto à entrega; limitações que mudem a decisão permanecem visíveis no resumo. Análises extensas e opções avançadas aparecem quando solicitadas.

O contexto salvo inclui objetivo, empresa, oportunidade ou mandato, critérios vigentes, arquivos permitidos e decisões já tomadas. O usuário consegue corrigir uma informação, desfazer uma alteração reversível, retomar um trabalho e compartilhar a versão adequada com outro membro autorizado. O contexto selecionado deve permanecer claro na tela.

## Tarefas que a primeira versão deve demonstrar

| Pedido do membro | Entrega útil | Continuidade no próprio agente |
| --- | --- | --- |
| Encontre empresas para esta tese | Lista fundamentada com aderência e lacunas | Refinar a seleção e salvar a lista |
| Prepare minha reunião com esta empresa | Resumo curto, fatos relevantes e perguntas | Acrescentar notas e registrar o próximo passo |
| Quem poderia comprar esta empresa | Contrapartes com hipóteses de encaixe | Comparar, excluir e aprofundar nomes |
| Encontre alvos para este comprador | Lista alinhada aos critérios do comprador | Revisar critérios e justificar a seleção |
| Resuma estes documentos ou atualize esta análise | Síntese com referências e pendências | Corrigir, aprofundar ou exportar a versão |
| O que ficou pendente nesta oportunidade | Histórico relevante, responsáveis e ações | Registrar andamento e preparar um rascunho |

Essas tarefas usam os módulos previstos no documento de requisitos. A disponibilidade de dados limita a entrega e deve ser comunicada de forma simples. Não se deve inferir intenção de venda ou de compra apenas para completar uma resposta.

Na continuidade de um mandato, o agente poderá reutilizar a pesquisa autorizada para apoiar comparáveis, relatórios, preparação de materiais e acompanhamento de pendências. Novos fluxos de execução entram conforme demonstrarem utilidade; não são uma condição para disponibilizar o piloto de prospecção.

## Consequências para o planejamento

O trabalho inicial deve demonstrar um fluxo completo: pedido, recuperação de contexto, pesquisa, resultado revisável e registro do próximo passo. Em seguida, ampliar a cobertura das tarefas. Construir os módulos isoladamente não comprova que o membro consegue trabalhar com o agente.

- **B01:** incluir observação de tarefas reais de sócio, analista e membro que origina negócios; validar esses perfis com a GHT4.
- **B21:** antecipar para P0 a conversa, as tarefas prontas, o contexto salvo e a revisão do resultado. Exportações e análises especializadas acompanham a disponibilidade dos módulos correspondentes.
- **B13 a B15:** disponibilizar desde o piloto a consulta de relações, o registro da oportunidade e o próximo passo, mesmo que integrações mais amplas venham depois.
- **B25:** iniciar testes de uso na primeira versão funcional e repetir quando houver mudança relevante de fluxo. O treinamento deve ajudar no trabalho, sem compensar dificuldades básicas da interface.
- **B24:** medir conclusão de tarefas, esforço total incluindo revisão, erros, necessidade de ajuda e retorno ao uso. Conversão comercial continua relevante, mas depende também de fatores fora do agente.

Pesquisa e produção de rascunhos avançam dentro do pedido do usuário. Alterações locais reversíveis têm retorno claro e possibilidade de desfazer. Envio externo, compartilhamento de conteúdo confidencial ou compromisso comercial exigem autorização correspondente ao destinatário e à ação, aproveitando autorizações válidas já dadas.

## Aceite de usabilidade proposto

Um membro que não participou do desenvolvimento deve conseguir iniciar uma tarefa usando a tela inicial, entender a entrega, verificar uma informação importante, corrigir um critério e retomar o trabalho depois. Deve também conseguir identificar se uma pesquisa terminou, continua em andamento ou depende de informação adicional.

Os testes devem usar tarefas representativas e dados autorizados da GHT4. Registrar onde a pessoa precisa de explicação, abandona o fluxo ou refaz trabalho fora do agente. Comparar o tempo e a qualidade com o processo atual, incluindo revisão e correção. As metas numéricas serão definidas após observar essa base de comparação.

**Critério central:** uma funcionalidade está pronta quando um membro da boutique consegue usá-la para concluir uma tarefa útil com clareza e controle sobre o resultado.
