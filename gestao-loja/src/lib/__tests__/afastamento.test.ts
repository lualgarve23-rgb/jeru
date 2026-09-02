import { describe, it, expect } from "vitest";
import {
  ordemAssinaturaAfastamento,
  bloqueioAssinaturaAfastamento,
  pendenteComAfastamento,
  etapasAfastamento,
  textoRequerimento,
} from "@/lib/afastamento";
import { selecionarDropdownXml, CAMPOS_POR_FORMULARIO } from "@/lib/formularios-fill";

const d = new Date("2026-09-02T12:00:00Z");

describe("Pedido de Afastamento — ordem Secretário → VM no Form. 116", () => {
  it("Secretário assina primeiro; VM aguarda", () => {
    const p = { signedBySecAt: null, signedByMasterAt: null };
    expect(ordemAssinaturaAfastamento("SECRETARIO", p)).toMatchObject({ jaAssinou: false, aguardando: null });
    expect(ordemAssinaturaAfastamento("VENERAVEL_MESTRE", p)).toMatchObject({ aguardando: "Secretário" });
  });
  it("VM é a última assinatura", () => {
    const p = { signedBySecAt: d, signedByMasterAt: null };
    expect(ordemAssinaturaAfastamento("VENERAVEL_MESTRE", p)).toMatchObject({ aguardando: null, ultimaAssinatura: true });
    expect(ordemAssinaturaAfastamento("SECRETARIO", p).jaAssinou).toBe(true);
  });
});

describe("bloqueios de assinatura do Form. 116", () => {
  it("bloqueia enquanto o irmão não assinou o requerimento e enquanto não há Form. 116", () => {
    expect(bloqueioAssinaturaAfastamento({ status: "AGUARDANDO_OBREIRO", formularioPdf: null })).toMatch(/gov.br dele/);
    expect(bloqueioAssinaturaAfastamento({ status: "SOLICITADO", formularioPdf: null })).toMatch(/Registre a sessão/);
    expect(bloqueioAssinaturaAfastamento({ status: "EM_ASSINATURA", formularioPdf: Buffer.alloc(1) })).toBeNull();
    expect(bloqueioAssinaturaAfastamento({ status: "ASSINADO", formularioPdf: Buffer.alloc(1) })).toMatch(/encerrado/);
  });
});

describe("linha do tempo do solicitante", () => {
  it("aponta com quem o pedido está", () => {
    expect(pendenteComAfastamento({ status: "AGUARDANDO_OBREIRO", signedBySecAt: null, enviadoAt: null })).toMatch(/sua assinatura/);
    expect(pendenteComAfastamento({ status: "SOLICITADO", signedBySecAt: null, enviadoAt: null })).toMatch(/Secretaria/);
    expect(pendenteComAfastamento({ status: "EM_ASSINATURA", signedBySecAt: null, enviadoAt: null })).toMatch(/Secretário/);
    expect(pendenteComAfastamento({ status: "EM_ASSINATURA", signedBySecAt: d, enviadoAt: null })).toMatch(/Venerável/);
    expect(pendenteComAfastamento({ status: "ASSINADO", signedBySecAt: d, enviadoAt: d })).toMatch(/Guarda dos Selos/);
  });
  it("tem 5 etapas, começando pela assinatura gov.br do irmão", () => {
    const e = etapasAfastamento({ status: "SOLICITADO", requerimentoSignedAt: d, dataSessao: null, signedBySecAt: null, signedByMasterAt: null, enviadoAt: null });
    expect(e).toHaveLength(5);
    expect(e[0].at).toBe(d);
    expect(e[4].cargo).toMatch(/Guarda dos Selos/);
  });
});

describe("requerimento e Form. 116", () => {
  it("texto do requerimento traz nome, CIM, dias e motivo", () => {
    const t = textoRequerimento({ nome: "Fulano", cim: "123", lodgeName: "Acácia", lodgeNumber: "9999", oriente: "São Paulo", dias: 90, motivo: "Viagem de trabalho.", dataInicio: null });
    expect(t).toContain("Fulano, CIM 123");
    expect(t).toContain("90 dias");
    expect(t).toContain("Viagem de trabalho.");
  });
  it("mapa do Form. 116 preenche o nº de dias (campo 7)", () => {
    expect(CAMPOS_POR_FORMULARIO["form-116-pedido-licenca.docx"][7]).toBe("dias");
  });
  it("seleciona a opção do dropdown do artigo pelo texto", () => {
    const xml = '<w:ddList><w:listEntry w:val="SELECIONE"/><w:listEntry w:val="67"/><w:listEntry w:val="68"/></w:ddList>';
    expect(selecionarDropdownXml(xml, "68")).toContain('<w:ddList><w:result w:val="2"/>');
    expect(selecionarDropdownXml(xml, "99")).toBe(xml);
  });
});
