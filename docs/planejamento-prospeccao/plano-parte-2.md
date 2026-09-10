## 8 Conexões da rede GHT4

O módulo deve cobrir os membros autorizados de todo o grupo, conforme o documento, preservando acesso por finalidade. A primeira implantação usará currículos, listas e históricos internos autorizados. Notícias e biografias públicas podem sugerir vínculos profissionais a validar; não demonstram amizade, proximidade ou disponibilidade para uma apresentação.[^1]

Uma relação será composta por pessoa de origem, pessoa ou empresa de destino, natureza, instituição, período, fonte, última confirmação, titular do relacionamento, escopo de visibilidade e possibilidade de introdução. A identidade das pessoas precisa ser resolvida com cuidado para evitar homônimos.

### Escala operacional de conexão

| Nível | Interpretação | Efeito no processo |
| --- | --- | --- |
| Não apurado | Rede ainda não consultada | Solicitar verificação; não confundir com ausência |
| Vínculo possível | Coincidência profissional com evidência | Revisão do titular antes de contar como acesso |
| Relação confirmada | Titular confirma conhecer o contato | Elegível para pontuação de acesso |
| Introdução viável | Titular concorda em avaliar apresentação | Criar tarefa interna com prazo |
| Introdução realizada | Apresentação efetivamente feita | Registrar interação e encaminhamento |

Tempo na mesma empresa, participação em conselho ou passagem por uma instituição pode gerar um caminho possível. A ferramenta deve verificar sobreposição temporal e não chamar esse vínculo de relação forte sem confirmação. A pontuação pode considerar senioridade do contato, atualidade e disponibilidade, mas a confirmação do titular tem precedência sobre a inferência automática.

Para pessoas sem permissão de ver detalhes, a interface pode exibir “há uma conexão interna; solicitar ao responsável”, sem revelar nomes, conversas ou a identidade de um cliente confidencial. O membro da rede deve conseguir corrigir, ocultar ou retirar uma relação e indicar assuntos em que não quer intermediar.

O plano não depende de varredura automatizada do LinkedIn. Seus termos proíbem scraping e métodos automatizados não autorizados em hipóteses expressas. Qualquer ampliação para integrações externas deve usar caminho contratualmente permitido e preservar as regras de dados pessoais.[^18]

**Aceite do módulo.** Testar homônimos, períodos sem sobreposição, relação expirada, pessoa desligada, caminho com dois intermediários e acesso negado. Nenhum vínculo inferido poderá aparecer como apresentação confirmada. Todas as conexões usadas no ranking final precisam indicar sua natureza e data de confirmação.

## 9 Valuation reports e notícias

### Valuation com Capital IQ

O documento exige acesso aos dados corretos de comparáveis listadas e transações precedentes, além de revisão e ajustes pelo usuário. Os materiais anteriores da GHT4 indicam acesso web, sem API contratada. A primeira solução será importar exportações autorizadas; acesso à plataforma não implica permissão irrestrita de redistribuição, uso em IA ou automação.[^1][^21]

A S&P apresenta o Capital IQ Pro como plataforma de informações financeiras, transações e screening; a EMIS oferece dados de negócios e exportações em Excel de sua base DealWatch. A disponibilidade desses recursos no produto e contrato específicos da GHT4 deve ser conferida. O passo a passo de Capital IQ mencionado no anexo será transformado em um procedimento validado, com amostra de arquivos e resultado esperado.[^15][^16]

**Comparáveis listadas.** Definir universo econômico antes dos múltiplos. Identificar empresa, código do fornecedor, bolsa, moeda, data da cotação, capitalização, dívida, caixa, participações relevantes e tratamento de arrendamentos. Registrar receita, EBITDA ou EBITA, período fiscal, LTM ou projeção futura, ajustes e origem. Não misturar distribuidor de especialidades e produtor químico sem justificar a comparação.

**Transações precedentes.** Registrar comprador, vendedor, alvo, participação adquirida, anúncio, fechamento, situação do negócio, moeda, preço divulgado, definição de equity value ou enterprise value e dados financeiros correspondentes ao perímetro adquirido. Valores não divulgados permanecem vazios; a existência de notícia de aquisição não autoriza calcular um múltiplo.

**Cálculos e revisão.** O mecanismo de cálculo deve ser determinístico. Como ponte inicial, EV corresponde ao valor do patrimônio acrescido de dívida e outros direitos financeiros pertinentes, menos caixa e ativos não operacionais considerados; cada ajuste precisa de definição consistente. O valor atribuível aos acionistas depende dessa reconciliação e dos termos da transação. Não dividir o preço de uma participação por seu percentual para inferir automaticamente EV de 100%.

EV/EBITDA, EV/EBITA e EV/Receita são métricas distintas. Denominadores negativos ou próximos de zero devem gerar tratamento específico ou “não significativo”, sem contaminar a mediana. Diferenças de arrendamentos podem alterar tanto o valor da firma quanto medidas de resultado; a comparabilidade exige tratamento consistente, como discutido por Damodaran.[^17]

