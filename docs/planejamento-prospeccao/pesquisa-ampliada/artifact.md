# Contrato de criação do documento

Referência imutável: C:/Users/Leonardo/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.1/skills/artifact-template-strategy-memorandum/assets/reference.docx
SHA256: 13bd3ae7aef4b3ae76c5d65200acd654c922782974dac18672e973fad93bd453.
Referência renderizada pelo Word local em qa/template/reference.pdf, 10 páginas, todas inspecionadas. O renderizador canônico falhou por ausência de LibreOffice; conversão nativa via Word foi bem-sucedida. PNGs produzidos pelo Poppler do runtime.

Uma seção retrato Letter 12240 x 15840 twips; margens 1440; distâncias cabeçalho 705 e rodapé 708; uma coluna. Preservar sectPr, styles, numbering, theme, fontes incorporadas e relações não editáveis. Inventário integral em qa/template-inventory.json.

Padrões de origem: capa com Title 36 pt negrito azul 112075, centralizado, espaçamento 280/160; Heading1 15 pt azul, 280/160; Heading2 azul negrito, 200/100; corpo Helvetica Neue herdado com espaçamento após 120 e entrelinha 276, justificado. Tabelas da referência possuem cabeçalho azul 112075, texto branco 10pt, bordas BFBFBF, linhas alternadas brancas e F2F5FA; células margens verticais 60 e horizontais 110, alinhadas ao centro vertical, sem altura fixa; cabeçalho repetido. Reutilizar padrões, ajustando larguras ao texto em 9360 twips totais. Rodapé PAGE/NUMPAGES; cabeçalho com linha azul e identificação.

Slots editáveis: word/document.xml, corpo completo. Substituir placeholders e clonar padrões de título, corpo, subtítulos, listas e tabelas para o relatório extenso solicitado. A tabela de metadados da capa permanece como componente; traduzir rótulos e preencher assunto, destinatários, corte e versão. Remover imagens ilustrativas vazias e parágrafos de preenchimento; as duas imagens permanecem como partes preservadas sem uso. Remover página vazia e quebras artificiais do exemplo; paginação contínua com quebras explícitas nos capítulos de maior porte. O crescimento de conteúdo e o número de páginas são esperados.

word/header1.xml e word/footer1.xml: traduzir apenas textos de cabeçalho, confidencialidade e 'of'; preservar desenho e campos. word/settings.xml: atualizar campos ao abrir. word/footnotes.xml: preservar separadores e acrescentar notas numeradas, com links e dados bibliográficos. word/_rels/footnotes.xml.rels: criar para URLs citadas. docProps/core.xml: metadados do novo relatório sem atribuição fictícia. Todos os demais componentes são preserve-only e devem ter hash idêntico.

Não usar parágrafos vazios para simular páginas. Manter títulos com o próximo parágrafo e linhas de tabela sem corte. Inspecionar cada PNG final, verificar notas e campos, comparar inventário e geometria. Nenhum placeholder de template pode sobreviver. O original de requisitos e a referência permanecem intactos.


## Pesquisa ampliada
Reutiliza a mesma referência imutável e o mesmo sistema de estilos já selecionado. O conteúdo é um memorando complementar de pesquisa, com 14 seções, matriz de refinamentos B01 a B26, 46 referências e notas vinculadas. O arquivo anterior é preservado. A conversão pelo Word e a rasterização canônica seguem o procedimento validado no documento anterior.
