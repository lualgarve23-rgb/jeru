-- Base de Visitantes (Secretaria/VM): cadastro consolidado dos irmãos de
-- outras Oficinas, vinculado às presenças do Livro de Presenças.
CREATE TABLE "visitantes" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cim" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "lojaOrigem" TEXT,
    "potencia" TEXT,
    "oriente" TEXT,
    "grau" TEXT,
    "cargo" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitantes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visitantes_lodgeId_idx" ON "visitantes"("lodgeId");
CREATE INDEX "visitantes_lodgeId_cim_idx" ON "visitantes"("lodgeId", "cim");

ALTER TABLE "visitantes" ADD CONSTRAINT "visitantes_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendances" ADD COLUMN "visitorTelefone" TEXT,
                          ADD COLUMN "visitanteId" TEXT;

CREATE INDEX "attendances_visitanteId_idx" ON "attendances"("visitanteId");

ALTER TABLE "attendances" ADD CONSTRAINT "attendances_visitanteId_fkey" FOREIGN KEY ("visitanteId") REFERENCES "visitantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: consolida as presenças de visitantes já registradas em um
-- cadastro por pessoa (chave: CIM; senão e-mail; senão nome + loja de origem).
WITH chaves AS (
    SELECT
        a."id",
        a."lodgeId",
        a."visitorName",
        a."visitorCim",
        a."visitorEmail",
        a."visitorLodge",
        a."visitorPotencia",
        a."checkedInAt",
        a."lodgeId" || '|' || COALESCE(
            NULLIF(LOWER(TRIM(a."visitorCim")), ''),
            NULLIF(LOWER(TRIM(a."visitorEmail")), ''),
            LOWER(TRIM(a."visitorName")) || '|' || LOWER(COALESCE(TRIM(a."visitorLodge"), ''))
        ) AS chave
    FROM "attendances" a
    WHERE a."userId" IS NULL AND a."visitorName" IS NOT NULL AND TRIM(a."visitorName") <> ''
),
grupos AS (
    SELECT
        chave,
        "lodgeId",
        (array_agg("visitorName" ORDER BY "checkedInAt" DESC))[1] AS nome,
        MAX(NULLIF(TRIM("visitorCim"), '')) AS cim,
        MAX(NULLIF(LOWER(TRIM("visitorEmail")), '')) AS email,
        MAX(NULLIF(TRIM("visitorLodge"), '')) AS "lojaOrigem",
        MAX(NULLIF(TRIM("visitorPotencia"), '')) AS potencia,
        MIN("checkedInAt") AS "createdAt"
    FROM chaves
    GROUP BY chave, "lodgeId"
)
INSERT INTO "visitantes" ("id", "lodgeId", "nome", "cim", "email", "lojaOrigem", "potencia", "createdAt", "updatedAt")
SELECT 'vis' || md5(chave), "lodgeId", TRIM(nome), cim, email, "lojaOrigem", potencia, "createdAt", CURRENT_TIMESTAMP
FROM grupos;

UPDATE "attendances" a
SET "visitanteId" = 'vis' || md5(
    a."lodgeId" || '|' || COALESCE(
        NULLIF(LOWER(TRIM(a."visitorCim")), ''),
        NULLIF(LOWER(TRIM(a."visitorEmail")), ''),
        LOWER(TRIM(a."visitorName")) || '|' || LOWER(COALESCE(TRIM(a."visitorLodge"), ''))
    )
)
WHERE a."userId" IS NULL AND a."visitorName" IS NOT NULL AND TRIM(a."visitorName") <> '';
