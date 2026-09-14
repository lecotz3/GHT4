# Retomada da implementação do agente GHT4

Atualizado em 14 de setembro de 2026. Branch de trabalho: `feat/agente-operacional`.

## Objetivo em execução

Entregar rapidamente um fluxo utilizável de agente para tarefas de M&A, começando por Distribuição e Trading Químico, com compra e venda equilibradas. O usuário autorizou implementar e pediu commits de tudo que for feito para permitir continuidade entre sessões.

## Estado mais recente — prévia de filtros e envio ao GitHub

Nova tarefa **Preparar filtros pelo pedido**: interpretação local de pedidos curtos, adaptador opcional de IA com JSON Schema estrito, tabela antes/proposta/trecho e aplicação explícita. A migration `0013_propostas_busca.sql` guarda a aplicação imutável, com auditoria, versão e chave de repetição. Aplicar salva os filtros e abre Encontrar empresas; a pesquisa é separada e cita a prévia. Conflitos entre abas e mudanças nos critérios de partida impedem sobreposição. A IA recebe somente pedido e cinco filtros; falhas/recusas mantêm uma prévia local identificada.

Limites importantes: UF única, frente, termo geral, CNAE principal e enquadramentos possíveis. Busca textual consulta nome/cidade/CNPJ juntos. O ensaio detectou que tratar `cidade: Campinas` como esse termo traria nomes de empresas de outros municípios; esse pedido agora gera pendência. Exemplo aplicável: `Distribuidoras em SP para compra; busca: Adequim; incluir possíveis`. Critérios financeiros, intenção e critérios não reconhecidos não são aplicados silenciosamente. Interpretação com modelo real continua sem avaliação; provedor não escolhido e nenhuma chamada paga feita.

Verificação final: **189 testes (65 domínio + 124 servidor)**, lint, TypeScript, build e validações offline passaram. CUA voltou a funcionar: ensaio isolado verificou pendência por município, revisão/aplicação/pesquisa (Adequim/SP), criação/aplicação de modelo, texto do documento e painel de operação. Tabela da prévia, documentos e formulário de backup inspecionados visualmente, sem cortes de conteúdo. Nenhuma credencial ou conta real da equipe criada. Isso não substitui o roteiro de aceitação pela GHT4.

Instância principal ativa em `http://127.0.0.1:5173/#vista=agente`, API 3311; migration 0013 aplicada. Cópia offline anterior em `.cache/antes-interpretacao-853d91eb869d4b7289b7083ce9e92dc0`. Helper ignorado atual: `.cache/agente-em-segundo-plano-20260914.mjs`; encerrar criando `.cache/parar-agente-20260914` e aguardando o fechamento. Saúde e interface retornaram 200. Logs ignorados em `server/iniciador-local.log` e `server/iniciador-local-erros.log`. QA usa banco descartável, separado de `server/.dados`.

O usuário autorizou commit e envio para **https://github.com/lecotz3/GHT4.git**, já configurado como `origin`. Em 14/09/2026 a branch `feat/agente-operacional` foi **publicada com sucesso** (27 commits, topo `1cb8377`); `origin/feat/agente-operacional` confere com o HEAD local e `main` permaneceu em `b1a078b`, sem force push nem merge. A causa do antigo **Repository not found** era credencial: o repositório existe, é privado e tem 0 colaboradores, enquanto o Git Credential Manager autenticava a conta `lecotz` em vez da dona `lecotz3`. Correção aplicada: `origin` passou a fixar a conta em `https://lecotz3@github.com/lecotz3/GHT4.git` e o login foi refeito como `lecotz3`. Próximos envios devem continuar sem force push ou merge presumido em `main`.

Próximo desenvolvimento: atualização operacional das fontes e painel de qualidade por campo; depois ranking calibrado, relatório setorial, documentos extensos e métricas. Provedor, hospedagem, dados autorizados e aceite com a boutique permanecem pendentes. A matriz B01–B26 é a referência; não declarar o plano inteiro concluído.

## Checkpoint anterior — modelos e atualização local (11/09/2026)

Modelos de pesquisa conectados ao agente: salvar filtros compartilhados no espaço ou na boutique, comparar versões e aplicar ao formulário antes de buscar. Analistas criam/usam; versionamento respeita o papel efetivo no servidor. O resultado cita a versão/hash e o servidor recusa filtros divergentes ou modelo de outro espaço. Histórico de conversas e documentos não entra no modelo. O campo de observações continua sem conversão automática em filtro.

Corrigidos hash de configurações aninhadas, isolamento de idempotência por usuário/caminho e retorno indevido de sucesso em repetição de falha. Correções de exportação: títulos completos no PDF e dimensões/estilo padrão do XLSX. Documentos além do contexto permitido explicam como reduzir o pedido antes de chamar o provedor. Matriz B01–B26 atualizada em `PLANO-EXECUCAO-AGENTE.md`, com pendências reais de desenvolvimento/dados/homologação; guia diário ampliado e roteiro `runbooks/aceitacao-piloto.md` preparado.

