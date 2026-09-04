-- Quitte Placet: assinatura do Orador (cargo do rito) entre o Secretário e o VM
ALTER TABLE "quitte_placets" ADD COLUMN "signedByOradorId" TEXT;
ALTER TABLE "quitte_placets" ADD COLUMN "signedByOradorAt" TIMESTAMP(3);
ALTER TABLE "quitte_placets" ADD CONSTRAINT "quitte_placets_signedByOradorId_fkey" FOREIGN KEY ("signedByOradorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sessão em que o pedido foi comunicado à Loja + ata dessa sessão (exigidas antes das assinaturas)
ALTER TABLE "quitte_placets" ADD COLUMN "dataSessaoComunicacao" TIMESTAMP(3);
ALTER TABLE "quitte_placets" ADD COLUMN "ataArquivo" BYTEA;
ALTER TABLE "quitte_placets" ADD COLUMN "ataNome" TEXT;
ALTER TABLE "quitte_placets" ADD COLUMN "ataMime" TEXT;
