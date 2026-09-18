# Rede de relacionamento e caminhos de acesso

Habilidade **Abrir caminho até a liderança** (`mapear_acesso`) e a tela **Rede** que a alimenta. Implementa P1 e a primeira metade de P2 do [plano de relações](../planejamento-prospeccao/PLANO-RELACOES-E-ACESSO.md).

## O que ela responde

Escolhida uma empresa, quem da GHT4 alcança quem decide lá dentro, por meio de quem, e com que assunto. A saída é uma lista de caminhos revisáveis, não uma promessa de apresentação.

## O que ela não faz

Não descobre pessoas. O catálogo cadastral do agente vem da Receita Federal e **não traz uma pessoa sequer** — nem sócio, nem diretor, nem contato. Tudo o que a habilidade sabe foi digitado por alguém da casa na tela Rede.

Disso decorre a distinção que mais importa na leitura do resultado: uma empresa sem caminhos pode significar **a casa ainda não mapeou** ou **mapeou e não há vínculo**. O resultado sempre diz qual dos dois, porque tratá-los como a mesma coisa faria o agente desaconselhar uma abordagem por ignorância própria.

Não há conexão com LinkedIn, Sales Navigator, e-mail ou agenda. O resultado lista essas fontes como não conectadas, e a ausência delas não é silenciosa.

## Cadastrar (tela Rede, no cabeçalho)

Três abas, que são as três posições de um caminho:

| Aba | Quem entra | Papel no caminho |
| --- | --- | --- |
| Quem decide nas empresas | Gente das empresas-alvo | Onde o caminho termina |
| Intermediários | Quem faz a ponte sem ser da casa nem da empresa-alvo | O meio, opcional |
| Pessoas da GHT4 | O grupo inteiro, não só a Advisory | Onde o caminho começa |

Cadastrar pessoas sem ligá-las produz uma agenda, não uma rede. O vínculo é o que responde à pergunta.

**Ao registrar um vínculo**, três campos decidem tudo:

- **Quanto alcança** — `Direta` (falam-se hoje), `Indireta` (conhecem-se, a aproximação pede contexto), `Fraca` (há um ponto em comum, não um relacionamento). É julgamento de quem conhece a relação, não do programa.
- **Como a casa sabe disso** — obrigatório, mínimo 10 caracteres, e aparece inteiro no resultado do agente como base da conversa. Trabalhar na mesma empresa não prova que duas pessoas se conhecem.
- **O que o titular respondeu** — as quatro respostas do plano, mais o estado inicial.

| Resposta | Efeito no caminho |
| --- | --- |
| Posso avaliar uma apresentação | Introdução viável, se valer na cadeia inteira |
| Conheço | Relação confirmada |
| Ainda não confirmado | Vínculo a confirmar; o agente pede que se pergunte antes de prometer |
| Não quero intermediar | Caminho incompleto — **existe e não é oferecido** |
| Informação desatualizada | Caminho incompleto |

As duas últimas **não apagam o vínculo**. Apagar perderia a informação de que ele já foi avaliado, e alguém o recadastraria semanas depois batendo na mesma porta.

## Usar (no agente)

1. **Encontrar empresas**, e no resultado clicar **Abrir caminho** na empresa.
2. A tarefa consulta a rede e devolve: caminho recomendado com a rota inteira, rascunho de abordagem, outros caminhos (até três), os que existem mas não são oferecidos, e quem está mapeado sem ninguém que alcance.
3. Com intermediário, os rascunhos são dois: o primeiro **pede a apresentação** à ponte; o segundo é para depois do aceite.

Escrever a mensagem não move a oportunidade para "contatada". A etapa muda quando o contato acontece.

## Como os caminhos são ordenados

Primeiro a **categoria**, que sai da ligação menos comprovada da cadeia — um caminho vale o seu elo mais fraco, e apresentar como confirmada uma cadeia com uma ponta por confirmar seria prometer uma porta que talvez não abra.

Dentro da categoria, uma pontuação com as parcelas à vista: cargo do alvo (conselho e CEO 5, CFO 4, diretoria 3, gerência 1), elo mais fraco da cadeia (direta 5, indireta 3, fraca 1), confirmação nos últimos 18 meses (+2) e o salto extra de um intermediário (−2). O resultado mostra a conta; não é probabilidade de fechar negócio, e o plano é explícito em não anunciar uma.

## Limites embutidos

- **Duas ligações, no máximo.** Cada salto multiplica suposições, e ninguém liga para o conhecido do conhecido de um conhecido pedindo apresentação.
- **Empresa reconhecida** pela raiz de CNPJ vinculada ao catálogo ou pelo nome da organização escrito igual (acentos e caixa são ignorados). Grafias diferentes não se juntam sozinhas. Raiz de CNPJ agrupa matriz e filiais; grupo econômico com raízes distintas exige evidência própria.
- **Não contatar.** Empresa com restrição ativa no espaço da oportunidade encerra o assunto: nenhum caminho é listado, nem como referência.
- **E-mail e telefone** só aparecem para quem tem `rede.ver_contato` (admin e sócio). Os demais veem que o contato existe e que está oculto — nunca a impressão de que não há contato. E-mail ausente continua ausente: montar um por padrão de domínio é chute, e a apresentação pelo próprio membro dispensa o endereço.
- **Escrita** exige `rede.editar` (admin e sócio). Analista e leitura consultam.

## Onde isso vive no código

| Arquivo | Papel |
| --- | --- |
| `server/src/db/migracoes/0015_rede_de_relacionamento.sql` | `rede_pessoas` e `rede_vinculos`. O par de um vínculo é guardado ordenado (`a < b`), com CHECK: conhecer é recíproco, e sem isso A-B e B-A entrariam como dois vínculos. |
| `server/src/rede/contratos.mjs` | Senioridades, tipos, forças, disposições, as cinco categorias e a regra do elo mais fraco. |
| `server/src/rede/caminhos.mjs` | Busca até duas ligações, pontuação e ressalvas. |
| `server/src/api/rede.mjs` | `/api/rede`, `/api/rede/pessoas`, `/api/rede/vinculos`, `/api/rede/caminhos`. |
| `server/src/agente/tarefas.mjs` | A habilidade `mapear_acesso`. Recebe a rede como porta, igual ao catálogo. |
| `v1/src/componentes/Rede.tsx` | A tela de cadastro. |
| `server/tests/rede.test.mjs` | 14 testes, incluindo caminho com ponte, categorias e a recusa do banco a par fora de ordem. |

`packages/domain/conexoes.mjs` e a tela `Conexoes.tsx` continuam sendo a **demonstração offline**, com armazenamento local e pesos ilustrativos. Não compartilham código com esta implementação, e seus pesos não foram promovidos ao ranking operacional — o plano pede exatamente isso.

## O que falta do plano

- Importação por lote (LinkedIn, CRM) com prévia, duplicidades e retirada do lote.
- Fusão e separação de homônimos com reversão.
- Conexão com e-mail e agenda para atualizar recência.
- Confirmação pelo próprio titular dentro do produto. Hoje quem registra a resposta pode ser outra pessoa; o carimbo guarda quem anotou, e a auditoria guarda o resto.
