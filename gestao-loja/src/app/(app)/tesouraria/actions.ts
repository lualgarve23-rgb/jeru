"use server";

import { revalidatePath } from "next/cache";
import { aposEventoDaLoja } from "@/lib/apos-evento";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteTesouraria } from "@/lib/permissions";
import { auditar } from "@/lib/audit";
import { buildPixPayload } from "@/lib/pix";
import { settleInvoice } from "@/lib/settle-invoice";
import { fimDoDiaSaoPaulo, partesSaoPaulo } from "@/lib/datas-sp";
import { notificarEvento } from "@/lib/notificar-evento";
import {
  AsaasError,
  ensureCustomer,
  createPayment,
  createSubscription,
  cancelSubscription,
} from "@/lib/asaas";

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
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "tesouraria.pix-key",
    entidade: "Lodge",
    entidadeId: user.lodgeId,
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/mensalidades");
  return { ok: "Chave Pix da Loja atualizada." };
}

// ─────────────── Mensalidades (capitações) ───────────────

// Gera as mensalidades do mês para todos os membros ATIVOS e IRREGULARES
// (inadimplente continua devendo; exceto obreiros filiados, que não recolhem
// capitação), já com txid e payload Pix Copia e Cola / QR Code dinâmico.
export async function generateInvoices(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const referenceMonth = Number(formData.get("month"));
  const referenceYear = Number(formData.get("year"));
  const amountCents = Math.round(Number(formData.get("amount")) * 100);
  // vencimento = 23:59:59 de São Paulo do dia escolhido
  const dueDate = fimDoDiaSaoPaulo(String(formData.get("dueDate") ?? ""));

  if (!referenceMonth || !referenceYear || !amountCents || !dueDate) {
    return { error: "Preencha mês, ano, valor e vencimento." };
  }
  if (!Number.isInteger(referenceMonth) || referenceMonth < 1 || referenceMonth > 12) {
    return { error: "Mês de referência inválido (1 a 12)." };
  }
  const anoAtual = partesSaoPaulo(new Date()).ano;
  if (!Number.isInteger(referenceYear) || referenceYear < anoAtual - 5 || referenceYear > anoAtual + 1) {
    return { error: `Ano de referência inválido (entre ${anoAtual - 5} e ${anoAtual + 1}).` };
  }
  if (amountCents <= 0) return { error: "Valor inválido." };

  const lodge = await prisma.lodge.findUniqueOrThrow({
    where: { id: user.lodgeId },
  });
  if (!lodge.pixKey) {
    return { error: "Configure a chave Pix da Loja antes de gerar cobranças." };
  }

  const members = await prisma.user.findMany({
    where: { lodgeId: user.lodgeId, status: { in: ["ATIVO", "IRREGULAR"] }, filiado: false },
  });
  const referencia = `${String(referenceMonth).padStart(2, "0")}/${referenceYear}`;

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
    const invoice = await prisma.invoice.create({
      data: {
        lodgeId: user.lodgeId,
        userId: m.id,
        description: `Capitação ${referencia}`,
        referenceMonth,
        referenceYear,
        amountCents,
        dueDate,
        pixTxid: txid,
        pixCopiaECola,
      },
    });
    created++;
    // Aviso ao irmão com o link do QR Code / Pix Copia e Cola
    await notificarEvento(prisma, {
      lodgeId: user.lodgeId,
      sourceKey: `emitida:${invoice.id}`,
      userId: m.id,
      type: "FINANCIAL_APPROVAL",
      title: `Capitação ${referencia} emitida`,
      description: `Valor ${(amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, vencimento ${dueDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Pague pelo Pix (QR Code ou Copia e Cola).`,
      link: `/tesouraria/mensalidades/${invoice.id}`,
      dueDate,
    });
  }
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "mensalidade.gerar",
    detalhes: { referencia, geradas: created, valorCents: amountCents, vencimento: dueDate.toISOString() },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/mensalidades");
  return { ok: `${created} cobrança(s) gerada(s) para ${members.length} membro(s) ativo(s)/irregular(es).` };
}

// Baixa manual (dinheiro/transferência conferida pelo Tesoureiro)
export async function markInvoicePaid(invoiceId: string): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId, lodgeId: user.lodgeId },
  });
  if (invoice.status === "PAGA") return { error: "Cobrança já está paga." };
  await settleInvoice(invoice.id, "MANUAL", { lodgeId: user.lodgeId });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "mensalidade.baixa-manual",
    entidade: "Invoice",
    entidadeId: invoice.id,
    detalhes: { referencia: `${invoice.referenceMonth}/${invoice.referenceYear}`, valorCents: invoice.amountCents },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/mensalidades");
  return { ok: "Baixa manual registrada." };
}

