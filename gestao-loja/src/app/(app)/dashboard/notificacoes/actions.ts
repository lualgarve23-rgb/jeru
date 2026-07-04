"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notificationWhere } from "@/lib/notifications";

export async function markNotificationRead(id: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    // filtro composto garante o isolamento por tenant e por destinatário
    where: { id, ...notificationWhere(user) },
    data: { isRead: true },
  });
  revalidatePath("/dashboard/notificacoes");
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { ...notificationWhere(user), isRead: false },
    data: { isRead: true },
  });
  revalidatePath("/dashboard/notificacoes");
}
