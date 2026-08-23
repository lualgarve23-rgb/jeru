-- AlterTable: registro do envio do documento assinado
ALTER TABLE "processo_documentos" ADD COLUMN "enviadoAt" TIMESTAMP(3),
ADD COLUMN "enviadoPara" TEXT;

-- AlterTable: registro do envio da prancha por e-mail
ALTER TABLE "pranchas" ADD COLUMN "enviadaAt" TIMESTAMP(3);

-- AlterTable: vínculo da prancha do Placet com os kanbans (gates)
ALTER TABLE "processos_progressao" ADD COLUMN "pranchaId" TEXT;
ALTER TABLE "processos_admissao" ADD COLUMN "pranchaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "processos_progressao_pranchaId_key" ON "processos_progressao"("pranchaId");
CREATE UNIQUE INDEX "processos_admissao_pranchaId_key" ON "processos_admissao"("pranchaId");

-- AddForeignKey
ALTER TABLE "processos_progressao" ADD CONSTRAINT "processos_progressao_pranchaId_fkey" FOREIGN KEY ("pranchaId") REFERENCES "pranchas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "processos_admissao" ADD CONSTRAINT "processos_admissao_pranchaId_fkey" FOREIGN KEY ("pranchaId") REFERENCES "pranchas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
