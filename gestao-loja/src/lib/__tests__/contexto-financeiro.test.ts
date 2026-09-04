import { beforeEach, describe, expect, it, vi } from "vitest";

const { userFindUniqueOrThrow, invoiceFindMany, lodgeFindUnique } = vi.hoisted(() => ({
  userFindUniqueOrThrow: vi.fn(),
  invoiceFindMany: vi.fn(),
  lodgeFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUniqueOrThrow: userFindUniqueOrThrow },
    invoice: { findMany: invoiceFindMany },
    lodge: { findUnique: lodgeFindUnique },
  },
}));

import { contextoFinanceiroDoIrmao, resumirEmAberto } from "@/lib/contexto-financeiro";

// "Hoje" = 15/03/2026 meio-dia em São Paulo (15:00Z)
const HOJE = new Date("2026-03-15T15:00:00.000Z");
const ontem = new Date("2026-03-14T02:59:59.000Z"); // 23:59:59 SP de 13/03
const hojeFim = new Date("2026-03-16T02:59:59.000Z"); // 23:59:59 SP de 15/03
const amanha = new Date("2026-04-11T02:59:59.000Z");

describe("resumirEmAberto", () => {
  it("separa vencidas de pendentes no prazo e soma os totais", () => {
    const r = resumirEmAberto(
      [
        { id: "a", referenceMonth: 2, referenceYear: 2026, amountCents: 10000, dueDate: ontem, status: "PENDENTE" },
        { id: "b", referenceMonth: 3, referenceYear: 2026, amountCents: 12000, dueDate: hojeFim, status: "PENDENTE" },
        { id: "c", referenceMonth: 1, referenceYear: 2026, amountCents: 5000, dueDate: ontem, status: "VENCIDA" },
        { id: "d", referenceMonth: 12, referenceYear: 2025, amountCents: 9999, dueDate: ontem, status: "PAGA" },
        { id: "e", referenceMonth: 4, referenceYear: 2026, amountCents: 100, dueDate: amanha, status: "CANCELADA" },
      ],
      HOJE
    );
    // ordenadas pelo vencimento (sort estável: a e c vencem no mesmo instante)
    expect(r.emAberto.map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(r.emAberto.find((i) => i.id === "a")?.vencida).toBe(true);
    expect(r.emAberto.find((i) => i.id === "c")?.vencida).toBe(true);
    expect(r.emAberto.find((i) => i.id === "b")?.vencida).toBe(false);
    expect(r.emAberto.find((i) => i.id === "c")?.referencia).toBe("01/2026");
    expect(r.totalEmAbertoCents).toBe(27000);
    expect(r.totalVencidoCents).toBe(15000);
  });
});

describe("contextoFinanceiroDoIrmao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("monta o contexto com status, capitações em aberto, últimas pagas e Asaas", async () => {
    userFindUniqueOrThrow.mockResolvedValue({ status: "IRREGULAR", statusMotivo: "inadimplencia" });
    invoiceFindMany
      .mockResolvedValueOnce([
        { id: "a", referenceMonth: 2, referenceYear: 2026, amountCents: 10000, dueDate: ontem, status: "VENCIDA" },
        { id: "b", referenceMonth: 3, referenceYear: 2026, amountCents: 12000, dueDate: hojeFim, status: "PENDENTE" },
      ])
      .mockResolvedValueOnce([
        { id: "p1", referenceMonth: 1, referenceYear: 2026, amountCents: 10000, paidAt: new Date("2026-01-10") },
      ]);
    lodgeFindUnique.mockResolvedValue({ asaasApiKey: "chave" });

    const ctx = await contextoFinanceiroDoIrmao("loja-a", "user-1", HOJE);

    expect(ctx.status).toBe("IRREGULAR");
    expect(ctx.statusMotivo).toBe("inadimplencia");
    expect(ctx.emAberto).toHaveLength(2);
    expect(ctx.totalEmAbertoCents).toBe(22000);
    expect(ctx.totalVencidoCents).toBe(10000);
    expect(ctx.ultimasPagas).toEqual([
      { id: "p1", referencia: "01/2026", paidAt: new Date("2026-01-10"), valorCents: 10000 },
    ]);
    expect(ctx.asaasAtivo).toBe(true);

    // Sempre filtrado pela loja E pelo irmão (isolamento de tenant)
    expect(userFindUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1", lodgeId: "loja-a" } })
    );
    for (const call of invoiceFindMany.mock.calls) {
      expect(call[0].where).toMatchObject({ lodgeId: "loja-a", userId: "user-1" });
    }
    expect(invoiceFindMany.mock.calls[1][0].take).toBe(3);
  });

  it("sem Asaas e sem capitações: contexto vazio e regular", async () => {
    userFindUniqueOrThrow.mockResolvedValue({ status: "ATIVO", statusMotivo: null });
    invoiceFindMany.mockResolvedValue([]);
    lodgeFindUnique.mockResolvedValue({ asaasApiKey: null });
    const ctx = await contextoFinanceiroDoIrmao("loja-a", "user-1", HOJE);
    expect(ctx.emAberto).toEqual([]);
    expect(ctx.totalVencidoCents).toBe(0);
    expect(ctx.ultimasPagas).toEqual([]);
    expect(ctx.asaasAtivo).toBe(false);
  });
});