Validação final deste checkpoint: **181 testes (65 domínio + 116 servidor)**, lint, build e validações offline passaram. PDF sintético renderizado/inspecionado; XLSX aberto no openpyxl com 12 abas, dimensões válidas, zero avisos e nenhuma fórmula executável. O navegador CUA continua indisponível por falha de inicialização de assets; não contornar com outro mecanismo de controle, nem declarar revisão visual das telas novas concluída.

Agente principal novamente ativo em `http://127.0.0.1:5173/#vista=agente`, API 3311. Migrations 0009–0012 aplicadas com sucesso após cópia da base offline em `.cache/antes-implantacao-5ccc60ccc25d45f7a96e7eee1eb871fe`. Saúde e interface retornaram 200; a configuração do primeiro administrador continua disponível (nenhuma conta real criada por nós). Iniciador em segundo plano usa o helper ignorado `.cache/agente-em-segundo-plano.mjs`; para encerrar controladamente, criar o arquivo `.cache/parar-agente-20260911` e aguardar saída dos processos. Não tentar reutilizar a antiga sessão de exec 16595: ela não existe mais. Logs locais ignorados em `server/iniciador-local.log` e `server/iniciador-local-erros.log`.

Próxima prioridade: homologar a experiência com a GHT4, selecionar/configurar IA e hospedagem conforme escolhas ainda pendentes, depois fechar os itens de desenvolvimento explicitados na matriz (linguagem natural para regras, atualização de fontes, qualidade por campo, ranking real, relatório setorial e métricas). Não considerar o planejamento inteiro concluído nem atribuir todas as pendências apenas à infraestrutura.

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
- O usuário autorizou commits e, em 14/09/2026, push para `https://github.com/lecotz3/GHT4.git`. Isso não autoriza deploy em hospedagem presumida nem envio comercial a terceiros.

## Checkpoint de operação — 11/09/2026

Pacote de implantação privada preparado: Dockerfile, Compose com Postgres/Caddy, interface compilada servida pela API, HTTPS/origem obrigatórios em produção e bootstrap público fechado. Comando de console cria o primeiro administrador ou recupera conta existente, revogando sessões. Tela Equipe inclui operação, uso diário da IA e backup local cifrado. Restauração aceita somente uma pasta nova, preserva a base original e revoga sessões/convites copiados. Guia completo: `docs/runbooks/implantacao-privada.md`.

Migration nova `0012_operacao.sql`: limites persistentes de tentativa de acesso. Testes cobrem restauração real de trabalhos, oportunidades e bytes de anexos em outra pasta, senha errada, destino existente, permissões, recuperação de conta, origem e arquivos estáticos. Corrigida também a chave de repetição de tarefas para incluir o identificador da tarefa. `npm run ci` passou: **65 testes de domínio + 114 de servidor**, lint, build e validações offline. Concorrência dos arquivos de teste do servidor limitada a 2 para evitar disputa excessiva de CPU/memória dos bancos WASM e timeouts artificiais de extração.

QA isolado gerou PDF/Excel/JSON por fluxo real da API. Duas páginas do PDF foram renderizadas e inspecionadas; o workbook abriu no openpyxl sem fórmulas executáveis. Foram identificados ajustes menores de títulos/estilo de exportação para o próximo checkpoint. O controle de navegador CUA falhou antes de abrir a sessão (`failed to write kernel assets`), inclusive após reset; as telas novas não estão visualmente homologadas. Não houve rejeição de aprovação. Docker não está instalado neste host: o pacote não foi construído nem implantado em rede. Sem provedor escolhido, nenhuma chamada de IA real foi feita.

Continuar: corrigir os pequenos ajustes de exportação; fechar filtros reutilizáveis e prévia de pesquisa; atualizar matriz B01–B26 e roteiro de aceitação. Reiniciar o agente principal de forma controlada para aplicar as migrations novas. Não marcar uso em duas máquinas, avaliação de IA ou validação comercial como aprovados sem ensaio.

## Estado do checkpoint

Primeira etapa de servidor implementada: migration 0006, configuração inicial local opt-in, catálogo por leitura de JSON da base química, quatro tarefas assistidas, conversas privadas com contexto, ações concluíveis e auditoria. As requisições de mensagem têm chave por conversa e versão para evitar duplicação e sobrescrita entre abas. Acesso ao mandato é conferido antes de ler ou escrever.

Validação: 65 testes de domínio e 75 de servidor passaram no baseline. Após as alterações, passaram 38 testes de API, segurança, agente e catálogo. O TypeScript da interface passou antes da integração.

