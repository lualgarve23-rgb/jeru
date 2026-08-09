import { prisma } from "@/lib/prisma";
import { syncInadimplencia } from "@/lib/inadimplencia";

export type PaidMethod = "PIX" | "MANUAL" | "CARTAO" | "BOLETO";

/**
 * Baixa a cobrança e lança a receita no livro-caixa (idempotente).
 *
 * NÃO é Server Action — fica em lib/ para não ser invocável pelo cliente.
 * Callers autenticados (actions) e webhooks (token) devem passar lodgeId
 * quando já resolveram o tenant, para defesa em profundidade.
 */
export async function settleInvoice(
  invoiceId: string,
  method: PaidMethod,
  opts?: { lodgeId?: string }
) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });
  if (opts?.lodgeId && invoice.lodgeId !== opts.lodgeId) {
    throw new Error("Cobrança não pertence à Loja informada.");
  }
  if (invoice.status === "PAGA") return; // idempotente

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "PAGA", paidAt: new Date(), paidMethod: method },
    }),
    prisma.transaction.create({
      data: {
        lodgeId: invoice.lodgeId,
        type: "RECEITA",
        description: invoice.description,
        amountCents: invoice.amountCents,
        date: new Date(),
        category: "Capitação",
        invoiceId: invoice.id,
      },
    }),
  ]);
  // pagamento pode regularizar o membro (inadimplência automática)
  await syncInadimplencia(invoice.lodgeId);
}
