-- Revisão humana de um veredito (adaptação da visão versionada com campos travados do Lessie).
-- O membro confirma, contesta ou deixa em aberto um critério de uma empresa já revisada, com
-- justificativa. O veredito passa a ter lastro 'humano'. A revisão automática nunca volta a uma
-- empresa revisada, então a decisão humana fica travada. Cada mudança é uma versão nesta tabela,
-- que só aceita INSERT; desfazer é uma versão nova que devolve o veredito automático guardado.
CREATE TABLE pesquisa_revisoes (
  id BIGSERIAL PRIMARY KEY,
  pesquisa_id UUID NOT NULL,
  empresa_id TEXT NOT NULL CHECK (empresa_id ~ '^cnpj\d{8}$'),
  criterio_id TEXT NOT NULL,
  acao TEXT NOT NULL CHECK (acao IN ('revisar', 'desfazer')),
  antes JSONB NOT NULL,
  depois JSONB NOT NULL,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (pesquisa_id, empresa_id) REFERENCES pesquisa_itens(pesquisa_id, empresa_id)
);
CREATE INDEX pesquisa_revisoes_item_idx ON pesquisa_revisoes(pesquisa_id, empresa_id, id);

CREATE TRIGGER pesquisa_revisoes_sem_update BEFORE UPDATE ON pesquisa_revisoes
  FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
CREATE TRIGGER pesquisa_revisoes_sem_delete BEFORE DELETE ON pesquisa_revisoes
  FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
