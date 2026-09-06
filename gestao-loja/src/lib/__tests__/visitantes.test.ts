import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  completarCampos,
  escolherCorrespondencia,
  normalizarDadosVisitante,
  normalizarTelefone,
} from "@/lib/visitantes";
import {
  attendanceDoTokenCertificado,
  linkWhatsAppCertificado,
  mensagemWhatsAppCertificado,
  telefoneWhatsApp,
  tokenCertificado,
} from "@/lib/certificado";

const raiz = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const cand = (
  id: string,
  nome: string,
  extra: Partial<{ cim: string; email: string; lojaOrigem: string }> = {}
) => ({
  id,
  nome,
  cim: extra.cim ?? null,
  email: extra.email ?? null,
  lojaOrigem: extra.lojaOrigem ?? null,
});

describe("base de Visitantes — correspondência no check-in", () => {
  const joao = cand("a", "João da Silva", { cim: "123", email: "joao@x.com", lojaOrigem: "Estrela nº 1" });
  const outroJoao = cand("b", "João da Silva", { lojaOrigem: "Aurora nº 2" });
  const maria = cand("c", "Mário Souza");

  it("CIM igual casa, mesmo com nome escrito diferente", () => {
    expect(
      escolherCorrespondencia([joao, outroJoao], { nome: "JOAO SILVA", cim: " 123 " })?.id
    ).toBe("a");
  });

  it("sem CIM, e-mail igual casa (case-insensitive)", () => {
    expect(
      escolherCorrespondencia([joao, outroJoao], { nome: "Joao", email: "JOAO@x.com" })?.id
    ).toBe("a");
  });

  it("nome igual + loja igual casa; loja diferente NÃO casa", () => {
    expect(
      escolherCorrespondencia([joao, outroJoao], { nome: "joão da silva", lojaOrigem: "aurora nº 2" })?.id
    ).toBe("b");
    expect(
      escolherCorrespondencia([joao, outroJoao], { nome: "João da Silva", lojaOrigem: "Outra nº 9" })
    ).toBeNull();
  });

  it("nome sem loja só casa se houver um único homônimo", () => {
    expect(escolherCorrespondencia([joao, outroJoao], { nome: "João da Silva" })).toBeNull();
    expect(escolherCorrespondencia([maria], { nome: "mário souza" })?.id).toBe("c");
  });

  it("completarCampos só preenche o que está vazio (Secretaria é a fonte de verdade)", () => {
    const upd = completarCampos(
      { cim: "123", email: null, telefone: null, lojaOrigem: "Estrela nº 1", potencia: null },
      { nome: "x", cim: "999", email: "a@b.c", telefone: "11999", lojaOrigem: "Outra", potencia: "GOB" }
    );
    expect(upd).toEqual({ email: "a@b.c", telefone: "11999", potencia: "GOB" });
  });

  it("normaliza espaços, e-mail minúsculo e telefone só dígitos", () => {
    expect(
      normalizarDadosVisitante({
        nome: "  José   Ribamar ",
        email: " Jose@Mail.COM ",
        telefone: "(11) 99999-0000",
        cim: "",
        lojaOrigem: " ",
      })
    ).toEqual({
      nome: "José Ribamar",
      cim: null,
      email: "jose@mail.com",
      telefone: "11999990000",
      lojaOrigem: null,
      potencia: null,
    });
    expect(normalizarTelefone("+351 912 345 678")).toBe("+351912345678");
    expect(normalizarTelefone("abc")).toBeNull();
  });
});

describe("Certificado de Visita pelo WhatsApp (link assinado)", () => {
  process.env.AUTH_SECRET ??= "segredo-de-teste";
  process.env.APP_URL = "https://loja.exemplo";

  it("token vai e volta; assinatura adulterada ou id trocado são rejeitados", () => {
    const tok = tokenCertificado("clx123abc");
    expect(attendanceDoTokenCertificado(tok)).toBe("clx123abc");
    expect(attendanceDoTokenCertificado(tok.slice(0, -2) + "zz")).toBeNull();
    const [, assinatura] = tok.split(".");
    expect(attendanceDoTokenCertificado(`outroid.${assinatura}`)).toBeNull();
    expect(attendanceDoTokenCertificado("semponto")).toBeNull();
  });

  it("telefone brasileiro sem DDI ganha 55; curto demais é rejeitado", () => {
    expect(telefoneWhatsApp("(11) 99999-0000")).toBe("5511999990000");
    expect(telefoneWhatsApp("+5511999990000")).toBe("5511999990000");
    expect(telefoneWhatsApp("1234")).toBeNull();
    expect(telefoneWhatsApp(null)).toBeNull();
  });

  it("mensagem leva o link público do PDF e o wa.me aponta ao telefone", () => {
    const msg = mensagemWhatsAppCertificado({
      nome: "José",
      loja: "ARLS Teste nº 1",
      tipo: "Ordinária",
      dataSessao: "01/09/2026",
      attendanceId: "clx123abc",
    });
    expect(msg).toContain("https://loja.exemplo/certificado/clx123abc.");
    const link = linkWhatsAppCertificado("5511999990000", msg);
    expect(link.startsWith("https://wa.me/5511999990000?text=")).toBe(true);
  });

  it("rota pública /certificado/ está liberada no auth e com rate limit", () => {
    expect(ler("auth.config.ts")).toContain('pathname.startsWith("/certificado/")');
    expect(ler("lib/rate-limit.ts")).toContain('prefixo: "/certificado/"');
  });
});

describe("Visitantes — acesso só de Secretário e VM", () => {
  it("menu, páginas e export exigem SECRETARIO/VENERAVEL_MESTRE (sem Conselho)", () => {
    const layout = ler("app/(app)/layout.tsx");
    expect(layout).toMatch(/href: "\/secretaria\/visitantes"[^\n]*roles: gestaoLoja/);
    for (const rel of [
      "app/(app)/secretaria/visitantes/page.tsx",
      "app/(app)/secretaria/visitantes/[id]/page.tsx",
      "app/(app)/secretaria/visitantes/export/route.ts",
    ]) {
      const src = ler(rel);
      expect(src).toContain('requireRole("SECRETARIO", "VENERAVEL_MESTRE")');
      expect(src).not.toContain("CONSELHO_CONTAS");
    }
  });

  it("convite da sessão aos visitantes: handler na fila, action da Secretaria e card na sessão", () => {
    expect(ler("lib/fila.ts")).toContain('"sessao.convites-visitantes"');
    expect(ler("lib/envios.ts")).toContain("export async function enviarConvitesSessaoVisitantes");
    const acao = ler("app/(app)/secretaria/_actions/sessoes.ts");
    const ini = acao.indexOf("export async function dispararConvitesVisitantesEmail");
    expect(acao.slice(ini, ini + 400)).toContain("requireSecretariaWriter()");
    expect(ler("app/(app)/secretaria/sessoes/[id]/page.tsx")).toContain("<ConvitesVisitantesCard");
    expect(ler("app/convite/[token]/page.tsx")).toContain('name="telefone"');
  });

  it("check-in por QR e RSVP público vinculam a presença à base de Visitantes", () => {
    const src = ler("app/(app)/secretaria/_actions/sessoes.ts");
    expect(src.split("vincularVisitante(").length - 1).toBeGreaterThanOrEqual(2);
    expect(ler("app/checkin/[token]/page.tsx")).toContain('name="visitorTelefone"');
  });
});
