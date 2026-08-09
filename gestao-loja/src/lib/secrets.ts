import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Segredos at-rest (AES-256-GCM).
 *
 * Formato: enc:v1:<iv>.<tag>.<ciphertext>  (cada parte em base64url)
 * Valores sem o prefixo são tratados como plaintext legado (lidos e
 * re-selados na próxima gravação).
 *
 * Chave: SECRETS_ENCRYPTION_KEY ou, em fallback, AUTH_SECRET
 * (hash SHA-256 → 32 bytes).
 */

const PREFIX = "enc:v1:";

function encryptionKey(): Buffer {
  const raw =
    process.env.SECRETS_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!raw || raw.length < 16) {
    throw new Error(
      "Defina SECRETS_ENCRYPTION_KEY ou AUTH_SECRET (≥16 chars) para criptografar segredos."
    );
  }
  return createHash("sha256").update(raw).digest();
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv, tag, ciphertext].map((b) => b.toString("base64url")).join(".")
  );
}

/** Decifra se `enc:v1:…`; senão devolve o plaintext legado. */
export function decryptSecret(
  stored: string | null | undefined
): string | null {
  if (stored == null || stored === "") return null;
  if (!isEncryptedSecret(stored)) return stored;

  const parts = stored.slice(PREFIX.length).split(".");
  if (parts.length !== 3) {
    throw new Error("Segredo criptografado com formato inválido.");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const key = encryptionKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

/** Grava: null/vazio → null; já cifrado → inalterado; senão cifra. */
export function sealSecret(
  plaintext: string | null | undefined
): string | null {
  if (plaintext == null || plaintext === "") return null;
  if (isEncryptedSecret(plaintext)) return plaintext;
  return encryptSecret(plaintext);
}

export const openSecret = decryptSecret;

export function hasSecret(stored: string | null | undefined): boolean {
  return Boolean(stored && stored.length > 0);
}
