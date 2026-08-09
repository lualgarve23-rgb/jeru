-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "detalhes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_lodgeId_createdAt_idx" ON "audit_events"("lodgeId", "createdAt");

