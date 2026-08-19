"use server";


import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  Degree,
  SessionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  ataFechadaParaPresencas,
  ERRO_PRESENCAS_TRAVADAS } from "@/lib/ata-regras";
import { uploadToLodgeDrive, isDriveAvailable } from "@/lib/google-drive";
import { getGmailAuth } from "@/lib/gmail";
import { enviarCertificadoVisita } from "@/lib/certificado";
import { enfileirar } from "@/lib/fila";
import { type ActionResult, requireSecretariaWriter } from "./_shared";

// ───────────────────── Sessões e Presenças ─────────────────────

export async function createSession(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const session = await prisma.lodgeSession.create({
    data: {
      lodgeId: user.lodgeId,
      // Data + horário de início (campo "hora" do formulário; ex.: 20:00)
      date: new Date(
        `${String(formData.get("date"))}T${String(formData.get("hora") || "20:00")}:00`
      ),
      type: formData.get("type") as SessionType,
      degree: formData.get("degree") as Degree,
      pauta: String(formData.get("pauta") ?? "").trim() || null,
    },
  });
  revalidatePath("/secretaria/sessoes");
  redirect(`/secretaria/sessoes/${session.id}`);
}

// Pauta do dia da sessão — exibida no convite e pré-preenche a Ata
export async function updateSessionPauta(
  sessionId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const pauta = String(formData.get("pauta") ?? "").trim();
  await prisma.lodgeSession.update({
    where: { id: sessionId, lodgeId: user.lodgeId },
    data: { pauta: pauta || null },
  });
  revalidatePath(`/secretaria/sessoes/${sessionId}`);
  return { ok: pauta ? "Pauta salva." : "Pauta removida." };
}

// Check-in de membro pelo Secretário (manual)
export async function registerAttendance(
  sessionId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const memberId = String(formData.get("memberId"));
  if (await ataTravaPresencas(sessionId)) {
    return { error: ERRO_PRESENCAS_TRAVADAS };
  }
  try {
    // Se o membro já confirmou pelo convite (RSVP), o registro vira presença
    await prisma.attendance.upsert({
      where: { sessionId_userId: { sessionId, userId: memberId } },
      create: {
        lodgeId: user.lodgeId,
        sessionId,
        userId: memberId,
      },
      // Presença efetiva prevalece sobre uma ausência antes justificada
      update: {
        checkedIn: true,
        checkedInAt: new Date(),
        justificado: false,
        justificativa: null,
      },
    });
  } catch {
    return { error: "Membro já registrado nesta sessão." };
  }
  revalidatePath(`/secretaria/sessoes/${sessionId}`);
  return { ok: "Presença registrada." };
}

// Correção de presença marcada errada pela Secretaria: desfaz o check-in do
// irmão na sessão (se ele tinha confirmado pelo convite, o RSVP é preservado)
export async function desmarcarPresenca(
  attendanceId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const att = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { user: { select: { name: true } }, session: { include: { ata: true } } },
  });
  if (!att || att.lodgeId !== user.lodgeId || !att.userId) {
    return { error: "Registro de presença não encontrado." };
  }
  if (!att.checkedIn) return { error: "Este irmão não está marcado como presente." };
  const ata = att.session.ata;
  if (ataFechadaParaPresencas(ata)) {
    return { error: ERRO_PRESENCAS_TRAVADAS };
  }
  if (att.rsvpAt) {
    // Confirmou pelo convite: volta a ser apenas RSVP, sem contar frequência
    await prisma.attendance.update({
      where: { id: att.id },
      data: { checkedIn: false, viaQrCode: false },
    });
  } else {
    await prisma.attendance.delete({ where: { id: att.id } });
  }
  revalidatePath(`/secretaria/sessoes/${att.sessionId}`);
  return {
    ok:
      `Presença de ${att.user?.name ?? "irmão"} desfeita.` +
      (ata ? " Se a ata já foi gerada, use “Atualizar rascunho com as presenças”." : ""),
  };
}

