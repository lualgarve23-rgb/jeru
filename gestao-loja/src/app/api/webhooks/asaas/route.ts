import { prisma } from "@/lib/prisma";
import { settleInvoice, registrarValorDivergente } from "@/lib/settle-invoice";
import { fimDoDiaSaoPaulo } from "@/lib/datas-sp";
import { auditar } from "@/lib/audit";
import { logInfo } from "@/lib/log";

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
  const token = request.headers.get("asaas-access-token")?.trim() || "";
  // Token vazio nunca autentica (evita match acidental com lodges sem token)
  if (!token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const lodge = await prisma.lodge.findFirst({
    where: { asaasWebhookToken: token },
  });
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
    // Membro licenciado/desligado não recebe capitação nova (a assinatura já
    // deveria ter sido cancelada em lib/status-membro.ts)
    if (member.status !== "ATIVO" && member.status !== "IRREGULAR") {
      logInfo("webhook.asaas", {
        lodgeId: lodge.id,
        event,
        result: "member_inactive_ignored",
        userId: member.id,
        status: member.status,
      });
      return Response.json({ ok: true, result: "member_inactive_ignored" });
    }
    if (!Number.isFinite(payment.value) || payment.value <= 0) {
      return Response.json({ error: "invalid value" }, { status: 400 });
    }

    // Vencimento "AAAA-MM-DD" do Asaas → 23:59:59 de São Paulo
    const due = fimDoDiaSaoPaulo(payment.dueDate ?? "");
    if (!due) return Response.json({ error: "invalid dueDate" }, { status: 400 });
    const m = /^(\d{4})-(\d{2})/.exec(payment.dueDate);
    const referenceMonth = Number(m![2]);
    const referenceYear = Number(m![1]);
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
    logInfo("webhook.asaas", { lodgeId: lodge.id, event, result: "invoice_upserted" });
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
    // Confere o valor pago com o cobrado: divergência NÃO baixa (200 para o
    // Asaas não retentar; o Tesoureiro é avisado)
    const pagoCents = Number.isFinite(payment.value) ? Math.round(payment.value * 100) : undefined;
    if (pagoCents !== undefined && pagoCents !== invoice.amountCents) {
      await registrarValorDivergente(invoice, pagoCents, "ASAAS", payment.id);
      logInfo("webhook.asaas", { lodgeId: lodge.id, event, result: "amount_mismatch" });
      return Response.json({ ok: true, result: "amount_mismatch" });
    }
    await settleInvoice(
      invoice.id,
      methodByBillingType[payment.billingType ?? ""] ?? "MANUAL",
      { lodgeId: lodge.id }
    );
    await auditar({
      lodgeId: lodge.id,
      ator: "webhook",
      acao: "mensalidade.baixa-asaas",
      entidade: "Invoice",
      entidadeId: invoice.id,
    }); // idempotente
    logInfo("webhook.asaas", { lodgeId: lodge.id, event, result: "settled" });
    return Response.json({ ok: true, result: "settled" });
  }

  return Response.json({ ok: true, result: "ignored" });
}
