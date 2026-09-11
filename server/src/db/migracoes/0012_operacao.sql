CREATE TABLE acesso_limites (
  chave text PRIMARY KEY,
  janela timestamptz NOT NULL DEFAULT now(),
  tentativas integer NOT NULL DEFAULT 1
);
