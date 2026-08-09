import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const { requireUser, findUniqueOrThrow, settleInvoiceMock } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  settleInvoiceMock: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  requireUser,
  requireRole: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUniqueOrThrow },
    lodge: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    transaction: { create: vi.fn() },
    expense: {
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/settle-invoice", () => ({
  settleInvoice: settleInvoiceMock,
}));

vi.mock("@/lib/inadimplencia", () => ({
  syncInadimplencia: vi.fn(),
}));

vi.mock("@/lib/pix", () => ({
  buildPixPayload: vi.fn(() => "pix"),
}));

vi.mock("@/lib/asaas", () => ({
  AsaasError: class AsaasError extends Error {},
  ensureCustomer: vi.fn(),
  createPayment: vi.fn(),
  createSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { markInvoicePaid, updatePixKey } from "@/app/(app)/tesouraria/actions";

const LOJA_A = "lodge-a";
const LOJA_B = "lodge-b";

function user(role: string, lodgeId = LOJA_A) {
  return { id: "u-1", role, lodgeId, name: "Teste", email: "t@x.com" };
}

beforeEach(() => {
  vi.clearAllMocks();
  settleInvoiceMock.mockResolvedValue(undefined);
});

describe("markInvoicePaid — isolamento + permissões", () => {
  it("Tesoureiro baixa só cobrança da própria Loja (where com lodgeId)", async () => {
    requireUser.mockResolvedValue(user("TESOUREIRO", LOJA_A));
    findUniqueOrThrow.mockResolvedValue({
      id: "inv-1",
      lodgeId: LOJA_A,
      status: "PENDENTE",
    });

    const result = await markInvoicePaid("inv-1");

    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "inv-1", lodgeId: LOJA_A },
    });
    expect(settleInvoiceMock).toHaveBeenCalledWith("inv-1", "MANUAL", {
      lodgeId: LOJA_A,
    });
    expect(result).toEqual({ ok: "Baixa manual registrada." });
  });

  it("não permite baixa cross-tenant (invoice de outra Loja)", async () => {
    requireUser.mockResolvedValue(user("TESOUREIRO", LOJA_A));
    findUniqueOrThrow.mockRejectedValue(
      Object.assign(new Error("No Invoice found"), { code: "P2025" })
    );

    await expect(markInvoicePaid("inv-outra-loja")).rejects.toThrow();
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "inv-outra-loja", lodgeId: LOJA_A },
    });
    expect(settleInvoiceMock).not.toHaveBeenCalled();
  });

  it("CONSELHO_CONTAS não escreve na Tesouraria (baixa)", async () => {
    requireUser.mockResolvedValue(user("CONSELHO_CONTAS", LOJA_A));

    await expect(markInvoicePaid("inv-1")).rejects.toThrow(
      /Sem permissão de escrita na Tesouraria/i
    );
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
    expect(settleInvoiceMock).not.toHaveBeenCalled();
  });

  it("MEMBER não escreve na Tesouraria", async () => {
    requireUser.mockResolvedValue(user("MEMBER", LOJA_A));

    await expect(markInvoicePaid("inv-1")).rejects.toThrow(
      /Sem permissão de escrita na Tesouraria/i
    );
  });

  it("SECRETARIO não escreve na Tesouraria", async () => {
    requireUser.mockResolvedValue(user("SECRETARIO", LOJA_A));

    await expect(markInvoicePaid("inv-1")).rejects.toThrow(
      /Sem permissão de escrita na Tesouraria/i
    );
  });

  it("VENERAVEL_MESTRE pode baixar", async () => {
    requireUser.mockResolvedValue(user("VENERAVEL_MESTRE", LOJA_A));
    findUniqueOrThrow.mockResolvedValue({
      id: "inv-2",
      lodgeId: LOJA_A,
      status: "PENDENTE",
    });

    const result = await markInvoicePaid("inv-2");
    expect(result?.ok).toBeTruthy();
    expect(settleInvoiceMock).toHaveBeenCalled();
  });

  it("não relança se já paga", async () => {
    requireUser.mockResolvedValue(user("TESOUREIRO", LOJA_A));
    findUniqueOrThrow.mockResolvedValue({
      id: "inv-3",
      lodgeId: LOJA_A,
      status: "PAGA",
    });

    const result = await markInvoicePaid("inv-3");
    expect(result).toEqual({ error: "Cobrança já está paga." });
    expect(settleInvoiceMock).not.toHaveBeenCalled();
  });
});

