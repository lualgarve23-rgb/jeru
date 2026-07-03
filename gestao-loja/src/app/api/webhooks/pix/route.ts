import { prisma } from "@/lib/prisma";
import { settleInvoice } from "@/app/(app)/tesouraria/actions";

// Webhook do PSP Pix: confirmação de pagamento → baixa automática.
// Autenticação por segredo compartilhado no header `x-webhook-secret`
// (em produção, valide também mTLS/assinatura conforme o PSP escolhido).
//
// Corpo esperado (formato Bacen/PSPs como Efí/Asaas normalizam para isto):
// { "pix": [ { "txid": "...", "valor": "120.00", "horario": "..." } ] }
// ou simplesmente { "txid": "..." }

export async function POST(request: Request) {
  const secret = process.env.PIX_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const obj = body as { txid?: string; pix?: { txid?: string }[] };
  const txids = [
    ...(obj.txid ? [obj.txid] : []),
    ...(obj.pix?.map((p) => p.txid).filter(Boolean) as string[] ?? []),
  ];
  if (txids.length === 0) {
    return Response.json({ error: "txid missing" }, { status: 400 });
  }

  const results: Record<string, string> = {};
  for (const txid of txids) {
    const invoice = await prisma.invoice.findUnique({
      where: { pixTxid: txid },
    });
    if (!invoice) {
      results[txid] = "not_found";
      continue;
    }
    await settleInvoice(invoice.id, "PIX"); // idempotente
    results[txid] = "settled";
  }
  return Response.json({ ok: true, results });
}
