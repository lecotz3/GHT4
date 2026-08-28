-- =============================================================================
--  0003 · camada RAW / landing — o que chegou, como chegou
-- -----------------------------------------------------------------------------
--  Ver docs/architecture/adr/0001-camadas-raw-master-serving.md
--
--  Esta camada guarda a procedência. Arquivo recebido é IMUTÁVEL: reprocessar
--  significa ler de novo o mesmo arquivo, e é isso que torna qualquer lista
--  reconstruível meses depois.
--
--  NOMES
--  O adendo (§6) lista as entidades em inglês; o resto deste código é português.
--  Mantida a língua do código, com o mapeamento aqui para leitura cruzada:
--
--    data_assets           → ativos_de_dados
--    universe_snapshots    → snapshots_universo
--    import_runs           → execucoes_importacao
--    staging_batches       → lotes_staging
--    canonical_entity_links→ vinculos_entidade_canonica  (migration 0004)
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Fontes — o catálogo de onde os dados podem vir
--
--  `metodo_permitido` não é decoração. LinkedIn está fora do escopo automatizado
--  por decisão de negócio, e Capital IQ/EMIS entram só por exportação autorizada.
--  Gravar isso ao lado da fonte impede que a regra vire folclore oral.
-- -----------------------------------------------------------------------------
CREATE TABLE fontes_de_dados (
  chave             TEXT PRIMARY KEY,
  rotulo            TEXT NOT NULL,
  proprietario      TEXT,
  url               TEXT,
  licenca           TEXT,
  metodo_permitido  TEXT NOT NULL
                    CHECK (metodo_permitido IN (
                      'dados_abertos', 'api_contratada', 'exportacao_autorizada',
                      'material_interno', 'coleta_web_permitida', 'proibido'
                    )),
  confidencialidade TEXT NOT NULL DEFAULT 'interno'
                    CHECK (confidencialidade IN ('publico', 'interno', 'confidencial', 'restrito')),
  frequencia        TEXT,
  confiabilidade    NUMERIC(3,2) CHECK (confiabilidade BETWEEN 0 AND 1),
  observacao        TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO fontes_de_dados (chave, rotulo, proprietario, licenca, metodo_permitido, confidencialidade, frequencia, confiabilidade, observacao) VALUES
  ('rfb_cnpj',    'Dados abertos do CNPJ', 'Receita Federal do Brasil', 'Dados abertos', 'dados_abertos', 'publico', 'mensal', 0.95,
   'Universo cadastral. Nao publica faturamento: receita, crescimento, margem e funcionarios saem nulos.'),
  ('ibama_rapp',  'RAPP / CTF', 'IBAMA', 'Dados abertos', 'dados_abertos', 'publico', 'anual', 0.85,
   'Confirma operacao e pegada geografica. Volume declarado nao serve de proxy de porte.'),
  ('cvm_dfp',     'Demonstracoes financeiras', 'CVM', 'Dados abertos', 'dados_abertos', 'publico', 'anual', 0.98,
   'Auditado e comparavel, mas so alcanca companhia aberta — quase nada do middle market.'),
  ('associquim',  'Empresas certificadas', 'ASSOCIQUIM/PRODIR', 'Consulta publica', 'coleta_web_permitida', 'publico', 'eventual', 0.92,
   'Seed de alta precisao para distribuicao quimica. AINDA NAO INGERIDO: nao ha dado no repositorio.'),
  ('pf_siproquim','Cadastro de produtos controlados', 'Policia Federal', 'Consulta pontual', 'coleta_web_permitida', 'publico', 'eventual', 0.90,
   'Consulta por CNPJ. A PF nao divulga lista em massa.'),
  ('econodata',   'Perfil de capital fechado', 'Econodata', 'Licenca comercial', 'exportacao_autorizada', 'interno', 'sob_demanda', 0.70,
   'Porte e funcionarios. Depende de exportacao fornecida pela GHT4.'),
  ('emis',        'Perfil e financeiros', 'EMIS', 'Licenca comercial', 'exportacao_autorizada', 'confidencial', 'sob_demanda', 0.80,
   'Login web, sem API contratada. So entra por exportacao autorizada.'),
  ('capital_iq',  'Multiplos e precedentes', 'S&P Capital IQ', 'Licenca comercial', 'exportacao_autorizada', 'confidencial', 'sob_demanda', 0.90,
   'Login web, sem API contratada. So entra por exportacao autorizada.'),
  ('rede_ght4',   'Curriculos e listas internas', 'GHT4', 'Material interno', 'material_interno', 'restrito', 'sob_demanda', 0.75,
   'Dado pessoal. Sujeito a politica de campo — ver seguranca/rbac.mjs.'),
  ('linkedin',    'LinkedIn', 'Microsoft', 'Termos de uso proibem raspagem', 'proibido', 'publico', NULL, NULL,
   'FORA DO ESCOPO AUTOMATIZADO por decisao de negocio. Registrado para a regra nao virar folclore oral.');

-- -----------------------------------------------------------------------------
--  Ativos de dados — o arquivo, exatamente como chegou
-- -----------------------------------------------------------------------------
CREATE TABLE ativos_de_dados (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte             TEXT NOT NULL REFERENCES fontes_de_dados (chave),
  nome_arquivo      TEXT NOT NULL,
  -- Caminho no object storage. Em desenvolvimento e disco local; o contrato e o
  -- mesmo do S3, para trocar a implementacao sem tocar em quem chama.
  caminho_objeto    TEXT NOT NULL,
  -- SHA-256 do conteudo. E a identidade do arquivo: dois uploads do mesmo
  -- arquivo sao o MESMO ativo, e reprocessar produz exatamente o mesmo resultado.
  hash_sha256       TEXT NOT NULL,
  tamanho_bytes     BIGINT NOT NULL CHECK (tamanho_bytes >= 0),
  mime_type         TEXT,
  encoding          TEXT,
  -- Schema detectado na leitura: cabecalhos, tipos inferidos, separador.
  schema_detectado  JSONB,
  -- Data a que o CONTEUDO se refere, que nao e a data do download.
  data_corte        DATE,
  coletado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Contagens declaradas pela propria fonte, quando ela declara. Servem para
  -- reconciliar: se importamos 38.000 e o manifesto diz 38.583, ha 583 perdidos
  -- e isso precisa aparecer, nao ser descoberto meses depois.
  contagem_origem   BIGINT,
  relatorio_qualidade JSONB,
  estado            TEXT NOT NULL DEFAULT 'recebido'
                    CHECK (estado IN ('recebido', 'validado', 'processado', 'rejeitado', 'quarentena')),
  confidencialidade TEXT NOT NULL DEFAULT 'interno'
                    CHECK (confidencialidade IN ('publico', 'interno', 'confidencial', 'restrito')),
  criado_por        UUID REFERENCES usuarios (id),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mesmo arquivo da mesma fonte e um ativo so.
  UNIQUE (fonte, hash_sha256)
);

CREATE INDEX ativos_fonte_idx  ON ativos_de_dados (fonte, data_corte DESC);
CREATE INDEX ativos_estado_idx ON ativos_de_dados (estado) WHERE estado <> 'processado';

-- Arquivo recebido e imutavel. Só `estado` e `relatorio_qualidade` mudam.
CREATE OR REPLACE FUNCTION ativo_e_imutavel() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hash_sha256 IS DISTINCT FROM OLD.hash_sha256
     OR NEW.caminho_objeto IS DISTINCT FROM OLD.caminho_objeto
     OR NEW.tamanho_bytes IS DISTINCT FROM OLD.tamanho_bytes
     OR NEW.fonte IS DISTINCT FROM OLD.fonte THEN
    RAISE EXCEPTION 'ativo de dados e imutavel: conteudo, caminho, tamanho e fonte nao mudam. Registre um ativo novo.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ativos_imutaveis
  BEFORE UPDATE ON ativos_de_dados
  FOR EACH ROW EXECUTE FUNCTION ativo_e_imutavel();

-- -----------------------------------------------------------------------------
--  Snapshots do universo
--
--  Um snapshot e um estado do mundo numa data de corte. Toda lista aponta para
--  um: "38.583 empresas quimicas" sem snapshot e um numero sem validade.
-- -----------------------------------------------------------------------------
CREATE TABLE snapshots_universo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotulo          TEXT NOT NULL,
  -- '2026-08' — a referencia que a fonte usa.
  referencia      TEXT NOT NULL,
  data_corte      DATE NOT NULL,
  versao_schema   INTEGER NOT NULL DEFAULT 1,
  -- Quais ativos compoem este snapshot, com hash. E o manifesto: permite provar
  -- que dois snapshots partiram exatamente dos mesmos arquivos.
  manifesto       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- O que este snapshot cobre e o que nao cobre, declarado.
  cobertura       JSONB,
  contagens       JSONB,
  estado          TEXT NOT NULL DEFAULT 'em_construcao'
                  CHECK (estado IN ('em_construcao', 'pronto', 'falhou', 'arquivado')),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em    TIMESTAMPTZ,
  criado_por      UUID REFERENCES usuarios (id),

  UNIQUE (referencia, versao_schema)
);

