"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/session";
import { auditar } from "@/lib/audit";
import {
  ordemAssinaturaAtestado,
  camposAssinaturaAtestado,
} from "@/lib/atestado";

type ActionResult = { error?: string; ok?: string } | undefined;

// Atestado de Regularidade — o irmão solicita; Tesoureiro, Secretário e
// Venerável Mestre assinam nesta ordem (senha/imagem aqui, ou gov.br via
// /api/govbr/authorize?atestado=).

export async function solicitarAtestado(): Promise<ActionResult> {
  const user = await requireUser();
  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { status: true },
  });
  if (dbUser.status !== "ATIVO") {
    return {
      error:
        "O atestado só pode ser solicitado por membro com situação ATIVO. Regularize sua situação com a Tesouraria.",
    };
  }
  const pendente = await prisma.atestadoRegularidade.findFirst({
    where: { userId: user.id, lodgeId: user.lodgeId, status: "SOLICITADO" },
  });
  if (pendente) {
    return { error: "Você já tem um atestado aguardando assinaturas." };
  }
  await prisma.atestadoRegularidade.create({
    data: { userId: user.id, lodgeId: user.lodgeId },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "atestado.solicitar",
    entidade: "AtestadoRegularidade",
    entidadeId: user.id,
  });
  revalidatePath("/secretaria/atestados");
  return {
    ok: "Atestado solicitado — aguarde as assinaturas do Tesoureiro, do Secretário e do Venerável Mestre.",
  };
}

// Upload do atestado assinado externamente no portal assinador.iti.br —
// mesmo processo das atas: o assinante baixa o PDF, assina com a conta
// gov.br no portal e sobe o arquivo aqui. Ordem de governança: Tesoureiro,
// depois Secretário e por último o Venerável Mestre.
export async function uploadAtestadoAssinadoGovbr(
  atestadoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("TESOUREIRO", "SECRETARIO", "VENERAVEL_MESTRE");
  const atestado = await prisma.atestadoRegularidade.findUnique({
    where: { id: atestadoId, lodgeId: user.lodgeId },
    include: { user: { select: { name: true, status: true } } },
  });
  if (!atestado || atestado.status !== "SOLICITADO") {
    return { error: "Atestado não encontrado ou já concluído." };
  }
  if (atestado.user.status !== "ATIVO") {
    return {
      error: `${atestado.user.name} não está com situação ATIVO — o atestado não pode ser assinado.`,
    };
  }
  const ordem = ordemAssinaturaAtestado(user.role, atestado);
  if (ordem.jaAssinou) {
    return { error: "Você já assinou este atestado." };
  }
  if (ordem.aguardando) {
    return {
      error: `O ${ordem.aguardando} assina primeiro no gov.br — aguarde o upload dele e baixe o PDF já com a assinatura.`,
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

  await prisma.atestadoRegularidade.update({
    where: { id: atestadoId, lodgeId: user.lodgeId },
    data: {
      govbrPdf: new Uint8Array(pdf),
      ...camposAssinaturaAtestado(user.role, user.id),
      ...(ordem.ultimaAssinatura ? { status: "ASSINADO" as const } : {}),
    },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "atestado.assinar-govbr-upload",
    entidade: "AtestadoRegularidade",
    entidadeId: atestadoId,
  });
  revalidatePath("/secretaria/atestados");
  return {
    ok: ordem.ultimaAssinatura
      ? `Atestado de ${atestado.user.name} assinado via gov.br e concluído.`
      : `PDF assinado recebido — agora o ${
          user.role === "TESOUREIRO" ? "Secretário" : "Venerável Mestre"
        } baixa esta versão, assina no gov.br e sobe aqui.`,
  };
}

// Assinatura formal: a re-digitação da senha é o ato de assinatura (mesmo
// padrão das atas); a imagem do assinante (signatureUrl) entra no PDF.
export async function signAtestadoInline(
  atestadoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("TESOUREIRO", "SECRETARIO", "VENERAVEL_MESTRE");
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Digite sua senha para confirmar a assinatura." };
  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!(await bcrypt.compare(password, dbUser.passwordHash))) {
    return { error: "Senha incorreta — assinatura não registrada." };
  }

  const atestado = await prisma.atestadoRegularidade.findUnique({
    where: { id: atestadoId, lodgeId: user.lodgeId },
    include: { user: { select: { name: true, status: true } } },
  });
  if (!atestado) return { error: "Atestado não encontrado." };
  if (atestado.user.status !== "ATIVO") {
    return {
      error: `${atestado.user.name} não está com situação ATIVO — o atestado não pode ser assinado.`,
    };
  }
  const ordem = ordemAssinaturaAtestado(user.role, atestado);
  if (ordem.jaAssinou) {
    return { error: "Você já assinou este atestado." };
  }
  if (ordem.aguardando) {
    return {
      error: `Aguarde a assinatura do ${ordem.aguardando} — a ordem é Tesoureiro, Secretário e Venerável Mestre.`,
    };
  }

  await prisma.atestadoRegularidade.update({
    where: { id: atestadoId, lodgeId: user.lodgeId },
    data: {
      ...camposAssinaturaAtestado(user.role, user.id),
      ...(ordem.ultimaAssinatura ? { status: "ASSINADO" as const } : {}),
    },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "atestado.assinar",
    entidade: "AtestadoRegularidade",
    entidadeId: atestadoId,
  });
  revalidatePath("/secretaria/atestados");
  return {
    ok: ordem.ultimaAssinatura
      ? `Atestado de ${atestado.user.name} assinado e concluído.`
      : `Assinatura registrada — falta a do ${
          user.role === "TESOUREIRO"
            ? "Secretário e a do Venerável Mestre"
            : user.role === "SECRETARIO"
              ? "Venerável Mestre"
              : "Secretário"
        }.`,
  };
}
