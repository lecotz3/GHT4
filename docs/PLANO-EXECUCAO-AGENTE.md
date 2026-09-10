# Execução do agente de M&A da GHT4

Atualização: 10 de setembro de 2026. Este documento organiza a implementação do planejamento já pesquisado; não substitui os requisitos originais nem declara que todas as funcionalidades estão concluídas.

## Resultado disponível para o piloto local

O membro entra, escolhe compra ou venda, pesquisa o cadastro de distribuição química, prepara uma reunião, registra ações, revisa empresas com justificativa e cria uma oportunidade. A oportunidade mantém responsável, prazo, próximo passo e atividades comerciais. A equipe compartilha os dados de oportunidades nos espaços autorizados; conversas pessoais permanecem privadas.

As tarefas utilizam consultas e roteiros. Ainda não há modelo generativo, pesquisa web executada pelo agente, ranking financeiro validado ou recomendação automática de transação. As condições de dados e o significado das etapas aparecem na interface.

## Entregas e sequência

| Bloco | Estado verificado | Próxima entrega concreta | Como considerar pronto |
| --- | --- | --- | --- |
| Acesso e continuidade | Login, primeiro administrador, trabalhos salvos, contexto e ações funcionam localmente | Recuperação de acesso e observação de uso por um membro da GHT4 | A pessoa inicia, conclui e retoma uma tarefa sem ajuda do desenvolvedor |
| Equipe e confidencialidade | Convites, espaços, suspensão e permissões implementados | Histórico compartilhado somente quando escolhido e revisão dos papéis com a equipe | Nenhum usuário lê dado fora do escopo; revogar acesso impede novas consultas |
| Busca e coorte química | Consulta ao snapshot cadastral com critérios explícitos e classificação existente | Paginação da pesquisa, filtros de tese, seleção em lote e cobertura por fonte | Lista reconstruível com referência e critérios; ausência de dado continua explícita |
| Revisão de empresas | Investigar/priorizar/descartar, justificativa, fonte e frente preservadas | Evidências adicionais revisáveis e comparação entre versões | Decisão mostra autor, fundamento e lacunas; novas fontes não apagam as anteriores |
| CRM comercial | Oportunidade, responsável, prazo, atividade, etapa e histórico implementados | Várias tarefas por oportunidade, restrição “não contatar”, motivos estruturados e alertas internos | Equipe coordena a abordagem e nenhum compromisso fica sem responsável ou prazo |
| Agente com linguagem natural | Contrato de adaptador opcional preparado; nenhum provedor escolhido | Configuração no servidor e execução limitada às tarefas autorizadas | Testes com fonte hostil, dados sem evidência, indisponibilidade, custo e permissões passam; usuário revisa o resultado |
| Pesquisa atualizada | Pesquisa de planejamento está documentada; agente usa somente snapshot | Conector permitido, registro de fonte/data/trecho, atualização e indicação de falha | Uma pesquisa real apresenta evidência verificável; falha de coleta não vira ausência de fato |
| Contrapartes e relações | Protótipos anteriores existem, sem integração operacional completa | Tese de comprador/alvo, origem das conexões e campos protegidos da rede | Reutilizar relações autorizadas sem expor contatos pessoais a quem não pode vê-los |
| Documentos e saídas | Pesquisa e planejamento em documentos estão versionados | Arquivos por espaço, resumo com referências e exportação fiel da lista revisada | Mesma versão e corte em tela e exportação; nenhuma nota privada sai por herança acidental |
| Operação compartilhada | Inicialização local e testes automatizados disponíveis | Hospedagem privada, Postgres, HTTPS, backup/restauração e observabilidade | Dois membros em máquinas distintas usam seus próprios acessos e um ensaio de restauração preserva trabalhos e oportunidades |
| Continuidade após contratação | Etapa comercial “Mandato assinado” pode ser registrada com referência | Passagem revisável para execução, contrato, escopo, equipe e pendências | Assinatura comercial e fechamento da transação são eventos distintos |

## Ordem de trabalho recomendada

1. Validar o fluxo local com uma tarefa representativa da equipe e corrigir as dificuldades observadas. O roteiro está no guia local.
2. Ampliar a busca e a lista, evitando depender de um primeiro lote de resultados para investigar o mercado.
3. Configurar o provedor escolhido e integrar pesquisa com evidências. Até a definição, continuar entregando tarefas úteis sem transmitir dados a serviços externos.
4. Completar a rotina de oportunidade: tarefas, restrições de abordagem, conexões e documentos, mantendo compra e venda como recortes separados.
5. Preparar e validar a instalação compartilhada antes de convidar pessoas em outras máquinas.

Não tratar a disponibilidade de um protótipo visual como integração concluída. Cada bloco deve terminar com um fluxo utilizável, testes correspondentes e um commit acompanhado da atualização de `RETOMADA-AGENTE.md`.

## Decisões já recebidas e dependências

- Piloto confirmado: Distribuição e Trading Químico.
- Prioridade comercial: equilíbrio entre mandatos de compra e de venda.
- Provedor de IA: ainda não escolhido; deixar a configuração preparada, sem credenciais no navegador ou no Git.
- Commits locais autorizados em todas as etapas. Push e publicação remota ainda não solicitados.
- A equipe deverá fornecer ou autorizar os dados internos e escolher o ambiente compartilhado. Não preencher essas lacunas com contatos ou informações financeiras presumidos.

## Referências internas

- [Diretriz de produto e usabilidade](planejamento-prospeccao/DIRETRIZ-PRODUTO-AGENTE-MA.md)
- [Planejamento de requisitos](planejamento-prospeccao/plano.md)
- [CRM, processos e saídas](planejamento-prospeccao/plano-parte-2.md)
- [Pesquisa ampliada](planejamento-prospeccao/pesquisa-ampliada/plano.md)
- [Guia do agente local](runbooks/agente-local.md)
- [Checkpoint de retomada](RETOMADA-AGENTE.md)
