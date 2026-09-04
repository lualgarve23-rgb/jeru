import { prisma } from "@/lib/prisma";
import { sendLodgeEmail, getGmailAuth } from "@/lib/gmail";
import { notificationTypeLabels } from "@/lib/labels";
import { cargosDaNotificacao, type Cargo } from "@/lib/notificacao-destinatarios";
import { logError } from "@/lib/log";

// Lembretes por e-mail da central de notificações:
//  - digest diário (cron): notificações dirigidas (userId) → e-mail ao
//    próprio irmão; aniversários → todos os membros ativos; operacionais
//    (sem userId) → só o CARGO DA VEZ, mapeado pela sourceKey
//    (lib/notificacao-destinatarios.ts) — Conselho de Contas entra nas de
//    leitura (interstício, cadastro, prazos, frequência, Mútua);
//  - imediato (fila, tipo notificacao.imediata): assinatura pendente nova
//    vai na hora ao cargo da vez / ao irmão, sem esperar o digest.
// Cada e-mail aponta para /n/<id>, que marca a notificação como lida e
// redireciona ao item. Idempotente: Notification.emailedAt.

const BASE_URL = process.env.APP_URL ?? "http://localhost:3100";

type Notif = {
  id: string;
  title: string;
  description: string;
  type: string;
  sourceKey: string | null;
  userId: string | null;
};

export function linkNotificacao(id: string) {
  return `${BASE_URL}/n/${id}`;
}

function corpo(intro: string, itens: Notif[]) {
  const linhas = itens.map((n) => {
    const tipo = notificationTypeLabels[n.type] ?? n.type;
    return `• [${tipo}] ${n.title}\n  ${n.description}\n  ${linkNotificacao(n.id)}`;
  });
  return `${intro}\n\n${linhas.join("\n\n")}\n\n—\nCentral de notificações: ${BASE_URL}/dashboard/notificacoes\nMensagem automática do sistema Gestão NoPrumo.`;
}

async function emailsPorCargo(lodgeId: string) {
  const users = await prisma.user.findMany({
    where: {
      lodgeId,
      status: { in: ["ATIVO", "IRREGULAR"] },
      currentRole: {
        in: ["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO", "CONSELHO_CONTAS", "ESMOLER"],
      },
      email: { contains: "@" },
    },
    select: { email: true, currentRole: true },
  });
  const map = new Map<Cargo, string[]>();
  for (const u of users) {
    const c = u.currentRole as Cargo;
    map.set(c, [...(map.get(c) ?? []), u.email]);
  }
  return map;
}

// Destinatários de uma notificação sem userId: e-mails dos ocupantes do
// cargo da vez.
function destinatariosOperacional(n: Notif, porCargo: Map<Cargo, string[]>) {
  const emails = new Set<string>();
  for (const c of cargosDaNotificacao(n.sourceKey, n.title)) {
    for (const e of porCargo.get(c) ?? []) emails.add(e);
  }
  return [...emails];
}

export async function enviarLembretesEmail(lodgeId: string) {
  const auth = await getGmailAuth(lodgeId);
  if (!auth) return { sent: 0, skipped: "gmail" as const };

  const pendentes = await prisma.notification.findMany({
    where: { lodgeId, isRead: false, emailedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      sourceKey: true,
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

  // Um e-mail por destinatário, com os itens dele (dirigidos + operacionais
  // do cargo que ocupa)
  const porEmail = new Map<string, { itens: Notif[]; dirigido: boolean }>();
  const add = (email: string, n: Notif, dirigido: boolean) => {
    const g = porEmail.get(email) ?? { itens: [], dirigido: false };
    if (!g.itens.some((i) => i.id === n.id)) g.itens.push(n);
    g.dirigido = g.dirigido || dirigido;
    porEmail.set(email, g);
  };

  // 1) Dirigidas: ao próprio irmão
  for (const n of pendentes) {
    if (n.userId && n.user?.email?.includes("@")) add(n.user.email, n, true);
  }

  // 2) Operacionais da loja: ao cargo da vez
  const operacionais = pendentes.filter((n) => !n.userId && n.type !== "BIRTHDAY");
  const semDestinatario: string[] = [];
  if (operacionais.length > 0) {
    const porCargo = await emailsPorCargo(lodgeId);
    for (const n of operacionais) {
      const dest = destinatariosOperacional(n, porCargo);
      // cargo vago: marca como enviada para não ficar presa para sempre
      if (dest.length === 0) semDestinatario.push(n.id);
      for (const e of dest) add(e, n, false);
    }
  }

  for (const [email, g] of porEmail) {
    try {
      await sendLodgeEmail({
        lodgeId,
        to: email,
        subject: `${assuntoBase} — você tem ${g.itens.length} aviso(s)`,
        text: corpo(
          g.dirigido
            ? "Irmão, há avisos dirigidos a você no sistema da Loja:"
            : "Irmão, há pendências do seu cargo na central de notificações da Loja:",
          g.itens
        ),
      });
      enviadas.push(...g.itens.map((n) => n.id));
      sent++;
    } catch (e) {
      logError("lembrete-email.digest", e, { lodgeId, email });
    }
  }
  enviadas.push(...semDestinatario);

  // 3) Aniversários: digest a todos os membros ativos (em BCC)
  const aniversarios = pendentes.filter((n) => !n.userId && n.type === "BIRTHDAY");
  if (aniversarios.length > 0) {
    const membros = await prisma.user.findMany({
      where: { lodgeId, status: "ATIVO", email: { contains: "@" } },
      select: { email: true },
    });
    try {
      await sendLodgeEmail({
        lodgeId,
        to: auth.user,
        bcc: membros.map((m) => m.email),
        subject: `${assuntoBase} — aniversariantes 🎂`,
        text: corpo("Irmãos, temos aniversariantes na família da Loja:", aniversarios),
      });
      enviadas.push(...aniversarios.map((n) => n.id));
      sent++;
    } catch (e) {
      logError("lembrete-email.aniversarios", e, { lodgeId });
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

// E-mail imediato de UMA notificação (assinatura pendente nova). Sem Gmail
// configurado ou já enviada/lida, não faz nada. Lança em falha de envio (a
// fila faz retry).
export async function enviarNotificacaoImediata(lodgeId: string, notificationId: string) {
  const auth = await getGmailAuth(lodgeId);
  if (!auth) return;
  const n = await prisma.notification.findUnique({
    where: { id: notificationId, lodgeId },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      sourceKey: true,
      userId: true,
      isRead: true,
      emailedAt: true,
      user: { select: { email: true } },
    },
  });
  if (!n || n.isRead || n.emailedAt) return;

  let destinatarios: string[] = [];
  if (n.userId) {
    if (n.user?.email?.includes("@")) destinatarios = [n.user.email];
  } else {
    destinatarios = destinatariosOperacional(n, await emailsPorCargo(lodgeId));
  }
  if (destinatarios.length === 0) return;

  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: lodgeId },
    select: { name: true, number: true },
  });
  await sendLodgeEmail({
    lodgeId,
    to: destinatarios[0],
    bcc: destinatarios.length > 1 ? destinatarios.slice(1) : undefined,
    subject: `Loja ${lodge.name} nº ${lodge.number} — ${n.title}`,
    text: corpo(
      n.userId
        ? "Irmão, há um aviso dirigido a você no sistema da Loja:"
        : "Irmão, é a vez do seu cargo:",
      [n]
    ),
  });
  await prisma.notification.update({
    where: { id: n.id },
    data: { emailedAt: new Date() },
  });
}
