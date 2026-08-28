-- =============================================================================
--  0004 · camada MASTER / curated — a verdade canônica
-- -----------------------------------------------------------------------------
--  Ver docs/architecture/adr/0001-camadas-raw-master-serving.md
--
--  A REGRA QUE DEFINE ESTA CAMADA
--  Filtro da GHT4 NUNCA remove registro daqui. Empresa fora da tese de hoje
--  continua na base e recebe motivo de exclusão *na coorte* (migration 0005),
--  não sumiço. É o que permite abrir a segunda tese sem reimportar 5 GB.
--
--  HISTÓRICO É APPEND-ONLY
--  Um snapshot novo não sobrescreve observação anterior. "A empresa tinha 3
--  filiais em 2025 e tem 7 agora" é um fato de M&A — expansão geográfica — e
--  some se a linha for atualizada no lugar.
--
--  AUSÊNCIA NÃO É ZERO
--  Toda observação carrega `estado` no vocabulário de packages/schemas/dado.mjs:
--  reportado, estimado, proxy, inferido. O que não foi apurado simplesmente não
--  tem linha, e a cobertura é calculada, não presumida.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Entidade jurídica — a raiz do CNPJ
--
--  Oito dígitos identificam a empresa; os catorze identificam o estabelecimento.
--  Confundir os dois faz uma rede de 40 filiais virar 40 empresas na contagem —
--  e o mapa de mercado passa a mentir sobre fragmentação, que é justamente o que
--  o produto mede.
-- -----------------------------------------------------------------------------
CREATE TABLE entidades_juridicas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj_raiz         CHAR(8) NOT NULL UNIQUE,
  razao_social      TEXT,
  natureza_juridica TEXT,
  porte_declarado   TEXT,
  capital_social    NUMERIC(20,2),
  data_abertura     DATE,
  optante_simples   BOOLEAN,
  situacao          TEXT,
  pais_origem       TEXT DEFAULT 'BR',
  -- Última vez que qualquer fonte tocou nesta linha. Não é data de coleta do
  -- fato: isso mora na observação.
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  primeiro_snapshot UUID REFERENCES snapshots_universo (id),
  ultimo_snapshot   UUID REFERENCES snapshots_universo (id)
);

CREATE INDEX entidades_razao_idx ON entidades_juridicas (lower(razao_social));
CREATE INDEX entidades_abertura_idx ON entidades_juridicas (data_abertura);

-- -----------------------------------------------------------------------------
--  Aliases — nomes fantasia, razões antigas, grafias
--
--  Casar a ASSOCIQUIM com a RFB é casar "Quimidrol Com Ind Imp Ltda" com
--  "QUIMIDROL". Sem tabela de alias isso vira `LIKE` espalhado pelo código.
-- -----------------------------------------------------------------------------
CREATE TABLE entidade_aliases (
  id           BIGSERIAL PRIMARY KEY,
  entidade_id  UUID NOT NULL REFERENCES entidades_juridicas (id) ON DELETE CASCADE,
  alias        TEXT NOT NULL,
  -- Forma normalizada para casamento: minúscula, sem acento, sem sufixo
  -- societário. É por ela que se busca.
  alias_norm   TEXT NOT NULL,
  tipo         TEXT NOT NULL DEFAULT 'fantasia'
               CHECK (tipo IN ('fantasia', 'razao_anterior', 'marca', 'grafia', 'fonte_externa')),
  fonte        TEXT REFERENCES fontes_de_dados (chave),
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (entidade_id, alias_norm, tipo)
);

CREATE INDEX aliases_norm_idx ON entidade_aliases (alias_norm);