Apresentar mediana, quartis, número de observações válidas, exclusões e justificativas, separando companhias listadas de negócios de controle. Manter moeda e escala explícitas, datas de corte comuns quando apropriado e política para outliers. Em distribuição, verificar receita bruta versus líquida e receita de intermediação, pois modelos contábeis diferentes podem distorcer EV/Receita.

O analista revisa a extração e a seleção; o revisor valida a metodologia. Ajustes geram nova versão, conservando o valor original e a justificativa. O uso de valuation no ranking de segmentos só recebe dados de uma versão identificada e revisada. A ferramenta não deve converter automaticamente múltiplos públicos em preço recomendado para uma empresa fechada.

**Aceite do valuation.** Usar um arquivo real autorizado e conferir 100% dos campos críticos de ao menos dez comparáveis e dez precedentes, quando disponíveis. Se houver menos casos, conferir todos e declarar a amostra. Valores e unidades devem reconciliar; diferenças por arredondamento terão tolerância definida antes do teste. Incluir casos de moeda divergente, participação parcial, dado ausente, EBITDA negativo e empresa fora do perímetro.

### Report de mercado

O report deve começar com a pergunta de negócio, o perímetro e a conclusão, conectando cada análise à originação ou ao mandato. Trends, TAM, SAM, SOM, players, consolidadores, Porter, SWOT e PESTLE continuam obrigatórios, mas cada seção precisa de evidências e implicações específicas. Uma seção sem lastro suficiente deve explicar a lacuna e sua consequência, em vez de preencher o espaço com texto genérico.

**TAM.** Mercado total definido por atividade, geografia, período e métrica. Para distribuição química, explicitar se inclui químicos básicos, especialidades, ingredientes, trading e vendas diretas de fabricantes. Uma estimativa por demanda deve mostrar volumes, preços, canais e exclusões; uma estimativa por empresas deve reconciliar grupos e duplicidades.

**SAM.** Parcela do TAM acessível ao negócio analisado, considerando produtos, aplicações, regiões, canais e restrições relevantes. **SOM.** Parcela que essa empresa pode capturar em um horizonte definido, dadas suas capacidades, recursos e concorrência. SOM não será um percentual arbitrário do TAM nem se confundirá com a parcela de mandatos que a GHT4 espera ganhar.

Para a boutique, criar um bloco separado de oportunidade comercial: quantidade de contas elegíveis, potencial de eventos, capacidade de abordagem e cenários de contratação. A receita de assessoria resulta de escopo e remuneração de mandatos, e não da participação da GHT4 na distribuição de produtos químicos.

**Porter.** Avaliar poder de fornecedores e clientes, rivalidade, entrantes e substitutos, com exemplos por aplicação. **SWOT.** Definir a unidade analisada — empresa, tese ou GHT4 — antes de classificar fatores internos e externos. **PESTLE.** Relacionar fatores políticos, econômicos, sociais, tecnológicos, legais e ambientais a efeitos concretos, responsáveis e datas. Todas as conclusões serão identificadas como fato, interpretação ou hipótese.

O report será exibido no chat e exportado como PDF reproduzível, com sumário, gráficos quando houver dados adequados, fontes próximas às afirmações, data de corte e limitações. O texto do chat e o PDF devem derivar do mesmo artefato de análise, evitando versões com números divergentes.

### News run

Permitir busca por empresa, aliases, grupo, setor, aplicação e período configurável. Registrar título, veículo, link, data de publicação, data do evento, coleta, entidades envolvidas, resumo, categoria e status de verificação. Uma republicação recente de um negócio antigo não é um novo evento.

Deduplicar por evento e manter os diferentes documentos como evidências. Distinguir rumor, intenção, anúncio, aprovação regulatória, fechamento, cancelamento e desinvestimento. Notícias sobre litígios ou problemas operacionais devem conter contexto, fonte e situação, sem converter alegação em fato confirmado.

A saída útil para prospecção combina “o que aconteceu”, “por que importa para esta tese” e “qual ação considerar”. Exemplo: aquisição anunciada por um grupo → revisar possíveis lacunas do portfólio e confirmar se a integração reduz sua capacidade de novas compras. O sistema não deve produzir alerta de urgência só porque encontrou uma palavra associada a M&A.

## 10 Listas de compradores e alvos

O matchmaking parte de um mandato ou hipótese explicitamente definida. Para venda, o perfil do ativo alimenta uma lista de compradores estratégicos e financeiros. Para compra, a tese do cliente alimenta uma lista de alvos. Reaproveitar fatos e pesquisas não dispensa critérios novos nem autoriza compartilhar informações do mandato fora do seu perímetro.

### Perfil mínimo do mandato

Registrar lado da assessoria, empresa cliente, objetivo, aplicações, geografia, porte, participação pretendida, restrições, exclusividade, alvos ou compradores já conhecidos e regras de contato. Quando houver informação confidencial, preparar versões interna completa e externa autorizada. Uma prévia anônima pode reduzir exposição, mas combinações de características ainda podem identificar a empresa e devem ser revistas.

