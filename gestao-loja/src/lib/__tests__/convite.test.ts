import { describe, it, expect } from "vitest";
import { pautaTexto, templateDeImagem } from "@/lib/convite";

describe("pautaTexto", () => {
  it("gera a linha 'Pauta:' para sessões com pauta", () => {
    expect(pautaTexto({ type: "ORDINARIA", pauta: "Leitura de pranchas" }, null)).toBe(
      "Pauta: Leitura de pranchas"
    );
  });

  it("usa 'Descrição:' para eventos", () => {
    expect(pautaTexto({ type: "EVENTO", pauta: "Jantar festivo" }, null)).toBe(
      "Descrição: Jantar festivo"
    );
  });

  it("fica vazia sem pauta ou quando a frase da loja já cita <<pauta>>", () => {
    expect(pautaTexto({ type: "ORDINARIA", pauta: null }, null)).toBe("");
    expect(
      pautaTexto(
        { type: "ORDINARIA", pauta: "Leitura de pranchas" },
        "Convidamos para: <<pauta>>"
      )
    ).toBe("");
  });
});

describe("templateDeImagem", () => {
  it("inclui o placeholder {{PAUTA}} junto da frase", () => {
    expect(templateDeImagem("data:image/jpeg;base64,x")).toContain(
      "{{FRASE}}{{PAUTA}}"
    );
  });
});
