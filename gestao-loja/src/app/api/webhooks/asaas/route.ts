import { prisma } from "@/lib/prisma";
import { settleInvoice } from "@/app/(app)/tesouraria/actions";

// Webhook do Asaas — configurar na conta da Loja apontando para
// https://<host>/api/webhooks/asaas com o token de autenticação
// igual ao Lodge.asaasWebhookToken (header `asaas-access-token`).
//
// Eventos tratados:
//  - PAYMENT_CREATED de assinatura → cria a Invoice do mês do membro
//  - PAYMENT_RECEIVED / PAYMENT_CONFIRMED → baixa automática (settleInvoice)

type AsaasPayment = {
  id: string;
  subscription?: string;
  value: number;
  dueDate: string;
  description?: string;
  billingType?: string;
  externalReference?: string;
  invoiceUrl?: string;
};

const methodByBillingType: Record<string, "PIX" | "CARTAO" | "BOLETO"> = {
  PIX: "PIX",
  CREDIT_CARD: "CARTAO",
  BOLETO: "BOLETO",
};

export async function POST(request: Request) {
  const token = request.headers.get("asaas-access-token");
  const lodge = token
    ? await prisma.lodge.findFirst({ where: { asaasWebhookToken: token } })
    : null;
  if (!lodge) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { event?: string; payment?: AsaasPayment };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const { event, payment } = body;
  if (!event || !payment?.id) {
    return Response.json({ error: "event/payment missing" }, { status: 400 });
  }

  if (event === "PAYMENT_CREATED" && payment.subscription) {
    // Cobrança mensal gerada pela assinatura → registra a capitação
    const member = await prisma.user.findFirst({
      where: { lodgeId: lodge.id, asaasSubscriptionId: payment.subscription },
    });
    if (!member) return Response.json({ ok: true, result: "member_not_found" });

    const due = new Date(payment.dueDate);
    const referenceMonth = due.getUTCMonth() + 1;
    const referenceYear = due.getUTCFullYear();
    await prisma.invoice.upsert({
      where: {
        lodgeId_userId_referenceYear_referenceMonth: {
          lodgeId: lodge.id,
          userId: member.id,
          referenceYear,
          referenceMonth,
        },
      },
      create: {
        lodgeId: lodge.id,
        userId: member.id,
        description:
          payment.description ??
          `Capitação ${String(referenceMonth).padStart(2, "0")}/${referenceYear}`,
        referenceMonth,
        referenceYear,
        amountCents: Math.round(payment.value * 100),
        dueDate: due,
        gatewayChargeId: payment.id,
        gatewayInvoiceUrl: payment.invoiceUrl ?? null,
      },
      update: {
        gatewayChargeId: payment.id,
        gatewayInvoiceUrl: payment.invoiceUrl ?? null,
      },
    });
    return Response.json({ ok: true, result: "invoice_upserted" });
  }

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    const invoice = await prisma.invoice.findFirst({
      where: {
        lodgeId: lodge.id,
        OR: [
          { gatewayChargeId: payment.id },
          ...(payment.externalReference ? [{ id: payment.externalReference }] : []),
        ],
      },
    });
    if (!invoice) return Response.json({ ok: true, result: "invoice_not_found" });
    await settleInvoice(
      invoice.id,
      methodByBillingType[payment.billingType ?? ""] ?? "MANUAL"
    ); // idempotente
    return Response.json({ ok: true, result: "settled" });
  }

  return Response.json({ ok: true, result: "ignored" });
}
