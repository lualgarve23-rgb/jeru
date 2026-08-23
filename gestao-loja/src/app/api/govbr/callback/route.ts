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
import {
  ordemAssinaturaQuitte,
  camposAssinaturaQuitte,
  cargoAssinanteQuitte,
  bloqueioAssinaturaQuitte,
  arquivarQuitteNoDrive,
} from "@/lib/quitte";
import {
  estadoProcesso,
  cargosProcessoDoUsuario,
  cargoLabel,
  concluirProcessoNaPrancha,
} from "@/lib/processos";
import { arquivarVersaoFinalNoDrive } from "@/lib/google-drive";
import { arquivarAtestadoNoDrive } from "@/app/(app)/secretaria/_actions/atestados";

// Callback do OAuth gov.br: troca o code pelo token da sessão de assinatura,
// confere que a conta gov.br é do próprio assinante (CPF) e embute a
// assinatura PKCS#7 do ITI no PDF da ata (PAdES, incremental).
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

  const cookie = req.cookies.get("govbr_oauth")?.value;
  let ataId: string | null = null;
  let atestadoId: string | null = null;
  let quitteId: string | null = null;
  let processoId: string | null = null;
  try {
    const parsed = JSON.parse(cookie ?? "") as {
      state: string;
      ataId?: string;
      atestadoId?: string;
      quitteId?: string;
      processoId?: string;
    };
    if (parsed.state === req.nextUrl.searchParams.get("state")) {
      ataId = parsed.ataId ?? null;
      atestadoId = parsed.atestadoId ?? null;
      quitteId = parsed.quitteId ?? null;
      processoId = parsed.processoId ?? null;
    }
  } catch {
    // cookie ausente/ilegível — tratado abaixo
  }

  // ── Atestado de Regularidade ──
  if (atestadoId) {
    if (!cargoFiscal) return NextResponse.redirect(new URL("/dashboard", baseUrl));
    return assinarAtestado(req, baseUrl, session.user, role!, atestadoId);
  }

  // ── Quitte Placet ──
  if (quitteId) {
    if (!cargoFiscal) return NextResponse.redirect(new URL("/dashboard", baseUrl));
    return assinarQuitte(req, baseUrl, session.user, role!, quitteId);
  }

  // ── Documento da seção Processos ──
  if (processoId) {
    return assinarProcesso(req, baseUrl, session.user, processoId);
  }

  if (!cargoFiscal) return NextResponse.redirect(new URL("/dashboard", baseUrl));
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
    if (!isMaster) {
      const r = await arquivarVersaoFinalNoDrive({
        lodgeId: ata.lodgeId,
        uploadedById: session.user.id,
        fileName: `ata-${ata.number}-assinada-govbr.pdf`,
        title: `Ata nº ${ata.number} (assinada gov.br)`,
        type: "ATA_ESCANEADA",
        pdf: signed,
        substituiDriveFileId: ata.driveFileId,
      });
      if (r.driveFileId) {
        await prisma.ata.update({
          where: { id: ataId, lodgeId: session.user.lodgeId },
          data: { driveFileId: r.driveFileId },
        });
      } else console.warn("govbr callback (ata) drive:", r.aviso);
    }
  } catch (e) {
    console.error("govbr callback:", e);
    return fail("falhou");
  }

  ataUrl.searchParams.set("govbr", "ok");
  const res = NextResponse.redirect(ataUrl);
  res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
  return res;
}

