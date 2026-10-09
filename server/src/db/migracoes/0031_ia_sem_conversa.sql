-- Leitura do pedido do "encontrar quem decide" com IA (encontrar/ia.mjs): é um pedido à IA sem
-- conversa do agente, quando feito fora de uma pesquisa por tese. Ele passa pela mesma reserva e
-- pela mesma cota de `ia_execucoes`; sem conversa, a chave de idempotência vale por pessoa.
ALTER TABLE ia_execucoes ALTER COLUMN conversa_id DROP NOT NULL;
CREATE UNIQUE INDEX ia_execucoes_sem_conversa ON ia_execucoes (usuario_id, chave) WHERE conversa_id IS NULL;
