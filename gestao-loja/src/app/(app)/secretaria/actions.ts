"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  Degree,
  Role,
  SessionType,
  StatusAdmissao,
  StatusPlacet,
  StatusProgressao,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { validarProgressao, dataMinimaProgressao } from "@/lib/intersticio";
import {
  ataFechadaParaPresencas,
  ERRO_PRESENCAS_TRAVADAS,
} from "@/lib/ata-regras";
import { cargoCorresponde, type CargoPadrao } from "@/lib/cargos";
import { appUrl } from "@/lib/utils";
import { criarFamiliar, atualizarFamiliar } from "@/lib/familiares";
import { uploadToLodgeDrive, isDriveAvailable } from "@/lib/google-drive";
import { sendLodgeEmail, getGmailAuth, GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import { gerarTextoAta } from "@/lib/ata-template";
import { gerarAtaPdf } from "@/lib/ata-pdf";
import { gerarPdfAtaAssinada } from "@/lib/ata-final";
import { enviarCertificadoVisita } from "@/lib/certificado";
import { renderConvite } from "@/lib/convite";

type ActionResult = { error?: string; ok?: string } | undefined;

async function requireSecretariaWriter() {
  const user = await requireUser();
  if (!canWriteSecretaria(user.role)) {
    throw new Error("Sem permissão de escrita na Secretaria.");
  }
  return user;
}

// Converte um upload de imagem em data URI (limite de 500 KB); retorna
// string de erro quando o arquivo não serve.
async function imageToDataUri(
  file: File | null,
  label: string
): Promise<{ dataUri?: string; error?: string }> {
  if (!file || file.size === 0) return {};
  if (!file.type.startsWith("image/")) {
    return { error: `${label} deve ser uma imagem (PNG, JPG...).` };
  }
  if (file.size > 500_000) {
    return { error: `${label} muito grande — use uma imagem de até 500 KB.` };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  return { dataUri: `data:${file.type};base64,${buf.toString("base64")}` };
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
  // Senha inicial = CPF; o sistema força a troca no primeiro acesso.
  const passwordHash = await bcrypt.hash(data.cpf, 10);
  try {
    const member = await prisma.user.create({
      data: { ...data, lodgeId: user.lodgeId, passwordHash, mustChangePassword: true },
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

  // Imagem de assinatura (VM, Secretário e Orador) — data URI, até 500 KB
  const sig = await imageToDataUri(
    formData.get("signature") as File | null,
    "A assinatura"
  );
  if (sig.error) return { error: sig.error };
  const signatureUrl = sig.dataUri;

  await prisma.user.update({
    // filtro composto garante o isolamento por tenant
    where: { id: memberId, lodgeId: user.lodgeId },
    data: {
      name: String(formData.get("name")).trim(),
      email: String(formData.get("email")).trim().toLowerCase(),
      phone: (formData.get("phone") as string) || null,
      profession: (formData.get("profession") as string) || null,
      birthDate: formData.get("birthDate")
        ? new Date(String(formData.get("birthDate")))
        : null,
      address: (formData.get("address") as string) || null,
      rg: (formData.get("rg") as string) || null,
      naturalidade: (formData.get("naturalidade") as string) || null,
      estadoCivil: (formData.get("estadoCivil") as string) || null,
      conjuge: (formData.get("conjuge") as string) || null,
      nomePai: (formData.get("nomePai") as string) || null,
      nomeMae: (formData.get("nomeMae") as string) || null,
      tipoSanguineo: (formData.get("tipoSanguineo") as string) || null,
      status: formData.get("status") as never,
      ...(signatureUrl ? { signatureUrl } : {}),
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

  const lastDate =
    member.degreeHistory[0]?.date ?? member.initiationDate ?? null;
  const valida = validarProgressao(member.degree, newDegree, lastDate, date);
  if ("error" in valida) return valida;

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

// Resolve o valor do select de cargo do rito ("rito:<nome>" ou "" = sem cargo).
// Cargos ritualísticos são gerenciados exclusivamente pelo model CargoRito e
// não interferem no nível de acesso ao sistema (currentRole).
async function resolveCargo(
  lodgeId: string,
  raw: string
): Promise<{ cargoRito: string | null } | { error: string }> {
  if (!raw || raw === "MEMBER") return { cargoRito: null };
  if (!raw.startsWith("rito:")) return { error: "Cargo inválido." };
  const nome = raw.slice(5);
  const cargo = await prisma.cargoRito.findUnique({
    where: { lodgeId_nome: { lodgeId, nome } },
  });
  if (!cargo) return { error: "Cargo do rito não encontrado." };
  return { cargoRito: cargo.nome };
}

// Nomeação de cargo do rito — encerra o cargo anterior no histórico.
// Não altera o nível de acesso (currentRole).
export async function assignRole(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const cargo = await resolveCargo(
    user.lodgeId,
    String(formData.get("role"))
  );
  if ("error" in cargo) return { error: cargo.error };
  const startDate = new Date(String(formData.get("startDate")));

  await prisma.$transaction([
    prisma.roleHistory.updateMany({
      where: { userId: memberId, lodgeId: user.lodgeId, endDate: null },
      data: { endDate: startDate },
    }),
    prisma.roleHistory.create({
      data: {
        lodgeId: user.lodgeId,
        userId: memberId,
        role: "MEMBER",
        cargoRito: cargo.cargoRito,
        startDate,
      },
    }),
    prisma.user.update({
      where: { id: memberId, lodgeId: user.lodgeId },
      data: { cargoRito: cargo.cargoRito },
    }),
  ]);
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Cargo registrado." };
}

// Nível de acesso ao sistema (enum Role) — definido por VM/Secretário,
// independente do cargo ritualístico.
export async function setAccessRole(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const raw = String(formData.get("accessRole"));
  const permitidos: Role[] = [
    "MEMBER",
    "VENERAVEL_MESTRE",
    "SECRETARIO",
    "TESOUREIRO",
    "CONSELHO_CONTAS",
    "ESMOLER",
  ];
  if (!permitidos.includes(raw as Role)) {
    return { error: "Nível de acesso inválido." };
  }
  if (memberId === user.id && raw !== user.role) {
    return { error: "Você não pode alterar o próprio nível de acesso." };
  }
  await prisma.user.update({
    where: { id: memberId, lodgeId: user.lodgeId },
    data: { currentRole: raw as Role },
  });
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Nível de acesso atualizado." };
}

// ─────────────── Cargos do rito (personalizados por Loja) ───────────────

export async function createCargoRito(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const nome = String(formData.get("nome")).trim();
  if (!nome) return { error: "Informe o nome do cargo." };
  try {
    await prisma.cargoRito.create({
      data: { lodgeId: user.lodgeId, nome },
    });
  } catch {
    return { error: "Já existe um cargo com esse nome." };
  }
  revalidatePath("/secretaria/cargos");
  return { ok: "Cargo do rito cadastrado." };
}

export async function deleteCargoRito(cargoId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const cargo = await prisma.cargoRito.findUniqueOrThrow({
    where: { id: cargoId, lodgeId: user.lodgeId },
  });
  const emUso = await prisma.user.count({
    where: { lodgeId: user.lodgeId, cargoRito: cargo.nome },
  });
  if (emUso > 0) {
    return {
      error: `Há ${emUso} membro(s) com este cargo — nomeie outro cargo antes de excluir.`,
    };
  }
  await prisma.cargoRito.delete({
    where: { id: cargoId, lodgeId: user.lodgeId },
  });
  revalidatePath("/secretaria/cargos");
  return { ok: "Cargo do rito excluído." };
}

// ─────────────── Correção de histórico (graus e cargos) ───────────────
// O grau atual do membro sempre reflete o registro mais recente do
// histórico; o cargo atual reflete o registro em aberto (sem data fim).

async function syncMemberDegree(lodgeId: string, userId: string) {
  const latest = await prisma.degreeHistory.findFirst({
    where: { lodgeId, userId },
    orderBy: { date: "desc" },
  });
  if (latest) {
    await prisma.user.update({
      where: { id: userId, lodgeId },
      data: { degree: latest.degree },
    });
  }
}

async function syncMemberRole(lodgeId: string, userId: string) {
  const open = await prisma.roleHistory.findFirst({
    where: { lodgeId, userId, endDate: null },
    orderBy: { startDate: "desc" },
  });
  // O histórico rege apenas o cargo do rito; o nível de acesso (currentRole)
  // é gerido separadamente por setAccessRole.
  await prisma.user.update({
    where: { id: userId, lodgeId },
    data: { cargoRito: open?.cargoRito ?? null },
  });
}

export async function updateDegreeHistory(
  entryId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const entry = await prisma.degreeHistory.findUniqueOrThrow({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  const degree = formData.get("degree") as Degree;
  const date = new Date(String(formData.get("date")));
  if (Number.isNaN(date.getTime())) return { error: "Informe uma data válida." };
  await prisma.degreeHistory.update({
    where: { id: entryId, lodgeId: user.lodgeId },
    data: { degree, date },
  });
  await syncMemberDegree(user.lodgeId, entry.userId);
  revalidatePath(`/secretaria/membros/${entry.userId}`);
  return { ok: "Registro de grau atualizado." };
}

export async function deleteDegreeHistory(
  entryId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const entry = await prisma.degreeHistory.findUniqueOrThrow({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  await prisma.degreeHistory.delete({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  await syncMemberDegree(user.lodgeId, entry.userId);
  revalidatePath(`/secretaria/membros/${entry.userId}`);
  return { ok: "Registro de grau excluído." };
}

export async function updateRoleHistory(
  entryId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const entry = await prisma.roleHistory.findUniqueOrThrow({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  const cargo = await resolveCargo(
    user.lodgeId,
    String(formData.get("role"))
  );
  if ("error" in cargo) return { error: cargo.error };
  const startDate = new Date(String(formData.get("startDate")));
  if (Number.isNaN(startDate.getTime())) {
    return { error: "Informe uma data de início válida." };
  }
  const endRaw = String(formData.get("endDate") ?? "").trim();
  const endDate = endRaw ? new Date(endRaw) : null;
  if (endDate && endDate < startDate) {
    return { error: "A data de fim não pode ser anterior ao início." };
  }
  await prisma.roleHistory.update({
    where: { id: entryId, lodgeId: user.lodgeId },
    data: { role: "MEMBER", cargoRito: cargo.cargoRito, startDate, endDate },
  });
  await syncMemberRole(user.lodgeId, entry.userId);
  revalidatePath(`/secretaria/membros/${entry.userId}`);
  return { ok: "Registro de cargo atualizado." };
}

export async function deleteRoleHistory(
  entryId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const entry = await prisma.roleHistory.findUniqueOrThrow({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  await prisma.roleHistory.delete({
    where: { id: entryId, lodgeId: user.lodgeId },
  });
  await syncMemberRole(user.lodgeId, entry.userId);
  revalidatePath(`/secretaria/membros/${entry.userId}`);
  return { ok: "Registro de cargo excluído." };
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

  const baseUrl = process.env.APP_URL ?? "http://localhost:3100";
  const inviteUrl = `${baseUrl}/convite/${session.inviteToken}`;
  const html = renderConvite(session.lodge, session, inviteUrl);
  const dataFmt = session.date.toLocaleDateString("pt-BR");
  try {
    await sendLodgeEmail({
      lodgeId: user.lodgeId,
      to: (await getGmailAuth(user.lodgeId))!.user, // BCC preserva os endereços
      bcc: emails,
      subject: `Convite — Sessão de ${dataFmt} · ${session.lodge.name}`,
      text: `Convite para a sessão de ${dataFmt}. Confirme sua presença e o Ágape em: ${inviteUrl}`,
      html,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no envio." };
  }
  return { ok: `Convite enviado para ${emails.length} membro(s).` };
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

// ───────────────────────── Atas ─────────────────────────

// Dados da ata que derivam das presenças registradas na sessão —
// usados na geração do rascunho e na atualização posterior das presenças
function dadosPresencaSessao(session: {
  degree: Degree;
  type: SessionType;
  date: Date;
  lodge: { name: string; number: string; address: string | null };
  attendances: {
    checkedIn: boolean;
    justificado: boolean;
    visitorName: string | null;
    visitorLodge: string | null;
    visitorPotencia: string | null;
    user: { name: string; currentRole: Role; cargoRito: string | null } | null;
  }[];
}) {
  // Só quem fez check-in entra na ata — confirmações do convite (RSVP) e
  // ausências justificadas não contam como presença.
  const membros = session.attendances.filter((a) => a.user && a.checkedIn);
  const byRole = (role: Role) =>
    membros.find((a) => a.user!.currentRole === role)?.user!.name ?? null;
  const byCargo = (padrao: CargoPadrao) =>
    membros.find((a) => cargoCorresponde(a.user!.cargoRito, padrao))?.user!
      .name ?? null;
  const temCargoDestacado = (a: (typeof membros)[number]) =>
    ["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO"].includes(
      a.user!.currentRole
    ) ||
    (["1º Vigilante", "2º Vigilante", "Diretor de Cerimônias", "Guarda Interno"] as const).some(
      (c) => cargoCorresponde(a.user!.cargoRito, c)
    );
  return {
    lodgeName: `${session.lodge.name} nº ${session.lodge.number}`,
    address: session.lodge.address,
    degree: session.degree,
    type: session.type,
    date: session.date,
    masterName: byRole("VENERAVEL_MESTRE"),
    secretaryName: byRole("SECRETARIO"),
    treasurerName: byRole("TESOUREIRO"),
    primeiroVigilanteName: byCargo("1º Vigilante"),
    segundoVigilanteName: byCargo("2º Vigilante"),
    dirCerimoniasName: byCargo("Diretor de Cerimônias"),
    guardaInternoName: byCargo("Guarda Interno"),
    presentes: membros
      .filter((a) => !temCargoDestacado(a))
      .map((a) => ({ name: a.user!.name })),
    visitantes: session.attendances
      .filter((a) => !a.user && a.visitorName && a.checkedIn)
      .map((a) => ({
        name: a.visitorName!,
        lodge: a.visitorLodge,
        potencia: a.visitorPotencia,
      })),
    // Irmãos que justificaram a ausência (combo do Livro de Presenças)
    ausenciasJustificadas: session.attendances
      .filter((a) => a.user && a.justificado && !a.checkedIn)
      .map((a) => a.user!.name)
      .join(", "),
    totalMembros: membros.length,
  };
}

export async function createAta(
  sessionId: string,
  formData: FormData
): Promise<void> {
  const campo = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };
  const user = await requireSecretariaWriter();
  const session = await prisma.lodgeSession.findUniqueOrThrow({
    where: { id: sessionId, lodgeId: user.lodgeId },
    include: {
      lodge: true,
      attendances: { include: { user: true }, orderBy: { checkedInAt: "asc" } },
    },
  });
  const last = await prisma.ata.findFirst({
    where: { lodgeId: user.lodgeId },
    orderBy: { number: "desc" },
  });

  const derivados = dadosPresencaSessao(session);
  const content = gerarTextoAta({
    ...derivados,
    // Texto digitado pelo Secretário prevalece sobre as justificativas do livro
    ausenciasJustificadas:
      campo("ausenciasJustificadas") || derivados.ausenciasJustificadas,
    pautaDoDia: campo("pautaDoDia"),
    detalhamentos: campo("detalhamentos"),
    horaEncerramento: campo("horaEncerramento"),
  });

  const ata = await prisma.ata.create({
    data: {
      lodgeId: user.lodgeId,
      sessionId: session.id,
      number: (last?.number ?? 0) + 1,
      content,
    },
  });
  redirect(`/secretaria/atas/${ata.id}`);
}

// Atualiza no rascunho os trechos que derivam das presenças (abertura com os
// cargos, demais irmãos presentes e contagem de obreiros), preservando o
// restante do texto já editado pelo Secretário. Permitido até a liberação
// para assinaturas ("Validação concluída").
export async function atualizarPresencasAta(
  sessionId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const session = await prisma.lodgeSession.findUniqueOrThrow({
    where: { id: sessionId, lodgeId: user.lodgeId },
    include: {
      lodge: true,
      attendances: { include: { user: true }, orderBy: { checkedInAt: "asc" } },
      ata: true,
    },
  });
  const ata = session.ata;
  if (!ata) return { error: "Esta sessão ainda não tem rascunho de ata." };
  if (ataFechadaParaPresencas(ata)) {
    return { error: ERRO_PRESENCAS_TRAVADAS };
  }

  const novo = gerarTextoAta(dadosPresencaSessao(session));
  const trechos: [string, RegExp][] = [
    ["abertura e cargos", /^Ao .+a pedido do Dir∴ de Cer∴\.$/m],
    ["irmãos presentes", /^Demais irmãos do quadro presentes: .+$/m],
    ["ausências justificadas", /^Os seguintes irmãos justificaram ausência: .+$/m],
    ["contagem de obreiros", /^A sessão foi preenchida por .+$/m],
  ];
  let content = ata.content;
  let trocados = 0;
  const naoEncontrados: string[] = [];
  for (const [nome, re] of trechos) {
    const trecho = novo.match(re)?.[0];
    if (trecho && re.test(content)) {
      content = content.replace(re, () => trecho);
      trocados++;
    } else {
      naoEncontrados.push(nome);
    }
  }
  if (!trocados) {
    return {
      error:
        "Não encontrei no texto da ata os trechos de presença para atualizar — o texto foi muito alterado; ajuste as presenças diretamente no editor da ata.",
    };
  }
  await prisma.ata.update({
    where: { id: ata.id, lodgeId: user.lodgeId },
    data: { content },
  });
  revalidatePath(`/secretaria/sessoes/${sessionId}`);
  revalidatePath(`/secretaria/atas/${ata.id}`);
  return {
    ok:
      `Rascunho da Ata nº ${ata.number} atualizado com as presenças atuais.` +
      (naoEncontrados.length
        ? ` Atenção: não localizei no texto (provavelmente editado) — ${naoEncontrados.join(", ")}; confira no editor.`
        : ""),
  };
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
  // Trava: após qualquer assinatura (interna ou gov.br) o texto é imutável
  if (ata.signedByMasterId || ata.signedBySecId || ata.govbrUploadedAt) {
    return { error: "Ata já assinada — o texto não pode ser alterado." };
  }
  const liberar = formData.get("submit") === "final";
  // Trava de processo: só libera para assinaturas após a validação dos irmãos
  if (liberar && !ata.sentForReviewAt) {
    return {
      error:
        "Envie a ata aos irmãos para validação antes de liberá-la para assinaturas.",
    };
  }
  // Na liberação, o Secretário escolhe a forma de assinatura — exclusiva:
  // ou a assinatura normal (interna, no sistema) ou a assinatura gov.br
  const govbrSolicitado = liberar
    ? formData.get("assinatura") === "govbr"
    : ata.govbrSolicitado;
  await prisma.ata.update({
    where: { id: ataId, lodgeId: user.lodgeId },
    data: {
      content: String(formData.get("content")),
      ajustes: String(formData.get("ajustes") ?? "").trim() || null,
      status: liberar ? "AGUARDANDO_ASSINATURAS" : ata.status === "EM_VALIDACAO" ? "EM_VALIDACAO" : "RASCUNHO",
      govbrSolicitado,
    },
  });
  revalidatePath(`/secretaria/atas/${ataId}`);
  return {
    ok: liberar
      ? govbrSolicitado
        ? "Ata liberada para assinatura gov.br."
        : "Ata liberada para assinaturas."
      : "Ata salva.",
  };
}

// Muda a forma de assinatura depois da liberação (normal ⇄ gov.br) —
// só enquanto nenhuma assinatura foi registrada em nenhum dos fluxos
export async function setAtaGovbr(
  ataId: string,
  solicitar: boolean
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId: user.lodgeId },
  });
  if (solicitar && (ata.signedByMasterId || ata.signedBySecId)) {
    return {
      error:
        "A ata já tem assinatura interna — as formas são exclusivas e não é possível mudar para o gov.br.",
    };
  }
  if (!solicitar && (ata.govbrPdf || ata.govbrUploadedAt)) {
    return {
      error:
        "A ata já tem assinatura gov.br registrada — o encaminhamento não pode ser desfeito.",
    };
  }
  await prisma.ata.update({
    where: { id: ataId, lodgeId: user.lodgeId },
    data: { govbrSolicitado: solicitar },
  });
  revalidatePath(`/secretaria/atas/${ataId}`);
  return {
    ok: solicitar
      ? "Ata encaminhada para assinatura gov.br (substitui a assinatura interna)."
      : "Encaminhamento ao gov.br cancelado — a ata segue pela assinatura normal.",
  };
}

// Envio da ata aos irmãos para validação, antes das assinaturas
export async function sendAtaForReview(ataId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId: user.lodgeId },
    include: { lodge: true, session: true },
  });
  if (
    ata.signedByMasterId ||
    ata.signedBySecId ||
    ata.govbrUploadedAt ||
    ata.status === "ASSINADA"
  ) {
    return { error: "Ata já em assinatura — a validação ocorre antes." };
  }
  const membros = await prisma.user.findMany({
    where: {
      lodgeId: user.lodgeId,
      status: "ATIVO",
      currentRole: { not: "SUPER_ADMIN" },
    },
    select: { email: true },
  });
  const emails = membros.map((m) => m.email).filter((e) => e.includes("@"));
  if (!emails.length) {
    return { error: "Nenhum irmão ativo com e-mail cadastrado." };
  }
  try {
    const pdf = await gerarAtaPdf({
      lodgeName: ata.lodge.name,
      lodgeNumber: ata.lodge.number,
      number: ata.number,
      content: ata.content,
      signers: [],
      minuta: true,
      logoUrl: ata.lodge.logoUrl,
      cabecalho: ata.lodge.ataCabecalho,
      address: ata.lodge.address,
      divisa: ata.lodge.ataDivisa,
    });
    const remetente = (await getGmailAuth(user.lodgeId))?.user;
    if (!remetente) return { error: "Gmail da loja não configurado." };
    await sendLodgeEmail({
      lodgeId: user.lodgeId,
      to: remetente,
      bcc: emails,
      subject: `[Para validação] Ata nº ${ata.number} — ${ata.lodge.name}`,
      text:
        `Ir∴, segue em anexo, para validação, a minuta da Ata nº ${ata.number}, da sessão de ${ata.session.date.toLocaleDateString("pt-BR")}.\n` +
        `Pedidos de ajuste devem ser apresentados na próxima reunião, no momento da validação.`,
      attachments: [
        { filename: `ata-${ata.number}-minuta.pdf`, content: pdf },
      ],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no envio." };
  }
  await prisma.ata.update({
    where: { id: ataId, lodgeId: user.lodgeId },
    data: { status: "EM_VALIDACAO", sentForReviewAt: new Date() },
  });
  revalidatePath(`/secretaria/atas/${ataId}`);
  return { ok: `Minuta enviada para validação a ${emails.length} irmão(s).` };
}

// Trava de Governança: assinatura conjunta VM + Secretário
export async function signAta(ataId: string): Promise<ActionResult> {
  const user = await requireUser();
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId: user.lodgeId },
  });
  if (ata.status === "RASCUNHO" || ata.status === "EM_VALIDACAO") {
    return {
      error:
        "A ata precisa ser validada pelos irmãos e liberada para assinaturas antes de ser assinada.",
    };
  }
  if (ata.status === "ASSINADA") {
    return { error: "Ata já está totalmente assinada." };
  }
  // Fluxos exclusivos: ata encaminhada ao gov.br não tem assinatura interna
  if (ata.govbrSolicitado) {
    return {
      error:
        "Esta ata segue pela assinatura gov.br — não há assinatura interna. Se preferir a assinatura normal, o Secretário deve cancelar o encaminhamento ao gov.br.",
    };
  }

  const data: Record<string, unknown> = {};
  if (user.role === "VENERAVEL_MESTRE" && !ata.signedByMasterId) {
    data.signedByMasterId = user.id;
    data.signedByMasterAt = new Date();
  } else if (user.role === "SECRETARIO" && !ata.signedBySecId) {
    // Ordem de governança: o Venerável Mestre assina primeiro
    if (!ata.signedByMasterId) {
      return {
        error:
          "Aguarde a assinatura do Venerável Mestre — ele assina primeiro.",
      };
    }
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

  // Ata selada: o PDF assinado vai automaticamente ao Drive da Loja
  // (best-effort — falha no Drive não desfaz a assinatura)
  let driveAviso = "";
  if (data.status === "ASSINADA") {
    try {
      if (await isDriveAvailable(user.lodgeId)) {
        await uploadAtaAssinadaToDrive(ataId, user.lodgeId, user.id);
      } else {
        driveAviso =
          " Drive não conectado — o PDF assinado não foi arquivado no Drive.";
      }
    } catch (e) {
      driveAviso = ` Falha ao arquivar no Drive: ${
        e instanceof Error ? e.message : "erro desconhecido"
      }`;
    }
  }

  revalidatePath(`/secretaria/atas/${ataId}`);
  return {
    ok:
      data.status === "ASSINADA"
        ? `Ata assinada por ambos — documento selado e arquivado.${driveAviso}`
        : "Assinatura registrada. Aguardando a segunda assinatura.",
  };
}

// Envia o PDF assinado ao Drive da Loja e registra em Documentos
async function uploadAtaAssinadaToDrive(
  ataId: string,
  lodgeId: string,
  userId: string
) {
  const { ata, pdf } = await gerarPdfAtaAssinada(ataId, lodgeId);
  if (ata.driveFileId) return; // já arquivada
  const fileName = `ata-${ata.number}-assinada.pdf`;
  const driveFileId = await uploadToLodgeDrive(
    lodgeId,
    fileName,
    "application/pdf",
    pdf
  );
  await Promise.all([
    prisma.ata.update({
      where: { id: ataId, lodgeId },
      data: { driveFileId },
    }),
    prisma.document.create({
      data: {
        lodgeId,
        uploadedById: userId,
        title: `Ata nº ${ata.number} (assinada)`,
        type: "ATA_ESCANEADA",
        driveFileId,
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
      },
    }),
  ]);
}

// Upload da ata assinada externamente (assinador.iti.br), em duas etapas na
// mesma ordem de governança: o Venerável Mestre assina e sobe primeiro; o
// Secretário baixa a versão com a assinatura do VM, assina e sobe por último.
// O fluxo gov.br substitui a assinatura interna — a ata vai direto para cá
// após a liberação; a etapa final sela a ata (ASSINADA) e arquiva no Drive.
export async function uploadAtaAssinadaGovbr(
  ataId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId: user.lodgeId },
  });
  if (ata.status === "RASCUNHO" || ata.status === "EM_VALIDACAO") {
    return {
      error:
        "A ata precisa ser validada pelos irmãos e liberada para assinaturas antes do upload.",
    };
  }
  if (!ata.govbrSolicitado) {
    return { error: "Esta ata não foi encaminhada para assinatura gov.br." };
  }

  // Ordem de governança: VM assina primeiro no gov.br; o Secretário, depois
  const etapaVm = !ata.govbrMasterAt;
  if (etapaVm) {
    if (user.role !== "VENERAVEL_MESTRE") {
      return {
        error:
          "O Venerável Mestre assina primeiro no gov.br — aguarde o upload dele.",
      };
    }
  } else {
    if (ata.govbrSecAt) {
      return { error: "A assinatura gov.br desta ata já está concluída." };
    }
    if (user.role !== "SECRETARIO") {
      return {
        error: "Agora é a vez do Secretário assinar e subir o PDF no gov.br.",
      };
    }
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Selecione o PDF assinado no gov.br." };
  }
  if (file.size > 15_000_000) {
    return { error: "Arquivo muito grande — o PDF deve ter até 15 MB." };
  }
  const pdf = Buffer.from(await file.arrayBuffer());
  if (!pdf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return { error: "O arquivo enviado não é um PDF." };
  }
  // Um PDF assinado digitalmente (PAdES) carrega um dicionário de assinatura
  // com /ByteRange — sem isso, o arquivo veio sem a assinatura gov.br.
  if (!pdf.includes("/ByteRange")) {
    return {
      error:
        "O PDF não contém assinatura digital. Assine o arquivo em assinador.iti.br antes de enviar.",
    };
  }

  await prisma.ata.update({
    where: { id: ataId, lodgeId: user.lodgeId },
    data: {
      govbrPdf: new Uint8Array(pdf),
      govbrUploadedAt: new Date(),
      // A 2ª assinatura gov.br sela a ata
      ...(etapaVm
        ? { govbrMasterAt: new Date() }
        : { govbrSecAt: new Date(), status: "ASSINADA" as const }),
    },
  });

  if (etapaVm) {
    revalidatePath(`/secretaria/atas/${ataId}`);
    return {
      ok: "Assinatura gov.br do Venerável Mestre registrada. Agora o Secretário baixa esta versão, assina e sobe o arquivo final.",
    };
  }

  // Etapa final concluída: arquivamento no Drive (best-effort)
  let driveAviso = "";
  try {
    if (await isDriveAvailable(user.lodgeId)) {
      const driveFileId = await uploadToLodgeDrive(
        user.lodgeId,
        `ata-${ata.number}-assinada-govbr.pdf`,
        "application/pdf",
        pdf
      );
      await Promise.all([
        prisma.ata.update({
          where: { id: ataId, lodgeId: user.lodgeId },
          data: { driveFileId },
        }),
        prisma.document.create({
          data: {
            lodgeId: user.lodgeId,
            uploadedById: user.id,
            title: `Ata nº ${ata.number} (assinada gov.br)`,
            type: "ATA_ESCANEADA",
            driveFileId,
            mimeType: "application/pdf",
            sizeBytes: pdf.length,
          },
        }),
      ]);
    } else {
      driveAviso = " Drive não conectado — o arquivo não foi arquivado no Drive.";
    }
  } catch (e) {
    driveAviso = ` Falha ao arquivar no Drive: ${
      e instanceof Error ? e.message : "erro desconhecido"
    }`;
  }

  revalidatePath(`/secretaria/atas/${ataId}`);
  return { ok: `Assinatura gov.br concluída pelos dois cargos.${driveAviso}` };
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

// Upload do anexo da prancha assinado externamente no assinador.iti.br.
// O Secretário baixa o anexo, converte em PDF se preciso, assina com a conta
// gov.br e sobe aqui o PDF assinado — condição para enviar à Guarda dos Selos.
export async function uploadPranchaAssinadaGovbr(
  pranchaId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const prancha = await prisma.prancha.findUniqueOrThrow({
    where: { id: pranchaId, lodgeId: user.lodgeId },
  });
  if (!prancha.driveFileId) {
    return { error: "Esta prancha não tem anexo para assinar." };
  }
  if (prancha.govbrSignedAt) {
    return { error: "O anexo desta prancha já foi assinado no gov.br." };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Selecione o PDF assinado no gov.br." };
  }
  if (file.size > 15_000_000) {
    return { error: "Arquivo muito grande — o PDF deve ter até 15 MB." };
  }
  const pdf = Buffer.from(await file.arrayBuffer());
  if (!pdf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return { error: "O arquivo enviado não é um PDF." };
  }
  // Um PDF assinado digitalmente (PAdES) carrega um dicionário de assinatura
  // com /ByteRange — sem isso, o arquivo veio sem a assinatura gov.br.
  if (!pdf.includes("/ByteRange")) {
    return {
      error:
        "O PDF não contém assinatura digital. Assine o arquivo em assinador.iti.br antes de enviar.",
    };
  }

  await prisma.prancha.update({
    where: { id: pranchaId, lodgeId: user.lodgeId },
    data: { govbrPdf: new Uint8Array(pdf), govbrSignedAt: new Date() },
  });

  // Arquiva a versão assinada no Drive da Loja (best-effort)
  let driveAviso = "";
  try {
    if (await isDriveAvailable(user.lodgeId)) {
      const driveFileId = await uploadToLodgeDrive(
        user.lodgeId,
        `prancha-${prancha.number}-${prancha.year}-assinada-govbr.pdf`,
        "application/pdf",
        pdf
      );
      await prisma.prancha.update({
        where: { id: pranchaId, lodgeId: user.lodgeId },
        data: { driveFileId },
      });
    } else {
      driveAviso =
        " Drive não conectado — a versão assinada não foi arquivada no Drive.";
    }
  } catch (e) {
    driveAviso = ` Falha ao arquivar no Drive: ${
      e instanceof Error ? e.message : "erro desconhecido"
    }`;
  }

  revalidatePath("/secretaria/pranchas");
  return {
    ok: `Anexo assinado no gov.br registrado — a prancha está pronta para envio.${driveAviso}`,
  };
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
  // Trava: prancha com anexo só sai após a assinatura gov.br do anexo
  if (prancha.driveFileId && !prancha.govbrSignedAt) {
    return {
      error:
        "Assine o anexo no gov.br (assinador.iti.br) e suba o PDF assinado antes de enviar à Guarda dos Selos.",
    };
  }
  try {
    await sendLodgeEmail({
      lodgeId: user.lodgeId,
      to: GUARDA_SELOS_EMAIL,
      subject: `Prancha nº ${prancha.number}/${prancha.year} — ${prancha.lodge.name}`,
      text:
        `Destinatário: ${prancha.recipient}\nAssunto: ${prancha.subject}\n\n${prancha.content}` +
        (prancha.govbrSignedAt
          ? `\n\nAnexo assinado digitalmente via gov.br (validável em validar.iti.gov.br).`
          : "") +
        (prancha.driveFileId
          ? `\n\nAnexo (Google Drive): https://drive.google.com/file/d/${prancha.driveFileId}/view`
          : ""),
      attachments: prancha.govbrPdf
        ? [
            {
              filename: `prancha-${prancha.number}-${prancha.year}-assinada-govbr.pdf`,
              content: Buffer.from(prancha.govbrPdf),
            },
          ]
        : undefined,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no envio." };
  }
  return { ok: `Enviada para ${GUARDA_SELOS_EMAIL}.` };
}

// Após as duas assinaturas, a ata é enviada por e-mail a todos os irmãos do quadro
export async function sendAtaToMembers(ataId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId: user.lodgeId },
    include: { lodge: true, session: true },
  });
  if (ata.status !== "ASSINADA") {
    return {
      error: "Somente atas com as duas assinaturas podem ser enviadas aos irmãos.",
    };
  }
  const membros = await prisma.user.findMany({
    where: {
      lodgeId: user.lodgeId,
      status: "ATIVO",
      currentRole: { not: "SUPER_ADMIN" },
    },
    select: { email: true },
  });
  const emails = membros.map((m) => m.email).filter((e) => e.includes("@"));
  if (!emails.length) {
    return { error: "Nenhum irmão ativo com e-mail cadastrado." };
  }
  try {
    // Ata gov.br: o documento que circula é o PDF com as assinaturas gov.br
    const pdf =
      ata.govbrSolicitado && ata.govbrPdf && ata.govbrSecAt
        ? Buffer.from(ata.govbrPdf)
        : (await gerarPdfAtaAssinada(ataId, user.lodgeId)).pdf;
    // Retro-arquivamento: atas assinadas antes do arquivamento automático
    if (!ata.govbrSolicitado && !ata.driveFileId && (await isDriveAvailable(user.lodgeId))) {
      try {
        await uploadAtaAssinadaToDrive(ataId, user.lodgeId, user.id);
      } catch {
        // o envio aos irmãos segue mesmo se o Drive falhar
      }
    }
    const remetente = (await getGmailAuth(user.lodgeId))?.user;
    if (!remetente) return { error: "Gmail da loja não configurado." };
    await sendLodgeEmail({
      lodgeId: user.lodgeId,
      to: remetente,
      bcc: emails,
      subject: `Ata nº ${ata.number} — ${ata.lodge.name}`,
      text: `Ir∴, segue em anexo a Ata nº ${ata.number}, da sessão de ${ata.session.date.toLocaleDateString("pt-BR")}, assinada pelo Venerável Mestre e pelo Secretário.`,
      attachments: [{ filename: `ata-${ata.number}.pdf`, content: pdf }],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no envio." };
  }
  await prisma.ata.update({
    where: { id: ataId, lodgeId: user.lodgeId },
    data: { sentToMembersAt: new Date() },
  });
  revalidatePath(`/secretaria/atas/${ataId}`);
  return { ok: `Ata enviada a ${emails.length} irmão(s) do quadro.` };
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

// ───────────────────── Pipeline de Admissão (Kanban) ─────────────────────

// Move o card no Kanban — só avança/retrocede uma etapa por vez, e a
// entrada em ESCRUTINIO exige que as certidões já tenham sido validadas.
export async function moveProcessoAdmissao(
  processoId: string,
  toStatus: StatusAdmissao
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const processo = await prisma.processoAdmissao.findUniqueOrThrow({
    where: { id: processoId, lodgeId: user.lodgeId },
  });
  if (processo.status === "INICIADO" || processo.status === "REPROVADO") {
    return { error: "Processo já encerrado." };
  }
  if (toStatus === "ESCRUTINIO" && !processo.certidoesValidas) {
    return {
      error: "Marque as certidões como válidas antes do Escrutínio.",
    };
  }
  const data: Record<string, unknown> = { status: toStatus };
  if (toStatus === "ESCRUTINIO" && !processo.dataEscrutinio) {
    data.dataEscrutinio = new Date();
  }
  await prisma.processoAdmissao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data,
  });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Processo atualizado." };
}

export async function setFotoProcessoAdmissao(
  processoId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const foto = await imageToDataUri(
    formData.get("foto") as File | null,
    "A foto do candidato"
  );
  if (foto.error) return { error: foto.error };
  if (!foto.dataUri) return { error: "Selecione uma imagem." };
  await prisma.processoAdmissao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { fotoUrl: foto.dataUri },
  });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Foto do candidato atualizada." };
}

export async function setCertidoesValidas(
  processoId: string,
  value: boolean
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.processoAdmissao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { certidoesValidas: value },
  });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Certidões atualizadas." };
}

export async function reprovarProcessoAdmissao(
  processoId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.processoAdmissao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { status: "REPROVADO", aprovado: false },
  });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Processo reprovado." };
}

// ───────────────────── Quitte Placet ─────────────────────

export async function requestQuittePlacet(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const userId = String(formData.get("userId"));
  const motivo = (formData.get("motivo") as string) || null;
  if (!userId) return { error: "Selecione o obreiro." };

  // Trava financeira: consulta a Tesouraria por pendências (Nada Consta).
  const pendencias = await prisma.invoice.count({
    where: {
      lodgeId: user.lodgeId,
      userId,
      status: { in: ["PENDENTE", "VENCIDA"] },
    },
  });

  await prisma.quittePlacet.create({
    data: {
      lodgeId: user.lodgeId,
      userId,
      motivo,
      quitacaoFinanceira: pendencias === 0,
    },
  });
  revalidatePath("/secretaria/quitte-placets");
  return { ok: "Solicitação de Quitte Placet registrada." };
}

// Reconsulta a Tesouraria e atualiza a variável quitacaoFinanceira (Nada Consta)
export async function refreshQuitacaoFinanceira(
  placetId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const placet = await prisma.quittePlacet.findUniqueOrThrow({
    where: { id: placetId, lodgeId: user.lodgeId },
  });
  const pendencias = await prisma.invoice.count({
    where: {
      lodgeId: user.lodgeId,
      userId: placet.userId,
      status: { in: ["PENDENTE", "VENCIDA"] },
    },
  });
  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data: { quitacaoFinanceira: pendencias === 0 },
  });
  revalidatePath("/secretaria/quitte-placets");
  return {
    ok:
      pendencias === 0
        ? "Nada Consta confirmado pela Tesouraria."
        : `Ainda há ${pendencias} mensalidade(s) pendente(s).`,
  };
}

// Dupla assinatura (VM + Secretário) — só emite com quitacaoFinanceira = true
export async function signQuittePlacet(placetId: string): Promise<ActionResult> {
  const user = await requireUser();
  const placet = await prisma.quittePlacet.findUniqueOrThrow({
    where: { id: placetId, lodgeId: user.lodgeId },
  });
  if (!placet.quitacaoFinanceira) {
    return {
      error:
        "Trava financeira: a Tesouraria ainda não confirmou o Nada Consta.",
    };
  }
  if (placet.status === "APROVADO" || placet.status === "NEGADO") {
    return { error: "Quitte Placet já encerrado." };
  }

  const data: Record<string, unknown> = {};
  if (user.role === "VENERAVEL_MESTRE" && !placet.signedByMasterId) {
    data.signedByMasterId = user.id;
    data.signedByMasterAt = new Date();
  } else if (user.role === "SECRETARIO" && !placet.signedBySecId) {
    data.signedBySecId = user.id;
    data.signedBySecAt = new Date();
  } else {
    return {
      error:
        "Apenas o Venerável Mestre e o Secretário assinam o Quitte Placet (uma vez cada).",
    };
  }

  const willBeMaster = data.signedByMasterId ?? placet.signedByMasterId;
  const willBeSec = data.signedBySecId ?? placet.signedBySecId;
  data.status = willBeMaster && willBeSec ? "APROVADO" : "EM_ANALISE";

  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data,
  });
  revalidatePath("/secretaria/quitte-placets");
  return {
    ok:
      data.status === "APROVADO"
        ? "Quitte Placet assinado por ambos — documento emitido."
        : "Assinatura registrada. Aguardando a segunda assinatura.",
  };
}

export async function negarQuittePlacet(placetId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data: { status: "NEGADO" },
  });
  revalidatePath("/secretaria/quitte-placets");
  return { ok: "Quitte Placet negado." };
}

// ───────────────────────── Progressão de Graus ─────────────────────────
// Pipeline do loja.md §4.B — travas: interstício, frequência, Placet da
// Guarda dos Selos e comunicação de 15 dias pós-cerimônia.

function nextDegreeOf(degree: Degree): Degree | null {
  if (degree === "APRENDIZ") return "COMPANHEIRO";
  if (degree === "COMPANHEIRO") return "MESTRE";
  return null;
}

// Data em que o obreiro cumpre o interstício para o grau alvo (null = sem base)
async function intersticeEligibleDate(
  lodgeId: string,
  userId: string,
  grauAlvo: Degree
): Promise<Date | null> {
  const [lastDegree, member] = await Promise.all([
    prisma.degreeHistory.findFirst({
      where: { lodgeId, userId },
      orderBy: { date: "desc" },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { initiationDate: true },
    }),
  ]);
  return dataMinimaProgressao(
    grauAlvo,
    lastDegree?.date ?? member.initiationDate ?? null
  );
}

export async function createProcessoProgressao(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const userId = String(formData.get("userId") ?? "");
  const member = await prisma.user.findUnique({
    where: { id: userId, lodgeId: user.lodgeId },
    select: { degree: true, status: true, name: true },
  });
  if (!member) return { error: "Obreiro não encontrado." };
  if (member.status !== "ATIVO") {
    return { error: "Somente obreiros ativos podem progredir de grau." };
  }
  const grauAlvo = nextDegreeOf(member.degree);
  if (!grauAlvo) return { error: "Mestre já está no grau máximo simbólico." };

  const aberto = await prisma.processoProgressao.findFirst({
    where: {
      lodgeId: user.lodgeId,
      userId,
      status: { not: "GRAU_CONCEDIDO" },
    },
  });
  if (aberto) return { error: "Já existe processo de progressão em andamento." };

  await prisma.processoProgressao.create({
    data: { lodgeId: user.lodgeId, userId, grauAlvo },
  });
  revalidatePath("/secretaria/progressoes");
  return { ok: `Progressão de ${member.name} iniciada.` };
}

const ORDEM_PROGRESSAO: StatusProgressao[] = [
  "CUMPRIMENTO_INTERSTICIO",
  "INSTRUCAO_E_FREQUENCIA",
  "EXAME_PROFICIENCIA",
  "ESCRUTINIO_PROGRESSAO",
  "AGUARDANDO_PLACET",
  "AGUARDANDO_CERIMONIA",
  "COMUNICACAO_POS_CERIMONIA",
  "GRAU_CONCEDIDO",
];

export async function moveProcessoProgressao(
  processoId: string,
  toStatus: StatusProgressao
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const processo = await prisma.processoProgressao.findUniqueOrThrow({
    where: { id: processoId, lodgeId: user.lodgeId },
    include: { user: { select: { name: true, degree: true } } },
  });
  if (processo.status === "GRAU_CONCEDIDO") {
    return { error: "Processo já encerrado — grau concedido." };
  }
  const fromIdx = ORDEM_PROGRESSAO.indexOf(processo.status);
  const toIdx = ORDEM_PROGRESSAO.indexOf(toStatus);
  if (toIdx === fromIdx) return undefined;

  // Trava 1 — interstício: card só sai da 1ª coluna com o prazo legal cumprido
  if (fromIdx === 0 && toIdx > 0) {
    const eligible = await intersticeEligibleDate(
      user.lodgeId,
      processo.userId,
      processo.grauAlvo
    );
    if (!eligible) {
      return {
        error:
          "Sem data-base do grau atual (iniciação/última progressão) — complete o cadastro do obreiro.",
      };
    }
    if (eligible > new Date()) {
      return {
        error: `Interstício não cumprido: apto a partir de ${eligible.toLocaleDateString("pt-BR")}.`,
      };
    }
  }

  // Trava 2 — frequência: valida o Livro de Presenças durante o processo
  // antes de sair de Instrução e Frequência (mínimo configurável por loja)
  if (
    fromIdx <= ORDEM_PROGRESSAO.indexOf("INSTRUCAO_E_FREQUENCIA") &&
    toIdx > ORDEM_PROGRESSAO.indexOf("INSTRUCAO_E_FREQUENCIA")
  ) {
    const [lodge, sessoes, presencas] = await Promise.all([
      prisma.lodge.findUniqueOrThrow({
        where: { id: user.lodgeId },
        select: { minFreqProgressao: true },
      }),
      prisma.lodgeSession.count({
        where: {
          lodgeId: user.lodgeId,
          date: { gte: processo.dataInicio, lte: new Date() },
        },
      }),
      prisma.attendance.count({
        where: {
          lodgeId: user.lodgeId,
          userId: processo.userId,
          session: { date: { gte: processo.dataInicio, lte: new Date() } },
        },
      }),
    ]);
    if (sessoes > 0) {
      const pct = Math.round((presencas / sessoes) * 100);
      if (pct < lodge.minFreqProgressao) {
        return {
          error: `Frequência insuficiente: ${pct}% (${presencas} presença(s) em ${sessoes} sessão(ões) desde o início do processo). Mínimo da loja: ${lodge.minFreqProgressao}%.`,
        };
      }
    }
  }

  // Trava 2b — instruções: exige o nº de instruções do grau atual definido
  // pela loja antes de sair de Instrução e Frequência
  if (
    fromIdx <= ORDEM_PROGRESSAO.indexOf("INSTRUCAO_E_FREQUENCIA") &&
    toIdx > ORDEM_PROGRESSAO.indexOf("INSTRUCAO_E_FREQUENCIA")
  ) {
    const grauAtual =
      processo.grauAlvo === "COMPANHEIRO" ? Degree.APRENDIZ : Degree.COMPANHEIRO;
    const lodgeInstr = await prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: { instrucoesAprendiz: true, instrucoesCompanheiro: true },
    });
    const necessarias =
      grauAtual === "APRENDIZ"
        ? lodgeInstr.instrucoesAprendiz
        : lodgeInstr.instrucoesCompanheiro;
    if (necessarias > 0) {
      const feitas = await prisma.instrucao.count({
        where: { lodgeId: user.lodgeId, userId: processo.userId, degree: grauAtual },
      });
      if (feitas < necessarias) {
        return {
          error: `Instruções insuficientes: ${feitas} de ${necessarias} exigidas pela loja (registradas pelos Vigilantes em Instruções).`,
        };
      }
    }
  }

  // Trava 3 — Guarda dos Selos: cerimônia só com o Placet deferido
  if (toIdx >= ORDEM_PROGRESSAO.indexOf("AGUARDANDO_CERIMONIA") && !processo.placetDeferido) {
    return {
      error:
        "Aguarde o deferimento do Placet pela Guarda dos Selos antes de agendar a cerimônia.",
    };
  }

  const data: Record<string, unknown> = { status: toStatus };

  // Escrutínio aprovado → registra a data e expede a prancha do Placet
  if (toStatus === "AGUARDANDO_PLACET") {
    if (!processo.dataAprovacao) data.dataAprovacao = new Date();
    const year = new Date().getFullYear();
    const last = await prisma.prancha.findFirst({
      where: { lodgeId: user.lodgeId, year },
      orderBy: { number: "desc" },
    });
    const rito = processo.grauAlvo === "MESTRE" ? "Exaltação" : "Elevação";
    await prisma.prancha.create({
      data: {
        lodgeId: user.lodgeId,
        year,
        number: (last?.number ?? 0) + 1,
        subject: `Solicitação de Placet de ${rito} — ${processo.user.name}`,
        recipient: "Secretaria Estadual da Guarda dos Selos",
        content:
          `Solicitamos o Placet de ${rito.toLowerCase()} do obreiro ${processo.user.name}, ` +
          `aprovado em escrutínio de plenário em ${new Date().toLocaleDateString("pt-BR")}, ` +
          `para o grau de ${processo.grauAlvo === "MESTRE" ? "Mestre" : "Companheiro"}.`,
      },
    });
    revalidatePath("/secretaria/pranchas");
  }

  // Cerimônia realizada → inicia a contagem dos 15 dias de comunicação
  if (toStatus === "COMUNICACAO_POS_CERIMONIA" && !processo.dataCerimonia) {
    data.dataCerimonia = new Date();
  }

  await prisma.processoProgressao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data,
  });

  // Conclusão: atualiza o grau definitivo e o histórico (base do próximo interstício)
  if (toStatus === "GRAU_CONCEDIDO") {
    const date = processo.dataCerimonia ?? new Date();
    await prisma.user.update({
      where: { id: processo.userId, lodgeId: user.lodgeId },
      data: { degree: processo.grauAlvo },
    });
    await prisma.degreeHistory.create({
      data: {
        lodgeId: user.lodgeId,
        userId: processo.userId,
        degree: processo.grauAlvo,
        date,
      },
    });
    revalidatePath("/secretaria/membros");
  }

  revalidatePath("/secretaria/progressoes");
  return { ok: "Processo atualizado." };
}