CREATE INDEX snapshots_data_idx ON snapshots_universo (data_corte DESC);

-- Snapshot pronto nao muda: ha lista que se explica por ele.
CREATE OR REPLACE FUNCTION snapshot_pronto_e_imutavel() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.estado = 'pronto' AND NEW.estado = 'pronto' THEN
    IF NEW.manifesto IS DISTINCT FROM OLD.manifesto
       OR NEW.data_corte IS DISTINCT FROM OLD.data_corte
       OR NEW.contagens IS DISTINCT FROM OLD.contagens THEN
      RAISE EXCEPTION 'snapshot pronto e imutavel: ha coorte que se explica por ele. Crie o proximo.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER snapshots_imutaveis
  BEFORE UPDATE ON snapshots_universo
  FOR EACH ROW EXECUTE FUNCTION snapshot_pronto_e_imutavel();

-- -----------------------------------------------------------------------------
--  Execucoes de importacao
--
--  Job idempotente e resumivel: `checkpoint` guarda ate onde foi, para retomar
--  uma importacao de 5 GB que caiu no meio sem recomecar do zero.
-- -----------------------------------------------------------------------------
CREATE TABLE execucoes_importacao (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id      UUID REFERENCES snapshots_universo (id) ON DELETE CASCADE,
  ativo_id         UUID REFERENCES ativos_de_dados (id),
  fonte            TEXT NOT NULL REFERENCES fontes_de_dados (chave),
  etapa            TEXT NOT NULL
                   CHECK (etapa IN ('importacao', 'normalizacao', 'entity_resolution',
                                    'enriquecimento', 'classificacao')),
  parametros       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Ate onde foi. Retomar le daqui.
  checkpoint       JSONB,
  -- lidos, aceitos, rejeitados, quarentenados, duplicados, tempo.
  metricas         JSONB NOT NULL DEFAULT '{}'::jsonb,
  erros            JSONB NOT NULL DEFAULT '[]'::jsonb,
  estado           TEXT NOT NULL DEFAULT 'em_curso'
                   CHECK (estado IN ('em_curso', 'concluida', 'falhou', 'cancelada', 'retomavel')),
  iniciado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em     TIMESTAMPTZ,
  disparado_por    UUID REFERENCES usuarios (id)
);

