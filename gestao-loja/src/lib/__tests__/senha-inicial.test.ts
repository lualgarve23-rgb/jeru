import { describe, it, expect } from "vitest";
import { gerarSenhaInicial, emailEntregavel } from "@/lib/senha-inicial";

describe("gerarSenhaInicial", () => {
  it("gera 10 caracteres do alfabeto sem ambíguos", () => {
    for (let i = 0; i < 20; i++) {
      const s = gerarSenhaInicial();
      expect(s).toHaveLength(10);
      expect(s).toMatch(/^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
    }
  });

  it("não repete (aleatória)", () => {
    const vistos = new Set(Array.from({ length: 50 }, () => gerarSenhaInicial()));
    expect(vistos.size).toBe(50);
  });

  it("respeita o tamanho pedido", () => {
    expect(gerarSenhaInicial(16)).toHaveLength(16);
  });
});

describe("emailEntregavel", () => {
  it("aceita e-mail real", () => {
    expect(emailEntregavel("irmao@gmail.com")).toBe(true);
  });
  it("rejeita placeholder da importação", () => {
    expect(emailEntregavel("cim12345@importado.local")).toBe(false);
  });
  it("rejeita vazio e sem @", () => {
    expect(emailEntregavel("")).toBe(false);
    expect(emailEntregavel("sem-arroba")).toBe(false);
  });
});
