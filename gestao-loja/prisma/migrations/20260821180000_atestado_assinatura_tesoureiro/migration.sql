-- Assinatura do Tesoureiro no Atestado de Regularidade
ALTER TABLE "atestados_regularidade" ADD COLUMN "signedByTesId" TEXT;
ALTER TABLE "atestados_regularidade" ADD COLUMN "signedByTesAt" TIMESTAMP(3);
ALTER TABLE "atestados_regularidade" ADD CONSTRAINT "atestados_regularidade_signedByTesId_fkey" FOREIGN KEY ("signedByTesId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
