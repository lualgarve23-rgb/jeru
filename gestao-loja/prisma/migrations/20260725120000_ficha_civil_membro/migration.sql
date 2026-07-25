-- Ficha civil complementar do membro (importável do METAGOB)
ALTER TABLE "users" ADD COLUMN "rg" TEXT;
ALTER TABLE "users" ADD COLUMN "naturalidade" TEXT;
ALTER TABLE "users" ADD COLUMN "estadoCivil" TEXT;
ALTER TABLE "users" ADD COLUMN "conjuge" TEXT;
ALTER TABLE "users" ADD COLUMN "nomePai" TEXT;
ALTER TABLE "users" ADD COLUMN "nomeMae" TEXT;
ALTER TABLE "users" ADD COLUMN "tipoSanguineo" TEXT;