// Assinatura gov.br de um documento da seção Processos: cadeia ordenada de
// cargos (VM sempre o último); a PKCS#7 do ITI entra incrementalmente no PDF
// e a última assinatura conclui o processo (e devolve o PDF à prancha de
// origem, quando houver).
async function assinarProcesso(
  req: NextRequest,
  baseUrl: string,
  sessionUser: { id: string; lodgeId: string; role: string },
  processoId: string
) {
  const backUrl = new URL("/secretaria/processos", baseUrl);
  const fail = (motivo: string) => {
    backUrl.searchParams.set("govbr", motivo);
    const res = NextResponse.redirect(backUrl);
    res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail("negado");

  const doc = await prisma.processoDocumento.findUnique({
    where: { id: processoId, lodgeId: sessionUser.lodgeId },
    include: { assinantes: true },
  });
  if (!doc || doc.status === "ASSINADO") return fail("falhou");
  const estado = estadoProcesso(
    await cargosProcessoDoUsuario(sessionUser),
    doc.assinantes
  );
  if (!estado.souAssinante) return fail("nao-assinante");
  if (estado.jaAssinou) return fail("ja-assinou");
  if (!estado.minhaVez) return fail("ordem");

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

    const base = doc.govbrPdf ?? doc.arquivo;
    const signed = await assinarPdfComGovbr(Buffer.from(base), token, {
      name: user.name,
      reason: `Assinatura gov.br — ${cargoLabel(estado.cargo!)}: ${user.name}`,
    });

    const meu = doc.assinantes.find((a) => a.cargo === estado.cargo)!;
    await prisma.$transaction([
      prisma.processoAssinante.update({
        where: { id: meu.id },
        data: { signedById: sessionUser.id, signedAt: new Date() },
      }),
      prisma.processoDocumento.update({
        where: { id: processoId, lodgeId: sessionUser.lodgeId },
        data: {
          govbrPdf: new Uint8Array(signed),
          ...(estado.ultimaAssinatura ? { status: "ASSINADO" as const } : {}),
        },
      }),
    ]);
    if (estado.ultimaAssinatura) {
      const aviso = await concluirProcessoNaPrancha(
        processoId,
        sessionUser.lodgeId,
        sessionUser.id
      );
      if (aviso) console.warn("govbr callback (processo) drive:", aviso);
    }
  } catch (e) {
    console.error("govbr callback (processo):", e);
    return fail("falhou");
  }

  backUrl.searchParams.set("govbr", "ok");
  const res = NextResponse.redirect(backUrl);
  res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
  return res;
}

// Assinatura gov.br do Quitte Placet: Secretário primeiro, Venerável Mestre
// por último. A PKCS#7 do ITI é embutida incrementalmente no Form. 122 (PDF)
// anexado ao processo; a segunda assinatura aprova o placet.
async function assinarQuitte(
  req: NextRequest,
  baseUrl: string,
  sessionUser: { id: string; lodgeId: string },
  role: string,
  quitteId: string
) {
  const backUrl = new URL("/secretaria/processos", baseUrl);
  const fail = (motivo: string) => {
    backUrl.searchParams.set("govbr", motivo);
    const res = NextResponse.redirect(backUrl);
    res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
    return res;
  };

  if (!["VENERAVEL_MESTRE", "SECRETARIO"].includes(role)) {
    return fail("nao-assinante");
  }
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail("negado");

  const placet = await prisma.quittePlacet.findUnique({
    where: { id: quitteId, lodgeId: sessionUser.lodgeId },
    include: { user: { select: { name: true } } },
  });
  if (!placet) return fail("falhou");
  if (bloqueioAssinaturaQuitte(placet)) return fail("bloqueado");
  const ordem = ordemAssinaturaQuitte(role, placet);
  if (ordem.jaAssinou) return fail("ja-assinou");
  if (ordem.aguardando) return fail("ordem");

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

    const base = placet.govbrPdf ?? placet.formularioArquivo!;
    const cargo = cargoAssinanteQuitte(role);
    const signed = await assinarPdfComGovbr(Buffer.from(base), token, {
      name: user.name,
      reason: `Assinatura gov.br — ${cargo}: ${user.name}`,
    });

    await prisma.quittePlacet.update({
      where: { id: quitteId, lodgeId: sessionUser.lodgeId },
      data: {
        govbrPdf: new Uint8Array(signed),
        ...camposAssinaturaQuitte(role, sessionUser.id),
        status: ordem.ultimaAssinatura
          ? ("APROVADO" as const)
          : ("EM_ANALISE" as const),
      },
    });
    if (ordem.ultimaAssinatura) {
      const aviso = await arquivarQuitteNoDrive(
        sessionUser.lodgeId,
        sessionUser.id,
        quitteId,
        placet.user.name,
        signed
      );
      if (aviso) console.warn("govbr callback (quitte) drive:", aviso);
    }
  } catch (e) {
    console.error("govbr callback (quitte):", e);
    return fail("falhou");
  }

  backUrl.searchParams.set("govbr", "ok");
  const res = NextResponse.redirect(backUrl);
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
  const backUrl = new URL("/secretaria/processos", baseUrl);
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
    include: { user: { select: { name: true } } },
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
      if (ordem.ultimaAssinatura) {
        const aviso = await arquivarAtestadoNoDrive(
          sessionUser.lodgeId,
          sessionUser.id,
          atestadoId,
          atestado.user.name,
          signed
        );
        if (aviso) console.warn("govbr callback (atestado) drive:", aviso);
      }
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
