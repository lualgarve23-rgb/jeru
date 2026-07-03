"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Degree, Role, SessionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria, INTERSTICE_MONTHS } from "@/lib/permissions";
import { uploadToLodgeDrive, isDriveAvailable } from "@/lib/google-drive";
import { sendLodgeEmail, GUARDA_SELOS_EMAIL } from "@/lib/gmail";

type ActionResult = { error?: string; ok?: string } | undefined;

async function requireSecretariaWriter() {
  const user = await requireUser();
  if (!canWriteSecretaria(user.role)) {
    throw new Error("Sem permissão de escrita na Secretaria.");
  }
  return user;
}

// ───────────────────────── Membros ─────────────────────────

export async function createMember(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const data = {
    cim: String(formData.get("cim")).trim(),
    cpf: String(formData.get("cpf")).replace(/\D/g, ""),
    name: String(formData.get("name")).trim(),
    email: String(formData.get("email")).trim().toLowerCase(),
    phone: (formData.get("phone") as string) || null,
    profession: (formData.get("profession") as string) || null,
    degree: formData.get("degree") as Degree,
    initiationDate: formData.get("initiationDate")
      ? new Date(String(formData.get("initiationDate")))
      : null,
  };
  if (!data.cim || !data.cpf || !data.name || !data.email) {
    return { error: "Preencha CIM, CPF, nome e e-mail." };
  }
  const bcrypt = (await import("bcryptjs")).default;
  // Senha inicial = CPF; o obreiro troca no primeiro acesso (etapa futura).
  const passwordHash = await bcrypt.hash(data.cpf, 10);
  try {
    const member = await prisma.user.create({
      data: { ...data, lodgeId: user.lodgeId, passwordHash },
    });
    if (data.initiationDate) {
      await prisma.degreeHistory.create({
        data: {
          lodgeId: user.lodgeId,
          userId: member.id,
          degree: data.degree,
          date: data.initiationDate,
        },
      });
    }
  } catch {
    return { error: "CIM, CPF ou e-mail já cadastrado." };
  }
  revalidatePath("/secretaria/membros");
  redirect("/secretaria/membros");
}

export async function updateMember(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.user.update({
    // filtro composto garante o isolamento por tenant
    where: { id: memberId, lodgeId: user.lodgeId },
    data: {
      name: String(formData.get("name")).trim(),
      email: String(formData.get("email")).trim().toLowerCase(),
      phone: (formData.get("phone") as string) || null,
      profession: (formData.get("profession") as string) || null,
      status: formData.get("status") as never,
    },
  });
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Dados atualizados." };
}

// Elevação/Exaltação com trava de interstício
export async function elevateDegree(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const newDegree = formData.get("degree") as Degree;
  const date = new Date(String(formData.get("date")));

  const member = await prisma.user.findUniqueOrThrow({
    where: { id: memberId, lodgeId: user.lodgeId },
    include: { degreeHistory: { orderBy: { date: "desc" }, take: 1 } },
  });

  const order = [Degree.APRENDIZ, Degree.COMPANHEIRO, Degree.MESTRE];
  if (order.indexOf(newDegree) !== order.indexOf(member.degree) + 1) {
    return { error: `Progressão inválida: ${member.degree} → ${newDegree}.` };
  }

  const lastDate =
    member.degreeHistory[0]?.date ?? member.initiationDate ?? null;
  const minMonths = INTERSTICE_MONTHS[newDegree] ?? 0;
  if (lastDate) {
    const minDate = new Date(lastDate);
    minDate.setMonth(minDate.getMonth() + minMonths);
    if (date < minDate) {
      return {
        error: `Interstício não cumprido: mínimo de ${minMonths} meses no grau atual (permitido a partir de ${minDate.toLocaleDateString("pt-BR")}).`,
      };
    }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: memberId, lodgeId: user.lodgeId },
      data: { degree: newDegree },
    }),
    prisma.degreeHistory.create({
      data: { lodgeId: user.lodgeId, userId: memberId, degree: newDegree, date },
    }),
  ]);
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: `Grau ${newDegree} registrado.` };
}

// Nomeação de cargo — encerra o cargo anterior no histórico
export async function assignRole(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const role = formData.get("role") as Role;
  const startDate = new Date(String(formData.get("startDate")));

  await prisma.$transaction([
    prisma.roleHistory.updateMany({
      where: { userId: memberId, lodgeId: user.lodgeId, endDate: null },
      data: { endDate: startDate },
    }),
    prisma.roleHistory.create({
      data: { lodgeId: user.lodgeId, userId: memberId, role, startDate },
    }),
    prisma.user.update({
      where: { id: memberId, lodgeId: user.lodgeId },
      data: { currentRole: role },
    }),
  ]);
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Cargo registrado." };
}

