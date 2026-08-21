import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isGovbrConfigured, govbrAuthorizeUrl } from "@/lib/govbr";
import { ordemAssinaturaAtestado } from "@/lib/atestado";

// Início do fluxo de assinatura gov.br de uma ata: valida a elegibilidade do
// assinante, grava o state em cookie e redireciona ao login gov.br.
export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL ?? req.url;
  const session = await auth();
  const role = session?.user?.role;
  // TESOUREIRO só assina Atestado de Regularidade; nas atas segue VM/Secretário
  if (
    !session?.user ||
    !["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO"].includes(role!)
  ) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  // Assinatura gov.br de um Atestado de Regularidade (mesmo OAuth das atas)
  const atestadoId = req.nextUrl.searchParams.get("atestado");
  if (atestadoId) {
    const backUrl = new URL("/secretaria/atestados", baseUrl);
    if (!isGovbrConfigured()) {
      backUrl.searchParams.set("govbr", "nao-configurado");
      return NextResponse.redirect(backUrl);
    }
    const atestado = await prisma.atestadoRegularidade.findUnique({
      where: { id: atestadoId, lodgeId: session.user.lodgeId },
    });
    if (!atestado || atestado.status !== "SOLICITADO") {
      backUrl.searchParams.set("govbr", "falhou");
      return NextResponse.redirect(backUrl);
    }
    const ordem = ordemAssinaturaAtestado(role!, atestado);
    if (ordem.jaAssinou) {
      backUrl.searchParams.set("govbr", "ja-assinou");
      return NextResponse.redirect(backUrl);
    }
    if (ordem.aguardando) {
      backUrl.searchParams.set("govbr", "ordem");
      return NextResponse.redirect(backUrl);
    }
    const state = randomUUID();
    const res = NextResponse.redirect(govbrAuthorizeUrl(state));
    res.cookies.set("govbr_oauth", JSON.stringify({ state, atestadoId }), {
      httpOnly: true,
      secure: baseUrl.startsWith("https"),
      sameSite: "lax",
      maxAge: 600,
      path: "/api/govbr",
    });
    return res;
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
  if (
    !ata ||
    ata.status === "RASCUNHO" ||
    ata.status === "EM_VALIDACAO" ||
    !ata.govbrSolicitado
  ) {
    ataUrl.searchParams.set("govbr", "ata-nao-assinada");
    return NextResponse.redirect(ataUrl);
  }

  // Fluxo exclusivo: o VM e o Secretário assinam direto no gov.br, uma vez cada
  const isMaster = role === "VENERAVEL_MESTRE";
  const isSec = role === "SECRETARIO";
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
