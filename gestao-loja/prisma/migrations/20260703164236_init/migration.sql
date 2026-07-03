-- CreateEnum
CREATE TYPE "Degree" AS ENUM ('APRENDIZ', 'COMPANHEIRO', 'MESTRE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'VENERAVEL_MESTRE', 'SECRETARIO', 'TESOUREIRO', 'CONSELHO_CONTAS');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ATIVO', 'IRREGULAR', 'LICENCIADO', 'EX_MEMBRO');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('ORDINARIA', 'MAGNA', 'ECONOMICA', 'BRANCA');

-- CreateEnum
CREATE TYPE "AtaStatus" AS ENUM ('RASCUNHO', 'AGUARDANDO_ASSINATURAS', 'ASSINADA');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ATA_ESCANEADA', 'HISTORICO', 'REGULAMENTO', 'FINANCEIRO', 'OUTRO');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDENTE', 'PAGA', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CARTAO', 'BOLETO', 'DINHEIRO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDENTE_APROVACAO', 'APROVADA', 'PAGA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "DonationType" AS ENUM ('TRONCO_SOLIDARIEDADE', 'INGRESSO_EVENTO', 'DOACAO_AVULSA');

-- CreateTable
CREATE TABLE "lodges" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "potencia" TEXT,
    "oriente" TEXT,
    "driveFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lodges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "cim" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "birthDate" TIMESTAMP(3),
    "profession" TEXT,
    "passwordHash" TEXT NOT NULL,
    "degree" "Degree" NOT NULL DEFAULT 'APRENDIZ',
    "currentRole" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "MemberStatus" NOT NULL DEFAULT 'ATIVO',
    "initiationDate" TIMESTAMP(3),
    "isDataPublic" BOOLEAN NOT NULL DEFAULT false,
    "showEmail" BOOLEAN NOT NULL DEFAULT false,
    "showPhone" BOOLEAN NOT NULL DEFAULT false,
    "showAddress" BOOLEAN NOT NULL DEFAULT false,
    "showBirthDate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "degree_history" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "degree" "Degree" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ataId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "degree_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_history" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lodge_sessions" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "SessionType" NOT NULL DEFAULT 'ORDINARIA',
    "degree" "Degree" NOT NULL DEFAULT 'APRENDIZ',
    "qrToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lodge_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "visitorName" TEXT,
    "visitorCim" TEXT,
    "visitorLodge" TEXT,
    "visitorPotencia" TEXT,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viaQrCode" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atas" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AtaStatus" NOT NULL DEFAULT 'RASCUNHO',
    "signedByMasterId" TEXT,
    "signedByMasterAt" TIMESTAMP(3),
    "signedBySecId" TEXT,
    "signedBySecAt" TIMESTAMP(3),
    "driveFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pranchas" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "driveFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pranchas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'OUTRO',
    "driveFileId" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "referenceMonth" INTEGER NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDENTE',
    "pixTxid" TEXT,
    "pixCopiaECola" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidMethod" "PaymentMethod",
    "gatewayChargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT,
    "amountCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDENTE_APROVACAO',
    "approvedByMasterId" TEXT,
    "approvedByMasterAt" TIMESTAMP(3),
    "approvedByTreasurerId" TEXT,
    "approvedByTreasurerAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "invoiceId" TEXT,
    "expenseId" TEXT,
    "donationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT,
    "eventId" TEXT,
    "type" "DonationType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charity_events" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ticketPriceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lodges_number_key" ON "lodges"("number");

-- CreateIndex
CREATE UNIQUE INDEX "users_cim_key" ON "users"("cim");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_lodgeId_idx" ON "users"("lodgeId");

-- CreateIndex
CREATE INDEX "degree_history_lodgeId_idx" ON "degree_history"("lodgeId");

-- CreateIndex
CREATE INDEX "degree_history_userId_idx" ON "degree_history"("userId");

-- CreateIndex
CREATE INDEX "role_history_lodgeId_idx" ON "role_history"("lodgeId");

-- CreateIndex
CREATE INDEX "role_history_userId_idx" ON "role_history"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "lodge_sessions_qrToken_key" ON "lodge_sessions"("qrToken");

-- CreateIndex
CREATE INDEX "lodge_sessions_lodgeId_idx" ON "lodge_sessions"("lodgeId");

-- CreateIndex
CREATE INDEX "attendances_lodgeId_idx" ON "attendances"("lodgeId");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_sessionId_userId_key" ON "attendances"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "atas_sessionId_key" ON "atas"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "atas_lodgeId_number_key" ON "atas"("lodgeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "pranchas_lodgeId_year_number_key" ON "pranchas"("lodgeId", "year", "number");

-- CreateIndex
CREATE INDEX "documents_lodgeId_idx" ON "documents"("lodgeId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_pixTxid_key" ON "invoices"("pixTxid");

-- CreateIndex
CREATE INDEX "invoices_lodgeId_idx" ON "invoices"("lodgeId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_lodgeId_userId_referenceYear_referenceMonth_key" ON "invoices"("lodgeId", "userId", "referenceYear", "referenceMonth");

-- CreateIndex
CREATE INDEX "expenses_lodgeId_idx" ON "expenses"("lodgeId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_invoiceId_key" ON "transactions"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_expenseId_key" ON "transactions"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_donationId_key" ON "transactions"("donationId");

-- CreateIndex
CREATE INDEX "transactions_lodgeId_date_idx" ON "transactions"("lodgeId", "date");

-- CreateIndex
CREATE INDEX "donations_lodgeId_idx" ON "donations"("lodgeId");

-- CreateIndex
CREATE INDEX "charity_events_lodgeId_idx" ON "charity_events"("lodgeId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "degree_history" ADD CONSTRAINT "degree_history_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "degree_history" ADD CONSTRAINT "degree_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_history" ADD CONSTRAINT "role_history_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_history" ADD CONSTRAINT "role_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lodge_sessions" ADD CONSTRAINT "lodge_sessions_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "lodge_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atas" ADD CONSTRAINT "atas_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atas" ADD CONSTRAINT "atas_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "lodge_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atas" ADD CONSTRAINT "atas_signedByMasterId_fkey" FOREIGN KEY ("signedByMasterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atas" ADD CONSTRAINT "atas_signedBySecId_fkey" FOREIGN KEY ("signedBySecId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pranchas" ADD CONSTRAINT "pranchas_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedByMasterId_fkey" FOREIGN KEY ("approvedByMasterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedByTreasurerId_fkey" FOREIGN KEY ("approvedByTreasurerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "charity_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charity_events" ADD CONSTRAINT "charity_events_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
