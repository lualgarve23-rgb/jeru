-- Loja: momento da última varredura da central de notificações (throttle do
-- sync disparado no login de qualquer perfil)
ALTER TABLE "lodges" ADD COLUMN "notificacoesSyncAt" TIMESTAMP(3);