### Critérios da contraparte

| Comprador para um mandato de venda | Alvo para um mandato de compra |
| --- | --- |
| Compatibilidade estratégica e aplicações | Aderência aos requisitos do cliente |
| Portfólio e geografia complementares | Capacidades e ativos desejados |
| Capacidade financeira e de integração | Porte, controle e viabilidade de aquisição |
| Evidência recente de apetite | Disponibilidade a confirmar em contato |
| Conflitos entre representadas e clientes | Dependências que afetam a integração |
| Caminho de acesso e processo decisório | Caminho de acesso aos acionistas |

O ranking de compradores deve permitir incluir organizações fora da base setorial inicial: conglomerados, fundos, plataformas investidas, compradores internacionais e adjacências. Já o ranking de alvos não pode tratar ausência de sinal público de venda como impossibilidade de transação.

Cada linha terá entidade, racional, evidências, restrições, pontuação por dimensão, cobertura, caminho de contato e recomendação de próxima ação. Exibir lista longa, lista curta e excluídos com motivo. O analista propõe; o responsável pelo mandato aprova a lista a utilizar no processo e a sequência de contatos.

**Aceite.** Aplicar duas teses distintas à mesma base e demonstrar que filtros, lista e justificativas mudam de forma coerente. Testar comprador estrangeiro, grupo com várias subsidiárias, investidor com plataforma existente, ativo já adquirido e contato em conflito. A lista deve ser reconstruível com o snapshot e a regra originais.

## 11 CRM e gestão da atividade comercial

### Modelo de pipeline

O CRM deve administrar oportunidades de contratação. A etapa de execução do negócio fica em pipeline próprio após a assinatura do mandato. Separar empresas, pessoas, relações, oportunidades, atividades, propostas e mandatos permite manter várias oportunidades na mesma conta sem duplicar o cadastro ou confundir taxa de conversão.

| Etapa | Evidência de entrada ou avanço | Campos indispensáveis |
| --- | --- | --- |
| Identificada | Conta aderente à pesquisa | Empresa, papel, origem e responsável |
| Qualificada para abordagem | Revisão do dossiê e do plano de acesso | Tese, lacunas, contato e próxima ação |
| Contatada | Contato realmente efetuado | Data, canal, mensagem e destinatário |
| Conversa realizada | Interação substantiva concluída | Participantes, nota, objetivos e próximos passos |
| Oportunidade de mandato | Necessidade e contratação em discussão | Patrocinador, escopo, timing e viabilidade |
| Proposta enviada | Documento aprovado e entregue | Versão, valor, escopo e prazo de retorno |
| Negociação | Ajustes comerciais ou contratuais em curso | Pendências, decisores e data de acompanhamento |
| Mandato assinado | Contrato formalizado | Documento, termos, equipe e passagem à execução |
| Nutrição ou pausa | Interesse futuro ou timing inadequado | Motivo e data ou gatilho de retorno |
| Perdida ou não contatar | Recusa definitiva, conflito ou impedimento | Motivo estruturado e observação específica |

Uma reunião marcada não conta como conversa realizada; uma proposta produzida não conta como enviada; aceite verbal não conta como mandato assinado. A IA pode sugerir atualizações a partir de notas, mas o sistema deve confirmar o evento com a evidência correspondente e guardar autor e horário.

### Agenda e histórico

Cada colaborador terá tarefas por data, prioridade, empresa e oportunidade, com visão de atrasos e substituições. O gestor verá carga por responsável, oportunidades sem próxima ação e concentração por lado, aplicação e estágio. Uma conta em andamento não será abordada por outro membro sem coordenação com seu responsável.

Após cada call, registrar objetivos dos acionistas ou comprador, motivações declaradas, restrições, horizonte, decisão sobre próxima etapa e dúvidas. Resumos automáticos devem ser revistos pelo participante. Gravação e transcrição, se utilizadas, precisam de política própria; notas manuais devem permanecer uma alternativa.

Os motivos de recusa incluirão sem interesse, timing, porte, falta de aderência, assessor já contratado, expectativa de valor, escopo ou honorários, ausência de consenso, restrição do comprador, conflito, contato incorreto e não contatar. Preservar também o comentário específico da conversa. “Sem resposta” será uma categoria separada, sem atribuir ao empresário uma recusa que ele não fez.

### Rotina de gestão

Proposta inicial: revisão individual de agenda em dias úteis; reunião semanal de 45 minutos para oportunidades e bloqueios; calibração quinzenal entre pesquisa e originadores; revisão mensal de desempenho e teses pelos sócios. A reunião semanal deve terminar com decisões, donos e datas. A mensal pode reduzir ou ampliar subsegmentos conforme evidência, sem reescrever o histórico.

O equilíbrio entre compra e venda será acompanhado por horas, contas qualificadas, conversas e propostas, e não apenas por número de leads. Se o time observar demanda maior de um lado, poderá alterar a alocação com justificativa e prazo de revisão. Manter o pedido de equilíbrio como ponto de partida, com transparência sobre desvios.

