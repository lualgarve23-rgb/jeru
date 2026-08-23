"use server";


import { revalidatePath } from "next/cache";
import {
  StatusPlacet } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { garantirPdf } from "@/lib/docx-pdf";
import { logError } from "@/lib/log";
import { auditar } from "@/lib/audit";
import { requireUser, requireRole } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { sendLodgeEmail, GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import {
  ordemAssinaturaQuitte,
  camposAssinaturaQuitte,
  bloqueioAssinaturaQuitte,
  arquivarQuitteNoDrive,
} from "@/lib/quitte";
import { type ActionResult, requireSecretariaWriter, validarAnexo } from "./_shared";

// ───────────────────── Quitte Placet ─────────────────────

// A carta do pedido é escrita a próprio punho e assinada — chega como foto
// (JPG/PNG) ou digitalizada em PDF; DOC/DOCX não fazem sentido aqui.
const CARTA_TIPOS = ["application/pdf", "image/jpeg", "image/png"];

// Qualquer irmão do quadro (situação ATIVO) solicita o próprio Quitte Placet;
// a Secretaria segue podendo abrir o pedido em nome de um obreiro. A carta de
// próprio punho é obrigatória em ambos os casos — sem ela nada é registrado.
export async function requestQuittePlacet(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const isWriter = canWriteSecretaria(user.role);
  const userId = isWriter
    ? String(formData.get("userId") || user.id)
    : user.id;
  const motivo = (formData.get("motivo") as string) || null;

  const carta = formData.get("carta") as File | null;
  if (!carta || carta.size === 0) {
    return {
      error:
        "Anexe a carta escrita a próprio punho e assinada — ela é obrigatória no pedido.",
    };
  }
  if (!CARTA_TIPOS.includes(carta.type)) {
    return { error: "Envie a carta como foto (JPG/PNG) ou PDF." };
  }
  if (carta.size > 15_000_000) {
    return { error: "Arquivo muito grande — use até 15 MB." };
  }

  const alvo = await prisma.user.findUnique({
    where: { id: userId, lodgeId: user.lodgeId },
    select: { status: true, name: true },
  });
  if (!alvo) return { error: "Obreiro não encontrado." };
  if (alvo.status !== "ATIVO") {
    return {
      error: `${alvo.name} não está com situação ATIVO — regularize a situação com a Tesouraria antes do pedido.`,
    };
  }
  const aberto = await prisma.quittePlacet.findFirst({
    where: {
      lodgeId: user.lodgeId,
      userId,
      status: { in: ["PENDENTE", "EM_ANALISE"] },
    },
  });
  if (aberto) {
    return { error: "Já existe um Quitte Placet em andamento para este irmão." };
  }

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
      cartaArquivo: Buffer.from(await carta.arrayBuffer()),
      cartaNome: carta.name.slice(0, 200),
      cartaMime: carta.type,
    },
  });
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  return {
    ok: "Solicitação de Quitte Placet registrada com a carta anexada — segue para análise da Secretaria.",
  };
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
  revalidatePath("/secretaria/processos");
  return {
    ok:
      pendencias === 0
        ? "Nada Consta confirmado pela Tesouraria."
        : `Ainda há ${pendencias} mensalidade(s) pendente(s).`,
  };
}

// Assinatura gov.br pelo portal assinador.iti.br — mesmo processo do
// atestado: o assinante baixa o Form. 122 (já com as assinaturas anteriores),
// assina com a conta gov.br no portal e sobe o PDF aqui. Ordem de governança:
// Secretário primeiro, Venerável Mestre por último. O OAuth gov.br direto
// vive em /api/govbr/authorize?quitte=.
export async function uploadQuittePlacetAssinadoGovbr(
  placetId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const placet = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    include: { user: { select: { name: true } } },
  });
  if (!placet) return { error: "Quitte Placet não encontrado." };
  const bloqueio = bloqueioAssinaturaQuitte(placet);
  if (bloqueio) return { error: bloqueio };
  const ordem = ordemAssinaturaQuitte(user.role, placet);
  if (ordem.jaAssinou) return { error: "Você já assinou este Quitte Placet." };
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

  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data: {
      govbrPdf: new Uint8Array(pdf),
      ...camposAssinaturaQuitte(user.role, user.id),
      status: ordem.ultimaAssinatura
        ? ("APROVADO" as const)
        : ("EM_ANALISE" as const),
    },
  });
  let driveAviso = "";
  if (ordem.ultimaAssinatura) {
    driveAviso = await arquivarQuitteNoDrive(
      user.lodgeId,
      user.id,
      placetId,
      placet.user.name,
      pdf
    );
  }
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  return {
    ok: ordem.ultimaAssinatura
      ? `Quitte Placet assinado via gov.br pelos dois cargos — documento emitido.${driveAviso}`
      : "PDF assinado recebido — agora o Venerável Mestre baixa esta versão, assina no gov.br e sobe aqui.",
  };
}

