"use server";


import { revalidatePath } from "next/cache";
import {
  StatusPlacet } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendLodgeEmail, GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import { type ActionResult, requireSecretariaWriter, validarAnexo } from "./_shared";

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
