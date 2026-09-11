CREATE TABLE ia_controle (id boolean PRIMARY KEY DEFAULT true CHECK (id));
INSERT INTO ia_controle VALUES (true);
CREATE TABLE ia_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  conversa_id uuid NOT NULL REFERENCES agente_conversas(id),
  chave uuid NOT NULL,
  corpo_hash text NOT NULL,
  estado text NOT NULL CHECK (estado IN ('reservada','concluida','falhou')),
  modelo text NOT NULL,
  tarefa text NOT NULL,
  resultado jsonb,
  tokens_entrada integer NOT NULL DEFAULT 0,
  tokens_saida integer NOT NULL DEFAULT 0,
  duracao_ms integer,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversa_id, chave)
);
CREATE INDEX ia_execucoes_dia ON ia_execucoes(criado_em, usuario_id);
