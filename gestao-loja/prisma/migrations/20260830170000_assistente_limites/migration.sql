-- Limites diários do Assistente IA configuráveis por nível (VM, Config. da Loja):
-- Obreiros (MEMBER) e oficiais (demais cargos). 0 = assistente fechado ao nível.
ALTER TABLE "lodges"
  ADD COLUMN "assistenteLimiteObreiros" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "assistenteLimiteOficiais" INTEGER NOT NULL DEFAULT 50;
