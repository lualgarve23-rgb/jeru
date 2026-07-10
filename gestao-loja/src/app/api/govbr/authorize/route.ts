import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isGovbrConfigured, govbrAuthorizeUrl } from "@/lib/govbr";

// Início do fluxo de assinatura gov.br de uma ata: valida a elegibilidade do
// assinante, grava o state em cookie e redireciona ao login gov.br.
export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL ?? req.url;
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !["VENERAVEL_MESTRE", "SECRETARIO"].includes(role!)) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  const ataId = req.nextUrl.searchParams.get("ata");
  if (!ataId) {
    return NextResponse.redirect(new URL("/secretaria/atas", baseUrl));
  }
  const ataUrl = new URL(`/secretaria/atas/${ataId}`, baseUrl);

  if (!isGovbrConfigured()) {
    ataUrl.searchParams.set("govbr", "nao-configurado");
    return NextResponse.redirect(ataUrl);
  }

  const ata = await prisma.ata.findUnique({
    where: { id: ataId, lodgeId: session.user.lodgeId },
  });
  if (!ata || ata.status !== "ASSINADA") {
    ataUrl.searchParams.set("govbr", "ata-nao-assinada");
    return NextResponse.redirect(ataUrl);
  }

  // Só quem assinou internamente assina no gov.br, uma vez cada
  const isMaster =
    role === "VENERAVEL_MESTRE" && ata.signedByMasterId === session.user.id;
  const isSec =
    role === "SECRETARIO" && ata.signedBySecId === session.user.id;
  if (!isMaster && !isSec) {
    ataUrl.searchParams.set("govbr", "nao-assinante");
    return NextResponse.redirect(ataUrl);
  }
  if ((isMaster && ata.govbrMasterAt) || (isSec && ata.govbrSecAt)) {
    ataUrl.searchParams.set("govbr", "ja-assinou");
    return NextResponse.redirect(ataUrl);
  }

  const state = randomUUID();
  const res = NextResponse.redirect(govbrAuthorizeUrl(state));
  res.cookies.set("govbr_oauth", JSON.stringify({ state, ataId }), {
    httpOnly: true,
    secure: baseUrl.startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/govbr",
  });
  return res;
}
