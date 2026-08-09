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
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname === "/login" ||
        pathname === "/esqueci-senha" || // recuperação de senha (2FA por e-mail)
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/checkin/") || // check-in de visitantes via QR
        pathname.startsWith("/convite/") || // RSVP público do convite de sessão
        pathname.startsWith("/candidato/") || // formulários de indicação do candidato (token)
        pathname.startsWith("/verificar/") || // verificação pública da carteirinha (QR)
        pathname.startsWith("/api/webhooks/") || // PSP autentica por segredo próprio
        pathname.startsWith("/api/cron/"); // cron autentica por x-cron-secret
      if (isPublic) return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.lodgeId = user.lodgeId;
        token.lodgeName = user.lodgeName;
        token.role = user.role;
        token.degree = user.degree;
        token.cim = user.cim;
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
      return session;
    },
  },
  providers: [], // preenchido em auth.ts
} satisfies NextAuthConfig;
