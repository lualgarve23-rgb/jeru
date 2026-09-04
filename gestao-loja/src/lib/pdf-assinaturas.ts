// Verificação de assinaturas PAdES (gov.br/ITI) em PDFs.
//
// Cada assinatura é um dicionário /Sig com /ByteRange [a b c d] e
// /Contents <hex> contendo o CMS SignedData (PKCS#7) em DER, destacado. A
// assinatura cobre os bytes [a, a+b) ++ [c, c+d) — tudo menos o próprio
// /Contents. Para cada assinatura este módulo:
//
//   1. confere que o ByteRange é coerente (começa em 0, o buraco é exatamente
//      o /Contents e o fim não ultrapassa o arquivo);
//   2. decodifica o CMS (pkijs), computa o hash dos bytes cobertos com o
//      algoritmo do signerInfo e compara com o atributo assinado messageDigest;
//   3. verifica criptograficamente a assinatura do signerInfo com o
//      certificado do signatário embutido no CMS;
//   4. extrai do certificado o CN e o CPF ICP-Brasil (otherName no
//      SubjectAltName, OID 2.16.76.1.3.1: 8 dígitos de nascimento + 11 do CPF).
//
// O que NÃO é verificado: a cadeia até a AC-Raiz ICP-Brasil (o servidor não
// tem as âncoras de confiança instaladas) nem revogação/carimbo de tempo. A
// garantia dada é que o PDF foi assinado por alguém que detém a chave privada
// do certificado embutido e que esse certificado declara o CPF do usuário
// logado — suficiente para impedir os bytes colados/forjados que passavam na
// inspeção por regex anterior. Assinaturas com certificado autoassinado
// passam; quem quiser fechar isso precisa instalar as âncoras e ligar
// checkChain no verify.

import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { createHash, webcrypto } from "node:crypto";

const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";
const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";
const OID_CN = "2.5.4.3";
const OID_SUBJECT_ALT_NAME = "2.5.29.17";
const OID_ICP_BRASIL_PF = "2.16.76.1.3.1";

const HASHES: Record<string, string> = {
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
};

// pkijs precisa de um engine WebCrypto; no Node moderno globalThis.crypto já
// existe, mas garantimos o do node:crypto para ambientes de teste/CLI.
function garantirEngine() {
  if (pkijs.getCrypto(false)) return;
  pkijs.setEngine(
    "node",
    new pkijs.CryptoEngine({
      name: "node",
      crypto: webcrypto as unknown as Crypto,
    })
  );
}

export type AssinaturaPdf = {
  hex: string; // conteúdo de /Contents (identifica a assinatura)
  valida: boolean; // hash + assinatura conferidos
  motivo?: string; // por que não é válida
  cobreAte: number; // último byte coberto (c+d); 0 se inválida
  cn: string | null; // CN do certificado do signatário
  cpf: string | null; // CPF ICP-Brasil (11 dígitos) ou null se ausente
};

export type AssinaturasPdf = {
  quantidade: number; // dicionários /Sig encontrados
  validas: number;
  nomes: string[]; // CNs dos signatários com assinatura válida
  assinaturas: AssinaturaPdf[];
};

type Candidata = { hex: string; byteRange: number[] };

// Localiza os dicionários de assinatura (ByteRange + Contents, em qualquer
// ordem) sem interpretar nada ainda.
function localizarAssinaturas(pdf: Buffer): Candidata[] {
  const s = pdf.toString("latin1");
  const padroes = [
    /\/ByteRange\s*\[([^\]]*)\][^>]*?\/Contents\s*<([0-9A-Fa-f]+)>/g,
    /\/Contents\s*<([0-9A-Fa-f]+)>[^>]*?\/ByteRange\s*\[([^\]]*)\]/g,
  ];
  const vistos = new Set<string>();
  const out: Candidata[] = [];
  for (const [i, re] of padroes.entries()) {
    for (let m; (m = re.exec(s)); ) {
      const hex = i === 0 ? m[2] : m[1];
      const br = i === 0 ? m[1] : m[2];
      if (vistos.has(hex)) continue;
      vistos.add(hex);
      out.push({
        hex,
        byteRange: br
          .trim()
          .split(/\s+/)
          .map((n) => Number(n)),
      });
    }
  }
  return out;
}

// Bytes cobertos pela assinatura, ou string com o motivo da rejeição.
function bytesCobertos(pdf: Buffer, c: Candidata): Buffer | string {
  const [a, b, cc, d] = c.byteRange;
  if (
    c.byteRange.length !== 4 ||
    c.byteRange.some((n) => !Number.isInteger(n) || n < 0) ||
    a !== 0 ||
    cc < b ||
    cc + d > pdf.length
  ) {
    return "ByteRange inválido";
  }
  // O buraco [b, cc) tem de ser exatamente o /Contents desta assinatura.
  const buraco = pdf.subarray(b, cc).toString("latin1").trim();
  if (
    !buraco.startsWith("<") ||
    !buraco.endsWith(">") ||
    buraco.slice(1, -1).toLowerCase() !== c.hex.toLowerCase()
  ) {
    return "ByteRange não corresponde ao /Contents";
  }
  return Buffer.concat([pdf.subarray(0, b), pdf.subarray(cc, cc + d)]);
}