// ─────────────── Gateway Asaas (cartão/boleto recorrente) ───────────────

export async function updateAsaasConfig(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  let asaasApiKey =
    String(formData.get("asaasApiKey")).trim() || null;
  let asaasWebhookToken =
    String(formData.get("asaasWebhookToken")).trim() || null;

  // Campos mascarados na UI: em branco mantém o valor já salvo
  if (!asaasApiKey || !asaasWebhookToken) {
    const atual = await prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: { asaasApiKey: true, asaasWebhookToken: true },
    });
    if (!asaasApiKey) asaasApiKey = atual.asaasApiKey;
    if (!asaasWebhookToken) asaasWebhookToken = atual.asaasWebhookToken;
  }

  const { sealSecret } = await import("@/lib/secrets");
  await prisma.lodge.update({
    where: { id: user.lodgeId },
    data: {
      asaasApiKey: sealSecret(asaasApiKey),
      // token do webhook fica em claro — usado em lookup `where: { asaasWebhookToken }`
      asaasWebhookToken,
    },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "tesouraria.config-asaas",
    entidade: "Lodge",
    entidadeId: user.lodgeId,
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/mensalidades");
  return { ok: "Configuração do gateway Asaas atualizada." };
}

async function requireAsaasLodge(lodgeId: string) {
  const lodge = await prisma.lodge.findUniqueOrThrow({ where: { id: lodgeId } });
  const { openSecret } = await import("@/lib/secrets");
  const asaasApiKey = openSecret(lodge.asaasApiKey);
  if (!asaasApiKey) {
    throw new AsaasError(
      "Configure a API key do Asaas antes de usar o gateway."
    );
  }
  return { ...lodge, asaasApiKey };
}

// Gera o link de pagamento (boleto/cartão/Pix à escolha do pagador)
// para uma capitação já existente.
export async function createAsaasCharge(invoiceId: string): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  try {
    const lodge = await requireAsaasLodge(user.lodgeId);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId, lodgeId: user.lodgeId },
      include: { user: true },
    });
    if (invoice.status === "PAGA") return { error: "Cobrança já está paga." };
    if (invoice.gatewayChargeId) return { error: "Link já gerado para esta cobrança." };

    const customerId = await ensureCustomer(lodge.asaasApiKey, invoice.user);
    if (customerId !== invoice.user.asaasCustomerId) {
      await prisma.user.update({
        where: { id: invoice.userId },
        data: { asaasCustomerId: customerId },
      });
    }
    const payment = await createPayment(lodge.asaasApiKey, {
      customerId,
      amountCents: invoice.amountCents,
      dueDate: invoice.dueDate < new Date() ? new Date() : invoice.dueDate,
      description: invoice.description,
      externalReference: invoice.id,
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { gatewayChargeId: payment.id, gatewayInvoiceUrl: payment.invoiceUrl },
    });
    aposEventoDaLoja(user.lodgeId);
    revalidatePath("/tesouraria/mensalidades");
    return { ok: "Link de pagamento gerado." };
  } catch (e) {
    if (e instanceof AsaasError) return { error: e.message };
    throw e;
  }
}

// Ativa assinatura mensal recorrente (capitação) para todos os
// membros ativos e irregulares que ainda não têm assinatura.
export async function enableAsaasSubscriptions(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const amountCents = Math.round(Number(formData.get("amount")) * 100);
  const nextDueDate = new Date(String(formData.get("nextDueDate")));
  if (!amountCents || amountCents <= 0 || isNaN(nextDueDate.getTime())) {
    return { error: "Informe o valor mensal e o primeiro vencimento." };
  }
  try {
    const lodge = await requireAsaasLodge(user.lodgeId);
    const members = await prisma.user.findMany({
      where: {
        lodgeId: user.lodgeId,
        status: { in: ["ATIVO", "IRREGULAR"] },
        filiado: false,
        asaasSubscriptionId: null,
      },
    });
    if (members.length === 0) {
      return { error: "Todos os membros ativos/irregulares já têm assinatura." };
    }
    let created = 0;
    for (const m of members) {
      const customerId = await ensureCustomer(lodge.asaasApiKey, m);
      const sub = await createSubscription(lodge.asaasApiKey, {
        customerId,
        amountCents,
        nextDueDate,
        description: `Capitação mensal — ${lodge.name}`,
        externalReference: m.id,
      });
      await prisma.user.update({
        where: { id: m.id },
        data: { asaasCustomerId: customerId, asaasSubscriptionId: sub.id },
      });
      created++;
    }
    aposEventoDaLoja(user.lodgeId);
    revalidatePath("/tesouraria/mensalidades");
    return { ok: `${created} assinatura(s) recorrente(s) ativada(s).` };
  } catch (e) {
    if (e instanceof AsaasError) return { error: e.message };
    throw e;
  }
}

