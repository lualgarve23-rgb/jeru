import { describe, it, expect } from "vitest";
import {
  pautaTexto,
  templateDeImagem,
  localDoConvite,
  localTexto,
  fraseCitaEndereco,
  renderConvite,
  CONVITE_TEMPLATE_PADRAO,
} from "@/lib/convite";

const ENDERECO = "Rua Ricardo Medina Filho, nº 577 - Lapa, São Paulo/SP - CEP 05057-100";
const sessao = {
  date: new Date("2026-10-06T20:00:00"),
  type: "ORDINARIA" as const,
  degree: "APRENDIZ" as const,
  pauta: null,
};

describe("local (endereço da sede) no convite", () => {
  it("usa o endereço cadastrado da Loja, normalizando espaços", () => {
    expect(localDoConvite({ address: `  Rua  A,  1 `, conviteFrase: null })).toBe("Rua A, 1");
    expect(localTexto({ address: ENDERECO, conviteFrase: null })).toBe(`Local: ${ENDERECO}`);
  });

  it("fica vazio sem endereço ou quando a frase fixa já cita <<endereco>>", () => {
    expect(localDoConvite({ address: null, conviteFrase: null })).toBeNull();
    expect(localTexto({ address: "", conviteFrase: null })).toBe("");
    expect(fraseCitaEndereco("no templo situado na <<endereco da loja>>.")).toBe(true);
    expect(fraseCitaEndereco("na << Endereço >>")).toBe(true);
    expect(fraseCitaEndereco("sem marcador")).toBe(false);
    expect(
      localDoConvite({ address: ENDERECO, conviteFrase: "Templo: <<endereco da loja>>" })
    ).toBeNull();
  });

  it("template padrão e template de arte trazem a linha Local com o endereço", () => {
    const lojaPadrao = {
      name: "JERUSALEM",
      conviteTemplateHtml: null,
      conviteFrase: null,
      address: ENDERECO,
      oriente: "São Paulo",
    };
    const html = renderConvite(lojaPadrao, sessao, "https://x/convite/t");
    expect(html).toContain(`<strong>Local:</strong> ${ENDERECO}`);
    expect(html).not.toContain("{{LOCAL}}");

    const arte = renderConvite(
      { ...lojaPadrao, conviteTemplateHtml: templateDeImagem("data:image/jpeg;base64,x") },
      sessao,
      "https://x/convite/t"
    );
    expect(arte).toContain(`<strong>Local:</strong> ${ENDERECO}`);
    expect(arte).not.toContain("{{LOCAL}}");
  });

  it("sem endereço a linha Local não aparece", () => {
    const html = renderConvite(
      { name: "L", conviteTemplateHtml: null, conviteFrase: null, address: null, oriente: null },
      sessao,
      "https://x/convite/t"
    );
    expect(html).not.toContain("Local:");
    expect(html).not.toContain("{{LOCAL}}");
    expect(CONVITE_TEMPLATE_PADRAO).toContain("{{PAUTA}}{{LOCAL}}");
  });
});

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
