import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { sendLodgeEmail, isGmailConfigured } from "@/lib/gmail";
import { sessionTypeLabels } from "@/lib/labels";

// Certificado de Visita da Loja.
// O fundo (templates/certificado-fundo.pdf) é o template oficial da Loja
// (templates/certificado.pptx) renderizado sem os placeholders; aqui apenas
// desenhamos os textos variáveis por cima, nas posições do slide original.
const FUNDO_PATH = path.join(process.cwd(), "templates", "certificado-fundo.pdf");

// Conversão EMU (unidade do PPTX) → pontos PDF
const EMU = 12700;

export type CertificadoVisitaData = {
  nome: string; // nome do visitante
  sessao: string; // descrição da sessão (ex.: "Magna de Iniciação de 05/07/2026")
  email: string; // e-mail do visitante (rodapé)
  veneravel?: string; // nome do Venerável Mestre atual (acima da assinatura)
};

export async function gerarCertificadoVisitaPdf(
  data: CertificadoVisitaData
): Promise<Buffer> {
  const fundo = await PDFDocument.load(await readFile(FUNDO_PATH));
  const doc = await PDFDocument.create();
  const [page] = await doc.copyPages(fundo, [0]);
  doc.addPage(page);

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const H = page.getHeight();
  const vinho = rgb(0.35, 0.08, 0.08);

  // Caixa de texto do slide original: desenha centrado (horizontal e vertical)
  const centered = (
    text: string,
    box: { x: number; y: number; cx: number; cy: number },
    size: number,
    font = bold,
    color = vinho
  ) => {
    if (!text) return;
    let fitted = size;
    while (fitted > 6 && font.widthOfTextAtSize(text, fitted) > box.cx / EMU - 8) {
      fitted -= 1;
    }
    const width = font.widthOfTextAtSize(text, fitted);
    page.drawText(text, {
      x: box.x / EMU + (box.cx / EMU - width) / 2,
      y: H - box.y / EMU - box.cy / EMU / 2 - fitted * 0.36,
      size: fitted,
      font,
      color,
    });
  };

  // Nome do visitante — sobre a linha "CERTIFICAMOS QUE O VAL. Ir."
  centered(data.nome, { x: 916300, y: 5386700, cx: 5734200, cy: 523200 }, 22);
  // Sessão — abaixo de "PARTICIPOU DA SESSÃO"
  centered(data.sessao, { x: 682275, y: 6409050, cx: 6180600, cy: 477000 }, 19);
  // Nome do Venerável Mestre — primeira linha do bloco da assinatura
  if (data.veneravel) {
    centered(
      data.veneravel,
      { x: 2605487, y: 9378210, cx: 2348700, cy: 373200 },
      13,
      bold,
      rgb(0.25, 0.25, 0.25)
    );
  }
  // E-mail do visitante — rodapé (registro)
  if (data.email) {
    page.drawText(data.email, {
      x: 326475 / EMU,
      y: H - 10041250 / EMU - 8,
      size: 6,
      font: regular,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  return Buffer.from(await doc.save());
}

// Gera e envia o Certificado de Visita em PDF para o e-mail do visitante.
// Lança erro se o Gmail não estiver configurado ou o envio falhar.
export async function enviarCertificadoVisita(attendanceId: string) {
  const att = await prisma.attendance.findUniqueOrThrow({
    where: { id: attendanceId },
    include: { session: true, lodge: true },
  });
  if (!att.visitorName || !att.visitorEmail) {
    throw new Error("Presença sem nome ou e-mail de visitante.");
  }
  if (!isGmailConfigured()) {
    throw new Error("Gmail da loja não configurado.");
  }

  const veneravel = await prisma.user.findFirst({
    where: { lodgeId: att.lodgeId, currentRole: "VENERAVEL_MESTRE" },
    select: { name: true },
  });

  const dataSessao = att.session.date.toLocaleDateString("pt-BR");
  const tipo = sessionTypeLabels[att.session.type] ?? att.session.type;
  const pdf = await gerarCertificadoVisitaPdf({
    nome: att.visitorName,
    sessao: `${tipo} realizada em ${dataSessao}`,
    email: att.visitorEmail,
    veneravel: veneravel?.name,
  });

  await sendLodgeEmail({
    to: att.visitorEmail,
    subject: `Certificado de Visita — ${att.lodge.name}`,
    text:
      `Prezado Ir∴ ${att.visitorName},\n\n` +
      `Agradecemos a sua visita à ${att.lodge.name} na Sessão ${tipo} ` +
      `de ${dataSessao}.\n\n` +
      `Segue em anexo o seu Certificado de Visita.\n\nTFA,\n${att.lodge.name}`,
    attachments: [
      { filename: "certificado-de-visita.pdf", content: pdf },
    ],
  });
}
