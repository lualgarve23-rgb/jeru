import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { oauthClient, isOAuthAppConfigured } from "@/lib/google-drive";

// Inicia o fluxo OAuth para conectar a conta Google da Loja ao Drive.
export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL ?? req.url;
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !["VENERAVEL_MESTRE", "SECRETARIO"].includes(role!)) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }
  if (!isOAuthAppConfigured()) {
    return NextResponse.redirect(
      new URL("/dashboard/loja?erro=oauth-nao-configurado", baseUrl)
    );
  }

  const redirectUri = new URL("/api/google/callback", baseUrl).toString();
  const url = oauthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // garante refresh_token
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });
  return NextResponse.redirect(url);
}
