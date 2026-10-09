-- Registro da execução da pesquisa por tese (adaptação do fluxo de eventos tipados do Lessie:
-- agente, critérios, cartões, eventos). Em vez de uma conexão aberta (SSE), que a função
-- serverless corta, cada passo vira uma linha que a tela lê por cursor (id) enquanto acompanha.
-- Só aceita INSERT. Guarda contagens, nomes de empresa, motivos e o critério tocado; nunca trecho
-- de site nem texto de documento.
CREATE TABLE pesquisa_eventos (
  id BIGSERIAL PRIMARY KEY,
  pesquisa_id UUID NOT NULL REFERENCES pesquisas_tese(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('criterios', 'funil', 'retomada', 'lote', 'pausa', 'conclusao',
    'revisao_humana', 'ajuste', 'entrega', 'monitoramento')),
  dados JSONB NOT NULL DEFAULT '{}',
  usuario_id UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pesquisa_eventos_cursor_idx ON pesquisa_eventos(pesquisa_id, id);

CREATE TRIGGER pesquisa_eventos_sem_update BEFORE UPDATE ON pesquisa_eventos
  FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
CREATE TRIGGER pesquisa_eventos_sem_delete BEFORE DELETE ON pesquisa_eventos
  FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
