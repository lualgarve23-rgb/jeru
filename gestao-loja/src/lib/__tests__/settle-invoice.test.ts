import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueOrThrow,
  invoiceUpdate,
  transactionCreate,
  transaction,
  syncInadimplencia,
} = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  invoiceUpdate: vi.fn(),
  transactionCreate: vi.fn(),
  transaction: vi.fn(),
  syncInadimplencia: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findUniqueOrThrow,
      update: invoiceUpdate,
    },
    transaction: {
      create: transactionCreate,
    },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/inadimplencia", () => ({
  syncInadimplencia,
}));

import { settleInvoice } from "@/lib/settle-invoice";

const LOJA_A = "lodge-a";
const LOJA_B = "lodge-b";
const INVOICE_ID = "inv-1";

function pendingInvoice(lodgeId = LOJA_A) {
  return {
    id: INVOICE_ID,
    lodgeId,
    status: "PENDENTE",
    description: "Capitação 01/2026",
    amountCents: 15000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (ops: unknown) => ops);
  syncInadimplencia.mockResolvedValue(undefined);
});

describe("settleInvoice — isolamento por lodgeId", () => {
  it("rejeita baixa quando opts.lodgeId não bate com a cobrança", async () => {
    findUniqueOrThrow.mockResolvedValue(pendingInvoice(LOJA_A));

    await expect(
      settleInvoice(INVOICE_ID, "MANUAL", { lodgeId: LOJA_B })
    ).rejects.toThrow(/não pertence à Loja/i);

    expect(transaction).not.toHaveBeenCalled();
    expect(syncInadimplencia).not.toHaveBeenCalled();
  });

  it("aceita baixa quando opts.lodgeId coincide", async () => {
    findUniqueOrThrow.mockResolvedValue(pendingInvoice(LOJA_A));

    await settleInvoice(INVOICE_ID, "PIX", { lodgeId: LOJA_A });

    expect(transaction).toHaveBeenCalledOnce();
    const ops = transaction.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(syncInadimplencia).toHaveBeenCalledWith(LOJA_A);
  });

  it("sem opts.lodgeId ainda baixa (caller webhook já resolveu o tenant)", async () => {
    findUniqueOrThrow.mockResolvedValue(pendingInvoice(LOJA_A));

    await settleInvoice(INVOICE_ID, "PIX");

    expect(transaction).toHaveBeenCalledOnce();
    expect(syncInadimplencia).toHaveBeenCalledWith(LOJA_A);
  });

  it("é idempotente se já estiver PAGA (não relança receita)", async () => {
    findUniqueOrThrow.mockResolvedValue({
      ...pendingInvoice(LOJA_A),
      status: "PAGA",
    });

    await settleInvoice(INVOICE_ID, "MANUAL", { lodgeId: LOJA_A });

    expect(transaction).not.toHaveBeenCalled();
    expect(syncInadimplencia).not.toHaveBeenCalled();
  });

  it("lança receita no livro-caixa com o lodgeId da cobrança", async () => {
    findUniqueOrThrow.mockResolvedValue(pendingInvoice(LOJA_A));
    invoiceUpdate.mockReturnValue({ kind: "update" });
    transactionCreate.mockReturnValue({ kind: "create" });

    await settleInvoice(INVOICE_ID, "BOLETO", { lodgeId: LOJA_A });

    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID },
        data: expect.objectContaining({
          status: "PAGA",
          paidMethod: "BOLETO",
        }),
      })
    );
    expect(transactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lodgeId: LOJA_A,
          type: "RECEITA",
          amountCents: 15000,
          invoiceId: INVOICE_ID,
        }),
      })
    );
  });
});
