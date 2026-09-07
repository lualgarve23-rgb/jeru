-- Sorteio pelo sistema: modo, semente e universo (transparência)
ALTER TABLE "rifas" ADD COLUMN "sorteioModo" TEXT, ADD COLUMN "sorteioSemente" TEXT, ADD COLUMN "sorteioUniverso" INTEGER;
