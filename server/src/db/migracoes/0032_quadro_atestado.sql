-- O que o quadro estatutário (Receita Federal) atestou de cada dirigente importado: nome, cargo,
-- senioridade e empresa. A linha pode ser editada depois pela Rede e continua com origem pública;
-- só vale como prova do quadro enquanto esses campos forem os atestados (parecer do Codex sobre a
-- Rodada 26: a precedência estatutária não pode valer para um cargo escrito à mão).
ALTER TABLE rede_pessoas ADD COLUMN quadro jsonb;

-- Dirigentes já importados e nunca editados pela Rede: o que está na linha é o que o quadro atestou.
-- Os editados ficam sem atestado até a próxima importação, que o grava de novo.
UPDATE rede_pessoas p
   SET quadro = jsonb_build_object('nome', p.nome, 'cargo', p.cargo, 'senioridade', p.senioridade, 'empresaId', p.empresa_id)
 WHERE p.origem = 'cadastro_publico'
   AND NOT EXISTS (SELECT 1 FROM auditoria a WHERE a.entidade = 'rede_pessoa' AND a.entidade_id = p.id::text
                     AND a.acao IN ('editar', 'desativar', 'vincular_empresa'));
