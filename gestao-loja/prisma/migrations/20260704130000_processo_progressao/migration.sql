-- CreateEnum
CREATE TYPE "StatusProgressao" AS ENUM ('CUMPRIMENTO_INTERSTICIO', 'INSTRUCAO_E_FREQUENCIA', 'EXAME_PROFICIENCIA', 'ESCRUTINIO_PROGRESSAO', 'AGUARDANDO_PLACET', 'AGUARDANDO_CERIMONIA', 'COMUNICACAO_POS_CERIMONIA', 'GRAU_CONCEDIDO');

-- CreateTable
CREATE TABLE "processos_progressao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "grauAlvo" "Degree" NOT NULL,
    "status" "StatusProgressao" NOT NULL DEFAULT 'CUMPRIMENTO_INTERSTICIO',
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAprovacao" TIMESTAMP(3),
    "placetDeferido" BOOLEAN NOT NULL DEFAULT false,
    "dataCerimonia" TIMESTAMP(3),
    "comunicadoEnviado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processos_progressao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processos_progressao_lodgeId_idx" ON "processos_progressao"("lodgeId");

-- AddForeignKey
ALTER TABLE "processos_progressao" ADD CONSTRAINT "processos_progressao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processos_progressao" ADD CONSTRAINT "processos_progressao_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