export async function setPlacetDeferido(
  processoId: string,
  value: boolean
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.processoProgressao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { placetDeferido: value },
  });
  revalidatePath("/secretaria/progressoes");
  return { ok: "Placet atualizado." };
}

export async function setComunicadoEnviado(
  processoId: string,
  value: boolean
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.processoProgressao.update({
    where: { id: processoId, lodgeId: user.lodgeId },
    data: { comunicadoEnviado: value },
  });
  revalidatePath("/secretaria/progressoes");
  return { ok: "Comunicação atualizada." };
}

// ───────────── Familiares (cônjuge e filhos) ─────────────

export async function addFamiliar(
  memberId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const member = await prisma.user.findUnique({
    where: { id: memberId, lodgeId: user.lodgeId },
    select: { id: true },
  });
  if (!member) return { error: "Membro não encontrado." };
  const result = await criarFamiliar(memberId, formData);
  revalidatePath(`/secretaria/membros/${memberId}`);
  return result;
}

export async function updateFamiliar(
  memberId: string,
  familiarId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const member = await prisma.user.findUnique({
    where: { id: memberId, lodgeId: user.lodgeId },
    select: { id: true },
  });
  if (!member) return { error: "Membro não encontrado." };
  const result = await atualizarFamiliar(familiarId, memberId, formData);
  revalidatePath(`/secretaria/membros/${memberId}`);
  return result;
}

