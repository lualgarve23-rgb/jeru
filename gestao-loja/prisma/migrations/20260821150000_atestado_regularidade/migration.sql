-- CreateEnum
CREATE TYPE "StatusAtestado" AS ENUM ('SOLICITADO', 'ASSINADO');

-- CreateTable
CREATE TABLE "atestados_regularidade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "status" "StatusAtestado" NOT NULL DEFAULT 'SOLICITADO',
    "solicitadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedBySecId" TEXT,
    "signedBySecAt" TIMESTAMP(3),
    "signedByMasterId" TEXT,
    "signedByMasterAt" TIMESTAMP(3),
    "govbrPdf" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "atestados_regularidade_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "atestados_regularidade" ADD CONSTRAINT "atestados_regularidade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "atestados_regularidade" ADD CONSTRAINT "atestados_regularidade_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "atestados_regularidade" ADD CONSTRAINT "atestados_regularidade_signedBySecId_fkey" FOREIGN KEY ("signedBySecId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "atestados_regularidade" ADD CONSTRAINT "atestados_regularidade_signedByMasterId_fkey" FOREIGN KEY ("signedByMasterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
