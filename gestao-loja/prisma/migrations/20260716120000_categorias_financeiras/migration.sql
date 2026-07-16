-- Categorias financeiras dinâmicas (receitas e despesas) + categoria na despesa

CREATE TABLE "categorias_financeiras" (
  "id" TEXT NOT NULL,
  "lodgeId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" "TransactionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "categorias_financeiras_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "categorias_financeiras_lodgeId_fkey" FOREIGN KEY ("lodgeId")
    REFERENCES "lodges"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "categorias_financeiras_lodgeId_nome_tipo_key"
  ON "categorias_financeiras"("lodgeId", "nome", "tipo");

ALTER TABLE "expenses" ADD COLUMN "category" TEXT;

-- Categorias padrão em todas as lojas
INSERT INTO "categorias_financeiras" ("id", "lodgeId", "nome", "tipo")
SELECT md5(l."id" || ':' || c.nome || ':' || c.tipo), l."id", c.nome, c.tipo::"TransactionType"
FROM "lodges" l
CROSS JOIN (VALUES
  ('Capitação', 'RECEITA'),
  ('Tronco de Solidariedade', 'RECEITA'),
  ('Eventos', 'RECEITA'),
  ('Doações', 'RECEITA'),
  ('Aluguel', 'DESPESA'),
  ('Eventos', 'DESPESA'),
  ('Materiais e manutenção', 'DESPESA'),
  ('Taxas da Potência', 'DESPESA')
) AS c(nome, tipo)
ON CONFLICT ("lodgeId", "nome", "tipo") DO NOTHING;

-- Normaliza as categorias automáticas antigas do livro-caixa
UPDATE "transactions" SET "category" = 'Capitação' WHERE "category" = 'capitacao';
UPDATE "transactions" SET "category" = NULL WHERE "category" = 'despesa';
