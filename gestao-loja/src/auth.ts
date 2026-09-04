import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { contasPorCim } from "@/lib/contas";
import { auditar } from "@/lib/audit";
import { sincronizarLojaSeAntiga } from "@/lib/apos-evento";

// Anti-força-bruta no login (loja.md §segurança)
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// A sessão é JWT: cargo/grau/situação ficariam congelados até o logout. A
// cada REFRESH_MS o token é conferido com o banco (lado Node — o middleware
// usa só o auth.config, sem Prisma).
const REFRESH_MS = 5 * 60_000;

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
  events: {
    // Login de qualquer perfil: varredura da central da loja (inadimplência +
    // notificações), com throttle de 10 min (Lodge.notificacoesSyncAt) —
    // o sino do irmão já abre atualizado. Fire-and-forget: não atrasa o login.
    signIn({ user }) {
      const lodgeId = (user as { lodgeId?: string }).lodgeId;
      if (lodgeId) void sincronizarLojaSeAntiga(lodgeId);
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = authConfig.callbacks.jwt(params);
      if (params.user) return token; // login agora: acabou de vir do banco
      if (!token.id) return token;
      const idade = Date.now() - (token.refreshedAt ?? 0);
      if (idade < REFRESH_MS && !token.invalid) return token;
      try {
        const u = await prisma.user.findUnique({
          where: { id: token.id },
          select: {
            currentRole: true,
            degree: true,
            status: true,
            lodgeId: true,
            mustChangePassword: true,
            lodge: { select: { name: true } },
          },
        });
        if (!u || u.status === "EX_MEMBRO") {
          token.invalid = true;
          token.refreshedAt = Date.now();
          return token;
        }
        token.role = u.currentRole;
        token.degree = u.degree;
        token.status = u.status;
        token.lodgeId = u.lodgeId;
        token.lodgeName = u.lodge.name;
        token.mustChangePassword = u.mustChangePassword;
        token.invalid = false;
        token.refreshedAt = Date.now();
      } catch (e) {
        // banco indisponível: mantém o token como está e tenta na próxima
        console.error("[auth] falha ao reler o usuário da sessão", e);
      }
      return token;
    },
  },
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

        // A senha vale exatamente como digitada (sem fallback de "só
        // dígitos", removido na análise de segurança 2026-08 — a senha
        // inicial não é mais o CPF)
        const comSenha: typeof livres = [];
        for (const u of livres) {
          if (await bcrypt.compare(password.trim(), u.passwordHash)) {
            comSenha.push(u);
          }
        }

        if (comSenha.length !== 1) {
          if (comSenha.length === 0) {
            // senha errada: conta a falha em todas as contas não bloqueadas
            for (const u of livres) {
              const attempts = u.failedLoginAttempts + 1;
              const bloquear = attempts >= MAX_LOGIN_ATTEMPTS;
              await prisma.user.update({
                where: { id: u.id },
                data: {
                  failedLoginAttempts: attempts,
                  lockedUntil: bloquear
                    ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
                    : null,
                },
              });
              if (bloquear) {
                await auditar({
                  lodgeId: u.lodgeId,
                  ator: { id: u.id, name: u.name },
                  acao: "login.bloqueio",
                  entidade: "User",
                  entidadeId: u.id,
                  detalhes: { tentativas: attempts, minutos: LOCKOUT_MINUTES },
                });
              }
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

        await auditar({
          lodgeId: user.lodgeId,
          ator: { id: user.id, name: user.name },
          acao: "login.sucesso",
          entidade: "User",
          entidadeId: user.id,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          cim: user.cim,
          lodgeId: user.lodgeId,
          lodgeName: user.lodge.name,
          role: user.currentRole,
          degree: user.degree,
          status: user.status,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});
