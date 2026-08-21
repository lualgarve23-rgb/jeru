import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  govbrExchangeCode,
  govbrCpfFromToken,
  assinarPdfComGovbr,
} from "@/lib/govbr";
import { gerarPdfAtaAssinada } from "@/lib/ata-final";
import {
  gerarAtestadoPdf,
  ordemAssinaturaAtestado,
  camposAssinaturaAtestado,
  cargoAssinanteAtestado,
} from "@/lib/atestado";

// Callback do OAuth gov.br: troca o code pelo token da sessão de assinatura,
// confere que a conta gov.br é do próprio assinante (CPF) e embute a
// assinatura PKCS#7 do ITI no PDF da ata (PAdES, incremental).
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

  const cookie = req.cookies.get("govbr_oauth")?.value;
  let ataId: string | null = null;
  let atestadoId: string | null = null;
  try {
    const parsed = JSON.parse(cookie ?? "") as {
      state: string;
      ataId?: string;
      atestadoId?: string;
    };
    if (parsed.state === req.nextUrl.searchParams.get("state")) {
      ataId = parsed.ataId ?? null;
      atestadoId = parsed.atestadoId ?? null;
    }
  } catch {
    // cookie ausente/ilegível — tratado abaixo
  }

  // ── Atestado de Regularidade ──
  if (atestadoId) {
    return assinarAtestado(req, baseUrl, session.user, role!, atestadoId);
  }

  if (!ataId) {
    return NextResponse.redirect(
      new URL("/secretaria/atas?govbr=sessao-expirada", baseUrl)
    );
  }

  const ataUrl = new URL(`/secretaria/atas/${ataId}`, baseUrl);
  const fail = (motivo: string) => {
    ataUrl.searchParams.set("govbr", motivo);
    const res = NextResponse.redirect(ataUrl);
    res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail("negado");

  const ata = await prisma.ata.findUnique({
    where: { id: ataId, lodgeId: session.user.lodgeId },
  });
  if (!ata || ata.status === "RASCUNHO" || ata.status === "EM_VALIDACAO") {
    return fail("ata-nao-assinada");
  }

  const isMaster = role === "VENERAVEL_MESTRE";
  const isSec = role === "SECRETARIO";
  if (!ata.govbrSolicitado) return fail("nao-encaminhada");
  if (!isMaster && !isSec) return fail("nao-assinante");
  if ((isMaster && ata.govbrMasterAt) || (isSec && ata.govbrSecAt)) {
    return fail("ja-assinou");
  }
  // Ordem de governança: o Venerável Mestre assina primeiro no gov.br
  if (isSec && !ata.govbrMasterAt) return fail("ordem");

  try {
    const token = await govbrExchangeCode(code);

    // A conta gov.br precisa ser do próprio assinante
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { cpf: true, name: true },
    });
    const govbrCpf = govbrCpfFromToken(token);
    if (govbrCpf && govbrCpf !== user.cpf.replace(/\D/g, "")) {
      return fail("cpf-divergente");
    }

    // Base: PDF já assinado via gov.br pelo outro cargo, ou o PDF final da ata
    const base =
      ata.govbrPdf ?? (await gerarPdfAtaAssinada(ataId, ata.lodgeId)).pdf;
    const cargo = isMaster ? "Venerável Mestre" : "Secretário";
    const signed = await assinarPdfComGovbr(base, token, {
      name: user.name,
      reason: `Assinatura gov.br — ${cargo}: ${user.name}`,
    });

    await prisma.ata.update({
      where: { id: ataId, lodgeId: session.user.lodgeId },
      data: {
        govbrPdf: new Uint8Array(signed),
        // A 2ª assinatura gov.br sela a ata
        ...(isMaster
          ? { govbrMasterAt: new Date() }
          : { govbrSecAt: new Date(), status: "ASSINADA" as const }),
      },
    });
  } catch (e) {
    console.error("govbr callback:", e);
    return fail("falhou");
  }

  ataUrl.searchParams.set("govbr", "ok");
  const res = NextResponse.redirect(ataUrl);
  res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
  return res;
}

// Assinatura gov.br do Atestado de Regularidade: registra a assinatura do
// cargo, regenera o PDF base com os assinantes atuais (se ainda não houver
// versão gov.br) e embute a PKCS#7 do ITI incrementalmente.
async function assinarAtestado(
  req: NextRequest,
  baseUrl: string,
  sessionUser: { id: string; lodgeId: string },
  role: string,
  atestadoId: string
) {
  const backUrl = new URL("/secretaria/atestados", baseUrl);
  const fail = (motivo: string) => {
    backUrl.searchParams.set("govbr", motivo);
    const res = NextResponse.redirect(backUrl);
    res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail("negado");

  const atestado = await prisma.atestadoRegularidade.findUnique({
    where: { id: atestadoId, lodgeId: sessionUser.lodgeId },
  });
  if (!atestado || atestado.status !== "SOLICITADO") return fail("falhou");
  const ordem = ordemAssinaturaAtestado(role, atestado);
  if (ordem.jaAssinou) return fail("ja-assinou");
  if (ordem.aguardando) return fail("ordem");

  const camposAssinatura = camposAssinaturaAtestado(role, sessionUser.id);
  try {
    const token = await govbrExchangeCode(code);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: { cpf: true, name: true },
    });
    const govbrCpf = govbrCpfFromToken(token);
    if (govbrCpf && govbrCpf !== user.cpf.replace(/\D/g, "")) {
      return fail("cpf-divergente");
    }

    // Registra a assinatura antes de gerar o PDF base, para o bloco do
    // assinante constar no documento; revertida se a PKCS#7 falhar
    await prisma.atestadoRegularidade.update({
      where: { id: atestadoId, lodgeId: sessionUser.lodgeId },
      data: camposAssinatura,
    });
    try {
      const base =
        atestado.govbrPdf ??
        (await gerarAtestadoPdf(atestadoId, sessionUser.lodgeId)).pdf;
      const cargo = cargoAssinanteAtestado(role);
      const signed = await assinarPdfComGovbr(Buffer.from(base), token, {
        name: user.name,
        reason: `Assinatura gov.br — ${cargo}: ${user.name}`,
      });
      await prisma.atestadoRegularidade.update({
        where: { id: atestadoId, lodgeId: sessionUser.lodgeId },
        data: {
          govbrPdf: new Uint8Array(signed),
          ...(ordem.ultimaAssinatura ? { status: "ASSINADO" as const } : {}),
        },
      });
    } catch (e) {
      await prisma.atestadoRegularidade.update({
        where: { id: atestadoId, lodgeId: sessionUser.lodgeId },
        data: Object.fromEntries(
          Object.keys(camposAssinatura).map((k) => [k, null])
        ),
      });
      throw e;
    }
  } catch (e) {
    console.error("govbr callback (atestado):", e);
    return fail("falhou");
  }

  backUrl.searchParams.set("govbr", "ok");
  const res = NextResponse.redirect(backUrl);
  res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
  return res;
}
