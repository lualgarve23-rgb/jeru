-- Gmail por loja: credenciais SMTP/IMAP (senha de app) no cadastro da Loja,
-- com fallback ao GMAIL_USER/GMAIL_APP_PASSWORD global do .env
ALTER TABLE "lodges" ADD COLUMN "gmailUser" TEXT;
ALTER TABLE "lodges" ADD COLUMN "gmailAppPassword" TEXT;
