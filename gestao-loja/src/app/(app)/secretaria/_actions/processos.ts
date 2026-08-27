"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { garantirPdf } from "@/lib/docx-pdf";
import { logError } from "@/lib/log";
import { auditar } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { downloadFromLodgeDrive } from "@/lib/google-drive";
import { validarUploadAssinado } from "@/lib/pdf-assinaturas";
import { sendLodgeEmail, GUARDA_SELOS_EMAIL } from "@/lib/gmail";
import {
  montarCadeiaProcesso,
  estadoProcesso,
  cargosProcessoDoUsuario,
  cargoLabel,
  concluirProcessoNaPrancha,
} from "@/lib/processos";
import { type ActionResult, requireSecretariaWriter } from "./_shared";

// ───────────── Processos: cadeia ordenada de assinaturas gov.br ─────────────

function lerCadeiaDoForm(formData: FormData) {
  // Selects ordenados assinante1..assinante4 — vazios são ignorados;
  // o Venerável Mestre entra automaticamente como último
  return montarCadeiaProcesso(
    [1, 2, 3, 4].map((n) => String(formData.get(`assinante${n}`) ?? ""))
  );
}

// Abre um processo de assinaturas para um documento avulso (formulário GOB
// preenchido, ofício etc.) — o arquivo precisa estar em PDF para receber as
// assinaturas PAdES.
export async function criarProcessoDocumento(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { error: "Informe o título do documento." };

  const file = formData.get("arquivo") as File | null;
  if (!file || file.size === 0) {
    return { error: "Selecione o documento (PDF ou Word .docx)." };
  }
  if (file.size > 15_000_000) {
    return { error: "Arquivo muito grande — o documento deve ter até 15 MB." };
  }
  // Word (.docx) é convertido para PDF no servidor: o gov.br só assina PDF
  let conv: { pdf: Buffer; nome: string } | null;
  try {
    conv = await garantirPdf(Buffer.from(await file.arrayBuffer()), file.name, file.type);
  } catch (e) {
    logError("processo.docx2pdf", e);
    return { error: "Não foi possível converter o Word para PDF — envie o documento em PDF." };
  }
  if (!conv) return { error: "O arquivo enviado não é PDF nem Word (.docx)." };
  const pdf = conv.pdf;
  const arquivoNome = conv.nome;

  const cadeia = lerCadeiaDoForm(formData);
  await prisma.processoDocumento.create({
    data: {
      lodgeId: user.lodgeId,
      titulo,
      arquivo: new Uint8Array(pdf),
      arquivoNome: arquivoNome.slice(0, 200),
      criadoPorId: user.id,
      assinantes: {
        create: cadeia.map((cargo, i) => ({ ordem: i + 1, cargo })),
      },
    },
  });
  revalidatePath("/secretaria/processos");
  return {
    ok: `Processo aberto — ordem de assinatura: ${cadeia
      .map(cargoLabel)
      .join(" → ")}.`,
  };
}

