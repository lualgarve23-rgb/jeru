import { prisma } from "@/lib/prisma";
import { syncLodgeNotifications } from "@/lib/notifications";

// Varredura diária da central de notificações (cron do servidor).
// Garante que alertas por data — aniversários, prazos de 15 dias,
// interstícios — apareçam sem depender de alguém abrir a Secretaria.
// Autenticação por segredo compartilhado no header `x-cron-secret`.

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const lodges = await prisma.lodge.findMany({ select: { id: true } });
  for (const lodge of lodges) {
    await syncLodgeNotifications(lodge.id);
  }
  return Response.json({ ok: true, lodges: lodges.length });
}
