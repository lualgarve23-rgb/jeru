-- Fotos do prêmio da Rifa de Benemerência (chaves de lib/media)
ALTER TABLE "rifas" ADD COLUMN "fotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
