import { createHash } from "crypto";
import signpdf from "@signpdf/signpdf";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";
import { Signer } from "@signpdf/utils";

// Assinatura Eletrônica gov.br (API do ITI) — o usuário autentica na conta
// gov.br e o ITI devolve uma assinatura PKCS#7 vinculada ao CPF dele, que é
// embutida no PDF (PAdES). Exige credenciamento da aplicação junto ao
// ITI/Serpro (termo de adesão) — as credenciais vão no .env.
//
// Homologação (padrão): cas.staging.iti.br / assinatura-api.staging.iti.br
// Produção: GOVBR_SIGN_AUTH_URL=https://cas.iti.br
//           GOVBR_SIGN_API_URL=https://assinatura-api.iti.br

const AUTH_URL =
  process.env.GOVBR_SIGN_AUTH_URL || "https://cas.staging.iti.br";
const API_URL =
  process.env.GOVBR_SIGN_API_URL || "https://assinatura-api.staging.iti.br";
const SCOPE = process.env.GOVBR_SIGN_SCOPE || "sign";

export function isGovbrConfigured() {
  return Boolean(
    process.env.GOVBR_SIGN_CLIENT_ID && process.env.GOVBR_SIGN_CLIENT_SECRET
  );
}

export function govbrRedirectUri() {
  const base = process.env.APP_URL ?? "http://localhost:3100";
  return new URL("/api/govbr/callback", base).toString();
}

export function govbrAuthorizeUrl(state: string) {
  const url = new URL("/oauth2.0/authorize", AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.GOVBR_SIGN_CLIENT_ID!);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", govbrRedirectUri());
  url.searchParams.set("state", state);
  return url.toString();
}

// Troca o code do OAuth pelo access_token da sessão de assinatura
export async function govbrExchangeCode(code: string): Promise<string> {
  const basic = Buffer.from(
    `${process.env.GOVBR_SIGN_CLIENT_ID}:${process.env.GOVBR_SIGN_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch(new URL("/oauth2.0/token", AUTH_URL), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: govbrRedirectUri(),
    }),
  });
  if (!res.ok) {
    throw new Error(`gov.br token: HTTP ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("gov.br não retornou access_token.");
  return data.access_token;
}

// CPF do titular da conta gov.br, extraído do access_token (JWT, campo sub).
// Retorna null quando o token não traz o CPF em formato reconhecível.
export function govbrCpfFromToken(accessToken: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")
    ) as { sub?: string };
    const digits = payload.sub?.replace(/\D/g, "") ?? "";
    return digits.length === 11 ? digits : null;
  } catch {
    return null;
  }
}

// Assinatura PKCS#7 do hash SHA-256 (endpoint oficial do ITI)
async function assinarPkcs7(
  accessToken: string,
  hashBase64: string
): Promise<Buffer> {
  const res = await fetch(new URL("/externo/v2/assinarPKCS7", API_URL), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hashBase64 }),
  });
  if (!res.ok) {
    throw new Error(`gov.br assinarPKCS7: HTTP ${res.status} ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

class GovbrSigner extends Signer {
  constructor(private accessToken: string) {
    super();
  }
  async sign(pdfBuffer: Buffer): Promise<Buffer> {
    const hashBase64 = createHash("sha256").update(pdfBuffer).digest("base64");
    return assinarPkcs7(this.accessToken, hashBase64);
  }
}

// Acrescenta uma assinatura gov.br ao PDF (PAdES). Pode ser chamada mais de
// uma vez sobre o mesmo arquivo — cada chamada anexa a assinatura de forma
// incremental, preservando as anteriores.
export async function assinarPdfComGovbr(
  pdf: Buffer | Uint8Array,
  accessToken: string,
  opts: { name: string; reason: string }
): Promise<Buffer> {
  const withPlaceholder = plainAddPlaceholder({
    pdfBuffer: Buffer.from(pdf),
    reason: opts.reason,
    name: opts.name,
    location: "gov.br",
    contactInfo: "",
    signatureLength: 32768,
  });
  return signpdf.sign(withPlaceholder, new GovbrSigner(accessToken));
}
