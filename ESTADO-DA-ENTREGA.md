# Estado da entrega — Ferramenta de IA GHT4

> Documento de continuidade. Se o trabalho for retomado numa sessão nova, **leia
> este arquivo primeiro**: ele diz o que está pronto, o que falta, e qual é o
> próximo passo exato.

**Fonte dos requisitos:** `Requisitos - Ferramenta de IA GHT4.docx` (v1.0), em
`C:\Users\Leonardo\Downloads\`. Texto extraído e resumido nas seções abaixo.

---

## Decisões já tomadas pelo sócio (não reabrir)

| Tema | Decisão |
|---|---|
| Escopo da 1ª rodada | Profundidade nos módulos viáveis, não largura |
| Setor do caso real | Transporte & Logística (78 empresas no subsegmento líder) |
| Capital IQ / EMIS | **Só login web, sem API** → caminho é importar a exportação da plataforma; sem raspagem |
| Módulo 4 (conexões) | **Só material interno** (currículos e listas de contatos); sem varredura automatizada de LinkedIn |
| Commits | Autorizados nesta linha de trabalho; direto na `main` |

---

## Estado por módulo

| Módulo | Estado | Arquivos |
|---|---|---|
| 1 · Mapeamento de mercado | ✅ Feito | `mercado.js`, `v1/src/componentes/MapaMercado.tsx` |
| 2 · Ranking de subsegmentos | ✅ Feito | `mercado.js` |
| 3.1 · Critérios pré-estabelecidos | ✅ Já existia | `scoring.js` |
| 3.2 · Critérios e pesos na hora | ✅ Feito | `configuracao.js`, `PainelConfiguracao.tsx` |
| 3.3 · Templates de scoring | ✅ Feito | `configuracao.js` |
| 4 · Conexões da rede GHT4 | ✅ Feito | `conexoes.js`, `Conexoes.tsx` |
| 5.1 · Valuation (Capital IQ) | ✅ Feito | `analises.js`, `Analises.tsx` |
| 5.2 · Report de mercado | ✅ Feito | `analises.js`, `Analises.tsx` |
| 5.3 · News run | ✅ Feito | `analises.js`, `Analises.tsx` |
| 6 · Listas de compradores/alvos | ✅ Feito | `matchmaking.js`, `Matchmaking.tsx` |
| 7 · CRM / pipeline | ✅ Feito | `crm.js`, `Crm.tsx` |
| 9 · Output Excel | ✅ Feito | `exportar-excel.js` |
| 9 · Output PDF (report) | ✅ Feito | `@media print` em `v1/src/index.css` |

---

## Ordem de execução restante

**Todos os módulos do documento estão implementados.** O que resta não é código,
é material e decisão — ver "Pendências que dependem do sócio", abaixo.

Se for retomar, os candidatos naturais são:

1. **Calibrar pesos com os sócios** — a régua padrão é hipótese do protótipo, não
   decisão de negócio. Ver a lista em README.md.
2. **Ingerir o material real** — currículos e listas para o Módulo 4, exportação
   do Capital IQ para o 5.1.
3. **Servidor**, se e quando o CRM e os templates precisarem ser compartilhados
   entre o time.
4. **Camada de linguagem natural** — é o que falta para prompt livre (Mód. 3.2 e
   6) e para o texto analítico do report (Mód. 5.2).

---

## Como verificar (roteiro que já funciona)

```sh
# motor, em Node — carrega os .js da raiz num window falso
node <scratchpad>/validar.mjs        # 12 asserções

# interface
cd v1 && npm run build && npx oxlint
npx vite preview --port 5196

# interface dirigida de verdade (Chrome headless + protocolo DevTools)
chrome --headless --remote-debugging-port=9222 --user-data-dir=<tmp> http://localhost:5196/
node <scratchpad>/dirigir.mjs
```

Os scripts `validar.mjs`, `testar-motor.mjs`, `caso.mjs` e `dirigir.mjs` estão no
scratchpad da sessão. Se sumirem, o padrão de todos é o mesmo: `vm.createContext`
com um `window` falso, carregando os arquivos da raiz na ordem
`data.js → evidencias.js → scoring.js → configuracao.js → mercado.js →
matchmaking.js → exportar-excel.js → data-real.js`.

---

## Regras de arquitetura que valem para o que falta

0. **Escopo global é compartilhado entre os .js da raiz.** Eles são carregados por
   `<script>` no protótipo, então dois `const` de mesmo nome em arquivos
   diferentes derrubam a página inteira com SyntaxError. Aconteceu com
   `LIMITACOES` (conexoes.js vs matchmaking.js). Antes de commitar um arquivo
   novo na raiz, varra os nomes de topo em busca de colisão.
1. **Motor na raiz, sem sintaxe de módulo.** Nada de `import`/`export` nos `.js`
   da raiz — eles precisam rodar por `<script>` em `file://`. Publicam em
   `window.NOME`. A v1 os carrega por `v1/src/dominio/index.ts`.
2. **Sem dependência de npm no motor.** O protótipo roda por duplo-clique. Foi
   por isso que o `.xlsx` é escrito à mão em `exportar-excel.js`.
3. **Dado ausente é `null`, nunca `false`.** "Não sei" e "não atende" são
   estados distintos em toda a base de código.
4. **O que não tem fonte é declarado, não silenciado.** Padrão de
   `CRITERIOS_SEM_FONTE` (`evidencias.js`) e `CRITERIOS_SEM_FONTE_MERCADO`
   (`mercado.js`): critério, por que importa, por que falta, via de obtenção.
5. **Proxy é rotulado como proxy** na interface e na exportação.
6. **Nada entra no índice sem entrar também no denominador.**
7. **Tipos em `v1/src/dominio/tipos.ts`**, uma seção por módulo.
8. **Paleta validada** (`v1/src/index.css`) — não trocar cor sem revalidar.

---

## Pendências que dependem do sócio (não bloqueiam o código)

1. **Passo a passo do Capital IQ** — o documento promete em anexo (seção 6.1).
   Sem ele, a ingestão de valuation aceita um formato genérico de planilha.
2. **Material da rede GHT4** — currículos e listas de contatos para o Módulo 4,
   mais a definição de quem pode ver o quê.
3. **A GHT4 faz distressed?** Uma das 4 empresas da faixa consolidável do caso
   tem margem de −103% e foi classificada como candidata a venda. Calibragem de
   peso, não de código.
4. **Onde os dados residem** quando houver servidor — CRM e templates
   compartilhados entre o time exigem um.

---

## Limitação conhecida e declarada

O caso real mostrou que, em Transporte & Logística, a base da CVM é quase toda
**concessionária de infraestrutura** (margem mediana de 42% é economia de
concessão). O middle market de capital fechado — o cliente típico da boutique —
não publica demonstração e não aparece. A arquitetura não muda quando a fonte
melhorar: EMIS e associações setoriais entram pelo mesmo formato de ficha.

**Apresentação com o caso real:**
https://claude.ai/code/artifact/da2cd01c-6421-400b-ae79-6f39fb67edaa
