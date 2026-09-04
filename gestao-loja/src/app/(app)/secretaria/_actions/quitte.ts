"use server";


import { revalidatePath } from "next/cache";
import { aposEventoDaLoja } from "@/lib/apos-evento";
import { eventoQuitte } from "@/lib/eventos-solicitacoes";
import {
  StatusPlacet } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { garantirPdf } from "@/lib/docx-pdf";
import { logError } from "@/lib/log";
import { auditar } from "@/lib/audit";
import { mudarStatusMembro } from "@/lib/status-membro";
import { requireUser, requireRole } from "@/lib/session";
import { notificarEvento, usuariosDoCargo } from "@/lib/notificar-evento";
import { canWriteSecretaria } from "@/lib/permissions";
import { sendLodgeEmail, GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import {
  ordemAssinaturaQuitte,
  camposAssinaturaQuitte,
  bloqueioAssinaturaQuitte,
  arquivarQuitteNoDrive,
  cargoQuitteDoUsuario,
  cargoAssinanteQuitte,
  proximoCargoQuitte,
  temPendenciaFinanceira,
  recalcularQuitacaoQuitte,
} from "@/lib/quitte";
import { validarUploadAssinado } from "@/lib/pdf-assinaturas";
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

  // Trava financeira (Nada Consta): só capitação VENCIDA bloqueia — uma
  // PENDENTE dentro do prazo não é pendência. Recalculado a cada baixa.
  const abertas = await prisma.invoice.findMany({
    where: {
      lodgeId: user.lodgeId,
      userId,
      status: { in: ["PENDENTE", "VENCIDA"] },
    },
    select: { status: true, dueDate: true },
  });
  const quitacao = !temPendenciaFinanceira(abertas);

  const criado = await prisma.quittePlacet.create({
    data: {
      lodgeId: user.lodgeId,
      userId,
      motivo,
      quitacaoFinanceira: quitacao,
      quitacaoConsultadaAt: new Date(),
      cartaArquivo: Buffer.from(await carta.arrayBuffer()),
      cartaNome: carta.name.slice(0, 200),
      cartaMime: carta.type,
    },
    select: { id: true },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "quitte.solicitar",
    entidade: "QuittePlacet",
    entidadeId: criado.id,
    detalhes: {
      solicitante: userId,
      emNomeDe: userId !== user.id,
      quitacaoFinanceira: quitacao,
      carta: carta.name.slice(0, 200),
    },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  return {
    ok: "Solicitação de Quitte Placet registrada com a carta anexada — segue para análise da Secretaria.",
  };
}

// Reconsulta a Tesouraria e atualiza a variável quitacaoFinanceira (Nada
// Consta). O mesmo recálculo roda sozinho a cada baixa de capitação; o
// bloqueio das assinaturas só cai sem capitações vencidas OU com o Nada
// Consta confirmado pelo Tesoureiro (confirmarNadaConstaQuitte).
export async function refreshQuitacaoFinanceira(
  placetId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const placet = await prisma.quittePlacet.findUniqueOrThrow({
    where: { id: placetId, lodgeId: user.lodgeId },
    select: { userId: true, quitacaoConfirmadaAt: true },
  });
  const { quitacao, vencidas } = await recalcularQuitacaoQuitte(user.lodgeId, placet.userId);
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  if (placet.quitacaoConfirmadaAt) {
    return {
      ok: quitacao
        ? "Nada Consta confirmado pela Tesouraria — sem capitações vencidas."
        : `Nada Consta confirmado pelo Tesoureiro, apesar de ${vencidas} capitação(ões) vencida(s).`,
    };
  }
  return {
    ok: quitacao
      ? "Nada Consta: nenhuma capitação vencida."
      : `Ainda há ${vencidas} capitação(ões) vencida(s) — o Tesoureiro pode confirmar o Nada Consta em Processos.`,
  };
}

// Confirmação do Nada Consta pelo Tesoureiro (ou pelo VM): libera a trava
// financeira mesmo com capitações em aberto — equivale a um override, fica
// auditado e o Secretário é avisado. Só em placets em andamento.
export async function confirmarNadaConstaQuitte(
  placetId: string
): Promise<ActionResult> {
  const user = await requireRole("TESOUREIRO", "VENERAVEL_MESTRE");
  const placet = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    select: {
      status: true,
      userId: true,
      quitacaoConfirmadaAt: true,
      user: { select: { name: true } },
    },
  });
  if (!placet) return { error: "Quitte Placet não encontrado." };
  if (placet.status !== "PENDENTE" && placet.status !== "EM_ANALISE") {
    return { error: "Quitte Placet já encerrado." };
  }
  if (placet.quitacaoConfirmadaAt) {
    return { ok: "O Nada Consta deste Quitte Placet já estava confirmado." };
  }
  const abertas = await prisma.invoice.findMany({
    where: { lodgeId: user.lodgeId, userId: placet.userId, status: { in: ["PENDENTE", "VENCIDA"] } },
    select: { status: true, dueDate: true },
  });
  const vencidas = abertas.filter((i) => temPendenciaFinanceira([i])).length;
  const agora = new Date();
  const r = await prisma.quittePlacet.updateMany({
    where: {
      id: placetId,
      lodgeId: user.lodgeId,
      status: { in: ["PENDENTE", "EM_ANALISE"] },
    },
    data: {
      quitacaoFinanceira: true,
      quitacaoConsultadaAt: agora,
      quitacaoConfirmadaPorId: user.id,
      quitacaoConfirmadaAt: agora,
    },
  });
  if (r.count === 0) return { error: "O Quitte Placet mudou de situação — recarregue a página." };
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "quitte.nada-consta",
    entidade: "QuittePlacet",
    entidadeId: placetId,
    detalhes: {
      solicitante: placet.userId,
      capitacoesEmAberto: abertas.length,
      capitacoesVencidas: vencidas,
      override: vencidas > 0,
    },
  });
  const secretarios = await usuariosDoCargo(prisma, user.lodgeId, "SECRETARIO");
  const destinos: (string | null)[] = secretarios.length ? secretarios : [null];
  for (const userId of destinos) {
    await notificarEvento(prisma, {
      lodgeId: user.lodgeId,
      sourceKey: `qp-nada-consta:${placetId}${userId ? `:${userId}` : ""}`,
      userId,
      type: "FINANCIAL_APPROVAL",
      title: `Tesoureiro confirmou o Nada Consta — Quitte Placet de ${placet.user.name}`,
      description:
        `${user.name} (${user.role === "TESOUREIRO" ? "Tesoureiro" : "Venerável Mestre"}) confirmou o Nada Consta` +
        (vencidas > 0 ? ` apesar de ${vencidas} capitação(ões) vencida(s)` : "") +
        ". A trava financeira foi liberada — o processo segue para a sessão de comunicação e as assinaturas.",
      link: `/secretaria/processos?destaque=quitte-${placetId}#quitte-${placetId}`,
    });
  }
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  return {
    ok:
      vencidas > 0
        ? `Nada Consta confirmado apesar de ${vencidas} capitação(ões) vencida(s) — registrado na auditoria e o Secretário foi avisado.`
        : "Nada Consta confirmado — o Secretário foi avisado.",
  };
}