// Encaminha o anexo de uma prancha para a cadeia de assinaturas. O anexo é
// baixado do Drive da Loja e precisa ser PDF; ao concluir as assinaturas a
// versão assinada volta para a prancha (govbrPdf/govbrSignedAt), liberando o
// envio à Guarda dos Selos.
export async function criarProcessoDaPrancha(
  pranchaId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const prancha = await prisma.prancha.findUnique({
    where: { id: pranchaId, lodgeId: user.lodgeId },
    include: { processo: { select: { id: true } } },
  });
  if (!prancha) return { error: "Prancha não encontrada." };
  if (prancha.processo) {
    return { error: "Esta prancha já tem um processo de assinaturas aberto." };
  }
  if (prancha.govbrSignedAt) {
    return { error: "O anexo desta prancha já foi assinado no gov.br." };
  }
  if (!prancha.driveFileId) {
    return { error: "Esta prancha não tem anexo para assinar." };
  }

  let pdf: Buffer;
  let nome: string;
  try {
    const baixado = await downloadFromLodgeDrive(
      user.lodgeId,
      prancha.driveFileId
    );
    pdf = Buffer.from(baixado.data);
    nome = baixado.name;
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Falha ao baixar o anexo do Drive.",
    };
  }
  // Anexo em Word (.docx, caso dos formulários GOB preenchidos) é
  // convertido para PDF aqui — o gov.br só assina PDF
  let conv: { pdf: Buffer; nome: string } | null;
  try {
    conv = await garantirPdf(pdf, nome);
  } catch (e) {
    logError("processo.docx2pdf", e);
    return { error: "Não foi possível converter o anexo Word para PDF — anexe-o em PDF." };
  }
  if (!conv) {
    return {
      error:
        "O anexo da prancha não está em PDF nem Word (.docx) — converta-o em PDF e anexe novamente antes de abrir o processo.",
    };
  }
  pdf = conv.pdf;
  nome = conv.nome;

  const cadeia = lerCadeiaDoForm(formData);
  await prisma.processoDocumento.create({
    data: {
      lodgeId: user.lodgeId,
      titulo: `Prancha nº ${prancha.number}/${prancha.year} — ${prancha.subject}`,
      arquivo: new Uint8Array(pdf),
      arquivoNome: nome.slice(0, 200),
      criadoPorId: user.id,
      pranchaId: prancha.id,
      assinantes: {
        create: cadeia.map((cargo, i) => ({ ordem: i + 1, cargo })),
      },
    },
  });
  revalidatePath("/secretaria/processos");
  revalidatePath("/secretaria/pranchas");
  return {
    ok: `Anexo encaminhado aos Processos — ordem de assinatura: ${cadeia
      .map(cargoLabel)
      .join(" → ")}.`,
  };
}

