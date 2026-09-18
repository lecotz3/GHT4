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

## Encher a rede: roster primeiro, pergunta depois

Pedir à casa que mapeie a própria rede não funciona. "Liste quem você conhece no setor" é esforço de memória sem âncora, e ninguém responde. O que funciona é mostrar o nome e perguntar se reconhece — **lembrar é caro, reconhecer é barato**, e essa diferença é o que separa um grafo cheio de um grafo vazio.

Daí a ordem, que não se inverte:

| | Pergunta | O que acontece |
| --- | --- | --- |
| 1 | "Liste quem você conhece no setor" | Ninguém responde |
| 2 | "Conhece alguém na Química Alfa?" | "Hmm… talvez?" Nome de empresa não puxa memória |
| 3 | "**Carlos Nunes, sócio-administrador da Química Alfa desde 2009.** Conhece?" | Sim ou não, em dois segundos |

A pergunta 3 só existe depois de haver a lista de nomes. É o que o importador do quadro societário produz.

### Passada de reconhecimento (Rede → primeira aba)

Escolha por quem está respondendo, opcionalmente filtre por empresa, e responda uma pessoa por vez. A fila vem **por poder de decisão**: quem aprova a transação aparece antes de quem não aprova, porque é ali que a atenção de quem responde vale mais.

Quatro respostas. As três positivas viram vínculo e pedem a evidência; a negativa não pede nada.

**O "não conheço" é o registro mais importante da tela.** Sem ele o produto não distingue *"a rede não foi consultada"* de *"foi consultada e não há caminho"* — e essas duas respostas levam a decisões opostas: uma manda procurar outra via, a outra manda parar. Ele também impede que o mesmo par seja perguntado de novo daqui a um mês por outro analista.

O resultado do agente passa a distinguir quatro situações, não duas:

| Situação | O que o agente diz |
| --- | --- |
| `nao_mapeada` | Ninguém desta empresa está cadastrado |
| `nao_perguntada` | Há gente mapeada e ninguém da casa foi perguntado. **Isto é "não apurado", não "não há caminho"** |
| `perguntada`, sem caminho | A busca por dentro da rede se esgotou; procure uma ponte de fora |
| `perguntada`, com caminho | Os caminhos, ordenados |

## Importar o quadro societário público

Os alvos da casa são distribuidoras químicas **fechadas**. Nelas o sócio-administrador é o decisor — e o quadro societário é dado aberto da Receita, a mesma fonte do catálogo. Para esse segmento é melhor que LinkedIn: é a estrutura legal de poder, não o que a pessoa escolheu publicar.

`ferramentas/importar-cnpj.mjs` **já lê** esse arquivo e descarta os nomes de propósito (`INCLUIR_NOME_SOCIOS = false`), com a nota de LGPD no topo daquele arquivo explicando por quê.

```
node ferramentas/importar-quadro-societario.mjs --ensaio                    # conta, não grava
node ferramentas/importar-quadro-societario.mjs --confirmo-a-decisao-lgpd   # grava
```

`--ensaio` existe para a casa ver o volume e a cara do dado **antes** de decidir. Sem o segundo argumento o script recusa e explica: gravar põe nome de pessoa física de terceiro no banco, sem que o titular tenha sido consultado, o que pede base legal registrada. A decisão é da casa, não de quem roda o comando — e o argumento obrigatório é o lugar onde ela aparece no histórico.

**Quem nunca entra**, qualquer que seja o resto: sócio menor de idade, sócio incapaz, procurador, cotas em tesouraria e sociedade consorciada. Os dois primeiros porque uma lista de prospecção comercial não é lugar para eles, e o dado ser público não torna o uso adequado.

**O que fica de fora de propósito:** a faixa etária do sócio, que existe na fonte. O produto já se proíbe de inferir sucessão pela idade dos sócios; ter o campo à mão só criaria a tentação de segmentar pessoa por idade.

**Homônimos.** Nome repetido dentro da mesma empresa é a mesma pessoa listada com duas qualificações — fica a de maior senioridade. Nome repetido entre empresas diferentes é contado e reportado, e **não é fundido**: vira revisão humana. Fusão automática fabrica relacionamento, que é o pior defeito possível aqui.

O código de qualificação da Receita vira cargo e senioridade em `server/src/rede/qualificacoes.mjs`. Código que não estiver na tabela entra como `outro`, com o número à vista — conservador e visível, em vez de um cargo adivinhado.

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
| `server/src/db/migracoes/0016_reconhecimento_e_quadro_societario.sql` | `origem` das pessoas e a tabela `rede_reconhecimentos`. |
| `server/src/rede/qualificacoes.mjs` | Código de qualificação da RFB → cargo e senioridade, com a lista de quem nunca entra. |
| `server/src/api/reconhecimento.mjs` | `/api/rede/reconhecimento`, a fila e a resposta. |
| `ferramentas/importar-quadro-societario.mjs` | Quadro societário público → roster, atrás da decisão. |
| `v1/src/componentes/Reconhecimento.tsx` | A passada, uma pessoa por vez. |
| `server/tests/reconhecimento.test.mjs` | 8 testes, incluindo a exclusão de menores e os quatro estados de apuração. |

`packages/domain/conexoes.mjs` e a tela `Conexoes.tsx` continuam sendo a **demonstração offline**, com armazenamento local e pesos ilustrativos. Não compartilham código com esta implementação, e seus pesos não foram promovidos ao ranking operacional — o plano pede exatamente isso.

## O que falta do plano

- Importação por lote de fontes externas (LinkedIn, CRM) com prévia, duplicidades e retirada do lote. O quadro societário público já entra; o resto não.
- Fila de revisão de homônimos na interface, com fusão reversível. Hoje o importador conta e reporta, sem fundir.
- Histórico profissional das pessoas da casa, que é a fonte mais barata de intermediários: quem passou pela mesma empresa na mesma janela vira candidato a ponte. Candidato gera pergunta, nunca aresta.
- Conexão com e-mail e agenda para atualizar recência.
- Confirmação pelo próprio titular dentro do produto. Hoje quem registra a resposta pode ser outra pessoa; o carimbo guarda quem anotou, e a auditoria guarda o resto.
