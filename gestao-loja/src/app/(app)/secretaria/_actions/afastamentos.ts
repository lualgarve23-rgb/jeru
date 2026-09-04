"use server";

import { revalidatePath } from "next/cache";
import { aposEventoDaLoja } from "@/lib/apos-evento";
import { eventoAfastamento } from "@/lib/eventos-solicitacoes";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log";
import { auditar } from "@/lib/audit";
import { mudarStatusMembro } from "@/lib/status-membro";
import { requireRole } from "@/lib/session";
import { sendLodgeEmail, GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import { validarUploadAssinado } from "@/lib/pdf-assinaturas";
import {
  ARTIGOS_AFASTAMENTO,
  ordemAssinaturaAfastamento,
  camposAssinaturaAfastamento,
  bloqueioAssinaturaAfastamento,
  arquivarAfastamentoNoDrive,
  gerarForm116Pdf,
} from "@/lib/afastamento";
import { type ActionResult, requireSecretariaWriter } from "./_shared";

// ───────────── Pedido de Afastamento (Form. 116) — lado da Secretaria ─────────────

const ROTAS = ["/secretaria/processos", "/solicitacoes", "/solicitacoes/afastamento"];
function revalidar() {
  for (const r of ROTAS) revalidatePath(r);
}

// Após a deliberação em sessão, a Secretaria registra a data da sessão e o
// artigo do Regulamento; o sistema gera o Form. 116 em PDF, que passa a
// aguardar as assinaturas gov.br (Secretário → VM). Reregistrar (enquanto não
// há assinatura) regenera o formulário.
export async function registrarSessaoAfastamento(
  pedidoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const p = await prisma.pedidoAfastamento.findUnique({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    select: {
      status: true,
      signedBySecAt: true,
      signedByMasterAt: true,
      dataSessao: true,
      artigo: true,
    },
  });
  if (!p) return { error: "Pedido não encontrado." };
  if (p.status === "AGUARDANDO_OBREIRO") {
    return { error: "O irmão ainda não assinou o requerimento com a conta gov.br dele." };
  }
  if (!["SOLICITADO", "EM_ASSINATURA"].includes(p.status)) {
    return { error: "Pedido já encerrado." };
  }
  if (p.signedBySecAt || p.signedByMasterAt) {
    return { error: "O Form. 116 já tem assinatura gov.br — não pode ser regenerado." };
  }
  const dataStr = String(formData.get("dataSessao") ?? "");
  const [a, m, d] = dataStr.split("-").map(Number);
  if (!a || !m || !d) return { error: "Informe a data da sessão que deliberou a licença." };
  const dataSessao = new Date(a, m - 1, d);
  const artigo = String(formData.get("artigo") ?? "");
  if (!(ARTIGOS_AFASTAMENTO as readonly string[]).includes(artigo)) {
    return { error: "Selecione o artigo do Regulamento Geral (67 ou 68)." };
  }

  // gerarForm116Pdf lê sessão/artigo do banco, então eles são gravados antes
  // do PDF — se a geração falhar, os valores anteriores são restaurados para
  // não deixar o pedido em estado parcial (sessão registrada sem Form. 116)
  await prisma.pedidoAfastamento.update({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    data: { dataSessao, artigo },
  });
  let pdf: Buffer;
  try {
    pdf = await gerarForm116Pdf(pedidoId, user.lodgeId);
  } catch (e) {
    logError("afastamento.form116", e);
    await prisma.pedidoAfastamento.update({
      where: { id: pedidoId, lodgeId: user.lodgeId },
      data: { dataSessao: p.dataSessao, artigo: p.artigo },
    });
    return { error: "Não foi possível gerar o Form. 116 em PDF — tente novamente." };
  }
  // Só grava se ninguém assinou nem encerrou o pedido nesse meio-tempo
  const gravado = await prisma.pedidoAfastamento.updateMany({
    where: {
      id: pedidoId,
      lodgeId: user.lodgeId,
      status: { in: ["SOLICITADO", "EM_ASSINATURA"] },
      signedBySecAt: null,
      signedByMasterAt: null,
    },
    data: {
      formularioPdf: new Uint8Array(pdf),
      govbrPdf: null,
      status: "EM_ASSINATURA",
    },
  });
  if (gravado.count === 0) {
    return { error: "O pedido mudou de situação enquanto o Form. 116 era gerado — recarregue a página." };
  }
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "afastamento.registrar-sessao",
    entidade: "PedidoAfastamento",
    entidadeId: pedidoId,
    detalhes: { dataSessao: dataStr, artigo },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidar();
  return {
    ok: "Form. 116 gerado — agora o Secretário e, por último, o Venerável Mestre assinam pelo gov.br.",
  };
}

// Assinatura do Form. 116 pelo portal assinador.iti.br (upload do PDF
// assinado). Secretário primeiro, VM por último. O OAuth direto vive em
// /api/govbr/authorize?afastamento=.
export async function uploadForm116AssinadoGovbr(
  pedidoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE");
  const p = await prisma.pedidoAfastamento.findUnique({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    include: { user: { select: { name: true } } },
  });
  if (!p) return { error: "Pedido não encontrado." };
  const bloqueio = bloqueioAssinaturaAfastamento(p);
  if (bloqueio) return { error: bloqueio };
  const ordem = ordemAssinaturaAfastamento(user.role, p);
  if (ordem.jaAssinou) return { error: "Você já assinou este Form. 116." };
  if (ordem.aguardando) {
    return {
      error: `O ${ordem.aguardando} assina primeiro no gov.br — aguarde e baixe o PDF já com a assinatura dele.`,
    };
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Selecione o PDF assinado no gov.br." };
  if (file.size > 15_000_000) return { error: "Arquivo muito grande — o PDF deve ter até 15 MB." };
  const pdf = Buffer.from(await file.arrayBuffer());
  if (!pdf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    return { error: "O arquivo enviado não é um PDF." };
  }
  const { erro: erro } = await validarUploadAssinado({
    cpf: (await prisma.user.findUnique({ where: { id: user.id }, select: { cpf: true } }))?.cpf,
    pdf,
    anterior: p.govbrPdf ? Buffer.from(p.govbrPdf) : null,
    nomeAssinante: user.name,
  });
  if (erro) return { error: erro };

  await prisma.pedidoAfastamento.update({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    data: {
      govbrPdf: new Uint8Array(pdf),
      ...camposAssinaturaAfastamento(user.role, user.id),
      ...(ordem.ultimaAssinatura ? { status: "ASSINADO" as const } : {}),
    },
  });
  await eventoAfastamento(user.lodgeId, pedidoId, "assinatura");
  let driveAviso = "";
  if (ordem.ultimaAssinatura) {
    driveAviso = await arquivarAfastamentoNoDrive(
      user.lodgeId,
      user.id,
      pedidoId,
      p.user.name,
      pdf
    );
  }
  aposEventoDaLoja(user.lodgeId);
  revalidar();
  return {
    ok: ordem.ultimaAssinatura
      ? `Form. 116 assinado pelos dois cargos — pronto para envio à Guarda dos Selos.${driveAviso}`
      : "PDF assinado recebido — agora o Venerável Mestre baixa esta versão, assina no gov.br e sobe aqui.",
  };
}

// Envio à Guarda dos Selos (Form. 116 assinado + requerimento do irmão) e
// mudança da situação do irmão para LICENCIADO
export async function enviarAfastamentoGSelos(pedidoId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const p = await prisma.pedidoAfastamento.findUnique({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    include: {
      lodge: { select: { name: true, number: true } },
      user: { select: { id: true, name: true, cim: true } },
    },
  });
  if (!p) return { error: "Pedido não encontrado." };
  if (p.status !== "ASSINADO" || !p.govbrPdf) {
    return { error: "O Form. 116 precisa das assinaturas gov.br do Secretário e do Venerável Mestre antes do envio." };
  }
  if (p.enviadoAt) return { error: "Já enviado à Guarda dos Selos." };
  const dataSessao = p.dataSessao?.toLocaleDateString("pt-BR") ?? "";
  try {
    await sendLodgeEmail({
      lodgeId: user.lodgeId,
      to: GUARDA_SELOS_EMAIL,
      subject: `Form. 116 — Pedido de Licença — ${p.user.name} (CIM ${p.user.cim}) — ${p.lodge.name} nº ${p.lodge.number}`,
      text:
        `Loja ${p.lodge.name} nº ${p.lodge.number}\n` +
        `Obreiro: ${p.user.name} (CIM ${p.user.cim})\n` +
        `Licença de ${p.dias} dias, concedida em sessão de ${dataSessao} (Art. ${p.artigo} do Regulamento Geral da Federação).\n\n` +
        `Seguem em anexo o Form. 116 assinado via gov.br pelo Secretário e pelo Venerável Mestre ` +
        `e o requerimento do obreiro, assinado via gov.br por ele.`,
      attachments: [
        { filename: "form-116-pedido-licenca-assinado-govbr.pdf", content: Buffer.from(p.govbrPdf) },
        ...(p.requerimentoPdf
          ? [{ filename: "requerimento-do-obreiro-assinado-govbr.pdf", content: Buffer.from(p.requerimentoPdf) }]
          : []),
      ],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no envio." };
  }
  await prisma.pedidoAfastamento.update({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    data: { enviadoAt: new Date(), enviadoPara: GUARDA_SELOS_EMAIL },
  });
  // fim previsto da licença = data da sessão que concedeu + dias pedidos
  const licencaFim = p.dataSessao
    ? new Date(p.dataSessao.getTime() + p.dias * 24 * 60 * 60 * 1000)
    : null;
  await mudarStatusMembro(prisma, {
    userId: p.user.id,
    lodgeId: user.lodgeId,
    novoStatus: "LICENCIADO",
    motivo: `licença de ${p.dias} dias (Form. 116, Art. ${p.artigo})`,
    porUserId: user.id,
    porNome: user.name,
    licencaFim,
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "afastamento.enviar",
    entidade: "PedidoAfastamento",
    entidadeId: pedidoId,
    detalhes: { obreiro: p.user.id, dias: p.dias, para: GUARDA_SELOS_EMAIL, novoStatus: "LICENCIADO" },
  });
  await eventoAfastamento(user.lodgeId, pedidoId, "enviado");
  aposEventoDaLoja(user.lodgeId);
  revalidar();
  revalidatePath("/secretaria/membros");
  return { ok: `Enviado para ${GUARDA_SELOS_EMAIL}. ${p.user.name} passou a LICENCIADO.` };
}

// Indeferimento pela Loja (antes das assinaturas do Form. 116)
export async function indeferirAfastamento(
  pedidoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const p = await prisma.pedidoAfastamento.findUnique({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    select: { status: true, userId: true },
  });
  if (!p) return { error: "Pedido não encontrado." };
  if (p.status === "ASSINADO" || p.status === "INDEFERIDO") {
    return { error: "Pedido já encerrado." };
  }
  const parecer = String(formData.get("parecer") ?? "").trim();
  if (!parecer) return { error: "Informe o motivo do indeferimento — o irmão verá este texto." };
  await prisma.pedidoAfastamento.update({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    data: { status: "INDEFERIDO", parecer: parecer.slice(0, 1000) },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "afastamento.indeferir",
    entidade: "PedidoAfastamento",
    entidadeId: pedidoId,
    detalhes: { solicitante: p.userId },
  });
  await eventoAfastamento(user.lodgeId, pedidoId, "indeferido");
  aposEventoDaLoja(user.lodgeId);
  revalidar();
  return { ok: "Pedido de afastamento indeferido." };
}

// Exclusão (duplicidade) — só antes da conclusão/envio
export async function excluirAfastamento(pedidoId: string): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const p = await prisma.pedidoAfastamento.findUnique({
    where: { id: pedidoId, lodgeId: user.lodgeId },
    select: { status: true, userId: true, enviadoAt: true, signedBySecAt: true },
  });
  if (!p) return { error: "Pedido não encontrado." };
  if (p.status === "ASSINADO" || p.enviadoAt) {
    return { error: "O Form. 116 já foi assinado/enviado — não pode ser excluído." };
  }
  await prisma.pedidoAfastamento.delete({ where: { id: pedidoId } });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "afastamento.excluir",
    entidade: "PedidoAfastamento",
    entidadeId: pedidoId,
    detalhes: { solicitante: p.userId, status: p.status, assinaturaSec: !!p.signedBySecAt },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidar();
  return { ok: "Pedido de afastamento excluído." };
}
