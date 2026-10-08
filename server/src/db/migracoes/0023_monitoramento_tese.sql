-- Monitoramento semanal de uma pesquisa por tese. Uma vez por semana (na primeira
-- visita ao Meu dia depois do vencimento) o funil cadastral é refeito sobre o
-- catálogo vigente, sem ler sites nem usar IA, e o que mudou vira novidade:
--   nova   empresa que passou a atender aos critérios cadastrais;
--   evento empresa da pesquisa com evento societário novo no cadastro.
-- `conhecidas` é a linha de base (o que a pessoa já viu); `ultimo_evento` é o maior
-- id de evento já considerado, para não repetir o mesmo evento.
CREATE TABLE monitoramentos_tese (
  pesquisa_id UUID PRIMARY KEY REFERENCES pesquisas_tese(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  conhecidas TEXT[] NOT NULL DEFAULT '{}',
  ultimo_evento BIGINT NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  verificado_em TIMESTAMPTZ,
  proxima_em TIMESTAMPTZ NOT NULL,
  ultimo_resultado JSONB
);
CREATE INDEX monitoramentos_tese_vencidos ON monitoramentos_tese (usuario_id, proxima_em) WHERE ativo;

CREATE TABLE monitoramento_novidades (
  id BIGSERIAL PRIMARY KEY,
  pesquisa_id UUID NOT NULL REFERENCES pesquisas_tese(id),
  empresa_id TEXT NOT NULL CHECK (empresa_id ~ '^cnpj\d{8}$'),
  tipo TEXT NOT NULL CHECK (tipo IN ('nova', 'evento')),
  empresa JSONB NOT NULL,
  detalhe TEXT,
  detectado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  vista_em TIMESTAMPTZ
);
CREATE INDEX monitoramento_novidades_abertas ON monitoramento_novidades (pesquisa_id) WHERE vista_em IS NULL;
