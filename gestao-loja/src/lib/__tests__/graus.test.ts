import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { grausVisiveis, grauWhere } from "@/lib/graus";

describe("segmentação por grau dos acervos", () => {
  it("Mestre vê tudo; Companheiro não vê 'somente Mestres'; Aprendiz só o aberto", () => {
    expect(grausVisiveis("MESTRE")).toEqual([
      "APRENDIZ",
      "COMPANHEIRO",
      "MESTRE",
    ]);
    expect(grausVisiveis("COMPANHEIRO")).toEqual(["APRENDIZ", "COMPANHEIRO"]);
    expect(grausVisiveis("APRENDIZ")).toEqual(["APRENDIZ"]);
  });

  it("grau ausente/desconhecido cai no mais restritivo", () => {
    expect(grausVisiveis(undefined)).toEqual(["APRENDIZ"]);
    expect(grausVisiveis("NA")).toEqual(["APRENDIZ"]);
  });

  it("grauWhere gera o filtro Prisma com a lista do grau", () => {
    expect(grauWhere("COMPANHEIRO")).toEqual({
      grauMinimo: { in: ["APRENDIZ", "COMPANHEIRO"] },
    });
  });

  // Estático: as actions de troca de nível exigem editor da Secretaria e
  // prendem o update ao lodgeId da sessão
  it("updateBibliotecaGrau e updateDocumentoGrau são gated e isoladas por loja", () => {
    for (const [arquivo, fn] of [
      [
        "src/app/(app)/dashboard/biblioteca/actions.ts",
        "updateBibliotecaGrau",
      ],
      ["src/app/(app)/secretaria/_actions/atas.ts", "updateDocumentoGrau"],
    ]) {
      const src = readFileSync(arquivo, "utf8");
      const corpo = src.slice(src.indexOf(`function ${fn}`));
      expect(corpo).toMatch(/requireSecretariaWriter\(\)/);
      expect(corpo).toMatch(/where:\s*\{\s*id,\s*lodgeId:\s*user\.lodgeId\s*\}/);
      expect(corpo).toMatch(/GRAUS_ACERVO/);
    }
  });
});
