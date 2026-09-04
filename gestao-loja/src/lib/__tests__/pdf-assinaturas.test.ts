import { describe, it, expect, beforeAll } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import {
  extrairAssinaturasPdf,
  normalizarNome,
  validarUploadAssinado,
} from "../pdf-assinaturas";

// ── Infra de teste: certificado autoassinado com CPF ICP-Brasil e assinatura
// CMS montada como atualização incremental PAdES com ByteRange correto ──

const subtle = webcrypto.subtle;

type Signatario = {
  cert: pkijs.Certificate;
  privateKey: CryptoKey;
};

async function gerarCertificado(cn: string, cpf: string | null): Promise<Signatario> {
  const keys = await subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  );
  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ value: Math.floor(Math.random() * 1e9) + 1 });
  const nome = new pkijs.AttributeTypeAndValue({
    type: "2.5.4.3",
    value: new asn1js.Utf8String({ value: cn }),
  });
  cert.issuer.typesAndValues.push(nome);
  cert.subject.typesAndValues.push(nome);
  cert.notBefore.value = new Date(Date.now() - 86_400_000);
  cert.notAfter.value = new Date(Date.now() + 86_400_000);
  if (cpf) {
    // otherName { 2.16.76.1.3.1, [0] EXPLICIT OctetString "AAAAMMDD" + CPF + ... }
    const san = new asn1js.Sequence({
      value: [
        new asn1js.Constructed({
          idBlock: { tagClass: 3, tagNumber: 0 },
          value: [
            new asn1js.ObjectIdentifier({ value: "2.16.76.1.3.1" }),
            new asn1js.Constructed({
              idBlock: { tagClass: 3, tagNumber: 0 },
              value: [
                new asn1js.OctetString({
                  valueHex: Buffer.from(`19800101${cpf}${"0".repeat(32)}`, "latin1"),
                }),
              ],
            }),
          ],
        }),
      ],
    });
    cert.extensions = [
      new pkijs.Extension({ extnID: "2.5.29.17", critical: false, extnValue: san.toBER() }),
    ];
  }
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(keys.privateKey, "SHA-256");
  return { cert, privateKey: keys.privateKey };
}

// CMS SignedData destacado (PAdES) sobre `dados`, com messageDigest assinado.
async function assinarCms(s: Signatario, dados: Buffer): Promise<Buffer> {
  const sd = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: "1.2.840.113549.1.7.1",
    }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({
          issuer: s.cert.issuer,
          serialNumber: s.cert.serialNumber,
        }),
      }),
    ],
    certificates: [s.cert],
  });
  sd.signerInfos[0].signedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new pkijs.Attribute({
        type: "1.2.840.113549.1.9.3",
        values: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })],
      }),
      new pkijs.Attribute({
        type: "1.2.840.113549.1.9.5",
        values: [new asn1js.UTCTime({ valueDate: new Date() })],
      }),
      new pkijs.Attribute({
        type: "1.2.840.113549.1.9.4",
        values: [
          new asn1js.OctetString({ valueHex: createHash("sha256").update(dados).digest() }),
        ],
      }),
    ],
  });
  await sd.sign(s.privateKey, 0, "SHA-256", new Uint8Array(dados).buffer as ArrayBuffer);
  const ci = new pkijs.ContentInfo({
    contentType: "1.2.840.113549.1.7.2",
    content: sd.toSchema(true),
  });
  return Buffer.from(ci.toSchema().toBER());
}

const TAM_CONTENTS = 6000; // dígitos hex reservados para o /Contents

// Acrescenta ao PDF uma atualização incremental com o dicionário /Sig; o
// `assinar` recebe os bytes cobertos pelo ByteRange e devolve o CMS DER.
async function acrescentarAssinatura(
  base: Buffer,
  assinar: (cobertos: Buffer) => Promise<Buffer>
): Promise<Buffer> {
  const larg = 10;
  const num = (n: number) => String(n).padStart(larg, "0");
  const brPlaceholder = `[${num(0)} ${num(0)} ${num(0)} ${num(0)}]`;
  const zeros = "0".repeat(TAM_CONTENTS);
  const montar = (br: string, hex: string) =>
    Buffer.from(
      `\n9 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached ` +
        `/ByteRange ${br} /Contents <${hex}> >>\nendobj\ntrailer\n<< /Prev 9 >>\n%%EOF\n`,
      "latin1"
    );
  const update = montar(brPlaceholder, zeros);
  const inicioContents = base.length + update.indexOf("<" + zeros);
  const b = inicioContents;
  const c = inicioContents + TAM_CONTENTS + 2;
  const total = base.length + update.length;
  const d = total - c;
  const br = `[${num(0)} ${num(b)} ${num(c)} ${num(d)}]`;
  const semAssinatura = Buffer.concat([base, montar(br, zeros)]);
  const cobertos = Buffer.concat([semAssinatura.subarray(0, b), semAssinatura.subarray(c)]);
  const hex = (await assinar(cobertos)).toString("hex");
  if (hex.length > TAM_CONTENTS) throw new Error("CMS maior que o espaço reservado");
  return Buffer.concat([base, montar(br, hex.padEnd(TAM_CONTENTS, "0"))]);
}

