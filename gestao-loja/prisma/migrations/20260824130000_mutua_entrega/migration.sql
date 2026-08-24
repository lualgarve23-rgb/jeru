-- Mútua (CABM): entrega do Form. 108 (Declaração de Beneficiários) pelo irmão
CREATE TABLE "mutua_entregas" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "arquivo" BYTEA NOT NULL,
    "enviadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mutua_entregas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mutua_entregas_userId_key" ON "mutua_entregas"("userId");

CREATE INDEX "mutua_entregas_lodgeId_idx" ON "mutua_entregas"("lodgeId");

ALTER TABLE "mutua_entregas" ADD CONSTRAINT "mutua_entregas_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mutua_entregas" ADD CONSTRAINT "mutua_entregas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
