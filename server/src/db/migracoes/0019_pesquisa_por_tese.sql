-- Pesquisa por tese: critérios verificáveis, revisão empresa a empresa e evidência pública.
--
-- Atributos públicos do cadastro passam a acompanhar cada registro publicado.
-- Snapshots anteriores ficam com '{}' (o gatilho de imutabilidade barra UPDATE):
-- a revisão trata a ausência como "dado não importado", nunca como "não atende".
-- A próxima importação do catálogo publica um snapshot novo já com os atributos.
ALTER TABLE catalogo_registros ADD COLUMN atributos JSONB NOT NULL DEFAULT '{}';

CREATE TABLE pesquisas_tese (
  id UUID PRIMARY KEY,
  conversa_id UUID NOT NULL REFERENCES agente_conversas(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  anterior_id UUID REFERENCES pesquisas_tese(id),
  tese TEXT NOT NULL CHECK (length(tese) BETWEEN 3 AND 2000),
  frente TEXT NOT NULL CHECK (frente IN ('compra','venda')),
  filtros JSONB NOT NULL,
  criterios JSONB NOT NULL,
  meta INTEGER NOT NULL CHECK (meta BETWEEN 1 AND 200),
  limite_web INTEGER NOT NULL CHECK (limite_web BETWEEN 0 AND 500),
  catalogo_hash TEXT NOT NULL CHECK (catalogo_hash ~ '^[a-f0-9]{64}$'),
  referencia TEXT NOT NULL,
  funil JSONB NOT NULL,
  estado TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','pronta','em_andamento','pausada','concluida')),
  motivo_estado TEXT,
  modo TEXT NOT NULL,
  notas JSONB NOT NULL DEFAULT '[]',
  turno_id UUID REFERENCES agente_turnos(id),
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pesquisas_tese_usuario_idx ON pesquisas_tese(usuario_id, atualizado_em DESC);
CREATE INDEX pesquisas_tese_conversa_idx ON pesquisas_tese(conversa_id, criado_em DESC);

-- Só entram empresas que passaram nos critérios cadastrais obrigatórios; as
-- reprovadas viram contagem no funil, com o critério que as eliminou.
CREATE TABLE pesquisa_itens (
  pesquisa_id UUID NOT NULL REFERENCES pesquisas_tese(id),
  empresa_id TEXT NOT NULL CHECK (empresa_id ~ '^cnpj\d{8}$'),
  ordem INTEGER NOT NULL,
  empresa JSONB NOT NULL,
  etapa TEXT NOT NULL CHECK (etapa IN ('aguardando','em_revisao','revisada')),
  reservado_em TIMESTAMPTZ,
  tentativas INTEGER NOT NULL DEFAULT 0,
  vereditos JSONB NOT NULL,
  aderencia INTEGER NOT NULL CHECK (aderencia BETWEEN 0 AND 100),
  categoria TEXT NOT NULL CHECK (categoria IN ('aderente','provavel','a_confirmar','nao_aderente')),
  site JSONB,
  revisado_em TIMESTAMPTZ,
  PRIMARY KEY (pesquisa_id, empresa_id)
);
CREATE INDEX pesquisa_itens_fila_idx ON pesquisa_itens(pesquisa_id, etapa, ordem);

-- Páginas públicas lidas na revisão. Cache compartilhado: o mesmo site não é
-- baixado de novo por outra pesquisa dentro do prazo de validade.
CREATE TABLE paginas_publicas (
  url TEXT PRIMARY KEY,
  dominio TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('ok','bloqueada','falhou','sem_html')),
  titulo TEXT,
  texto TEXT,
  links JSONB NOT NULL DEFAULT '[]',
  hash TEXT,
  obtida_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX paginas_publicas_dominio_idx ON paginas_publicas(dominio);
