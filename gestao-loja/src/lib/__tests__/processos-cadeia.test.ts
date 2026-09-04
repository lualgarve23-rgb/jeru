import { describe, it, expect } from "vitest";
import { meuCargoNaCadeia, estadoProcesso } from "@/lib/processos";

const cadeia = (assinados: string[]) =>
  ["SECRETARIO", "ORADOR", "VENERAVEL_MESTRE"].map((cargo, i) => ({
    ordem: i + 1,
    cargo,
    signedAt: assinados.includes(cargo) ? new Date() : null,
  }));

describe("Processos — usuário com dois cargos na mesma cadeia", () => {
  it("responde pelo cargo da vez ainda não assinado", () => {
    expect(meuCargoNaCadeia(["SECRETARIO", "ORADOR"], cadeia([]))).toBe("SECRETARIO");
    expect(meuCargoNaCadeia(["SECRETARIO", "ORADOR"], cadeia(["SECRETARIO"]))).toBe("ORADOR");
    // todos os meus assinados: volta ao primeiro (jaAssinou cobre o resto)
    expect(
      meuCargoNaCadeia(["SECRETARIO", "ORADOR"], cadeia(["SECRETARIO", "ORADOR"]))
    ).toBe("SECRETARIO");
    expect(meuCargoNaCadeia("TESOUREIRO", cadeia([]))).toBeNull();
  });

  it("a cadeia não trava: após assinar como Secretário é a vez dele como Orador", () => {
    const e = estadoProcesso(["SECRETARIO", "ORADOR"], cadeia(["SECRETARIO"]));
    expect(e.cargo).toBe("ORADOR");
    expect(e.jaAssinou).toBe(false);
    expect(e.minhaVez).toBe(true);
    const fim = estadoProcesso(["SECRETARIO", "ORADOR"], cadeia(["SECRETARIO", "ORADOR"]));
    expect(fim.jaAssinou).toBe(true);
    expect(fim.minhaVez).toBe(false);
  });
});
