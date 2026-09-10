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

## Acessos da equipe

O administrador encontra **Equipe** no cabeçalho do agente. A tela permite:

1. Criar um espaço por tese, oportunidade ou mandato, restrito aos membros escolhidos.
2. Convidar uma pessoa por nome, e-mail, perfil e espaços autorizados. O agente gera um link de uso único, válido por 48 horas; o administrador copia e compartilha pelo canal adequado. Nenhum e-mail é enviado automaticamente.
3. A pessoa abre o link e define a própria senha, com pelo menos 12 caracteres. O acesso fica vinculado ao e-mail do convite. Quem receber o link poderá utilizá-lo; compartilhe apenas com o destinatário correto.
4. Gerenciar os espaços de cada membro ou suspender e reativar sua conta. A suspensão encerra as sessões abertas; a reativação exige novo login. Ao retirar acesso a um espaço, trabalhos vinculados deixam de ser acessíveis à pessoa, preservando o histórico no banco.

O link completo aparece apenas na criação. Para recuperar um link perdido, gere outro convite com o mesmo e-mail: o anterior será cancelado. Convites pendentes também podem ser cancelados pela tela. Não há convites de administrador nem redefinição de senha nesta entrega.

Os perfis sócio e analista executam tarefas do agente; somente leitura não cria trabalhos. O histórico de cada pessoa permanece privado, mesmo dentro de um espaço comum. Ao voltar da tela de equipe, o trabalho aberto continua na interface e o seletor inclui os novos espaços.

**Uso local:** os links `127.0.0.1` abrem somente no computador que está executando o agente. Esta entrega permite verificar o fluxo de equipe localmente. Para pessoas em máquinas distintas, ainda é necessário implantar o ambiente compartilhado com endereço próprio, HTTPS e operação do banco. Não basta trocar o endereço no link.

## Dados e limites atuais

A busca lê o snapshot local `data-quimicos.js`, referência extraída do arquivo. O classificador existente determina o enquadramento em distribuição química. Registros de enquadramento possível entram apenas quando essa opção é escolhida. Os resultados são ordenados por força do enquadramento e nome, não por probabilidade de venda ou qualidade financeira. Não há busca nova na internet nesta etapa.

Faturamento, intenção de transação, contatos pessoais e inferências de sucessão do arquivo legado não são usados para completar fichas do agente. A ficha de reunião utiliza os dados cadastrais permitidos e perguntas propostas, identificadas como roteiro. As observações digitadas na busca ficam registradas; os filtros explícitos controlam a consulta.

Os trabalhos, mensagens, contexto e ações são gravados no banco com auditoria. As telas da **demonstração** continuam acessíveis separadamente e mantêm seu comportamento anterior; não representam integrações concluídas do agente com todos os módulos.

## Configurar IA posteriormente

O usuário ainda não escolheu o provedor. As tarefas disponíveis funcionam sem LLM e a interface informa essa condição. Não há chave de IA em uso, seleção automática de fornecedor ou transmissão para serviços externos.

O servidor aceita um adaptador assíncrono `redigirIA` na construção de `criarApp(db, { redigirIA })`. O contrato recebe `tarefa`, `pedido`, `contexto`, `evidencias` e `fontes`; deve devolver um texto de até 12.000 caracteres. A resposta é um complemento identificado para revisão e não substitui o resultado estruturado. O adaptador não tem acesso direto ao banco, a funções de escrita ou a conversas de outros usuários.

Antes de habilitar um provedor, implementar o adaptador escolhido com credencial somente no servidor, prazo máximo de execução, limites de custo e envio de dados autorizado. Testar citações, tentativas de instrução em conteúdo e indisponibilidade. O contrato atual tem testes com adaptador simulado; ainda não há integração real ou conversa livre generativa.

## Próximas entregas

Ver `docs/RETOMADA-AGENTE.md` para o checkpoint atual. Próximos blocos: listas revisáveis e oportunidades no CRM persistente; integração do provedor escolhido; pesquisa e enriquecimento com fontes; compartilhamento autorizado. A implantação multiusuário com Postgres, TLS, backup e operação na rede permanece uma etapa própria.
