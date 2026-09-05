"use server";

import { revalidatePath } from "next/cache";
import { aposEventoDaLoja } from "@/lib/apos-evento";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/session";
import { canWriteTesouraria } from "@/lib/permissions";
import { auditar } from "@/lib/audit";
import { buildPixPayload } from "@/lib/pix";
import { settleInvoice } from "@/lib/settle-invoice";
import { fimDoDiaSaoPaulo, intervaloMesSaoPaulo, partesSaoPaulo } from "@/lib/datas-sp";
import { notificarEvento, usuariosDoCargo } from "@/lib/notificar-evento";
import {
  MSG_MES_FECHADO,
  dataRespeitandoFechamento,
  estaFechado,
  fechamentoAtivoDaData,
  mesFechavel,
  referenciaMes,
} from "@/lib/fechamento-mes";
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
  // Mês já fechado pela Tesouraria: lançamento manual bloqueado
  if (await fechamentoAtivoDaData(user.lodgeId, date)) return { error: MSG_MES_FECHADO };
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
  // Vencimento dentro de mês já fechado: a despesa não pode entrar nele
  if (dueDate && (await fechamentoAtivoDaData(user.lodgeId, dueDate))) {
    return { error: MSG_MES_FECHADO };
  }
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
  // Nunca bloqueia o pagamento; se o mês estivesse fechado, entra hoje e avisa
  const dataPagamento = await dataRespeitandoFechamento(user.lodgeId, new Date(), {
    descricao: expense.description,
    amountCents: expense.amountCents,
    chave: expense.id,
  });
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
        date: dataPagamento,
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

// ─────────────── Fechamento mensal do balancete ───────────────

function lerMesAno(formData: FormData): { mes: number; ano: number } | null {
  const mes = Number(formData.get("mes"));
  const ano = Number(formData.get("ano"));
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return null;
  return { mes, ano };
}

async function totaisDoMes(lodgeId: string, ano: number, mes: number) {
  const { inicio, fim } = intervaloMesSaoPaulo(ano, mes);
  const grupos = await prisma.transaction.groupBy({
    by: ["type"],
    where: { lodgeId, date: { gte: inicio, lt: fim } },
    _sum: { amountCents: true },
  });
  const soma = (tipo: string) => grupos.find((g) => g.type === tipo)?._sum.amountCents ?? 0;
  const receitasCents = soma("RECEITA");
  const despesasCents = soma("DESPESA");
  return { receitasCents, despesasCents, saldoCents: receitasCents - despesasCents };
}

// Fecha o mês (Tesoureiro/VM): congela os totais e pede a ciência do Conselho
export async function fecharMes(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const ref = lerMesAno(formData);
  if (!ref) return { error: "Mês/ano inválidos." };
  const { mes, ano } = ref;
  if (!mesFechavel(ano, mes)) {
    return { error: "Só é possível fechar um mês já terminado." };
  }
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;
  const existente = await prisma.fechamentoMes.findUnique({
    where: { lodgeId_ano_mes: { lodgeId: user.lodgeId, ano, mes } },
    select: { id: true, reabertoAt: true },
  });
  if (existente && estaFechado(existente)) return { error: "Este mês já está fechado." };

  const totais = await totaisDoMes(user.lodgeId, ano, mes);
  const dados = {
    fechadoPorId: user.id,
    fechadoAt: new Date(),
    ...totais,
    observacao,
    cienciaConselhoPorId: null,
    cienciaConselhoAt: null,
    reabertoPorId: null,
    reabertoAt: null,
    motivoReabertura: null,
  };
  const f = existente
    ? await prisma.fechamentoMes.update({ where: { id: existente.id }, data: dados })
    : await prisma.fechamentoMes.create({ data: { lodgeId: user.lodgeId, ano, mes, ...dados } });

  const referencia = referenciaMes(ano, mes);
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "balancete.fechar",
    entidade: "FechamentoMes",
    entidadeId: f.id,
    detalhes: { referencia, ...totais, observacao: observacao ?? undefined, refechamento: !!existente },
  });

  const link = `/tesouraria/balancete?mes=${mes}&ano=${ano}`;
  const conselho = await usuariosDoCargo(prisma, user.lodgeId, "CONSELHO_CONTAS");
  for (const userId of conselho) {
    await notificarEvento(prisma, {
      lodgeId: user.lodgeId,
      sourceKey: `evento:fechamento:${f.id}:conselho:${userId}`,
      userId,
      type: "FINANCIAL_APPROVAL",
      title: `Balancete de ${referencia} fechado — registre a ciência`,
      description: `${user.name} fechou o balancete de ${referencia}: receitas ${brl(totais.receitasCents)}, despesas ${brl(totais.despesasCents)}, saldo ${brl(totais.saldoCents)}. Confira e registre a ciência do Conselho de Contas.`,
      link,
    });
  }
  // VM fica sabendo quando o fechamento foi feito pelo Tesoureiro
  if (user.role !== "VENERAVEL_MESTRE") {
    for (const userId of await usuariosDoCargo(prisma, user.lodgeId, "VENERAVEL_MESTRE")) {
      await notificarEvento(prisma, {
        lodgeId: user.lodgeId,
        sourceKey: `evento:fechamento:${f.id}:vm:${userId}`,
        userId,
        type: "FINANCIAL_APPROVAL",
        title: `Balancete de ${referencia} fechado pelo Tesoureiro`,
        description: `Receitas ${brl(totais.receitasCents)}, despesas ${brl(totais.despesasCents)}, saldo ${brl(totais.saldoCents)}. Aguardando a ciência do Conselho de Contas.`,
        link,
      });
    }
  }
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/balancete");
  revalidatePath("/balancete");
  return {
    ok: conselho.length
      ? `Balancete de ${referencia} fechado. O Conselho de Contas foi avisado para registrar a ciência.`
      : `Balancete de ${referencia} fechado. Não há conselheiro ativo para registrar a ciência.`,
  };
}

