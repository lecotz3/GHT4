# Plano de ação — acesso às empresas e relações da GHT4

Preparado em 14/09/2026 a partir do caso de uso informado pelo usuário. Este documento planeja a implementação; não declara conectores ativados, relações descobertas ou apresentações realizadas. Piloto proposto: Distribuição e Trading Químico, 50 empresas e 3–5 participantes voluntários. Participantes e ambiente de e-mail/agenda aguardam resposta; o piloto também pode começar com uma única pessoa.

## 1. Como consultar as empresas hoje

A tela antiga **Real · CVM** utiliza as companhias abertas do arquivo CVM. As seis empresas químicas mostradas nessa visão não são o universo cadastral disponível no projeto.

Na interface atual:

1. Abrir o agente em `http://127.0.0.1:5173/#vista=agente` e entrar.
2. Selecionar **+ Novo trabalho** para não reaproveitar filtros de uma pesquisa anterior.
3. Escolher **Encontrar empresas**.
4. Deixar **Nome, cidade ou raiz do CNPJ** e **CNAE principal** vazios; manter **Estado: Todos**.
5. Marcar **Incluir enquadramentos possíveis** e executar **Encontrar empresas**.
6. Percorrer os resultados com **Carregar próximas empresas**; cada página tem 12 registros.

Contagens verificadas diretamente no leitor do catálogo em 14/09/2026, referência cadastral **2026-08**:

| Universo | Quantidade | Onde está disponível |
| --- | ---: | --- |
| Registros do arquivo químico amplo | 38.583 | `data-quimicos.js`; não há explorador unificado de todos esses registros na interface atual |
| Recorte de Distribuição e Trading Químico, incluindo possíveis | 6.165 | Busca do agente com a opção de possíveis marcada |
| Recorte padrão, sem possíveis | 1.613 | Busca do agente sem essa opção |
| Possíveis adicionais | 4.552 | Exigem maior revisão do enquadramento |

Os 38.583 registros são o universo bruto importado para descoberta, não uma lista de empresas confirmadas no segmento nem um censo completo. Os 6.165 são um recorte desse universo. O catálogo operacional hoje fixa Distribuição e Trading Químico; outros subsegmentos não são liberados simplesmente trocando um filtro. A ordenação considera enquadramento cadastral e nome, sem estimar intenção de transação.

**Lacuna a resolver primeiro:** disponibilizar uma tela de catálogo com fonte visível, seletor de setor/subsegmento, total, paginação e exportação da seleção. Explicar a diferença entre universo importado, empresa incluída, possível e excluída, com os motivos. Exibir outros subsegmentos depende de adaptar o catálogo e sua classificação; não substituir dados financeiros desconhecidos por valores ilustrativos.

## 2. Resultado que o agente deve entregar

Pedido diário: “Para estas empresas, quem da GHT4 tem um caminho profissional até uma pessoa que possa avaliar uma conversa sobre M&A?”

A entrega será uma lista de caminhos revisáveis. Para cada empresa: contato relevante, membro da GHT4, intermediário quando houver, cargo/organização, natureza da relação, evidência com data, última confirmação, pendências e próximo passo. Exibir até três caminhos úteis por empresa inicialmente.

Exemplo totalmente fictício:

`Marina (GHT4) → Paulo (ex-colega confirmado) → Renata (diretora da Química Exemplo)`

Se existe evidência de Marina conhecer Paulo, mas não de Paulo conhecer Renata, esse caminho fica **incompleto**. Trabalhar na mesma organização não prova uma relação entre duas pessoas. A tarefa será perguntar a Marina se Paulo é uma via plausível; não declarar que a apresentação está disponível.

O produto precisa diferenciar quatro situações: **rede ainda não consultada**, **nenhum caminho localizado nas fontes consultadas**, **vínculo a confirmar** e **introdução viável confirmada pelo titular**. Ausência de resultado não significa ausência de relacionamento.

## 3. Fontes e forma de obtenção

