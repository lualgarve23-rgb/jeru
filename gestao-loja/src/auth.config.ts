import type { NextAuthConfig } from "next-auth";

const isProd = process.env.NODE_ENV === "production";

// Config base sem Prisma — usada também no middleware (Edge runtime).
export const authConfig = {
  trustHost: true,
  // Em produção: cookies só via HTTPS (Secure) + SameSite=lax
  useSecureCookies: isProd,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Sessão expira em 8h de inatividade relativa (maxAge absoluto)
    maxAge: 8 * 60 * 60,
  },
  cookies: isProd
    ? {
        sessionToken: {
          name: "__Secure-authjs.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
          },
        },
      }
    : undefined,
  callbacks: {
    authorized({ auth, request }) {
      // `invalid` é marcado pelo jwt do lado Node (auth.ts) quando a conta
      // deixou de existir ou virou EX_MEMBRO — o cookie passa a valer nada.
      const isLoggedIn = !!auth?.user && !auth.user.invalid;
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname === "/login" ||
        pathname === "/esqueci-senha" || // recuperação de senha (2FA por e-mail)
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/checkin/") || // check-in de visitantes via QR
        pathname.startsWith("/convite/") || // RSVP público do convite de sessão
        pathname.startsWith("/candidato/") || // formulários de indicação do candidato (token)
        pathname.startsWith("/verificar/") || // verificação pública da carteirinha (QR)
        pathname.startsWith("/tour/") || // tours interativos e vídeos de demonstração (estático)
        pathname.startsWith("/api/webhooks/") || // PSP autentica por segredo próprio
        pathname.startsWith("/api/cron/"); // cron autentica por x-cron-secret
      if (isPublic) return true;
      return isLoggedIn;
    },
    // Sem Prisma (Edge): só copia os dados do login para o token. A releitura
    // periódica do banco (cargo, grau, situação, loja) fica em auth.ts.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.lodgeId = user.lodgeId;
        token.lodgeName = user.lodgeName;
        token.role = user.role;
        token.degree = user.degree;
        token.cim = user.cim;
        token.status = user.status;
        token.mustChangePassword = user.mustChangePassword;
        token.refreshedAt = Date.now();
        token.invalid = false;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.lodgeId = token.lodgeId as string;
      session.user.lodgeName = token.lodgeName as string;
      session.user.role = token.role as string;
      session.user.degree = token.degree as string;
      session.user.cim = token.cim as string;
      session.user.mustChangePassword = token.mustChangePassword;
      session.user.invalid = token.invalid === true;
      return session;
    },
  },
  providers: [], // preenchido em auth.ts
} satisfies NextAuthConfig;
