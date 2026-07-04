-- CreateEnum
CREATE TYPE "StatusAdmissao" AS ENUM ('DOCUMENTACAO', 'EDITAL_PUBLICADO', 'SINDICANCIA', 'ESCRUTINIO', 'AGUARDANDO_PLACET', 'INICIADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "StatusPlacet" AS ENUM ('PENDENTE', 'EM_ANALISE', 'APROVADO', 'NEGADO');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PENDING_SIGNATURE', 'DEADLINE_WARNING', 'MISSING_DATA', 'FINANCIAL_APPROVAL');

-- CreateTable
CREATE TABLE "processos_admissao" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "nomeCandidato" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" "StatusAdmissao" NOT NULL DEFAULT 'DOCUMENTACAO',
    "certidoesValidas" BOOLEAN NOT NULL DEFAULT false,
    "dataEscrutinio" TIMESTAMP(3),
    "aprovado" BOOLEAN,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processos_admissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quitte_placets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "motivo" TEXT,
    "dataSolicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quitacaoFinanceira" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusPlacet" NOT NULL DEFAULT 'PENDENTE',
    "signedByMasterId" TEXT,
    "signedByMasterAt" TIMESTAMP(3),
    "signedBySecId" TEXT,
    "signedBySecAt" TIMESTAMP(3),
    "driveFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quitte_placets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processos_admissao_lodgeId_idx" ON "processos_admissao"("lodgeId");

-- CreateIndex
CREATE INDEX "quitte_placets_lodgeId_idx" ON "quitte_placets"("lodgeId");

-- CreateIndex
CREATE INDEX "notifications_lodgeId_idx" ON "notifications"("lodgeId");

-- AddForeignKey
ALTER TABLE "processos_admissao" ADD CONSTRAINT "processos_admissao_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quitte_placets" ADD CONSTRAINT "quitte_placets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quitte_placets" ADD CONSTRAINT "quitte_placets_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quitte_placets" ADD CONSTRAINT "quitte_placets_signedByMasterId_fkey" FOREIGN KEY ("signedByMasterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quitte_placets" ADD CONSTRAINT "quitte_placets_signedBySecId_fkey" FOREIGN KEY ("signedBySecId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
