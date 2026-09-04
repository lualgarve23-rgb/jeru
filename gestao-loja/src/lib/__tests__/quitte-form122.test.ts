import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { bloqueioGeracaoForm122, dataIsoLocal, FORM_122 } from "@/lib/quitte-form122";
import { CAMPOS_POR_FORMULARIO } from "@/lib/formularios-fill";

describe("Form. 122 automático do Quitte Placet", () => {
  it("o modelo oficial existe e tem mapa de preenchimento (sessão, obreiro, cargos)", () => {
    expect(existsSync(path.resolve(__dirname, "../../../public/formularios-gob", FORM_122))).toBe(true);
    const mapa = CAMPOS_POR_FORMULARIO[FORM_122];
    const chaves = Object.values(mapa);
    for (const c of ["lojaNome", "sessaoDia", "sessaoMes", "sessaoAno", "obreiroNome", "obreiroCim", "vmNome", "secNome", "oradorNome"]) {
      expect(chaves).toContain(c);
    }
  });

  it("só gera com a sessão de comunicação registrada e antes da emissão", () => {
    expect(bloqueioGeracaoForm122({ status: "EM_ANALISE", dataSessaoComunicacao: null })).toMatch(/sessão/);
    expect(bloqueioGeracaoForm122({ status: "APROVADO", dataSessaoComunicacao: new Date() })).toMatch(/emitido/);
    expect(bloqueioGeracaoForm122({ status: "NEGADO", dataSessaoComunicacao: new Date() })).toMatch(/negado/i);
    expect(bloqueioGeracaoForm122({ status: "PENDENTE", dataSessaoComunicacao: new Date() })).toBeNull();
  });

  it("data da sessão vai ao preenchedor como aaaa-mm-dd local", () => {
    expect(dataIsoLocal(new Date(2026, 8, 4))).toBe("2026-09-04");
  });
});
