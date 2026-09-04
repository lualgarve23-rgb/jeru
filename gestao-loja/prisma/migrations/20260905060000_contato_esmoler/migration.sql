-- Contatos fraternos registrados pelo Esmoler (página /esmoler)
CREATE TABLE "contatos_esmoler" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "nota" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contatos_esmoler_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contatos_esmoler_lodgeId_userId_idx" ON "contatos_esmoler"("lodgeId", "userId");

ALTER TABLE "contatos_esmoler" ADD CONSTRAINT "contatos_esmoler_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contatos_esmoler" ADD CONSTRAINT "contatos_esmoler_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contatos_esmoler" ADD CONSTRAINT "contatos_esmoler_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
