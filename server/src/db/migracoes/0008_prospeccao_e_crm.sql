CREATE TABLE agente_selecao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES agente_conversas(id),
  turno_id UUID NOT NULL REFERENCES agente_turnos(id),
  empresa_id TEXT NOT NULL,
  empresa JSONB NOT NULL,
  fontes JSONB NOT NULL,
  frente TEXT NOT NULL CHECK (frente IN ('compra','venda')),
  estado TEXT NOT NULL CHECK (estado IN ('investigar','priorizar','descartar')),
  justificativa TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversa_id,empresa_id,frente)
);

CREATE TABLE crm_oportunidades (
  id UUID PRIMARY KEY,
  selecao_id UUID NOT NULL UNIQUE REFERENCES agente_selecao(id),
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  responsavel_id UUID NOT NULL REFERENCES usuarios(id),
  mandato_id UUID REFERENCES mandatos(id),
  empresa JSONB NOT NULL,
  fontes JSONB NOT NULL,
  frente TEXT NOT NULL CHECK (frente IN ('compra','venda')),
  titulo TEXT NOT NULL,
  objetivo TEXT NOT NULL,
  etapa TEXT NOT NULL DEFAULT 'identificada' CHECK (etapa IN (
    'identificada','qualificada','contatada','conversa_realizada','oportunidade_mandato',
    'proposta_enviada','negociacao','mandato_assinado','nutricao','perdida')),
  proxima_acao TEXT NOT NULL,
  prazo DATE NOT NULL,
  acao_concluida BOOLEAN NOT NULL DEFAULT FALSE,
  versao INTEGER NOT NULL DEFAULT 1,
  criacao_hash TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crm_oportunidades_escopo_idx ON crm_oportunidades(mandato_id,criado_por);
CREATE INDEX crm_oportunidades_prazo_idx ON crm_oportunidades(prazo,id);

CREATE TABLE crm_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id UUID NOT NULL REFERENCES crm_oportunidades(id),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  chave UUID NOT NULL,
  corpo_hash TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('criacao','atualizacao','atividade')),
  descricao TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}',
  ocorrido_em DATE NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (oportunidade_id,chave)
);
CREATE INDEX crm_eventos_oportunidade_idx ON crm_eventos(oportunidade_id,criado_em DESC);
CREATE TRIGGER crm_eventos_sem_update BEFORE UPDATE ON crm_eventos
  FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
CREATE TRIGGER crm_eventos_sem_delete BEFORE DELETE ON crm_eventos
  FOR EACH ROW EXECUTE FUNCTION auditoria_e_imutavel();
