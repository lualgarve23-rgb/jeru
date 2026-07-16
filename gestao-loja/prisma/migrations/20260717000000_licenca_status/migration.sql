-- Painel de licenças do super admin: status de pagamento via webhook Asaas

CREATE TYPE "LicencaStatus" AS ENUM ('PENDENTE', 'PAGA', 'VENCIDA');

ALTER TABLE "lodges"
  ADD COLUMN "licencaStatus" "LicencaStatus",
  ADD COLUMN "licencaVencimento" TIMESTAMP(3),
  ADD COLUMN "licencaPagaEm" TIMESTAMP(3);

-- Cobranças já emitidas ficam como pendentes até o webhook confirmar
UPDATE "lodges" SET "licencaStatus" = 'PENDENTE'
  WHERE "licencaChargeId" IS NOT NULL;
