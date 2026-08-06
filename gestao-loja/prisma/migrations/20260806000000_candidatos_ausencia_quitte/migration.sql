-- Padrinho e link público do candidato + anexos dos formulários de indicação
ALTER TABLE "processos_admissao" ADD COLUMN "padrinhoId" TEXT;
ALTER TABLE "processos_admissao" ADD COLUMN "token" TEXT;
UPDATE "processos_admissao" SET "token" = gen_random_uuid()::text WHERE "token" IS NULL;
ALTER TABLE "processos_admissao" ALTER COLUMN "token" SET NOT NULL;
CREATE UNIQUE INDEX "processos_admissao_token_key" ON "processos_admissao"("token");
ALTER TABLE "processos_admissao" ADD CONSTRAINT "processos_admissao_padrinhoId_fkey" FOREIGN KEY ("padrinhoId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "candidato_anexos" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "arquivo" BYTEA NOT NULL,
    "enviadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidato_anexos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "candidato_anexos_processoId_idx" ON "candidato_anexos"("processoId");
ALTER TABLE "candidato_anexos" ADD CONSTRAINT "candidato_anexos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos_admissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ausência justificada no Livro de Presenças
ALTER TABLE "attendances" ADD COLUMN "justificado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "attendances" ADD COLUMN "justificativa" TEXT;

-- Formulário do Quitte Placet (Form. 122) anexado e enviado à Guarda dos Selos
ALTER TABLE "quitte_placets" ADD COLUMN "formularioArquivo" BYTEA;
ALTER TABLE "quitte_placets" ADD COLUMN "formularioNome" TEXT;
ALTER TABLE "quitte_placets" ADD COLUMN "formularioMime" TEXT;
ALTER TABLE "quitte_placets" ADD COLUMN "formularioEnviadoAt" TIMESTAMP(3);
