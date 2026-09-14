# Execução do agente de M&A da GHT4

Atualização: 14/09/2026. Piloto confirmado: **Distribuição e Trading Químico**, equilibrando mandatos de compra e venda. Esta matriz distingue implementação, configuração e aceitação pela GHT4. O plano completo ainda não está homologado.

## Fluxo operacional disponível

O membro entra, retoma um trabalho, pesquisa o cadastro com filtros ou modelos versionados, revisa empresas e cria uma oportunidade. A ficha reúne acompanhamento, tarefas, restrição de contato, evidências, relações autorizadas, teses, comparáveis, notícias, documentos e passagem para execução. Excel, PDF e JSON representam um corte salvo e identificado por hash. Conversas permanecem privadas; oportunidades de um espaço são compartilhadas com quem tem acesso.

Conversa livre e pesquisa web têm adaptador configurável no servidor, limites persistentes e fontes. A GHT4 ainda não escolheu o provedor: **não estão ativadas com um modelo real**. Busca cadastral, revisão, CRM, acervo e exportações funcionam sem essa configuração. O agente não envia mensagens nem declara contratação sem registro de uma pessoa.

## Cobertura do planejamento original

Implementação não substitui aceite comercial, licença de dados ou ensaio no servidor final.

| Bloco | Disponível | Falta para o aceite completo |
| --- | --- | --- |
| B01 — Diagnóstico | Diretriz, tarefas prontas e roteiro de aceitação | Observar sócio e analista em tarefas reais, registrar tempo e dificuldades |
| B02 — Tese e taxonomia | Piloto químico, classificação, frente e perfis revisáveis | GHT4 ratificar faixas financeiras e exemplos; faixas do planejamento continuam hipóteses |
| B03 — Fontes | Catálogo e pesquisa documentados; fonte/data no agente; web opt-in | Autorizar fontes internas/licenças e definir atualização |
| B04 — Ingestão | Estrutura raw/master/serving, scripts e testes; snapshot e anexos preservados | Integrar atualização de bases externas à operação e ensaiar importação/reversão |
| B05 — Identidade | CNPJ raiz e regras existentes; filiais não viram empresas independentes | Validar grupos/controladas e exceções reais |
| B06 — Classificação | Motivo, fonte, data, revisão e versões de evidências | Medir falsos positivos/negativos na amostra ratificada |
| B07 — Porte/controle | Evidências reportadas/estimadas/inferidas/ausentes, unidade e período | Fornecer dados permitidos; automatizar enriquecimento após definir fonte/licença |
| B08 — Qualidade | Lacunas explícitas e divergências versionadas | Painel por fonte/campo e rotina de correção |
| B09 — Amostra | Testes sintéticos e roteiro de casos | Amostra real revisada pela GHT4; testes não são referência comercial |
| B10 — Ranking | Ordenação cadastral, revisão humana, cobertura e regras puras anteriores | Integrar ranking financeiro/comercial à coorte e calibrar com dados reais |
| B11 — Linguagem natural | Pedido → prévia de cinco filtros, regras locais e adaptador estruturado de IA, revisão/aplicação explícita e versão citada | Avaliar interpretação com modelo real e ampliar critérios quando houver dados; município exato, múltiplas UFs e filtros financeiros não suportados |
| B12 — Modelos | Modelos compartilhados, histórico, comparação e versão citada na pesquisa | Homologar biblioteca inicial e ampliar critérios com dados disponíveis |
| B13 — Rede | Relações com origem/autorização e confirmação; contatos protegidos por papel | Importar rede interna permitida e validar vínculos |
| B14 — CRM | Oportunidades, etapas com evidência, atividades, responsáveis, prazos, tarefas e painel por frente | Observar rotina e definir eventual integração com CRM/calendário existente |
| B15 — Abordagem | Roteiro de reunião, não contatar, motivos e bloqueio de avanço | Revisar mensagens com contexto real; envio externo não está ativado |
| B16 — Comparáveis | Cadastro, revisão, origem/licença, períodos, unidades e múltiplos descritivos | Bases licenciadas e ajustes revisados; sem valuation automático da empresa-alvo |
| B17 — Subsegmentos | Taxonomia e critérios pesquisados | Dados comparáveis por período e integração do ranking: pendência de dados e desenvolvimento |
| B18 — Notícias | Publicação/evento versionados; pesquisa web preparada com citações | Ativar conector, avaliar fontes e definir atualização; nenhum monitor agendado |
| B19 — Relatório de mercado | Exportação do corte revisado, fontes/limites e análise documental preparada | Base consolidada, metodologia revisada e fluxo próprio de relatório setorial |
| B20 — Contrapartes | Comparação de teses revisadas/acessíveis por produto, região, porte e controle | Perfis reais e validação de pares; aderência não confirma interesse |
| B21 — Agente e saídas | Trabalhos, tarefas, acervo, PDF/DOCX/TXT/MD e Excel/PDF/JSON; prévia/documentos/operação inspecionados no navegador | Modelo real, aceite dos fluxos completos pela equipe e evolução para OCR/documentos maiores |
| B22 — Segurança | Sessões, papéis, espaços, convites, suspensão, auditoria, limite de acesso e origem | Revisão de papéis e ensaio no destino; SSO/MFA não integrados |
| B23 — Continuidade | Backup local cifrado/restauração testada, recuperação por console e guia Postgres | Restore Postgres no destino, cópia fora do host, responsável e frequência |
| B24 — Métricas | Reservas/tokens/falhas de IA, ações e contagens por frente | Custo real, tempo de revisão e conversão por coorte; contagens não são taxas |
| B25 — Usabilidade | Guia diário e roteiro objetivo de aceitação | Pessoas da GHT4 executarem sem ajuda, registrar obstáculos e repetir após correções |
| B26 — Compartilhamento/escala | Postgres compatível, pacote Docker/Caddy e build pela mesma origem | Docker no destino, duas máquinas, migração local→Postgres, carga e p95 reais |

