-- Segmentação por grau nos acervos: documento "somente Mestres" fica
-- invisível a Aprendizes e Companheiros (Biblioteca e Documentos/Drive).

ALTER TABLE "biblioteca_itens"
  ADD COLUMN "grauMinimo" "Degree" NOT NULL DEFAULT 'APRENDIZ';

ALTER TABLE "documents"
  ADD COLUMN "grauMinimo" "Degree" NOT NULL DEFAULT 'APRENDIZ';