### Passagem para execução

Ao assinar, gerar um pacote com contrato, escopo, stakeholders, pesquisa validada, premissas de valuation, perfil de compradores ou alvos, contatos já feitos, restrições e pendências. Confirmar o que pode ser reutilizado e quem tem acesso. O pipeline comercial encerra a oportunidade ganha, e o pipeline de mandato inicia a execução; um negócio concluído é outro evento, potencialmente muito posterior.

## 12 Outputs e experiência da ferramenta

### Chat

Toda entrega deve apresentar objetivo entendido, recorte, data de corte, principais resultados, critérios, cobertura, ressalvas que alteram decisões e ações sugeridas. Os números citados devem apontar para fatos ou cálculos rastreáveis. Oferecer comandos para ajustar pesos, comparar versões, aprofundar uma empresa, revisar um dado e exportar a análise.

O usuário poderá interromper uma pesquisa, ver progresso e consultar o que foi concluído, sem confundir resultado parcial com final. Uma falha de fonte deve aparecer como falha de coleta, não como evidência de que o fato ou a empresa não existe.

### Excel

Preservar a matriz pedida: cada subsegmento como coluna e empresas nas linhas correspondentes. A posição vertical em colunas diferentes não implica equivalência entre empresas. Adicionar identificador e um índice remissivo para localizar cada companhia nas abas detalhadas; uma empresa multissegmento pode aparecer em várias colunas e uma única vez no cadastro normalizado.

| Aba | Conteúdo |
| --- | --- |
| Leia me | Objetivo, regras, snapshot, data, definições e responsáveis |
| Mapa por subsegmento | Visão matricial exigida no documento |
| Empresas | Uma linha por entidade, com dados e estados de qualidade |
| Ranking de segmentos | Critérios, pesos, valores, cobertura e posição |
| Ranking de empresas | Papel, contribuições, cobertura, decisão e justificativa |
| Compradores ou alvos | Racional, restrições, acesso e status da lista |
| Valuation | Quadros separados de comps e precedentes, conforme requisito |
| Fontes e evidências | Referências, datas, localização e IDs de fatos |
| Revisões | Mudanças, autores, versões e decisões |

Quando necessário, complementar Valuation com abas detalhadas Comps e Precedentes, mantendo a aba de síntese exigida. Fórmulas devem ser legíveis, referências consistentes e células sem dado permanecerem vazias ou explicitamente classificadas; nunca substituir ausência por zero. Textos importados devem ser tratados como texto, evitando execução acidental de fórmulas de planilha.

### PDF e plataforma

O PDF de mercado terá a mesma versão e corte do chat, fontes junto aos números, paginação e apêndice metodológico. O CRM permanecerá na plataforma, com controle de acesso e auditoria. Exportações respeitarão as permissões de campos e mandatos, inclusive quando um usuário puder ver o ranking mas não a identidade do dono de uma conexão.

**Aceite dos outputs.** Abrir o Excel em leitor compatível, comparar quantidades e valores com o resultado da consulta e conferir fórmulas. Renderizar e revisar o PDF completo. Testar empresas multissegmento, textos longos, fontes sem acesso público, dados ausentes e exportação por um usuário com acesso limitado.

## 13 Arquitetura e requisitos transversais

### Arquitetura funcional

A interface reúne chat, mapas, fichas, rankings, rede, análises, listas e CRM. Uma API controla acesso, consultas, revisões e exportações. Serviços de dados mantêm arquivos originais, fatos canônicos e resultados versionados. Processos de atualização rodam no servidor e registram falhas, custos e tempos. A interface não deve carregar todo o universo empresarial para filtrar no navegador.

O modelo de linguagem interpreta pedidos, propõe classificações e redige análises com fontes. Filtros, cálculos, score, validações e gravações são executados por componentes tipados e verificáveis. Antes de qualquer alteração relevante, a aplicação valida usuário, escopo e regra. Textos de sites, documentos e planilhas são conteúdo para análise, nunca instruções que possam conceder permissões ou ordenar ações.

Começar com um fluxo de IA controlado e ferramentas delimitadas. Dividir o processamento em agentes especializados só se uma avaliação mostrar ganho real de qualidade ou tempo. Não introduzir complexidade de coordenação como condição para entregar o piloto.

### Continuidade e segurança

Definir perfis de administrador, sócio ou revisor, analista e colaborador da rede, além da participação em cada mandato. Restringir também por campo quando houver relação pessoal ou informação do cliente. A autorização precisa alcançar busca semântica, histórico, exportações, cache e contexto entregue ao modelo; esconder uma informação na tela não é suficiente.

Prever criptografia em trânsito e em armazenamento, gestão de credenciais no servidor, registro de acessos relevantes, backup e teste de restauração. Separar desenvolvimento e produção. Dados reais sensíveis não devem circular em demonstrações ou logs de diagnóstico. O contrato do fornecedor de IA deve definir retenção, uso de conteúdo, subprocessadores e região de processamento, sem presumir garantias universais entre produtos.