// Assinatura gov.br pelo portal assinador.iti.br — o assinante da vez baixa o
// PDF (já com as assinaturas anteriores), assina no portal e sobe aqui.
// O OAuth gov.br direto vive em /api/govbr/authorize?processo=.
export async function uploadProcessoAssinadoGovbr(
  documentoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  // Qualquer cargo da cadeia (inclusive Orador/Vigilantes, pelo cargo do
  // rito) — a elegibilidade real é decidida por estadoProcesso abaixo
  const user = await requireUser();
  const doc = await prisma.processoDocumento.findUnique({
    where: { id: documentoId, lodgeId: user.lodgeId },
    include: { assinantes: true },
  });
  if (!doc) return { error: "Processo não encontrado." };
  if (doc.status === "ASSINADO") {
    return { error: "Este documento já está com todas as assinaturas." };
  }
  const estado = estadoProcesso(await cargosProcessoDoUsuario(user), doc.assinantes);
  if (!estado.souAssinante) {
    return { error: "O seu cargo não está na cadeia de assinantes deste documento." };
  }
  if (estado.jaAssinou) return { error: "Você já assinou este documento." };
  if (!estado.minhaVez) {
    return {
      error: `O ${estado.aguardando} assina primeiro — aguarde o upload dele e baixe o PDF já com a assinatura.`,
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
  const erroAssinatura = validarUploadAssinado({
    pdf,
    anterior: doc.govbrPdf ? Buffer.from(doc.govbrPdf) : null,
    nomeAssinante: user.name,
  });
  if (erroAssinatura) {
    return { error: erroAssinatura };
  }

  const meu = doc.assinantes.find((a) => a.cargo === estado.cargo)!;
  await prisma.$transaction([
    prisma.processoAssinante.update({
      where: { id: meu.id },
      data: { signedById: user.id, signedAt: new Date() },
    }),
    prisma.processoDocumento.update({
      where: { id: documentoId, lodgeId: user.lodgeId },
      data: {
        govbrPdf: new Uint8Array(pdf),
        ...(estado.ultimaAssinatura ? { status: "ASSINADO" as const } : {}),
      },
    }),
  ]);
  let driveAviso = "";
  if (estado.ultimaAssinatura) {
    driveAviso = await concluirProcessoNaPrancha(documentoId, user.lodgeId, user.id);
    revalidatePath("/secretaria/pranchas");
  }
  revalidatePath("/secretaria/processos");
  return {
    ok: estado.ultimaAssinatura
      ? `Documento assinado por toda a cadeia — processo concluído.${driveAviso}`
      : "PDF assinado recebido — o processo segue para o próximo assinante da cadeia.",
  };
}

// Envio do documento assinado — só após TODA a cadeia assinar. O sistema
// pergunta o destinatário: a Guarda dos Selos fica em destaque como padrão,
// e o Secretário pode copiar irmãos do quadro no e-mail.
export async function enviarProcessoDocumento(
  documentoId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const doc = await prisma.processoDocumento.findUnique({
    where: { id: documentoId, lodgeId: user.lodgeId },
    include: {
      lodge: { select: { name: true, number: true } },
      assinantes: {
        orderBy: { ordem: "asc" },
        include: { signedBy: { select: { name: true } } },
      },
    },
  });
  if (!doc) return { error: "Processo não encontrado." };
  if (doc.status !== "ASSINADO" || !doc.govbrPdf) {
    return {
      error:
        "O documento só pode ser enviado após TODAS as assinaturas gov.br da cadeia.",
    };
  }

  const destino = String(formData.get("destino") ?? "gselos");
  let para = GUARDA_SELOS_EMAIL;
  if (destino === "outro") {
    para = String(formData.get("destinoEmail") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) {
      return { error: "Informe um e-mail de destinatário válido." };
    }
  }

  // Irmãos copiados (CC) — escolhidos pelo Secretário no envio
  const ccIds = formData.getAll("cc").map(String).filter(Boolean);
  const ccEmails = ccIds.length
    ? (
        await prisma.user.findMany({
          where: { id: { in: ccIds }, lodgeId: user.lodgeId },
          select: { email: true },
        })
      ).map((m) => m.email)
    : [];

  const assinaturas = doc.assinantes
    .map(
      (a) =>
        `${cargoLabel(a.cargo)}: ${a.signedBy?.name ?? "—"} em ${
          a.signedAt?.toLocaleDateString("pt-BR") ?? "—"
        }`
    )
    .join("\n");
  try {
    await sendLodgeEmail({
      lodgeId: user.lodgeId,
      to: para,
      cc: ccEmails.length ? ccEmails : undefined,
      subject: `${doc.titulo} — ${doc.lodge.name} nº ${doc.lodge.number}`,
      text:
        `Loja ${doc.lodge.name} nº ${doc.lodge.number}\n\n` +
        `Segue em anexo o documento "${doc.titulo}", assinado digitalmente via gov.br ` +
        `(validável em validar.iti.gov.br) pela seguinte cadeia:\n\n${assinaturas}`,
      attachments: [
        {
          filename: "documento-assinado-govbr.pdf",
          content: Buffer.from(doc.govbrPdf),
        },
      ],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no envio." };
  }

  await prisma.processoDocumento.update({
    where: { id: documentoId, lodgeId: user.lodgeId },
    data: { enviadoAt: new Date(), enviadoPara: para },
  });
  // Prancha de origem: registra o envio (libera os gates dos kanbans)
  if (doc.pranchaId) {
    await prisma.prancha.update({
      where: { id: doc.pranchaId, lodgeId: user.lodgeId },
      data: { enviadaAt: new Date() },
    });
    revalidatePath("/secretaria/pranchas");
    revalidatePath("/secretaria/progressoes");
    revalidatePath("/secretaria/admissoes");
  }
  revalidatePath("/secretaria/processos");
  return {
    ok: `Documento enviado para ${para}${
      ccEmails.length ? ` com cópia a ${ccEmails.length} irmão(s)` : ""
    }.`,
  };
}

// Exclui um processo aberto por engano — só antes de qualquer assinatura
export async function excluirProcessoDocumento(
  documentoId: string
): Promise<ActionResult> {
  const user = await requireSecretariaWriter();
  const doc = await prisma.processoDocumento.findUnique({
    where: { id: documentoId, lodgeId: user.lodgeId },
    include: { assinantes: { select: { signedAt: true } } },
  });
  if (!doc) return { error: "Processo não encontrado." };
  // Assinaturas parciais não impedem (casos de duplicidade); só o
  // documento já expedido fica protegido
  if (doc.enviadoAt) {
    return { error: "O processo já foi enviado — não pode ser excluído." };
  }
  await prisma.processoDocumento.delete({
    where: { id: documentoId, lodgeId: user.lodgeId },
  });
  await auditar({
    lodgeId: user.lodgeId,
    ator: user,
    acao: "processo.excluir",
    entidade: "ProcessoDocumento",
    entidadeId: documentoId,
    detalhes: { titulo: doc.titulo, assinaturas: doc.assinantes.filter((a) => a.signedAt).length },
  });
  revalidatePath("/secretaria/processos");
  revalidatePath("/secretaria/pranchas");
  return { ok: "Processo excluído." };
}
