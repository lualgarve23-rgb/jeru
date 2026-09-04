import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { oauthClient, isOAuthAppConfigured } from "@/lib/google-drive";

// Inicia o fluxo OAuth para conectar uma conta Google ao Drive.
// Sem parâmetros: conta da Loja (Venerável/Secretário). Com ?destino=platform:
// conta do super admin para o backup da plataforma (/admin).
//
// Anti-CSRF: o `state` é aleatório e fica num cookie httpOnly (com o destino
// dentro); o callback só aceita o code se o state devolvido pelo Google for
// idêntico ao do cookie — mesmo padrão de /api/govbr/authorize.
const GOOGLE_OAUTH_COOKIE = "google_oauth";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL ?? req.url;
  const session = await auth();
  const role = session?.user?.role;
  const platform = req.nextUrl.searchParams.get("destino") === "platform";
  const autorizado = platform
    ? role === "SUPER_ADMIN"
    : ["VENERAVEL_MESTRE", "SECRETARIO"].includes(role!);
  if (!session?.user || !autorizado) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }
  if (!isOAuthAppConfigured()) {
    const volta = platform ? "/admin" : "/dashboard/loja";
    return NextResponse.redirect(
      new URL(`${volta}?erro=oauth-nao-configurado`, baseUrl)
    );
  }

  const state = randomBytes(32).toString("base64url");
  const redirectUri = new URL("/api/google/callback", baseUrl).toString();
  const url = oauthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // garante refresh_token
    state,
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });
  const res = NextResponse.redirect(url);
  res.cookies.set(
    GOOGLE_OAUTH_COOKIE,
    JSON.stringify({ state, destino: platform ? "platform" : "lodge" }),
    {
      httpOnly: true,
      secure: baseUrl.startsWith("https"),
      sameSite: "lax",
      maxAge: 600,
      path: "/api/google",
    }
  );
  return res;
}
