import { backupTodasLojas } from "@/lib/backup-plataforma";

// Backup automático diário das lojas para o Drive do super admin (cron do
// servidor). Autenticação por segredo compartilhado no header `x-cron-secret`.

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await backupTodasLojas();
    return Response.json({ enviados: r.ok, falhas: r.falhas, pasta: r.pasta });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
