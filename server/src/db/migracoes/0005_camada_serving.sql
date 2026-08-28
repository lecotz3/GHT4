-- =============================================================================
--  0005 · camada SERVING / analysis — derivado e reconstruível
-- -----------------------------------------------------------------------------
--  Ver docs/architecture/adr/0001-camadas-raw-master-serving.md
--
--  Tudo aqui pode ser apagado e recalculado a partir de raw + master. Se algo
--  não puder, está na camada errada.
--
--  A IDEIA CENTRAL: COORTE
--  A tese da GHT4 deixa de ser um filtro aplicado na importação e vira uma
--  COORTE versionada sobre o universo mestre. Mudar um CNAE, uma faixa de
--  receita ou um peso cria uma `coorte_versao` nova — não reimporta nada, não
--  apaga nada, e as duas versões ficam comparáveis.
--
--  E a diferença que faz o produto funcionar: empresa que NÃO entrou também tem
--  linha, com o motivo. "Quantas ficaram de fora, e por quê?" passa a ter
--  resposta, e a segunda tese não começa do zero.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Classificação por subsetor — os quatro estados
--
--  Do plano, §8.3. A distinção existe porque enquadrar por CNAE secundário e
--  enquadrar por certificado de associação são graus de certeza muito
--  diferentes, e tratá-los igual enche a lista de falso positivo.
--
--    confirmada  certificado de associação, ou CNAE principal + evidência
--                operacional forte (site, portfólio, RAPP vivo, licença)
--    provavel    CNAE principal compatível, sem contradição, com ao menos uma
--                evidência cadastral ou operacional adicional
--    possivel    só CNAE secundário, ou texto comercial ambíguo
--    excluida    atividade principal comprovadamente fora, sem atividade
--                relevante, duplicata, combustível, associação, cadastro
--                estrangeiro sem operação no Brasil
-- -----------------------------------------------------------------------------
CREATE TABLE classificacoes_subsetor (
  id            BIGSERIAL PRIMARY KEY,
  entidade_id   UUID NOT NULL REFERENCES entidades_juridicas (id) ON DELETE CASCADE,
  snapshot_id   UUID NOT NULL REFERENCES snapshots_universo (id) ON DELETE CASCADE,
  setor         TEXT NOT NULL,
  subsetor      TEXT NOT NULL,
  estado        TEXT NOT NULL
                CHECK (estado IN ('confirmada', 'provavel', 'possivel', 'excluida')),
  -- Por que este estado. NOT NULL: o aceite da fase exige 100% dos registros com
  -- motivo de inclusão ou exclusão.
  motivo        TEXT NOT NULL,
  -- Quais sinais sustentaram a decisão: cnae_principal, cnae_secundario,
  -- rapp_vivo, certificado_associacao, licenca_pf...
  sinais        TEXT[] NOT NULL DEFAULT '{}',
  -- Versão da taxonomia que produziu isto. Sem ela, "por que esta empresa é
  -- distribuição?" muda de resposta quando a taxonomia muda.
  versao_taxonomia TEXT NOT NULL,
  confianca     NUMERIC(3,2) CHECK (confianca BETWEEN 0 AND 1),
  automatica    BOOLEAN NOT NULL DEFAULT TRUE,
  -- Revisão humana sobrepõe a automática, e fica registrado quem e por quê.
  revisado_por  UUID REFERENCES usuarios (id),
  revisado_em   TIMESTAMPTZ,
  justificativa_revisao TEXT,
  execucao_id   UUID REFERENCES execucoes_importacao (id),
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (entidade_id, snapshot_id, subsetor)
);

CREATE INDEX class_snapshot_estado_idx ON classificacoes_subsetor (snapshot_id, subsetor, estado);
CREATE INDEX class_entidade_idx        ON classificacoes_subsetor (entidade_id);
CREATE INDEX class_sinais_idx          ON classificacoes_subsetor USING GIN (sinais);
-- Fila de revisão: o que a máquina classificou com pouca confiança e ninguém
-- olhou ainda.
CREATE INDEX class_revisao_idx ON classificacoes_subsetor (snapshot_id, confianca)
  WHERE revisado_em IS NULL AND automatica = TRUE;

