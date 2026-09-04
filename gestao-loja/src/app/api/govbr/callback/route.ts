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
  bloqueioFinanceiroAtestadoDoIrmao,
} from "@/lib/atestado";
import {
  ordemAssinaturaQuitte,
  camposAssinaturaQuitte,
  cargoAssinanteQuitte,
  bloqueioAssinaturaQuitte,
  arquivarQuitteNoDrive,
  cargoQuitteDoUsuario,
} from "@/lib/quitte";
import {
  estadoProcesso,
  cargosProcessoDoUsuario,
  cargoLabel,
  concluirProcessoNaPrancha,
} from "@/lib/processos";
import {
  ordemAssinaturaAfastamento,
  camposAssinaturaAfastamento,
  cargoAssinanteAfastamento,
  bloqueioAssinaturaAfastamento,
  arquivarAfastamentoNoDrive,
  gerarRequerimentoPdf,
} from "@/lib/afastamento";
import { auditar } from "@/lib/audit";
import { aposEventoDaLoja } from "@/lib/apos-evento";
import {
  eventoAtestado,
  eventoQuitte,
  eventoAfastamento,
  eventoProcessoConcluido,
  eventoAtaAssinada,
} from "@/lib/eventos-solicitacoes";
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
  let afastamentoId: string | null = null;
  try {
    const parsed = JSON.parse(cookie ?? "") as {
      state: string;
      ataId?: string;
      atestadoId?: string;
      quitteId?: string;
      processoId?: string;
      afastamentoId?: string;
    };
    if (parsed.state === req.nextUrl.searchParams.get("state")) {
      ataId = parsed.ataId ?? null;
      atestadoId = parsed.atestadoId ?? null;
      quitteId = parsed.quitteId ?? null;
      processoId = parsed.processoId ?? null;
      afastamentoId = parsed.afastamentoId ?? null;
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
    return assinarQuitte(req, baseUrl, session.user, role!, quitteId);
  }

  // ── Pedido de Afastamento (requerimento do irmão ou Form. 116) ──
  if (afastamentoId) {
    return assinarAfastamento(req, baseUrl, session.user, role!, afastamentoId);
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
    // Sem CPF no token não há como provar que a conta gov.br é do assinante:
    // falha fechado (nunca assina "no escuro")
    if (!govbrCpf) return fail("cpf-indisponivel");
    if (govbrCpf !== user.cpf.replace(/\D/g, "")) {
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

    // Trava otimista: só grava se ninguém alterou a ata desde a leitura
    // (outra assinatura gov.br em paralelo sobrescreveria a PKCS#7 anterior)
    const gravado = await prisma.ata.updateMany({
      where: { id: ataId, lodgeId: session.user.lodgeId, updatedAt: ata.updatedAt },
      data: {
        govbrPdf: new Uint8Array(signed),
        // A 2ª assinatura gov.br sela a ata
        ...(isMaster
          ? { govbrMasterAt: new Date() }
          : { govbrSecAt: new Date(), status: "ASSINADA" as const }),
      },
    });
    if (gravado.count === 0) return fail("concorrencia");
    await auditar({
      lodgeId: ata.lodgeId,
      ator: { id: session.user.id, name: session.user.name },
      acao: "ata.assinar-govbr",
      entidade: "Ata",
      entidadeId: ataId,
      detalhes: { via: "govbr-oauth", cargo, sela: !isMaster },
    });
    await eventoAtaAssinada(ata.lodgeId, ataId, isMaster ? "VENERAVEL_MESTRE" : "SECRETARIO");
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

  aposEventoDaLoja(session.user.lodgeId);
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
  sessionUser: { id: string; lodgeId: string; role: string; name: string },
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
    // Sem CPF no token não há como provar que a conta gov.br é do assinante:
    // falha fechado (nunca assina "no escuro")
    if (!govbrCpf) return fail("cpf-indisponivel");
    if (govbrCpf !== user.cpf.replace(/\D/g, "")) {
      return fail("cpf-divergente");
    }

    const base = doc.govbrPdf ?? doc.arquivo;
    const signed = await assinarPdfComGovbr(Buffer.from(base), token, {
      name: user.name,
      reason: `Assinatura gov.br — ${cargoLabel(estado.cargo!)}: ${user.name}`,
    });

    const meu = doc.assinantes.find((a) => a.cargo === estado.cargo)!;
    // Trava otimista no documento (updatedAt lido): duas assinaturas em
    // paralelo não podem sobrescrever a PKCS#7 uma da outra
    const gravado = await prisma.$transaction(async (tx) => {
      const r = await tx.processoDocumento.updateMany({
        where: { id: processoId, lodgeId: sessionUser.lodgeId, updatedAt: doc.updatedAt },
        data: {
          govbrPdf: new Uint8Array(signed),
          ...(estado.ultimaAssinatura ? { status: "ASSINADO" as const } : {}),
        },
      });
      if (r.count === 0) return false;
      await tx.processoAssinante.update({
        where: { id: meu.id },
        data: { signedById: sessionUser.id, signedAt: new Date() },
      });
      return true;
    });
    if (!gravado) return fail("concorrencia");
    await auditar({
      lodgeId: sessionUser.lodgeId,
      ator: { id: sessionUser.id, name: sessionUser.name },
      acao: "processo.assinar",
      entidade: "ProcessoDocumento",
      entidadeId: processoId,
      detalhes: { via: "govbr-oauth", cargo: estado.cargo, concluiu: estado.ultimaAssinatura },
    });
    if (estado.ultimaAssinatura) {
      await eventoProcessoConcluido(sessionUser.lodgeId, processoId);
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

  aposEventoDaLoja(sessionUser.lodgeId);
  backUrl.searchParams.set("govbr", "ok");
  const res = NextResponse.redirect(backUrl);
  res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
  return res;
}

// Assinatura gov.br do Quitte Placet: Secretário, Orador (cargo do rito) e
// Venerável Mestre por último. A PKCS#7 do ITI é embutida incrementalmente no
// Form. 122 (PDF) anexado ao processo; a terceira assinatura aprova o placet.
async function assinarQuitte(
  req: NextRequest,
  baseUrl: string,
  sessionUser: { id: string; lodgeId: string; name: string },
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

  const meu = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { cargoRito: true },
  });
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail("negado");

  const placet = await prisma.quittePlacet.findUnique({
    where: { id: quitteId, lodgeId: sessionUser.lodgeId },
    include: { user: { select: { name: true } } },
  });
  if (!placet) return fail("falhou");
  // Cargo da vez entre os do usuário (quem acumula dois cargos assina por ambos)
  const cargoQuitte = cargoQuitteDoUsuario(role, meu?.cargoRito, placet);
  if (!cargoQuitte) {
    return fail("nao-assinante");
  }
  if (bloqueioAssinaturaQuitte(placet)) return fail("bloqueado");
  const ordem = ordemAssinaturaQuitte(cargoQuitte, placet);
  if (ordem.jaAssinou) return fail("ja-assinou");
  if (ordem.aguardando) return fail("ordem");

  try {
    const token = await govbrExchangeCode(code);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: { cpf: true, name: true },
    });
    const govbrCpf = govbrCpfFromToken(token);
    // Sem CPF no token não há como provar que a conta gov.br é do assinante:
    // falha fechado (nunca assina "no escuro")
    if (!govbrCpf) return fail("cpf-indisponivel");
    if (govbrCpf !== user.cpf.replace(/\D/g, "")) {
      return fail("cpf-divergente");
    }

    const base = placet.govbrPdf ?? placet.formularioArquivo!;
    const cargo = cargoAssinanteQuitte(cargoQuitte);
    const signed = await assinarPdfComGovbr(Buffer.from(base), token, {
      name: user.name,
      reason: `Assinatura gov.br — ${cargo}: ${user.name}`,
    });

    // Trava otimista (updatedAt lido): outra assinatura/troca de formulário
    // em paralelo invalida esta gravação
    const gravado = await prisma.quittePlacet.updateMany({
      where: { id: quitteId, lodgeId: sessionUser.lodgeId, updatedAt: placet.updatedAt },
      data: {
        govbrPdf: new Uint8Array(signed),
        ...camposAssinaturaQuitte(cargoQuitte, sessionUser.id),
        status: ordem.ultimaAssinatura
          ? ("APROVADO" as const)
          : ("EM_ANALISE" as const),
      },
    });
    if (gravado.count === 0) return fail("concorrencia");
    await auditar({
      lodgeId: sessionUser.lodgeId,
      ator: { id: sessionUser.id, name: sessionUser.name },
      acao: "quitte.assinar",
      entidade: "QuittePlacet",
      entidadeId: quitteId,
      detalhes: { via: "govbr-oauth", cargo: cargoQuitte, aprovou: ordem.ultimaAssinatura },
    });
    await eventoQuitte(sessionUser.lodgeId, quitteId, "assinatura");
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

  aposEventoDaLoja(sessionUser.lodgeId);
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
  sessionUser: { id: string; lodgeId: string; name: string },
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
    include: { user: { select: { name: true, status: true } } },
  });
  if (!atestado || atestado.status !== "SOLICITADO") return fail("falhou");
  // Mesma regra do upload pelo portal ITI: só se atesta regularidade de
  // irmão com situação ATIVO
  if (atestado.user.status !== "ATIVO") return fail("irmao-nao-ativo");
  if (await bloqueioFinanceiroAtestadoDoIrmao(sessionUser.lodgeId, atestado.userId, atestado))
    return fail("trava-financeira");
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
    // Sem CPF no token não há como provar que a conta gov.br é do assinante:
    // falha fechado (nunca assina "no escuro")
    if (!govbrCpf) return fail("cpf-indisponivel");
    if (govbrCpf !== user.cpf.replace(/\D/g, "")) {
      return fail("cpf-divergente");
    }

    // Registra a assinatura antes de gerar o PDF base, para o bloco do
    // assinante constar no documento; revertida se a PKCS#7 falhar.
    // Condicionada à versão lida (updatedAt) — trava otimista contra outra
    // assinatura gravada em paralelo.
    const reservado = await prisma.atestadoRegularidade.updateMany({
      where: { id: atestadoId, lodgeId: sessionUser.lodgeId, updatedAt: atestado.updatedAt },
      data: camposAssinatura,
    });
    if (reservado.count === 0) return fail("concorrencia");
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
      await auditar({
        lodgeId: sessionUser.lodgeId,
        ator: { id: sessionUser.id, name: sessionUser.name },
        acao: "atestado.assinar",
        entidade: "AtestadoRegularidade",
        entidadeId: atestadoId,
        detalhes: { via: "govbr-oauth", cargo, concluiu: ordem.ultimaAssinatura },
      });
      await eventoAtestado(sessionUser.lodgeId, atestadoId);
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

  aposEventoDaLoja(sessionUser.lodgeId);
  backUrl.searchParams.set("govbr", "ok");
  const res = NextResponse.redirect(backUrl);
  res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
  return res;
}

