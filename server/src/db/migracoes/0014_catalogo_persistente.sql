-- Publicações do catálogo apontam para o histórico cadastral existente.
-- A troca do snapshot ativo ocorre somente ao concluir a importação inteira.
CREATE TABLE catalogo_publicacoes (
  snapshot_id UUID PRIMARY KEY REFERENCES snapshots_universo(id),
  hash TEXT NOT NULL UNIQUE CHECK (hash ~ '^[a-f0-9]{64}$'),
  hash_origem TEXT NOT NULL CHECK (hash_origem ~ '^[a-f0-9]{64}$'),
  versao_regras TEXT NOT NULL,
  total_origem INTEGER NOT NULL CHECK (total_origem > 0),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalogo_controle (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  snapshot_id UUID REFERENCES catalogo_publicacoes(snapshot_id)
);
INSERT INTO catalogo_controle(id) VALUES (true);

CREATE TABLE catalogo_registros (
  snapshot_id UUID NOT NULL REFERENCES catalogo_publicacoes(snapshot_id),
  entidade_id UUID NOT NULL REFERENCES entidades_juridicas(id),
  nome TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  cidade TEXT NOT NULL,
  uf TEXT NOT NULL,
  cnae_principal TEXT,
  cnaes_secundarios TEXT[] NOT NULL DEFAULT '{}',
  busca_normalizada TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  PRIMARY KEY(snapshot_id, entidade_id)
);
CREATE INDEX catalogo_uf_cnae_idx ON catalogo_registros(snapshot_id, uf, cnae_principal, ordem);
CREATE INDEX catalogo_ordem_idx ON catalogo_registros(snapshot_id, ordem);

CREATE FUNCTION catalogo_registro_imutavel() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Registro publicado do catálogo é imutável. Importe um novo snapshot.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER catalogo_registros_imutaveis BEFORE UPDATE OR DELETE ON catalogo_registros
  FOR EACH ROW EXECUTE FUNCTION catalogo_registro_imutavel();
