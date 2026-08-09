import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { permitir, regraPara } from "@/lib/rate-limit";

const { auth } = NextAuth(authConfig);

// Middleware sem Prisma (Edge) — valida o JWT via callback `authorized` e
// aplica rate limit por IP nas rotas públicas (tokens adivinháveis por
// força bruta / scraping): /checkin, /convite, /candidato, /verificar,
// /esqueci-senha.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (regraPara(pathname)) {
    // Atrás do nginx: o primeiro IP do X-Forwarded-For é o do cliente
    const ip =
      req.headers.get("x-real-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "desconhecido";
    if (!permitir(ip, pathname, req.method)) {
      return new NextResponse(
        "Muitas tentativas. Aguarde um minuto e tente novamente.",
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg)$).*)"],
};
