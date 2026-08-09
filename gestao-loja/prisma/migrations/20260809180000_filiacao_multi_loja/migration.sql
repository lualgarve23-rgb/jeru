-- #16: o mesmo irmão pode ter filiação em mais de uma loja.
-- cim/cpf/email deixam de ser únicos globais e passam a únicos por loja.

-- DropIndex
DROP INDEX "users_cim_key";
DROP INDEX "users_cpf_key";
DROP INDEX "users_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_lodgeId_cim_key" ON "users"("lodgeId", "cim");
CREATE UNIQUE INDEX "users_lodgeId_cpf_key" ON "users"("lodgeId", "cpf");
CREATE UNIQUE INDEX "users_lodgeId_email_key" ON "users"("lodgeId", "email");
CREATE INDEX "users_cim_idx" ON "users"("cim");