// ───────────────────── Sessões e Presenças ─────────────────────

export async function createSession(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const session = await prisma.lodgeSession.create({
    data: {
      lodgeId: user.lodgeId,
      date: new Date(String(formData.get("date"))),
      type: formData.get("type") as SessionType,
      degree: formData.get("degree") as Degree,
    },
  });
  revalidatePath("/secretaria/sessoes");
  redirect(`/secretaria/sessoes/${session.id}`);
}

// Check-in de membro pelo Secretário (manual)
export async function registerAttendance(
  sessionId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const memberId = String(formData.get("memberId"));
  try {
    await prisma.attendance.create({
      data: {
        lodgeId: user.lodgeId,
        sessionId,
        userId: memberId,
      },
    });
  } catch {
    return { error: "Membro já registrado nesta sessão." };
  }
  revalidatePath(`/secretaria/sessoes/${sessionId}`);
  return { ok: "Presença registrada." };
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
  try {
    await prisma.attendance.create({
      data: {
        lodgeId: session.lodgeId,
        sessionId: session.id,
        userId: user.id,
        viaQrCode: true,
      },
    });
  } catch {
    return { error: "Presença já registrada." };
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
  const visitorName = String(formData.get("visitorName")).trim();
  if (!visitorName) return { error: "Informe o nome." };
  await prisma.attendance.create({
    data: {
      lodgeId: session.lodgeId,
      sessionId: session.id,
      visitorName,
      visitorCim: (formData.get("visitorCim") as string) || null,
      visitorLodge: (formData.get("visitorLodge") as string) || null,
      visitorPotencia: (formData.get("visitorPotencia") as string) || null,
      viaQrCode: true,
    },
  });
  return { ok: "Presença de visitante confirmada. Seja bem-vindo!" };
}

// ───────────────────────── Atas ─────────────────────────

export async function createAta(sessionId: string): Promise<void> {
  const user = await requireSecretariaWriter();
  const session = await prisma.lodgeSession.findUniqueOrThrow({
    where: { id: sessionId, lodgeId: user.lodgeId },
  });
  const last = await prisma.ata.findFirst({
    where: { lodgeId: user.lodgeId },
    orderBy: { number: "desc" },
  });
  const ata = await prisma.ata.create({
    data: {
      lodgeId: user.lodgeId,
      sessionId: session.id,
      number: (last?.number ?? 0) + 1,
      content: "",
    },
  });
  redirect(`/secretaria/atas/${ata.id}`);
}

export async function updateAta(
  ataId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId: user.lodgeId },
  });
  // Trava: após qualquer assinatura o texto é imutável
  if (ata.signedByMasterId || ata.signedBySecId) {
    return { error: "Ata já assinada — o texto não pode ser alterado." };
  }
  await prisma.ata.update({
    where: { id: ataId, lodgeId: user.lodgeId },
    data: {
      content: String(formData.get("content")),
      status: formData.get("submit") === "final" ? "AGUARDANDO_ASSINATURAS" : "RASCUNHO",
    },
  });
  revalidatePath(`/secretaria/atas/${ataId}`);
  return { ok: "Ata salva." };
}

// Trava de Governança: assinatura conjunta VM + Secretário
export async function signAta(ataId: string): Promise<ActionResult> {
  const user = await requireUser();
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId: user.lodgeId },
  });
  if (ata.status === "RASCUNHO") {
    return { error: "Finalize o rascunho antes de assinar." };
  }
  if (ata.status === "ASSINADA") {
    return { error: "Ata já está totalmente assinada." };
  }

  const data: Record<string, unknown> = {};
  if (user.role === "VENERAVEL_MESTRE" && !ata.signedByMasterId) {
    data.signedByMasterId = user.id;
    data.signedByMasterAt = new Date();
  } else if (user.role === "SECRETARIO" && !ata.signedBySecId) {
    data.signedBySecId = user.id;
    data.signedBySecAt = new Date();
  } else {
    return {
      error:
        "Apenas o Venerável Mestre e o Secretário assinam a Ata (uma vez cada).",
    };
  }

  const willBeMaster = data.signedByMasterId ?? ata.signedByMasterId;
  const willBeSec = data.signedBySecId ?? ata.signedBySecId;
  if (willBeMaster && willBeSec) data.status = "ASSINADA";

  await prisma.ata.update({
    where: { id: ataId, lodgeId: user.lodgeId },
    data,
  });
  revalidatePath(`/secretaria/atas/${ataId}`);
  return {
    ok:
      data.status === "ASSINADA"
        ? "Ata assinada por ambos — documento selado."
        : "Assinatura registrada. Aguardando a segunda assinatura.",
  };
}

