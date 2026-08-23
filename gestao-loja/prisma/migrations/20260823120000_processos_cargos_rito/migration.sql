-- Cadeia de assinantes dos Processos passa a aceitar cargos do rito
-- (Orador, 1º e 2º Vigilante) além dos níveis de acesso (Sec/Tes/VM):
-- a coluna deixa de ser o enum Role e vira texto (chave do cargo).
ALTER TABLE "processo_assinantes" ALTER COLUMN "cargo" TYPE TEXT USING "cargo"::text;
