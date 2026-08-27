# Dossiê · Distribuição química com sucessão sem sucessor e pegada ambiental viva

**Gerado em 2026-08-20** a partir de `data-quimicos.js` (cadastro CNPJ/RFB, referência 2026-08)
cruzado com `data-ibama.js` (RAPP do IBAMA, corte de pegada viva 2022+).

## O corte aplicado

| Etapa | Restam |
|---|---|
| Universo químico ativo (CNPJ) | 38.583 |
| + subsetor **Distribuição e trading químico** (prioridade 1 em `setores.js`) | 6.592 |
| + enquadrado por **CNAE principal** (não por secundário) | 1.670 |
| + **sucessão sem sucessor** (20+ anos, todos os sócios PF 60+, nenhum abaixo de 50) | 204 |
| + **pegada IBAMA viva** (RAPP entregue de 2022 em diante) | **35** |

Ordenado por capital social decrescente. Optantes do Simples já saíram no importador.

## Retrato do grupo

- **UF:** SP 16 · PR 6 · MG 5 · RS 3 · PB, RJ, MT, SC, PE 1 cada
- **Idade:** 20 a 50 anos, mediana 30
- **Capital social:** R$ 155,3 mi somados; mediana R$ 400 mil — capital social **não é** proxy de receita
- **Confirmação IBAMA:** transporte de perigoso 18 · comércio/depósito 12 · **Indústria Química 5**
- **Multi-UF (expansão geográfica):** 8 de 35
- **Sócio único:** 13 de 35 — dependência do fundador máxima
- **Perfil societário (após a correção de 21/08/2026):** Familiar 14 · Founder-led 13 · Holding de participações 7 · Multinacional 1
- **Sócio no exterior:** 1 (Sensient — subsidiária de multinacional, não é alvo de boutique)
- **Em recuperação judicial:** 2 (Compasa do Brasil, Sumatex)
- **Faixa 80+ no quadro:** Gap Química, Amontef

## Ressalvas

Receita, EBITDA, margem e funcionários saem **nulos** para todos: o cadastro do CNPJ não
publica esses campos. Mudança de controle e rodada exigem comparar dois meses do cadastro
(`ferramentas/eventos-cnpj.mjs`) e ainda não foram rodados para este recorte.

Ausência de pegada IBAMA não desmentiria operação — mas aqui todas as 35 **têm** pegada viva,
então a confirmação é positiva em todo o grupo.

O campo `perfil` da base rotulava LTDA como "Capital aberto" — **corrigido em 21/08/2026**
contra a tabela oficial de naturezas jurídicas da RFB (`ferramentas/naturezas-rfb.csv`).
Este dossiê já traz o perfil corrigido, ao lado da natureza jurídica crua.

---

