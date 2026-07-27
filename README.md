# GHT4 · Agente de Prospecção M&A — Protótipo de Demonstração

Protótipo **conceitual e visual** de um agente de IA para prospecção em Fusões e Aquisições,
criado para apoiar a conversa de levantamento de requisitos com os sócios da **GHT4**.

> ⚠️ **Isto é uma demonstração.** Todas as empresas são **fictícias**, todos os números são
> **simulados** e os scores são **meramente ilustrativos**. O sistema **não prevê transações**,
> não faz valuation, não substitui due diligence e **não substitui a análise humana**.
> O objetivo é mostrar *como* um agente poderia funcionar, para facilitar as decisões de negócio.

---

## O que a demonstração faz

- **Seleção de setor** (Saúde, Tecnologia, Varejo, Energia — ilustrativos)
- **Filtros ilustrativos**: localização (UF), receita mínima, crescimento, margem EBITDA,
  nº de funcionários, perfil societário e classificação.
- **Lista de empresas fictícias**, claramente marcadas como dados de demonstração.
- **Classificação em 3 grupos**: possíveis alvos de aquisição, potenciais compradores e
  possíveis candidatas a venda.
- **Score de atratividade ilustrativo** (0–100) por empresa.
- **Explicação dos sinais** que influenciaram o score (crescimento relevante, mercado
  fragmentado, margem baixa, rodada de investimento, mudança de controle, expansão geográfica,
  sucessão familiar, escala, etc.).
- **Origem e data dos dados**, com nível de confiança e sinalização de dado simulado,
  incompleto ou hipótese.
- **Página de detalhes** de cada empresa (painel/modal), com: o que a empresa faz, situação
  relevante para M&A, um **contato fictício** (nome, cargo, e-mail e telefone — apenas demonstração),
  os indicadores e o desdobramento do score por papel.
- **Exportação em CSV** da lista filtrada (com cabeçalho de aviso e compatível com Excel PT-BR).

---

## Como executar

Não há instalação, dependências ou build. É um site estático que roda offline.

1. Abra a pasta do projeto.
2. Dê **duplo-clique em `index.html`** (ou arraste-o para o navegador — Chrome, Edge, Firefox).
3. Pronto. Use os filtros à esquerda, clique numa empresa para ver os detalhes e use
   **"Exportar CSV"** para baixar a lista.

> Opcional (se preferir servir por HTTP, por exemplo para apresentar em rede):
> ```
> # dentro da pasta do projeto
> python -m http.server 8000
> # depois acesse http://localhost:8000
> ```

---

## Estrutura dos arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | A aplicação: interface, filtros, listas, modal de detalhes e exportação CSV. |
| `data.js` | Base de **empresas fictícias** com metadados de origem/data/confiança. **Trocar por dados validados no futuro.** |
| `scoring.js` | **Motor de scoring** — limiares, catálogo de sinais e pesos por papel. **Este é o ponto de edição após as reuniões.** |
| `PERGUNTAS-DESCOBERTA.md` | Roteiro de perguntas para os sócios (usuários, setores, fontes, critérios, fluxo, confidencialidade, métricas). |
| `README.md` | Este arquivo. |

---

## Como ajustar depois das reuniões (sem quebrar nada)

O protótipo foi feito para ser fácil de alterar:

- **Mudar critérios/pesos do score** → edite `scoring.js`:
  - `LIMIARES` (ex.: a partir de quanto o crescimento "conta", o que é margem baixa/alta, o que é "escala").
  - `CONFIG_PAPEIS` → o objeto `pesos` de cada papel (`alvo`, `comprador`, `vendedora`).
  - Para criar um **novo sinal**, adicione uma entrada em `SINAIS` e referencie-a nos `pesos`.
- **Adicionar/editar empresas ou setores** → edite a lista em `data.js`
  (mantendo os campos de `origem`, `dataAtualizacao` e `confianca` para preservar a transparência).
- **Ajustar textos, cores e rótulos** → estão no topo do `<style>` e nos rótulos de `CONFIG_PAPEIS`.

---

## Transparência (decisões de design importantes)

- Faixa fixa no topo e rodapés reforçam que os dados são fictícios e os scores ilustrativos.
- Cada empresa exibe **origem**, **data de referência** e **nível de confiança**.
- O modal separa claramente *sinais*, *score por papel* e *transparência dos dados*, e repete
  o aviso de que não é recomendação de transação.
- O CSV exportado inclui um cabeçalho de aviso de demonstração.

---

## Decisões que ainda precisam ser validadas com os sócios

Tudo abaixo é **hipótese do protótipo**, não decisão de negócio:

1. **Setores e subsetores** — os 4 atuais são apenas exemplos.
2. **Filtros e faixas** — quais fazem sentido para a originação real da GHT4.
3. **Definição dos 3 papéis** — se essa é a taxonomia certa (ou se há outras categorias).
4. **Sinais e pesos do score** — quais sinais antecipam transações e quanto cada um vale.
5. **Escala do score** — número (0–100), faixas (A/B/C) ou apenas ranqueamento.
6. **Fontes de dados** — quais alimentarão o sistema e com que frequência/confiança.
7. **Significado de "confiança" e "origem"** — padronizar os rótulos com o time.
8. **Fluxo pós-priorização** — CRM, one-pager, tarefas, alertas, colaboração.
9. **Confidencialidade e LGPD** — quem vê o quê, onde os dados residem, barreiras de informação.
10. **Métricas de sucesso** — como medir se o agente gera valor.

Ver o roteiro completo em **`PERGUNTAS-DESCOBERTA.md`**.

---

*GHT4 — Boutique de Fusões e Aquisições. Protótipo de demonstração, sem integração com fontes reais.*