## Ordem para fechar o piloto

1. **Produto:** prévia, modelos, leitura documental e painel de backup conferidos em ensaio isolado de navegador em 14/09. Executar o roteiro completo com a GHT4, incluindo os demais formulários do acervo, e corrigir obstáculos.
2. **IA:** escolher provedor/modelo, política de envio e orçamento. Configurar no servidor e executar casos reais com fonte, lacunas, documento hostil e indisponibilidade.
3. **Equipe:** escolher hospedagem privada e operador; ensaiar certificados, dois acessos, concorrência, persistência e restauração. Se houver dados locais, testar migração em base nova.
4. **Dados:** fornecer amostra, rede autorizada e fontes/licenças. Priorizar porte/controle, comparáveis e subsegmentos. Registrar divergências e datas.
5. **Próximo desenvolvimento:** atualização operacional de fontes; qualidade por campo; ranking calibrado; relatório setorial; documentos extensos; métricas por coorte. A prévia de filtros foi implementada, mas interpretação com modelo real e critérios adicionais ainda precisam de avaliação e evolução.

O plano só estará concluído com evidências de uso real, fontes autorizadas e aceitação dos blocos acima. Horizontes de 16 semanas/180 dias e metas de conversão do planejamento não são resultados que um build possa comprovar.

## Guias

- [Uso diário](runbooks/agente-local.md)
- [Configurar IA](runbooks/configurar-ia.md)
- [Implantação e recuperação](runbooks/implantacao-privada.md)
- [Aceitação com a equipe](runbooks/aceitacao-piloto.md)
- [Retomada](RETOMADA-AGENTE.md)
- [Diretriz de produto](planejamento-prospeccao/DIRETRIZ-PRODUTO-AGENTE-MA.md), [planejamento original](planejamento-prospeccao/plano.md), [processos e saídas](planejamento-prospeccao/plano-parte-2.md) e [pesquisa ampliada](planejamento-prospeccao/pesquisa-ampliada/plano.md).
