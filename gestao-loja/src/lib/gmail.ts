import nodemailer from "nodemailer";

// Envio pelo Gmail da Loja (SMTP com App Password).
// Variáveis: GMAIL_USER (e-mail da loja) e GMAIL_APP_PASSWORD.
// E-mail institucional da Guarda dos Selos (GOB-SP):
export const GUARDA_SELOS_EMAIL =
  process.env.GUARDA_SELOS_EMAIL ?? "gselos@gobsp.org.br";

export function isGmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export async function sendLodgeEmail(opts: {
  to: string;
  bcc?: string[];
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer | string }[];
  // Encadeamento de resposta (Re: na mesma conversa)
  inReplyTo?: string;
  references?: string[];
}) {
  if (!isGmailConfigured()) {
    throw new Error(
      "Gmail da loja não configurado (defina GMAIL_USER e GMAIL_APP_PASSWORD no .env)."
    );
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    ...opts,
  });
}
