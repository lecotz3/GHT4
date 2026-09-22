# Ativação do agente de relações

Atualizado em 21/09/2026. Este é o roteiro atual para o fluxo de relações. O código está preparado e foi ensaiado localmente com dados fictícios. A publicação desta entrega, a carga no banco remoto e o aceite com pessoas reais dependem dos acessos e das informações abaixo. Não confundir esse estado com produção homologada.

Evidência atual: CI com build, lint sem avisos, 66 testes de domínio/CSV e 177 de servidor, taxonomia e paleta aprovado. Ensaio HTTP com duas contas aprovado, incluindo os indicadores da nova visão geral. A conferência de navegador anterior validou importação, confirmação e correção negativa; a **nova apresentação visual ainda precisa de conferência no navegador**, bloqueada pela revisão automática por limite de uso. Nenhuma escrita em produção. Detalhes em [EVOLUCAO-VISUAL-REDE.md](EVOLUCAO-VISUAL-REDE.md).

## O que já pode ser operado

- Consultar a visão geral com indicadores da rede, progresso das perguntas e sugestões de próximas ações baseadas nas pendências reais. A navegação separa reconhecimento, importação e cadastros; o formulário de cadastro abre quando necessário.
- Cadastrar pessoas da GHT4 e associar a conta de acesso de cada participante, pela própria tela Rede.
- Importar seleção de contatos em CSV, com escolha das colunas, prévia dos campos, tratamento de nomes repetidos e escolha explícita entre reutilizar um cadastro, manter outra pessoa ou ignorar uma linha. Arquivos de até 2 MB e 500 contatos por lote, com vírgula ou ponto e vírgula; colunas em português ou inglês podem ser mapeadas. O arquivo original fica no navegador; somente os campos escolhidos são enviados ao servidor.
- Registrar fonte, titular e autorização de compartilhamento de cada seleção. Importação cria vínculo a confirmar, nunca disponibilidade automática de apresentação. Cargos importados ficam com nível de decisão a revisar.
- Permitir ao membro, inclusive com papel de analista ou leitura, responder e revisar **apenas suas próprias relações**. Administrador e sócio podem registrar respostas de outros membros, com autoria preservada.
- Corrigir cadastro e cargo, retirar pessoa dos caminhos, revisar vínculos e navegar pela rede com busca e paginação. Não é necessário editar o banco à mão.
- Registrar “não conheço”, “talvez”, “conheço”, “posso apresentar”, “não quero intermediar” e “informação desatualizada”. Uma negativa retira caminhos anteriores daquele par; uma recusa não é contornada por outro tipo de vínculo.
- Procurar caminhos com até duas ligações, com evidência, estado de confirmação e rascunho de abordagem. Nenhuma mensagem é enviada.
- Retirar lotes compartilhados. Vínculos sustentados só pelo lote deixam de participar dos caminhos; cadastros usados por outras fontes e confirmações independentes ficam preservados. O histórico de auditoria permanece. Uma alteração de rede invalida os resultados de acesso salvos no agente e exige nova consulta.
- Importar os dirigentes do quadro societário em transação: ou toda a carga e sua auditoria são confirmadas, ou nenhuma parte fica gravada. A ferramenta recusa banco local implícito e exige conferência do destino remoto.

O sistema distingue quantidade de pessoas cadastradas, respostas recebidas e pares membro–pessoa ainda pendentes. Uma resposta negativa não significa que toda a casa foi consultada. Mesmo uma rodada completa descreve somente o recorte cadastrado.

## O que pedir, e a quem

