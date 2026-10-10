# /brag — GHT4 · Pesquisa por tese

## O que é
Agente de prospecção de M&A da GHT4 Advisory: o membro descreve numa frase as empresas que procura; o agente transforma a tese em critérios verificáveis, confere todo o recorte no cadastro da Receita e lê o site oficial para o que o cadastro não responde. Cada veredito traz a fonte.

## Para quem
Sócios e analistas de uma boutique de M&A no setor químico, que precisam de lista com lastro, não de lista bonita.

## O que diferencia
- Sem evidência, o critério fica "sem evidência", nunca "não atende" (regra do produto).
- A IA só pode citar trechos que existem na página; funciona também sem IA e sem custo.
- O funil cadastral roda sobre o recorte inteiro em segundos.

## Material real usado
- Tese do ensaio com o catálogo real (`ferramentas/ensaio-catalogo-real.mjs`) + a cláusula de site do exemplo "Venda" (`EXEMPLOS_TESE`).
- Critérios: saída real de `interpretarTese()` (`server/src/pesquisa/criterios.mjs`) para essa tese.
- Funil: 725 no recorte SP → 93 passam no cadastro (resultado registrado do ensaio, README/AI_COLLAB Rodada 6).
- Interface: CSS compilado da v1 (`vite build`), classes e textos de `PesquisaTese.tsx`, `EstruturaAgente.tsx`, `MarcaGHT4.tsx`, `IconeRede.tsx`.
- Empresas da tabela: fictícias, da base de demonstração (`data.js`). Trecho do site: ilustrativo.

## Ângulo
"Toda resposta com a fonte." A tese entra em linguagem natural e sai como lista conferida, com prova em cada célula.

## Gancho (0–2 s)
A tela real da pesquisa: "Descreva as empresas que você procura." e a tese sendo digitada na caixa.

## Destaques
1. A tese vira critérios (cadastro e site), cada um ligado ao trecho da frase.
2. Funil: 725 → 93, conferido na Receita.
3. Vereditos com fonte; "sem evidência" nunca vira "não atende".

## Desfecho
Fundo preto da marca, diagonal laranja de 45°, logotipo GHT4: "Pesquisa por tese · Inteligência de M&A".

## Tom
`polished`: sério, elegante, contido. Branco chapado, preto e um único acento laranja (#FF6E00), como na identidade da casa.

## Identidade
- Cores: marca #FF6E00, tinta #111111, suave #6B6B6B, papel #FFFFFF / #F7F8F9, fio #E3E6E8, comprador #0F4C81, alvo-tinta #9A4200.
- Tipo: Inter (primeira da pilha do `@theme`), 600, tracking −0,045em nos títulos.
- Dispositivo: a diagonal de 45° do "4" do logotipo, usada nas transições.

## Storyboard (1920×1080, 30 fps, 100 BPM — cortes no tempo)
| # | Tempo | Cena | Texto na tela |
|---|---|---|---|
| 1 | 0,0–3,6 s | App real (lateral preta, "Pesquisar por tese"). Câmera aproxima da caixa enquanto a tese é digitada; clique em "Montar critérios". | "Descreva as empresas que você procura." (UI) |
| 2 | 3,6–7,2 s | Cartão "Critérios desta pesquisa": 4 critérios entram um a um, com "de “trecho”". | "A tese vira critérios." / "Obrigatórios e opcionais, que você edita." |
| 3 | 7,2–10,8 s | Funil: 725 no recorte → 93 passam no cadastro (contadores e trilhos). | "Cada empresa conferida na Receita." / "Sem custo, em segundos." |
| 4 | 10,8–16,8 s | Grupos Aderentes / Prováveis / A confirmar; símbolos surgem; Quimibrás abre com trecho citado; foco no "?" do "A confirmar". | "Cada veredito com a fonte." → "Sem evidência, fica “sem evidência”. Nunca “não atende”." |
| 5 | 16,8–20,4 s | Diagonal laranja varre para o preto; logotipo GHT4; assinatura. | "Pesquisa por tese" / "GHT4 Advisory · Inteligência de M&A" |

## Som
Trilha sintetizada em Ré maior, 100 BPM (D–Bm–G–A), piano elétrico suave, pad e pulso discreto; efeitos (teclas, plucks nas notas do acorde, sopro da diagonal) na mesma tonalidade e abaixo da música. Resolve em Ré no logotipo.
