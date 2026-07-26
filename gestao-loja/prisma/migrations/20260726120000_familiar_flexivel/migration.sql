-- Familiares importados do Meta: data de nascimento nem sempre vem, e o
-- parentesco pode estar sem classificação no portal
ALTER TABLE "family_members" ALTER COLUMN "birthDate" DROP NOT NULL;
ALTER TYPE "Parentesco" ADD VALUE 'DEPENDENTE';
