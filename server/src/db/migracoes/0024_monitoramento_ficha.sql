-- Monitoramento: reserva com prazo curto e ficha de execução. Reivindicar uma
-- verificação incrementa `execucao` e reserva só por alguns minutos; a próxima data
-- semanal é gravada ao concluir, e só por quem ainda tem a ficha vigente. Assim um
-- processo interrompido no meio não empurra a verificação uma semana, e desligar
-- ou religar durante o cálculo invalida o resultado em voo.
-- `cobertura` guarda o quanto do recorte a verificação consegue avaliar: com o
-- limite de empresas por recorte, a ausência de novidades pode ser parcial.
ALTER TABLE monitoramentos_tese ADD COLUMN execucao INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monitoramentos_tese ADD COLUMN cobertura JSONB;
