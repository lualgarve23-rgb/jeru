import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueOrThrow,
  invoiceUpdateMany,
  invoiceFindMany,
  transactionCreate,
  transaction,
  syncInadimplencia,
  notificarEvento,
  usuariosDoCargo,
} = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  invoiceUpdateMany: vi.fn(),
  invoiceFindMany: vi.fn(),
  transactionCreate: vi.fn(),
  transaction: vi.fn(),
  syncInadimplencia: vi.fn(),
  notificarEvento: vi.fn(),
  usuariosDoCargo: vi.fn(),
}));

const tx = {
  invoice: { updateMany: invoiceUpdateMany },
  transaction: { create: transactionCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findUniqueOrThrow,
      findMany: invoiceFindMany,
    },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/inadimplencia", () => ({ syncInadimplencia }));
vi.mock("@/lib/notificar-evento", () => ({ notificarEvento, usuariosDoCargo }));
vi.mock("@/lib/audit", () => ({ auditar: vi.fn() }));
vi.mock("@/lib/quitte", () => ({ recalcularQuitacaoQuitte: vi.fn() }));

import { settleInvoice } from "@/lib/settle-invoice";

const LOJA_A = "lodge-a";
const LOJA_B = "lodge-b";
const INVOICE_ID = "inv-1";

function pendingInvoice(lodgeId = LOJA_A) {
  return {
    id: INVOICE_ID,
    lodgeId,
    userId: "user-1",
    user: { id: "user-1", name: "Irmão Teste" },
    status: "PENDENTE",
    description: "Capitação 01/2026",
    referenceMonth: 1,
    referenceYear: 2026,
    amountCents: 15000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // transação interativa: executa o callback com o client fake
  transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  invoiceUpdateMany.mockResolvedValue({ count: 1 });
  invoiceFindMany.mockResolvedValue([{ amountCents: 15000 }]);
  usuariosDoCargo.mockResolvedValue(["tes-1"]);
  syncInadimplencia.mockResolvedValue(undefined);
  notificarEvento.mockResolvedValue(undefined);
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

    const r = await settleInvoice(INVOICE_ID, "PIX", { lodgeId: LOJA_A });

    expect(r.settled).toBe(true);
    expect(transaction).toHaveBeenCalledOnce();
    expect(transactionCreate).toHaveBeenCalledOnce();
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

    const r = await settleInvoice(INVOICE_ID, "MANUAL", { lodgeId: LOJA_A });

    expect(r.settled).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
    expect(syncInadimplencia).not.toHaveBeenCalled();
    expect(notificarEvento).not.toHaveBeenCalled();
  });

  it("baixa concorrente: se o updateMany condicional não afetar 1 linha, não lança receita", async () => {
    findUniqueOrThrow.mockResolvedValue(pendingInvoice(LOJA_A));
    invoiceUpdateMany.mockResolvedValue({ count: 0 });

    const r = await settleInvoice(INVOICE_ID, "PIX", { lodgeId: LOJA_A });

    expect(r.settled).toBe(false);
    expect(invoiceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: INVOICE_ID, status: { not: "PAGA" } } })
    );
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(notificarEvento).not.toHaveBeenCalled();
    expect(syncInadimplencia).not.toHaveBeenCalled();
  });

  it("lança receita no livro-caixa com o lodgeId da cobrança", async () => {
    findUniqueOrThrow.mockResolvedValue(pendingInvoice(LOJA_A));

    await settleInvoice(INVOICE_ID, "BOLETO", { lodgeId: LOJA_A });

    expect(invoiceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAGA", paidMethod: "BOLETO" }),
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

  it("avisa o irmão (pago:<id>) e o Tesoureiro (pagamentos:<loja>:<dia>)", async () => {
    findUniqueOrThrow.mockResolvedValue(pendingInvoice(LOJA_A));
    invoiceFindMany.mockResolvedValue([{ amountCents: 15000 }, { amountCents: 15000 }]);

    await settleInvoice(INVOICE_ID, "PIX", { lodgeId: LOJA_A });

    const chaves = notificarEvento.mock.calls.map((c) => c[1]);
    expect(chaves).toContainEqual(
      expect.objectContaining({
        sourceKey: `pago:${INVOICE_ID}`,
        userId: "user-1",
        link: `/tesouraria/mensalidades/${INVOICE_ID}`,
      })
    );
    const doDia = chaves.find((n) => String(n.sourceKey).startsWith(`pagamentos:${LOJA_A}:`));
    expect(doDia).toBeDefined();
    expect(doDia.userId).toBe("tes-1");
    expect(doDia.title).toMatch(/^2 pagamento/);
  });
});
