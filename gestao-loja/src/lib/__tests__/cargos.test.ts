import { describe, it, expect } from "vitest";
import { cargoCorresponde, CARGOS_PADRAO } from "@/lib/cargos";

describe("cargoCorresponde (normalização de grafia)", () => {
  it("aceita o nome exato de cada cargo padrão", () => {
    for (const cargo of CARGOS_PADRAO) {
      expect(cargoCorresponde(cargo, cargo)).toBe(true);
    }
  });

  it("tolera acentos, caixa, ordinais e 'primeiro'/'segundo' por extenso", () => {
    expect(cargoCorresponde("1o Vigilante", "1º Vigilante")).toBe(true);
    expect(cargoCorresponde("PRIMEIRO VIGILANTE", "1º Vigilante")).toBe(true);
    expect(cargoCorresponde("Segundo Diácono", "2º Diácono")).toBe(true);
    expect(cargoCorresponde("2° diacono", "2º Diácono")).toBe(true);
    expect(cargoCorresponde("Diretor de Cerimonias", "Diretor de Cerimônias")).toBe(true);
  });

  it("não confunde cargos diferentes", () => {
    expect(cargoCorresponde("1º Vigilante", "2º Vigilante")).toBe(false);
    expect(cargoCorresponde("Guarda Interno", "Guarda Externo")).toBe(false);
  });

  it("cargo ausente nunca corresponde", () => {
    expect(cargoCorresponde(null, "1º Vigilante")).toBe(false);
    expect(cargoCorresponde(undefined, "1º Vigilante")).toBe(false);
    expect(cargoCorresponde("", "1º Vigilante")).toBe(false);
  });
});