-- -----------------------------------------------------------------------------
--  Estabelecimentos — o CNPJ de catorze dígitos
-- -----------------------------------------------------------------------------
CREATE TABLE estabelecimentos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_id       UUID NOT NULL REFERENCES entidades_juridicas (id) ON DELETE CASCADE,
  cnpj              CHAR(14) NOT NULL UNIQUE,
  matriz            BOOLEAN NOT NULL DEFAULT FALSE,
  nome_fantasia     TEXT,
  situacao          TEXT,
  data_situacao     DATE,
  cnae_principal    CHAR(7),
  cnaes_secundarios CHAR(7)[] NOT NULL DEFAULT '{}',
  municipio         TEXT,
  uf                CHAR(2),
  cep               TEXT,
  data_inicio       DATE,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX estab_entidade_idx  ON estabelecimentos (entidade_id);
CREATE INDEX estab_cnae_idx      ON estabelecimentos (cnae_principal);
CREATE INDEX estab_uf_idx        ON estabelecimentos (uf, municipio);
-- GIN: "quais estabelecimentos têm este CNAE entre os secundários?" é a consulta
-- que sustenta a descoberta por CNAE secundário, e sem GIN ela varre a tabela.
CREATE INDEX estab_cnaes_sec_idx ON estabelecimentos USING GIN (cnaes_secundarios);
CREATE INDEX estab_ativos_idx    ON estabelecimentos (entidade_id) WHERE situacao = 'ativa';

-- -----------------------------------------------------------------------------
--  Grupos econômicos
-- -----------------------------------------------------------------------------
CREATE TABLE grupos_economicos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotulo      TEXT NOT NULL,
  observacao  TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por  UUID REFERENCES usuarios (id)
);

CREATE TABLE grupo_membros (
  grupo_id     UUID NOT NULL REFERENCES grupos_economicos (id) ON DELETE CASCADE,
  entidade_id  UUID NOT NULL REFERENCES entidades_juridicas (id) ON DELETE CASCADE,
  papel        TEXT CHECK (papel IN ('controladora', 'controlada', 'coligada', 'mesma_familia')),
  -- Como se concluiu que fazem parte do mesmo grupo, e quanto se confia nisso.
  metodo       TEXT NOT NULL DEFAULT 'inferido'
               CHECK (metodo IN ('societario', 'declarado', 'inferido', 'confirmado_humano')),
  confianca    NUMERIC(3,2) CHECK (confianca BETWEEN 0 AND 1),
  confirmado_por UUID REFERENCES usuarios (id),
  confirmado_em  TIMESTAMPTZ,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (grupo_id, entidade_id)
);

CREATE INDEX grupo_membros_entidade_idx ON grupo_membros (entidade_id);

-- -----------------------------------------------------------------------------
--  Vínculos com o registro de origem — lineage
--
--  Responde "de qual linha de qual arquivo veio esta empresa?". Sem isso, um
--  número errado na tela não tem como ser rastreado até a origem.
-- -----------------------------------------------------------------------------
CREATE TABLE vinculos_entidade_canonica (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_id       UUID NOT NULL REFERENCES entidades_juridicas (id) ON DELETE CASCADE,
  fonte             TEXT NOT NULL REFERENCES fontes_de_dados (chave),
  ativo_id          UUID REFERENCES ativos_de_dados (id),
  execucao_id       UUID REFERENCES execucoes_importacao (id),
  -- O identificador que a FONTE usa. Nem toda fonte usa CNPJ.
  id_na_origem      TEXT NOT NULL,
  linha_origem      BIGINT,
  metodo            TEXT NOT NULL
                    CHECK (metodo IN ('cnpj_exato', 'cnpj_raiz', 'nome_uf', 'alias',
                                      'manual', 'confirmado_humano')),
  confianca         NUMERIC(3,2) CHECK (confianca BETWEEN 0 AND 1),
  -- Casamento ambíguo espera revisão humana em vez de escolher sozinho.
  revisado_por      UUID REFERENCES usuarios (id),
  revisado_em       TIMESTAMPTZ,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (fonte, id_na_origem, entidade_id)
);

CREATE INDEX vinculos_entidade_idx ON vinculos_entidade_canonica (entidade_id);
CREATE INDEX vinculos_pendentes_idx ON vinculos_entidade_canonica (fonte, confianca)
  WHERE revisado_em IS NULL AND confianca < 0.9;

