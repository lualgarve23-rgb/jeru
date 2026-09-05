import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log";

type Db = Prisma.TransactionClient | typeof prisma;

// Notificação de EVENTO (pagamento recebido, capitação emitida, mudança de
// status...) gravada direto na central, fora da varredura de pendências de
// lib/notifications.ts. Idempotente por sourceKey (upsert em lodgeId+sourceKey);
// `userId` dirige a um irmão específico (null = visível a VM/Sec/Tes/Conselho).
// Nunca derruba a operação principal: falha vira log de erro.
export async function notificarEvento(
  db: Db,
  n: {
    lodgeId: string;
    sourceKey: string;
    type: NotificationType;
    title: string;
    description: string;
    userId?: string | null;
    link?: string | null;
    dueDate?: Date | null;
  }
) {
  try {
    await db.notification.upsert({
      where: { lodgeId_sourceKey: { lodgeId: n.lodgeId, sourceKey: n.sourceKey } },
      create: {
        lodgeId: n.lodgeId,
        sourceKey: n.sourceKey,
        type: n.type,
        title: n.title,
        description: n.description,
        userId: n.userId ?? null,
        link: n.link ?? null,
        dueDate: n.dueDate ?? null,
      },
      update: {
        title: n.title,
        description: n.description,
        link: n.link ?? null,
        isRead: false,
        createdAt: new Date(),
      },
    });
  } catch (e) {
    logError("notificar-evento", e, { sourceKey: n.sourceKey });
  }
}

// Ids dos ocupantes ativos de um cargo na loja (Tesoureiro, Esmoler...)
export async function usuariosDoCargo(db: Db, lodgeId: string, role: "TESOUREIRO" | "ESMOLER" | "SECRETARIO" | "VENERAVEL_MESTRE" | "CONSELHO_CONTAS") {
  const rows = await db.user.findMany({
    where: { lodgeId, currentRole: role, status: { in: ["ATIVO", "IRREGULAR"] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
