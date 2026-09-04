import { describe, expect, it } from "vitest";
import { acessorPrisma, lerLib, lerModelos } from "./schema-modelos";

/**
 * Exclusão de loja (admin, recriação da demo, restauração de backup) falha
 * por FK se algum modelo ligado à loja ficar de fora de deleteLodgeData.
 * Este teste lê o schema e garante que TODO modelo com lodgeId é apagado
 * explicitamente, e que os filhos sem lodgeId caem por cascade do pai.
 */
describe("deleteLodgeData cobre todos os modelos ligados à loja", () => {
  const modelos = lerModelos();
  const src = lerLib("lodge-delete.ts");
  const comLodgeId = modelos.filter((m) => m.temLodgeId && m.nome !== "Lodge");

  it("o schema foi lido (sanidade)", () => {
    expect(comLodgeId.map((m) => m.nome)).toContain("User");
    expect(comLodgeId.map((m) => m.nome)).toContain("ProcessoDocumento");
  });

  it.each(comLodgeId.map((m) => m.nome))(
    "apaga %s (db.<modelo>.deleteMany({ where }))",
    (nome) => {
      expect(src).toMatch(
        new RegExp(`db\\.${acessorPrisma(nome)}\\.deleteMany\\(\\{ where \\}\\)`)
      );
    }
  );

  it("apaga a própria loja por último", () => {
    const ultimo = src.lastIndexOf("deleteMany");
    expect(src.indexOf("db.lodge.delete(")).toBeGreaterThan(ultimo);
  });

  it("modelos sem lodgeId ligados a User/loja caem por cascade ou são apagados", () => {
    const ligados = new Set(comLodgeId.map((m) => m.nome));
    const semLodgeId = modelos.filter(
      (m) =>
        !m.temLodgeId &&
        m.nome !== "Lodge" &&
        m.relacoes.some((r) => ligados.has(r.alvo))
    );
    expect(semLodgeId.length).toBeGreaterThan(0);
    for (const m of semLodgeId) {
      const apagado = src.includes(`db.${acessorPrisma(m.nome)}.deleteMany`);
      const cascade = m.relacoes
        .filter((r) => ligados.has(r.alvo))
        .every((r) => r.cascade);
      expect(
        apagado || cascade,
        `${m.nome} não é apagado em lodge-delete.ts nem tem onDelete: Cascade`
      ).toBe(true);
    }
  });

  it("ordem de FK: filhos antes dos pais", () => {
    const pos = (modelo: string) =>
      src.indexOf(`db.${acessorPrisma(modelo)}.deleteMany`);
    const antes = (filho: string, pai: string) =>
      expect(pos(filho), `${filho} deve vir antes de ${pai}`).toBeLessThan(pos(pai));
    antes("ProcessoDocumento", "Prancha");
    antes("ProcessoDocumento", "User");
    antes("ProcessoAdmissao", "Prancha");
    antes("ProcessoProgressao", "Prancha");
    antes("Attendance", "LodgeSession");
    antes("Ata", "LodgeSession");
    antes("Transaction", "Invoice");
    antes("Transaction", "Expense");
    antes("Transaction", "Donation");
    antes("Donation", "CharityEvent");
    antes("Notification", "User");
    antes("MutuaEntrega", "User");
    antes("AtestadoRegularidade", "User");
    antes("PedidoAfastamento", "User");
  });
});
