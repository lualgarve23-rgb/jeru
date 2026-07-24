-- Carteirinha digital (QR de verificação pública por token) e
-- Biblioteca digital da Loja (acervo de livros, rituais e decretos)

-- Token da carteirinha: preenche os usuários existentes antes do NOT NULL
ALTER TABLE "users" ADD COLUMN "cardToken" TEXT;
UPDATE "users" SET "cardToken" = md5(random()::text || clock_timestamp()::text || id);
ALTER TABLE "users" ALTER COLUMN "cardToken" SET NOT NULL;
CREATE UNIQUE INDEX "users_cardToken_key" ON "users"("cardToken");

CREATE TYPE "BibliotecaCategoria" AS ENUM ('LIVRO', 'RITUAL', 'DECRETO', 'REGULAMENTO', 'ATA_HISTORICA', 'PRANCHA', 'OUTRO');

CREATE TABLE "biblioteca_itens" (
  "id" TEXT NOT NULL,
  "lodgeId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "autor" TEXT,
  "categoria" "BibliotecaCategoria" NOT NULL DEFAULT 'OUTRO',
  "descricao" TEXT,
  "arquivo" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "biblioteca_itens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "biblioteca_itens_lodgeId_idx" ON "biblioteca_itens"("lodgeId");

ALTER TABLE "biblioteca_itens" ADD CONSTRAINT "biblioteca_itens_lodgeId_fkey"
  FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "biblioteca_itens" ADD CONSTRAINT "biblioteca_itens_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