// ───────────────────────── Pranchas ─────────────────────────

export async function createPrancha(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();

  // Anexo: upload direto da pasta local OU documento já no Drive da Loja
  let driveFileId: string | null = null;
  const file = formData.get("file") as File | null;
  const documentId = String(formData.get("documentId") ?? "");
  if (file && file.size > 0) {
    if (!(await isDriveAvailable(user.lodgeId))) {
      return {
        error:
          "Google Drive não conectado — conecte a conta Google da Loja em Configurações da Loja.",
      };
    }
    try {
      driveFileId = await uploadToLodgeDrive(
        user.lodgeId,
        file.name,
        file.type || "application/octet-stream",
        Buffer.from(await file.arrayBuffer())
      );
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Falha no upload ao Drive.",
      };
    }
  } else if (documentId) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId, lodgeId: user.lodgeId },
    });
    if (!doc) return { error: "Documento do Drive não encontrado." };
    driveFileId = doc.driveFileId;
  }

  const year = new Date().getFullYear();
  // numeração sequencial automática por loja/ano
  const last = await prisma.prancha.findFirst({
    where: { lodgeId: user.lodgeId, year },
    orderBy: { number: "desc" },
  });
  await prisma.prancha.create({
    data: {
      lodgeId: user.lodgeId,
      year,
      number: (last?.number ?? 0) + 1,
      subject: String(formData.get("subject")),
      recipient: String(formData.get("recipient")),
      content: String(formData.get("content")),
      driveFileId,
    },
  });
  revalidatePath("/secretaria/pranchas");
  return { ok: driveFileId ? "Prancha expedida com anexo." : "Prancha expedida." };
}

// Envio à Guarda dos Selos pelo Gmail da Loja
export async function sendPranchaToGSelos(
  pranchaId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const prancha = await prisma.prancha.findUniqueOrThrow({
    where: { id: pranchaId, lodgeId: user.lodgeId },
    include: { lodge: true },
  });
  try {
    await sendLodgeEmail({
      to: GUARDA_SELOS_EMAIL,
      subject: `Prancha nº ${prancha.number}/${prancha.year} — ${prancha.lodge.name}`,
      text:
        `Destinatário: ${prancha.recipient}\nAssunto: ${prancha.subject}\n\n${prancha.content}` +
        (prancha.driveFileId
          ? `\n\nAnexo (Google Drive): https://drive.google.com/file/d/${prancha.driveFileId}/view`
          : ""),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no envio." };
  }
  return { ok: `Enviada para ${GUARDA_SELOS_EMAIL}.` };
}

export async function sendAtaToGSelos(ataId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId: user.lodgeId },
    include: { lodge: true, session: true },
  });
  if (ata.status !== "ASSINADA") {
    return { error: "Somente atas com as duas assinaturas podem ser expedidas." };
  }
  try {
    await sendLodgeEmail({
      to: GUARDA_SELOS_EMAIL,
      subject: `Ata nº ${ata.number} — ${ata.lodge.name}`,
      text: `Sessão de ${ata.session.date.toLocaleDateString("pt-BR")}\n\n${ata.content}`,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no envio." };
  }
  return { ok: `Enviada para ${GUARDA_SELOS_EMAIL}.` };
}

// ───────────────────────── Documentos (Drive) ─────────────────────────

export async function uploadDocument(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  if (!(await isDriveAvailable(user.lodgeId))) {
    return {
      error:
        "Google Drive não conectado — conecte a conta Google da Loja em Configurações da Loja.",
    };
  }
  const file = formData.get("file") as File | null;
  const title = String(formData.get("title")).trim();
  if (!file || file.size === 0 || !title) {
    return { error: "Informe o título e selecione um arquivo." };
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const driveFileId = await uploadToLodgeDrive(
      user.lodgeId,
      file.name,
      file.type || "application/octet-stream",
      buffer
    );
    await prisma.document.create({
      data: {
        lodgeId: user.lodgeId,
        uploadedById: user.id,
        title,
        type: formData.get("type") as never,
        driveFileId,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha no upload ao Drive.",
    };
  }
  revalidatePath("/secretaria/documentos");
  return { ok: "Documento enviado ao Google Drive da Loja." };
}
