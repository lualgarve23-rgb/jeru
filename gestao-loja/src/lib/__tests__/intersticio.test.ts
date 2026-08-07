import { describe, it, expect } from "vitest";
import { Degree } from "@prisma/client";
import {
  progressaoSequencial,
  dataMinimaProgressao,
  validarProgressao,
} from "@/lib/intersticio";

describe("ordem de progressão", () => {
  it("só permite avançar um grau por vez, na ordem", () => {
    expect(progressaoSequencial(Degree.APRENDIZ, Degree.COMPANHEIRO)).toBe(true);
    expect(progressaoSequencial(Degree.COMPANHEIRO, Degree.MESTRE)).toBe(true);
    expect(progressaoSequencial(Degree.APRENDIZ, Degree.MESTRE)).toBe(false);
    expect(progressaoSequencial(Degree.COMPANHEIRO, Degree.APRENDIZ)).toBe(false);
    expect(progressaoSequencial(Degree.MESTRE, Degree.MESTRE)).toBe(false);
  });
});

describe("interstício mínimo", () => {
  it("Aprendiz → Companheiro exige 12 meses desde a iniciação", () => {
    const iniciacao = new Date(2025, 0, 15); // 15/01/2025
    const min = dataMinimaProgressao(Degree.COMPANHEIRO, iniciacao)!;
    expect(min).toEqual(new Date(2026, 0, 15));
  });

  it("Companheiro → Mestre exige 6 meses no grau atual", () => {
    const elevacao = new Date(2025, 2, 1); // 01/03/2025
    const min = dataMinimaProgressao(Degree.MESTRE, elevacao)!;
    expect(min).toEqual(new Date(2025, 8, 1));
  });

  it("sem data-base registrada, não há data mínima (não bloqueia)", () => {
    expect(dataMinimaProgressao(Degree.COMPANHEIRO, null)).toBeNull();
  });
});

describe("validarProgressao", () => {
  const iniciacao = new Date(2025, 0, 15);

  it("rejeita salto de grau", () => {
    const r = validarProgressao(
      Degree.APRENDIZ,
      Degree.MESTRE,
      iniciacao,
      new Date(2026, 5, 1)
    );
    expect(r).toHaveProperty("error");
  });

  it("rejeita elevação antes do interstício", () => {
    const r = validarProgressao(
      Degree.APRENDIZ,
      Degree.COMPANHEIRO,
      iniciacao,
      new Date(2025, 11, 31) // faltam 15 dias
    );
    expect("error" in r && r.error).toMatch(/Interstício não cumprido/);
  });

  it("aceita elevação exatamente na data mínima", () => {
    const r = validarProgressao(
      Degree.APRENDIZ,
      Degree.COMPANHEIRO,
      iniciacao,
      new Date(2026, 0, 15)
    );
    expect(r).toEqual({ ok: true });
  });

  it("aceita elevação após o interstício", () => {
    const r = validarProgressao(
      Degree.COMPANHEIRO,
      Degree.MESTRE,
      new Date(2025, 2, 1),
      new Date(2025, 9, 10)
    );
    expect(r).toEqual({ ok: true });
  });
});
