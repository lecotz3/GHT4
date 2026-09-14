# Usar o agente local da GHT4

## Iniciar

Requisitos: Node.js 22 ou posterior e dependências do repositório instaladas. Na pasta raiz do repositório:

```powershell
npm ci --prefix server
npm ci --prefix v1
npm run iniciar
```

As instalações só são necessárias na preparação do ambiente ou após mudança no lockfile. Abra **http://127.0.0.1:5173**. Na primeira abertura, crie o administrador com nome, e-mail e senha de pelo menos 12 caracteres. Depois, use esse acesso para retomar seus trabalhos. O servidor e a interface permanecem ativos enquanto o comando estiver aberto. Ctrl+C encerra ambos.

No Windows, após preparar as dependências, também é possível abrir `Iniciar Agente GHT4.cmd` com duplo clique.

O iniciador é local: usa PGlite persistente, mesmo que exista uma `DATABASE_URL` no ambiente, e não publica a aplicação na rede. Os dados ficam em `server/.dados`, fora do Git. `GHT4_DADOS_DIR` permite escolher outra pasta, inclusive para verificação isolada. Não inicie duas instâncias sobre a mesma pasta de dados. Um banco já configurado por outro processo exige o acesso existente; o iniciador não cria nem redefine uma conta nesses casos.

Portas alternativas: definir `PORTA` para a API e `GHT4_PORTA_WEB` para a interface antes de iniciar. O proxy acompanha a porta da API. A inicialização avisa se houver porta ocupada e não encerra outros processos.

## Primeiro fluxo disponível

1. Entre no agente e dê um nome ao trabalho, se desejar.
2. Escolha compra ou venda e, opcionalmente, vincule a um espaço autorizado.
3. Use **Encontrar empresas** com nome, cidade ou raiz de CNPJ e estado.
4. Em uma empresa, escolha **Preparar reunião** e informe o objetivo da conversa.
5. Use **Registrar próximo passo** para guardar uma ação. Conclua ou reabra a ação na lista lateral.
6. Volte pelos **Trabalhos recentes**, inclusive após encerrar e iniciar o servidor.

O histórico é privado por usuário nesta versão. Trabalhos vinculados a um espaço também dependem da permissão nesse espaço. Participar do mesmo mandato não compartilha automaticamente conversas. A lista limita-se aos 100 trabalhos mais recentes e cada abertura mostra as últimas 50 tarefas.

## Da pesquisa à oportunidade

1. Em um resultado do agente, clique em **Revisar empresa**.
2. Escolha **Investigar**, **Priorizar** ou **Descartar** e escreva o motivo. A decisão pode ser revista; o histórico de auditoria preserva a mudança. Compra e venda têm decisões independentes, determinadas pela frente do resultado original.
3. Na seção **Sua lista revisada**, uma empresa priorizada permite **Criar oportunidade**. Informe objetivo comercial, próxima ação e prazo. Você começa como responsável e a etapa inicial é **Identificada**.
4. A tela explica a visibilidade antes de salvar. Em um trabalho pessoal, a oportunidade é privada. Em um espaço, ela fica disponível aos membros autorizados. São compartilhados o cadastro e os dados preenchidos nessa criação; a conversa e os motivos da revisão permanecem privados.
5. Use **Oportunidades** no cabeçalho para acompanhar os registros por empresa, frente, etapa ou pendência. A lista tem paginação de 30 registros, ordenados por prazo. **Minhas pendências** mostra ações abertas sob sua responsabilidade; **Atrasados** mostra prazos anteriores ao dia corrente de São Paulo. Mandatos assinados e oportunidades perdidas saem desses dois filtros.
6. Na ficha, atualize objetivo, responsável, prazo e próxima ação. Marque a ação como concluída e clique em **Salvar acompanhamento**. Editar o texto da próxima ação reabre a pendência. Responsáveis de espaços devem ter conta ativa e permissão de edição; oportunidades pessoais permanecem sob responsabilidade do próprio autor.
7. Em **Registrar atividade**, descreva o que aconteceu e a evidência, com a data real. Sócios e administradores com permissão no espaço podem atualizar a etapa. Analistas registram notas e atividades sem mover o pipeline. Contato exige canal e destinatário; conversa exige participantes; proposta e assinatura exigem referência ao documento; pausa e perda exigem motivo.