// Check-in via QR Code — membro logado
export async function qrCheckinMember(qrToken: string): Promise<ActionResult> {
  const user = await requireUser();
  const session = await prisma.lodgeSession.findUnique({
    where: { qrToken },
  });
  if (!session || session.lodgeId !== user.lodgeId) {
    return { error: "Sessão não encontrada para a sua Loja." };
  }
  if (await ataTravaPresencas(session.id)) {
    return { error: ERRO_PRESENCAS_TRAVADAS };
  }
  const existente = await prisma.attendance.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
  });
  if (existente?.checkedIn) return { error: "Presença já registrada." };
  if (existente) {
    // RSVP pelo convite vira presença efetiva no check-in do dia
    await prisma.attendance.update({
      where: { id: existente.id },
      data: {
        checkedIn: true,
        checkedInAt: new Date(),
        viaQrCode: true,
        justificado: false,
        justificativa: null,
      },
    });
  } else {
    await prisma.attendance.create({
      data: {
        lodgeId: session.lodgeId,
        sessionId: session.id,
        userId: user.id,
        viaQrCode: true,
      },
    });
  }
  return { ok: "Presença confirmada. TFA!" };
}

// Check-in via QR Code — visitante (sem login), registra potência de origem
export async function qrCheckinVisitor(
  qrToken: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await prisma.lodgeSession.findUnique({ where: { qrToken } });
  if (!session) return { error: "Sessão não encontrada." };
  if (await ataTravaPresencas(session.id)) {
    return { error: ERRO_PRESENCAS_TRAVADAS };
  }
  const visitorName = String(formData.get("visitorName")).trim();
  if (!visitorName) return { error: "Informe o nome." };
  const visitorEmail =
    String(formData.get("visitorEmail") ?? "").trim().toLowerCase() || null;
  const attendance = await prisma.attendance.create({
    data: {
      lodgeId: session.lodgeId,
      sessionId: session.id,
      visitorName,
      visitorEmail,
      visitorCim: (formData.get("visitorCim") as string) || null,
      visitorLodge: (formData.get("visitorLodge") as string) || null,
      visitorPotencia: (formData.get("visitorPotencia") as string) || null,
      viaQrCode: true,
    },
  });
  if (visitorEmail) {
    try {
      await enviarCertificadoVisita(attendance.id);
      return {
        ok: "Presença confirmada. O Certificado de Visita foi enviado para o seu e-mail!",
      };
    } catch (e) {
      // Não bloqueia o check-in — a Secretaria pode reenviar pela página da sessão
      console.error("Falha ao enviar certificado de visita:", e);
    }
  }
  return { ok: "Presença de visitante confirmada. Seja bem-vindo!" };
}

// RSVP pelo link público do convite — membro logado
export async function rsvpMember(
  inviteToken: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const session = await prisma.lodgeSession.findUnique({
    where: { inviteToken },
  });
  if (!session || session.lodgeId !== user.lodgeId) {
    return { error: "Convite não encontrado para a sua Loja." };
  }
  const agape = formData.get("agape") === "on";
  await prisma.attendance.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId: user.id } },
    create: {
      lodgeId: session.lodgeId,
      sessionId: session.id,
      userId: user.id,
      checkedIn: false,
      rsvpAt: new Date(),
      agapeConfirmed: agape,
    },
    update: { rsvpAt: new Date(), agapeConfirmed: agape },
  });
  return {
    ok: agape
      ? "Presença e Ágape confirmados. Até lá, TFA!"
      : "Presença confirmada. Até lá, TFA!",
  };
}

// RSVP pelo link público do convite — sem login (membro identificado pelo CIM
// ou visitante de outra Loja)
export async function rsvpPublico(
  inviteToken: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await prisma.lodgeSession.findUnique({
    where: { inviteToken },
  });
  if (!session) return { error: "Convite não encontrado." };
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe o seu nome." };
  const cim = String(formData.get("cim") ?? "").trim();
  const agape = formData.get("agape") === "on";

  // CIM de membro ativo da própria Loja: vincula o RSVP ao cadastro
  if (cim) {
    const membro = await prisma.user.findFirst({
      where: { lodgeId: session.lodgeId, cim, status: "ATIVO" },
    });
    if (membro) {
      await prisma.attendance.upsert({
        where: {
          sessionId_userId: { sessionId: session.id, userId: membro.id },
        },
        create: {
          lodgeId: session.lodgeId,
          sessionId: session.id,
          userId: membro.id,
          checkedIn: false,
          rsvpAt: new Date(),
          agapeConfirmed: agape,
        },
        update: { rsvpAt: new Date(), agapeConfirmed: agape },
      });
      return {
        ok: `Presença confirmada, Irmão ${membro.name}.${agape ? " Ágape anotado." : ""} TFA!`,
      };
    }
  }

  // Visitante: evita duplicar a confirmação pelo mesmo nome nesta sessão
  const jaConfirmado = await prisma.attendance.findFirst({
    where: {
      sessionId: session.id,
      userId: null,
      visitorName: { equals: nome, mode: "insensitive" },
    },
  });
  if (jaConfirmado) {
    await prisma.attendance.update({
      where: { id: jaConfirmado.id },
      data: { rsvpAt: new Date(), agapeConfirmed: agape },
    });
  } else {
    await prisma.attendance.create({
      data: {
        lodgeId: session.lodgeId,
        sessionId: session.id,
        visitorName: nome,
        visitorEmail:
          String(formData.get("email") ?? "").trim().toLowerCase() || null,
        visitorCim: cim || null,
        visitorLodge: (formData.get("lojaOrigem") as string)?.trim() || null,
        visitorPotencia: (formData.get("potencia") as string)?.trim() || null,
        checkedIn: false,
        rsvpAt: new Date(),
        agapeConfirmed: agape,
      },
    });
  }
  return {
    ok: `Presença confirmada.${agape ? " Ágape anotado." : ""} Seja bem-vindo!`,
  };
}