### 1. Assuncao Distribuidora Ltda
**Joao Pessoa/PB** · CNPJ raiz `05892612` · id `cnpj05892612`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 2003-09-26 — **22 anos** |
| Capital social | **R$ 60.000.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 4 — relevantes: 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 3 (2 ativos) em 3 UF: CE, PB, PE |
| Filial mais recente | 2008-12-05 |
| Quadro societário | 5 sócios (5 PF, 0 PJ) |
| Faixas etárias | 61–70 · 61–70 · 61–70 · 71–80 · 61–70 |
| Contato cadastral | CONTABIL@ASSUNCAOBR.COM.BR · (83) 35331800 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2025** · 2 formulários · UFs: PARAIBA, PERNAMBUCO, CEARA |
| Formulários RAPP | Resíduos sólidos — gerador; Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: SIM · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 2. Aromat Produtos Quimicos Ltda
**Sao Bernardo do Campo/SP** · CNPJ raiz `64813165` · id `cnpj64813165`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1990-11-01 — **35 anos** |
| Capital social | **R$ 35.015.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 4  |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 3 sócios (3 PF, 0 PJ) |
| Faixas etárias | 61–70 · 61–70 · 61–70 |
| Contato cadastral | LUIS.BETIOLLI@LUKSNOVA.COM.BR · (11) 43443800 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2024** · 1 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 3. Compasa do Brasil Distribuidora de Derivados de Petroleo Ltda - em Recuperacao Judicial
**Curitiba/PR** · CNPJ raiz `01382022` · id `cnpj01382022`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Holding de participações** |
| Situação cadastral | Ativa |
| Abertura | 1996-08-20 — **29 anos** |
| Capital social | **R$ 21.000.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 17 — relevantes: 4930201 (Transporte rodoviário de carga, municipal); 4930202 (Transporte rodoviário de carga, intermunicipal); 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 4 (4 ativos) em 3 UF: GO, PR, RJ |
| Filial mais recente | 2024-01-19 |
| Quadro societário | 2 sócios (1 PF, 1 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | — · — |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2025** · 4 formulários · UFs: PARANA |
| Formulários RAPP | Resíduos sólidos — gerador; Efluentes líquidos; Emissões atmosféricas; Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: SIM · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 4. Multichemie Industria e Comercio de Produtos Quimicos Ltda
**Cotia/SP** · CNPJ raiz `55195747` · id `cnpj55195747`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1985-11-25 — **40 anos** |
| Capital social | **R$ 7.500.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 4 — relevantes: 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 4 (2 ativos) em 2 UF: SC, SP |
| Filial mais recente | 2004-07-12 |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 61–70 · 61–70 |
| Contato cadastral | GIBA@LEONIDESP.COM.BR · (11) 32583388 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2024** · 2 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador; Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: SIM · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 5. Verquimica Industria e Comercio de Produtos Quimicos Ltda
**Guarulhos/SP** · CNPJ raiz `43588060` · id `cnpj43588060`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 1980-06-12 — **46 anos** |
| Capital social | **R$ 7.000.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 6 — relevantes: 2099199 (Fabricação de outros produtos químicos); 5211701 (Armazéns gerais) |
| Estabelecimentos | 2 (2 ativos) em 2 UF: SC, SP |
| Filial mais recente | 2015-08-27 |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | CONTABIL@VERQUIMICA.COM.BR · (11) 24048800 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2023** · 1 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: SIM · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 6. Sumatex Produtos Quimicos Ltda - em Recuperacao Judicial
**Rio de Janeiro/RJ** · CNPJ raiz `30927990` · id `cnpj30927990`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Holding de participações** |
| Situação cadastral | Ativa |
| Abertura | 1980-07-02 — **46 anos** |
| Capital social | **R$ 6.000.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 8 — relevantes: 2099199 (Fabricação de outros produtos químicos); 4930203 (Transporte rodoviário de produtos perigosos); 5211799 (Depósito de mercadorias para terceiros) |
| Estabelecimentos | 7 (6 ativos) em 3 UF: ES, RJ, SP |
| Filial mais recente | 2026-02-27 |
| Quadro societário | 2 sócios (1 PF, 1 PJ) |
| Faixas etárias | 71–80 |
| Contato cadastral | SUMATEX@SUMATEX.COM.BR · (21) 31891950 |
| IBAMA / RAPP | declarou **Indústria Química** · último RAPP **2025** · 3 formulários · UFs: RIO DE JANEIRO |
| Formulários RAPP | Resíduos sólidos — gerador; Efluentes líquidos; Transporte de químico perigoso |
| Detalhe declarado | Fabricação de preparados para limpeza e polimento, desinfetantes, inseticidas, germicidas e fungicidas; fabricação de produtos e substânicas controlados pelo Protocolo de Montreal; Produção de substâncias e fabricação de produtos químicos |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: SIM · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 7. Elepol Comercial Ltda
**Sao Jose dos Pinhais/PR** · CNPJ raiz `95387023` · id `cnpj95387023`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Holding de participações** |
| Situação cadastral | Ativa |
| Abertura | 2006-08-08 — **20 anos** |
| Capital social | **R$ 4.600.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 4 — relevantes: 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: PR |
| Filial mais recente | 2006-08-08 |
| Quadro societário | 2 sócios (1 PF, 1 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | — · (41) 32461774 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2025** · 2 formulários · UFs: PARANA |
| Formulários RAPP | Resíduos sólidos — gerador; Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 8. Atlanta Quimica Industrial Ltda
**Guarulhos/SP** · CNPJ raiz `47680376` · id `cnpj47680376`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Holding de participações** |
| Situação cadastral | Ativa |
| Abertura | 1976-03-17 — **50 anos** |
| Capital social | **R$ 2.460.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 0  |
| Estabelecimentos | 2 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 2 sócios (1 PF, 1 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | — · — |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2024** · 1 formulários · UFs: SAO PAULO |
| Formulários RAPP | Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 9. Manchester Chemical Produtos Quimicos Ltda
**Sao Paulo/SP** · CNPJ raiz `50666254` · id `cnpj50666254`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1978-12-28 — **47 anos** |
| Capital social | **R$ 2.000.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 3  |
| Estabelecimentos | 4 (4 ativos) em 3 UF: MG, RJ, SP |
| Filial mais recente | 2004-04-12 |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 61–70 · 71–80 |
| Contato cadastral | — · — |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2025** · 1 formulários · UFs: MINAS GERAIS |
| Formulários RAPP | Resíduos sólidos — gerador |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: SIM · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 10. Flamex - Comercio, Importacao e Exportacao Ltda
**Sao Caetano do Sul/SP** · CNPJ raiz `53948261` · id `cnpj53948261`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1984-11-16 — **41 anos** |
| Capital social | **R$ 1.800.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 1 — relevantes: 2099199 (Fabricação de outros produtos químicos) |
| Estabelecimentos | 2 (2 ativos) em 1 UF: SP |
| Filial mais recente | 2024-01-04 |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 71–80 · 71–80 |
| Contato cadastral | — · — |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2023** · 1 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 11. Carbono Quimica Ltda
**Sao Bernardo do Campo/SP** · CNPJ raiz `50611433` · id `cnpj50611433`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1978-07-18 — **48 anos** |
| Capital social | **R$ 1.600.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 9 — relevantes: 2093200 (Fabricação de aditivos de uso industrial); 2099199 (Fabricação de outros produtos químicos); 4930203 (Transporte rodoviário de produtos perigosos); 5211799 (Depósito de mercadorias para terceiros) |
| Estabelecimentos | 11 (6 ativos) em 8 UF: AL, ES, GO, MG, PR, RS, SC, SP |
| Filial mais recente | 2015-12-16 |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 71–80 · 71–80 |
| Contato cadastral | FLAVIO.PEREIRA@CARBONO.COM.BR · (11) 43934642 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2025** · 2 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador; Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: SIM · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 12. Gap Quimica Ltda
**Guarulhos/SP** · CNPJ raiz `69012631` · id `cnpj69012631`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1992-10-29 — **33 anos** |
| Capital social | **R$ 1.162.500** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 3 — relevantes: 4930203 (Transporte rodoviário de produtos perigosos); 2099199 (Fabricação de outros produtos químicos) |
| Estabelecimentos | 2 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 4 sócios (4 PF, 0 PJ) |
| Faixas etárias | 61–70 · 71–80 · 71–80 · 80+ |
| Contato cadastral | ELISABETE@GAPQUIMICA.COM.BR · (11) 24137399 |
| IBAMA / RAPP | declarou **Indústria Química** · último RAPP **2024** · 2 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador; Efluentes líquidos |
| Detalhe declarado | Produção de substâncias e fabricação de produtos químicos; Fabricação de preparados para limpeza e polimento, desinfetantes, inseticidas, germicidas e fungicidas |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 13. Quimiclor Comercial Ltda
**Sao Bernardo do Campo/SP** · CNPJ raiz `00879504` · id `cnpj00879504`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Holding de participações** |
| Situação cadastral | Ativa |
| Abertura | 1995-10-23 — **30 anos** |
| Capital social | **R$ 750.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 0  |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 2 sócios (1 PF, 1 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | QUALIDADE@QUIMICLOR.COM.BR · (11) 43514299 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2025** · 2 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador; Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 14. Tonello Gases Industriais e Medicinais Ltda
**Caxias do Sul/RS** · CNPJ raiz `07761889` · id `cnpj07761889`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 2005-12-19 — **20 anos** |
| Capital social | **R$ 700.000** |
| Porte declarado | Empresa de pequeno porte · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 2 — relevantes: 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: RS |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | fcenci@terra.com.br · (54) 32174455 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2023** · 1 formulários · UFs: RIO GRANDE DO SUL |
| Formulários RAPP | Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 15. Veronese Industria Quimica Ltda
**Taubate/SP** · CNPJ raiz `58092164` · id `cnpj58092164`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Holding de participações** |
| Situação cadastral | Ativa |
| Abertura | 1987-10-19 — **38 anos** |
| Capital social | **R$ 600.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 1 — relevantes: 2099199 (Fabricação de outros produtos químicos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 3 sócios (2 PF, 1 PJ) |
| Faixas etárias | 61–70 · 71–80 |
| Contato cadastral | CONTATO@DICONCONTABILIDADE.COM.BR · (12) 36255433 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2025** · 2 formulários · UFs: SAO PAULO |
| Formulários RAPP | Efluentes líquidos; Emissões atmosféricas |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 16. Matex Mato Grosso Comerc de Explosivos e Servicos Ltda
**Nossa Senhora do Livramento/MT** · CNPJ raiz `01014553` · id `cnpj01014553`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 1996-01-15 — **30 anos** |
| Capital social | **R$ 528.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 4 — relevantes: 4930202 (Transporte rodoviário de carga, intermunicipal); 4930203 (Transporte rodoviário de produtos perigosos); 5211799 (Depósito de mercadorias para terceiros) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: MT |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | MARLI.JUNGES@MATEXMT.COM.BR · (65) 36821211 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2024** · 1 formulários · UFs: MATO GROSSO |
| Formulários RAPP | Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 17. Pro Desmonte Comercial Ltda
**Sao Jose dos Pinhais/PR** · CNPJ raiz `05783809` · id `cnpj05783809`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Holding de participações** |
| Situação cadastral | Ativa |
| Abertura | 2003-07-18 — **23 anos** |
| Capital social | **R$ 500.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 10 — relevantes: 4930201 (Transporte rodoviário de carga, municipal); 4930202 (Transporte rodoviário de carga, intermunicipal); 4930203 (Transporte rodoviário de produtos perigosos); 5211799 (Depósito de mercadorias para terceiros) |
| Estabelecimentos | 2 (1 ativos) em 1 UF: PR |
| Filial mais recente | — |
| Quadro societário | 2 sócios (1 PF, 1 PJ) |
| Faixas etárias | 71–80 |
| Contato cadastral | CONTATO@CONTABILIDADECELY.COM.BR · (41) 30130708 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2025** · 2 formulários · UFs: PARANA |
| Formulários RAPP | Resíduos sólidos — gerador; Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 18. Sergio V Zabini & Cia Ltda
**Quarto Centenario/PR** · CNPJ raiz `82442161` · id `cnpj82442161`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1991-03-26 — **35 anos** |
| Capital social | **R$ 400.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 4 — relevantes: 4930202 (Transporte rodoviário de carga, intermunicipal); 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: PR |
| Filial mais recente | 1991-03-26 |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 71–80 · 61–70 |
| Contato cadastral | PETRODIESEL@PETRODIESELTRR.COM.BR · (44) 35461155 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2024** · 1 formulários · UFs: PARANA |
| Formulários RAPP | Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 19. Hoc Comercio de Fogos Ltda
**Santo Antonio do Monte/MG** · CNPJ raiz `02961981` · id `cnpj02961981`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 1999-01-26 — **27 anos** |
| Capital social | **R$ 325.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 3  |
| Estabelecimentos | 1 (1 ativos) em 1 UF: MG |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 71–80 |
| Contato cadastral | STARFOGOS@HOTMAIL.COM · (37) 32811336 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2025** · 3 formulários · UFs: MINAS GERAIS |
| Formulários RAPP | Resíduos sólidos — gerador; Efluentes líquidos; Emissões atmosféricas |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 20. Caldas Comercio de Produtos Quimicos Ltda
**Caldas/MG** · CNPJ raiz `01752683` · id `cnpj01752683`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1997-03-20 — **29 anos** |
| Capital social | **R$ 300.000** |
| Porte declarado | Empresa de pequeno porte · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 1 — relevantes: 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: MG |
| Filial mais recente | — |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 61–70 · 61–70 |
| Contato cadastral | JURIDICO@ATAIDECONTABILIDADE.COM.BR · (35) 37222080 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2025** · 1 formulários · UFs: MINAS GERAIS |
| Formulários RAPP | Efluentes líquidos |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 21. Sensient Cosmetic Technologies e Corantes, Importacao e Exportacao do Brasil Ltda.
**Santana de Parnaiba/SP** · CNPJ raiz `02074259` · id `cnpj02074259`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Multinacional** |
| Situação cadastral | Ativa |
| Abertura | 1997-03-19 — **29 anos** |
| Capital social | **R$ 209.619** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 2 — relevantes: 2093200 (Fabricação de aditivos de uso industrial) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 2 sócios (1 PF, 1 PJ) · **sócio no exterior** |
| Faixas etárias | 61–70 |
| Contato cadastral | VALDEMIR.SOUZA@SENSIENT.COM · (11) 36296802 |
| IBAMA / RAPP | declarou **Indústria Química** · último RAPP **2025** · 2 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador; Efluentes líquidos |
| Detalhe declarado | Produção de substâncias e fabricação de produtos químicos |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 22. Itaox Comercio de Gases Industriais Ltda
**Itajai/SC** · CNPJ raiz `03112791` · id `cnpj03112791`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 1999-04-26 — **27 anos** |
| Capital social | **R$ 200.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 8 — relevantes: 4930201 (Transporte rodoviário de carga, municipal); 4930202 (Transporte rodoviário de carga, intermunicipal); 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SC |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | CONTATO@ITAOX.COM.BR · (47) 33411499 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2023** · 1 formulários · UFs: SANTA CATARINA |
| Formulários RAPP | Resíduos sólidos — gerador |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 23. Oxiara Comercio Servicos e Transportes Ltda
**Araraquara/SP** · CNPJ raiz `04615215` · id `cnpj04615215`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 2001-08-15 — **25 anos** |
| Capital social | **R$ 150.000** |
| Porte declarado | Empresa de pequeno porte · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 9 — relevantes: 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | OXIARA@OXIARA.COM.BR · (16) 33395099 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2024** · 1 formulários · UFs: SAO PAULO |
| Formulários RAPP | Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 24. Ferreira Industria, Comercio, Importacao e Exportacao de Produtos Quimicos Ltda
**Sao Jose dos Pinhais/PR** · CNPJ raiz `79082368` · id `cnpj79082368`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1985-12-18 — **40 anos** |
| Capital social | **R$ 100.000** |
| Porte declarado | Micro empresa · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 3 — relevantes: 2093200 (Fabricação de aditivos de uso industrial); 2099199 (Fabricação de outros produtos químicos) |
| Estabelecimentos | 4 (4 ativos) em 2 UF: PR, SP |
| Filial mais recente | 2024-12-16 |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 71–80 · 61–70 |
| Contato cadastral | FINANCEIRO@BAFDOBRASIL.COM.BR · (41) 33013750 |
| IBAMA / RAPP | declarou **Indústria Química** · último RAPP **2025** · 3 formulários · UFs: PARANA |
| Formulários RAPP | Resíduos sólidos — gerador; Efluentes líquidos; Emissões atmosféricas |
| Detalhe declarado | Produção de substâncias e fabricação de produtos químicos |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: SIM · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 25. Oxige Gases Ltda
**Ipatinga/MG** · CNPJ raiz `03631491` · id `cnpj03631491`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 2000-01-12 — **26 anos** |
| Capital social | **R$ 100.000** |
| Porte declarado | Empresa de pequeno porte · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 7 — relevantes: 4930201 (Transporte rodoviário de carga, municipal); 4930202 (Transporte rodoviário de carga, intermunicipal); 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: MG |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 71–80 |
| Contato cadastral | OXIGEGASES@OUTLOOK.COM · (31) 38216290 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2024** · 1 formulários · UFs: MINAS GERAIS |
| Formulários RAPP | Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 26. Etron Tecnologia em Saneamento e Representacao Comercial Ltda
**Limeira/SP** · CNPJ raiz `07146413` · id `cnpj07146413`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 2004-12-16 — **21 anos** |
| Capital social | **R$ 100.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 4 — relevantes: 2099199 (Fabricação de outros produtos químicos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | JOSEOTAVIO.CANTADOR@GMAIL.COM · (19) 81115357 |
| IBAMA / RAPP | declarou **Indústria Química** · último RAPP **2025** · 2 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador; Efluentes líquidos |
| Detalhe declarado | Produção de substâncias e fabricação de produtos químicos |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 27. Talmar Comercio de Produtos Quimicos e Transportes Ltda
**Recife/PE** · CNPJ raiz `00310864` · id `cnpj00310864`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 1994-11-24 — **31 anos** |
| Capital social | **R$ 100.000** |
| Porte declarado | Empresa de pequeno porte · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 11 — relevantes: 2099199 (Fabricação de outros produtos químicos); 4930201 (Transporte rodoviário de carga, municipal); 4930202 (Transporte rodoviário de carga, intermunicipal); 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: PE |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | — · (81) 4288515 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2024** · 1 formulários · UFs: PERNAMBUCO |
| Formulários RAPP | Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 28. Action Plane Comercio de Gases Industriais Ltda
**Porto Alegre/RS** · CNPJ raiz `02157205` · id `cnpj02157205`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1997-10-07 — **28 anos** |
| Capital social | **R$ 50.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 11 — relevantes: 4930201 (Transporte rodoviário de carga, municipal); 4930202 (Transporte rodoviário de carga, intermunicipal); 4930203 (Transporte rodoviário de produtos perigosos); 5211701 (Armazéns gerais); 5211799 (Depósito de mercadorias para terceiros) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: RS |
| Filial mais recente | — |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 61–70 · 61–70 |
| Contato cadastral | CLENIO@OXISUL.COM.BR · (51) 33640091 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2024** · 2 formulários · UFs: RIO GRANDE DO SUL |
| Formulários RAPP | Resíduos sólidos — gerador; Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 29. Agi-gas Comercio de Oxigenio e Acetileno Ltda
**Curitiba/PR** · CNPJ raiz `00106615` · id `cnpj00106615`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 1994-06-20 — **32 anos** |
| Capital social | **R$ 45.000** |
| Porte declarado | Empresa de pequeno porte · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 0  |
| Estabelecimentos | 1 (1 ativos) em 1 UF: PR |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 71–80 |
| Contato cadastral | — · — |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2022** · 1 formulários · UFs: PARANA |
| Formulários RAPP | Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 30. Amontef Montagens e Equipamentos Frigorificos Ltda
**Ouro Fino/MG** · CNPJ raiz `04227887` · id `cnpj04227887`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 2000-12-27 — **25 anos** |
| Capital social | **R$ 10.000** |
| Porte declarado | Empresa de pequeno porte · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 2  |
| Estabelecimentos | 1 (1 ativos) em 1 UF: MG |
| Filial mais recente | — |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 71–80 · 80+ |
| Contato cadastral | — · (035) 34411597 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2024** · 2 formulários · UFs: MINAS GERAIS |
| Formulários RAPP | Resíduos sólidos — gerador; Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 31. Total Soldas e Gases Ltda
**Presidente Prudente/SP** · CNPJ raiz `01985818` · id `cnpj01985818`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 1997-07-10 — **29 anos** |
| Capital social | **R$ 10.000** |
| Porte declarado | Micro empresa · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 9 — relevantes: 4930203 (Transporte rodoviário de produtos perigosos) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | CONTABIL@BARALDOCONTABILIDADE.COM.BR · (18) 21015600 |
| IBAMA / RAPP | consta em **transporte de químico perigoso** · último RAPP **2023** · 1 formulários · UFs: SAO PAULO |
| Formulários RAPP | Transporte de químico perigoso |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 32. Hedy Quimica Comercial Ltda
**Guarulhos/SP** · CNPJ raiz `06303230` · id `cnpj06303230`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 2004-03-30 — **22 anos** |
| Capital social | **R$ 5.000** |
| Porte declarado | Micro empresa · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 0  |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | rohll.negocios@uol.com.br · (11) 20860361 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2023** · 1 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 33. Henpro com de Produtos para Manutencao Ltda
**Porto Alegre/RS** · CNPJ raiz `94492840` · id `cnpj94492840`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 1992-03-05 — **34 anos** |
| Capital social | **R$ 3.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 0  |
| Estabelecimentos | 1 (1 ativos) em 1 UF: RS |
| Filial mais recente | — |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 61–70 · 61–70 |
| Contato cadastral | — · (051) 33711603 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2024** · 1 formulários · UFs: RIO GRANDE DO SUL |
| Formulários RAPP | Resíduos sólidos — gerador |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 34. Cifund Comercio e Industria de Produtos Metalurgicos Ltda
**Itauna/MG** · CNPJ raiz `42843870` · id `cnpj42843870`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Founder-led** |
| Situação cadastral | Ativa |
| Abertura | 1992-07-14 — **34 anos** |
| Capital social | **R$ 2.000** |
| Porte declarado | Empresa de pequeno porte · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 1 — relevantes: 2093200 (Fabricação de aditivos de uso industrial) |
| Estabelecimentos | 1 (1 ativos) em 1 UF: MG |
| Filial mais recente | — |
| Quadro societário | 1 sócios (1 PF, 0 PJ) |
| Faixas etárias | 61–70 |
| Contato cadastral | CIFUND@CIFUND.COM.BR · (37) 32428180 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2025** · 2 formulários · UFs: MINAS GERAIS |
| Formulários RAPP | Resíduos sólidos — gerador; Efluentes líquidos |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |

### 35. Novatek Tecnologia Ambiental Ltda
**Sao Paulo/SP** · CNPJ raiz `06131415` · id `cnpj06131415`

| | |
|---|---|
| Natureza jurídica | Sociedade Empresária Limitada (LTDA) — capital fechado |
| Perfil societário | **Familiar** |
| Situação cadastral | Ativa |
| Abertura | 2004-02-27 — **22 anos** |
| Capital social | **R$ 1.000** |
| Porte declarado | Demais (média/grande) · Simples: não |
| CNAE principal | 4684299 (Atacado de outros produtos químicos e petroquímicos) |
| CNAEs secundários | 7  |
| Estabelecimentos | 1 (1 ativos) em 1 UF: SP |
| Filial mais recente | — |
| Quadro societário | 2 sócios (2 PF, 0 PJ) |
| Faixas etárias | 71–80 · 61–70 |
| Contato cadastral | NOVATEK@NOVATEK.COM.BR · (11) 26313407 |
| IBAMA / RAPP | declarou **Transporte, Terminais, Depósitos e Comércio** · último RAPP **2025** · 1 formulários · UFs: SAO PAULO |
| Formulários RAPP | Resíduos sólidos — gerador |
| Sinais | sucessão sem sucessor: SIM · expansão geográfica: não · mercado fragmentado: SIM |
| Sem fonte pública | receita, EBITDA, margem, funcionários, mudança de controle, rodada |
