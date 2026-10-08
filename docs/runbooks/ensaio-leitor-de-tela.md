# Ensaio com leitor de tela (NVDA) — 10 minutos

A parte que dá para provar sem ouvir já está coberta:
- testes automáticos em `tests/acessibilidade-componente.test.mjs`;
- uma conferência no navegador real em 07/10/2026, que verificou estrutura, nomes, foco ao trocar de seção e contraste AA.

Este roteiro cobre o que só uma pessoa ouvindo confirma: se o que é anunciado faz sentido, na ordem certa, sem repetições.

## Preparação

1. Instale o [NVDA](https://www.nvaccess.org/download/) (gratuito) e abra o Chrome ou o Firefox.
2. Use uma conta da equipe em produção, ou rode localmente `node ferramentas/ensaio-catalogo-real.mjs --interface` e entre com a conta sintética que o comando imprime.
3. Atalhos do NVDA:
   - `Insert+Espaço` alterna entre modo de navegação e modo de foco;
   - `H` vai para o próximo título e `1` para o próximo título nível 1;
   - `T` vai para a próxima tabela, e `Ctrl+Alt+setas` andam pelas células;
   - `Insert+F7` lista títulos, links e marcos.

## Roteiro

Para cada passo, marque **ok** ou anote o que foi ouvido.

| # | Faça | Deve ouvir |
|---|------|------------|
| 1 | Na tela de entrada, `Tab` até o e-mail, a senha e o botão. | "E-mail, editar", "Senha, editar protegido" e "Entrar no meu espaço, botão". |
| 2 | Entre na conta. Aperte `Tab` uma vez. | "Pular para o conteúdo, link". `Enter` leva ao conteúdo, sem passar pelo menu. |
| 3 | No menu, ative "Pesquisar por tese". | "Pesquisar por tese, título nível 1". O foco vai para o título da seção. |
| 4 | `Insert+F7`, lista de marcos. | "Navegação principal" e o conteúdo principal. |
| 5 | Abra uma pesquisa concluída. Aperte `T` até a tabela. | O nome da tabela, como "Aderentes: 12 empresas". |
| 6 | Na tabela, ande até uma célula de critério. | O cabeçalho com o critério ("C1: Mais de 20 anos") e o veredito ("Atende: Fundada em 1990"). Não deve ouvir só "C1" nem só o resumo. |
| 7 | Ative o nome de uma empresa. | "expandido"; depois "Carregando evidências" e, em seguida, os trechos citados. |
| 8 | Ative "Monitorar toda semana". | "Monitoramento ligado. Próxima verificação a partir de …" sem precisar mover o foco. Repita com "Parar de monitorar". |
| 9 | Volte ao Início. No Meu dia, ouça a seção de teses (se houver novidade). | O nome da tese, quantas empresas novas e quantas com evento, como um botão. |
| 10 | Em "Continue de onde parou", ative a lixeira de um trabalho e depois "Cancelar". | "Cancelar" recebe o foco ao abrir; ao cancelar, o foco volta à lixeira do mesmo trabalho. |

## Onde anotar

Abra uma rodada no `AI_COLLAB.md`. Para cada falha, registre:
- o número do passo;
- o que foi ouvido e o que se esperava;
- o navegador e a versão do NVDA.
