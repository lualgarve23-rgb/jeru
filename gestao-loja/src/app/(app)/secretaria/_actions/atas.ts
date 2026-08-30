"use server";


import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  Degree,
  Role,
  SessionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  ataFechadaParaPresencas,
  ERRO_PRESENCAS_TRAVADAS } from "@/lib/ata-regras";
import { cargoCorresponde, type CargoPadrao } from "@/lib/cargos";
import {
  uploadToLodgeDrive,
  isDriveAvailable,
  arquivarVersaoFinalNoDrive,
} from "@/lib/google-drive";
import { sendLodgeEmail, getGmailAuth, GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import { gerarTextoAta } from "@/lib/ata-template";
import { GRAUS_ACERVO } from "@/lib/graus";
import { enfileirar } from "@/lib/fila";
import { arquivarAtaAssinadaNoDrive } from "@/lib/envios";
import { type ActionResult, requireSecretariaWriter } from "./_shared";
import { validarUploadAssinado } from "@/lib/pdf-assinaturas";

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
  if (!(await getGmailAuth(user.lodgeId))) {
    return { error: "Gmail da loja não configurado." };
  }
  // Geração de PDF + envio em massa saem do request — fila (#13)
  await enfileirar("ata.minuta-validacao", {
    lodgeId: user.lodgeId,
    ataId,
  });
  await prisma.ata.update({
    where: { id: ataId, lodgeId: user.lodgeId },
    data: { status: "EM_VALIDACAO", sentForReviewAt: new Date() },
  });
  revalidatePath(`/secretaria/atas/${ataId}`);
  return { ok: `Minuta a caminho de ${emails.length} irmão(s) — envio em instantes.` };
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
        await arquivarAtaAssinadaNoDrive(ataId, user.lodgeId, user.id);
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
  // Confere que é a MESMA ata (versão anterior preservada como prefixo
  // PAdES), que há assinatura nova e que ela é do próprio remetente.
  const erroAssinatura = validarUploadAssinado({
    pdf,
    anterior:
      !etapaVm && ata.govbrPdf ? Buffer.from(ata.govbrPdf) : null,
    nomeAssinante: user.name,
  });
  if (erroAssinatura) {
    return { error: erroAssinatura };
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
    include: { processo: { select: { id: true } } },
  });
  if (!prancha.driveFileId) {
    return { error: "Esta prancha não tem anexo para assinar." };
  }
  if (prancha.govbrSignedAt) {
    return { error: "O anexo desta prancha já foi assinado no gov.br." };
  }
  if (prancha.processo) {
    return {
      error:
        "O anexo desta prancha está na cadeia de assinaturas da seção Processos — as assinaturas acontecem lá.",
    };
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
  // O anexo original fica no Drive (sem versão anterior comparável), então a
  // validação cobre a assinatura em si: precisa existir e ser do remetente.
  const erroAssinatura = validarUploadAssinado({
    pdf,
    anterior: null,
    nomeAssinante: user.name,
  });
  if (erroAssinatura) {
    return { error: erroAssinatura };
  }

  await prisma.prancha.update({
    where: { id: pranchaId, lodgeId: user.lodgeId },
    data: { govbrPdf: new Uint8Array(pdf), govbrSignedAt: new Date() },
  });

  // Arquiva a versão final assinada no Drive da Loja e na Biblioteca,
  // substituindo o anexo preliminar (só a última versão fica no Drive)
  const r = await arquivarVersaoFinalNoDrive({
    lodgeId: user.lodgeId,
    uploadedById: user.id,
    fileName: `prancha-${prancha.number}-${prancha.year}-assinada-govbr.pdf`,
    title: `Prancha nº ${prancha.number}/${prancha.year} — ${prancha.subject} (assinada gov.br)`,
    pdf,
    substituiDriveFileId: prancha.driveFileId,
  });
  const driveAviso = r.aviso;
  if (r.driveFileId) {
    await prisma.prancha.update({
      where: { id: pranchaId, lodgeId: user.lodgeId },
      data: { driveFileId: r.driveFileId },
    });
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
  // Registra o envio — é ele que libera os gates dos kanbans (Placet)
  await prisma.prancha.update({
    where: { id: pranchaId, lodgeId: user.lodgeId },
    data: { enviadaAt: new Date() },
  });
  revalidatePath("/secretaria/pranchas");
  revalidatePath("/secretaria/progressoes");
  revalidatePath("/secretaria/admissoes");
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
  if (!(await getGmailAuth(user.lodgeId))) {
    return { error: "Gmail da loja não configurado." };
  }
  // PDF + Drive + envio em massa saem do request — fila (#13); o handler
  // marca sentToMembersAt ao concluir
  await enfileirar("ata.enviar-membros", {
    lodgeId: user.lodgeId,
    ataId,
    solicitanteId: user.id,
  });
  revalidatePath(`/secretaria/atas/${ataId}`);
  return { ok: `Ata a caminho de ${emails.length} irmão(s) — envio em instantes.` };
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
  const grauMinimo = String(formData.get("grauMinimo") ?? "APRENDIZ");
  if (!(GRAUS_ACERVO as readonly string[]).includes(grauMinimo)) {
    return { error: "Nível de acesso inválido." };
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
        grauMinimo: grauMinimo as never,
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