export async function removeFamiliar(
  memberId: string,
  familiarId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.familyMember.deleteMany({
    where: { id: familiarId, user: { id: memberId, lodgeId: user.lodgeId } },
  });
  revalidatePath(`/secretaria/membros/${memberId}`);
  return { ok: "Familiar removido." };
}

// ─────────── Candidatos: indicação pelo padrinho e link público ───────────

const ANEXO_MAX_BYTES = 15_000_000;
const ANEXO_TIPOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function validarAnexo(file: File | null): { error: string } | { file: File } {
  if (!file || file.size === 0) return { error: "Selecione o arquivo preenchido." };
  if (!ANEXO_TIPOS.includes(file.type)) {
    return { error: "Envie o formulário em PDF, DOC/DOCX, JPG ou PNG." };
  }
  if (file.size > ANEXO_MAX_BYTES) {
    return { error: "Arquivo muito grande — use até 15 MB." };
  }
  return { file };
}

async function gravarAnexoCandidato(
  processoId: string,
  file: File,
  enviadoPor: string
) {
  await prisma.candidatoAnexo.create({
    data: {
      processoId,
      nome: file.name.slice(0, 200),
      mimeType: file.type,
      sizeBytes: file.size,
      arquivo: Buffer.from(await file.arrayBuffer()),
      enviadoPor,
    },
  });
}

