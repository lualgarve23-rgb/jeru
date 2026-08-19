import { prisma } from "@/lib/prisma";
import { sendLodgeEmail, getGmailAuth } from "@/lib/gmail";
import { renderConvite, arteDoConvite } from "@/lib/convite";
import { arteComDados } from "@/lib/convite-arte";
import { gerarAtaPdf } from "@/lib/ata-pdf";
import { gerarPdfAtaAssinada } from "@/lib/ata-final";
import { isDriveAvailable, uploadToLodgeDrive } from "@/lib/google-drive";

// Envios de e-mail em massa da Secretaria — executados pela fila (#13,
// lib/fila.ts), fora do request. Lançam Error em falha (a fila faz retry).
// As validações de permissão/estado ficam nas actions, ANTES de enfileirar.

async function emailsDoQuadro(lodgeId: string): Promise<string[]> {
  const membros = await prisma.user.findMany({
    where: { lodgeId, status: "ATIVO", currentRole: { not: "SUPER_ADMIN" } },
    select: { email: true },
  });
  return membros.map((m) => m.email).filter((e) => e.includes("@"));
}

async function remetenteDa(lodgeId: string): Promise<string> {
  const remetente = (await getGmailAuth(lodgeId))?.user;
  if (!remetente) throw new Error("Gmail da loja não configurado.");
  return remetente;
}

// Convite de sessão a todo o quadro (BCC preserva os endereços)
export async function enviarConvitesSessao(lodgeId: string, sessionId: string) {
  const session = await prisma.lodgeSession.findUniqueOrThrow({
    where: { id: sessionId, lodgeId },
    include: { lodge: true },
  });
  const emails = await emailsDoQuadro(lodgeId);
  if (!emails.length) return;

  const baseUrl = process.env.APP_URL ?? "http://localhost:3100";
  const inviteUrl = `${baseUrl}/convite/${session.inviteToken}`;
  // Template de imagem: desenha os dados da sessão dentro da própria arte e a
  // envia como anexo inline (cid:) — base64 no HTML estoura o limite de ~102KB
  // do Gmail, que exibe o convite cortado ("[Mensagem cortada]") e sem a imagem
  const arte = arteDoConvite(session.lodge.conviteTemplateHtml);
  const arteFinal = arte ? await arteComDados(arte, session) : null;
  const html = renderConvite(
    session.lodge,
    session,
    inviteUrl,
    arteFinal ? "cid:convite-arte" : null
  );
  const dataFmt = session.date.toLocaleDateString("pt-BR");
  await sendLodgeEmail({
    lodgeId,
    to: await remetenteDa(lodgeId),
    bcc: emails,
    subject: `Convite — Sessão de ${dataFmt} · ${session.lodge.name}`,
    text: `Convite para a sessão de ${dataFmt}. Confirme sua presença e o Ágape em: ${inviteUrl}`,
    html,
    attachments: arteFinal
      ? [
          {
            filename: "convite.jpg",
            content: Buffer.from(arteFinal.split(",")[1], "base64"),
            cid: "convite-arte",
            contentType: "image/jpeg",
          },
        ]
      : undefined,
  });
}

// Minuta da ata para validação pelos irmãos
export async function enviarMinutaAtaValidacao(lodgeId: string, ataId: string) {
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId },
    include: { lodge: true, session: true },
  });
  const emails = await emailsDoQuadro(lodgeId);
  if (!emails.length) return;

  const pdf = await gerarAtaPdf({
    lodgeName: ata.lodge.name,
    lodgeNumber: ata.lodge.number,
    number: ata.number,
    content: ata.content,
    signers: [],
    minuta: true,
    logoUrl: ata.lodge.logoUrl,
    cabecalho: ata.lodge.ataCabecalho,
    address: ata.lodge.address,
    divisa: ata.lodge.ataDivisa,
  });
  await sendLodgeEmail({
    lodgeId,
    to: await remetenteDa(lodgeId),
    bcc: emails,
    subject: `[Para validação] Ata nº ${ata.number} — ${ata.lodge.name}`,
    text:
      `Ir∴, segue em anexo, para validação, a minuta da Ata nº ${ata.number}, da sessão de ${ata.session.date.toLocaleDateString("pt-BR")}.\n` +
      `Pedidos de ajuste devem ser apresentados na próxima reunião, no momento da validação.`,
    attachments: [{ filename: `ata-${ata.number}-minuta.pdf`, content: pdf }],
  });
}

// Envia o PDF assinado ao Drive da Loja e registra em Documentos
export async function arquivarAtaAssinadaNoDrive(
  ataId: string,
  lodgeId: string,
  userId: string
) {
  const { ata, pdf } = await gerarPdfAtaAssinada(ataId, lodgeId);
  if (ata.driveFileId) return; // já arquivada
  const fileName = `ata-${ata.number}-assinada.pdf`;
  const driveFileId = await uploadToLodgeDrive(
    lodgeId,
    fileName,
    "application/pdf",
    pdf
  );
  await Promise.all([
    prisma.ata.update({
      where: { id: ataId, lodgeId },
      data: { driveFileId },
    }),
    prisma.document.create({
      data: {
        lodgeId,
        uploadedById: userId,
        title: `Ata nº ${ata.number} (assinada)`,
        type: "ATA_ESCANEADA",
        driveFileId,
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
      },
    }),
  ]);
}

// Ata assinada aos irmãos do quadro; marca sentToMembersAt ao concluir.
// `solicitanteId` assina o retro-arquivamento em Documentos.
export async function enviarAtaAssinadaAosMembros(
  lodgeId: string,
  ataId: string,
  solicitanteId: string
) {
  const ata = await prisma.ata.findUniqueOrThrow({
    where: { id: ataId, lodgeId },
    include: { lodge: true, session: true },
  });
  const emails = await emailsDoQuadro(lodgeId);
  if (!emails.length) return;

  // Ata gov.br: o documento que circula é o PDF com as assinaturas gov.br
  const pdf =
    ata.govbrSolicitado && ata.govbrPdf && ata.govbrSecAt
      ? Buffer.from(ata.govbrPdf)
      : (await gerarPdfAtaAssinada(ataId, lodgeId)).pdf;
  // Retro-arquivamento: atas assinadas antes do arquivamento automático
  if (
    !ata.govbrSolicitado &&
    !ata.driveFileId &&
    (await isDriveAvailable(lodgeId))
  ) {
    try {
      await arquivarAtaAssinadaNoDrive(ataId, lodgeId, solicitanteId);
    } catch {
      // o envio aos irmãos segue mesmo se o Drive falhar
    }
  }
  await sendLodgeEmail({
    lodgeId,
    to: await remetenteDa(lodgeId),
    bcc: emails,
    subject: `Ata nº ${ata.number} — ${ata.lodge.name}`,
    text: `Ir∴, segue em anexo a Ata nº ${ata.number}, da sessão de ${ata.session.date.toLocaleDateString("pt-BR")}, assinada pelo Venerável Mestre e pelo Secretário.`,
    attachments: [{ filename: `ata-${ata.number}.pdf`, content: pdf }],
  });
  await prisma.ata.update({
    where: { id: ataId, lodgeId },
    data: { sentToMembersAt: new Date() },
  });
}
