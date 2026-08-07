# GHT4 · v1 — interface React

Segunda interface do protótipo de prospecção M&A da GHT4. O protótipo da raiz é
HTML/JS puro e roda com duplo-clique; esta aqui é **React 19 + Vite + Tailwind 4**,
e existe para receber componentes prontos (21st.dev, shadcn) sem que o produto
fique com cara de SaaS genérico.

> ⚠️ Continua sendo **demonstração**. A base "Demonstração" é fictícia; a base
> "Real · CVM" tem empresas e números verdadeiros, mas o **índice de priorização
> é ilustrativo em ambas**. O sistema não prevê transações, não faz valuation e
> não substitui a análise humana.

---

## Como rodar

```bash
cd v1
npm install
npm run dev      # http://localhost:5173
```

Outros comandos: `npm run build` (typecheck + bundle em `dist/`),
`npm run preview` (serve o `dist/`), `npm run lint` (oxlint).

---

## A decisão de arquitetura que sustenta tudo

**A v1 não reimplementa nada.** Ela importa os mesmos quatro arquivos que o
protótipo da raiz carrega por `<script>`:

```
../data.js          empresas fictícias
../data-real.js     386 companhias abertas (CVM) — pode não existir
../evidencias.js    de onde vem cada afirmação
../scoring.js       sinais, pesos, índice e lastro
```

Isso funciona porque esses arquivos não usam sintaxe de módulo. O Vite executa o
corpo deles por efeito colateral e as atribuições em `window.*` acontecem
normalmente. **A ordem importa**: `scoring.js` consulta `window.EVIDENCIA` ao
avaliar, então o import de `evidencias.js` vem antes — está fixado em
`src/dominio/index.ts`, que é o único ponto do projeto que toca nos globais.

**Por que não converter os originais para ESM:** o protótipo precisa abrir com
duplo-clique no `index.html`, e navegador bloqueia módulos ES em `file://` por
CORS. Converter mataria justamente a característica que faz o protótipo funcionar
numa sala de reunião sem rede.

Consequência prática: **mexeu na regra de negócio, mexe num lugar só** — e as
duas interfaces mudam juntas. O `vite.config.ts` libera `fs.allow` para a raiz e
define o alias `@dominio`.

`data-real.js` é gerado por `node ferramentas/importar-cvm.mjs` e pode
legitimamente não existir num clone novo. O carregamento é dinâmico e com
captura: sem o arquivo, o seletor de base some sozinho e a aplicação roda com a
base fictícia. Nunca dá tela branca.

---

## Estrutura

| Caminho | Papel |
|---|---|
| `src/dominio/index.ts` | **Ponte para a raiz.** Importa o motor, expõe `motor`/`evidencia` e define as duas bases (`BASES`). Único arquivo que conhece `window.*`. |
| `src/dominio/tipos.ts` | Tipos do domínio — o contrato que a raiz cumpre em JS e a v1 confere em TS. |
| `src/App.tsx` | Filtros, agrupamento por papel, resumo e orquestração da gaveta. |
| `src/componentes/FichaEmpresa.tsx` | Cartão do registro na lista. |
| `src/componentes/Dossie.tsx` | Conteúdo do dossiê: índice, lastro, indicadores, sinais com evidência, "não avaliado", contato, transparência. |
| `src/componentes/Gaveta.tsx` | Painel lateral acessível (adaptado do 21st.dev). |
| `src/componentes/FaixaNumerica.tsx` | Filtro de intervalo (adaptado do 21st.dev). |
| `src/componentes/SeloLastro.tsx` | Selo e barra de composição do lastro. |
| `src/index.css` | **Tokens de design no `@theme`** — a paleta da casa como utilitários Tailwind. |
| `src/formato.ts` | Formatação pt-BR (cifras, percentuais, datas, iniciais). |

---

## Os tokens são o ponto do `index.css`

Componente de terceiro vem com a paleta padrão do Tailwind. Declarando as cores
da GHT4 no `@theme`, elas viram utilitários (`bg-alvo`, `text-tinta`,
`border-fio-forte`) e qualquer componente colado no projeto veste a identidade da
casa em vez do visual genérico.

**A paleta dos papéis foi validada — não trocar sem revalidar.** As cores
anteriores reprovavam: verde e azul ficavam a ΔE 9,7, difíceis de distinguir
mesmo sem daltonismo. As atuais passam em banda de luminosidade, piso de croma,
separação para daltonismo e ΔE ≥ 15 contra as superfícies do projeto.

São duas famílias por papel, e a distinção importa:

- `--color-alvo` → **marca**: barras, selos, filetes, blocos de cor.
- `--color-alvo-tinta` → **texto**: rótulos e carimbos, em corpo pequeno.

E a cor nunca carrega informação sozinha: a barra de lastro sempre vem com
legenda rotulada, porque o par verde↔vermelho cai na banda de alerta para
daltonismo.

---

## Componentes de terceiros: o que se aproveita e o que se troca

Dois componentes vieram do 21st.dev. O critério foi o mesmo nos dois: **aproveitar
o comportamento difícil de acertar à mão, jogar fora a pele inteira.** Ninguém
deve conseguir apontar a origem olhando a tela.

**`Gaveta`** (base: *Drawer* de [@ddoemonn](https://21st.dev/@ddoemonn/components/drawer))
trouxe foco preso com Tab circulando, o resto da página marcado `inert` enquanto
aberta, trava de rolagem **com compensação da barra** (sem isso a página salta
para o lado ao abrir), devolução do foco a quem abriu, e arrastar-para-fechar que
decide por distância **ou** velocidade. Removido o `"use client"` — isto é Vite,
não Next.

**`FaixaNumerica`** (base: *Slider* de [@originui](https://21st.dev/@originui/components/slider))
perdeu o `cn` (clsx + tailwind-merge — duas dependências para um componente só) e
o tooltip. O balão do original some quando você solta o punho e não aparece no
teclado; aqui o intervalo fica escrito ao lado do rótulo, sempre legível, que é o
que se precisa ler num painel de filtros antes **e** depois de mexer.

---

## Duas decisões de comportamento que parecem detalhe e não são

**Faixa não escolhida é `null`, e isso é diferente de "faixa inteira".** Enquanto
ninguém mexeu no filtro, registros **sem** o indicador continuam na lista. Assim
que a faixa é usada, ela vira critério numérico — e quem não tem número não pode
ser comparado, então sai. Tratar ausência como zero acendia "margem baixa" em toda
empresa sem margem apurada; foi bug real do protótipo.

**A tarja de aviso acompanha a natureza do dado.** Ela troca junto com a base:
avisar "fictício" sobre dado real é tão errado quanto o contrário — e mais
perigoso, porque leva a descartar informação verdadeira.

---

## O que a v1 ainda não tem (está no protótipo da raiz)

A v1 cobre a leitura: filtrar, agrupar por papel, abrir o dossiê e ver a evidência
de cada sinal. Falta a camada de **ação**, que já existe em `index.html`:

- **Triagem humana com trilha de auditoria** — mudar o estado de um registro com
  responsável nomeado, data, estado anterior e justificativa.
- **Exportação em CSV** da lista filtrada, carregando fontes, lastro, sinais sem
  documentação e histórico de triagem.
- **Link direto para um dossiê** (`#empresa=tec07`).
- **Filtros de UF, funcionários, perfil societário, estado da triagem e lastro** —
  a v1 tem busca, setor, papel e as três faixas numéricas.

---

*Para o contexto do produto, as decisões de design e a pesquisa que as embasa, ver
o `README.md` e o `fundamentos.html` na raiz.*