| Quem fornece | Solicitação | Forma de entrega |
| --- | --- | --- |
| Responsável técnico pela instalação | Acesso de operação ao projeto Vercel existente `leoleal11/ght-4` e ao Supabase correspondente, ou configuração da credencial PostgreSQL válida diretamente no ambiente do operador. Confirmar quem publica e quem responde pela recuperação do banco. | Convite de acesso ou gerenciador de segredos. Não enviar senha/connection string pelo chat, e-mail ou repositório. |
| Patrocinador do piloto | Nome de um responsável e 3–5 participantes iniciais (pode começar com um), com nome, cargo, e-mail corporativo e papel desejado: administrador, sócio, analista ou leitura. | Lista simples. O administrador cria convites na tela Equipe; cada participante define sua própria senha. |
| Patrocinador e donos das relações | Quais contatos, evidências e pessoas podem ser compartilhados com toda a rede interna do piloto; quem autorizou, quando e para qual finalidade. Informar contatos/empresas que não devem ser abordados. | Registro escrito por seleção. Neste piloto, nomes e evidências são visíveis aos usuários da rede; e-mail, telefone e LinkedIn são restritos a administradores/sócios. Não enviar notas ou relações que devam ficar privadas por mandato. |
| Cada participante | Uma seleção de contatos profissionais que pode compartilhar: nome, empresa atual, cargo, CNPJ/raiz quando souber, como conhece, e-mail/telefone/LinkedIn somente se disponíveis e permitidos. | CSV ou preenchimento direto na tela. Cabeçalho sugerido abaixo. Não é preciso preencher todos os campos nem fornecer senha de LinkedIn. |
| Sócios responsáveis pelo foco comercial | Lista inicial de empresas prioritárias, idealmente até 50, com nome e CNPJ quando conhecido, frente de compra/venda, objetivo e restrições de abordagem. | Lista ou seleção das empresas no agente. O catálogo operacional deste piloto mantém Distribuição e Trading Químico. |
| Cada participante | Uma sessão para reconhecer os dirigentes e contatos selecionados, confirmar cargo/empresa, explicar a relação e dizer se aceita avaliar uma apresentação. | Tela Rede → Passada de reconhecimento. Começar por um recorte pequeno e medir o esforço antes de ampliar. |

Os 8.736 dirigentes públicos já estão preparados nesta máquina, referência 2026-08, cobrindo 2.477 empresas. **Não pedir à equipe que reconstrua essa lista.** O recorte de presidentes, diretores e conselheiros segue a decisão registrada em 18/09. O ensaio não gravou esses nomes no banco remoto. Os nomes públicos também não substituem a confirmação das relações pelos membros.

Cabeçalho sugerido para contatos (UTF-8; dados desconhecidos podem ficar em branco):

```csv
Nome,Cargo,Empresa,CNPJ,Email,Telefone,LinkedIn,Evidencia
```

Nome é obrigatório. Empresa ou CNPJ ajuda a localizar a pessoa no alvo; sem organização, a pessoa entra como intermediário. Evidência pode descrever a origem do contato; a proximidade só é confirmada depois. Se a exportação vier do LinkedIn ou de um CRM, escolher somente os contatos autorizados e mapear as colunas na prévia. Não precisamos do arquivo completo da conta, de mensagens, anexos ou agenda pessoal.

## Mensagem pronta para encaminhar

> Estamos preparando o piloto do agente de relações da GHT4. Precisamos indicar um responsável e os participantes iniciais, com nome, cargo, e-mail corporativo e papel de acesso. Cada participante deve selecionar os contatos profissionais que autoriza compartilhar com a equipe, informando nome, empresa, cargo e como conhece; contatos diretos e CNPJ são opcionais. Também precisamos de uma lista inicial de empresas prioritárias e das restrições de abordagem. Depois faremos uma rodada curta na ferramenta para confirmar quem conhece quem e quem aceita avaliar uma apresentação. Não enviem senhas de contas pessoais nem arquivos completos de mensagens. O responsável técnico deve disponibilizar o acesso à hospedagem e a credencial atual do banco por meio protegido.

## Ativação pelo operador, depois de receber os acessos

