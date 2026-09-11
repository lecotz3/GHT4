CREATE TABLE crm_registros (
 id uuid PRIMARY KEY,
 serie_id uuid NOT NULL,
 oportunidade_id uuid NOT NULL REFERENCES crm_oportunidades(id),
 tipo text NOT NULL CHECK (tipo IN ('evidencia','relacao','tese','comparavel','noticia','passagem')),
 versao integer NOT NULL,
 dados jsonb NOT NULL,
 revisado boolean NOT NULL DEFAULT false,
 usuario_id uuid NOT NULL REFERENCES usuarios(id),
 criado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(serie_id,versao)
);
CREATE INDEX crm_registros_por_oportunidade ON crm_registros(oportunidade_id,tipo,serie_id,versao DESC);
CREATE TRIGGER crm_registros_sem_update BEFORE UPDATE ON crm_registros FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
CREATE TRIGGER crm_registros_sem_delete BEFORE DELETE ON crm_registros FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
CREATE TABLE crm_documentos (
 id uuid PRIMARY KEY,
 oportunidade_id uuid NOT NULL REFERENCES crm_oportunidades(id),
 usuario_id uuid NOT NULL REFERENCES usuarios(id),
 nome text NOT NULL,
 formato text NOT NULL,
 hash text NOT NULL,
 tamanho integer NOT NULL,
 conteudo bytea NOT NULL,
 trechos jsonb NOT NULL,
 estado text NOT NULL CHECK(estado IN ('extraido','sem_texto','falha_extracao')),
 criado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(oportunidade_id,hash)
);
CREATE TRIGGER crm_documentos_sem_update BEFORE UPDATE ON crm_documentos FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
CREATE TRIGGER crm_documentos_sem_delete BEFORE DELETE ON crm_documentos FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
CREATE TABLE agente_exportacoes (
 id uuid PRIMARY KEY,
 usuario_id uuid NOT NULL REFERENCES usuarios(id),
 mandato_id uuid REFERENCES mandatos(id),
 oportunidade_id uuid REFERENCES crm_oportunidades(id),
 conversa_id uuid REFERENCES agente_conversas(id),
 payload jsonb NOT NULL,
 hash_pedido text NOT NULL,
 hash text NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER agente_exportacoes_sem_update BEFORE UPDATE ON agente_exportacoes FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
CREATE TRIGGER agente_exportacoes_sem_delete BEFORE DELETE ON agente_exportacoes FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
