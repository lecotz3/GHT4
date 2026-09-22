-- Lotes são entradas explicitamente compartilhadas com a rede da casa.
-- Não se importa caixa postal, mensagem privada ou relacionamento por inferência.
ALTER TABLE rede_pessoas DROP CONSTRAINT rede_pessoas_origem_check;
ALTER TABLE rede_pessoas ADD CONSTRAINT rede_pessoas_origem_check
  CHECK (origem IN ('manual','cadastro_publico','importacao'));

CREATE TABLE rede_lotes (
  id uuid PRIMARY KEY,
  pessoa_ght4_id uuid NOT NULL REFERENCES rede_pessoas(id),
  fonte text NOT NULL,
  autorizacao text NOT NULL,
  conteudo_hash text NOT NULL,
  criado_por uuid NOT NULL REFERENCES usuarios(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  retirado_em timestamptz,
  retirado_por uuid REFERENCES usuarios(id),
  UNIQUE (pessoa_ght4_id, conteudo_hash)
);
ALTER TABLE rede_pessoas ADD COLUMN lote_id uuid REFERENCES rede_lotes(id);
ALTER TABLE rede_vinculos ADD COLUMN lote_id uuid REFERENCES rede_lotes(id);
CREATE INDEX rede_pessoas_lote_idx ON rede_pessoas(lote_id);
CREATE INDEX rede_vinculos_lote_idx ON rede_vinculos(lote_id);

ALTER TABLE rede_reconhecimentos DROP CONSTRAINT rede_reconhecimentos_resposta_check;
ALTER TABLE rede_reconhecimentos ADD CONSTRAINT rede_reconhecimentos_resposta_check
  CHECK (resposta IN ('nao_conheco','talvez','conheco','posso_apresentar','nao_intermediar','desatualizado'));

-- Serializa alterações de rede com a geração de resultados. Permite reconhecer
-- que um resultado salvo ficou obsoleto sem manter contatos retirados no histórico.
CREATE TABLE rede_estado (id integer PRIMARY KEY CHECK (id=1), versao integer NOT NULL DEFAULT 1);
INSERT INTO rede_estado(id) VALUES (1);
