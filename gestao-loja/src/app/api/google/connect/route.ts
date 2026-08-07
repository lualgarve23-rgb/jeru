import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { oauthClient, isOAuthAppConfigured } from "@/lib/google-drive";

// Inicia o fluxo OAuth para conectar uma conta Google ao Drive.
// Sem parâmetros: conta da Loja (Venerável/Secretário). Com ?destino=platform:
// conta do super admin para o backup da plataforma (/admin).
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

  const redirectUri = new URL("/api/google/callback", baseUrl).toString();
  const url = oauthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // garante refresh_token
    state: platform ? "platform" : "lodge",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });
  return NextResponse.redirect(url);
}