export async function negarQuittePlacet(placetId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data: { status: "NEGADO" },
  });
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
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
  if (placet.status === "APROVADO") {
    return { error: "Quitte Placet já emitido — o formulário não pode ser trocado." };
  }
  const valid = validarAnexo(formData.get("arquivo") as File | null);
  if ("error" in valid) return valid;
  // Word (.docx) — o modelo preenchido baixado do sistema — é convertido
  // para PDF aqui, pois o gov.br só assina PDF
  let conv: { pdf: Buffer; nome: string } | null;
  try {
    conv = await garantirPdf(
      Buffer.from(await valid.file.arrayBuffer()),
      valid.file.name,
      valid.file.type
    );
  } catch (e) {
    logError("quitte.docx2pdf", e);
    return { error: "Não foi possível converter o Word para PDF — anexe o Form. 122 em PDF." };
  }
  if (!conv) return { error: "Anexe o Form. 122 em PDF ou Word (.docx)." };
  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data: {
      formularioArquivo: new Uint8Array(conv.pdf),
      formularioNome: conv.nome.slice(0, 200),
      formularioMime: "application/pdf",
      formularioEnviadoAt: null,
      // Trocar o formulário invalida as assinaturas gov.br já colhidas —
      // elas se referem ao arquivo anterior
      govbrPdf: null,
      signedBySecId: null,
      signedBySecAt: null,
      signedByMasterId: null,
      signedByMasterAt: null,
    },
  });
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
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
        "O Quitte Placet precisa das assinaturas gov.br do Secretário e do Venerável Mestre antes do envio.",
    };
  }
  // Vai a versão com as assinaturas PAdES do gov.br embutidas
  const anexo = placet.govbrPdf ?? placet.formularioArquivo;
  const anexoNome = placet.govbrPdf
    ? "quitte-placet-assinado-govbr.pdf"
    : (placet.formularioNome ?? "quitte-placet.pdf");
  try {
    await sendLodgeEmail({
      lodgeId: user.lodgeId,
      to: GUARDA_SELOS_EMAIL,
      subject: `Quitte Placet — ${placet.user.name} (CIM ${placet.user.cim}) — ${placet.lodge.name} nº ${placet.lodge.number}`,
      text:
        `Loja ${placet.lodge.name} nº ${placet.lodge.number}\n` +
        `Obreiro: ${placet.user.name} (CIM ${placet.user.cim})\n` +
        (placet.motivo ? `Motivo: ${placet.motivo}\n` : "") +
        `\nSegue em anexo o formulário de Quitte Placet assinado via gov.br pelo Secretário e pelo Venerável Mestre.`,
      attachments: [
        {
          filename: anexoNome,
          content: Buffer.from(anexo),
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
  revalidatePath("/secretaria/processos");
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
  revalidatePath("/secretaria/processos");
  return {
    ok:
      toStatus === "EM_ANALISE"
        ? "Processo de Quitte Placet iniciado (em análise)."
        : "Processo atualizado.",
  };
}

// Exclusão pela Secretaria (Secretário/VM) — para pedidos em duplicidade.
// Só enquanto não aprovado/enviado; assinaturas parciais não impedem.
export async function excluirQuittePlacet(placetId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const p = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    select: { status: true, userId: true, formularioEnviadoAt: true, signedBySecAt: true },
  });
  if (!p) return { error: "Quitte Placet não encontrado." };
  if (p.status === "APROVADO" || p.formularioEnviadoAt) {
    return { error: "O Quitte Placet já foi aprovado/enviado — não pode ser excluído." };
  }
  await prisma.quittePlacet.delete({ where: { id: placetId } });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "quitte.excluir",
    entidade: "QuittePlacet",
    entidadeId: placetId,
    detalhes: { solicitante: p.userId, status: p.status, assinaturaSec: !!p.signedBySecAt },
  });
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  return { ok: "Quitte Placet excluído." };
}
