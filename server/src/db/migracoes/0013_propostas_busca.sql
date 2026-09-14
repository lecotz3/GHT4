CREATE TABLE agente_propostas_aplicadas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversa_id uuid NOT NULL REFERENCES agente_conversas(id),
 turno_id uuid NOT NULL REFERENCES agente_turnos(id),
 usuario_id uuid NOT NULL REFERENCES usuarios(id),
 chave uuid NOT NULL,
 corpo_hash text NOT NULL,
 proposta_hash text NOT NULL,
 filtros jsonb NOT NULL,
 versao_conversa integer NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(conversa_id,chave)
);
CREATE INDEX agente_propostas_por_conversa ON agente_propostas_aplicadas(conversa_id,versao_conversa DESC);
CREATE TRIGGER agente_propostas_sem_update BEFORE UPDATE ON agente_propostas_aplicadas FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
CREATE TRIGGER agente_propostas_sem_delete BEFORE DELETE ON agente_propostas_aplicadas FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
