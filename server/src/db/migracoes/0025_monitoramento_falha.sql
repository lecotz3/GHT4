-- Monitoramento: falha registrada. Uma verificação que falha reagenda a próxima
-- tentativa automática e grava `falha_em`; o sucesso seguinte a apaga. Assim o Meu
-- dia distingue "nada para verificar agora" de "verificado com sucesso": uma chamada
-- que não executou nada não esconde a falha anterior.
ALTER TABLE monitoramentos_tese ADD COLUMN falha_em TIMESTAMPTZ;
