import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Teste estático: as rotas do histórico do assistente só podem tocar
// conversas do próprio usuário na própria loja.
const base = join(__dirname, "../../app/api/assistente/conversas");

describe("rotas do histórico do assistente", () => {
  for (const arquivo of ["route.ts", "[id]/route.ts"]) {
    it(`${arquivo} exige autenticação e filtra por loja e usuário`, () => {
      const src = readFileSync(join(base, arquivo), "utf8");
      expect(src).toContain("await auth()");
      expect(src).toContain("lodgeId: session.user.lodgeId");
      expect(src).toContain("userId: session.user.id");
    });
  }

  it("apagar usa deleteMany com o filtro (nunca delete por id solto)", () => {
    const src = readFileSync(join(base, "[id]/route.ts"), "utf8");
    expect(src).toContain("deleteMany");
    expect(src).not.toMatch(/\bdelete\(\s*\{\s*where:\s*\{\s*id\s*\}/);
  });
});
