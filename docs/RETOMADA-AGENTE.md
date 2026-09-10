# Retomada da implementação do agente GHT4

Atualizado em 10 de setembro de 2026. Branch de trabalho: `feat/agente-operacional`.

## Objetivo em execução

Entregar rapidamente um fluxo utilizável de agente para tarefas de M&A, começando por Distribuição e Trading Químico, com compra e venda equilibradas. O usuário autorizou implementar e pediu commits de tudo que for feito para permitir continuidade entre sessões.

## Diagnóstico do ponto de partida, anterior aos checkpoints abaixo

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

Terceira etapa entregue: tela **Equipe**, exclusiva do administrador, com criação de espaços confidenciais, convites de uso único válidos por 48 horas, definição da senha pelo convidado, suspensão e reativação de contas e concessão/retirada de acesso aos espaços. A migration 0007 guarda apenas hash dos tokens. Novos convites para o mesmo e-mail invalidam os anteriores. O link usa fragmento da URL para não entrar nas requisições HTTP; não é salvo em localStorage. A API não envia e-mails. A interface esclarece a limitação dos links locais e mantém o trabalho em andamento ao visitar a gestão de equipe.

Validação da terceira etapa: CI completo aprovado com 65 testes de domínio e 88 de servidor (153 no total), lint e build. Testes adicionais cobrem os três perfis não administrativos, espaços autorizados, ausência de segredos na auditoria, aceite concorrente, expiração/revogação, bloqueio de contas e restauração de acesso. Verificação de navegador em banco isolado: criação de espaço, geração de convite, abertura do formulário de primeiro acesso e atualização do seletor de espaços ao retornar ao agente. O aceite com senha foi validado pela API em bancos de teste, sem criar credenciais reais da equipe.

Quarta etapa, checkpoint de servidor: migration 0008, seleção de empresas por trabalho e frente (investigar/priorizar/descartar com justificativa), oportunidades no CRM a partir das seleções priorizadas e atividades comerciais com evidência declarada. A empresa e as fontes vêm do resultado salvo, não de campos fornecidos pelo navegador. A oportunidade herda o espaço; em trabalho pessoal permanece privada. Apenas os dados explicitamente cadastrados na oportunidade são compartilhados; notas da conversa e da revisão permanecem pessoais. Há responsável, prazo, conclusão de ação, controle de versão, reenvio sem duplicação e histórico imutável. Sócio/admin pode mover etapas; analista registra atividades e atualiza dados. Os sete testes específicos de prospecção passaram em bancos isolados.

Próximo passo imediato: conectar a interface de seleção e oportunidades a essas rotas, testar o fluxo de ponta a ponta, atualizar o guia e executar o CI completo. Depois, implementar o adaptador do provedor quando escolhido e a pesquisa com fontes atualizadas. Ainda não há compartilhamento de conversas, integração real de IA, pesquisa web dentro do agente nem implantação para acesso remoto. Os arquivos antigos do protótipo continuam intactos.

Ambiente de verificação desta sessão: portas 3312/5174, banco temporário separado do banco do usuário. Não reutilizar a conta de teste como conta de produção. O guia de uso está em `docs/runbooks/agente-local.md`.
