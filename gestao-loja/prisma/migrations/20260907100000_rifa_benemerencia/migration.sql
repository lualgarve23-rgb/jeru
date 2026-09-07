-- Rifa de Benemerência: campanha (VM/Esmoler) e números reservados pelos irmãos
CREATE TABLE "rifas" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "sorteioEm" TIMESTAMP(3) NOT NULL,
    "quantidadeNumeros" INTEGER NOT NULL,
    "valorCents" INTEGER NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "numeroSorteado" INTEGER,
    "ganhadorId" TEXT,
    "sorteadoPorId" TEXT,
    "sorteadoAt" TIMESTAMP(3),
    "observacaoSorteio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rifas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rifa_numeros" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "rifaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "pago" BOOLEAN NOT NULL DEFAULT false,
    "pagoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rifa_numeros_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rifas_lodgeId_ativa_idx" ON "rifas"("lodgeId", "ativa");
CREATE UNIQUE INDEX "rifa_numeros_rifaId_numero_key" ON "rifa_numeros"("rifaId", "numero");
CREATE INDEX "rifa_numeros_lodgeId_userId_idx" ON "rifa_numeros"("lodgeId", "userId");

ALTER TABLE "rifas" ADD CONSTRAINT "rifas_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rifas" ADD CONSTRAINT "rifas_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rifas" ADD CONSTRAINT "rifas_ganhadorId_fkey" FOREIGN KEY ("ganhadorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rifas" ADD CONSTRAINT "rifas_sorteadoPorId_fkey" FOREIGN KEY ("sorteadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rifa_numeros" ADD CONSTRAINT "rifa_numeros_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rifa_numeros" ADD CONSTRAINT "rifa_numeros_rifaId_fkey" FOREIGN KEY ("rifaId") REFERENCES "rifas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rifa_numeros" ADD CONSTRAINT "rifa_numeros_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rifa_numeros" ADD CONSTRAINT "rifa_numeros_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