-- -----------------------------------------------------------------------------
--  Observações cadastrais por snapshot — a tabela histórica grande
--
--  PARTICIONADA POR DATA. É a tabela que cresce com dezenas de milhões de
--  estabelecimentos vezes o número de snapshots. Particionar por data de corte
--  permite podar partição inteira numa consulta com filtro de período, e
--  arquivar snapshot velho sem tocar no resto.
--
--  Subpartição fica de fora: o adendo (§8) pede evidência de benefício antes, e
--  não há benchmark ainda.
-- -----------------------------------------------------------------------------
CREATE TABLE observacoes_cadastrais (
  id                  BIGSERIAL,
  snapshot_id         UUID NOT NULL REFERENCES snapshots_universo (id) ON DELETE CASCADE,
  entidade_id         UUID NOT NULL REFERENCES entidades_juridicas (id) ON DELETE CASCADE,
  data_corte          DATE NOT NULL,
  situacao            TEXT,
  cnae_principal      CHAR(7),
  estabelecimentos    INTEGER,
  estabelecimentos_ativos INTEGER,
  ufs_atuacao         CHAR(2)[],
  qtd_socios          INTEGER,
  qtd_socios_pf       INTEGER,
  qtd_socios_pj       INTEGER,
  socio_estrangeiro   BOOLEAN,
  faixas_etarias      JSONB,
  capital_social      NUMERIC(20,2),
  porte_declarado     TEXT,
  fonte               TEXT NOT NULL REFERENCES fontes_de_dados (chave),
  execucao_id         UUID REFERENCES execucoes_importacao (id),
  coletado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (data_corte, id)
) PARTITION BY RANGE (data_corte);

-- Partição de segurança: nada é rejeitado por falta de partição. Criar as
-- partições certas é trabalho do job de snapshot, não condição para gravar.
CREATE TABLE observacoes_cadastrais_default PARTITION OF observacoes_cadastrais DEFAULT;

CREATE INDEX obs_cad_entidade_idx ON observacoes_cadastrais (entidade_id, data_corte DESC);
CREATE INDEX obs_cad_snapshot_idx ON observacoes_cadastrais (snapshot_id);
-- BRIN: a tabela é gravada em ordem de data e lida por faixa de data. BRIN custa
-- kilobytes onde um B-tree custaria gigabytes.
CREATE INDEX obs_cad_data_brin_idx ON observacoes_cadastrais USING BRIN (data_corte);

-- -----------------------------------------------------------------------------
--  Observações financeiras
--
--  Formato longo — uma linha por métrica, período e fonte — e não colunas fixas.
--  Duas fontes podem discordar da receita de 2025, e as duas precisam caber sem
--  uma sobrescrever a outra. A resolução do conflito é decisão humana, e mora na
--  camada serving.
--
--  `estado` é o vocabulário de packages/schemas/dado.mjs. `unidade` e `periodo`
--  são NOT NULL de propósito: número sem unidade e sem período é a porta de
--  entrada do erro caro.
-- -----------------------------------------------------------------------------
CREATE TABLE observacoes_financeiras (
  id            BIGSERIAL,
  entidade_id   UUID NOT NULL REFERENCES entidades_juridicas (id) ON DELETE CASCADE,
  metrica       TEXT NOT NULL
                CHECK (metrica IN ('receita', 'ebitda', 'margem_ebitda', 'crescimento',
                                   'divida_liquida', 'caixa', 'funcionarios', 'alavancagem')),
  valor         NUMERIC(24,6) NOT NULL,
  unidade       TEXT NOT NULL,
  periodo       TEXT NOT NULL,
  observado_em  DATE NOT NULL,
  estado        TEXT NOT NULL
                CHECK (estado IN ('reportado', 'estimado', 'proxy', 'inferido')),
  metodo        TEXT,
  confianca     NUMERIC(3,2) CHECK (confianca BETWEEN 0 AND 1),
  fonte         TEXT NOT NULL REFERENCES fontes_de_dados (chave),
  ativo_id      UUID REFERENCES ativos_de_dados (id),
  execucao_id   UUID REFERENCES execucoes_importacao (id),
  coletado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (observado_em, id)
) PARTITION BY RANGE (observado_em);

