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

Primeira etapa de servidor implementada: migration 0006, configuração inicial local opt-in, catálogo por leitura de JSON da base química, quatro tarefas assistidas, conversas privadas com contexto, ações concluíveis e auditoria. As requisições de mensagem têm chave por conversa e versão para evitar duplicação e sobrescrita entre abas. Acesso ao mandato é conferido antes de ler ou escrever.

Validação: 65 testes de domínio e 75 de servidor passaram no baseline. Após as alterações, passaram 38 testes de API, segurança, agente e catálogo. O TypeScript da interface passou antes da integração.

O usuário confirmou que ainda não há provedor de IA escolhido. Há um contrato de função `redigirIA` opcional em `criarApp`; nenhum provedor externo está habilitado. As tarefas atuais são roteiros com consulta determinística, não conversa livre com modelo generativo.

Segunda etapa entregue: tela inicial do agente, login e primeiro acesso, trabalhos recentes, filtros explícitos, preparação de reunião, conclusão e reabertura de ações. `npm run iniciar` e `Iniciar Agente GHT4.cmd` sobem API e interface em localhost com banco persistente. O iniciador força banco local e aguarda a saúde da API antes de iniciar a interface.

Validação completa: `npm run ci` passou, incluindo lint sem avisos, build, 65 testes de domínio, 83 testes de servidor e validações offline de taxonomia e paleta. No navegador, em banco isolado, foram verificados login, busca real por Campinas/SP, reunião na frente de compra, registro e conclusão de ação. Após encerrar a API e reiniciar sobre o mesmo banco, o histórico, contexto e ação concluída foram recuperados.

Próximo passo imediato: gestão de acessos e espaços para permitir uso por membros da equipe; manter convites e credenciais sob controle do administrador. Em seguida, ampliar a integração com o CRM e habilitar o provedor de IA quando escolhido. Os arquivos antigos do protótipo continuam intactos.

Ambiente de verificação desta sessão: portas 3312/5174, banco temporário separado do banco do usuário. Não reutilizar a conta de teste como conta de produção. O guia de uso está em `docs/runbooks/agente-local.md`.
