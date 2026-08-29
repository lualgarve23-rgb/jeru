import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));

import { createHmac } from "node:crypto";
import { verificarReconhecimento } from "@/lib/reconhecimento";

function token(userId: string, lodgeId: string, exp: number, secret: string) {
  const payload = `${userId}.${lodgeId}.${exp}`;
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

describe("reconhecimento — cookie assinado do convite", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "segredo-de-teste";
  });

  it("aceita token válido e devolve userId/lodgeId", () => {
    const t = token("u1", "l1", Date.now() + 1000, "segredo-de-teste");
    expect(verificarReconhecimento(t)).toEqual({ userId: "u1", lodgeId: "l1" });
  });

  it("rejeita assinatura adulterada, expiração e formato inválido", () => {
    const bom = token("u1", "l1", Date.now() + 1000, "segredo-de-teste");
    expect(verificarReconhecimento(bom.slice(0, -2) + "xx")).toBeNull();
    expect(
      verificarReconhecimento(token("u1", "l1", Date.now() - 1, "segredo-de-teste"))
    ).toBeNull();
    expect(
      verificarReconhecimento(token("u1", "l1", Date.now() + 1000, "outro-segredo"))
    ).toBeNull();
    expect(verificarReconhecimento(undefined)).toBeNull();
    expect(verificarReconhecimento("a.b.c")).toBeNull();
  });

  it("não aceita trocar o usuário mantendo a assinatura", () => {
    const t = token("u1", "l1", Date.now() + 1000, "segredo-de-teste");
    const [, lodge, exp, mac] = t.split(".");
    expect(verificarReconhecimento(`u2.${lodge}.${exp}.${mac}`)).toBeNull();
  });
});
