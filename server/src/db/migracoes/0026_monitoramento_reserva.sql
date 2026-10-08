-- Monitoramento: reserva de execução separada do resultado. Reivindicar uma verificação
-- grava `reservada_ate` (prazo curto); concluir, falhar ou devolver a apaga. A falha
-- (`falha_em`) continua registrada enquanto a nova tentativa calcula e só some com um
-- sucesso. Assim "em andamento" e "falhou" são estados distintos, e uma execução em
-- andamento não é reivindicada de novo por outra aba ou por um pedido de repetição.
-- Execução abandonada (processo interrompido) libera a reserva quando o prazo vence.
ALTER TABLE monitoramentos_tese ADD COLUMN reservada_ate TIMESTAMPTZ;
