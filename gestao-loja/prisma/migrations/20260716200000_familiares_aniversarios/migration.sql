-- Familiares (cônjuge e filhos) do obreiro + notificações de aniversário

CREATE TYPE "Parentesco" AS ENUM ('CONJUGE', 'FILHO');

ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY';

CREATE TABLE "family_members" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentesco" "Parentesco" NOT NULL,
  "birthDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "family_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "family_members_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "family_members_userId_idx" ON "family_members"("userId");
