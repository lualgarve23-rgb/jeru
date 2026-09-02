import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isGovbrConfigured, govbrAuthorizeUrl } from "@/lib/govbr";
import { ordemAssinaturaAtestado } from "@/lib/atestado";
import { ordemAssinaturaQuitte, bloqueioAssinaturaQuitte } from "@/lib/quitte";
import { estadoProcesso, cargosProcessoDoUsuario } from "@/lib/processos";
import {
  ordemAssinaturaAfastamento,
  bloqueioAssinaturaAfastamento,
} from "@/lib/afastamento";

// Início do fluxo de assinatura gov.br de uma ata: valida a elegibilidade do
// assinante, grava o state em cookie e redireciona ao login gov.br.
export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL ?? req.url;
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }
  // TESOUREIRO só assina Atestado de Regularidade; nas atas segue VM/Secretário.
  // Os documentos da seção Processos têm cadeia própria (pode incluir Orador e
  // Vigilantes, pelo cargo do rito) — o gate deles é o estadoProcesso.
  const cargoFiscal = ["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO"].includes(role!);

  // Assinatura gov.br de um Atestado de Regularidade (mesmo OAuth das atas)
  const atestadoId = req.nextUrl.searchParams.get("atestado");
  if (atestadoId) {
    if (!cargoFiscal) return NextResponse.redirect(new URL("/dashboard", baseUrl));
    const backUrl = new URL("/secretaria/processos", baseUrl);
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

  // Assinatura gov.br de um documento da seção Processos — cadeia ordenada
  // de cargos definida no processo, com o VM sempre por último
  const processoId = req.nextUrl.searchParams.get("processo");
  if (processoId) {
    const backUrl = new URL("/secretaria/processos", baseUrl);
    const back = (motivo: string) => {
      backUrl.searchParams.set("govbr", motivo);
      return NextResponse.redirect(backUrl);
    };
    if (!isGovbrConfigured()) return back("nao-configurado");
    const doc = await prisma.processoDocumento.findUnique({
      where: { id: processoId, lodgeId: session.user.lodgeId },
      include: { assinantes: true },
    });
    if (!doc || doc.status === "ASSINADO") return back("falhou");
    const estado = estadoProcesso(
      await cargosProcessoDoUsuario(session.user),
      doc.assinantes
    );
    if (!estado.souAssinante) return back("nao-assinante");
    if (estado.jaAssinou) return back("ja-assinou");
    if (!estado.minhaVez) return back("ordem");
    const state = randomUUID();
    const res = NextResponse.redirect(govbrAuthorizeUrl(state));
    res.cookies.set("govbr_oauth", JSON.stringify({ state, processoId }), {
      httpOnly: true,
      secure: baseUrl.startsWith("https"),
      sameSite: "lax",
      maxAge: 600,
      path: "/api/govbr",
    });
    return res;
  }

  // Assinatura gov.br de um Quitte Placet — Secretário primeiro, VM por último
  const quitteId = req.nextUrl.searchParams.get("quitte");
  if (quitteId) {
    if (!cargoFiscal) return NextResponse.redirect(new URL("/dashboard", baseUrl));
    const backUrl = new URL("/secretaria/processos", baseUrl);
    const back = (motivo: string) => {
      backUrl.searchParams.set("govbr", motivo);
      return NextResponse.redirect(backUrl);
    };
    if (!["VENERAVEL_MESTRE", "SECRETARIO"].includes(role!)) {
      return back("nao-assinante");
    }
    if (!isGovbrConfigured()) return back("nao-configurado");
    const placet = await prisma.quittePlacet.findUnique({
      where: { id: quitteId, lodgeId: session.user.lodgeId },
    });
    if (!placet) return back("falhou");
    if (bloqueioAssinaturaQuitte(placet)) return back("bloqueado");
    const ordem = ordemAssinaturaQuitte(role!, placet);
    if (ordem.jaAssinou) return back("ja-assinou");
    if (ordem.aguardando) return back("ordem");
    const state = randomUUID();
    const res = NextResponse.redirect(govbrAuthorizeUrl(state));
    res.cookies.set("govbr_oauth", JSON.stringify({ state, quitteId }), {
      httpOnly: true,
      secure: baseUrl.startsWith("https"),
      sameSite: "lax",
      maxAge: 600,
      path: "/api/govbr",
    });
    return res;
  }

  // Pedido de Afastamento (Form. 116): o REQUERIMENTO é assinado pelo próprio
  // irmão (dono do pedido, qualquer nível); o Form. 116 pelo Secretário e, por
  // último, pelo VM.
  const afastamentoId = req.nextUrl.searchParams.get("afastamento");
  if (afastamentoId) {
    const pedido = await prisma.pedidoAfastamento.findUnique({
      where: { id: afastamentoId, lodgeId: session.user.lodgeId },
    });
    const souDono = pedido?.userId === session.user.id;
    const backUrl = new URL(
      souDono && pedido?.status === "AGUARDANDO_OBREIRO"
        ? "/solicitacoes/afastamento"
        : "/secretaria/processos",
      baseUrl
    );
    const back = (motivo: string) => {
      backUrl.searchParams.set("govbr", motivo);
      return NextResponse.redirect(backUrl);
    };
    if (!pedido) return back("falhou");
    if (!isGovbrConfigured()) return back("nao-configurado");
    if (pedido.status === "AGUARDANDO_OBREIRO") {
      if (!souDono) return back("nao-assinante");
    } else {
      if (!["VENERAVEL_MESTRE", "SECRETARIO"].includes(role!)) return back("nao-assinante");
      if (bloqueioAssinaturaAfastamento(pedido)) return back("bloqueado");
      const ordem = ordemAssinaturaAfastamento(role!, pedido);
      if (ordem.jaAssinou) return back("ja-assinou");
      if (ordem.aguardando) return back("ordem");
    }
    const state = randomUUID();
    const res = NextResponse.redirect(govbrAuthorizeUrl(state));
    res.cookies.set("govbr_oauth", JSON.stringify({ state, afastamentoId }), {
      httpOnly: true,
      secure: baseUrl.startsWith("https"),
      sameSite: "lax",
      maxAge: 600,
      path: "/api/govbr",
    });
    return res;
  }

  const ataId = req.nextUrl.searchParams.get("ata");
  if (!cargoFiscal) return NextResponse.redirect(new URL("/dashboard", baseUrl));
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
