import { segredoConfere } from "@/lib/secrets";
import { processarFila } from "@/lib/fila";
import { alertaCritico } from "@/lib/log";

// Worker da fila de jobs (#13) — disparado a cada minuto pelo systemd timer.
// Autenticação por segredo compartilhado no header `x-cron-secret`.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !segredoConfere(request.headers.get("x-cron-secret"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await processarFila();
    return Response.json({ resultado: r });
  } catch (e) {
    await alertaCritico("cron.fila.falhou", e);
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
