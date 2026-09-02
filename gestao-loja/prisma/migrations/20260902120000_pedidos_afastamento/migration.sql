-- Pedido de Afastamento (Form. 116): requerimento assinado gov.br pelo irmão,
-- registro da sessão pela Secretaria, Form. 116 assinado Secretário → VM e
-- envio à Guarda dos Selos.
CREATE TYPE "StatusAfastamento" AS ENUM ('AGUARDANDO_OBREIRO', 'SOLICITADO', 'EM_ASSINATURA', 'ASSINADO', 'INDEFERIDO');

CREATE TABLE "pedidos_afastamento" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "dias" INTEGER NOT NULL,
    "dataInicio" TIMESTAMP(3),
    "status" "StatusAfastamento" NOT NULL DEFAULT 'AGUARDANDO_OBREIRO',
    "requerimentoPdf" BYTEA,
    "requerimentoSignedAt" TIMESTAMP(3),
    "dataSessao" TIMESTAMP(3),
    "artigo" TEXT,
    "formularioPdf" BYTEA,
    "govbrPdf" BYTEA,
    "signedBySecId" TEXT,
    "signedBySecAt" TIMESTAMP(3),
    "signedByMasterId" TEXT,
    "signedByMasterAt" TIMESTAMP(3),
    "enviadoAt" TIMESTAMP(3),
    "enviadoPara" TEXT,
    "driveFileId" TEXT,
    "parecer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_afastamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pedidos_afastamento_lodgeId_status_idx" ON "pedidos_afastamento"("lodgeId", "status");
CREATE INDEX "pedidos_afastamento_userId_idx" ON "pedidos_afastamento"("userId");

ALTER TABLE "pedidos_afastamento" ADD CONSTRAINT "pedidos_afastamento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos_afastamento" ADD CONSTRAINT "pedidos_afastamento_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pedidos_afastamento" ADD CONSTRAINT "pedidos_afastamento_signedBySecId_fkey" FOREIGN KEY ("signedBySecId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pedidos_afastamento" ADD CONSTRAINT "pedidos_afastamento_signedByMasterId_fkey" FOREIGN KEY ("signedByMasterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