const BASE = Buffer.from(
  "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n" +
    "4 0 obj\n<< /Length 30 >>\nstream\nATESTADO DE REGULARIDADE 2026\nendstream\nendobj\n" +
    "trailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "latin1"
);

const CPF_GUIRAU = "12345678901";
const CPF_MICHELIN = "98765432100";

let guirau: Signatario;
let michelin: Signatario;
let semCpf: Signatario;
let pdfGuirau: Buffer;

beforeAll(async () => {
  [guirau, michelin, semCpf] = await Promise.all([
    gerarCertificado("JOAO CARLOS NOGUEIRA GUIRAU", CPF_GUIRAU),
    gerarCertificado("FABIO MICHELIN", CPF_MICHELIN),
    gerarCertificado("JAIME CARUSO", null),
  ]);
  pdfGuirau = await acrescentarAssinatura(BASE, (dados) => assinarCms(guirau, dados));
}, 60_000);

describe("extrairAssinaturasPdf", () => {
  it("verifica hash + assinatura e extrai CN e CPF do certificado", async () => {
    const r = await extrairAssinaturasPdf(pdfGuirau);
    expect(r.quantidade).toBe(1);
    expect(r.validas).toBe(1);
    expect(r.nomes).toEqual(["JOAO CARLOS NOGUEIRA GUIRAU"]);
    expect(r.assinaturas[0]).toMatchObject({
      valida: true,
      cpf: CPF_GUIRAU,
      cobreAte: pdfGuirau.length,
    });
  });

  it("aceita duas assinaturas em atualizações incrementais", async () => {
    const pdf2 = await acrescentarAssinatura(pdfGuirau, (d) => assinarCms(michelin, d));
    const r = await extrairAssinaturasPdf(pdf2);
    expect(r.validas).toBe(2);
    expect(r.nomes).toContain("FABIO MICHELIN");
    expect(r.assinaturas.map((a) => a.cpf)).toEqual([CPF_GUIRAU, CPF_MICHELIN]);
  });

  it("rejeita um byte alterado no conteúdo coberto", async () => {
    const adulterado = Buffer.from(pdfGuirau);
    const pos = adulterado.indexOf("2026");
    adulterado[pos + 3] = "7".charCodeAt(0); // 2026 → 2027
    const r = await extrairAssinaturasPdf(adulterado);
    expect(r.quantidade).toBe(1);
    expect(r.validas).toBe(0);
    expect(r.nomes).toEqual([]);
    expect(r.assinaturas[0].motivo).toMatch(/hash/);
  });

  it("rejeita PDF forjado com bytes de CN colados (sem CMS válido)", async () => {
    const nome = Buffer.from("JOAO CARLOS NOGUEIRA GUIRAU", "utf8");
    const der = Buffer.concat([
      Buffer.from([0x30, 0x82, 0x01, 0x00]),
      Buffer.from([0x55, 0x04, 0x03, 0x0c, nome.length]),
      nome,
    ]);
    const forjado = await acrescentarAssinatura(BASE, async () => der);
    const r = await extrairAssinaturasPdf(forjado);
    expect(r.quantidade).toBe(1);
    expect(r.validas).toBe(0);
    expect(r.nomes).toEqual([]);
  });

  it("rejeita ByteRange que não cobre o documento como declarado", async () => {
    const s = pdfGuirau.toString("latin1");
    // desloca o início do /Contents no ByteRange: o buraco deixa de bater
    const adulterado = Buffer.from(
      s.replace(/\/ByteRange \[(\d+) (\d+)/, (_m, a, b) => `/ByteRange [${a} ${String(Number(b) - 1).padStart(10, "0")}`),
      "latin1"
    );
    const r = await extrairAssinaturasPdf(adulterado);
    expect(r.validas).toBe(0);
  });

  it("retorna vazio para PDF sem assinatura", async () => {
    const r = await extrairAssinaturasPdf(Buffer.from("%PDF-1.7\nsem assinatura"));
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
  it("aceita a primeira assinatura quando o CPF do certificado é o do usuário", async () => {
    const r = await validarUploadAssinado({
      pdf: pdfGuirau,
      anterior: null,
      nomeAssinante: "Outro Nome Qualquer", // com CPF no certificado o nome não manda
      cpf: "123.456.789-01",
    });
    expect(r.erro).toBeNull();
    expect(r.cpfConferido).toBe(true);
    expect(r.assinante?.cn).toBe("JOAO CARLOS NOGUEIRA GUIRAU");
  });

  it("aceita a continuação correta com assinatura nova do remetente", async () => {
    const pdf2 = await acrescentarAssinatura(pdfGuirau, (d) => assinarCms(michelin, d));
    const r = await validarUploadAssinado({
      pdf: pdf2,
      anterior: pdfGuirau,
      nomeAssinante: "Fábio Michelin",
      cpf: CPF_MICHELIN,
    });
    expect(r.erro).toBeNull();
    expect(r.cpfConferido).toBe(true);
  });

  it("rejeita CPF divergente mesmo com o nome igual", async () => {
    const r = await validarUploadAssinado({
      pdf: pdfGuirau,
      anterior: null,
      nomeAssinante: "JOAO CARLOS NOGUEIRA GUIRAU",
      cpf: "00000000000",
    });
    expect(r.erro).toMatch(/sua assinatura gov\.br/);
  });

  it("sem CPF no certificado cai na conferência por nome e avisa cpfConferido=false", async () => {
    const pdf = await acrescentarAssinatura(BASE, (d) => assinarCms(semCpf, d));
    const ok = await validarUploadAssinado({
      pdf,
      anterior: null,
      nomeAssinante: "Jaime Caruso",
      cpf: "11111111111",
    });
    expect(ok.erro).toBeNull();
    expect(ok.cpfConferido).toBe(false);
    const nao = await validarUploadAssinado({
      pdf,
      anterior: null,
      nomeAssinante: "Fabio Michelin",
      cpf: "11111111111",
    });
    expect(nao.erro).toMatch(/sua assinatura gov\.br/);
  });

  it("rejeita conteúdo adulterado (assinatura deixa de conferir)", async () => {
    const adulterado = Buffer.from(pdfGuirau);
    adulterado[adulterado.indexOf("2026") + 3] = "7".charCodeAt(0);
    const r = await validarUploadAssinado({
      pdf: adulterado,
      anterior: null,
      nomeAssinante: "JOAO CARLOS NOGUEIRA GUIRAU",
      cpf: CPF_GUIRAU,
    });
    expect(r.erro).toMatch(/assinatura nova válida/);
  });

  it("rejeita PDF forjado com CN colado", async () => {
    const nome = Buffer.from("JOAO CARLOS NOGUEIRA GUIRAU", "utf8");
    const der = Buffer.concat([Buffer.from([0x55, 0x04, 0x03, 0x0c, nome.length]), nome]);
    const forjado = await acrescentarAssinatura(BASE, async () => der);
    const r = await validarUploadAssinado({
      pdf: forjado,
      anterior: null,
      nomeAssinante: "JOAO CARLOS NOGUEIRA GUIRAU",
      cpf: CPF_GUIRAU,
    });
    expect(r.erro).toMatch(/assinatura nova válida/);
  });

  it("rejeita documento que não continua a versão atual", async () => {
    const outroBase = Buffer.concat([BASE, Buffer.from("% outro\n")]);
    const outro = await acrescentarAssinatura(outroBase, (d) => assinarCms(michelin, d));
    const r = await validarUploadAssinado({
      pdf: outro,
      anterior: pdfGuirau,
      nomeAssinante: "FABIO MICHELIN",
      cpf: CPF_MICHELIN,
    });
    expect(r.erro).toMatch(/não é a continuação/);
  });

  it("rejeita reenvio do mesmo arquivo sem assinatura nova", async () => {
    const r = await validarUploadAssinado({
      pdf: pdfGuirau,
      anterior: pdfGuirau,
      nomeAssinante: "JOAO CARLOS NOGUEIRA GUIRAU",
      cpf: CPF_GUIRAU,
    });
    expect(r.erro).toMatch(/não é a continuação|assinatura nova/);
  });

  it("rejeita PDF sem nenhuma assinatura na primeira etapa", async () => {
    const r = await validarUploadAssinado({
      pdf: Buffer.from("%PDF-1.7\nsem assinatura"),
      anterior: null,
      nomeAssinante: "JOAO GUIRAU",
      cpf: CPF_GUIRAU,
    });
    expect(r.erro).toMatch(/assinatura nova/);
  });
});
