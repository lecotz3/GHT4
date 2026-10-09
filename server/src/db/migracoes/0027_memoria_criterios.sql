-- Memória do membro (adaptação da memória do Lessie): os critérios que cada pessoa usa
-- nas pesquisas por tese, para sugerir de novo. É pessoal (ninguém mais vê, nem
-- administrador), visível e apagável a qualquer momento, e pode ser pausada.
-- Grava só critérios de pesquisas INICIADAS fora de mandato confidencial: o texto de um
-- critério pode revelar o mandato e sobreviveria à perda de acesso a ele.
CREATE TABLE memoria_criterios (
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  chave TEXT NOT NULL CHECK (chave ~ '^[a-f0-9]{32}$'),
  criterio JSONB NOT NULL,
  usos INTEGER NOT NULL DEFAULT 1 CHECK (usos >= 1),
  primeiro_uso TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, chave)
);
CREATE INDEX memoria_criterios_uso_idx ON memoria_criterios(usuario_id, usos DESC, ultimo_uso DESC);

-- Sem linha, a memória está ligada. Pausar não apaga o que já foi guardado.
CREATE TABLE memoria_preferencias (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios(id),
  ativa BOOLEAN NOT NULL DEFAULT TRUE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
