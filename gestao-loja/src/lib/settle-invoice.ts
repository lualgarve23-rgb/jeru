import { prisma } from "@/lib/prisma";
import { syncInadimplencia } from "@/lib/inadimplencia";
import { auditar } from "@/lib/audit";
import { logInfo, logError } from "@/lib/log";
import { notificarEvento, usuariosDoCargo } from "@/lib/notificar-evento";
import { diaSaoPauloIso, inicioDoDiaSaoPaulo } from "@/lib/datas-sp";
import { recalcularQuitacaoQuitte } from "@/lib/quitte";
import { dataRespeitandoFechamento } from "@/lib/fechamento-mes";

export type PaidMethod = "PIX" | "MANUAL" | "CARTAO" | "BOLETO";

const metodoLabel: Record<PaidMethod, string> = {
  PIX: "Pix",
  MANUAL: "baixa manual",
  CARTAO: "cartão",
  BOLETO: "boleto",
};

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Baixa a cobrança e lança a receita no livro-caixa (idempotente e atômica:
 * dois webhooks simultâneos não lançam duas receitas — só quem "vence" o
 * updateMany condicional cria a Transaction).
 *
 * NÃO é Server Action — fica em lib/ para não ser invocável pelo cliente.
 * Callers autenticados (actions) e webhooks (token) devem passar lodgeId
 * quando já resolveram o tenant, para defesa em profundidade.
 */
export async function settleInvoice(
  invoiceId: string,
  method: PaidMethod,
  opts?: { lodgeId?: string }
): Promise<{ settled: boolean }> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (opts?.lodgeId && invoice.lodgeId !== opts.lodgeId) {
    throw new Error("Cobrança não pertence à Loja informada.");
  }
  if (invoice.status === "PAGA") return { settled: false }; // idempotente

  const paidAt = new Date();
  // Mês do pagamento já fechado pela Tesouraria? A baixa nunca é bloqueada:
  // a receita entra com a data de hoje e o Tesoureiro é avisado.
  const dataLancamento = await dataRespeitandoFechamento(invoice.lodgeId, paidAt, {
    descricao: `${invoice.user.name} — ${invoice.description}`,
    amountCents: invoice.amountCents,
    chave: invoice.id,
  });
  const settled = await prisma.$transaction(async (tx) => {
    const r = await tx.invoice.updateMany({
      where: { id: invoiceId, status: { not: "PAGA" } },
      data: { status: "PAGA", paidAt, paidMethod: method },
    });
    if (r.count !== 1) return false;
    await tx.transaction.create({
      data: {
        lodgeId: invoice.lodgeId,
        type: "RECEITA",
        description: invoice.description,
        amountCents: invoice.amountCents,
        date: dataLancamento,
        category: "Capitação",
        invoiceId: invoice.id,
      },
    });
    return true;
  });
  if (!settled) return { settled: false }; // outra baixa concorrente venceu

  // Avisos: ao irmão ("Pagamento recebido") e ao Tesoureiro (agrupado por dia)
  const referencia = `${String(invoice.referenceMonth).padStart(2, "0")}/${invoice.referenceYear}`;
  await notificarEvento(prisma, {
    lodgeId: invoice.lodgeId,
    sourceKey: `pago:${invoice.id}`,
    userId: invoice.userId,
    type: "FINANCIAL_APPROVAL",
    title: `Pagamento recebido — capitação ${referencia}`,
    description: `Recebemos ${brl(invoice.amountCents)} via ${metodoLabel[method]}. Obrigado, irmão!`,
    link: `/tesouraria/mensalidades/${invoice.id}`,
  });
  const dia = diaSaoPauloIso(paidAt);
  const [pagosHoje, tesoureiros] = await Promise.all([
    prisma.invoice.findMany({
      where: { lodgeId: invoice.lodgeId, status: "PAGA", paidAt: { gte: inicioDoDiaSaoPaulo(paidAt) } },
      select: { amountCents: true },
    }),
    usuariosDoCargo(prisma, invoice.lodgeId, "TESOUREIRO"),
  ]);
  const total = pagosHoje.reduce((s, i) => s + i.amountCents, 0);
  const qtd = Math.max(pagosHoje.length, 1);
  await notificarEvento(prisma, {
    lodgeId: invoice.lodgeId,
    sourceKey: `pagamentos:${invoice.lodgeId}:${dia}`,
    // dirigida ao Tesoureiro; sem Tesoureiro ativo fica visível a VM/Sec/Conselho
    userId: tesoureiros[0] ?? null,
    type: "FINANCIAL_APPROVAL",
    title: `${qtd} pagamento(s) de capitação recebido(s) hoje`,
    description:
      `Total do dia: ${brl(total)}. Último: ${invoice.user.name}, capitação ${referencia}, ` +
      `${brl(invoice.amountCents)} via ${metodoLabel[method]}.`,
    link: `/tesouraria/mensalidades`,
  });

  // pagamento pode regularizar o membro (inadimplência automática)
  await syncInadimplencia(invoice.lodgeId);
  // ...e destravar o Nada Consta de um Quitte Placet em andamento
  try {
    await recalcularQuitacaoQuitte(invoice.lodgeId, invoice.userId, paidAt);
  } catch (e) {
    logError("settle-invoice.quitte", e, { invoiceId });
  }
  return { settled: true };
}

// Valor pago ≠ valor cobrado (webhooks Pix e Asaas): não baixa, audita e
// avisa o Tesoureiro — que confere o extrato e decide pela baixa manual.
export async function registrarValorDivergente(
  invoice: { id: string; lodgeId: string; userId: string; amountCents: number; description: string },
  valorPagoCents: number,
  origem: "PIX" | "ASAAS",
  referenciaPsp: string
) {
  await auditar({
    lodgeId: invoice.lodgeId,
    ator: "webhook",
    acao: "mensalidade.valor-divergente",
    entidade: "Invoice",
    entidadeId: invoice.id,
    detalhes: { origem, referenciaPsp, cobradoCents: invoice.amountCents, pagoCents: valorPagoCents },
  });
  const membro = await prisma.user.findUnique({
    where: { id: invoice.userId },
    select: { name: true },
  });
  const tesoureiros = await usuariosDoCargo(prisma, invoice.lodgeId, "TESOUREIRO");
  const destinos: (string | null)[] = tesoureiros.length ? tesoureiros : [null];
  for (const userId of destinos) {
    await notificarEvento(prisma, {
      lodgeId: invoice.lodgeId,
      sourceKey: `valor-divergente:${invoice.id}:${referenciaPsp}${userId ? `:${userId}` : ""}`,
      userId,
      type: "FINANCIAL_APPROVAL",
      title: `Pagamento com valor divergente — ${membro?.name ?? "membro"} (${invoice.description})`,
      description:
        `O ${origem === "PIX" ? "PSP Pix" : "Asaas"} informou ${brl(valorPagoCents)}, mas a cobrança é de ${brl(invoice.amountCents)}. ` +
        `A baixa NÃO foi feita: confira o extrato e, se estiver correto, registre a baixa manual.`,
      link: `/tesouraria/mensalidades/${invoice.id}`,
    });
  }
  logInfo("webhook.valor-divergente", { invoiceId: invoice.id, origem, cobrado: invoice.amountCents, pago: valorPagoCents });
}