-- -----------------------------------------------------------------------------
--  Coortes
-- -----------------------------------------------------------------------------
CREATE TABLE coortes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandato_id   UUID REFERENCES mandatos (id) ON DELETE CASCADE,
  chave        TEXT NOT NULL,
  rotulo       TEXT NOT NULL,
  descricao    TEXT,
  arquivada    BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por   UUID NOT NULL REFERENCES usuarios (id)
);

-- Chave unica por escopo. Vai como INDICE e nao como restricao de tabela:
-- restricao de tabela nao aceita expressao, e o escopo "da casa" e NULL, que
-- em UNIQUE comum nao colide consigo mesmo — duas coortes da casa com a mesma
-- chave passariam.
CREATE UNIQUE INDEX coortes_chave_por_escopo_idx
  ON coortes (COALESCE(mandato_id, '00000000-0000-0000-0000-000000000000'::uuid), chave)
  WHERE arquivada = FALSE;

CREATE INDEX coortes_mandato_idx ON coortes (mandato_id) WHERE arquivada = FALSE;

-- -----------------------------------------------------------------------------
--  Versões de coorte — imutáveis depois de materializadas
--
--  Aponta para o snapshot, a versão da taxonomia e a expressão de filtro. Com os
--  três, qualquer lista se reconstrói. Sem qualquer um deles, não.
-- -----------------------------------------------------------------------------
CREATE TABLE coorte_versoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coorte_id         UUID NOT NULL REFERENCES coortes (id) ON DELETE CASCADE,
  versao            INTEGER NOT NULL,
  snapshot_id       UUID NOT NULL REFERENCES snapshots_universo (id),
  versao_taxonomia  TEXT NOT NULL,
  -- A DSL validada. A Fase 4 aperta o formato; aqui o que importa é ela existir
  -- como dado, e nunca como código executável vindo do LLM.
  expressao_filtro  JSONB NOT NULL,
  parametros        JSONB NOT NULL DEFAULT '{}'::jsonb,
  conteudo_hash     TEXT NOT NULL,
  nota              TEXT,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por        UUID NOT NULL REFERENCES usuarios (id),
  materializado_em  TIMESTAMPTZ,
  -- Contagens do resultado, para comparar versões sem varrer os membros.
  contagens         JSONB,

  UNIQUE (coorte_id, versao)
);

CREATE INDEX coorte_versoes_coorte_idx   ON coorte_versoes (coorte_id, versao DESC);
CREATE INDEX coorte_versoes_snapshot_idx ON coorte_versoes (snapshot_id);

CREATE OR REPLACE FUNCTION coorte_versao_materializada_e_imutavel() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.materializado_em IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'versao de coorte materializada nao pode ser apagada: ha lista que se explica por ela';
    END IF;
    IF NEW.expressao_filtro IS DISTINCT FROM OLD.expressao_filtro
       OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
       OR NEW.versao_taxonomia IS DISTINCT FROM OLD.versao_taxonomia
       OR NEW.conteudo_hash IS DISTINCT FROM OLD.conteudo_hash THEN
      RAISE EXCEPTION 'versao de coorte materializada e imutavel: crie a proxima versao';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coorte_versoes_imutaveis
  BEFORE UPDATE OR DELETE ON coorte_versoes
  FOR EACH ROW EXECUTE FUNCTION coorte_versao_materializada_e_imutavel();

-- -----------------------------------------------------------------------------
--  Membros da coorte — inclusive quem FICOU DE FORA
--
--  "Nada de exclusão silenciosa" (§3.3 do adendo). A empresa excluída tem linha,
--  com o motivo e a regra que a excluiu.
--
--  PARTICIONADA POR HASH da versão. Toda consulta filtra por
--  `coorte_versao_id`, então a poda por partição funciona na igualdade, e a
--  escrita de uma materialização se espalha por oito partições em vez de
--  concentrar numa tabela só.
-- -----------------------------------------------------------------------------
CREATE TABLE coorte_membros (
  coorte_versao_id  UUID NOT NULL,
  entidade_id       UUID NOT NULL,
  situacao          TEXT NOT NULL
                    CHECK (situacao IN ('incluida', 'excluida', 'em_revisao')),
  -- NOT NULL nos dois casos: incluída e excluída precisam dizer por quê.
  motivo            TEXT NOT NULL,
  -- Qual filtro decidiu. Permite responder "qual critério eliminou mais gente?".
  filtro_decisivo   TEXT,
  sinais            TEXT[] NOT NULL DEFAULT '{}',
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (coorte_versao_id, entidade_id)
) PARTITION BY HASH (coorte_versao_id);