O usuário confirmou que ainda não há provedor de IA escolhido. Há um contrato de função `redigirIA` opcional em `criarApp`; nenhum provedor externo está habilitado. As tarefas atuais são roteiros com consulta determinística, não conversa livre com modelo generativo.

Segunda etapa entregue: tela inicial do agente, login e primeiro acesso, trabalhos recentes, filtros explícitos, preparação de reunião, conclusão e reabertura de ações. `npm run iniciar` e `Iniciar Agente GHT4.cmd` sobem API e interface em localhost com banco persistente. O iniciador força banco local e aguarda a saúde da API antes de iniciar a interface.

Validação completa: `npm run ci` passou, incluindo lint sem avisos, build, 65 testes de domínio, 83 testes de servidor e validações offline de taxonomia e paleta. No navegador, em banco isolado, foram verificados login, busca real por Campinas/SP, reunião na frente de compra, registro e conclusão de ação. Após encerrar a API e reiniciar sobre o mesmo banco, o histórico, contexto e ação concluída foram recuperados.

Terceira etapa entregue: tela **Equipe**, exclusiva do administrador, com criação de espaços confidenciais, convites de uso único válidos por 48 horas, definição da senha pelo convidado, suspensão e reativação de contas e concessão/retirada de acesso aos espaços. A migration 0007 guarda apenas hash dos tokens. Novos convites para o mesmo e-mail invalidam os anteriores. O link usa fragmento da URL para não entrar nas requisições HTTP; não é salvo em localStorage. A API não envia e-mails. A interface esclarece a limitação dos links locais e mantém o trabalho em andamento ao visitar a gestão de equipe.

Validação da terceira etapa: CI completo aprovado com 65 testes de domínio e 88 de servidor (153 no total), lint e build. Testes adicionais cobrem os três perfis não administrativos, espaços autorizados, ausência de segredos na auditoria, aceite concorrente, expiração/revogação, bloqueio de contas e restauração de acesso. Verificação de navegador em banco isolado: criação de espaço, geração de convite, abertura do formulário de primeiro acesso e atualização do seletor de espaços ao retornar ao agente. O aceite com senha foi validado pela API em bancos de teste, sem criar credenciais reais da equipe.

Quarta etapa, checkpoint de servidor: migration 0008, seleção de empresas por trabalho e frente (investigar/priorizar/descartar com justificativa), oportunidades no CRM a partir das seleções priorizadas e atividades comerciais com evidência declarada. A empresa e as fontes vêm do resultado salvo, não de campos fornecidos pelo navegador. A oportunidade herda o espaço; em trabalho pessoal permanece privada. Apenas os dados explicitamente cadastrados na oportunidade são compartilhados; notas da conversa e da revisão permanecem pessoais. Há responsável, prazo, conclusão de ação, controle de versão, reenvio sem duplicação e histórico imutável. Sócio/admin pode mover etapas; analista registra atividades e atualiza dados. Os sete testes específicos de prospecção passaram em bancos isolados.

Quarta etapa, interface conectada: **Revisar empresa** nos resultados, decisões justificadas por frente, criação da oportunidade com visibilidade explícita e acesso a **Oportunidades** no cabeçalho. O CRM possui filtros e paginação, responsável e prazo, conclusão/reabertura da ação, atividades, etapas comerciais e histórico. Voltar ao agente preserva o trabalho aberto. O CRM de demonstração permanece independente.

Validação: o CI passou com 65 testes de domínio e 95 de servidor; o aviso de lint sobre cleanup foi corrigido e o lint ficou limpo. Foi acrescentado e aprovado um teste real de persistência em disco (96 de servidor no conjunto final): fechar/reabrir o banco preserva sessão, seleção, fontes, oportunidade, frente, responsável, data e atividades; repetir envio após reabertura não duplica dados. O novo fluxo foi verificado no navegador em banco isolado, incluindo busca por Adequim/SP, priorização, oportunidade na frente de compra, atividade sintética que moveu a etapa, conclusão da ação e exclusão dessa ação de “Minhas pendências”. A ficha foi inspecionada visualmente.

Na sessão, a primeira tentativa de conferência visual foi bloqueada pela revisão automática por limite de uso; após a retomada, a mesma ferramenta funcionou e a conferência foi concluída. O banco temporário antigo falhou ao reabrir e foi preservado; os testes desta etapa usaram uma pasta nova. Isso não ocorreu no banco principal, que reiniciou e aplicou a migration 0008. Não usar encerramento forçado como procedimento de operação; encerrar normalmente e manter backup é trabalho do bloco de implantação.

