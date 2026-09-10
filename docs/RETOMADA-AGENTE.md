# Retomada da implementação do agente GHT4

Atualizado em 10 de setembro de 2026. Branch de trabalho: `feat/agente-operacional`.

## Objetivo em execução

Entregar rapidamente um fluxo utilizável de agente para tarefas de M&A, começando por Distribuição e Trading Químico, com compra e venda equilibradas. O usuário autorizou implementar e pediu commits de tudo que for feito para permitir continuidade entre sessões.

## Diagnóstico verificado nesta etapa

- Existem API Fastify, sessões, RBAC, auditoria, migrations, Postgres ou PGlite e testes de servidor.
- A interface React ainda inicia na demonstração e usa módulos locais. Não há nela um fluxo de login nem de conversa conectado à API.
- Não há rotas de agente ou persistência de conversas implementadas no ponto de partida desta etapa.
- Os documentos anteriores sobre ausência completa de backend descrevem um estado antigo. Verificar o código antes de usar esses diagnósticos.

## Sequência de entrega

1. Validar a base existente e disponibilizar uma inicialização local simples, com acesso autenticado.
2. Implementar tarefas assistidas, conversas persistentes por usuário e mandato e retomada do histórico, com autorização no servidor.
3. Conectar uma tela inicial simples à API, com tarefas prontas, progresso, erros recuperáveis e continuidade do trabalho.
4. Preparar integração de linguagem natural por provedor configurado no servidor, com dados delimitados, fontes e tratamento explícito de indisponibilidade.
5. Verificar o fluxo no navegador, executar os testes pertinentes, documentar como iniciar e fazer commits por etapa.

## Regras de continuidade

- Ler `docs/planejamento-prospeccao/DIRETRIZ-PRODUTO-AGENTE-MA.md` antes de ampliar funcionalidades.
- Priorizar uma tarefa completa e útil. Preservar as telas existentes e não apresentar dados fictícios como pesquisa real.
- Não gravar credenciais em commits; configuração de IA e banco permanece no servidor.
- Testar em banco isolado. Não usar bases externas como destino de testes.
- Registrar aqui o que foi entregue, validações, limitações e próximo passo em cada commit funcional.
- O usuário autorizou commits locais; não foi solicitado push ou publicação.

## Estado do checkpoint

Diagnóstico inicial registrado. Próximo passo: executar verificações da base e implementar a primeira etapa funcional. A preferência de provedor de IA foi perguntada ao usuário, sem solicitar credenciais pelo chat.