// Justificativa de ausência pelo próprio irmão, a partir do convite: entra no
// livro como "Justificado" (não conta frequência) e alimenta o trecho da ata,
// como no registro manual da Secretaria.
async function justificarPeloConvite(
  session: { id: string; lodgeId: string },
  userId: string,
  justificativa: string
): Promise<ActionResult> {
  if (await ataTravaPresencas(session.id)) {
    return { error: ERRO_PRESENCAS_TRAVADAS };
  }
  const existente = await prisma.attendance.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId } },
    select: { checkedIn: true },
  });
  if (existente?.checkedIn) {
    return { error: "Sua presença já está registrada nesta sessão." };
  }
  await prisma.attendance.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId } },
    create: {
      lodgeId: session.lodgeId,
      sessionId: session.id,
      userId,
      checkedIn: false,
      justificado: true,
      justificativa,
    },
    // Justificar cancela um eventual RSVP anterior (inclusive o Ágape)
    update: { justificado: true, justificativa, agapeConfirmed: false },
  });
  return {
    ok: "Ausência justificada registrada. A Secretaria foi informada pelo Livro de Presenças. TFA!",
  };
}

function justificativaDoForm(formData: FormData) {
  return String(formData.get("justificativa") ?? "").trim().slice(0, 300);
}

// Ausência justificada pelo link do convite — membro logado
export async function ausenciaMember(
  inviteToken: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const session = await prisma.lodgeSession.findUnique({
    where: { inviteToken },
    select: { id: true, lodgeId: true },
  });
  if (!session || session.lodgeId !== user.lodgeId) {
    return { error: "Convite não encontrado para a sua Loja." };
  }
  const justificativa = justificativaDoForm(formData);
  if (!justificativa) return { error: "Escreva o motivo da ausência." };
  return justificarPeloConvite(session, user.id, justificativa);
}

// Ausência justificada pelo link do convite — sem login, irmão do quadro
// identificado pelo CIM
export async function ausenciaPublico(
  inviteToken: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const session = await prisma.lodgeSession.findUnique({
    where: { inviteToken },
    select: { id: true, lodgeId: true },
  });
  if (!session) return { error: "Convite não encontrado." };
  const cim = String(formData.get("cim") ?? "").trim();
  if (!cim) return { error: "Informe o CIM para justificar a ausência." };
  const justificativa = justificativaDoForm(formData);
  if (!justificativa) return { error: "Escreva o motivo da ausência." };
  const membro = await prisma.user.findFirst({
    where: { lodgeId: session.lodgeId, cim, status: "ATIVO" },
    select: { id: true },
  });
  if (!membro) {
    return {
      error:
        "CIM não encontrado no quadro da Loja — a justificativa de ausência é para irmãos do quadro.",
    };
  }
  return justificarPeloConvite(session, membro.id, justificativa);
}

// Dispara o convite da sessão por e-mail para todos os membros ativos,
// pelo Gmail da Loja (template padrão ou o HTML enviado pela loja)
export async function dispararConvitesEmail(
  sessionId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const session = await prisma.lodgeSession.findUnique({
    where: { id: sessionId, lodgeId: user.lodgeId },
    include: { lodge: true },
  });
  if (!session) return { error: "Sessão não encontrada." };

  const membros = await prisma.user.findMany({
    where: {
      lodgeId: user.lodgeId,
      status: "ATIVO",
      currentRole: { not: "SUPER_ADMIN" },
    },
    select: { email: true },
  });
  const emails = membros.map((m) => m.email).filter((e) => e.includes("@"));
  if (emails.length === 0) {
    return { error: "Nenhum membro ativo com e-mail cadastrado." };
  }

  if (!(await getGmailAuth(user.lodgeId))) {
    return { error: "Gmail da loja não configurado." };
  }
  // Envio em massa sai do request — a fila (#13) manda e refaz em falha
  await enfileirar("sessao.convites", {
    lodgeId: user.lodgeId,
    sessionId: session.id,
  });
  return { ok: `Convite a caminho de ${emails.length} membro(s) — envio em instantes.` };
}