// Cadastro inicial do candidato aberto por qualquer irmão (padrinho). O
// processo entra no pipeline em DOCUMENTACAO e já nasce com o link público
// para o candidato baixar e devolver os formulários de indicação.
export async function indicarCandidato(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const nomeCandidato = String(formData.get("nomeCandidato") ?? "").trim();
  if (!nomeCandidato) return { error: "Informe o nome do candidato." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const foto = await imageToDataUri(
    formData.get("foto") as File | null,
    "A foto do candidato"
  );
  if (foto.error) return { error: foto.error };

  const [processo, responsaveis] = await Promise.all([
    prisma.processoAdmissao.create({
      data: {
        lodgeId: user.lodgeId,
        nomeCandidato,
        cpf: String(formData.get("cpf") ?? "").replace(/\D/g, "") || null,
        email,
        phone: String(formData.get("phone") ?? "").trim() || null,
        fotoUrl: foto.dataUri ?? null,
        padrinhoId: user.id,
        observacoes: String(formData.get("observacoes") ?? "").trim() || null,
      },
    }),
    // Avisa a Secretaria e o Venerável de que há um candidato novo a conferir
    prisma.user.findMany({
      where: {
        lodgeId: user.lodgeId,
        currentRole: { in: ["SECRETARIO", "VENERAVEL_MESTRE"] },
      },
      select: { id: true },
    }),
  ]);
  await prisma.notification.createMany({
    data: responsaveis.map((r) => ({
      lodgeId: user.lodgeId,
      userId: r.id,
      title: "Novo candidato indicado",
      description: `${user.name} indicou ${nomeCandidato} para iniciação.`,
      type: "MISSING_DATA" as const,
      sourceKey: `candidato:${processo.id}:${r.id}`,
      link: "/secretaria/admissoes",
    })),
    skipDuplicates: true,
  });

  // Envia o link ao candidato quando o padrinho informou o e-mail
  if (email) {
    try {
      await sendLodgeEmail({
        lodgeId: user.lodgeId,
        to: email,
        subject: "Formulários de indicação — processo de admissão",
        text:
          `Prezado ${nomeCandidato},\n\n` +
          `Você foi indicado por ${user.name}. Acesse o link abaixo para baixar os ` +
          `formulários de indicação, preenchê-los e devolvê-los pelo próprio link:\n\n` +
          `${appUrl()}/candidato/${processo.token}\n\n` +
          `O link é pessoal — não o compartilhe.`,
      });
    } catch (e) {
      console.error("e-mail do candidato", e);
      revalidatePath("/secretaria/admissoes");
      return {
        ok:
          "Candidato cadastrado. Não foi possível enviar o e-mail — copie o link e entregue ao candidato.",
      };
    }
  }
  revalidatePath("/secretaria/admissoes");
  return {
    ok: email
      ? `Candidato cadastrado e link enviado para ${email}.`
      : "Candidato cadastrado. Copie o link e entregue ao candidato.",
  };
}

// Anexo enviado pelo próprio candidato no link público (sem login)
export async function anexarFormularioCandidatoPublico(
  token: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const processo = await prisma.processoAdmissao.findUnique({
    where: { token },
    select: { id: true, status: true, nomeCandidato: true, lodgeId: true, padrinhoId: true },
  });
  if (!processo) return { error: "Link inválido." };
  if (processo.status === "INICIADO" || processo.status === "REPROVADO") {
    return { error: "Este processo já foi encerrado." };
  }
  const valid = validarAnexo(formData.get("arquivo") as File | null);
  if ("error" in valid) return valid;
  await gravarAnexoCandidato(processo.id, valid.file, "candidato");

  const avisar = await prisma.user.findMany({
    where: {
      lodgeId: processo.lodgeId,
      OR: [
        { currentRole: { in: ["SECRETARIO", "VENERAVEL_MESTRE"] } },
        ...(processo.padrinhoId ? [{ id: processo.padrinhoId }] : []),
      ],
    },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: avisar.map((r) => ({
      lodgeId: processo.lodgeId,
      userId: r.id,
      title: "Formulário do candidato recebido",
      description: `${processo.nomeCandidato} devolveu formulário(s) de indicação.`,
      type: "MISSING_DATA" as const,
      // Chave estável: um aviso por candidato/destinatário, mesmo com vários envios
      sourceKey: `candidato-anexo:${processo.id}:${r.id}`,
      link: "/secretaria/admissoes",
    })),
    skipDuplicates: true,
  });
  revalidatePath(`/candidato/${token}`);
  revalidatePath("/secretaria/admissoes");
  return { ok: "Formulário recebido. Obrigado!" };
}

// Anexos do candidato no painel: só o padrinho ou a Secretaria mexem
function podeEditarAnexosCandidato(
  user: { id: string; role: string },
  processo: { padrinhoId: string | null }
) {
  return canWriteSecretaria(user.role) || processo.padrinhoId === user.id;
}

// Anexo enviado por um irmão (padrinho ou Secretaria) pelo painel
export async function anexarFormularioCandidato(
  processoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const processo = await prisma.processoAdmissao.findUnique({
    where: { id: processoId, lodgeId: user.lodgeId },
    select: { id: true, padrinhoId: true },
  });
  if (!processo) return { error: "Candidato não encontrado." };
  if (!podeEditarAnexosCandidato(user, processo)) {
    return { error: "Só o padrinho ou a Secretaria podem anexar formulários." };
  }
  const valid = validarAnexo(formData.get("arquivo") as File | null);
  if ("error" in valid) return valid;
  await gravarAnexoCandidato(processo.id, valid.file, user.name);
  revalidatePath("/secretaria/admissoes");
  return { ok: "Formulário anexado." };
}

export async function removerAnexoCandidato(
  anexoId: string
): Promise<ActionResult> {
  const user = await requireUser();
  const anexo = await prisma.candidatoAnexo.findUnique({
    where: { id: anexoId },
    select: { id: true, processo: { select: { lodgeId: true, padrinhoId: true } } },
  });
  if (!anexo || anexo.processo.lodgeId !== user.lodgeId) {
    return { error: "Anexo não encontrado." };
  }
  if (!podeEditarAnexosCandidato(user, anexo.processo)) {
    return { error: "Só o padrinho ou a Secretaria podem remover anexos." };
  }
  await prisma.candidatoAnexo.delete({ where: { id: anexoId } });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Anexo removido." };
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

// ───── Quitte Placet: formulário oficial (Form. 122) e etapas do kanban ─────

const QUITTE_FORM = "form-122-quite-placet.docx";

// Anexa o Form. 122 preenchido/assinado ao processo (guardado no banco)
export async function anexarFormularioQuittePlacet(
  placetId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const placet = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    select: { id: true, status: true },
  });
  if (!placet) return { error: "Quitte Placet não encontrado." };
  const valid = validarAnexo(formData.get("arquivo") as File | null);
  if ("error" in valid) return valid;
  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data: {
      formularioArquivo: Buffer.from(await valid.file.arrayBuffer()),
      formularioNome: valid.file.name.slice(0, 200),
      formularioMime: valid.file.type,
      formularioEnviadoAt: null,
    },
  });
  revalidatePath("/secretaria/quitte-placets");
  return { ok: "Formulário anexado ao Quitte Placet." };
}

