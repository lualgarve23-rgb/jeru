import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { contasPorCim } from "@/lib/contas";

// Anti-força-bruta no login (loja.md §segurança)
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const credentialsSchema = z.object({
  cim: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1)),
  password: z.string().min(1),
  // #16: quando o CIM tem filiação em mais de uma loja, a página de login
  // pede a escolha e reenvia com a loja selecionada
  lodgeId: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "CIM + Senha",
      credentials: {
        cim: { label: "CIM", type: "text" },
        password: { label: "Senha", type: "password" },
        lodgeId: { label: "Loja", type: "text" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { cim, password, lodgeId } = parsed.data;

        // #16: o CIM pode ter conta em mais de uma loja (filiação múltipla)
        let contas = await contasPorCim(cim);
        if (lodgeId) contas = contas.filter((u) => u.lodgeId === lodgeId);
        if (!contas.length) return null;

        // Anti-força-bruta: após MAX_LOGIN_ATTEMPTS falhas seguidas, a conta
        // fica bloqueada por LOCKOUT_MINUTES. O bloqueio expira sozinho e é
        // limpo a cada login válido. A mensagem ao usuário é sempre genérica
        // (não revela o bloqueio), evitando dar sinais ao atacante.
        const agora = new Date();
        const livres = contas.filter(
          (u) => !u.lockedUntil || u.lockedUntil <= agora
        );

        // Aceita a senha como digitada e, como fallback, só os dígitos —
        // a senha inicial é o CPF, que muitos digitam com máscara
        const digits = password.replace(/\D/g, "");
        const comSenha: typeof livres = [];
        for (const u of livres) {
          let valid = await bcrypt.compare(password.trim(), u.passwordHash);
          if (!valid && digits) {
            valid = await bcrypt.compare(digits, u.passwordHash);
          }
          if (valid) comSenha.push(u);
        }

        if (comSenha.length !== 1) {
          if (comSenha.length === 0) {
            // senha errada: conta a falha em todas as contas não bloqueadas
            for (const u of livres) {
              const attempts = u.failedLoginAttempts + 1;
              await prisma.user.update({
                where: { id: u.id },
                data: {
                  failedLoginAttempts: attempts,
                  lockedUntil:
                    attempts >= MAX_LOGIN_ATTEMPTS
                      ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
                      : null,
                },
              });
            }
          }
          // 2+ contas com a mesma senha e sem loja escolhida: a página de
          // login intercepta esse caso ANTES do signIn e pede a loja
          return null;
        }
        const user = comSenha[0];

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