// Reenvio manual do Certificado de Visita pela Secretaria
export async function reenviarCertificadoVisita(
  attendanceId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const att = await prisma.attendance.findUnique({
    where: { id: attendanceId },
  });
  if (!att || att.lodgeId !== user.lodgeId || !att.visitorName) {
    return { error: "Presença de visitante não encontrada." };
  }
  if (!att.visitorEmail) {
    return { error: "Este visitante não informou e-mail no check-in." };
  }
  try {
    await enviarCertificadoVisita(att.id);
  } catch (e) {
    console.error("Falha ao enviar certificado de visita:", e);
    return { error: "Falha ao enviar o certificado. Verifique o Gmail da loja." };
  }
  return { ok: `Certificado de Visita enviado para ${att.visitorEmail}.` };
}

// ──────────────── Visitas a outras Oficinas ────────────────

export async function registrarVisitaExterna(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const memberId = String(formData.get("memberId"));
  const date = new Date(String(formData.get("date")));
  const lojaVisitada = String(formData.get("lojaVisitada") ?? "").trim();
  if (!memberId || isNaN(date.getTime()) || !lojaVisitada) {
    return { error: "Informe o irmão, a data e a oficina visitada." };
  }
  const member = await prisma.user.findUnique({
    where: { id: memberId, lodgeId: user.lodgeId },
    select: { name: true },
  });
  if (!member) return { error: "Irmão não encontrado." };

  // Certificado de visita (opcional) — vai direto ao Drive da Loja
  let certificadoDriveId: string | null = null;
  const certificado = formData.get("certificado") as File | null;
  if (certificado && certificado.size > 0) {
    const enviado = await subirCertificadoVisitaDrive(user.lodgeId, certificado, {
      memberName: member.name,
      date,
      lojaVisitada,
    });
    if ("error" in enviado) return enviado;
    certificadoDriveId = enviado.driveFileId;
  }

  await prisma.visitaExterna.create({
    data: {
      lodgeId: user.lodgeId,
      userId: memberId,
      date,
      lojaVisitada,
      potencia: String(formData.get("potencia") ?? "").trim() || null,
      oriente: String(formData.get("oriente") ?? "").trim() || null,
      observacao: String(formData.get("observacao") ?? "").trim() || null,
      certificadoDriveId,
      registradaPorId: user.id,
    },
  });
  revalidatePath("/secretaria/visitas");
  revalidatePath(`/secretaria/membros/${memberId}`);
  return {
    ok: `Visita de ${member.name} a ${lojaVisitada} registrada.${
      certificadoDriveId ? " Certificado arquivado no Drive da Loja." : ""
    }`,
  };
}

const CERTIFICADO_TIPOS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// Sobe o certificado de visita para o Drive da Loja (exige Drive conectado).
async function subirCertificadoVisitaDrive(
  lodgeId: string,
  file: File,
  info: { memberName: string; date: Date; lojaVisitada: string }
): Promise<{ driveFileId: string } | { error: string }> {
  if (!(await isDriveAvailable(lodgeId))) {
    return {
      error:
        "Não existe Google Drive conectado — conecte a conta Google da Loja em Configurações da Loja para arquivar o certificado.",
    };
  }
  const ext = CERTIFICADO_TIPOS[file.type];
  if (!ext) {
    return { error: "O certificado deve ser um PDF, JPG ou PNG." };
  }
  if (file.size > 15_000_000) {
    return { error: "Arquivo muito grande — o certificado deve ter até 15 MB." };
  }
  const dia = info.date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const nome = `Certificado de visita - ${info.memberName} - ${info.lojaVisitada} - ${dia}.${ext}`;
  try {
    const driveFileId = await uploadToLodgeDrive(
      lodgeId,
      nome,
      file.type,
      Buffer.from(await file.arrayBuffer())
    );
    return { driveFileId };
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `Falha ao enviar o certificado ao Drive: ${e.message}`
          : "Falha ao enviar o certificado ao Drive.",
    };
  }
}