Para dados pessoais de sócios, executivos e membros da rede, documentar finalidade, necessidade, base legal e salvaguardas. O guia da ANPD sobre legítimo interesse propõe análise de finalidade, necessidade e balanceamento; dados publicados na internet não dispensam essa avaliação. Prever canal de correção, oposição quando aplicável, bloqueio de contato e prazo de retenção por classe de dado.[^22]

Transferências internacionais exigem avaliação do mecanismo aplicável e dos instrumentos contratuais. A Resolução CD/ANPD 19/2024 estabelece o regulamento e cláusulas-padrão. A implantação deve ser conferida pelo responsável jurídico ou de privacidade à luz do contrato e da norma vigente; esta especificação define tarefas de produto e governança, sem escolher antecipadamente uma base legal para todo tratamento.[^23]

O histórico técnico será preservado conforme a política de retenção; “append-only” não significa conservar dados pessoais indefinidamente. Exclusão, anonimização ou restrição legalmente necessária deve alcançar índices e cópias derivadas, com procedimento de backup e trilha mínima compatíveis com a política aprovada.

### Atualização proposta

| Informação | Cadência inicial | Regra para usar em decisão |
| --- | --- | --- |
| Cadastro empresarial | Cada publicação da fonte, com rotina mensal como referência | Mostrar data do snapshot e reconciliar diferenças |
| Atividade e portfólio | Trimestral na coorte; sob demanda no restante | Rever antes de uma abordagem relevante |
| Notícias | Dias úteis para contas ativas; semanal para setor | Registrar evento e publicação separadamente |
| Dados financeiros | A cada nova divulgação ou exportação autorizada | Preservar exercício, período e perímetro |
| Comps | No início da análise e antes de circular versão final | Data de mercado explícita e revisão |
| Precedentes | Atualização mensal e antes de concluir pesquisa | Distinguir anúncio, fechamento e cancelamento |
| Conexões | Confirmação semestral como hipótese e antes de introdução | A vontade do titular prevalece |
| CRM | Após interação, preferencialmente em até um dia útil | Evento comprovado e próxima ação |

Essas frequências são propostas de serviço, sujeitas à disponibilidade das fontes e ao custo. Se a atualização falhar, o sistema mantém o dado anterior com seu corte e sinaliza a defasagem. Não exibir a data de uma nova consulta como se fosse a data do dado financeiro.

## 14 Implantação em 16 semanas

### Premissas de capacidade

O plano pressupõe um sócio patrocinador com cerca de duas horas semanais para decisões, um responsável de produto ou operação por quatro a seis horas semanais, um analista dedicado ao piloto, dois originadores com blocos regulares de agenda e capacidade técnica combinando aplicação, dados e IA. Como referência de esforço, considerar dois profissionais técnicos equivalentes em tempo integral durante a construção, com participação pontual de segurança e privacidade. Esses papéis não representam contratações ou disponibilidade já confirmadas.

Com uma única pessoa técnica ou um analista dividido entre muitos mandatos, reduzir o escopo simultâneo e reestimar o prazo. A sequência de dependências é mais importante que o calendário: dados e definições precisam estar prontos antes de afirmar que o ranking ou valuation foi entregue.

### Fases e pontos de decisão

| Fase | Janela | Entrega central | Condição para avançar |
| --- | --- | --- | --- |
| 0 Diagnóstico e critérios | Semana 1 | Aderência real, tese, amostras, responsáveis e acessos | Escopo e critérios do piloto registrados |
| 1 Universo e fichas | Semanas 2 a 4 | Base reconciliada e coorte enriquecida | Dados críticos verificáveis e lacunas classificadas |
| 2 Ranking e linguagem natural | Semanas 5 a 6 | Templates por papel e regras editáveis | Testes de ranking e interpretação aprovados |
| 3 Rede e rotina comercial | Semanas 7 a 8 | Conexões confirmadas e CRM operacional | Agenda ativa, permissões e histórico confiáveis |
| 4 Análises e matchmaking | Semanas 9 a 12 | Valuation, report, notícias e listas | Reconciliação de dados e revisão do negócio |
| 5 Integração e adoção | Semanas 13 a 16 | Fluxo completo, treinamento e monitoramento | Critérios de qualidade e continuidade atendidos |
| 6 Validação econômica | Até 180 dias | Revisão de conversões e custos por coorte | Decisão de escala, ajuste ou suspensão |

Uma rotina comercial manual assistida pode começar na fase 1 assim que houver fichas revisadas e um registro de atividades disponível. Não é preciso esperar todo o produto ficar pronto para aprender com conversas; cada contato precisa, entretanto, cumprir o controle de acesso, a revisão e a responsabilidade comercial.

### Primeiros dez dias úteis