1. Publicar **esta versão** no projeto Vercel existente, com o banco correto. O build de produção já aplica as migrações; a nova é `0017_ativacao_rede.sql`. Manter uma cópia recuperável do banco antes de aplicar a entrega, conforme a rotina de operação. Não é necessário criar outro projeto ou contratar outro banco.
2. Trazer o ambiente válido para um arquivo ignorado pelo Git, como `server/.env.local`. O guia anterior explica o vínculo do CLI à Vercel. As variáveis aceitas são `POSTGRES_URL` ou `DATABASE_URL`; `DATABASE_URL_DIRETA` é opcional para conexão de sessão. Evitar uma `DATABASE_URL` antiga sobrepondo `POSTGRES_URL` atual. Arquivos `.env.local` precisam ser carregados explicitamente nos comandos abaixo.
3. Conferir sem alterar o banco:

   ```powershell
   node --env-file=server/.env.local ferramentas/verificar-prontidao-rede.mjs --conectar
   ```

   O comando mostra somente destino, contagens e pendências; não imprime credenciais nem nomes. Código de saída 2 significa pendência. Verificar conexão, migrações e administrador antes de importar.

4. Repetir `npm run rede:ensaio`, que apenas conta. Importar usando exatamente o destino sem usuário/senha exibido pelo verificador:

   ```powershell
   node --env-file=server/.env.local ferramentas/importar-quadro-societario.mjs --arquivo=.cache/quadro-societario-2026-08.js --confirmo-a-decisao-lgpd --destino=HOST:PORTA/BANCO
   ```

   Substituir `HOST:PORTA/BANCO` pelo destino conferido. Não usar a connection string nesse argumento. A confirmação remete à decisão de importação registrada no projeto; se o escopo de tratamento tiver mudado, o responsável deve fornecer a decisão atual. O recorte padrão continua estatutário. Na primeira carga esperam-se 8.736 registros; em reexecução, criadas + atualizadas deve totalizar 8.736. A auditoria registra `rede_quadro_societario` e `cargos_estatutarios`.

5. Confirmar login remoto. Retirar variáveis de redefinição de senha ainda presentes na hospedagem depois de verificar o acesso. Criar os convites, cadastrar os membros na Rede e associar cada conta. Importar as seleções, revisar identidades e níveis de decisão, iniciar reconhecimento por empresa.
6. Fazer o aceite com duas contas reais em máquinas diferentes: a conta de membro não deve revisar a rede de outra pessoa; a conta sem acesso a contatos não deve ver e-mail/telefone/LinkedIn; uma apresentação confirmada deve aparecer, a correção “não conheço” deve retirá-la e uma restrição ativa deve bloquear a abordagem. Sair/entrar e confirmar persistência.

Verificação local disponível sem credenciais: `npm run ci`, `npm run test:e2e` (ensaio HTTP completo do fluxo de relações com banco descartável) e `npm run rede:ensaio`. Para repetir o ensaio visual: depois do build, `node ferramentas/ensaio-rede.mjs --interface`; ele usa somente dados fictícios em memória e não chama IA nem produção.

## Limites que permanecem explícitos

- A rede compartilhada do piloto não recebe notas privadas por mandato; dados desse tipo permanecem no acervo com suas permissões específicas. Importar uma lista exige escolha de compartilhamento, não apenas acesso ao arquivo.
- A importação pode reutilizar uma identidade existente após revisão. Ela não funde dois cadastros antigos nem deduz grupos econômicos ou relacionamentos por nome. Para duplicidade antiga, revisar vínculos e retirar o cadastro incorreto; não há fusão automática.
- Busca de caminhos, reconhecimento e rascunhos por roteiro independem da IA. Há configuração local de IA, mas sua presença não comprova crédito/modelo acessível ou configuração remota. Recursos generativos dependem da configuração aprovada pelo operador e do ensaio correspondente.
- Sincronização automática de e-mail/agenda, APIs de LinkedIn/CRM e sugestões por histórico profissional são evoluções separadas. Não são necessárias para operar o fluxo entregue com arquivos selecionados e confirmação dos titulares. Se forem desejadas, pedir depois o provedor corporativo, administrador, contas autorizadas e escopo de compartilhamento; credenciais sozinhas não tornam esses conectores implementados.
- Testes locais não comprovam hospedagem, backup remoto, restauração, capacidade sob carga ou resultados comerciais. Esses aceites precisam do destino real e da equipe.
