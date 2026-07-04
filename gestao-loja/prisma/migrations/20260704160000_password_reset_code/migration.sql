-- AlterTable
ALTER TABLE "users" ADD COLUMN "resetCodeHash" TEXT,
                    ADD COLUMN "resetCodeExpiresAt" TIMESTAMP(3),
                    ADD COLUMN "resetCodeAttempts" INTEGER NOT NULL DEFAULT 0;
