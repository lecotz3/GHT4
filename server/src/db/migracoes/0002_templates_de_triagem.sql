-- =============================================================================
--  0002 · templates de triagem, versionados
-- -----------------------------------------------------------------------------
--  Até aqui o template vivia em `localStorage` sob a chave `ght4.templates.v1`,
--  no navegador de uma pessoa. Isso tem dois problemas que o documento de
--  requisitos trata como requisito, não como melhoria:
--
--    · o time não compartilha a régua de triagem;
--    · não há como saber com QUAL régua uma lista foi produzida, porque salvar
--      por cima apaga a anterior.
--
--  O segundo é o que importa numa boutique de M&A. "Por que esta empresa entrou
--  na shortlist?" só tem resposta se a versão da regra usada ainda existir.
--
--  Por isso: template é a identidade estável, versão é imutável.
--  Editar não altera a versão anterior; cria a próxima.
-- =============================================================================

CREATE TABLE templates_triagem (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Escopo: template de um mandato não vaza para outro. NULL = da casa toda.
  mandato_id     UUID REFERENCES mandatos (id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  descricao      TEXT,
  arquivado      BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por     UUID NOT NULL REFERENCES usuarios (id)
);

-- Nome único por escopo, ignorando arquivados: dois "Distribuição — sucessão"
-- ativos ao mesmo tempo garantem que alguém vai usar o errado.
CREATE UNIQUE INDEX templates_nome_por_mandato_idx
  ON templates_triagem (COALESCE(mandato_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome))
  WHERE arquivado = FALSE;

CREATE INDEX templates_mandato_idx ON templates_triagem (mandato_id);

-- -----------------------------------------------------------------------------
--  Versões — imutáveis depois de usadas
-- -----------------------------------------------------------------------------
CREATE TABLE templates_versoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES templates_triagem (id) ON DELETE CASCADE,
  versao        INTEGER NOT NULL,
  -- A régua em si: filtros duros, preferências, pesos, política de dado ausente.
  configuracao  JSONB NOT NULL,
  -- Hash do conteúdo: dois templates com a mesma régua são reconhecíveis, e
  -- adulteração fica detectável.
  conteudo_hash TEXT NOT NULL,
  nota          TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por    UUID NOT NULL REFERENCES usuarios (id),
  -- Marcada quando a versão produz o primeiro resultado oficial. A partir daí
  -- ela não pode mais ser apagada: há lista que depende dela para se explicar.
  usada_em      TIMESTAMPTZ,

  UNIQUE (template_id, versao)
);

CREATE INDEX templates_versoes_template_idx ON templates_versoes (template_id, versao DESC);

-- Versão já usada é imutável, e a regra é do banco.
CREATE OR REPLACE FUNCTION versao_usada_e_imutavel() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.usada_em IS NOT NULL THEN
    -- Marcar como usada de novo (idempotente) é o único UPDATE aceito.
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'versão de template já usada não pode ser apagada: há resultado que depende dela';
    END IF;
    IF NEW.configuracao IS DISTINCT FROM OLD.configuracao
       OR NEW.conteudo_hash IS DISTINCT FROM OLD.conteudo_hash
       OR NEW.versao IS DISTINCT FROM OLD.versao THEN
      RAISE EXCEPTION 'versão de template já usada é imutável: crie a próxima versão';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER templates_versoes_imutaveis
  BEFORE UPDATE OR DELETE ON templates_versoes
  FOR EACH ROW EXECUTE FUNCTION versao_usada_e_imutavel();
