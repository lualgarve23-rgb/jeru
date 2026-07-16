import { prisma } from "@/lib/prisma";

// Webhook do Asaas da PLATAFORMA (licenças do SaaS) — configurar na conta
// Asaas da plataforma apontando para /api/webhooks/asaas-plataforma com o
// token de autenticação igual a ASAAS_PLATFORM_WEBHOOK_TOKEN (.env).
//
// A cobrança da licença carrega externalReference "licenca:<lodgeId>";
// como redundância, o payment.id também é comparado a licencaChargeId.

export async function POST(request: Request) {
  const secret = process.env.ASAAS_PLATFORM_WEBHOOK_TOKEN;
  if (!secret || request.headers.get("asaas-access-token") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    event?: string;
    payment?: { id?: string; externalReference?: string; paymentDate?: string };
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const { event, payment } = body;
  if (!event || !payment?.id) {
    return Response.json({ error: "event/payment missing" }, { status: 400 });
  }

  const lodgeId = payment.externalReference?.startsWith("licenca:")
    ? payment.externalReference.slice("licenca:".length)
    : null;
  const lodge = await prisma.lodge.findFirst({
    where: lodgeId ? { id: lodgeId } : { licencaChargeId: payment.id },
  });
  if (!lodge) return Response.json({ result: "lodge_not_found" });

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    await prisma.lodge.update({
      where: { id: lodge.id },
      data: {
        licencaStatus: "PAGA",
        licencaPagaEm: payment.paymentDate
          ? new Date(payment.paymentDate)
          : new Date(),
      },
    });
    return Response.json({ result: "paga" });
  }
  if (event === "PAYMENT_OVERDUE") {
    // Não rebaixa uma licença já quitada (webhooks podem chegar fora de ordem)
    if (lodge.licencaStatus !== "PAGA") {
      await prisma.lodge.update({
        where: { id: lodge.id },
        data: { licencaStatus: "VENCIDA" },
      });
    }
    return Response.json({ result: "vencida" });
  }
  return Response.json({ result: "ignored" });
}
