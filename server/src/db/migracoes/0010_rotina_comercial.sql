CREATE TABLE crm_tarefas (
 id uuid PRIMARY KEY,
 oportunidade_id uuid NOT NULL REFERENCES crm_oportunidades(id),
 responsavel_id uuid NOT NULL REFERENCES usuarios(id),
 descricao text NOT NULL,
 tipo text NOT NULL CHECK (tipo IN ('pesquisa','contato','reuniao','documento','interno')),
 prazo date NOT NULL,
 concluida boolean NOT NULL DEFAULT false,
 versao integer NOT NULL DEFAULT 1,
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_tarefas_prazos ON crm_tarefas(responsavel_id,prazo) WHERE NOT concluida;
ALTER TABLE crm_eventos DROP CONSTRAINT crm_eventos_tipo_check;
ALTER TABLE crm_eventos ADD CONSTRAINT crm_eventos_tipo_check CHECK (tipo IN ('criacao','atualizacao','atividade','tarefa','restricao'));
CREATE TABLE crm_restricoes_contato (
 escopo text NOT NULL,
 empresa_id text NOT NULL,
 ativa boolean NOT NULL,
 categoria text NOT NULL,
 motivo text NOT NULL,
 usuario_id uuid NOT NULL REFERENCES usuarios(id),
 versao integer NOT NULL DEFAULT 1,
 atualizado_em timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (escopo,empresa_id)
);
