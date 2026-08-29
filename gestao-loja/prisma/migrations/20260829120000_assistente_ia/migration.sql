-- Assistente IA (chatbot): toggle por loja + histórico de conversas

ALTER TABLE "lodges" ADD COLUMN "assistenteAtivo" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "assistente_conversas" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistente_conversas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistente_conversas_lodgeId_userId_idx" ON "assistente_conversas"("lodgeId", "userId");

CREATE TABLE "assistente_mensagens" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistente_mensagens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistente_mensagens_conversaId_createdAt_idx" ON "assistente_mensagens"("conversaId", "createdAt");

ALTER TABLE "assistente_conversas" ADD CONSTRAINT "assistente_conversas_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistente_conversas" ADD CONSTRAINT "assistente_conversas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistente_mensagens" ADD CONSTRAINT "assistente_mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "assistente_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