O agente registra esses eventos como declarações da equipe: não verifica contratos ou propostas nem envia comunicações. Registros históricos não podem ser apagados ou sobrescritos. Para corrigir um evento, registre a correção e, com a permissão necessária, ajuste a etapa. As últimas 100 atividades ficam visíveis na ficha.

Se outra pessoa ou aba atualizar a oportunidade durante uma edição, a gravação será recusada e a tela orientará a reabrir o registro. Tentativas repetidas do mesmo envio não duplicam atividades ou oportunidades. Rever uma decisão de seleção não muda automaticamente a etapa de uma oportunidade já criada.

O CRM operacional é acessado pelo cabeçalho do **agente**. O CRM antigo dentro de **Explorar demonstração** mantém dados e comportamento do protótipo; não há migração automática desses registros. As ações pessoais do trabalho e as próximas ações comerciais são registros distintos nesta entrega.

## Acessos da equipe

O administrador encontra **Equipe** no cabeçalho do agente. A tela permite:

1. Criar um espaço por tese, oportunidade ou mandato, restrito aos membros escolhidos.
2. Convidar uma pessoa por nome, e-mail, perfil e espaços autorizados. O agente gera um link de uso único, válido por 48 horas; o administrador copia e compartilha pelo canal adequado. Nenhum e-mail é enviado automaticamente.
3. A pessoa abre o link e define a própria senha, com pelo menos 12 caracteres. O acesso fica vinculado ao e-mail do convite. Quem receber o link poderá utilizá-lo; compartilhe apenas com o destinatário correto.
4. Gerenciar os espaços de cada membro ou suspender e reativar sua conta. A suspensão encerra as sessões abertas; a reativação exige novo login. Ao retirar acesso a um espaço, trabalhos vinculados deixam de ser acessíveis à pessoa, preservando o histórico no banco.

O link completo aparece apenas na criação. Para recuperar um link perdido, gere outro convite com o mesmo e-mail: o anterior será cancelado. Convites pendentes também podem ser cancelados pela tela. Recuperação de senha é feita pelo responsável técnico pelo [comando de console](implantacao-privada.md). Não há convites de administrador.

Os perfis sócio e analista executam tarefas do agente; somente leitura não cria trabalhos. O histórico de cada pessoa permanece privado, mesmo dentro de um espaço comum. Ao voltar da tela de equipe, o trabalho aberto continua na interface e o seletor inclui os novos espaços.

**Uso local:** os links `127.0.0.1` abrem somente no computador que está executando o agente. Esta entrega permite verificar o fluxo de equipe localmente. Para pessoas em máquinas distintas, ainda é necessário implantar o ambiente compartilhado com endereço próprio, HTTPS e operação do banco. Não basta trocar o endereço no link.

## Dados e limites atuais

A busca cadastral lê o snapshot local `data-quimicos.js`, referência extraída do arquivo. O classificador existente determina o enquadramento em distribuição química. Registros possíveis entram apenas quando essa opção é escolhida. Os resultados são ordenados por enquadramento e nome, não por probabilidade de venda ou qualidade financeira. Pesquisa na internet é uma tarefa separada e exige configuração do provedor e da ferramenta web.

Faturamento, intenção de transação, contatos pessoais e inferências de sucessão do arquivo legado não são usados para completar fichas do agente. A ficha de reunião utiliza os dados cadastrais permitidos e perguntas propostas, identificadas como roteiro. As observações digitadas na busca ficam registradas; os filtros explícitos controlam a consulta.

Os trabalhos, mensagens, contexto e ações são gravados no banco com auditoria. As telas da **demonstração** continuam acessíveis separadamente e mantêm seu comportamento anterior; não representam integrações concluídas do agente com todos os módulos.

## Modelos, documentos e rotina ampliada

Na busca, CNAE principal aceita sete dígitos; a paginação mantém o hash do snapshot. Adicionar o lote para investigar preserva decisões anteriores e não aprova empresas automaticamente. Em **Modelos de pesquisa da equipe**, salve filtros, compare a versão com o formulário e aplique antes de buscar. Modelos de um espaço ficam nesse espaço; modelos sem espaço são da boutique. Incluem somente frente, termo de busca, UF, CNAE e possíveis. Não coloque termos confidenciais em um modelo geral. Sócios/administradores autorizados podem versionar; analistas podem criar e usar modelos. Aplicar filtros não executa a busca sozinho.