CREATE TABLE coorte_membros_p0 PARTITION OF coorte_membros FOR VALUES WITH (MODULUS 8, REMAINDER 0);
CREATE TABLE coorte_membros_p1 PARTITION OF coorte_membros FOR VALUES WITH (MODULUS 8, REMAINDER 1);
CREATE TABLE coorte_membros_p2 PARTITION OF coorte_membros FOR VALUES WITH (MODULUS 8, REMAINDER 2);
CREATE TABLE coorte_membros_p3 PARTITION OF coorte_membros FOR VALUES WITH (MODULUS 8, REMAINDER 3);
CREATE TABLE coorte_membros_p4 PARTITION OF coorte_membros FOR VALUES WITH (MODULUS 8, REMAINDER 4);
CREATE TABLE coorte_membros_p5 PARTITION OF coorte_membros FOR VALUES WITH (MODULUS 8, REMAINDER 5);
CREATE TABLE coorte_membros_p6 PARTITION OF coorte_membros FOR VALUES WITH (MODULUS 8, REMAINDER 6);
CREATE TABLE coorte_membros_p7 PARTITION OF coorte_membros FOR VALUES WITH (MODULUS 8, REMAINDER 7);

CREATE INDEX coorte_membros_situacao_idx ON coorte_membros (coorte_versao_id, situacao);
CREATE INDEX coorte_membros_entidade_idx ON coorte_membros (entidade_id);

-- -----------------------------------------------------------------------------
--  Execuções de materialização
-- -----------------------------------------------------------------------------
CREATE TABLE execucoes_materializacao (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coorte_versao_id  UUID REFERENCES coorte_versoes (id) ON DELETE CASCADE,
  alvo              TEXT NOT NULL
                    CHECK (alvo IN ('coorte', 'facetas', 'ranking', 'read_model')),
  estado            TEXT NOT NULL DEFAULT 'em_curso'
                    CHECK (estado IN ('em_curso', 'concluida', 'falhou', 'cancelada')),
  metricas          JSONB NOT NULL DEFAULT '{}'::jsonb,
  erro              TEXT,
  iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em      TIMESTAMPTZ,
  disparado_por     UUID REFERENCES usuarios (id)
);

CREATE INDEX materializacao_versao_idx ON execucoes_materializacao (coorte_versao_id, iniciado_em DESC);

-- -----------------------------------------------------------------------------
--  Auditoria de consulta
--
--  Guarda O QUE foi perguntado e quanto voltou — não o conteúdo retornado.
--  Serve a duas coisas: achar consulta lenta, e responder "quem consultou dado
--  deste mandato?". Gravar o resultado aqui duplicaria dado confidencial num
--  lugar com política de acesso mais frouxa, e o adendo (§6) veda isso.
-- -----------------------------------------------------------------------------
CREATE TABLE auditoria_consultas (
  id             BIGSERIAL PRIMARY KEY,
  ocorrido_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id     UUID REFERENCES usuarios (id),
  mandato_id     UUID REFERENCES mandatos (id),
  -- Nome funcional, não SQL: 'listar_empresas_da_coorte', 'facetas_por_uf'.
  consulta       TEXT NOT NULL,
  -- Os filtros, que são parâmetro e não conteúdo.
  filtros        JSONB,
  coorte_versao_id UUID REFERENCES coorte_versoes (id),
  snapshot_id    UUID REFERENCES snapshots_universo (id),
  linhas_retornadas INTEGER,
  duracao_ms     INTEGER,
  run_id         TEXT
);

CREATE INDEX aud_consultas_usuario_idx ON auditoria_consultas (usuario_id, ocorrido_em DESC);
CREATE INDEX aud_consultas_lentas_idx  ON auditoria_consultas (duracao_ms DESC)
  WHERE duracao_ms > 1000;
CREATE INDEX aud_consultas_data_brin_idx ON auditoria_consultas USING BRIN (ocorrido_em);
