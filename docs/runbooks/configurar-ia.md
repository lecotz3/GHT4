# Configurar a IA do agente GHT4

O provedor ainda não foi escolhido pela GHT4. O adaptador OpenAI está implementado como opção, desabilitado por padrão. As tarefas de cadastro, reunião, ações e CRM funcionam sem credencial.

## Ativação pelo operador

1. Avaliar com a boutique o provedor, o modelo, tratamento dos dados e orçamento. Não enviar chaves pelo chat.
2. No arquivo ignorado `server/.env`, configurar `GHT4_IA_PROVEDOR=openai`, `GHT4_IA_MODELO` e `OPENAI_API_KEY`. Escolher um modelo habilitado na conta, compatível com Responses e Structured Outputs para a interpretação dos filtros. Não existe modelo padrão escondido.
3. Ajustar limites: `GHT4_IA_PEDIDOS_USUARIO_DIA=20`, `GHT4_IA_PEDIDOS_DIA=100`, `GHT4_IA_TOKENS_SAIDA=2500`, `GHT4_IA_TIMEOUT_MS=25000` são os padrões. São limites de execução, não um teto monetário garantido. Configurar também o controle de gastos do projeto no provedor.
4. Para pesquisa, habilitar separadamente `GHT4_IA_WEB=1`. Confirmar suporte à ferramenta pelo modelo e direitos de uso das fontes. A pesquisa envia somente a consulta pública escrita no campo; não envia histórico, objetivo salvo ou arquivos.
5. Reiniciar o servidor. Na interface, conferir provedor/modelo e executar uma análise com dados públicos. Conferir as citações de uma pesquisa, a reserva em `ia_execucoes` e o consumo na conta do provedor.

## Comportamento

- “Preparar filtros pelo pedido” envia somente o pedido e os cinco filtros cadastrais vigentes. Objetivo, histórico, documentos e dados do CRM ficam fora dessa chamada. Usa `text.format` com JSON Schema estrito; o servidor valida campos, valores e trechos antes de apresentar uma proposta. Critérios não suportados aparecem como pendências. A pessoa confere a tabela e aplica explicitamente; isso salva os filtros, sem pesquisar. Falhas ou recusas preservam uma prévia por regras locais, identificada na interface. O modelo não aplica critérios diretamente.
- “Conversar com o agente” recebe o pedido, frente, objetivo, empresa selecionada e até quatro tarefas anteriores deste trabalho privado, com limites de tamanho. Não inclui conversas de outros membros.
- “Pesquisar fontes públicas” requer resposta com chamada de pesquisa concluída e ao menos uma citação válida. Fonte sem verificação humana permanece assim identificada. Falha de coleta não significa ausência de fatos.
- As instruções tratam fontes como conteúdo não confiável. O modelo não recebe ferramentas de escrita, shell, SQL, CRM ou envio de mensagens. Essas ações continuam sendo feitas por formulários autenticados.
- As reservas no banco contam chamadas concorrentes e falhas. Pedidos idênticos concluídos reutilizam a resposta; não há repetição automática no provedor. Uma reserva interrompida por reinício permanece consumida e não é reenviada automaticamente. Reabra o trabalho e faça novo pedido se necessário.
- Resposta incompleta, excesso de tamanho, timeout e indisponibilidade preservam o pedido e as evidências. A sessão e os acessos são revalidados depois da chamada.
- O banco registra modelo, tempo, tokens e resultado, com vínculo ao dono e ao trabalho. Não registra a chave do provedor. Os logs não devem capturar corpos nem cabeçalhos de autorização.
- `store:false` desabilita o armazenamento da resposta para recuperação na API; não equivale a uma promessa de retenção zero. Avaliar a política aplicável à conta e ao endpoint.

## Evidência de implementação

`server/tests/provedor.test.mjs` usa provedor simulado: configuração, contrato, contexto, fontes, falhas, concorrência, limites e revogação. `server/tests/interpretacao.test.mjs` cobre contrato estruturado, contexto mínimo, recusa/saída inválida, idempotência, permissão e aplicação concorrente. Não são testes pagos em conta real nem comprovam qualidade comercial das respostas. O ensaio real depende da configuração acima e da revisão da equipe.

Referências oficiais consultadas em 10/09/2026: [Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) e [pesquisa web e citações](https://developers.openai.com/api/docs/guides/tools-web-search).

Contrato de interpretação conferido em 14/09/2026 na documentação de [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). A validação do esquema não comprova que a interpretação é semanticamente correta; por isso a prévia mantém trechos e exige revisão.
