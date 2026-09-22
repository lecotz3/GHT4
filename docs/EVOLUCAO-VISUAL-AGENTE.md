# Nova experiência do agente — 22/09/2026

Reformulação de todas as áreas operacionais: entrada, início, trabalhos, relacionamentos, oportunidades, equipe e ajuda. A implementação usa React e os componentes existentes, sem adicionar dependências ou exigir credenciais novas.

## Organização e aparência

- Menu principal permanente no computador e recolhível no celular. É possível trocar diretamente entre os módulos.
- Início com três ações: encontrar empresas, abrir um caminho e preparar reunião. Trabalhos recentes e acesso à rede completam a página.
- Identidade comum: navegação escura, superfícies claras, laranja da GHT4, azul funcional, ícones, espaçamento e hierarquia de texto.
- Guia “Como usar o agente” com o percurso de pesquisa, reconhecimento e oportunidade, além de respostas às dúvidas iniciais.
- Formulários, filtros e históricos secundários ficam recolhidos até serem necessários. Restrições e limites relevantes permanecem expostos.

## Interações corrigidas

- Escolher uma tarefa abre o formulário correspondente e posiciona o foco. As oito tarefas continuam disponíveis em um seletor.
- Reunião e mapa de acesso permitem buscar e selecionar a empresa na própria tarefa; não exigem voltar à pesquisa para liberar o botão.
- Ação indisponível informa o requisito ausente: empresa, texto mínimo, perfil ou configuração de IA/web.
- Resultados e lista de empresas em análise têm navegação própria. “Revisar empresa” abre a revisão; a última resposta fica expandida e as anteriores, recolhidas.
- Oportunidades mostram o próximo passo e o prazo antes dos formulários. Acompanhamento, atividade, documentos e histórico ficam em áreas separadas.
- Salvar atividade ou acompanhamento apresenta uma confirmação visível e dispensável. O registro continua disponível no histórico.
- Equipe separa membros, inclusão/convite, espaços, conta e operação. Os formulários mantêm o rascunho ao trocar de área dentro da página.
- Importação explica o que falta para conferir a prévia. A terceira etapa só é indicada após a resposta da prévia; revisão e confirmação continuam obrigatórias.
- Reconhecimento explica o mínimo de evidência necessário para salvar uma resposta positiva.
- Foco de teclado visível, atalho para o conteúdo sem alterar a rota, controles identificados e preferência por movimento reduzido respeitada. Documento em português brasileiro.

## Verificação realizada

Em banco descartável PGlite, com contas, empresa e dirigente fictícios; sem consultas de IA e sem dados de produção:

- **248 testes aprovados:** 71 de domínio/interface pura e 177 de servidor. Os cinco novos testes cobrem disponibilidade das tarefas e orientações para requisitos ausentes.
- Build TypeScript/Vite e lint aprovados; taxonomia e paleta aprovadas na validação offline.
- Ensaio HTTP aprovado: login, importação, resposta pelo titular, indicadores, correção e retirada do lote.
- Navegador: entrada; pesquisa → revisão → priorização → criação de oportunidade; atividade e acompanhamento salvos com confirmação; abas de documentos/histórico; busca direta de empresa → mapa → roteiro de reunião; indisponibilidade de IA explicada; navegação da equipe; guia; resposta de reconhecimento salva e progresso atualizado; orientação da importação.
- Apresentação conferida em 1440 × 900 e 390 × 844, além da janela padrão. Início, rede e importação conferidos sem transbordamento horizontal no celular. Menu móvel abre e recolhe após navegar.
- Teclado: o atalho leva o foco ao conteúdo e preserva `#vista=agente`. Nenhum aviso ou erro de console capturado na conferência final.
- Capturas locais, fora do Git: `.cache/visual-agente/inicio-desktop.png` e `.cache/visual-agente/inicio-celular.png`.

Para repetir: `npm run build`, depois `node ferramentas/ensaio-rede.mjs --interface`. As contas de ensaio são informadas pelo comando. Reinicie esse servidor depois de uma nova compilação: a lista de arquivos estáticos é montada na inicialização.

Esta conferência substitui a pendência de navegação bloqueada por limite de uso registrada na entrega visual de 21/09. O aceite com os participantes reais continua no roteiro de ativação.

## Catálogo químico real e publicação

O início consulta a mesma API autenticada usada pelas pesquisas. Exibe a origem, referência e tamanho do recorte retornados pelo catálogo; os números não são fixados na interface. A explicação recolhível distingue a base química de origem do recorte operacional e ensina a ampliar a pesquisa.

Base incorporada: Receita Federal/CNPJ, referência **2026-08**, **38.583 registros**. O recorte de distribuição e trading químico contém **1.613 empresas**, ou **6.165** ao incluir enquadramentos possíveis. Os dados cadastrais não comprovam faturamento, interesse em transação ou relações pessoais dos membros.

`npm run test:catalogo-real` importa a base completa em PostgreSQL PGlite descartável, usa o adaptador SQL da aplicação e confere carga idempotente, metadados, autenticação, filtros por nome/UF, paginação e pesquisa salva retomada após novo login. Para a interface: `npm run build` e `node ferramentas/ensaio-catalogo-real.mjs --interface`. Somente a conta de acesso e os trabalhos do ensaio são fictícios; as empresas são as do arquivo real.

Verificação adicional em 22/09: ensaio completo aprovado, novo `npm run ci` com 248 testes aprovado e pesquisa da Adequim Comercial Quimica do Brasil Ltda. conferida no navegador, inclusive no celular sem transbordamento horizontal.

A produção usa `criarCatalogoBanco` no Supabase. O build da Vercel prepara o catálogo de forma idempotente; não usa a conta nem o banco de ensaio. Destino existente: projeto `leoleal11/ght-4`, domínio `ght-4.vercel.app`, branch `main`. O estado Ready e o commit ativo devem ser conferidos no painel após cada push; veja [o procedimento de publicação](runbooks/deploy-vercel-agente.md).
