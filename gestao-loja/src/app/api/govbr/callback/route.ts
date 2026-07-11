import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  govbrExchangeCode,
  govbrCpfFromToken,
  assinarPdfComGovbr,
} from "@/lib/govbr";
import { gerarPdfAtaAssinada } from "@/lib/ata-final";

// Callback do OAuth gov.br: troca o code pelo token da sessão de assinatura,
// confere que a conta gov.br é do próprio assinante (CPF) e embute a
// assinatura PKCS#7 do ITI no PDF da ata (PAdES, incremental).
export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_URL ?? req.url;
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !["VENERAVEL_MESTRE", "SECRETARIO"].includes(role!)) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  const cookie = req.cookies.get("govbr_oauth")?.value;
  let ataId: string | null = null;
  try {
    const parsed = JSON.parse(cookie ?? "") as { state: string; ataId: string };
    if (parsed.state === req.nextUrl.searchParams.get("state")) {
      ataId = parsed.ataId;
    }
  } catch {
    // cookie ausente/ilegível — tratado abaixo
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
  if (!ata || ata.status !== "ASSINADA") return fail("ata-nao-assinada");

  const isMaster =
    role === "VENERAVEL_MESTRE" && ata.signedByMasterId === session.user.id;
  const isSec =
    role === "SECRETARIO" && ata.signedBySecId === session.user.id;
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
        ...(isMaster
          ? { govbrMasterAt: new Date() }
          : { govbrSecAt: new Date() }),
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
