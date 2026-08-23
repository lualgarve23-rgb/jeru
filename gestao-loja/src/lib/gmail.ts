import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { openSecret } from "@/lib/secrets";

// Envio pelo Gmail da Loja (SMTP com App Password).
// As credenciais ficam no cadastro da Loja (Lodge.gmailUser/gmailAppPassword);
// se a loja não configurou, vale o fallback global GMAIL_USER/GMAIL_APP_PASSWORD
// do .env (instalações de loja única).
// E-mail institucional da Guarda dos Selos (GOB-SP):
export const GUARDA_SELOS_EMAIL =
  process.env.GUARDA_SELOS_EMAIL ?? "gselos@gobsp.org.br";

export type GmailAuth = { user: string; pass: string };

// Credenciais efetivas da loja (banco → fallback .env); null se nada configurado
export async function getGmailAuth(lodgeId: string): Promise<GmailAuth | null> {
  const lodge = await prisma.lodge.findUnique({
    where: { id: lodgeId },
    select: { gmailUser: true, gmailAppPassword: true },
  });
  const pass = openSecret(lodge?.gmailAppPassword);
  if (lodge?.gmailUser && pass) {
    return { user: lodge.gmailUser, pass };
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD };
  }
  return null;
}

export async function isGmailConfigured(lodgeId: string) {
  return Boolean(await getGmailAuth(lodgeId));
}

export async function sendLodgeEmail(opts: {
  lodgeId: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string; // corpo HTML (ex.: convite de sessão); text fica como fallback
  attachments?: {
    filename: string;
    content: Buffer | string;
    // Imagem inline no corpo HTML (src="cid:...") — evita o corte do Gmail
    // em mensagens grandes com a arte em base64
    cid?: string;
    contentType?: string;
  }[];
  // Encadeamento de resposta (Re: na mesma conversa)
  inReplyTo?: string;
  references?: string[];
}) {
  const { lodgeId, ...mail } = opts;
  const auth = await getGmailAuth(lodgeId);
  if (!auth) {
    throw new Error(
      "Gmail da loja não configurado (informe o e-mail e a senha de app em Configurações da Loja)."
    );
  }
  const transporter = nodemailer.createTransport({ service: "gmail", auth });
  await transporter.sendMail({ from: auth.user, ...mail });
}