A agenda aceita várias tarefas com tipo, responsável e prazo. **Não contatar** vale para a empresa no mesmo espaço, inclusive nas duas frentes. Retirar exige papel autorizado e motivo. O painel conta estados atuais por frente, sem apresentá-los como taxas de conversão.

O acervo reúne evidências, relações, teses, comparáveis, notícias e passagem para execução. Registros têm origem, referência, data, autor e versões. Revisão exige permissão; ausência continua explícita. Relações exigem origem autorizada e contatos são omitidos de perfis sem permissão. Comparáveis só geram múltiplos com dados revisados e denominadores positivos; não geram o valor do alvo. Comparação de teses mostra critérios conhecidos/cobertura, sem confirmar interesse de transação.

Documentos: PDF com texto, DOCX, TXT e MD, até 2 MB. Original/hash preservados. **Conferir texto** mostra páginas/parágrafos; falhas e ausência de texto ficam identificadas. Não há OCR. Preparar análise de até quatro documentos abre novo trabalho; a IA só é chamada ao enviar, após configuração. O contexto tem limite de 48 mil caracteres; selecione menos documentos ou arquivos menores quando necessário.

**Exportar entrega** salva um corte de lista/oportunidade em Excel, PDF e JSON. Edições ainda não salvas ficam fora. Os formatos usam o mesmo corte/hash; novas revisões exigem outro corte. Documentos originais e e-mail/telefone de relações não entram automaticamente no relatório. Compartilhar exige destinatários autorizados.

Após registrar mandato assinado com referência, a passagem para execução admite contrato, escopo, equipe, pendências e marco. Isso não declara fechamento de transação.

## Configurar IA

O usuário ainda não escolheu o provedor. As tarefas disponíveis funcionam sem LLM e a interface informa essa condição. Não há chave de IA em uso, seleção automática de fornecedor ou transmissão para serviços externos.

O adaptador OpenAI Responses está preparado, com modelo explícito, credencial no servidor, prazos, limites persistentes e resposta de até 24 mil caracteres. Web é opt-in e envia somente a consulta pública explícita, preservando citações. Conversa livre recebe contexto delimitado, até quatro tarefas recentes e documentos selecionados; a pessoa revisa a resposta.

Seguir [Configurar IA](configurar-ia.md). Sem seleção automática de fornecedor nem credencial no navegador. Os testes usam respostas simuladas; configuração e aceitação com um modelo real continuam pendentes.

## Backup e recuperação

Administradores encontram **Equipe → Operação e continuidade**. A cópia local exige senha de acesso, senha do arquivo e ciência de que inclui trabalhos privados. Guardar arquivo e senha separadamente. Última solicitação não confirma download/restore. A restauração preserva a base original e segue o [guia de implantação e continuidade](implantacao-privada.md).

## Preparar filtros pelo pedido

Escolha **Preparar filtros pelo pedido** e descreva os critérios. Sem provedor, um exemplo reconhecido é: `Distribuidoras em SP para compra; busca: Adequim; incluir possíveis`. As regras locais reconhecem UF pela sigla, frente, um termo de busca, CNAE principal explícito e inclusão de enquadramentos possíveis. Com provedor configurado, a interpretação usa a IA e continua limitada aos mesmos campos.

Confira a tabela **Antes / Proposta / Trecho identificado**. Campos não mencionados preservam o valor anterior. Pendências impedem aplicar: reescreva o pedido ou ajuste os filtros do formulário. Faturamento, intenção, várias UFs e exclusões não são filtros executáveis dessa consulta. O termo de busca consulta nome, cidade e CNPJ juntos: `cidade: Campinas` não é convertido em um filtro exclusivo de município. Para aceitar o recorte amplo, escreva `busca: Campinas` e confira os cadastros.

Marque que conferiu a proposta e clique **Aplicar filtros revisados**. O agente salva os critérios e abre **Encontrar empresas**. Execute a pesquisa para receber resultados; a entrega cita a prévia aplicada. Se os filtros mudarem depois da geração da prévia, prepare outra. A aplicação permanece no histórico de auditoria, com controle de versão para evitar sobreposição entre abas.

## Próximas entregas

Ver [Retomada](../RETOMADA-AGENTE.md) e a [matriz B01–B26](../PLANO-EXECUCAO-AGENTE.md). Prioridades: executar o [roteiro com a equipe](aceitacao-piloto.md), escolher provedor/hospedagem, validar dados reais e fechar integrações pendentes. Pacote preparado não significa serviço publicado.
