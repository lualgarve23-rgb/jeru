import { describe, expect, it } from "vitest";
import {
  limiteDiarioPara,
  separarSugestoes,
  ocultarMarcadorParcial,
  MARCADOR_SUGESTOES,
} from "../limites";

const lodge = { assistenteLimiteObreiros: 20, assistenteLimiteOficiais: 50 };

describe("limiteDiarioPara", () => {
  it("Obreiro usa o limite de obreiros", () => {
    expect(limiteDiarioPara("MEMBER", lodge)).toBe(20);
  });

  it("cargos de gestão usam o limite de oficiais", () => {
    for (const role of [
      "VENERAVEL_MESTRE",
      "SECRETARIO",
      "TESOUREIRO",
      "CONSELHO_CONTAS",
      "ESMOLER",
    ])
      expect(limiteDiarioPara(role, lodge)).toBe(50);
  });

  it("0 fecha o assistente ao nível", () => {
    expect(
      limiteDiarioPara("MEMBER", { ...lodge, assistenteLimiteObreiros: 0 })
    ).toBe(0);
  });
});

describe("separarSugestoes", () => {
  it("separa resposta e até 3 sugestões", () => {
    const { resposta, sugestoes } = separarSugestoes(
      `Sua capitação está em dia.\n\n${MARCADOR_SUGESTOES} E a minha frequência? | Próximas sessões? | Meus processos? | Quarta ignorada`
    );
    expect(resposta).toBe("Sua capitação está em dia.");
    expect(sugestoes).toEqual([
      "E a minha frequência?",
      "Próximas sessões?",
      "Meus processos?",
    ]);
  });

  it("sem marcador devolve o texto intacto e nenhuma sugestão", () => {
    expect(separarSugestoes("Tudo certo.")).toEqual({
      resposta: "Tudo certo.",
      sugestoes: [],
    });
  });
});

describe("ocultarMarcadorParcial", () => {
  it("esconde o marcador chegando pela metade no streaming", () => {
    expect(ocultarMarcadorParcial("Tudo certo.\n###SUGES")).toBe(
      "Tudo certo.\n"
    );
  });

  it("não mexe em texto comum", () => {
    expect(ocultarMarcadorParcial("Reunião #12 ok")).toBe("Reunião #12 ok");
  });
});
