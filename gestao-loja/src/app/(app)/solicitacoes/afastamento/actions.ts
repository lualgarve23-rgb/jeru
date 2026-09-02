"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { auditar } from "@/lib/audit";
import { validarUploadAssinado } from "@/lib/pdf-assinaturas";
import { DIAS_MAX_AFASTAMENTO } from "@/lib/afastamento";

type ActionResult = { error?: string; ok?: string } | undefined;

const ROTAS = ["/solicitacoes", "/solicitacoes/afastamento", "/secretaria/processos"];
function revalidar() {
  for (const r of ROTAS) revalidatePath(r);
}

// O irmão abre o pedido de afastamento: o sistema gera o requerimento e ele
// precisa assiná-lo com a própria conta gov.br (OAuth ou portal ITI) para o
// pedido chegar à Secretaria.
export async function solicitarAfastamento(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const dias = Number(formData.get("dias"));
  const dataInicioStr = String(formData.get("dataInicio") ?? "");

  if (motivo.length < 10) {
    return { error: "Descreva o motivo do afastamento (pelo menos 10 caracteres)." };
  }
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAX_AFASTAMENTO) {
    return { error: `Informe o prazo em dias (1 a ${DIAS_MAX_AFASTAMENTO}).` };
  }
  let dataInicio: Date | null = null;
  if (dataInicioStr) {
    const [a, m, d] = dataInicioStr.split("-").map(Number);
    if (!a || !m || !d) return { error: "Data de início inválida." };
    dataInicio = new Date(a, m - 1, d);
  }

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { status: true, cpf: true },
  });
  if (dbUser.status !== "ATIVO") {
    return {
      error: `Sua situação atual é ${dbUser.status} — o pedido de afastamento é para membros com situação ATIVO.`,
    };
  }
  if (!dbUser.cpf) {
    return {
      error: "Seu CPF não está cadastrado — a assinatura gov.br confere o CPF. Atualize o Meu perfil ou peça à Secretaria.",
    };
  }
  const aberto = await prisma.pedidoAfastamento.findFirst({
    where: {
      lodgeId: user.lodgeId,
      userId: user.id,
      status: { in: ["AGUARDANDO_OBREIRO", "SOLICITADO", "EM_ASSINATURA"] },
    },
    select: { id: true },
  });
  if (aberto) return { error: "Você já tem um pedido de afastamento em andamento." };

  const pedido = await prisma.pedidoAfastamento.create({
    data: {
      lodgeId: user.lodgeId,
      userId: user.id,
      motivo: motivo.slice(0, 2000),
      dias,
      dataInicio,
    },
    select: { id: true },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "afastamento.solicitar",
    entidade: "PedidoAfastamento",
    entidadeId: pedido.id,
    detalhes: { dias },
  });
  revalidar();
  return {
    ok: "Requerimento gerado — agora assine-o com a sua conta gov.br para o pedido seguir à Secretaria.",
  };
}

// Assinatura do requerimento pelo portal assinador.iti.br: o irmão baixa o
// PDF, assina com a conta gov.br e sobe aqui. O OAuth direto vive em
// /api/govbr/authorize?afastamento=.
export async function uploadRequerimentoAssinadoGovbr(
  pedidoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const p = await prisma.pedidoAfastamento.findUnique({
    where: { id: pedidoId, lodgeId: user.lodgeId, userId: user.id },
    select: { status: true },
  });
  if (!p) return { error: "Pedido não encontrado." };
  if (p.status !== "AGUARDANDO_OBREIRO") {
    return { error: "Este requerimento já foi assinado." };
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Selecione o PDF assinado no gov.br." };
  if (file.size > 15_000_000) return { error: "Arquivo muito grande — o PDF deve ter até 15 MB." };
  const pdf = Buffer.from(await file.arrayBuffer());
  if (!pdf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return { error: "O arquivo enviado não é um PDF." };
  }
  const erro = validarUploadAssinado({ pdf, anterior: null, nomeAssinante: user.name });
  if (erro) return { error: erro };

  await prisma.pedidoAfastamento.update({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    data: {
      requerimentoPdf: new Uint8Array(pdf),
      requerimentoSignedAt: new Date(),
      status: "SOLICITADO",
    },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "afastamento.assinar-requerimento",
    entidade: "PedidoAfastamento",
    entidadeId: pedidoId,
    detalhes: { via: "portal-iti" },
  });
  revalidar();
  return {
    ok: "Requerimento assinado — o pedido seguiu à Secretaria para deliberação em sessão.",
  };
}

// O irmão desiste antes da deliberação (requerimento ainda não apreciado)
export async function cancelarAfastamento(pedidoId: string): Promise<ActionResult> {
  const user = await requireUser();
  const p = await prisma.pedidoAfastamento.findUnique({
    where: { id: pedidoId, lodgeId: user.lodgeId, userId: user.id },
    select: { status: true },
  });
  if (!p) return { error: "Pedido não encontrado." };
  if (!["AGUARDANDO_OBREIRO", "SOLICITADO"].includes(p.status)) {
    return { error: "O pedido já está em andamento na Secretaria — fale com o Secretário." };
  }
  await prisma.pedidoAfastamento.delete({ where: { id: pedidoId } });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "afastamento.cancelar",
    entidade: "PedidoAfastamento",
    entidadeId: pedidoId,
    detalhes: { status: p.status },
  });
  revalidar();
  return { ok: "Pedido de afastamento cancelado." };
}
