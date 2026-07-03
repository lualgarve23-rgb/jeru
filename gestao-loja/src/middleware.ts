import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware sem Prisma (Edge) — só valida o JWT via callback `authorized`.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg)$).*)"],
};