CREATE INDEX execucoes_snapshot_idx ON execucoes_importacao (snapshot_id, etapa);
CREATE INDEX execucoes_estado_idx   ON execucoes_importacao (estado)
  WHERE estado IN ('em_curso', 'retomavel');

-- -----------------------------------------------------------------------------
--  Lotes de staging
--
--  A importacao processa em lotes. Um lote que falha e retentado sozinho, sem
--  arrastar os que ja passaram.
-- -----------------------------------------------------------------------------
CREATE TABLE lotes_staging (
  id             BIGSERIAL PRIMARY KEY,
  execucao_id    UUID NOT NULL REFERENCES execucoes_importacao (id) ON DELETE CASCADE,
  numero         INTEGER NOT NULL,
  faixa_inicio   BIGINT,
  faixa_fim      BIGINT,
  tentativas     INTEGER NOT NULL DEFAULT 0,
  -- lidos vs gravados vs rejeitados: se nao fecha, o lote nao esta 'conciliado'.
  reconciliacao  JSONB,
  estado         TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (estado IN ('pendente', 'em_curso', 'conciliado', 'divergente', 'falhou')),
  erro           TEXT,
  iniciado_em    TIMESTAMPTZ,
  concluido_em   TIMESTAMPTZ,

  UNIQUE (execucao_id, numero)
);

CREATE INDEX lotes_execucao_idx ON lotes_staging (execucao_id, estado);

-- -----------------------------------------------------------------------------
--  Quarentena
--
--  Registro invalido nao interrompe a importacao inteira e tambem nao some: fica
--  aqui com o motivo e a linha crua, para alguem olhar depois. Sem isto, 500
--  registros mal formados viram ou uma importacao que nunca termina, ou 500
--  empresas que ninguem sabe que faltam.
-- -----------------------------------------------------------------------------
CREATE TABLE registros_quarentena (
  id            BIGSERIAL PRIMARY KEY,
  execucao_id   UUID NOT NULL REFERENCES execucoes_importacao (id) ON DELETE CASCADE,
  lote_numero   INTEGER,
  linha_origem  BIGINT,
  -- A linha como veio, para reprocessar sem voltar ao arquivo.
  bruto         JSONB NOT NULL,
  motivo        TEXT NOT NULL,
  detalhe       TEXT,
  resolvido_em  TIMESTAMPTZ,
  resolvido_por UUID REFERENCES usuarios (id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX quarentena_execucao_idx ON registros_quarentena (execucao_id)
  WHERE resolvido_em IS NULL;
CREATE INDEX quarentena_motivo_idx   ON registros_quarentena (motivo);
