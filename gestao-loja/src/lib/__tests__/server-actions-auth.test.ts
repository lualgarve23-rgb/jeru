import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Regressão de segurança (#1 / #2): settleInvoice NÃO pode ser Server Action.
 * Tem que viver em lib/ — se voltar a ser export de "use server", qualquer
 * cliente autenticado (ou com o ID da action) consegue quitar mensalidade.
 */
describe("settleInvoice fora da superfície de Server Actions", () => {
  const root = path.resolve(__dirname, "../..");

  it("não é exportada em tesouraria/actions.ts", () => {
    const src = readFileSync(
      path.join(root, "app/(app)/tesouraria/actions.ts"),
      "utf8"
    );
    expect(src.startsWith('"use server"')).toBe(true);
    expect(src.includes("export async function settleInvoice")).toBe(false);
    expect(
      src.includes('import { settleInvoice } from "@/lib/settle-invoice"')
    ).toBe(true);
  });

  it("existe como módulo interno em lib/settle-invoice.ts", () => {
    const src = readFileSync(
      path.join(root, "lib/settle-invoice.ts"),
      "utf8"
    );
    expect(src.includes("use server")).toBe(false);
    expect(src.includes("export async function settleInvoice")).toBe(true);
  });

  it("webhooks importam de lib/, não de actions", () => {
    for (const rel of [
      "app/api/webhooks/asaas/route.ts",
      "app/api/webhooks/pix/route.ts",
    ]) {
      const src = readFileSync(path.join(root, rel), "utf8");
      expect(src.includes('from "@/lib/settle-invoice"')).toBe(true);
      expect(src.includes('from "@/app/(app)/tesouraria/actions"')).toBe(false);
    }
  });
});

/**
 * Varredura estática (#2): toda export de "use server" precisa chamar
 * require* no início, exceto actions públicas por token (check-in, RSVP,
 * candidato) e fluxos de login/recuperação de senha.
 */
describe("server actions exigem autenticação (exceto públicas documentadas)", () => {
  const PUBLIC_BY_DESIGN = new Set([
    "loginAction",
    "requestPasswordReset",
    "resetPasswordWithCode",
    "qrCheckinVisitor",
    "rsvpPublico",
    "ausenciaPublico",
    "anexarFormularioCandidatoPublico",
  ]);

  const AUTH_MARKERS = [
    "requireUser",
    "requireRole",
    "requireSecretariaWriter",
    "requireTesourariaWriter",
    "confirmPassword",
    "signIn(",
  ];

  it("nenhuma action autenticável fica sem require* nas primeiras linhas", () => {
    const srcRoot = path.resolve(__dirname, "../..");
    const files = [
      "app/(app)/tesouraria/actions.ts",
      "app/(app)/admin/actions.ts",
      "app/(app)/secretaria/actions.ts",
      "app/(app)/secretaria/emails/actions.ts",
      "app/(app)/secretaria/membros/importar/actions.ts",
      "app/(app)/dashboard/biblioteca/actions.ts",
      "app/(app)/dashboard/notificacoes/actions.ts",
      "app/(app)/dashboard/sign-actions.ts",
      "app/(app)/dashboard/privacidade/actions.ts",
      "app/(app)/dashboard/senha/actions.ts",
      "app/(app)/dashboard/perfil/actions.ts",
      "app/(app)/dashboard/loja/actions.ts",
      "app/(app)/dashboard/instrucoes/actions.ts",
      "app/login/actions.ts",
      "app/trocar-senha/actions.ts",
      "app/esqueci-senha/actions.ts",
    ];

    const missing: string[] = [];
    const exportRe = /^export async function (\w+)\(/gm;
    for (const rel of files) {
      const text = readFileSync(path.join(srcRoot, rel), "utf8");
      if (!text.includes("use server")) continue;
      let m: RegExpExecArray | null;
      exportRe.lastIndex = 0;
      while ((m = exportRe.exec(text))) {
        const name = m[1];
        if (PUBLIC_BY_DESIGN.has(name)) continue;
        const chunk = text.slice(m.index, m.index + 1200);
        const ok = AUTH_MARKERS.some((marker) => chunk.includes(marker));
        if (!ok) missing.push(`${rel}#${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