// Envia o Quitte Placet à Guarda dos Selos com o formulário em anexo
export async function enviarQuittePlacetGSelos(
  placetId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const placet = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    include: {
      lodge: { select: { name: true, number: true } },
      user: { select: { name: true, cim: true } },
    },
  });
  if (!placet) return { error: "Quitte Placet não encontrado." };
  if (!placet.formularioArquivo) {
    return {
      error:
        "Anexe o Form. 122 preenchido e assinado antes de enviar à Guarda dos Selos.",
    };
  }
  if (placet.status !== "APROVADO") {
    return {
      error:
        "O Quitte Placet precisa das assinaturas do Venerável Mestre e do Secretário antes do envio.",
    };
  }
  try {
    await sendLodgeEmail({
      lodgeId: user.lodgeId,
      to: GUARDA_SELOS_EMAIL,
      subject: `Quitte Placet — ${placet.user.name} (CIM ${placet.user.cim}) — ${placet.lodge.name} nº ${placet.lodge.number}`,
      text:
        `Loja ${placet.lodge.name} nº ${placet.lodge.number}\n` +
        `Obreiro: ${placet.user.name} (CIM ${placet.user.cim})\n` +
        (placet.motivo ? `Motivo: ${placet.motivo}\n` : "") +
        `\nSegue em anexo o formulário de Quitte Placet assinado pelo Venerável Mestre e pelo Secretário.`,
      attachments: [
        {
          filename: placet.formularioNome ?? "quitte-placet.pdf",
          content: Buffer.from(placet.formularioArquivo),
        },
      ],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no envio." };
  }
  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data: { formularioEnviadoAt: new Date() },
  });
  revalidatePath("/secretaria/quitte-placets");
  return { ok: `Enviado para ${GUARDA_SELOS_EMAIL}.` };
}

// Move o card no kanban do Quitte Placet. "Em análise" é o início efetivo do
// processo; a aprovação só acontece pelas duas assinaturas (signQuittePlacet).
export async function moveQuittePlacet(
  placetId: string,
  toStatus: StatusPlacet
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const placet = await prisma.quittePlacet.findUniqueOrThrow({
    where: { id: placetId, lodgeId: user.lodgeId },
    select: { status: true },
  });
  if (placet.status === "APROVADO") {
    return { error: "Quitte Placet já aprovado — processo encerrado." };
  }
  if (toStatus === "APROVADO") {
    return {
      error:
        "A aprovação sai das assinaturas do Venerável Mestre e do Secretário, não do arraste.",
    };
  }
  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data: { status: toStatus },
  });
  revalidatePath("/secretaria/quitte-placets");
  return {
    ok:
      toStatus === "EM_ANALISE"
        ? "Processo de Quitte Placet iniciado (em análise)."
        : "Processo atualizado.",
  };
}