// Assinatura gov.br pelo portal assinador.iti.br — mesmo processo do
// atestado: o assinante baixa o Form. 122 (já com as assinaturas anteriores),
// assina com a conta gov.br no portal e sobe o PDF aqui. Ordem de governança:
// Secretário, Orador (cargo do rito) e Venerável Mestre por último. O OAuth
// gov.br direto vive em /api/govbr/authorize?quitte=.
export async function uploadQuittePlacetAssinadoGovbr(
  placetId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireUser();
  const meu = await prisma.user.findUnique({
    where: { id: user.id },
    select: { cargoRito: true },
  });
  const placet = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    include: { user: { select: { name: true } } },
  });
  if (!placet) return { error: "Quitte Placet não encontrado." };
  // Cargo da vez entre os do usuário (quem acumula dois cargos assina por ambos)
  const cargo = cargoQuitteDoUsuario(user.role, meu?.cargoRito, placet);
  if (!cargo) {
    return { error: "O seu cargo não assina o Quitte Placet (Secretário, Orador e Venerável Mestre)." };
  }
  const bloqueio = bloqueioAssinaturaQuitte(placet);
  if (bloqueio) return { error: bloqueio };
  const ordem = ordemAssinaturaQuitte(cargo, placet);
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
  // Confere que é a continuação do documento em curso (versão gov.br anterior
  // preservada como prefixo PAdES), que há assinatura nova e que ela é do
  // próprio remetente — mesma proteção do atestado/atas contra subir um PDF
  // antigo ou de outro documento por engano.
  const { erro: erroAssinatura } = await validarUploadAssinado({
    cpf: (await prisma.user.findUnique({ where: { id: user.id }, select: { cpf: true } }))?.cpf,
    pdf,
    anterior: placet.govbrPdf ? Buffer.from(placet.govbrPdf) : null,
    nomeAssinante: user.name,
  });
  if (erroAssinatura) {
    return { error: erroAssinatura };
  }

  // Trava otimista (updatedAt lido): outra assinatura gravada em paralelo
  // invalida esta
  const gravado = await prisma.quittePlacet.updateMany({
    where: { id: placetId, lodgeId: user.lodgeId, updatedAt: placet.updatedAt },
    data: {
      govbrPdf: new Uint8Array(pdf),
      ...camposAssinaturaQuitte(cargo, user.id),
      status: ordem.ultimaAssinatura
        ? ("APROVADO" as const)
        : ("EM_ANALISE" as const),
    },
  });
  if (gravado.count === 0) {
    return { error: "Outra assinatura foi gravada neste Quitte Placet enquanto você enviava — recarregue e tente de novo." };
  }
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "quitte.assinar",
    entidade: "QuittePlacet",
    entidadeId: placetId,
    detalhes: { via: "portal-iti", cargo, aprovou: ordem.ultimaAssinatura },
  });
  await eventoQuitte(user.lodgeId, placetId, "assinatura");
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
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  const proximo = proximoCargoQuitte({
    ...placet,
    ...camposAssinaturaQuitte(cargo, user.id),
  });
  return {
    ok: ordem.ultimaAssinatura
      ? `Quitte Placet assinado via gov.br pelos três cargos — documento emitido.${driveAviso}`
      : `PDF assinado recebido — agora o ${cargoAssinanteQuitte(proximo!)} baixa esta versão, assina no gov.br e sobe aqui.`,
  };
}

