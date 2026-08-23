-- CreateEnum
CREATE TYPE "StatusProcessoDoc" AS ENUM ('EM_ASSINATURA', 'ASSINADO');

-- CreateTable
CREATE TABLE "processo_documentos" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "arquivo" BYTEA NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "govbrPdf" BYTEA,
    "status" "StatusProcessoDoc" NOT NULL DEFAULT 'EM_ASSINATURA',
    "criadoPorId" TEXT NOT NULL,
    "pranchaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "processo_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processo_assinantes" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "cargo" "Role" NOT NULL,
    "signedById" TEXT,
    "signedAt" TIMESTAMP(3),
    CONSTRAINT "processo_assinantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processo_documentos_pranchaId_key" ON "processo_documentos"("pranchaId");
CREATE INDEX "processo_documentos_lodgeId_idx" ON "processo_documentos"("lodgeId");
CREATE UNIQUE INDEX "processo_assinantes_documentoId_ordem_key" ON "processo_assinantes"("documentoId", "ordem");

-- AddForeignKey
ALTER TABLE "processo_documentos" ADD CONSTRAINT "processo_documentos_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processo_documentos" ADD CONSTRAINT "processo_documentos_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processo_documentos" ADD CONSTRAINT "processo_documentos_pranchaId_fkey" FOREIGN KEY ("pranchaId") REFERENCES "pranchas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "processo_assinantes" ADD CONSTRAINT "processo_assinantes_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "processo_documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processo_assinantes" ADD CONSTRAINT "processo_assinantes_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
