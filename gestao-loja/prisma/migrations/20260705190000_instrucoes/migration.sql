ALTER TABLE "lodges" ADD COLUMN "instrucoesAprendiz" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "lodges" ADD COLUMN "instrucoesCompanheiro" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "instrucoes" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "degree" "Degree" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tema" TEXT,
    "registradaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instrucoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "instrucoes_lodgeId_idx" ON "instrucoes"("lodgeId");
CREATE INDEX "instrucoes_userId_idx" ON "instrucoes"("userId");
ALTER TABLE "instrucoes" ADD CONSTRAINT "instrucoes_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "instrucoes" ADD CONSTRAINT "instrucoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "instrucoes" ADD CONSTRAINT "instrucoes_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
