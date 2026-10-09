-- Memória das buscas do "encontrar quem decide": os pedidos que cada membro fez, para repetir
-- sem redigitar. Mesmas regras da memória de critérios (0027): pessoal (ninguém mais vê, nem
-- administrador), visível, apagável e pausável pela mesma preferência (memoria_preferencias).
-- Guarda o texto do pedido e a contagem do último resultado, nunca as pessoas encontradas.
-- Busca feita dentro de uma pesquisa por tese não entra: o recorte ali é a pesquisa.
CREATE TABLE memoria_buscas (
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  chave TEXT NOT NULL CHECK (chave ~ '^[a-f0-9]{32}$'),
  pedido TEXT NOT NULL CHECK (length(pedido) BETWEEN 3 AND 2000),
  usos INTEGER NOT NULL DEFAULT 1 CHECK (usos >= 1),
  resumo JSONB NOT NULL DEFAULT '{}',
  primeiro_uso TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, chave)
);
CREATE INDEX memoria_buscas_uso_idx ON memoria_buscas(usuario_id, ultimo_uso DESC);
