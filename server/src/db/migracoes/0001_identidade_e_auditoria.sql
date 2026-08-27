-- =============================================================================
--  0001 · identidade, mandato e auditoria
-- -----------------------------------------------------------------------------
--  A base de tudo que a Fase 2 exige: quem é quem, o que cada um pode ver, e o
--  registro imutável do que cada um fez.
--
--  DUAS DECISÕES QUE VALEM PARA O RESTO DO ESQUEMA
--
--  1. Toda tabela mutável carrega `criado_em`, `atualizado_em` e `criado_por`.
--     Sem isso, "quem mudou este score?" não tem resposta — e num produto que
--     recomenda alvo de aquisição, essa pergunta sempre aparece.
--
--  2. Auditoria é append-only e vive fora da tabela auditada. Guardar o
--     histórico na própria linha convida a sobrescrita; guardar em separado com
--     `antes`/`depois` em JSONB permite reconstruir qualquer estado passado.
-- =============================================================================

CREATE TABLE papeis (
  chave        TEXT PRIMARY KEY,
  rotulo       TEXT NOT NULL,
  descricao    TEXT NOT NULL
);

-- Os quatro papéis que o plano nomeia. `admin` administra; `socio` decide;
-- `analista` opera; `leitura` só consulta.
INSERT INTO papeis (chave, rotulo, descricao) VALUES
  ('admin',    'Administrador', 'Gerencia usuários, mandatos e configuração do sistema.'),
  ('socio',    'Sócio',         'Aprova régua, shortlist e valuation. Vê todos os mandatos de que participa.'),
  ('analista', 'Analista',      'Opera triagem, pesquisa e CRM dentro dos mandatos de que participa.'),
  ('leitura',  'Leitura',       'Consulta sem alterar nada.');

CREATE TABLE usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  nome           TEXT NOT NULL,
  papel          TEXT NOT NULL REFERENCES papeis (chave),
  -- scrypt: derivação da senha e o sal, nunca a senha.
  senha_hash     TEXT,
  senha_sal      TEXT,
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por     UUID REFERENCES usuarios (id)
);

CREATE INDEX usuarios_email_idx ON usuarios (lower(email));

-- -----------------------------------------------------------------------------
--  Sessões
--  Guarda-se o HASH do token, nunca o token. Se o banco vazar, as sessões ativas
--  não viram chaves de entrada.
-- -----------------------------------------------------------------------------
CREATE TABLE sessoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em     TIMESTAMPTZ NOT NULL,
  encerrada_em  TIMESTAMPTZ,
  ip            TEXT,
  agente        TEXT
);

CREATE INDEX sessoes_usuario_idx ON sessoes (usuario_id);
CREATE INDEX sessoes_expira_idx  ON sessoes (expira_em);

-- -----------------------------------------------------------------------------
--  Mandatos
--  O mandato é a unidade de confidencialidade. Um analista de um mandato não tem
--  por que ver a pipeline de outro, e o documento de requisitos trata isso como
--  requisito, não como preferência.
-- -----------------------------------------------------------------------------
CREATE TABLE mandatos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         TEXT NOT NULL UNIQUE,
  rotulo         TEXT NOT NULL,
  descricao      TEXT,
  setor          TEXT,
  subsetor       TEXT,
  situacao       TEXT NOT NULL DEFAULT 'ativo'
                 CHECK (situacao IN ('ativo', 'suspenso', 'encerrado')),
  confidencial   BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por     UUID REFERENCES usuarios (id)
);

CREATE TABLE mandato_membros (
  mandato_id  UUID NOT NULL REFERENCES mandatos (id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  -- Papel DENTRO do mandato, que pode ser menor que o papel global.
  papel       TEXT NOT NULL REFERENCES papeis (chave),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por  UUID REFERENCES usuarios (id),
  PRIMARY KEY (mandato_id, usuario_id)
);

CREATE INDEX mandato_membros_usuario_idx ON mandato_membros (usuario_id);

-- -----------------------------------------------------------------------------
--  Auditoria — append-only
--
--  Sem UPDATE e sem DELETE: a regra é imposta por trigger, não por convenção.
--  Uma trilha que pode ser editada não é trilha.
-- -----------------------------------------------------------------------------
CREATE TABLE auditoria (
  id           BIGSERIAL PRIMARY KEY,
  ocorrido_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id   UUID REFERENCES usuarios (id),
  mandato_id   UUID REFERENCES mandatos (id),
  acao         TEXT NOT NULL,
  entidade     TEXT NOT NULL,
  entidade_id  TEXT,
  -- Estado anterior e posterior. NULL em criação e em exclusão, respectivamente.
  antes        JSONB,
  depois       JSONB,
  -- Por que se fez. O plano exige justificativa em mudança de estado de triagem.
  justificativa TEXT,
  ip           TEXT,
  -- Correlaciona com o run do agente que originou a mutação, quando houver.
  run_id       TEXT
);

CREATE INDEX auditoria_entidade_idx ON auditoria (entidade, entidade_id);
CREATE INDEX auditoria_usuario_idx  ON auditoria (usuario_id, ocorrido_em DESC);
CREATE INDEX auditoria_mandato_idx  ON auditoria (mandato_id, ocorrido_em DESC);

CREATE OR REPLACE FUNCTION auditoria_e_imutavel() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'auditoria é append-only: % não é permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditoria_sem_update
  BEFORE UPDATE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();

CREATE TRIGGER auditoria_sem_delete
  BEFORE DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();

-- -----------------------------------------------------------------------------
--  Idempotência
--
--  Uma requisição repetida — usuário clicou duas vezes, rede reenviou, o agente
--  tentou de novo — não pode produzir dois efeitos. A chave é do cliente; a
--  resposta guardada é devolvida na repetição.
-- -----------------------------------------------------------------------------
CREATE TABLE chaves_idempotencia (
  chave         TEXT PRIMARY KEY,
  usuario_id    UUID REFERENCES usuarios (id),
  rota          TEXT NOT NULL,
  -- Hash do corpo: a mesma chave com corpo diferente é erro do cliente, não
  -- repetição. Devolver a resposta antiga nesse caso esconderia um bug.
  corpo_hash    TEXT NOT NULL,
  situacao      TEXT NOT NULL DEFAULT 'em_curso'
                CHECK (situacao IN ('em_curso', 'concluida', 'falhou')),
  resposta      JSONB,
  status_http   INTEGER,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em  TIMESTAMPTZ
);

CREATE INDEX chaves_idempotencia_criado_idx ON chaves_idempotencia (criado_em);