- Dia 1: designar patrocinador e dono do produto; confirmar piloto, lados comerciais e equipe disponível.
- Dias 2 e 3: percorrer o fluxo atual com um analista e um originador; registrar tempos, retrabalhos, CRM em uso e fontes contratadas.
- Dias 3 e 4: conferir os módulos existentes com cenários reais; separar disponível, parcial, não integrado e não demonstrado.
- Dias 4 e 5: selecionar amostras de exportação, modelos de report e material autorizado da rede; definir o catálogo de fontes e permissões.
- Dias 5 a 7: ratificar a taxonomia e construir o conjunto de referência para classificação e ranking.
- Dias 7 a 9: resolver identidade e produzir as primeiras fichas revisadas, com fila de dados faltantes.
- Dia 10: revisar o primeiro lote, ajustar critérios e definir contas, responsáveis e datas do primeiro ciclo de abordagem.

### Backlog com entregas verificáveis

P0 significa condição para operar o piloto com dados confiáveis; P1 completa o escopo do documento; P2 amplia eficiência e escala. As estimativas de fase pressupõem reaproveitamento do que for validado na aplicação atual.

| ID | Prioridade | Entrega | Dono funcional | Dependência |
| --- | --- | --- | --- | --- |
| B01 | P0 | Diagnóstico demonstrado por requisito | Produto | Acesso ao ambiente |
| B02 | P0 | Tese e taxonomia ratificadas | Sócio e analista | B01 |
| B03 | P0 | Catálogo de fontes e direitos de uso | Produto e privacidade | Amostras e contratos |
| B04 | P0 | Importação com reconciliação e histórico | Dados | B03 |
| B05 | P0 | Identidade empresa filial e grupo | Dados e analista | B04 |
| B06 | P0 | Classificação econômica e evidências | Analista | B02 e B05 |
| B07 | P0 | Enriquecimento de porte e controle | Analista | B06 e fontes |
| B08 | P0 | Ficha e estados de qualidade por campo | Produto | B05 a B07 |
| B09 | P0 | Amostra de referência por papel | Sócios | B08 |
| B10 | P0 | Ranking cobertura e explicações | Produto e analista | B09 |
| B11 | P1 | Prompt para regra com prévia e validação | Produto e IA | B10 |
| B12 | P1 | Templates e comparação de versões | Produto | B10 |
| B13 | P0 | Rede autorizada e confirmação de vínculos | Donos das relações | B03 e B05 |
| B14 | P0 | CRM agenda responsáveis e motivos | Operação comercial | Modelo de funil |
| B15 | P0 | Plano de abordagem e revisão de contas | Originadores | B08 e B14 |
| B16 | P1 | Importação validada de comps e precedentes | Analista e revisor | Arquivos Capital IQ |
| B17 | P1 | Ranking de subsegmentos com dados reais | Analista | B06 e B16 |
| B18 | P1 | News run por evento e período | Analista e dados | B03 e B05 |
| B19 | P1 | Report com metodologia e fontes | Analista e revisor | B16 a B18 |
| B20 | P1 | Matchmaking com critérios de mandato | Sócio e analista | B10 e perfil |
| B21 | P1 | Chat Excel e PDF consistentes | Produto | B10 e B16 a B20 |
| B22 | P0 | Permissões ponta a ponta e auditoria | Tecnologia | Matriz de acesso |
| B23 | P0 | Backup recuperação e suporte | Tecnologia | Ambiente operacional |
| B24 | P1 | Painel de qualidade custo e conversão | Produto e gestão | B14 e eventos |
| B25 | P1 | Homologação completa e treinamento | Produto e usuários | B01 a B24 |
| B26 | P2 | Sincronizações e escala adicionais | Produto | Evidência do piloto |

B22 e B23 devem acompanhar todas as fases, com profundidade proporcional à implantação; não ficam para depois do uso de dados confidenciais. B16 pode exigir trabalho de preparação já na primeira semana, mesmo que o módulo seja entregue mais adiante.

## 15 Critérios de sucesso e economia

### Medidas de qualidade e adoção

Os valores abaixo são metas iniciais propostas. A medição da primeira semana fornece o baseline real, hoje não estabelecido neste plano. Os sócios devem aprovar ou ajustar limites antes de utilizá-los como critério contratual de aceite.

| Medida | Definição | Meta inicial proposta |
| --- | --- | --- |
| Identidade correta | Entidades corretamente resolvidas / entidades auditadas | Ao menos 95%; nenhum erro crítico na lista de abordagem |
| Precisão da seleção | Contas consideradas aderentes / contas do top 20 por papel | Ao menos 80%, com julgamento registrado |
| Rastreabilidade crítica | Afirmações críticas com evidência / afirmações críticas usadas | 100% nos outputs aprovados |
| Cobertura para ação | Peso conhecido / peso total da regra | Ao menos 70% e critérios obrigatórios resolvidos |
| Interpretação de prompts | Regras semanticamente corretas / conjunto de testes | Ao menos 90%; nenhuma violação de filtro obrigatório |
| Valuation | Reconciliação dos campos críticos auditados | 100%, respeitado arredondamento previamente definido |
| Registro comercial | Oportunidades ativas com dono e próxima ação / ativas | 100% |
| Tempo de dossiê | Mediana do tempo até ficha revisada | Redução de 30% ante baseline, sem perda de qualidade |
| Uso pelo time | Usuários previstos com atividade útil semanal / previstos | Ao menos 80% durante quatro semanas |
| Permissões | Vazamentos em cenários de acesso indevido testados | Zero nos testes de liberação |

