-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "lodges" ADD COLUMN     "logoUrl" TEXT;
