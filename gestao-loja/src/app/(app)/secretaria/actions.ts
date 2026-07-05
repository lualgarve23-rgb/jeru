"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  Degree,
  Role,
  SessionType,
  StatusAdmissao,
  StatusProgressao,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria, INTERSTICE_MONTHS } from "@/lib/permissions";
import { uploadToLodgeDrive, isDriveAvailable } from "@/lib/google-drive";
import { sendLodgeEmail, GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import { gerarTextoAta } from "@/lib/ata-template";

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
    include: {
      lodge: true,
      attendances: { include: { user: true }, orderBy: { checkedInAt: "asc" } },
    },
  });
  const last = await prisma.ata.findFirst({
    where: { lodgeId: user.lodgeId },
    orderBy: { number: "desc" },
  });

  // Pré-preenche o rascunho com o modelo da Loja e os dados da sessão
  const membros = session.attendances.filter((a) => a.user);
  const byRole = (role: Role) =>
    membros.find((a) => a.user!.currentRole === role)?.user!.name ?? null;
  const content = gerarTextoAta({
    lodgeName: `${session.lodge.name} nº ${session.lodge.number}`,
    address: session.lodge.address,
    degree: session.degree,
    type: session.type,
    date: session.date,
    masterName: byRole("VENERAVEL_MESTRE"),
    secretaryName: byRole("SECRETARIO"),
    treasurerName: byRole("TESOUREIRO"),
    dirCerimoniasName: byRole("DIRETOR_CERIMONIAS"),
    guardaInternoName: byRole("GUARDA_INTERNO"),
    presentes: membros
      .filter(
        (a) =>
          !["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO", "DIRETOR_CERIMONIAS", "GUARDA_INTERNO"].includes(
            a.user!.currentRole
          )
      )
      .map((a) => ({ name: a.user!.name })),
    visitantes: session.attendances
      .filter((a) => !a.user && a.visitorName)
      .map((a) => ({
        name: a.visitorName!,
        lodge: a.visitorLodge,
        potencia: a.visitorPotencia,
      })),
    totalMembros: membros.length,
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

// ───────────────────── Pipeline de Admissão (Kanban) ─────────────────────

export async function createProcessoAdmissao(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const nomeCandidato = String(formData.get("nomeCandidato")).trim();
  if (!nomeCandidato) return { error: "Informe o nome do candidato." };
  await prisma.processoAdmissao.create({
    data: {
      lodgeId: user.lodgeId,
      nomeCandidato,
      cpf: (formData.get("cpf") as string)?.replace(/\D/g, "") || null,
      email: (formData.get("email") as string)?.trim().toLowerCase() || null,
      phone: (formData.get("phone") as string) || null,
    },
  });
  revalidatePath("/secretaria/admissoes");
  return { ok: "Candidato incluído no pipeline de admissão." };
}

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
  const base = lastDegree?.date ?? member.initiationDate;
  if (!base) return null;
  const eligible = new Date(base);
  eligible.setMonth(eligible.getMonth() + INTERSTICE_MONTHS[grauAlvo]);
  return eligible;
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