describe("updatePixKey — Conselho não escreve", () => {
  it("CONSELHO_CONTAS não altera chave Pix", async () => {
    requireUser.mockResolvedValue(user("CONSELHO_CONTAS", LOJA_A));
    const fd = new FormData();
    fd.set("pixKey", "chave@exemplo");

    await expect(updatePixKey(undefined, fd)).rejects.toThrow(
      /Sem permissão de escrita na Tesouraria/i
    );
  });
});

/**
 * Regressão estática: mutations críticas de Tesouraria/Secretaria devem
 * filtrar por user.lodgeId (não só por id), e writers usam canWrite*.
 */
// Desde o #12 as actions da Secretaria vivem fatiadas em _actions/*;
// concatena todos os módulos (inclui _shared.ts, onde vive o writer-guard)
function lerSecretariaActions(root: string): string {
  const dir = path.join(root, "app/(app)/secretaria/_actions");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
}

describe("isolamento lodgeId nas actions (estático)", () => {
  const root = path.resolve(__dirname, "../..");

  it("markInvoicePaid e createAsaasCharge filtram invoice por lodgeId", () => {
    const src = readFileSync(
      path.join(root, "app/(app)/tesouraria/actions.ts"),
      "utf8"
    );
    expect(src).toMatch(
      /markInvoicePaid[\s\S]{0,400}lodgeId:\s*user\.lodgeId/
    );
    expect(src).toMatch(
      /createAsaasCharge[\s\S]{0,500}lodgeId:\s*user\.lodgeId/
    );
    expect(src).toMatch(
      /settleInvoice\([^)]+,\s*\{\s*lodgeId:\s*user\.lodgeId\s*\}/
    );
  });

  it("writers de Tesouraria e Secretaria usam canWrite* (Conselho fora)", () => {
    const tes = readFileSync(
      path.join(root, "app/(app)/tesouraria/actions.ts"),
      "utf8"
    );
    const sec = lerSecretariaActions(root);
    expect(tes).toMatch(
      /async function requireTesourariaWriter[\s\S]{0,200}canWriteTesouraria/
    );
    expect(sec).toMatch(
      /async function requireSecretariaWriter[\s\S]{0,200}canWriteSecretaria/
    );
  });

  it("páginas sensíveis consultam por lodgeId do usuário", () => {
    const checks: Array<[string, RegExp]> = [
      [
        "app/(app)/tesouraria/mensalidades/[id]/page.tsx",
        /lodgeId:\s*user\.lodgeId/,
      ],
      [
        "app/(app)/secretaria/atas/[id]/page.tsx",
        /lodgeId:\s*user\.lodgeId/,
      ],
      [
        "app/(app)/secretaria/sessoes/[id]/page.tsx",
        /lodgeId:\s*user\.lodgeId/,
      ],
      [
        "app/(app)/secretaria/admissoes/anexo/[id]/route.ts",
        /anexo\.processo\.lodgeId\s*!==\s*user\.lodgeId/,
      ],
    ];
    for (const [rel, re] of checks) {
      const src = readFileSync(path.join(root, rel), "utf8");
      expect(src, rel).toMatch(re);
    }
  });

  it("settleInvoice exige lodgeId quando informado", () => {
    const src = readFileSync(path.join(root, "lib/settle-invoice.ts"), "utf8");
    expect(src).toMatch(
      /opts\?\.lodgeId\s*&&\s*invoice\.lodgeId\s*!==\s*opts\.lodgeId/
    );
  });
});

describe("Conselho — matriz de escrita (estático + contrato)", () => {
  it("nenhuma action de escrita na Tesouraria chama requireUser sem canWriteTesouraria", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../app/(app)/tesouraria/actions.ts"),
      "utf8"
    );
    // Todas as exports de escrita passam por requireTesourariaWriter
    // (exceto helpers internos não exportados).
    const exports = [
      "updatePixKey",
      "generateInvoices",
      "markInvoicePaid",
      "updateAsaasConfig",
      "createAsaasCharge",
      "enableAsaasSubscriptions",
      "cancelAsaasSubscription",
    ];
    for (const name of exports) {
      const re = new RegExp(
        `export async function ${name}[\\s\\S]{0,250}requireTesourariaWriter`
      );
      expect(src, name).toMatch(re);
    }
  });

  it("mutations de Secretaria (membros/cargos) passam por requireSecretariaWriter", () => {
    const src = lerSecretariaActions(path.resolve(__dirname, "../.."));
    for (const name of [
      "createMember",
      "updateMember",
      "elevateDegree",
      "assignRole",
      "setAccessRole",
    ]) {
      const re = new RegExp(
        `export async function ${name}[\\s\\S]{0,250}requireSecretariaWriter`
      );
      expect(src, name).toMatch(re);
    }
  });
});