Próximo passo imediato: seguir `docs/PLANO-EXECUCAO-AGENTE.md`, começando por ampliar a busca e a revisão de evidências, integrar linguagem natural quando houver provedor configurado e conectar fontes atualizadas. Ainda não há compartilhamento de conversas, integração real de IA, pesquisa web dentro do agente nem implantação para acesso remoto. Os arquivos antigos do protótipo continuam intactos.

Ambiente de verificação desta sessão: portas 3312/5174, banco temporário separado do banco do usuário. Não reutilizar a conta de teste como conta de produção. O guia de uso está em `docs/runbooks/agente-local.md`.

O ambiente principal usa 3311/5173 e `server/.dados`. A configuração inicial ainda estava disponível na verificação final: não foram criadas credenciais reais para a GHT4. O usuário define seu acesso pela tela. Nenhum push ou deploy remoto foi realizado.

Verificação final desta entrega: `npm run ci` aprovado com 65 testes de domínio e 96 de servidor, total de 161; lint sem avisos, TypeScript, build e validações offline aprovados. A aba do ambiente principal foi deixada na tela de primeiro acesso do agente. A aba de teste foi fechada.

## Checkpoint — IA e pesquisa configuráveis

Entregue em 10/09/2026: adaptador opcional OpenAI Responses, tarefas de conversa e pesquisa pública, fontes com citações clicáveis, contexto limitado ao trabalho, limites diários persistentes, deduplicação de chamadas, timeout e revalidação de sessão após o provedor. Migration 0009. Configuração em `docs/runbooks/configurar-ia.md`. A pesquisa recebe somente a consulta pública, sem histórico privado.

Validação: lint/build e 65 testes de domínio + 102 de servidor passaram. O provedor foi simulado; não houve uso de credencial nem pesquisa paga real. O provedor continua não escolhido e desativado, conforme resposta do usuário. Hospedagem também não escolhida; preparar a implantação, sem publicar em destino presumido.

Próximos blocos: ampliar pesquisa/seleção/exportação, rotina do CRM, evidências/rede/matchmaking, pacote de operação e matriz de aceite. A IA não encerra o restante do plano.

## Checkpoint — busca em páginas e rotina comercial

Entregue: paginação com hash do catálogo para impedir mistura de snapshots, filtro por CNAE principal, cobertura explícita dos campos financeiros ausentes e adição de página inteira à investigação sem sobrescrever revisões anteriores. Agenda por oportunidade com múltiplas tarefas, responsáveis e reprogramação, painel de pendências e carteira por frente. Restrição de contato por empresa e espaço (compra e venda), motivo categorizado, bloqueio de tarefas de contato e avanço para contato; retirada restrita a sócio/administrador autorizado. Migration 0010.

Validação: `npm run ci` passou com 65 testes de domínio e 105 de servidor, incluindo fonte/paginação, lote, agenda, permissões, concorrência e restrição entre frentes. As novas telas ainda serão incluídas no ensaio final de navegador. Próximo: acervo operacional (evidências/documentos/rede/teses), exportações e pacote de implantação/recuperação.

## Checkpoint — acervo, documentos, contrapartes e exportação

Entregue: acervo por oportunidade com versões imutáveis, autoria e revisão humana de evidências, relações, teses, comparáveis, notícias e passagem para execução. Contatos pessoais omitidos para analistas, inclusive no histórico. Comparação de perfis revisados separa aderência e cobertura. Múltiplos só usam métricas revisadas com denominadores válidos. Passagem depende de mandato assinado.

Upload autorizado de PDF/DOCX/TXT/MD até 2 MB, original e SHA-256 preservados, extração isolada em worker com limite de tempo/memória, páginas/parágrafos para conferência e análise opcional no agente. PDF digitalizado sem texto e falha de extração são estados explícitos. Contexto de documentos é escolhido pelo usuário e não segue para pesquisa web. Novas dependências: pdfkit e pdfjs-dist, registradas no lockfile; instalação auditada sem vulnerabilidades conhecidas pelo npm no momento.

Exportações de lista e oportunidade em XLSX, PDF e JSON a partir de um corte imutável comum, hash SHA-256 do JSON com chaves ordenadas, validação de versão e autorização na geração e download. Exportação de oportunidade não copia notas de conversa nem e-mail/telefone da rede. A geração de XLSX reutiliza o gerador ZIP/XML já existente no projeto.

Validação: `npm run ci` passou com 65 testes de domínio e 110 de servidor. Inclui revisão/permissões, histórico, extração real de PDF sintético, documentos, comparação, hash e formatos de exportação. A falha inicial da extração de PDF foi corrigida usando o encerramento da loading task compatível com PDF.js 6. Visualização final dos novos formulários/arquivos e pacote de operação ainda serão executados na sequência. Migration 0011 ainda não aplicada ao banco principal na hora deste checkpoint; os testes usam bancos isolados.
