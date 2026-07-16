import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { isGmailConfigured } from "@/lib/gmail";

// Leitura da caixa de entrada do Gmail da Loja via IMAP, com a mesma
// App Password usada no envio (GMAIL_USER / GMAIL_APP_PASSWORD) —
// não depende da publicação do app OAuth do Google.

export type EmailResumo = {
  uid: number;
  from: string;
  fromAddress: string;
  subject: string;
  date: Date | null;
  seen: boolean;
  hasAttachments: boolean;
};

export type EmailDetalhe = EmailResumo & {
  to: string;
  text: string;
  html: string | null;
  messageId: string | null;
  references: string[];
  attachments: { index: number; filename: string; size: number; contentType: string }[];
};

function connect() {
  if (!isGmailConfigured()) {
    throw new Error(
      "Gmail da loja não configurado (defina GMAIL_USER e GMAIL_APP_PASSWORD no .env)."
    );
  }
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });
}

// Últimas mensagens da caixa de entrada (mais recentes primeiro)
export async function listarInbox(limit = 25): Promise<EmailResumo[]> {
  const client = connect();
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const total = client.mailbox && typeof client.mailbox === "object"
        ? client.mailbox.exists
        : 0;
      if (!total) return [];
      const inicio = Math.max(1, total - limit + 1);
      const mensagens: EmailResumo[] = [];
      for await (const msg of client.fetch(`${inicio}:*`, {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
      })) {
        const de = msg.envelope?.from?.[0];
        const temAnexo = JSON.stringify(msg.bodyStructure ?? {}).includes(
          '"attachment"'
        );
        mensagens.push({
          uid: msg.uid,
          from: de?.name || de?.address || "(desconhecido)",
          fromAddress: de?.address ?? "",
          subject: msg.envelope?.subject || "(sem assunto)",
          date: msg.envelope?.date ?? null,
          seen: msg.flags?.has("\\Seen") ?? false,
          hasAttachments: temAnexo,
        });
      }
      return mensagens.reverse();
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

// Mensagem completa (marca como lida ao abrir)
export async function lerMensagem(uid: number): Promise<EmailDetalhe | null> {
  const client = connect();
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = await client.fetchOne(
        String(uid),
        { uid: true, source: true, flags: true },
        { uid: true }
      );
      if (!msg || !msg.source) return null;
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });

      const parsed = await simpleParser(msg.source);
      const de = parsed.from?.value?.[0];
      const para = Array.isArray(parsed.to)
        ? parsed.to.map((t) => t.text).join(", ")
        : (parsed.to?.text ?? "");
      return {
        uid,
        from: de?.name || de?.address || "(desconhecido)",
        fromAddress: de?.address ?? "",
        to: para,
        subject: parsed.subject || "(sem assunto)",
        date: parsed.date ?? null,
        seen: true,
        hasAttachments: parsed.attachments.length > 0,
        text: parsed.text ?? "",
        html: typeof parsed.html === "string" ? parsed.html : null,
        messageId: parsed.messageId ?? null,
        references: [
          ...(Array.isArray(parsed.references)
            ? parsed.references
            : parsed.references
              ? [parsed.references]
              : []),
        ],
        attachments: parsed.attachments.map((a, index) => ({
          index,
          filename: a.filename ?? `anexo-${index + 1}`,
          size: a.size,
          contentType: a.contentType,
        })),
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

// Conteúdo de um anexo da mensagem
export async function baixarAnexo(
  uid: number,
  index: number
): Promise<{ filename: string; contentType: string; content: Buffer } | null> {
  const client = connect();
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const msg = await client.fetchOne(
        String(uid),
        { uid: true, source: true },
        { uid: true }
      );
      if (!msg || !msg.source) return null;
      const parsed = await simpleParser(msg.source);
      const anexo = parsed.attachments[index];
      if (!anexo) return null;
      return {
        filename: anexo.filename ?? `anexo-${index + 1}`,
        contentType: anexo.contentType,
        content: anexo.content,
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}
