import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { oauthClient } from "@/lib/google-drive";

// Callback do OAuth: guarda o refresh token na Loja do usuário logado.
export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL ?? req.url;
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !["VENERAVEL_MESTRE", "SECRETARIO"].includes(role!)) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL("/dashboard/loja?erro=google-negado", baseUrl)
    );
  }

  try {
    const redirectUri = new URL("/api/google/callback", baseUrl).toString();
    const client = oauthClient(redirectUri);
    const { tokens } = await client.getToken(code);

    let email: string | null = null;
    if (tokens.access_token) {
      client.setCredentials(tokens);
      const info = await google
        .oauth2({ version: "v2", auth: client })
        .userinfo.get();
      email = info.data.email ?? null;
    }

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/dashboard/loja?erro=sem-refresh-token", baseUrl)
      );
    }

    await prisma.lodge.update({
      where: { id: session.user.lodgeId },
      data: {
        googleRefreshToken: tokens.refresh_token,
        googleEmail: email,
        driveFolderId: null, // nova conta → recriar a pasta da Loja
      },
    });
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/loja?erro=google-falhou", baseUrl)
    );
  }

  return NextResponse.redirect(new URL("/dashboard/loja?ok=1", baseUrl));
}
