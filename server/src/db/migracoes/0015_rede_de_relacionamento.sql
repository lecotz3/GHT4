-- Rede de relacionamento: quem a casa conhece, e por quem chega a quem decide.
-- O catálogo cadastral não traz pessoa nenhuma — nem sócio, nem diretor, nem
-- contato. Tudo aqui é conhecimento da casa, digitado por quem o tem, e por
-- isso cada vínculo carrega a evidência que o sustenta e o titular que responde
-- por ele.
CREATE TABLE rede_pessoas (
  id uuid PRIMARY KEY,
  -- Onde a pessoa está no caminho: 'ght4' é por onde um caminho começa,
  -- 'mercado' é onde ele termina, 'externo' é quem faz a ponte sem ser nenhum
  -- dos dois. Um ex-colega que hoje está em outra empresa é 'externo'.
  lado text NOT NULL CHECK (lado IN ('ght4','mercado','externo')),
  nome text NOT NULL,
  cargo text NOT NULL DEFAULT '',
  -- Senioridade é do CARGO, não da pessoa, e existe para responder "quem decide".
  senioridade text NOT NULL DEFAULT 'outro'
    CHECK (senioridade IN ('conselho','ceo','cfo','diretoria','gerencia','outro')),
  organizacao text NOT NULL DEFAULT '',
  organizacao_normalizada text NOT NULL DEFAULT '',
  -- Raiz do CNPJ agrupa matriz e filiais. Grupo econômico com raízes distintas
  -- exige evidência própria e não se deduz daqui.
  empresa_id text,
  -- Pessoa da casa que também tem conta no sistema. Opcional: a rede cobre o
  -- grupo inteiro, e nem todo mundo do grupo usa o console.
  usuario_id uuid REFERENCES usuarios(id),
  email text, telefone text, linkedin text,
  observacoes text NOT NULL DEFAULT '',
  criado_por uuid NOT NULL REFERENCES usuarios(id),
  ativo boolean NOT NULL DEFAULT true,
  versao integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rede_pessoas_empresa_idx ON rede_pessoas(empresa_id) WHERE empresa_id IS NOT NULL;
CREATE INDEX rede_pessoas_organizacao_idx ON rede_pessoas(organizacao_normalizada);
CREATE INDEX rede_pessoas_lado_idx ON rede_pessoas(lado, nome);

-- Vínculo entre duas pessoas, sem direção: conhecer é recíproco. Guardar o par
-- sempre ordenado (a < b) é o que faz a unicidade valer nos dois sentidos —
-- sem isso, A-B e B-A entrariam como dois vínculos e um caminho contaria a
-- mesma relação duas vezes.
CREATE TABLE rede_vinculos (
  id uuid PRIMARY KEY,
  pessoa_a_id uuid NOT NULL REFERENCES rede_pessoas(id),
  pessoa_b_id uuid NOT NULL REFERENCES rede_pessoas(id),
  tipo text NOT NULL CHECK (tipo IN
    ('trabalharam_juntos','relacao_comercial','conselho','formacao','indicacao','evento','familiar','outro')),
  forca text NOT NULL CHECK (forca IN ('direta','indireta','fraca')),
  periodo text NOT NULL DEFAULT '',
  -- Como a casa sabe disso. Sem evidência o vínculo não entra: um caminho de
  -- acesso que ninguém consegue justificar é um convite a uma ligação constrangedora.
  evidencia text NOT NULL,
  /* O que o titular da relação respondeu. É esta coluna, e não a força do
     vínculo, que decide se um caminho pode ser recomendado: quem conhece a
     pessoa e não quer intermediar continua conhecendo, e o caminho continua
     existindo — só não é oferecido. Apagar o vínculo perderia a informação de
     que ele foi avaliado, e alguém o recadastraria semanas depois. */
  disposicao text NOT NULL DEFAULT 'nao_confirmado' CHECK (disposicao IN
    ('nao_confirmado','conheco','posso_apresentar','nao_intermediar','desatualizado')),
  confirmado_por uuid REFERENCES usuarios(id),
  confirmado_em timestamptz,
  criado_por uuid NOT NULL REFERENCES usuarios(id),
  ativo boolean NOT NULL DEFAULT true,
  versao integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rede_vinculos_par_ordenado CHECK (pessoa_a_id < pessoa_b_id),
  UNIQUE (pessoa_a_id, pessoa_b_id, tipo)
);
CREATE INDEX rede_vinculos_a_idx ON rede_vinculos(pessoa_a_id) WHERE ativo;
CREATE INDEX rede_vinculos_b_idx ON rede_vinculos(pessoa_b_id) WHERE ativo;