| Fonte | Entrada proposta | O que permite concluir | Limite |
| --- | --- | --- | --- |
| Contatos selecionados pelos membros | Importação com prévia e seleção do que compartilhar | Contato declarado e seu titular | Pedir confirmação de atualidade e disponibilidade |
| Currículos e histórico profissional autorizados | Formulário ou arquivo específico | Passagem profissional e período | Sobreposição temporal pode sugerir vínculo, sem provar proximidade |
| CRM da GHT4 | Registros permitidos no espaço do usuário | Reuniões, apresentações e relações já registradas | Conversas privadas e mandatos restritos preservam seu escopo |
| LinkedIn pessoal | Arquivo de conexões exportado pelo próprio titular, quando disponível | Conexões de primeiro grau disponíveis naquele arquivo | E-mails podem faltar; não traz a rede completa dos contatos |
| Sales Navigator / TeamLink | Consulta feita pelo usuário no produto, com registro da evidência permitida | Caminhos indicados pela rede da equipe | Assinatura e funcionalidades contratadas precisam ser confirmadas |
| Sites empresariais, biografias, associações e eventos profissionais | Pesquisa pública com URL, data e trecho | Cargo publicado, participação profissional ou vínculo institucional | Cargo pode estar desatualizado; presença conjunta não demonstra amizade |
| E-mail e agenda corporativos | Integração opcional após seleção das contas e definição dos acessos | Recência, frequência e reciprocidade de interações | Mensagem recebida ou convite coletivo não provam relação forte |

