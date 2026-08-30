-- Fase 3 do Assistente IA: busca full-text em português (stemming) com GIN.
-- As consultas usam EXATAMENTE as mesmas expressões destes índices.

ALTER TABLE "biblioteca_itens" ADD COLUMN "textoExtraido" TEXT;

CREATE INDEX "atas_content_fts"
  ON "atas" USING GIN (to_tsvector('portuguese', "content"));

CREATE INDEX "pranchas_content_fts"
  ON "pranchas" USING GIN (to_tsvector('portuguese', "subject" || ' ' || "content"));

CREATE INDEX "biblioteca_itens_texto_fts"
  ON "biblioteca_itens" USING GIN (to_tsvector('portuguese', coalesce("textoExtraido", '')));
