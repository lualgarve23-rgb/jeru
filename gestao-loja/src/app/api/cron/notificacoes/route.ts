import { prisma } from "@/lib/prisma";
import { syncLodgeNotifications } from "@/lib/notifications";
import { enviarLembretesEmail } from "@/lib/lembretes-email";
import { logInfo, logError, alertaCritico } from "@/lib/log";

// Varredura diária da central de notificações (cron do servidor).
// Garante que alertas por data — aniversários, prazos de 15 dias,
// interstícios — apareçam sem depender de alguém abrir a Secretaria.
// Autenticação por segredo compartilhado no header `x-cron-secret`.

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const lodges = await prisma.lodge.findMany({ select: { id: true } });
  let emails = 0;
  const falhas: string[] = [];
  for (const lodge of lodges) {
    // falha numa loja não pode derrubar a varredura das demais
    try {
      await syncLodgeNotifications(lodge.id);
      const r = await enviarLembretesEmail(lodge.id);
      emails += r.sent;
    } catch (e) {
      falhas.push(lodge.id);
      logError("cron.notificacoes.loja-falhou", e, { lodgeId: lodge.id });
    }
  }
  if (falhas.length) {
    await alertaCritico("cron.notificacoes.falhas-parciais", undefined, {
      falhas,
      lodges: lodges.length,
    });
  } else {
    logInfo("cron.notificacoes.fim", { lodges: lodges.length, emails });
  }
  return Response.json({ ok: true, lodges: lodges.length, emails, falhas });
}
