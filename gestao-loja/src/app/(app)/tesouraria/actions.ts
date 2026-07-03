"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteTesouraria } from "@/lib/permissions";
import { buildPixPayload } from "@/lib/pix";

type ActionResult = { error?: string; ok?: string } | undefined;

async function requireTesourariaWriter() {
  const user = await requireUser();
  if (!canWriteTesouraria(user.role)) {
    throw new Error("Sem permissão de escrita na Tesouraria.");
  }
  return user;
}

// ─────────────── Configuração da chave Pix da Loja ───────────────

export async function updatePixKey(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: { pixKey: String(formData.get("pixKey")).trim() || null },
  });
  revalidatePath("/tesouraria/mensalidades");
  return { ok: "Chave Pix da Loja atualizada." };
}

// ─────────────── Mensalidades (capitações) ───────────────

// Gera as mensalidades do mês para todos os membros ATIVOS,
// já com txid e payload Pix Copia e Cola / QR Code dinâmico.
export async function generateInvoices(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const referenceMonth = Number(formData.get("month"));
  const referenceYear = Number(formData.get("year"));
  const amountCents = Math.round(Number(formData.get("amount")) * 100);
  const dueDate = new Date(String(formData.get("dueDate")));

  if (!referenceMonth || !referenceYear || !amountCents || isNaN(dueDate.getTime())) {
    return { error: "Preencha mês, ano, valor e vencimento." };
  }

  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: user.lodgeId },
  });
  if (!lodge.pixKey) {
    return { error: "Configure a chave Pix da Loja antes de gerar cobranças." };
  }

  const members = await prisma.user.findMany({
    where: { lodgeId: user.lodgeId, status: "ATIVO" },
  });

  let created = 0;
  for (const m of members) {
    const exists = await prisma.invoice.findUnique({
      where: {
        lodgeId_userId_referenceYear_referenceMonth: {
          lodgeId: user.lodgeId,
          userId: m.id,
          referenceYear,
          referenceMonth,
        },
      },
    });
    if (exists) continue;

    const txid = randomBytes(13).toString("hex").slice(0, 25);
    const pixCopiaECola = buildPixPayload({
      pixKey: lodge.pixKey,
      merchantName: lodge.name,
      merchantCity: lodge.oriente?.split("/")[0] ?? "SAO PAULO",
      amountCents,
      txid,
    });
    await prisma.invoice.create({
      data: {
        lodgeId: user.lodgeId,
        userId: m.id,
        description: `Capitação ${String(referenceMonth).padStart(2, "0")}/${referenceYear}`,
        referenceMonth,
        referenceYear,
        amountCents,
        dueDate,
        pixTxid: txid,
        pixCopiaECola,
      },
    });
    created++;
  }
  revalidatePath("/tesouraria/mensalidades");
  return { ok: `${created} cobrança(s) gerada(s) para ${members.length} membro(s) ativo(s).` };
}

// Baixa manual (dinheiro/transferência conferida pelo Tesoureiro)
export async function markInvoicePaid(invoiceId: string): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId, lodgeId: user.lodgeId },
  });
  if (invoice.status === "PAGA") return { error: "Cobrança já está paga." };
  await settleInvoice(invoice.id, "MANUAL");
  revalidatePath("/tesouraria/mensalidades");
  return { ok: "Baixa manual registrada." };
}

// Baixa + lançamento no livro-caixa (usada também pelo webhook Pix)
export async function settleInvoice(
  invoiceId: string,
  method: "PIX" | "MANUAL" | "CARTAO" | "BOLETO"
) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });
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
        category: "capitacao",
        invoiceId: invoice.id,
      },
    }),
  ]);
}

// ─────────────── Despesas com dupla aprovação ───────────────

export async function createExpense(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const amountCents = Math.round(Number(formData.get("amount")) * 100);
  if (!amountCents || amountCents <= 0) return { error: "Valor inválido." };
  await prisma.expense.create({
    data: {
      lodgeId: user.lodgeId,
      description: String(formData.get("description")),
      supplier: (formData.get("supplier") as string) || null,
      amountCents,
      dueDate: formData.get("dueDate")
        ? new Date(String(formData.get("dueDate")))
        : null,
    },
  });
  revalidatePath("/tesouraria/despesas");
  return { ok: "Despesa lançada — aguardando dupla aprovação." };
}

// Trava de Governança Financeira: VM + Tesoureiro, um de cada
export async function approveExpense(expenseId: string): Promise<ActionResult> {
  const user = await requireUser();
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId, lodgeId: user.lodgeId },
  });
  if (expense.status !== "PENDENTE_APROVACAO") {
    return { error: "Despesa não está pendente de aprovação." };
  }

  const data: Record<string, unknown> = {};
  if (user.role === "VENERAVEL_MESTRE" && !expense.approvedByMasterId) {
    data.approvedByMasterId = user.id;
    data.approvedByMasterAt = new Date();
  } else if (user.role === "TESOUREIRO" && !expense.approvedByTreasurerId) {
    data.approvedByTreasurerId = user.id;
    data.approvedByTreasurerAt = new Date();
  } else {
    return {
      error:
        "Apenas o Venerável Mestre e o Tesoureiro aprovam despesas (uma vez cada).",
    };
  }

  const master = data.approvedByMasterId ?? expense.approvedByMasterId;
  const treasurer = data.approvedByTreasurerId ?? expense.approvedByTreasurerId;
  if (master && treasurer) data.status = "APROVADA";

  await prisma.expense.update({
    where: { id: expenseId, lodgeId: user.lodgeId },
    data,
  });
  revalidatePath("/tesouraria/despesas");
  return {
    ok:
      data.status === "APROVADA"
        ? "Dupla aprovação concluída — despesa liberada para pagamento."
        : "Aprovação registrada. Aguardando a segunda aprovação.",
  };
}

export async function rejectExpense(expenseId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!["VENERAVEL_MESTRE", "TESOUREIRO"].includes(user.role)) {
    return { error: "Sem permissão." };
  }
  await prisma.expense.update({
    where: { id: expenseId, lodgeId: user.lodgeId, status: "PENDENTE_APROVACAO" },
    data: { status: "REJEITADA" },
  });
  revalidatePath("/tesouraria/despesas");
  return { ok: "Despesa rejeitada." };
}

export async function payExpense(expenseId: string): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const expense = await prisma.expense.findUniqueOrThrow({
    where: { id: expenseId, lodgeId: user.lodgeId },
  });
  // Trava: sem as duas aprovações não há pagamento
  if (expense.status !== "APROVADA") {
    return { error: "Pagamento bloqueado: a despesa precisa da dupla aprovação." };
  }
  await prisma.$transaction([
    prisma.expense.update({
      where: { id: expenseId, lodgeId: user.lodgeId },
      data: { status: "PAGA", paidAt: new Date() },
    }),
    prisma.transaction.create({
      data: {
        lodgeId: user.lodgeId,
        type: "DESPESA",
        description: expense.description,
        amountCents: expense.amountCents,
        date: new Date(),
        category: "despesa",
        expenseId: expense.id,
      },
    }),
  ]);
  revalidatePath("/tesouraria/despesas");
  return { ok: "Despesa paga e lançada no livro-caixa." };
}