export async function cancelAsaasSubscription(userId: string): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  try {
    const lodge = await requireAsaasLodge(user.lodgeId);
    const member = await prisma.user.findUniqueOrThrow({
      where: { id: userId, lodgeId: user.lodgeId },
    });
    if (!member.asaasSubscriptionId) return { error: "Membro sem assinatura ativa." };
    await cancelSubscription(lodge.asaasApiKey, member.asaasSubscriptionId);
    await prisma.user.update({
      where: { id: member.id },
      data: { asaasSubscriptionId: null },
    });
    aposEventoDaLoja(user.lodgeId);
    revalidatePath("/tesouraria/mensalidades");
    return { ok: "Assinatura cancelada." };
  } catch (e) {
    if (e instanceof AsaasError) return { error: e.message };
    throw e;
  }
}

// ─────────────── Despesas com dupla aprovação ───────────────

// Resolve a categoria do formulário: seleção existente ou criação on-the-fly
// via campo "novaCategoria" (cadastro dinâmico de tags por Loja)
async function resolveCategoria(
  lodgeId: string,
  formData: FormData,
  tipo: "RECEITA" | "DESPESA"
): Promise<string | null> {
  const nova = String(formData.get("novaCategoria") ?? "").trim();
  if (nova) {
    await prisma.categoriaFinanceira.upsert({
      where: { lodgeId_nome_tipo: { lodgeId, nome: nova, tipo } },
      create: { lodgeId, nome: nova, tipo },
      update: {},
    });
    return nova;
  }
  const sel = String(formData.get("category") ?? "").trim();
  return sel || null;
}

// Receita manual (além das automáticas do Asaas/Pix) — direto no livro-caixa
export async function createReceita(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const description = String(formData.get("description") ?? "").trim();
  const amountCents = Math.round(
    Number(String(formData.get("amount")).replace(",", ".")) * 100
  );
  // data do lançamento no dia civil de São Paulo (cai no mês certo do balancete)
  const date = fimDoDiaSaoPaulo(String(formData.get("date") ?? ""));
  if (!description) return { error: "Informe a descrição." };
  if (!amountCents || amountCents <= 0) return { error: "Valor inválido." };
  if (!date) return { error: "Data inválida." };
  const category = await resolveCategoria(user.lodgeId, formData, "RECEITA");

  const t = await prisma.transaction.create({
    data: {
      lodgeId: user.lodgeId,
      type: "RECEITA",
      description,
      amountCents,
      date,
      category,
    },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "receita.lancar",
    entidade: "Transaction",
    entidadeId: t.id,
    detalhes: { descricao: description, valorCents: amountCents, categoria: category, data: date.toISOString() },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/balancete");
  return { ok: "Receita lançada no livro-caixa." };
}

export async function deleteCategoria(id: string): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  await prisma.categoriaFinanceira.delete({
    where: { id, lodgeId: user.lodgeId },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/balancete");
  revalidatePath("/tesouraria/despesas");
  return { ok: "Categoria removida (lançamentos antigos não são alterados)." };
}

export async function createExpense(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const amountCents = Math.round(Number(formData.get("amount")) * 100);
  if (!amountCents || amountCents <= 0) return { error: "Valor inválido." };
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Informe a descrição." };
  const category = await resolveCategoria(user.lodgeId, formData, "DESPESA");
  const dueDate = formData.get("dueDate")
    ? fimDoDiaSaoPaulo(String(formData.get("dueDate")))
    : null;
  const expense = await prisma.expense.create({
    data: {
      lodgeId: user.lodgeId,
      description,
      supplier: (formData.get("supplier") as string) || null,
      amountCents,
      category,
      dueDate,
    },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "despesa.lancar",
    entidade: "Expense",
    entidadeId: expense.id,
    detalhes: { descricao: description, valorCents: amountCents, categoria: category, fornecedor: expense.supplier ?? undefined },
  });
  aposEventoDaLoja(user.lodgeId);
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
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "despesa.aprovar",
    entidade: "Expense",
    entidadeId: expenseId,
    detalhes: { aprovacaoCompleta: data.status === "APROVADA" },
  });
  aposEventoDaLoja(user.lodgeId);
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
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "despesa.rejeitar",
    entidade: "Expense",
    entidadeId: expenseId,
  });
  aposEventoDaLoja(user.lodgeId);
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
        category: expense.category,
        expenseId: expense.id,
      },
    }),
  ]);
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "despesa.pagar",
    entidade: "Expense",
    entidadeId: expenseId,
    detalhes: { valorCents: expense.amountCents },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/despesas");
  return { ok: "Despesa paga e lançada no livro-caixa." };
}
