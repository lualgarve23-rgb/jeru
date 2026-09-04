-- Status central do membro: marca de mudança manual (o sync de inadimplência
-- não desfaz), motivo da última mudança e fim previsto da licença
ALTER TABLE "users" ADD COLUMN "statusManualAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "statusMotivo" TEXT;
ALTER TABLE "users" ADD COLUMN "licencaFim" TIMESTAMP(3);
