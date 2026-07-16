-- Lembretes por e-mail: marca quando a notificação já foi enviada
ALTER TABLE "notifications" ADD COLUMN "emailedAt" TIMESTAMP(3);

-- Backlog: notificações já existentes não geram e-mail retroativo
UPDATE "notifications" SET "emailedAt" = "createdAt";
