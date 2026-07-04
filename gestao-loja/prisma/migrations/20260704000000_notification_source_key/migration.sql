
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "link" TEXT,
ADD COLUMN     "sourceKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_lodgeId_sourceKey_key" ON "notifications"("lodgeId", "sourceKey");

