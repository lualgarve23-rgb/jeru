-- Fechamento mensal do balancete (Tesouraria fecha, Conselho registra ciência, quadro consulta)
CREATE TABLE "fechamentos_mes" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "fechadoPorId" TEXT NOT NULL,
    "fechadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receitasCents" INTEGER NOT NULL,
    "despesasCents" INTEGER NOT NULL,
    "saldoCents" INTEGER NOT NULL,
    "observacao" TEXT,
    "cienciaConselhoPorId" TEXT,
    "cienciaConselhoAt" TIMESTAMP(3),
    "reabertoPorId" TEXT,
    "reabertoAt" TIMESTAMP(3),
    "motivoReabertura" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fechamentos_mes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fechamentos_mes_lodgeId_ano_mes_key" ON "fechamentos_mes"("lodgeId", "ano", "mes");

ALTER TABLE "fechamentos_mes" ADD CONSTRAINT "fechamentos_mes_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fechamentos_mes" ADD CONSTRAINT "fechamentos_mes_fechadoPorId_fkey" FOREIGN KEY ("fechadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fechamentos_mes" ADD CONSTRAINT "fechamentos_mes_cienciaConselhoPorId_fkey" FOREIGN KEY ("cienciaConselhoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fechamentos_mes" ADD CONSTRAINT "fechamentos_mes_reabertoPorId_fkey" FOREIGN KEY ("reabertoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