O LinkedIn documenta exportação de conexões de primeiro grau e informa que endereços de e-mail podem estar ausentes. O fluxo de exportação passa pelas configurações de privacidade e pelo pedido de cópia dos dados. No projeto, importar somente o arquivo de conexões necessário, sem exigir o arquivo completo com mensagens e outras informações da conta. A disponibilidade e o formato devem ser conferidos com o primeiro participante. [Exportação de conexões](https://www.linkedin.com/help/recruiter/answer/a566336?lang=en-US).

A Connections API depende de aprovação do LinkedIn e não permite percorrer as conexões dos contatos de um usuário. O produto também proíbe automação e scraping não autorizados. Portanto o MVP não depende de robô percorrendo perfis, contornando login ou baixando redes de terceiros. O consentimento do titular, sozinho, não concede acesso técnico a APIs restritas. [Connections API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api), [orientação sobre automação](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions?lang=en).

TeamLink é uma alternativa para a equipe investigar caminhos no próprio LinkedIn; a documentação o associa aos planos Advanced e Advanced Plus. Isso não comprova que a GHT4 possui o plano nem concede ao nosso agente uma API de TeamLink. [TeamLink](https://www.linkedin.com/help/linkedin/answer/a101027/teamlink---overview?lang=en).

Redes sociais adicionais entram apenas quando trouxerem evidência profissional pertinente. Não usar vida familiar, crenças, residência, atributos sensíveis ou contatos obtidos de vazamentos para classificar relações. O objetivo é encontrar apresentações profissionais apropriadas.

## 4. Experiência diária proposta

1. **Escolher empresas:** selecionar uma lista ou oportunidade e clicar **Encontrar caminhos de apresentação**.
2. **Entender a cobertura:** o agente mostra quais fontes e redes foram consultadas, quando foram atualizadas e quais não estão conectadas.
3. **Conferir os caminhos:** cartões com pessoa da GHT4, contato, decisor, evidência e pendências. O usuário pode corrigir a identidade ou indicar que a pessoa saiu da empresa.
4. **Validar com o titular:** o membro confirma “conheço”, “posso avaliar uma apresentação”, “não quero intermediar” ou “informação desatualizada”. Criar uma tarefa interna no agente após solicitação explícita; envio por e-mail/Slack é uma integração separada.
5. **Preparar a abordagem:** gerar rascunho curto para pedir a apresentação e outro para a conversa inicial, usando somente contexto compartilhável. Não expor a tese confidencial ou declarar interesse em venda sem evidência.
6. **Registrar o ocorrido:** apresentação feita, resposta, reunião e próximo passo no CRM. Mensagem redigida não muda a etapa para contato realizado.

Botões e frases devem seguir as tarefas da equipe. A interface não exige que o membro entenda grafos, modelos de IA ou configurações de API.

## 5. Critérios de priorização

Manter três avaliações separadas: **aderência da empresa à tese**, **qualidade do caminho de acesso** e **qualidade/cobertura das evidências**. Uma empresa fácil de contatar não se torna automaticamente um bom prospect de M&A.

No MVP, usar categorias explicáveis em vez de anunciar uma probabilidade estatística de fechar negócio:

| Categoria | Condição |
| --- | --- |
| Introdução viável | Titular confirma a relação e aceita avaliar a apresentação ao contato relevante |
| Relação confirmada | Conhecimento declarado, mas disponibilidade da apresentação ainda pendente |
| Vínculo profissional a confirmar | Evidência de contato, conexão ou possível convivência, sem confirmação suficiente |
| Caminho incompleto | Existe pelo menos uma ligação necessária ainda sem evidência |
| Não localizado / não apurado | Distinguir busca feita sem resultado de rede não consultada |

Dentro de cada categoria, considerar atualidade do cargo, recência e reciprocidade das interações, adequação do contato à decisão e quantidade de intermediários. O caminho herda a fragilidade da ligação menos comprovada. Mesma cidade, mesmo setor, nomes parecidos, participação em grande evento ou amizade presumida não recebem pontuação de relação confirmada.

Não inventar e-mails com base em um padrão de domínio. E-mail ausente pode continuar ausente: uma apresentação pelo membro pode ser viável mesmo sem o agente conhecer o endereço do destinatário.

## 6. Implementação sobre o que já existe

O agente já possui usuários, espaços, oportunidades, tarefas, trilha de auditoria e registros de **Relações** no acervo da oportunidade. Esses registros são manuais e versionados; não constituem um buscador automático da rede inteira. A tela antiga Rede GHT4 e `packages/domain/conexoes.mjs` usam armazenamento local e regras ilustrativas. Seus pesos, correspondências por nome e aproximações de grupo não devem ser promovidos diretamente ao ranking operacional.

Proposta técnica:

- Guardar pessoas, organizações, vínculos e confirmações no Postgres da aplicação. O volume do piloto não exige instalar outro banco específico de grafos.
- Representar identidade, empresa atual, passagens anteriores, período, fonte, titular, finalidade, visibilidade e situação da confirmação separadamente.
- Relacionar a empresa ao CNPJ raiz e domínio verificados. Raiz de CNPJ agrupa matriz/filiais; grupos econômicos com raízes distintas exigem evidência própria.
- Identificar pessoas por combinações de identificadores profissionais e contexto. Nome semelhante gera candidato para revisão, não fusão automática. Manter reversão de uniões incorretas.
- Importar por lote com mapeamento de colunas, prévia, duplicidades, erros, confirmação de campos e possibilidade de retirar o lote. Não assumir esquema fixo do LinkedIn antes de examinar a exportação autorizada.
- Procurar inicialmente caminhos com até duas ligações entre pessoas, seguidas do vínculo do contato com a empresa. Cada ligação precisa de evidência própria; não reconstruir uma suposta rede de segundo grau a partir de uma lista de primeiro grau.
- Aplicar permissões antes de buscar caminhos, calcular totais, enviar contexto para IA e exportar. Uma relação escondida não pode reaparecer no resumo, em contagens ou num caminho indireto.
- Permitir que o titular revise, restrinja ou retire suas relações. A retirada deve invalidar caminhos, resultados em cache e futuras exportações que dependam desses dados.
- Usar o modelo de IA para extrair possíveis vínculos de textos e explicar evidências recuperadas. A identidade final, os acessos, a pontuação e as gravações seguem regras do servidor e revisão humana. A IA não cria relações confirmadas por inferência.

A integração de e-mail/agenda será escolhida depois da resposta sobre o ambiente da GHT4. O objetivo inicial é persistir somente contagens, direção, datas e referências de interações profissionais selecionadas, excluindo corpo de mensagens, anexos e assuntos. Essa minimização não dispensa avaliar os acessos solicitados pelo conector. Microsoft Graph oferece permissões de leitura básica; no Gmail, escopos de metadados são classificados como restritos e as exigências dependem do cenário de implantação. [Microsoft Graph](https://learn.microsoft.com/en-us/graph/permissions-reference), [escopos Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes), [verificação de escopos restritos](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## 7. Sequência de entrega e aceite

As fases são marcos de entrega, não promessas de calendário. Importações reais, credenciais, licenças e validação da equipe condicionam os ensaios correspondentes.

| Ordem | Entrega concreta | Responsabilidade / dependência | Evidência de aceite |
| --- | --- | --- | --- |
| P0 | Catálogo químico acessível, com fonte, subsegmento, contagem e seleção/exportação | Desenvolvimento sobre o arquivo existente e taxonomia | Contagens reconciliadas; empresa fora do piloto identificada corretamente; CVM distinguida do cadastro |
| P1 | Cadastro/importação de contatos, vínculos e titular, com visibilidade | Desenvolvimento + participantes escolhem os dados | Lote importado sem duplicar, homônimos separados, retirada de lote e acesso negado testados |
| P2 | Caminhos diretos e indiretos com fonte e pendências | Desenvolvimento + 50 empresas propostas | Caminhos conferíveis; ligação ausente não vira relacionamento confirmado |
| P3 | Confirmação pelo membro e conexão com tarefas/CRM | Desenvolvimento + teste de uso pela GHT4 | Pessoa encontra e confirma/corrige o vínculo, registra próximo passo e retoma depois |
| P4 | Rascunhos assistidos pelo provedor configurado | Escolha de IA e ensaio com dados permitidos | Texto fiel às fontes e ao escopo; nenhum envio automático |
| P5 | Atualização por e-mail/agenda e fontes profissionais | Ambiente de e-mail, acessos e política definidos | Recência atualiza; respostas automáticas e eventos coletivos não inflacionam a relação; revogação funciona |
| P6 | Uso por mais membros em instalação compartilhada | Hospedagem ainda não escolhida | Duas contas em duas máquinas, permissões, concorrência e recuperação verificadas |

Começar P1 com importações selecionadas permite validar valor antes da integração de caixas de e-mail. P0 e a modelagem de P1 podem avançar sem contas externas. Dados fictícios servem para testes; resultados de negócio exigem as redes reais autorizadas.

## 8. Casos obrigatórios de verificação

Homônimos; pessoa que mudou de empresa; passagem profissional sem sobreposição; vínculo com filial; grupo com CNPJs diferentes; fornecedor compartilhado sem contato pessoal; contato que não deseja intermediar; exportação sem e-mail; mensagem unilateral; resposta automática; reunião cancelada; convite coletivo; pesquisa sem cobertura; membro removido do espaço; lote retirado; fonte desatualizada; arquivo com instruções hostis; correção concorrente; ciclo no caminho e tentativa de revelar relação privada pela IA.

Para o piloto, revisar os caminhos sugeridos e uma amostra das empresas sem resultado, com o titular das relações. Registrar: proporção de empresas com caminho confirmado; falsos vínculos; vínculos conhecidos que o agente não encontrou; tempo total de análise e revisão; introduções aceitas pelo titular; apresentações efetivamente realizadas e reuniões resultantes. Taxas de conversão precisam de período e denominador explícitos. Metas comerciais só serão fixadas após medir a primeira rodada.

## 9. Construir ou aproveitar produtos existentes

A implementação própria integra classificação química, critérios de M&A, rede e CRM no fluxo da GHT4. TeamLink pode complementar a investigação no LinkedIn; Affinity é uma referência de produto que combina interações de e-mail/agenda com caminhos de apresentação. Essas opções precisam de avaliação de cobertura, acesso, integração, exportação, custo e licenciamento antes de contratar. A descrição do fornecedor não substitui ensaio com a rede da boutique. [Affinity: inteligência de relações](https://www.affinity.co/product/relationship-intelligence).

Proposta: validar o fluxo com a base própria e importações selecionadas, comparar uma amostra com TeamLink se a GHT4 já tiver acesso e decidir sobre compra de ferramenta apenas depois. Não foi contratado nem instalado serviço adicional nesta etapa.

## 10. Decisões pendentes e próximo trabalho

Perguntas já encaminhadas: Microsoft 365/Outlook ou Google Workspace/Gmail; participantes e tamanho do piloto. Também será necessário confirmar acesso existente ao Sales Navigator/TeamLink ou CRM, titular de cada fonte e a lista de empresas para a primeira rodada.

Próximo trabalho executável: corrigir a descoberta do catálogo químico (P0) e preparar o contrato de importação/identidade de P1 com dados sintéticos. Antes de processar redes reais, combinar quais campos e relações os participantes disponibilizarão e quem poderá vê-los. Este plano não autoriza buscar contas privadas de terceiros nem enviar mensagens em nome da GHT4.
