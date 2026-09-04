import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { google } from "googleapis";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { oauthClient } from "@/lib/google-drive";
import { sealSecret } from "@/lib/secrets";
import { auditar } from "@/lib/audit";

const GOOGLE_OAUTH_COOKIE = "google_oauth";

function stateConfere(a: string, b: string) {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Callback do OAuth: guarda o refresh token na Loja do usuário logado, ou —
// quando o destino guardado no cookie é "platform" — na configuração da
// plataforma (backup do super admin). O `state` devolvido pelo Google precisa
// bater com o do cookie gravado em /api/google/connect (anti-CSRF); o cookie
// é apagado em qualquer saída.
export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL ?? req.url;
  const session = await auth();
  const role = session?.user?.role;

  const cookieRaw = req.cookies.get(GOOGLE_OAUTH_COOKIE)?.value;
  let esperado: { state: string; destino: "platform" | "lodge" } | null = null;
  try {
    if (cookieRaw) {
      const parsed = JSON.parse(cookieRaw) as { state?: unknown; destino?: unknown };
      if (
        typeof parsed.state === "string" &&
        (parsed.destino === "platform" || parsed.destino === "lodge")
      ) {
        esperado = { state: parsed.state, destino: parsed.destino };
      }
    }
  } catch {
    esperado = null;
  }
  const platform = esperado?.destino === "platform";
  const volta = platform ? "/admin" : "/dashboard/loja";
  const sair = (destino: string) => {
    const res = NextResponse.redirect(new URL(destino, baseUrl));
    res.cookies.set(GOOGLE_OAUTH_COOKIE, "", { maxAge: 0, path: "/api/google" });
    return res;
  };

  const autorizado = platform
    ? role === "SUPER_ADMIN"
    : ["VENERAVEL_MESTRE", "SECRETARIO"].includes(role!);
  if (!session?.user || !autorizado) {
    return sair("/login");
  }

  const stateRecebido = req.nextUrl.searchParams.get("state") ?? "";
  if (!esperado || !stateRecebido || !stateConfere(stateRecebido, esperado.state)) {
    console.warn("[google/callback] state divergente ou cookie ausente");
    return sair(`${volta}?erro=google-state`);
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return sair(`${volta}?erro=google-negado`);
  }

  let email: string | null = null;
  try {
    const redirectUri = new URL("/api/google/callback", baseUrl).toString();
    const client = oauthClient(redirectUri);
    const { tokens } = await client.getToken(code);

    if (tokens.access_token) {
      client.setCredentials(tokens);
      const info = await google
        .oauth2({ version: "v2", auth: client })
        .userinfo.get();
      email = info.data.email ?? null;
    }

    // Permissão do Drive é opcional na tela do Google (caixinha) — sem ela a
    // conexão fica inútil (uploads falham com "insufficient scopes").
    if (!tokens.scope?.includes("https://www.googleapis.com/auth/drive.file")) {
      return sair(`${volta}?erro=sem-permissao-drive`);
    }

    if (!tokens.refresh_token) {
      return sair(`${volta}?erro=sem-refresh-token`);
    }

    if (platform) {
      const sealed = sealSecret(tokens.refresh_token);
      await prisma.platformConfig.upsert({
        where: { id: "platform" },
        create: {
          id: "platform",
          backupGoogleRefreshToken: sealed,
          backupGoogleEmail: email,
        },
        update: {
          backupGoogleRefreshToken: sealed,
          backupGoogleEmail: email,
          backupDriveFolderId: null, // nova conta → recriar a pasta de backups
        },
      });
    } else {
      await prisma.lodge.update({
        where: { id: session.user.lodgeId },
        data: {
          googleRefreshToken: sealSecret(tokens.refresh_token),
          googleEmail: email,
          driveFolderId: null, // nova conta → recriar a pasta da Loja
        },
      });
    }
  } catch (err) {
    console.error("[google/callback] falha ao conectar conta Google:", err);
    return sair(`${volta}?erro=google-falhou`);
  }

  await auditar({
    lodgeId: platform ? null : session.user.lodgeId,
    ator: { id: session.user.id, name: session.user.name },
    acao: platform ? "admin.conectar-google" : "loja.conectar-google",
    entidade: platform ? "PlatformConfig" : "Lodge",
    entidadeId: platform ? "platform" : session.user.lodgeId,
    detalhes: { email },
  });
  return sair(`${volta}?ok=1`);
}