Testes devem incluir número e descrição dos casos. Zero falhas numa amostra não prova ausência de vulnerabilidades. Priorizar cenários de impacto: vazamento entre mandatos, conexão revelada sem permissão, múltiplo incorreto, empresa errada e contato após bloqueio.

### Indicadores comerciais por lado

Medir contas únicas abordadas, apresentações solicitadas e realizadas, respostas substantivas, conversas realizadas, oportunidades qualificadas, propostas enviadas, mandatos assinados, tempo por etapa, motivos de perda e horas investidas. Usar oportunidades, não mensagens, como unidade do funil; separar empresas e pessoas para evitar dupla contagem.

Conversão de abordagem para conversa = contas com conversa realizada / contas abordadas da mesma coorte. Conversão de conversa para proposta = oportunidades com proposta enviada / oportunidades com conversa realizada. Conversão de proposta para mandato = mandatos assinados / propostas enviadas. Comparar apenas coortes com tempo suficiente de observação, e mostrar oportunidades ainda abertas.

O painel distingue canal de origem, influência posterior de uma conexão e responsável atual. Comparar compra e venda separadamente. Mandatos recorrentes de compradores não devem distorcer a análise de quantas contas novas foram conquistadas.

### Capacidade e orçamento

O orçamento deve separar implantação, esforço interno e operação recorrente. A proposta de capacidade técnica corresponde, ilustrativamente, a 2 profissionais × 16 semanas × 40 horas = 1.280 horas. Aplicar a taxa efetivamente cotada; somar analista, produto, revisores, treinamento e serviços pontuais. Essa conta dimensiona esforço, não estima preço de mercado.

Custo recorrente = infraestrutura + consumo de IA + armazenamento + manutenção + licenças incrementais + horas de operação. Registrar também os custos totais das assinaturas quando forem avaliadas alternativas de solução. Contratos já existentes podem não aumentar o caixa do piloto, mas continuam relevantes para o custo total de propriedade.

Uma avaliação econômica conservadora usa duas linhas separadas. Benefício de produtividade = horas efetivamente poupadas × custo ou valor da capacidade reaproveitada. Benefício comercial = margem de contribuição incremental de mandatos atribuível ao processo. Não contar a mesma hora poupada simultaneamente como redução de folha e capacidade comercial adicional sem demonstrar o efeito.

Para estimar receita de um mandato, separar remuneração fixa efetivamente contratada, honorários de sucesso condicionados à conclusão e despesas reembolsáveis. O valor de uma transação potencial não é receita da boutique, e pipeline ponderado não é caixa. Probabilidades de fechamento devem ser calibradas por histórico e etapa, com cenários quando não houver histórico suficiente.

### Decisões de continuidade

Na semana 4, avançar se o piloto produz fichas confiáveis e o time consegue utilizá-las para selecionar contas; caso contrário, corrigir fonte, taxonomia ou esforço de enriquecimento. Na semana 8, revisar qualidade da lista e execução da agenda. Na semana 16, decidir sobre operação regular com evidência de qualidade, adoção, custo e segurança. Até 180 dias, revisar conversões, mandatos e viabilidade econômica sem exigir que todas as transações já tenham sido concluídas.

Ampliar para outro subsegmento só quando o processo atual puder ser reproduzido por mais de um analista, os outputs forem auditáveis e o custo de atualização for conhecido. Suspender expansão se falta de dados, baixa aderência das listas ou ausência de execução comercial impedir avaliação do resultado.

## 16 Riscos e decisões ainda necessárias

| Risco concreto | Sinal de alerta | Resposta prevista |
| --- | --- | --- |
| Dados privados insuficientes | Porte e controle faltam na maioria da coorte | Testar cobertura dos fornecedores e enriquecer seletivamente |
| Ranking reflete preferências frágeis | Mudanças pequenas alteram todo o topo | Calibrar, mostrar contribuições e testar sensibilidade |
| Viés de empresas conhecidas | Rede domina e oportunidades novas somem | Reservar amostra exploratória e medir por canal |
| Falta de uso comercial | Boas listas não viram tarefas ou conversas | Responsável, agenda e revisão semanal |
| Compartilhamento indevido | Dados aparecem fora do mandato ou finalidade | Permissões no servidor, testes e trilha de exportação |
| Licença incompatível | Exportação ou uso em IA não permitido | Adequar método e contrato; usar fontes autorizadas |
| Dependência de uma pessoa | Conhecimento e CRM ficam locais | Procedimentos, dados compartilhados e substituição |
| Escopo excessivo | Relatórios sofisticados atrasam aprendizado | Proteger a sequência do piloto e critérios de fase |
| Conflito de interesses | Comprador e vendedor disputam uso da informação | Revisão pelos sócios antes do contato ou mandato |