// Assinatura gov.br do Pedido de Afastamento. Duas fases no mesmo pedido:
// (1) AGUARDANDO_OBREIRO — o PRÓPRIO irmão assina o requerimento (a conta
// gov.br precisa ser dele, conferida pelo CPF) e o pedido segue à Secretaria;
// (2) EM_ASSINATURA — Secretário e, por último, o VM assinam o Form. 116.
async function assinarAfastamento(
  req: NextRequest,
  baseUrl: string,
  sessionUser: { id: string; lodgeId: string; name: string },
  role: string,
  afastamentoId: string
) {
  const pedido = await prisma.pedidoAfastamento.findUnique({
    where: { id: afastamentoId, lodgeId: sessionUser.lodgeId },
    include: { user: { select: { name: true } } },
  });
  const souDono = pedido?.userId === sessionUser.id;
  const faseObreiro = pedido?.status === "AGUARDANDO_OBREIRO";
  const backUrl = new URL(
    souDono && faseObreiro ? "/solicitacoes/afastamento" : "/secretaria/processos",
    baseUrl
  );
  const fail = (motivo: string) => {
    backUrl.searchParams.set("govbr", motivo);
    const res = NextResponse.redirect(backUrl);
    res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
    return res;
  };
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return fail("negado");
  if (!pedido) return fail("falhou");

  const ordem = faseObreiro ? null : ordemAssinaturaAfastamento(role, pedido);
  if (faseObreiro) {
    if (!souDono) return fail("nao-assinante");
  } else {
    if (!["VENERAVEL_MESTRE", "SECRETARIO"].includes(role)) return fail("nao-assinante");
    if (bloqueioAssinaturaAfastamento(pedido)) return fail("bloqueado");
    if (ordem!.jaAssinou) return fail("ja-assinou");
    if (ordem!.aguardando) return fail("ordem");
  }

  try {
    const token = await govbrExchangeCode(code);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: { cpf: true, name: true },
    });
    const govbrCpf = govbrCpfFromToken(token);
    // Sem CPF no token não há como provar que a conta gov.br é do assinante:
    // falha fechado (nunca assina "no escuro")
    if (!govbrCpf) return fail("cpf-indisponivel");
    if (govbrCpf !== user.cpf.replace(/\D/g, "")) {
      return fail("cpf-divergente");
    }

    if (faseObreiro) {
      // Registra a data antes de gerar o PDF, para o bloco de assinatura
      // constar no requerimento; revertida se a PKCS#7 falhar
      const agora = new Date();
      await prisma.pedidoAfastamento.update({
        where: { id: afastamentoId, lodgeId: sessionUser.lodgeId },
        data: { requerimentoSignedAt: agora },
      });
      try {
        // Usa o PDF base já persistido (visualizado/baixado pelo irmão), se
        // houver, para o documento assinado ser a mesma peça que ele leu.
        const jaGerado = await prisma.pedidoAfastamento.findUnique({
          where: { id: afastamentoId },
          select: { requerimentoPdf: true, status: true },
        });
        const base =
          jaGerado?.requerimentoPdf && jaGerado.status === "AGUARDANDO_OBREIRO"
            ? Buffer.from(jaGerado.requerimentoPdf)
            : (await gerarRequerimentoPdf(afastamentoId, sessionUser.lodgeId)).pdf;
        const signed = await assinarPdfComGovbr(base, token, {
          name: user.name,
          reason: `Assinatura gov.br — Obreiro requerente: ${user.name}`,
        });
        await prisma.pedidoAfastamento.update({
          where: { id: afastamentoId, lodgeId: sessionUser.lodgeId },
          data: { requerimentoPdf: new Uint8Array(signed), status: "SOLICITADO" },
        });
      } catch (e) {
        await prisma.pedidoAfastamento.update({
          where: { id: afastamentoId, lodgeId: sessionUser.lodgeId },
          data: { requerimentoSignedAt: null },
        });
        throw e;
      }
      await auditar({
        lodgeId: sessionUser.lodgeId,
        ator: { id: sessionUser.id, name: sessionUser.name },
        acao: "afastamento.assinar-requerimento",
        entidade: "PedidoAfastamento",
        entidadeId: afastamentoId,
        detalhes: { via: "govbr-oauth" },
      });
    } else {
      const base = pedido.govbrPdf ?? pedido.formularioPdf!;
      const cargo = cargoAssinanteAfastamento(role);
      const signed = await assinarPdfComGovbr(Buffer.from(base), token, {
        name: user.name,
        reason: `Assinatura gov.br — ${cargo}: ${user.name}`,
      });
      // Trava otimista (updatedAt lido) contra assinatura paralela
      const gravado = await prisma.pedidoAfastamento.updateMany({
        where: { id: afastamentoId, lodgeId: sessionUser.lodgeId, updatedAt: pedido.updatedAt },
        data: {
          govbrPdf: new Uint8Array(signed),
          ...camposAssinaturaAfastamento(role, sessionUser.id),
          ...(ordem!.ultimaAssinatura ? { status: "ASSINADO" as const } : {}),
        },
      });
      if (gravado.count === 0) return fail("concorrencia");
      await auditar({
        lodgeId: sessionUser.lodgeId,
        ator: { id: sessionUser.id, name: sessionUser.name },
        acao: "afastamento.assinar-form116",
        entidade: "PedidoAfastamento",
        entidadeId: afastamentoId,
        detalhes: { via: "govbr-oauth", cargo, concluiu: ordem!.ultimaAssinatura },
      });
      await eventoAfastamento(sessionUser.lodgeId, afastamentoId, "assinatura");
      if (ordem!.ultimaAssinatura) {
        const aviso = await arquivarAfastamentoNoDrive(
          sessionUser.lodgeId,
          sessionUser.id,
          afastamentoId,
          pedido.user.name,
          signed
        );
        if (aviso) console.warn("govbr callback (afastamento) drive:", aviso);
      }
    }
  } catch (e) {
    console.error("govbr callback (afastamento):", e);
    return fail("falhou");
  }

  aposEventoDaLoja(sessionUser.lodgeId);
  backUrl.searchParams.set("govbr", "ok");
  const res = NextResponse.redirect(backUrl);
  res.cookies.delete({ name: "govbr_oauth", path: "/api/govbr" });
  return res;
}