// Negativa pela Secretaria, com parecer obrigatório exibido ao irmão. Só de
// PENDENTE/EM_ANALISE — um placet APROVADO (três assinaturas gov.br) ou já
// NEGADO não muda de estado por aqui.
export async function negarQuittePlacet(
  placetId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const parecer = String(formData.get("parecer") ?? "").trim().slice(0, 2000);
  if (!parecer) return { error: "Escreva o parecer da negativa — ele é exibido ao irmão." };
  const placet = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    select: { status: true, userId: true },
  });
  if (!placet) return { error: "Quitte Placet não encontrado." };
  if (placet.status !== "PENDENTE" && placet.status !== "EM_ANALISE") {
    return { error: "Só um Quitte Placet pendente ou em análise pode ser negado." };
  }
  const r = await prisma.quittePlacet.updateMany({
    where: {
      id: placetId,
      lodgeId: user.lodgeId,
      status: { in: ["PENDENTE", "EM_ANALISE"] },
    },
    data: { status: "NEGADO", parecerNegativa: parecer },
  });
  if (r.count === 0) return { error: "O Quitte Placet mudou de situação — recarregue a página." };
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "quitte.negar",
    entidade: "QuittePlacet",
    entidadeId: placetId,
    detalhes: { solicitante: placet.userId, de: placet.status, parecer },
  });
  await eventoQuitte(user.lodgeId, placetId, "negado");
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  revalidatePath("/solicitacoes");
  return { ok: "Quitte Placet negado — o parecer fica visível ao irmão." };
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
      signedByOradorId: null,
      signedByOradorAt: null,
      signedByMasterId: null,
      signedByMasterAt: null,
    },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  return { ok: "Formulário anexado ao Quitte Placet." };
}

