-- Data de instalação (Mestre Instalado) importada do METAGOB
ALTER TABLE "users" ADD COLUMN "installationDate" TIMESTAMP(3);

-- Registros do METAGOB sem equivalente editável no cadastro local
CREATE TYPE "MetaRegistroTipo" AS ENUM ('EVENTO', 'CARGO', 'LOJA', 'TITULO');

CREATE TABLE "meta_registros" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "MetaRegistroTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalhe" TEXT,
    "data" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_registros_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meta_registros_userId_tipo_idx" ON "meta_registros"("userId", "tipo");

ALTER TABLE "meta_registros" ADD CONSTRAINT "meta_registros_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
