# Evolução visual do agente de relações

> Atualização de 22/09/2026: a navegação e a apresentação foram integradas à nova estrutura do agente e conferidas no navegador em computador e celular. O bloqueio de uso registrado no aceite abaixo é histórico. Consulte [a reformulação completa e suas validações](EVOLUCAO-VISUAL-AGENTE.md).

Entrega local de 21/09/2026, após a preparação do piloto. Mantém a identidade GHT4: branco, preto, laranja e azul funcional, com os tokens de contraste existentes.

## O que mudou

- **Visão geral como entrada:** propósito da rede, quatro indicadores, andamento do reconhecimento e atalhos para as próximas ações.
- **Sugestões a partir dos dados:** organizar participantes sem conta ativa, trazer os primeiros contatos, iniciar uma rodada por empresa e revisar o nível de decisão. São regras explícitas sobre as contagens do banco, sem depender de IA.
- **Indicadores com significado:** relações contadas por par de pessoas ativas, sem duplicar tipos de vínculo; recusas ou informação desatualizada retiram o par dos confirmados. Perguntas respondidas ficam separadas das relações confirmadas e das apresentações disponíveis.
- **Navegação:** menu lateral em telas largas e grade de seções nas estreitas. Cadastro fechado por padrão, busca destacada, iniciais nas pessoas e estados vazios com orientação.
- **Reconhecimento:** seis respostas com explicações, progresso acessível, evidência após a escolha e revisão das respostas. Trocas de membro/empresa descartam respostas de consultas antigas e reiniciam a paginação. Falhas de carregamento não deixam a fila anterior disponível para responder.
- **Importação:** indicação de etapas, área de seleção de arquivo, modelo de colunas para download e separação dos lotes já compartilhados. Trocar um arquivo invalida sua prévia anterior.
- **Interação:** foco visível, títulos e navegação identificados para leitores de tela, movimento curto com respeito à preferência de movimento reduzido.

## Referências e dependências

As decisões de hierarquia, indicadores e estados vazios tomam como referência o [guia de dashboards do 21st.dev](https://docs.21st.dev/blog/react-dashboard-components) e seu [catálogo de dashboards](https://21st.dev/community/components/s/dashboard). A implementação é própria, adaptada aos dados e à paleta do projeto; nenhum componente pago foi copiado.

A busca de plugins por `21st.dev` não retornou integração disponível nesta sessão. Não houve instalação nem conexão ao MCP do 21st.dev. O [Motion](https://motion.dev/docs/react-use-reduced-motion), já presente no projeto, foi usado na entrada da visão geral. Não foram adicionadas dependências, assinaturas ou credenciais. A rede continua operando sem esses serviços externos.

## Aceite

- Aprovados: `npm run ci` (66 testes de domínio/CSV, 177 de servidor, build, lint sem avisos, taxonomia e paleta) e ensaio HTTP de duas contas, incluindo indicadores após importar, confirmar e corrigir a relação. Log local `.cache/verificacao-rede-visual-ci.log`.
- **Pendente: conferência visual desta nova versão em desktop e celular.** A abertura de `http://127.0.0.1:5188` foi impedida pela revisão automática por limite de uso. A versão anterior teve ensaio de navegador, mas isso não comprova a apresentação desta entrega.
- Para retomar a conferência visual: `npm run build` e `node ferramentas/ensaio-rede.mjs --interface`. O ambiente é descartável, com contas sintéticas informadas pelo comando. Conferir visão geral, navegação, cadastro, busca, importação e reconhecimento em 390 px e 1440 px, incluindo teclado e erros de carregamento.
- A entrega ainda precisa de publicação e aceite no ambiente real, conforme [ATIVACAO-REDE-GHT4.md](ATIVACAO-REDE-GHT4.md).

## Sugestões para a próxima rodada com a GHT4

1. Começar pelas empresas prioritárias e por poucos participantes: o progresso geral pode ser pequeno mesmo com boa cobertura do recorte comercial relevante.
2. Registrar a evidência na linguagem de quem tem a relação. Confirmar o cargo e a disposição de apresentar antes da abordagem.
3. No aceite do piloto, observar onde os membros hesitam entre “conheço”, “talvez” e “posso apresentar”; usar esse retorno para ajustar os rótulos e exemplos.

Essas sugestões não exigem novos serviços ou acesso a contas pessoais.