// Anexa (ou substitui) o certificado de uma visita já registrada
export async function anexarCertificadoVisitaExterna(
  visitaId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const visita = await prisma.visitaExterna.findUnique({
    where: { id: visitaId },
    include: { user: { select: { name: true } } },
  });
  if (!visita || visita.lodgeId !== user.lodgeId) {
    return { error: "Registro de visita não encontrado." };
  }
  const certificado = formData.get("certificado") as File | null;
  if (!certificado || certificado.size === 0) {
    return { error: "Selecione o arquivo do certificado." };
  }
  const enviado = await subirCertificadoVisitaDrive(user.lodgeId, certificado, {
    memberName: visita.user.name,
    date: visita.date,
    lojaVisitada: visita.lojaVisitada,
  });
  if ("error" in enviado) return enviado;
  await prisma.visitaExterna.update({
    where: { id: visitaId },
    data: { certificadoDriveId: enviado.driveFileId },
  });
  revalidatePath("/secretaria/visitas");
  revalidatePath(`/secretaria/membros/${visita.userId}`);
  return { ok: "Certificado arquivado no Drive da Loja." };
}

export async function removerVisitaExterna(
  visitaId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const visita = await prisma.visitaExterna.findUnique({
    where: { id: visitaId },
  });
  if (!visita || visita.lodgeId !== user.lodgeId) {
    return { error: "Registro de visita não encontrado." };
  }
  await prisma.visitaExterna.delete({ where: { id: visitaId } });
  revalidatePath("/secretaria/visitas");
  revalidatePath(`/secretaria/membros/${visita.userId}`);
  return { ok: "Registro de visita removido." };
}

// ─────────── Ausências justificadas no Livro de Presenças ───────────

async function ataTravaPresencas(sessionId: string) {
  const ata = await prisma.ata.findUnique({
    where: { sessionId },
    select: {
      status: true,
      signedByMasterId: true,
      signedBySecId: true,
      govbrUploadedAt: true,
    },
  });
  return ataFechadaParaPresencas(ata);
}

// Registra que o irmão justificou a ausência: entra no livro como
// "Justificado" (não conta frequência) e alimenta o trecho da ata.
export async function justificarAusencia(
  sessionId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId) return { error: "Selecione o irmão." };
  const justificativa =
    String(formData.get("justificativa") ?? "").trim().slice(0, 300) || null;

  const [session, travada, existente] = await Promise.all([
    prisma.lodgeSession.findUnique({
      where: { id: sessionId, lodgeId: user.lodgeId },
      select: { id: true },
    }),
    ataTravaPresencas(sessionId),
    prisma.attendance.findUnique({
      where: { sessionId_userId: { sessionId, userId: memberId } },
      select: { id: true, checkedIn: true },
    }),
  ]);
  if (!session) return { error: "Sessão não encontrada." };
  if (travada) return { error: ERRO_PRESENCAS_TRAVADAS };
  if (existente?.checkedIn) {
    return {
      error:
        "Este irmão está marcado como presente — desfaça a presença antes de justificar a ausência.",
    };
  }
  await prisma.attendance.upsert({
    where: { sessionId_userId: { sessionId, userId: memberId } },
    create: {
      lodgeId: user.lodgeId,
      sessionId,
      userId: memberId,
      checkedIn: false,
      justificado: true,
      justificativa,
    },
    update: { justificado: true, justificativa },
  });
  revalidatePath(`/secretaria/sessoes/${sessionId}`);
  return { ok: "Ausência justificada registrada." };
}

export async function desfazerJustificativa(
  attendanceId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const att = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: {
      id: true,
      lodgeId: true,
      sessionId: true,
      rsvpAt: true,
      justificado: true,
      session: {
        select: {
          ata: {
            select: {
              status: true,
              signedByMasterId: true,
              signedBySecId: true,
              govbrUploadedAt: true,
            },
          },
        },
      },
    },
  });
  if (!att || att.lodgeId !== user.lodgeId || !att.justificado) {
    return { error: "Justificativa não encontrada." };
  }
  if (ataFechadaParaPresencas(att.session.ata)) {
    return { error: ERRO_PRESENCAS_TRAVADAS };
  }
  if (att.rsvpAt) {
    // Veio do convite: mantém o RSVP, só remove a justificativa
    await prisma.attendance.update({
      where: { id: att.id },
      data: { justificado: false, justificativa: null },
    });
  } else {
    await prisma.attendance.delete({ where: { id: att.id } });
  }
  revalidatePath(`/secretaria/sessoes/${att.sessionId}`);
  return { ok: "Justificativa removida." };
}

