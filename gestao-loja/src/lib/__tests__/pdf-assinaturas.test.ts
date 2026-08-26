import { describe, it, expect } from "vitest";
import {
  extrairAssinaturasPdf,
  normalizarNome,
  validarUploadAssinado,
} from "../pdf-assinaturas";

// Monta um DER mínimo com um atributo CN (OID 2.5.4.3 + UTF8String).
function derComCn(nome: string): Buffer {
  const valor = Buffer.from(nome, "utf8");
  return Buffer.concat([
    Buffer.from([0x30, 0x82, 0x01, 0x00]), // ruído de SEQUENCE antes
    Buffer.from([0x55, 0x04, 0x03, 0x0c, valor.length]),
    valor,
  ]);
}

// Pseudo-PDF com uma assinatura PAdES por nome, em atualizações incrementais.
function pdfAssinado(base: string, nomes: string[]): Buffer {
  let pdf = Buffer.from(`%PDF-1.7\n${base}\n`, "latin1");
  for (const nome of nomes) {
    const contents = derComCn(nome).toString("hex");
    pdf = Buffer.concat([
      pdf,
      Buffer.from(
        `1 0 obj\n<< /Type /Sig /ByteRange [0 10 20 30] /Contents <${contents}> >>\nendobj\n`,
        "latin1"
      ),
    ]);
  }
  return pdf;
}

describe("extrairAssinaturasPdf", () => {
  it("conta assinaturas e extrai os CNs", () => {
    const pdf = pdfAssinado("doc", ["JOAO CARLOS NOGUEIRA GUIRAU", "FABIO MICHELIN"]);
    const r = extrairAssinaturasPdf(pdf);
    expect(r.quantidade).toBe(2);
    expect(r.nomes).toContain("JOAO CARLOS NOGUEIRA GUIRAU");
    expect(r.nomes).toContain("FABIO MICHELIN");
  });

  it("retorna vazio para PDF sem assinatura", () => {
    const r = extrairAssinaturasPdf(Buffer.from("%PDF-1.7\nsem assinatura"));
    expect(r.quantidade).toBe(0);
    expect(r.nomes).toEqual([]);
  });
});

describe("normalizarNome", () => {
  it("ignora acentos, caixa e espaços extras", () => {
    expect(normalizarNome("  Antônio  César ")).toBe("ANTONIO CESAR");
  });
});

describe("validarUploadAssinado", () => {
  const tes = pdfAssinado("atestado-cesar", ["JOAO GUIRAU"]);
  const sec = pdfAssinado("atestado-cesar", ["JOAO GUIRAU", "FABIO MICHELIN"]);

  it("aceita a continuação correta com assinatura nova do remetente", () => {
    expect(
      validarUploadAssinado({ pdf: sec, anterior: tes, nomeAssinante: "Fábio Michelin" })
    ).toBeNull();
  });

  it("aceita a primeira assinatura sem versão anterior", () => {
    expect(
      validarUploadAssinado({ pdf: tes, anterior: null, nomeAssinante: "JOAO GUIRAU" })
    ).toBeNull();
  });

  it("rejeita documento que não continua a versão atual", () => {
    const outroDoc = pdfAssinado("atestado-guirau", ["JOAO GUIRAU", "FABIO MICHELIN"]);
    expect(
      validarUploadAssinado({ pdf: outroDoc, anterior: tes, nomeAssinante: "JAIME CARUSO" })
    ).toMatch(/não é a continuação/);
  });

  it("rejeita reenvio do mesmo arquivo sem assinatura nova", () => {
    expect(
      validarUploadAssinado({ pdf: sec, anterior: sec, nomeAssinante: "JAIME CARUSO" })
    ).toMatch(/não é a continuação|assinatura nova/);
  });

  it("rejeita quando a assinatura nova não é do remetente", () => {
    const errado = pdfAssinado("atestado-cesar", ["JOAO GUIRAU", "OUTRA PESSOA"]);
    expect(
      validarUploadAssinado({ pdf: errado, anterior: tes, nomeAssinante: "FABIO MICHELIN" })
    ).toMatch(/sua assinatura gov\.br/);
  });

  it("rejeita PDF sem nenhuma assinatura na primeira etapa", () => {
    expect(
      validarUploadAssinado({
        pdf: Buffer.from("%PDF-1.7\nsem assinatura"),
        anterior: null,
        nomeAssinante: "JOAO GUIRAU",
      })
    ).toMatch(/assinatura nova/);
  });
});
