-- Excluir um trabalho do "Continue de onde parou" só o tira da lista do dono.
-- Turnos, seleção, pesquisas e registros do CRM apontam para a conversa e a
-- auditoria precisa do histórico, então a linha fica e ganha a data do arquivamento.
ALTER TABLE agente_conversas ADD COLUMN arquivada_em TIMESTAMPTZ;