### Perguntas para a reunião de abertura

O foco setorial e o equilíbrio entre compra e venda já estão definidos. Restam decisões que refinam a execução: faixa de receita e valor de transação desejados; regiões e aplicações prioritárias; aceitação de situações especiais; equipe disponível; CRM e agenda usados hoje; acessos e direitos efetivos de EMIS e Capital IQ; material da rede autorizado; responsabilidade por privacidade e manutenção; teto de investimento e economia mínima de um mandato.

Também será necessário definir como os sócios avaliarão uma boa oportunidade: urgência, alinhamento acionário, capacidade de contratar, tamanho, margem potencial do mandato ou valor estratégico da relação. Essas escolhas serão registradas em templates e critérios de aceite. Não impedem o planejamento, mas influenciam a calibragem e a contratação da implementação.

## 17 Matriz de rastreabilidade dos requisitos

Esta matriz permite verificar cobertura sem usar a existência de uma tela como evidência de entrega. Cada requisito deve ser demonstrado com dados autorizados, resultado reproduzível e avaliação de um usuário do negócio.

| Documento original | Adaptação neste planejamento | Evidência de aceite |
| --- | --- | --- |
| 1 Contexto e objetivo | Seções 1 a 4 e 15 | Funis por lado e objetivo mensurável |
| 2 Mapeamento de mercado | Seções 5 e 6 | Taxonomia, empresas únicas, cobertura e lacunas |
| 3 Ranking de subsegmentos | Seções 7 e 9 | Critérios do documento, pesos e fontes por indicador |
| 4.1 Critérios base | Seções 5 a 7 | Atividade, porte, estrutura e conexão verificáveis |
| 4.2 Critérios ad hoc | Seção 7 | Prompt convertido em regra visível e testada |
| 4.3 Templates | Seções 7 e 14 | Salvar, reutilizar e comparar versões |
| 5 Rede do grupo | Seção 8 | Caminhos confirmados e acesso por finalidade |
| 6.1 Valuation | Seção 9 | Export real reconciliado e ajustes auditáveis |
| 6.2 Report | Seções 5 e 9 | Trends, TAM SAM SOM, players, Porter, SWOT e PESTLE |
| 6.3 News run | Seção 9 | Período configurável, deduplicação e eventos datados |
| 7 Compradores e vendedores | Seção 10 | Listas por mandato, regras próprias e revisão |
| 8 CRM e pipeline | Seções 4 e 11 | Agenda, calls, recusas, propostas e assinatura |
| 9 Formatos de saída | Seção 12 | Chat, matriz Excel, valuation e PDF conferidos |
| 10 Fontes de dados | Seções 6 e 13 | Catálogo, direito de uso, fonte e data por fato |
| 11 Atualização | Seção 13 | Cadências, histórico e falhas visíveis |
| 12 Configurabilidade | Seção 7 | Filtros e pesos sem reprogramação |
| 12 Revisão humana | Seções 7 a 11 | Correção com escopo, autor e versão |
| 12 Integração | Seções 6 e 10 a 13 | Mesma empresa e evidência ao longo do fluxo |
| 12 Confidencialidade | Seções 8 e 13 | Testes de acesso em tela, busca, IA e exportação |

### Cenário completo de homologação

Um analista seleciona distribuição de ingredientes, importa dados autorizados, resolve duplicidades e delimita o subsegmento. Pede um ranking de potenciais vendedores com foco em diversificação e acesso pela rede, revisa a interpretação e obtém lista com cobertura e evidências. O titular confirma uma conexão; o originador conduz o contato e registra a conversa e seus próximos passos.

Em paralelo, outro originador qualifica uma conta compradora com interesse em ampliar aplicações no Brasil, registra tese e processo decisório e prepara uma proposta buy-side. A mesma base permite gerar uma lista de alvos sob critérios desse comprador, sem expor os dados da oportunidade sell-side nem misturar responsabilidades comerciais.

Após um mandato ser formalizado, o time reutiliza as informações permitidas, gera comps e precedentes revisados, um report de mercado e uma lista de contrapartes. O Excel e o PDF correspondem ao resultado do chat. Um revisor consegue voltar de uma conclusão à fonte e reconstruir a análise. Um usuário de outro mandato não consegue acessar os documentos ou conexões restritos.

## 18 Fontes e referências

As datas de acesso das fontes públicas correspondem a 10 de setembro de 2026. Datas de publicação e período das informações são mantidos separadamente. Anúncios históricos foram usados para identificar critérios de mercado; nenhuma referência, isoladamente, comprova interesse atual de um comprador ou disponibilidade de um vendedor. Pesos, metas, cadências, volumes e prazos identificados como propostas são recomendações deste planejamento.

{{SOURCES}}
