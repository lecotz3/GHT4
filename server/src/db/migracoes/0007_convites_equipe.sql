CREATE TABLE convites_equipe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  papel TEXT NOT NULL REFERENCES papeis(chave),
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '48 hours',
  usado_em TIMESTAMPTZ,
  revogado_em TIMESTAMPTZ,
  usuario_criado UUID REFERENCES usuarios(id)
);
CREATE INDEX convites_email_idx ON convites_equipe(lower(email));
CREATE UNIQUE INDEX convites_email_pendente_idx ON convites_equipe(lower(email))
  WHERE usado_em IS NULL AND revogado_em IS NULL;

CREATE TABLE convite_espacos (
  convite_id UUID NOT NULL REFERENCES convites_equipe(id),
  mandato_id UUID NOT NULL REFERENCES mandatos(id),
  PRIMARY KEY (convite_id, mandato_id)
);
