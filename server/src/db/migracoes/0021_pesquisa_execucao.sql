-- Geração de execução da pesquisa por tese. Cada retomada explícita (pronta ou
-- pausada → em_andamento) incrementa o número; um lote só reserva empresas e só
-- grava o estado final enquanto a pesquisa continua em andamento NA SUA geração.
-- Assim uma pausa pedida durante o lote não é desfeita quando ele termina, e um
-- lote antigo não sobrescreve a retomada feita em outra aba.
ALTER TABLE pesquisas_tese ADD COLUMN execucao INTEGER NOT NULL DEFAULT 0;
