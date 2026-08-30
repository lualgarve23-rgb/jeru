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
});
