# Planejamento do agente de M&A da GHT4

Materiais de pesquisa e planejamento produzidos em 10 de setembro de 2026. O piloto mantém Distribuição e Trading Químico e equilíbrio entre mandatos de compra e de venda.

## Ordem de leitura

1. [Diretriz de produto do agente de M&A](DIRETRIZ-PRODUTO-AGENTE-MA.md): orientação mais recente do usuário. O agente deve ser fácil de usar nas tarefas diárias da boutique. Define as consequências para a experiência, a prioridade do backlog e o aceite de usabilidade.
2. [Planejamento de prospecção e requisitos de IA](GHT4%20Planejamento%20de%20Prospeccao%20e%20Requisitos%20de%20IA.docx): documento de 36 páginas com processo, requisitos, arquitetura proposta e backlog B01 a B26.
3. [Pesquisa ampliada](pesquisa-ampliada/GHT4%20Pesquisa%20Ampliada%20de%20Prospeccao%20MA.docx): complemento de 26 páginas, com 44 fontes públicas e duas referências internas, detalhando a aplicação dos achados aos requisitos.

A diretriz de produto é posterior aos arquivos Word. Deve orientar as próximas revisões e decisões de implementação. Os documentos registram propostas e pesquisas; não comprovam funcionalidades implementadas no sistema.

## Conteúdo versionado

- `plano.md` e `plano-parte-2.md`: conteúdo utilizado para gerar cada documento.
- `fontes.json`: referências e links utilizados na pesquisa.
- `criar_documento.py`: geração do Word a partir do template selecionado.
- `renderizar_qa.py`: adaptação da renderização para o ambiente Windows utilizado.
- `artifact.md`: contrato visual e registro do template.
- `qa/`: verificações estruturais, registros de revisão, PDFs e imagens de páginas. Inclui renderizações intermediárias; os arquivos Word indicados acima são as entregas finais.

Os scripts preservam os caminhos do ambiente em que foram executados. A geração depende do template e das bibliotecas locais indicados nos próprios scripts; a renderização usou Microsoft Word e Poppler. Para executar em outro ambiente, ajustar essas dependências antes de gerar novos arquivos e repetir a revisão visual.

Todo o conteúdo da pasta de trabalho original foi copiado para este diretório e conferido por SHA256. A cópia externa foi preservada. Para continuar o trabalho versionado, editar os materiais deste diretório.
