import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

// Anti-força-bruta no login (loja.md §segurança)
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const credentialsSchema = z.object({
  cim: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1)),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "CIM + Senha",
      credentials: {
        cim: { label: "CIM", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { cim, password } = parsed.data;

        // O CIM é único globalmente e mapeia o usuário à sua Loja (tenant).
        // Muitos CIMs do GOB têm zero à esquerda (ex.: 0304258) que o irmão
        // não digita — se a busca exata falhar, procura ignorando esses zeros.
        const include = { lodge: { select: { id: true, name: true } } } as const;
        let user = await prisma.user.findUnique({ where: { cim }, include });
        if (!user && /^\d+$/.test(cim)) {
          const semZeros = cim.replace(/^0+/, "");
          if (semZeros) {
            const candidatos = await prisma.user.findMany({
              where: { cim: { endsWith: semZeros } },
              include,
            });
            const iguais = candidatos.filter(
              (u) => u.cim.replace(/^0+/, "") === semZeros
            );
            if (iguais.length === 1) user = iguais[0];
          }
        }
        if (!user || user.status === "EX_MEMBRO") return null;

        // Anti-força-bruta: após MAX_LOGIN_ATTEMPTS falhas seguidas, a conta
        // fica bloqueada por LOCKOUT_MINUTES. O bloqueio expira sozinho e é
        // limpo a cada login válido. A mensagem ao usuário é sempre genérica
        // (não revela o bloqueio), evitando dar sinais ao atacante.
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        // Aceita a senha como digitada e, como fallback, só os dígitos —
        // a senha inicial é o CPF, que muitos digitam com máscara (000.000.000-00)
        let valid = await bcrypt.compare(password.trim(), user.passwordHash);
        if (!valid) {
          const digits = password.replace(/\D/g, "");
          if (digits) valid = await bcrypt.compare(digits, user.passwordHash);
        }
        if (!valid) {
          const attempts = user.failedLoginAttempts + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: attempts,
              lockedUntil:
                attempts >= MAX_LOGIN_ATTEMPTS
                  ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
                  : null,
            },
          });
          return null;
        }

        // Login válido: zera o contador e libera eventual bloqueio.
        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          });
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          cim: user.cim,
          lodgeId: user.lodgeId,
          lodgeName: user.lodge.name,
          role: user.currentRole,
          degree: user.degree,
        };
      },
    }),
  ],
});