function cnDoCertificado(cert: pkijs.Certificate): string | null {
  const tv = cert.subject.typesAndValues.find((t) => t.type === OID_CN);
  const v = tv?.value?.valueBlock?.value;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// CPF ICP-Brasil: otherName 2.16.76.1.3.1 no SubjectAltName, valor com
// 8 dígitos da data de nascimento seguidos de 11 dígitos do CPF.
function cpfDoCertificado(cert: pkijs.Certificate): string | null {
  const ext = cert.extensions?.find((e) => e.extnID === OID_SUBJECT_ALT_NAME);
  if (!ext) return null;
  const parsed = asn1js.fromBER(ext.extnValue.valueBlock.valueHexView);
  if (parsed.offset === -1 || !(parsed.result instanceof asn1js.Sequence)) return null;
  for (const gn of parsed.result.valueBlock.value) {
    // otherName = [0] IMPLICIT SEQUENCE { type-id OID, value [0] EXPLICIT ANY }
    if (gn.idBlock.tagClass !== 3 || gn.idBlock.tagNumber !== 0) continue;
    if (!(gn instanceof asn1js.Constructed)) continue;
    const [oid, wrapper] = gn.valueBlock.value;
    if (!(oid instanceof asn1js.ObjectIdentifier)) continue;
    if (oid.valueBlock.toString() !== OID_ICP_BRASIL_PF) continue;
    const valor =
      wrapper instanceof asn1js.Constructed ? wrapper.valueBlock.value[0] : wrapper;
    const vb = valor?.valueBlock as { valueHexView?: Uint8Array } | undefined;
    const raw = vb?.valueHexView ?? valor?.valueBeforeDecodeView;
    if (!raw) continue;
    const texto = Buffer.from(raw).toString("latin1");
    const m = /^\d{19}/.exec(texto);
    if (m) return m[0].slice(8, 19);
  }
  return null;
}

function certificadoDoSigner(
  sd: pkijs.SignedData,
  si: pkijs.SignerInfo
): pkijs.Certificate | null {
  const certs = (sd.certificates ?? []).filter(
    (c): c is pkijs.Certificate => c instanceof pkijs.Certificate
  );
  if (si.sid instanceof pkijs.IssuerAndSerialNumber) {
    const sid = si.sid;
    const achado = certs.find(
      (c) =>
        c.issuer.isEqual(sid.issuer) &&
        Buffer.from(c.serialNumber.valueBlock.valueHexView).equals(
          Buffer.from(sid.serialNumber.valueBlock.valueHexView)
        )
    );
    if (achado) return achado;
  }
  return certs[0] ?? null;
}

async function verificarAssinatura(pdf: Buffer, c: Candidata): Promise<AssinaturaPdf> {
  const invalida = (motivo: string): AssinaturaPdf => ({
    hex: c.hex,
    valida: false,
    motivo,
    cobreAte: 0,
    cn: null,
    cpf: null,
  });
  const cobertos = bytesCobertos(pdf, c);
  if (typeof cobertos === "string") return invalida(cobertos);
  try {
    garantirEngine();
    const der = Buffer.from(c.hex, "hex");
    const asn1 = asn1js.fromBER(der);
    if (asn1.offset === -1) return invalida("CMS não decodificável");
    const ci = new pkijs.ContentInfo({ schema: asn1.result });
    if (ci.contentType !== OID_SIGNED_DATA) return invalida("CMS não é SignedData");
    const sd = new pkijs.SignedData({ schema: ci.content });
    const si = sd.signerInfos[0];
    if (!si) return invalida("SignedData sem signerInfo");
    const cert = certificadoDoSigner(sd, si);
    if (!cert) return invalida("certificado do signatário ausente");

    // (b) hash dos bytes cobertos == messageDigest assinado
    const hash = HASHES[si.digestAlgorithm.algorithmId];
    if (!hash) return invalida(`algoritmo de hash não suportado (${si.digestAlgorithm.algorithmId})`);
    const attr = si.signedAttrs?.attributes.find((a) => a.type === OID_MESSAGE_DIGEST);
    const md = attr?.values?.[0]?.valueBlock?.valueHexView;
    if (!md) return invalida("atributo messageDigest ausente");
    const calculado = createHash(hash).update(cobertos).digest();
    if (!calculado.equals(Buffer.from(md))) return invalida("hash do conteúdo não confere");

    // (c) assinatura do signerInfo com o certificado (sem cadeia — ver cabeçalho)
    const ok = await sd.verify({
      signer: 0,
      data: new Uint8Array(cobertos).buffer as ArrayBuffer, // cópia própria, sem pool
      checkChain: false,
    });
    if (ok !== true) return invalida("assinatura criptográfica inválida");

    return {
      hex: c.hex,
      valida: true,
      cobreAte: c.byteRange[2] + c.byteRange[3],
      cn: cnDoCertificado(cert),
      cpf: cpfDoCertificado(cert),
    };
  } catch (e) {
    return invalida(e instanceof Error ? e.message : String(e));
  }
}

// Localiza e verifica todas as assinaturas do PDF.
export async function extrairAssinaturasPdf(pdf: Buffer): Promise<AssinaturasPdf> {
  const candidatas = localizarAssinaturas(pdf);
  const assinaturas: AssinaturaPdf[] = [];
  for (const c of candidatas) assinaturas.push(await verificarAssinatura(pdf, c));
  const validas = assinaturas.filter((a) => a.valida);
  return {
    quantidade: candidatas.length,
    validas: validas.length,
    nomes: [...new Set(validas.map((a) => a.cn).filter((n): n is string => !!n))],
    assinaturas,
  };
}

export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function somenteDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export type ResultadoUploadAssinado =
  | { erro: string; cpfConferido?: undefined; assinante?: undefined }
  | {
      erro: null;
      // true quando o certificado trazia o CPF e ele bate com o do usuário;
      // false quando o certificado não tem o OID do CPF e a conferência caiu
      // no CN normalizado x nome.
      cpfConferido: boolean;
      assinante: { cn: string | null; cpf: string | null };
    };

// Valida o upload de um PDF assinado no gov.br contra a versão anterior do
// documento e a identidade do remetente (CPF do certificado ou, na falta,
// nome civil). Retorna { erro } ou { erro: null, cpfConferido, assinante }.
export async function validarUploadAssinado(opts: {
  pdf: Buffer;
  anterior: Buffer | null; // versão já armazenada (com as assinaturas prévias)
  nomeAssinante: string;
  cpf: string | null | undefined; // CPF do usuário logado (com ou sem máscara)
}): Promise<ResultadoUploadAssinado> {
  const { pdf, anterior, nomeAssinante } = opts;
  // Assinaturas PAdES são atualizações incrementais: o documento anterior
  // precisa ser prefixo byte a byte do novo — garante que é o MESMO documento
  // e que as assinaturas já colhidas foram preservadas.
  if (anterior && anterior.length > 0) {
    if (
      pdf.length <= anterior.length ||
      !pdf.subarray(0, anterior.length).equals(anterior)
    ) {
      return {
        erro:
          "O arquivo enviado não é a continuação do documento atual — baixe o " +
          "PDF na versão mais recente aqui do sistema, assine ESSE arquivo no " +
          "gov.br e suba o resultado, sem reaproveitar PDFs antigos.",
      };
    }
  }
  const jaHavia = new Set(
    anterior ? localizarAssinaturas(anterior).map((c) => c.hex.toLowerCase()) : []
  );
  const agora = await extrairAssinaturasPdf(pdf);
  // Assinaturas novas, válidas e que cobrem pelo menos toda a versão anterior
  // (uma assinatura que não cobre o anterior não atesta este documento).
  const minimo = anterior?.length ?? 0;
  const novas = agora.assinaturas.filter(
    (a) => a.valida && !jaHavia.has(a.hex.toLowerCase()) && a.cobreAte >= minimo
  );
  if (novas.length === 0) {
    return {
      erro:
        "O arquivo enviado não traz uma assinatura nova válida — assine o PDF no " +
        "portal do gov.br antes de subir (assinaturas inválidas ou que não cobrem " +
        "o documento inteiro não são aceitas).",
    };
  }
  const cpfEsperado = somenteDigitos(opts.cpf);
  const esperado = normalizarNome(nomeAssinante);
  let semCpfNoCert: AssinaturaPdf | null = null;
  for (const a of novas) {
    if (a.cpf) {
      if (cpfEsperado.length === 11 && a.cpf === cpfEsperado) {
        return { erro: null, cpfConferido: true, assinante: { cn: a.cn, cpf: a.cpf } };
      }
      continue; // CPF divergente: não é a assinatura do remetente
    }
    if (a.cn && normalizarNome(a.cn) === esperado) semCpfNoCert ??= a;
  }
  if (semCpfNoCert) {
    return {
      erro: null,
      cpfConferido: false,
      assinante: { cn: semCpfNoCert.cn, cpf: null },
    };
  }
  return {
    erro:
      `Não encontramos a sua assinatura gov.br (${nomeAssinante}) no PDF ` +
      "enviado — confira se assinou com a sua própria conta (o CPF do " +
      "certificado precisa ser o seu) e se subiu o arquivo certo.",
  };
}
