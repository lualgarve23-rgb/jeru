import { prisma } from "@/lib/prisma";
import { sendLodgeEmail, isGmailConfigured } from "@/lib/gmail";
import { notificationTypeLabels } from "@/lib/labels";

// Lembretes diários por e-mail (disparados pelo cron junto com a varredura):
//  - notificações dirigidas (userId) → e-mail ao próprio irmão;
//  - aniversários da loja → e-mail a todos os membros ativos;
//  - demais alertas operacionais da loja → e-mail a VM e Secretário.
// Idempotente: cada notificação só é enviada uma vez (Notification.emailedAt).

const BASE_URL = process.env.APP_URL ?? "http://localhost:3100";

type Notif = {
  id: string;
  title: string;
  description: string;
  type: string;
  link: string | null;
};

function corpo(intro: string, itens: Notif[]) {
  const linhas = itens.map((n) => {
    const tipo = notificationTypeLabels[n.type] ?? n.type;
    const link = n.link ? `\n  ${BASE_URL}${n.link}` : "";
    return `• [${tipo}] ${n.title}\n  ${n.description}${link}`;
  });
  return `${intro}\n\n${linhas.join("\n\n")}\n\n—\nCentral de notificações: ${BASE_URL}/dashboard/notificacoes\nMensagem automática do sistema de gestão da Loja.`;
}

export async function enviarLembretesEmail(lodgeId: string) {
  if (!isGmailConfigured()) return { sent: 0, skipped: "gmail" as const };

  const pendentes = await prisma.notification.findMany({
    where: { lodgeId, isRead: false, emailedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      link: true,
      userId: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (pendentes.length === 0) return { sent: 0 };

  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: lodgeId },
    select: { name: true, number: true },
  });
  const assuntoBase = `Loja ${lodge.name} nº ${lodge.number}`;

  const enviadas: string[] = [];
  let sent = 0;

  // 1) Dirigidas: um e-mail por irmão com os itens dele
  const porUsuario = new Map<string, { email: string; itens: Notif[] }>();
  for (const n of pendentes) {
    if (!n.userId || !n.user?.email) continue;
    const g = porUsuario.get(n.userId) ?? { email: n.user.email, itens: [] };
    g.itens.push(n);
    porUsuario.set(n.userId, g);
  }
  for (const g of porUsuario.values()) {
    try {
      await sendLodgeEmail({
        to: g.email,
        subject: `${assuntoBase} — você tem ${g.itens.length} aviso(s)`,
        text: corpo("Irmão, há avisos dirigidos a você no sistema da Loja:", g.itens),
      });
      enviadas.push(...g.itens.map((n) => n.id));
      sent++;
    } catch (e) {
      console.error("lembrete e-mail (dirigido) falhou:", e);
    }
  }

  // 2) Aniversários: digest a todos os membros ativos (em BCC)
  const aniversarios = pendentes.filter((n) => !n.userId && n.type === "BIRTHDAY");
  if (aniversarios.length > 0) {
    const membros = await prisma.user.findMany({
      where: { lodgeId, status: "ATIVO", email: { not: "" } },
      select: { email: true },
    });
    try {
      await sendLodgeEmail({
        to: process.env.GMAIL_USER!,
        bcc: membros.map((m) => m.email),
        subject: `${assuntoBase} — aniversariantes 🎂`,
        text: corpo("Irmãos, temos aniversariantes na família da Loja:", aniversarios),
      });
      enviadas.push(...aniversarios.map((n) => n.id));
      sent++;
    } catch (e) {
      console.error("lembrete e-mail (aniversários) falhou:", e);
    }
  }

  // 3) Operacionais da loja: digest a VM e Secretário
  const operacionais = pendentes.filter((n) => !n.userId && n.type !== "BIRTHDAY");
  if (operacionais.length > 0) {
    const gestores = await prisma.user.findMany({
      where: {
        lodgeId,
        status: "ATIVO",
        currentRole: { in: ["VENERAVEL_MESTRE", "SECRETARIO"] },
        email: { not: "" },
      },
      select: { email: true },
    });
    if (gestores.length > 0) {
      try {
        await sendLodgeEmail({
          to: process.env.GMAIL_USER!,
          bcc: gestores.map((g) => g.email),
          subject: `${assuntoBase} — ${operacionais.length} pendência(s) da Secretaria`,
          text: corpo(
            "Novas pendências na central de notificações da Loja:",
            operacionais
          ),
        });
        enviadas.push(...operacionais.map((n) => n.id));
        sent++;
      } catch (e) {
        console.error("lembrete e-mail (operacional) falhou:", e);
      }
    }
  }

  if (enviadas.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: enviadas } },
      data: { emailedAt: new Date() },
    });
  }
  return { sent };
}