// Registra a sessão em que o pedido foi comunicado à Loja e anexa a ata dessa
// sessão (PDF ou imagem). Feito pela Secretaria em Processos; sem os dois as
// assinaturas gov.br ficam bloqueadas. Pode ser refeito enquanto não emitido.
export async function registrarSessaoQuittePlacet(
  placetId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const placet = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    select: { id: true, status: true, ataNome: true },
  });
  if (!placet) return { error: "Quitte Placet não encontrado." };
  if (placet.status === "APROVADO" || placet.status === "NEGADO") {
    return { error: "Quitte Placet já encerrado." };
  }
  const dataStr = String(formData.get("dataSessao") ?? "").trim();
  const data = dataStr ? new Date(`${dataStr}T12:00:00`) : null;
  if (!data || Number.isNaN(data.getTime())) {
    return { error: "Informe a data da sessão em que o pedido foi comunicado." };
  }
  if (data.getTime() > Date.now()) {
    return { error: "A data da sessão de comunicação não pode ser futura." };
  }
  const file = formData.get("ata") as File | null;
  const temArquivo = !!file && file.size > 0;
  if (!temArquivo && !placet.ataNome) {
    return { error: "Anexe a ata da sessão em que o pedido foi comunicado." };
  }
  let ata: { ataArquivo: Uint8Array<ArrayBuffer>; ataNome: string; ataMime: string } | null = null;
  if (temArquivo) {
    if (file.size > 15_000_000) {
      return { error: "Arquivo muito grande — a ata deve ter até 15 MB." };
    }
    const mime = file.type || "application/octet-stream";
    if (mime !== "application/pdf" && !mime.startsWith("image/")) {
      return { error: "A ata deve ser um PDF ou uma imagem." };
    }
    ata = {
      ataArquivo: new Uint8Array(await file.arrayBuffer()),
      ataNome: file.name.slice(0, 200),
      ataMime: mime,
    };
  }
  await prisma.quittePlacet.update({
    where: { id: placetId, lodgeId: user.lodgeId },
    data: { dataSessaoComunicacao: data, ...(ata ?? {}) },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "quitte.sessao",
    entidade: "QuittePlacet",
    entidadeId: placetId,
    detalhes: { dataSessao: dataStr, ata: ata?.ataNome ?? placet.ataNome },
  });
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  return { ok: "Sessão de comunicação registrada e ata anexada ao Quitte Placet." };
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
        "O Quitte Placet precisa das assinaturas gov.br do Secretário, do Orador e do Venerável Mestre antes do envio.",
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
        `\nSegue em anexo o formulário de Quitte Placet assinado via gov.br pelo Secretário, pelo Orador e pelo Venerável Mestre.`,
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
  // Quitte Placet enviado à Guarda dos Selos = desligamento do quadro
  await mudarStatusMembro(prisma, {
    userId: placet.userId,
    lodgeId: user.lodgeId,
    novoStatus: "EX_MEMBRO",
    motivo: "Quitte Placet enviado à Guarda dos Selos",
    porUserId: user.id,
    porNome: user.name,
  });
  await eventoQuitte(user.lodgeId, placetId, "enviado");
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  revalidatePath("/secretaria/membros");
  return { ok: `Enviado para ${GUARDA_SELOS_EMAIL}. ${placet.user.name} passou a Ex-membro.` };
}

// Move o card no kanban do Quitte Placet — só entre PENDENTE e EM_ANALISE.
// A aprovação sai das três assinaturas gov.br (Secretário, Orador, VM) e a
// negativa da ação explícita com parecer; APROVADO e NEGADO são finais.
export async function moveQuittePlacet(
  placetId: string,
  toStatus: StatusPlacet
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const placet = await prisma.quittePlacet.findUnique({
    where: { id: placetId, lodgeId: user.lodgeId },
    select: { status: true },
  });
  if (!placet) return { error: "Quitte Placet não encontrado." };
  if (placet.status === "APROVADO" || placet.status === "NEGADO") {
    return { error: "Quitte Placet já encerrado — não pode ser reaberto pelo arraste." };
  }
  if (toStatus === "APROVADO") {
    return {
      error:
        "A aprovação sai das assinaturas do Secretário, do Orador e do Venerável Mestre, não do arraste.",
    };
  }
  if (toStatus === "NEGADO") {
    return { error: "Use o botão “Negar” e informe o parecer — a negativa não sai do arraste." };
  }
  if (toStatus === placet.status) return { ok: "Processo atualizado." };
  const r = await prisma.quittePlacet.updateMany({
    where: {
      id: placetId,
      lodgeId: user.lodgeId,
      status: { in: ["PENDENTE", "EM_ANALISE"] },
    },
    data: { status: toStatus },
  });
  if (r.count === 0) return { error: "O Quitte Placet mudou de situação — recarregue a página." };
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "quitte.mover",
    entidade: "QuittePlacet",
    entidadeId: placetId,
    detalhes: { de: placet.status, para: toStatus },
  });
  aposEventoDaLoja(user.lodgeId);
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
  aposEventoDaLoja(user.lodgeId);
  revalidatePath("/secretaria/quitte-placets");
  revalidatePath("/secretaria/processos");
  return { ok: "Quitte Placet excluído." };
}