// Reabre o mês (Tesoureiro/VM, motivo obrigatório): o quadro deixa de ver o
// mês até novo fechamento; o registro fica com reabertoAt.
export async function reabrirMes(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireTesourariaWriter();
  const ref = lerMesAno(formData);
  if (!ref) return { error: "Mês/ano inválidos." };
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 500);
  if (!motivo) return { error: "Informe o motivo da reabertura." };
  const f = await prisma.fechamentoMes.findUnique({
    where: { lodgeId_ano_mes: { lodgeId: user.lodgeId, ano: ref.ano, mes: ref.mes } },
  });
  if (!f || !estaFechado(f)) return { error: "Este mês não está fechado." };

  await prisma.fechamentoMes.update({
    where: { id: f.id },
    data: { reabertoPorId: user.id, reabertoAt: new Date(), motivoReabertura: motivo },
  });
  const referencia = referenciaMes(ref.ano, ref.mes);
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "balancete.reabrir",
    entidade: "FechamentoMes",
    entidadeId: f.id,
    detalhes: { referencia, motivo },
  });
  const link = `/tesouraria/balancete?mes=${ref.mes}&ano=${ref.ano}`;
  for (const userId of await usuariosDoCargo(prisma, user.lodgeId, "CONSELHO_CONTAS")) {
    await notificarEvento(prisma, {
      lodgeId: user.lodgeId,
      sourceKey: `evento:fechamento:${f.id}:reaberto:${userId}`,
      userId,
      type: "FINANCIAL_APPROVAL",
      title: `Balancete de ${referencia} reaberto`,
      description: `${user.name} reabriu o balancete de ${referencia}. Motivo: ${motivo}. O quadro deixa de ver o mês até novo fechamento.`,
      link,
    });
  }
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/balancete");
  revalidatePath("/balancete");
  return { ok: `Balancete de ${referencia} reaberto. Feche novamente quando os ajustes terminarem.` };
}

// Ciência do Conselho de Contas sobre o mês fechado (só CONSELHO_CONTAS)
export async function registrarCienciaBalancete(
  mes: number,
  ano: number
): Promise<ActionResult> {
  const user = await requireRole("CONSELHO_CONTAS");
  const f = await prisma.fechamentoMes.findUnique({
    where: { lodgeId_ano_mes: { lodgeId: user.lodgeId, ano, mes } },
  });
  if (!f || !estaFechado(f)) return { error: "Este mês não está fechado." };
  if (f.cienciaConselhoAt) return { error: "A ciência já foi registrada." };

  await prisma.fechamentoMes.update({
    where: { id: f.id },
    data: { cienciaConselhoPorId: user.id, cienciaConselhoAt: new Date() },
  });
  const referencia = referenciaMes(ano, mes);
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "balancete.ciencia-conselho",
    entidade: "FechamentoMes",
    entidadeId: f.id,
    detalhes: { referencia },
  });
  const link = `/tesouraria/balancete?mes=${mes}&ano=${ano}`;
  const [tesoureiros, vms] = await Promise.all([
    usuariosDoCargo(prisma, user.lodgeId, "TESOUREIRO"),
    usuariosDoCargo(prisma, user.lodgeId, "VENERAVEL_MESTRE"),
  ]);
  for (const userId of [...new Set([...tesoureiros, ...vms])]) {
    await notificarEvento(prisma, {
      lodgeId: user.lodgeId,
      sourceKey: `evento:fechamento:${f.id}:ciencia:${userId}`,
      userId,
      type: "FINANCIAL_APPROVAL",
      title: `Conselho registrou ciência do balancete ${referencia}`,
      description: `${user.name} (Conselho de Contas) registrou ciência do fechamento de ${referencia}.`,
      link,
    });
  }
  // Notificações de "registre a ciência" dos conselheiros deixam de fazer sentido
  await prisma.notification.updateMany({
    where: { lodgeId: user.lodgeId, sourceKey: { startsWith: `evento:fechamento:${f.id}:conselho:` } },
    data: { isRead: true },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/tesouraria/balancete");
  revalidatePath("/balancete");
  return { ok: `Ciência do Conselho registrada para ${referencia}.` };
}

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