CREATE TABLE observacoes_financeiras_default PARTITION OF observacoes_financeiras DEFAULT;

CREATE INDEX obs_fin_entidade_idx ON observacoes_financeiras (entidade_id, metrica, periodo DESC);
CREATE INDEX obs_fin_fonte_idx    ON observacoes_financeiras (fonte, metrica);
CREATE INDEX obs_fin_data_brin_idx ON observacoes_financeiras USING BRIN (observado_em);

-- -----------------------------------------------------------------------------
--  Registros regulatórios
--
--  Em química, licença é ativo de M&A e não burocracia: quem tem CTF/IBAMA vivo
--  e cadastro de controlados na PF tem barreira de entrada que o comprador
--  compra junto.
-- -----------------------------------------------------------------------------
CREATE TABLE registros_regulatorios (
  id             BIGSERIAL PRIMARY KEY,
  entidade_id    UUID NOT NULL REFERENCES entidades_juridicas (id) ON DELETE CASCADE,
  orgao          TEXT NOT NULL
                 CHECK (orgao IN ('ibama', 'anvisa', 'mapa', 'policia_federal', 'exercito', 'outro')),
  tipo           TEXT NOT NULL,
  identificador  TEXT,
  situacao       TEXT,
  vigente        BOOLEAN,
  ano_referencia INTEGER,
  valido_de      DATE,
  valido_ate     DATE,
  detalhes       JSONB,
  fonte          TEXT NOT NULL REFERENCES fontes_de_dados (chave),
  execucao_id    UUID REFERENCES execucoes_importacao (id),
  coletado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reg_entidade_idx ON registros_regulatorios (entidade_id, orgao);
CREATE INDEX reg_vigentes_idx ON registros_regulatorios (orgao, ano_referencia DESC)
  WHERE vigente = TRUE;

-- -----------------------------------------------------------------------------
--  Eventos corporativos
--
--  Mudança de controle, aporte, abertura de filial, recuperação judicial,
--  sucessão. Evento SEMPRE liga a evidência: "houve mudança de controle" sem
--  fonte é boato, e o produto inteiro se apoia em não confundir os dois.
-- -----------------------------------------------------------------------------
CREATE TABLE eventos_corporativos (
  id            BIGSERIAL PRIMARY KEY,
  entidade_id   UUID NOT NULL REFERENCES entidades_juridicas (id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL
                CHECK (tipo IN ('mudanca_controle', 'aporte', 'aquisicao', 'abertura_filial',
                                'expansao_geografica', 'recuperacao_judicial', 'falencia',
                                'sucessao_familiar', 'mudanca_capital', 'outro')),
  ocorrido_em   DATE,
  detectado_em  DATE NOT NULL,
  -- Como se soube: diferença entre snapshots, notícia, documento, informe.
  metodo        TEXT NOT NULL
                CHECK (metodo IN ('diferenca_snapshot', 'noticia', 'documento',
                                  'informe_oficial', 'declarado', 'inferido')),
  descricao     TEXT,
  detalhes      JSONB,
  confianca     NUMERIC(3,2) CHECK (confianca BETWEEN 0 AND 1),
  fonte         TEXT NOT NULL REFERENCES fontes_de_dados (chave),
  execucao_id   UUID REFERENCES execucoes_importacao (id),
  -- Snapshots comparados, quando o evento veio de diferença.
  snapshot_de   UUID REFERENCES snapshots_universo (id),
  snapshot_para UUID REFERENCES snapshots_universo (id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX eventos_entidade_idx ON eventos_corporativos (entidade_id, ocorrido_em DESC);
CREATE INDEX eventos_tipo_idx     ON eventos_corporativos (tipo, detectado_em DESC);
