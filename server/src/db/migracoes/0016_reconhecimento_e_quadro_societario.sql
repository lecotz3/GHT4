-- De onde veio cada pessoa da rede. Um nome digitado por quem conhece a pessoa
-- e um nome lido do quadro societário público não merecem a mesma confiança nem
-- o mesmo tratamento: o segundo é dado pessoal de terceiro, entrou sem que o
-- titular soubesse, e precisa poder ser localizado e removido em bloco.
ALTER TABLE rede_pessoas ADD COLUMN origem text NOT NULL DEFAULT 'manual'
  CHECK (origem IN ('manual','cadastro_publico'));
ALTER TABLE rede_pessoas ADD COLUMN origem_referencia text NOT NULL DEFAULT '';
ALTER TABLE rede_pessoas ADD COLUMN nome_normalizado text NOT NULL DEFAULT '';

-- Reimportar o mesmo mês não pode duplicar ninguém. A chave é a empresa mais o
-- nome normalizado, porque o quadro societário não publica identificador
-- estável de pessoa — o CPF vem mascarado, e é assim que deve ficar.
CREATE UNIQUE INDEX rede_pessoas_quadro_idx ON rede_pessoas(empresa_id, nome_normalizado)
  WHERE origem = 'cadastro_publico';
CREATE INDEX rede_pessoas_homonimos_idx ON rede_pessoas(nome_normalizado);

/* A passada de reconhecimento: mostrar a alguém da casa os nomes que mandam numa
   empresa e perguntar "conhece?".

   O "não conheço" é registrado, e essa é a razão de a tabela existir. Sem ele o
   produto não distingue "a rede não foi consultada" de "foi consultada e não há
   caminho" — distinção que o plano de relações exige, e que é a diferença entre
   ir buscar outra via e desistir da empresa. Também evita que o mesmo par seja
   perguntado de novo daqui a um mês por outro analista.

   Uma resposta positiva cria o vínculo e guarda o id dele aqui; assim a resposta
   continua rastreável mesmo que o vínculo seja depois desativado. */
CREATE TABLE rede_reconhecimentos (
  id uuid PRIMARY KEY,
  pessoa_ght4_id uuid NOT NULL REFERENCES rede_pessoas(id),
  pessoa_alvo_id uuid NOT NULL REFERENCES rede_pessoas(id),
  resposta text NOT NULL CHECK (resposta IN ('nao_conheco','talvez','conheco','posso_apresentar')),
  observacao text NOT NULL DEFAULT '',
  vinculo_id uuid REFERENCES rede_vinculos(id),
  -- Quem digitou. Pode não ser o titular da relação: um analista anota o que o
  -- sócio respondeu, e a trilha guarda os dois fatos separados.
  registrado_por uuid NOT NULL REFERENCES usuarios(id),
  respondido_em timestamptz NOT NULL DEFAULT now(),
  versao integer NOT NULL DEFAULT 1,
  CONSTRAINT rede_reconhecimentos_pessoas_distintas CHECK (pessoa_ght4_id <> pessoa_alvo_id),
  UNIQUE (pessoa_ght4_id, pessoa_alvo_id)
);
CREATE INDEX rede_reconhecimentos_alvo_idx ON rede_reconhecimentos(pessoa_alvo_id);
CREATE INDEX rede_reconhecimentos_casa_idx ON rede_reconhecimentos(pessoa_ght4_id, respondido_em DESC);
