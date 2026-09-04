import { segredoConfere } from "@/lib/secrets";
import { prisma } from "@/lib/prisma";
import { settleInvoice } from "@/lib/settle-invoice";
import { auditar } from "@/lib/audit";
import { logInfo } from "@/lib/log";
import { registrarValorDivergente } from "@/lib/settle-invoice";

// Webhook do PSP Pix: confirmação de pagamento → baixa automática.
// Autenticação por segredo compartilhado no header `x-webhook-secret`
// (em produção, valide também mTLS/assinatura conforme o PSP escolhido).
//
// Corpo esperado (formato Bacen/PSPs como Efí/Asaas normalizam para isto):
// { "pix": [ { "txid": "...", "valor": "120.00", "horario": "..." } ] }
// ou simplesmente { "txid": "..." }

export async function POST(request: Request) {
  const secret = process.env.PIX_WEBHOOK_SECRET?.trim();
  if (!secret || !segredoConfere(request.headers.get("x-webhook-secret"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const obj = body as {
    txid?: string;
    valor?: string | number;
    pix?: { txid?: string; valor?: string | number }[];
  };
  // txid → valor informado pelo PSP (undefined quando o payload não traz)
  const pagamentos: { txid: string; valor?: number }[] = [
    ...(obj.txid ? [{ txid: obj.txid, valor: parseValor(obj.valor) }] : []),
    ...(obj.pix ?? [])
      .filter((p): p is { txid: string; valor?: string | number } => !!p.txid)
      .map((p) => ({ txid: p.txid, valor: parseValor(p.valor) })),
  ];
  if (pagamentos.length === 0) {
    return Response.json({ error: "txid missing" }, { status: 400 });
  }

  const results: Record<string, string> = {};
  for (const { txid, valor } of pagamentos) {
    const invoice = await prisma.invoice.findUnique({
      where: { pixTxid: txid },
    });
    if (!invoice) {
      results[txid] = "not_found";
      continue;
    }
    // Confere o valor pago com o cobrado: divergência NÃO baixa — o
    // Tesoureiro decide (e o PSP recebe 200 para não retentar)
    if (valor !== undefined && valor !== invoice.amountCents) {
      await registrarValorDivergente(invoice, valor, "PIX", txid);
      results[txid] = "amount_mismatch";
      continue;
    }
    await settleInvoice(invoice.id, "PIX", { lodgeId: invoice.lodgeId }); // idempotente
    await auditar({
      lodgeId: invoice.lodgeId,
      ator: "webhook",
      acao: "mensalidade.baixa-pix",
      entidade: "Invoice",
      entidadeId: invoice.id,
    });
    results[txid] = "settled";
  }
  logInfo("webhook.pix", { results });
  return Response.json({ ok: true, results });
}

function parseValor(v: string | number | undefined): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

