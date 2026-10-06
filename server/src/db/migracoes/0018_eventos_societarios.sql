-- Eventos societários por diferença entre dois meses do CNPJ. A mesma comparação
-- reimportada não pode duplicar: a identidade do evento é a empresa, o tipo de
-- origem e o período comparado.
CREATE UNIQUE INDEX eventos_diferenca_unicos ON eventos_corporativos
  (entidade_id, (detalhes->>'tipoOrigem'), (detalhes->>'periodo'))
  WHERE metodo = 'diferenca_snapshot';
CREATE INDEX eventos_recentes_idx ON eventos_corporativos (entidade_id, detectado_em DESC) WHERE tipo <> 'outro';
