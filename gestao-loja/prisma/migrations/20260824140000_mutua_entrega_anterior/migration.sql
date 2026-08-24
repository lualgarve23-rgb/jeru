-- Mútua: registro de entrega anterior à implantação do sistema (sem anexo),
-- marcado pelo Secretário ou Venerável Mestre
ALTER TABLE "mutua_entregas" ALTER COLUMN "nome" DROP NOT NULL;
ALTER TABLE "mutua_entregas" ALTER COLUMN "mimeType" DROP NOT NULL;
ALTER TABLE "mutua_entregas" ALTER COLUMN "sizeBytes" DROP NOT NULL;
ALTER TABLE "mutua_entregas" ALTER COLUMN "arquivo" DROP NOT NULL;
ALTER TABLE "mutua_entregas" ADD COLUMN "entregueAntes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mutua_entregas" ADD COLUMN "marcadaPor" TEXT;
