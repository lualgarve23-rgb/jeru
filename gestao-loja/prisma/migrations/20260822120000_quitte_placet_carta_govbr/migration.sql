-- AlterTable: carta de próprio punho (obrigatória no pedido) e PDF gov.br
ALTER TABLE "quitte_placets" ADD COLUMN "cartaArquivo" BYTEA,
ADD COLUMN "cartaNome" TEXT,
ADD COLUMN "cartaMime" TEXT,
ADD COLUMN "govbrPdf" BYTEA;
