-- AlterTable
ALTER TABLE "lodges" ADD COLUMN "asaasApiKey" TEXT,
                     ADD COLUMN "asaasWebhookToken" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "asaasCustomerId" TEXT,
                    ADD COLUMN "asaasSubscriptionId" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "gatewayInvoiceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_gatewayChargeId_key" ON "invoices"("gatewayChargeId");
