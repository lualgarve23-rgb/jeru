-- Desacopla níveis de acesso (enum Role) dos cargos ritualísticos (CargoRito):
-- os 8 cargos de Loja saem do enum e viram cargos do rito; novo acesso ESMOLER.

-- 1. Cargos padrão disponíveis como cargos do rito em todas as lojas
INSERT INTO "cargos_rito" ("id", "lodgeId", "nome")
SELECT md5(l."id" || ':' || c.nome), l."id", c.nome
FROM "lodges" l
CROSS JOIN (VALUES
  ('1º Vigilante'), ('2º Vigilante'),
  ('1º Diácono'), ('2º Diácono'),
  ('Orador'), ('Guarda Interno'), ('Guarda Externo'),
  ('Diretor de Cerimônias')
) AS c(nome)
ON CONFLICT ("lodgeId", "nome") DO NOTHING;

-- 2. Usuários e histórico migram do Role ritualístico para cargoRito + MEMBER
UPDATE "users" SET
  "cargoRito" = CASE "currentRole"::text
    WHEN 'PRIMEIRO_VIGILANTE' THEN '1º Vigilante'
    WHEN 'SEGUNDO_VIGILANTE' THEN '2º Vigilante'
    WHEN 'PRIMEIRO_DIACONO' THEN '1º Diácono'
    WHEN 'SEGUNDO_DIACONO' THEN '2º Diácono'
    WHEN 'ORADOR' THEN 'Orador'
    WHEN 'GUARDA_INTERNO' THEN 'Guarda Interno'
    WHEN 'GUARDA_EXTERNO' THEN 'Guarda Externo'
    WHEN 'DIRETOR_CERIMONIAS' THEN 'Diretor de Cerimônias'
  END,
  "currentRole" = 'MEMBER'
WHERE "currentRole"::text IN (
  'PRIMEIRO_VIGILANTE', 'SEGUNDO_VIGILANTE', 'PRIMEIRO_DIACONO',
  'SEGUNDO_DIACONO', 'ORADOR', 'GUARDA_INTERNO', 'GUARDA_EXTERNO',
  'DIRETOR_CERIMONIAS'
);

UPDATE "role_history" SET
  "cargoRito" = COALESCE("cargoRito", CASE "role"::text
    WHEN 'PRIMEIRO_VIGILANTE' THEN '1º Vigilante'
    WHEN 'SEGUNDO_VIGILANTE' THEN '2º Vigilante'
    WHEN 'PRIMEIRO_DIACONO' THEN '1º Diácono'
    WHEN 'SEGUNDO_DIACONO' THEN '2º Diácono'
    WHEN 'ORADOR' THEN 'Orador'
    WHEN 'GUARDA_INTERNO' THEN 'Guarda Interno'
    WHEN 'GUARDA_EXTERNO' THEN 'Guarda Externo'
    WHEN 'DIRETOR_CERIMONIAS' THEN 'Diretor de Cerimônias'
  END),
  "role" = 'MEMBER'
WHERE "role"::text IN (
  'PRIMEIRO_VIGILANTE', 'SEGUNDO_VIGILANTE', 'PRIMEIRO_DIACONO',
  'SEGUNDO_DIACONO', 'ORADOR', 'GUARDA_INTERNO', 'GUARDA_EXTERNO',
  'DIRETOR_CERIMONIAS'
);

-- 3. Enum enxuto: perfis de acesso essenciais + ESMOLER
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM (
  'MEMBER', 'VENERAVEL_MESTRE', 'SECRETARIO', 'TESOUREIRO',
  'CONSELHO_CONTAS', 'ESMOLER', 'SUPER_ADMIN'
);
ALTER TABLE "users" ALTER COLUMN "currentRole" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "currentRole" TYPE "Role" USING ("currentRole"::text::"Role");
ALTER TABLE "users" ALTER COLUMN "currentRole" SET DEFAULT 'MEMBER';
ALTER TABLE "role_history"
  ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";
