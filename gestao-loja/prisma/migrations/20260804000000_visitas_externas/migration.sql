-- Visitas dos irmãos da Loja a outras oficinas — entram no histórico do membro
CREATE TABLE "visitas_externas" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "lojaVisitada" TEXT NOT NULL,
    "potencia" TEXT,
    "oriente" TEXT,
    "observacao" TEXT,
    "registradaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitas_externas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visitas_externas_lodgeId_idx" ON "visitas_externas"("lodgeId");
CREATE INDEX "visitas_externas_userId_idx" ON "visitas_externas"("userId");

ALTER TABLE "visitas_externas" ADD CONSTRAINT "visitas_externas_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visitas_externas" ADD CONSTRAINT "visitas_externas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visitas_externas" ADD CONSTRAINT "visitas_externas_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
