ALTER TABLE "users" ADD COLUMN "cargoRito" TEXT;
ALTER TABLE "role_history" ADD COLUMN "cargoRito" TEXT;

CREATE TABLE "cargos_rito" (
    "id" TEXT NOT NULL,
    "lodgeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargos_rito_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cargos_rito_lodgeId_nome_key" ON "cargos_rito"("lodgeId", "nome");

ALTER TABLE "cargos_rito" ADD CONSTRAINT "cargos_rito_lodgeId_fkey" FOREIGN KEY ("lodgeId") REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
