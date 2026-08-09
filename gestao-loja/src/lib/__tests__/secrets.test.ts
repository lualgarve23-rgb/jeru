import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hasSecret,
  isEncryptedSecret,
  sealSecret,
} from "@/lib/secrets";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-auth-secret-min-16-chars!!";
  delete process.env.SECRETS_ENCRYPTION_KEY;
});

describe("secrets at-rest (AES-256-GCM)", () => {
  it("cifra e decifra round-trip", () => {
    const sealed = encryptSecret("$aact_secret_key_xyz");
    expect(isEncryptedSecret(sealed)).toBe(true);
    expect(sealed).not.toContain("$aact_secret_key_xyz");
    expect(decryptSecret(sealed)).toBe("$aact_secret_key_xyz");
  });

  it("cada cifra usa IV distinto", () => {
    const a = encryptSecret("mesmo");
    const b = encryptSecret("mesmo");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("mesmo");
    expect(decryptSecret(b)).toBe("mesmo");
  });

  it("aceita plaintext legado sem prefixo", () => {
    expect(decryptSecret("senha-antiga-em-claro")).toBe("senha-antiga-em-claro");
    expect(isEncryptedSecret("senha-antiga-em-claro")).toBe(false);
  });

  it("sealSecret não re-cifra o já cifrado", () => {
    const once = sealSecret("token-oauth");
    const twice = sealSecret(once);
    expect(twice).toBe(once);
  });

  it("sealSecret(null/vazio) → null", () => {
    expect(sealSecret(null)).toBeNull();
    expect(sealSecret("")).toBeNull();
    expect(sealSecret("   ")).not.toBeNull(); // espaços são conteúdo
  });

  it("decryptSecret(null/vazio) → null", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret("")).toBeNull();
  });

  it("hasSecret distingue configurado vs ausente", () => {
    expect(hasSecret(null)).toBe(false);
    expect(hasSecret("")).toBe(false);
    expect(hasSecret(encryptSecret("x"))).toBe(true);
  });

  it("falha se AUTH_SECRET/SECRETS_ENCRYPTION_KEY ausente ao cifrar", () => {
    delete process.env.AUTH_SECRET;
    delete process.env.SECRETS_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/AUTH_SECRET|SECRETS_ENCRYPTION_KEY/);
  });

  it("SECRETS_ENCRYPTION_KEY tem prioridade sobre AUTH_SECRET", () => {
    process.env.SECRETS_ENCRYPTION_KEY = "dedicated-secrets-key-32b!";
    const sealed = encryptSecret("abc");
    process.env.AUTH_SECRET = "other-key-that-must-not-matter!!";
    expect(decryptSecret(sealed)).toBe("abc");
  });
});
