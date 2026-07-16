import { InfoDica } from "@/components/info-dica";
import { AJUDA } from "@/lib/ajuda";
import Link from "next/link";
import { Check, CheckCheck, BellOff } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import {
  syncLodgeNotifications,
  notificationWhere,
} from "@/lib/notifications";
import { markNotificationRead, markAllNotificationsRead } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { notificationTypeLabels, notificationTypeTone } from "@/lib/labels";
import type { Notification } from "@prisma/client";

export const metadata = { title: "Notificações" };

const DAY_MS = 24 * 60 * 60 * 1000;

function dueBadge(dueDate: Date | null) {
  if (!dueDate) return null;
  const days = Math.ceil((dueDate.getTime() - Date.now()) / DAY_MS);
  if (days < 0)
    return <Badge variant="warning">Prazo vencido há {-days} dia(s)</Badge>;
  if (days <= 3)
    return <Badge variant="warning">Vence em {days} dia(s)</Badge>;
  return (
    <Badge variant="outline">
      Prazo: {dueDate.toLocaleDateString("pt-BR")}
    </Badge>
  );
}

function NotificationItem({ n }: { n: Notification }) {
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`min-w-0 text-sm ${n.isRead ? "" : "font-semibold"}`}>
          {n.title}
        </span>
        <Badge variant={notificationTypeTone(n.type)}>
          {notificationTypeLabels[n.type] ?? n.type}
        </Badge>
        {dueBadge(n.dueDate)}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{n.description}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {n.createdAt.toLocaleDateString("pt-BR")}{" "}
        {n.createdAt.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </>
  );

  return (
    <li
      className={`flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between ${
        n.isRead ? "bg-muted/30" : "bg-background"
      }`}
    >
      <div className="min-w-0 flex-1">
        {n.link ? (
          <Link href={n.link} className="block transition-opacity hover:opacity-80">
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
      {!n.isRead && (
        <form action={markNotificationRead.bind(null, n.id)} className="shrink-0">
          <Button variant="outline" size="sm" type="submit">
            <Check className="mr-1.5 h-4 w-4" /> Marcar lida
          </Button>
        </form>
      )}
    </li>
  );
}

export default async function NotificacoesPage() {
  const user = await requireUser();

  // Geração automática: quem opera a Secretaria dispara a varredura ao abrir
  if (canWriteSecretaria(user.role)) {
    await syncLodgeNotifications(user.lodgeId);
  }

  const notifications = await prisma.notification.findMany({
    where: notificationWhere(user),
    orderBy: [{ isRead: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const unread = notifications.filter((n) => !n.isRead);
  const read = notifications.filter((n) => n.isRead);

  const types = ["BIRTHDAY", "PENDING_SIGNATURE", "DEADLINE_WARNING", "FINANCIAL_APPROVAL", "MISSING_DATA"];
  const grouped = types
    .map((t) => ({ type: t, items: unread.filter((n) => n.type === t) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-1 text-2xl font-bold">Notificações<InfoDica titulo="Notificações" texto={AJUDA.notificacoes} /></h1>
          {unread.length > 0 && (
            <Badge variant="warning">{unread.length} não lida(s)</Badge>
          )}
        </div>
        {unread.length > 0 && (
          <form action={markAllNotificationsRead}>
            <Button variant="outline" size="sm" type="submit">
              <CheckCheck className="mr-1.5 h-4 w-4" /> Marcar todas como lidas
            </Button>
          </form>
        )}
      </div>

      {unread.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <BellOff className="h-5 w-5" />
            Nenhuma notificação pendente. Tudo em dia!
          </CardContent>
        </Card>
      )}

      {grouped.map((g) => (
        <section key={g.type} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {notificationTypeLabels[g.type] ?? g.type} ({g.items.length})
          </h2>
          <ul className="space-y-2">
            {g.items.map((n) => (
              <NotificationItem key={n.id} n={n} />
            ))}
          </ul>
        </section>
      ))}

      {read.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Lidas ({read.length})
          </h2>
          <ul className="space-y-2">
            {read.slice(0, 20).map((n) => (
              <NotificationItem key={n.id} n={n} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
