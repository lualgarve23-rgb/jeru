-- Atestado de Regularidade: override financeiro justificado pelo Tesoureiro
ALTER TABLE "atestados_regularidade" ADD COLUMN "overrideTesoureiroId" TEXT;
ALTER TABLE "atestados_regularidade" ADD COLUMN "overrideJustificativa" TEXT;
ALTER TABLE "atestados_regularidade" ADD COLUMN "overrideAt" TIMESTAMP(3);

-- Quitte Placet: reconsulta automática do Nada Consta e confirmação pelo Tesoureiro/VM
ALTER TABLE "quitte_placets" ADD COLUMN "quitacaoConsultadaAt" TIMESTAMP(3);
ALTER TABLE "quitte_placets" ADD COLUMN "quitacaoConfirmadaPorId" TEXT;
ALTER TABLE "quitte_placets" ADD COLUMN "quitacaoConfirmadaAt" TIMESTAMP(3);
