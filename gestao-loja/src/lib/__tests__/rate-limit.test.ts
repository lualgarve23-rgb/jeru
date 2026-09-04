import { describe, it, expect, beforeEach } from "vitest";
import {
  permitir,
  regraPara,
  zerarRateLimit,
  REGRAS_PUBLICAS,
} from "@/lib/rate-limit";

const T0 = 1_000_000;

describe("rate limit das rotas públicas", () => {
  beforeEach(() => zerarRateLimit());

  it("cobre exatamente as rotas públicas sensíveis", () => {
    expect(regraPara("/checkin/abc123")).toBeTruthy();
    expect(regraPara("/convite/abc123")).toBeTruthy();
    expect(regraPara("/candidato/abc123")).toBeTruthy();
    expect(regraPara("/verificar/abc123")).toBeTruthy();
    expect(regraPara("/esqueci-senha")).toBeTruthy();
    expect(regraPara("/login")).toBeTruthy();
    expect(regraPara("/api/auth/callback/credentials")).toBeTruthy();
    expect(regraPara("/dashboard")).toBeNull();
    expect(regraPara("/api/webhooks/asaas")).toBeNull();
  });

  it("bloqueia GET acima do limite e volta a permitir após a janela", () => {
    const { porMinuto } = REGRAS_PUBLICAS.find((r) => r.prefixo === "/verificar/")!;
    for (let i = 0; i < porMinuto; i++) {
      expect(permitir("1.2.3.4", "/verificar/tok", "GET", T0 + i)).toBe(true);
    }
    expect(permitir("1.2.3.4", "/verificar/tok", "GET", T0 + porMinuto)).toBe(false);
    // 61s depois a janela deslizou
    expect(permitir("1.2.3.4", "/verificar/tok", "GET", T0 + 61_000)).toBe(true);
  });

  it("POST tem limite próprio, mais apertado, sem consumir o de GET", () => {
    const regra = REGRAS_PUBLICAS.find((r) => r.prefixo === "/candidato/")!;
    for (let i = 0; i < regra.porMinutoPost; i++) {
      expect(permitir("1.2.3.4", "/candidato/tok", "POST", T0 + i)).toBe(true);
    }
    expect(permitir("1.2.3.4", "/candidato/tok", "POST", T0 + 100)).toBe(false);
    // GET continua disponível para o mesmo IP
    expect(permitir("1.2.3.4", "/candidato/tok", "GET", T0 + 101)).toBe(true);
  });

  it("IPs diferentes não partilham o limite", () => {
    const { porMinuto } = REGRAS_PUBLICAS.find((r) => r.prefixo === "/convite/")!;
    for (let i = 0; i < porMinuto; i++) permitir("1.1.1.1", "/convite/t", "GET", T0 + i);
    expect(permitir("1.1.1.1", "/convite/t", "GET", T0 + 999)).toBe(false);
    expect(permitir("2.2.2.2", "/convite/t", "GET", T0 + 999)).toBe(true);
  });

  it("tokens diferentes do mesmo prefixo partilham o limite (anti-enumeração)", () => {
    const { porMinuto } = REGRAS_PUBLICAS.find((r) => r.prefixo === "/verificar/")!;
    for (let i = 0; i < porMinuto; i++) {
      permitir("9.9.9.9", `/verificar/token-${i}`, "GET", T0 + i);
    }
    expect(permitir("9.9.9.9", "/verificar/outro", "GET", T0 + 999)).toBe(false);
  });

  it("rotas sem regra nunca são bloqueadas", () => {
    for (let i = 0; i < 500; i++) {
      expect(permitir("1.2.3.4", "/dashboard", "GET", T0 + i)).toBe(true);
    }
  });
});
