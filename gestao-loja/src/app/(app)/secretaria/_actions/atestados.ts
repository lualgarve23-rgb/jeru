"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole } from "@/lib/session";
import { auditar } from "@/lib/audit";
import {
  ordemAssinaturaAtestado,
  camposAssinaturaAtestado,
} from "@/lib/atestado";
import { arquivarVersaoFinalNoDrive, slugNome } from "@/lib/google-drive";
import { validarUploadAssinado } from "@/lib/pdf-assinaturas";

type ActionResult = { error?: string; ok?: string } | undefined;

// Atestado de Regularidade — o irmão solicita; Tesoureiro, Secretário e
// Venerável Mestre assinam nesta ordem, sempre pelo gov.br (OAuth via
// /api/govbr/authorize?atestado=, ou upload do PDF assinado no portal ITI).

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
  revalidatePath("/secretaria/processos");
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
  // Confere que é o mesmo documento (versão anterior preservada como prefixo
  // PAdES), que há assinatura nova e que ela é do próprio remetente — evita
  // subir um PDF antigo ou o documento de outro irmão por engano.
  const erroAssinatura = validarUploadAssinado({
    pdf,
    anterior: atestado.govbrPdf ? Buffer.from(atestado.govbrPdf) : null,
    nomeAssinante: user.name,
  });
  if (erroAssinatura) {
    return { error: erroAssinatura };
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
  // Última assinatura: arquivamento no Drive da Loja (best-effort, como as atas)
  let driveAviso = "";
  if (ordem.ultimaAssinatura) {
    driveAviso = await arquivarAtestadoNoDrive(
      user.lodgeId,
      user.id,
      atestadoId,
      atestado.user.name,
      pdf
    );
  }

  revalidatePath("/secretaria/atestados");
  revalidatePath("/secretaria/processos");
  return {
    ok: ordem.ultimaAssinatura
      ? `Atestado de ${atestado.user.name} assinado via gov.br e concluído.${driveAviso}`
      : `PDF assinado recebido — agora o ${
          user.role === "TESOUREIRO" ? "Secretário" : "Venerável Mestre"
        } baixa esta versão, assina no gov.br e sobe aqui.`,
  };
}

// Sobe o PDF final ao Drive da Loja e registra na Biblioteca. Retorna um
// aviso (string vazia se tudo certo) para anexar à mensagem de sucesso.
export async function arquivarAtestadoNoDrive(
  lodgeId: string,
  uploadedById: string,
  atestadoId: string,
  nomeMembro: string,
  pdf: Buffer
): Promise<string> {
  const r = await arquivarVersaoFinalNoDrive({
    lodgeId,
    uploadedById,
    fileName: `atestado-regularidade-${slugNome(nomeMembro)}-${atestadoId.slice(-6)}.pdf`,
    title: `Atestado de Regularidade — ${nomeMembro} (assinado gov.br)`,
    pdf,
  });
  if (r.driveFileId) {
    await prisma.atestadoRegularidade.update({
      where: { id: atestadoId, lodgeId },
      data: { driveFileId: r.driveFileId },
    });
  }
  return r.aviso;
}

// Exclusão pela Secretaria (Secretário/VM) — para pedidos em duplicidade.
// Só enquanto ainda não concluído; assinaturas parciais não impedem.
export async function excluirAtestado(atestadoId: string): Promise<ActionResult> {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const a = await prisma.atestadoRegularidade.findUnique({
    where: { id: atestadoId, lodgeId: user.lodgeId },
    select: { status: true, userId: true, signedByTesAt: true, signedBySecAt: true },
  });
  if (!a) return { error: "Atestado não encontrado." };
  if (a.status === "ASSINADO") {
    return { error: "O atestado já foi concluído — não pode ser excluído." };
  }
  await prisma.atestadoRegularidade.delete({ where: { id: atestadoId } });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "atestado.excluir",
    entidade: "AtestadoRegularidade",
    entidadeId: atestadoId,
    detalhes: { solicitante: a.userId, assinaturas: [a.signedByTesAt, a.signedBySecAt].filter(Boolean).length },
  });
  revalidatePath("/secretaria/atestados");
  revalidatePath("/secretaria/processos");
  return { ok: "Atestado excluído." };
}
