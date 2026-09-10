CREATE TABLE instalacao_inicial (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  concluida_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agente_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  mandato_id UUID REFERENCES mandatos(id),
  titulo TEXT NOT NULL,
  contexto JSONB NOT NULL DEFAULT '{}',
  versao INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agente_conversas_usuario_idx ON agente_conversas(usuario_id, atualizado_em DESC);

CREATE TABLE agente_turnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES agente_conversas(id),
  chave UUID NOT NULL,
  corpo_hash TEXT NOT NULL,
  numero INTEGER NOT NULL,
  pedido JSONB NOT NULL,
  resultado JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, chave),
  UNIQUE (conversa_id, numero)
);

CREATE TABLE agente_acoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES agente_conversas(id),
  turno_id UUID NOT NULL REFERENCES agente_turnos(id),
  descricao TEXT NOT NULL,
  concluida BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agente_acoes_conversa_idx ON agente_acoes(conversa_id, criado_em);
