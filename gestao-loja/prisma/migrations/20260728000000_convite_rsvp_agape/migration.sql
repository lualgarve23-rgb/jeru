-- Convite de sessão (RSVP) + Ágape

-- Link público do convite: preenche as sessões existentes com um token aleatório
ALTER TABLE "lodge_sessions" ADD COLUMN "inviteToken" TEXT;
UPDATE "lodge_sessions" SET "inviteToken" = md5(random()::text || clock_timestamp()::text) WHERE "inviteToken" IS NULL;
ALTER TABLE "lodge_sessions" ALTER COLUMN "inviteToken" SET NOT NULL;
CREATE UNIQUE INDEX "lodge_sessions_inviteToken_key" ON "lodge_sessions"("inviteToken");

-- RSVP na presença: checkedIn=false até o check-in do dia; Ágape confirmado
ALTER TABLE "attendances" ADD COLUMN "checkedIn" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "attendances" ADD COLUMN "rsvpAt" TIMESTAMP(3);
ALTER TABLE "attendances" ADD COLUMN "agapeConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- Template HTML do convite por loja (upload na config da loja)
ALTER TABLE "lodges" ADD COLUMN "conviteTemplateHtml" TEXT;
