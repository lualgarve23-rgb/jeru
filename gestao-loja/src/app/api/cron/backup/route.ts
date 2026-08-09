import { backupTodasLojas } from "@/lib/backup-plataforma";
import { logInfo, alertaCritico } from "@/lib/log";

// Backup automático diário das lojas para o Drive do super admin (cron do
// servidor). Autenticação por segredo compartilhado no header `x-cron-secret`.

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    logInfo("cron.backup.inicio");
    const r = await backupTodasLojas();
    if (r.falhas.length) {
      await alertaCritico("cron.backup.falhas-parciais", undefined, {
        falhas: r.falhas,
        enviados: r.ok,
      });
    } else {
      logInfo("cron.backup.fim", { enviados: r.ok, pasta: r.pasta });
    }
    return Response.json({ enviados: r.ok, falhas: r.falhas, pasta: r.pasta });
  } catch (e) {
    await alertaCritico("cron.backup.falhou", e);
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
