import { readFile, writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { sendLodgeEmail, isGmailConfigured } from "@/lib/gmail";
import { sessionTypeLabels } from "@/lib/labels";

const execFileAsync = promisify(execFile);

// Certificado de Visita da Loja.
// O fundo é o template PPTX renderizado sem os placeholders; em runtime o
// pdf-lib desenha os textos por cima, nas posições extraídas do slide.
// Cada loja pode subir o próprio template (Lodge.certFundoPdf/certLayout);
// sem upload vale o template padrão em templates/.
const FUNDO_PATH = path.join(process.cwd(), "templates", "certificado-fundo.pdf");
const SLIDE_PATH = "ppt/slides/slide1.xml";

// Conversão EMU (unidade do PPTX) → pontos PDF
const EMU = 12700;

// Placeholders reconhecidos no PPTX (texto literal num run do slide 1)
const PLACEHOLDERS = {
  nome: "<<NOME DO IRMÃO>>",
  sessao: "<<SESSAO>>",
  email: "<<EMAIL>>",
  veneravel: "<<VENERAVEL>>",
} as const;

export type CertBox = {
  x: number; // EMU
  y: number;
  cx: number;
  cy: number;
  size: number; // pt
};

export type CertLayout = {
  nome: CertBox;
  sessao: CertBox;
  email?: CertBox;
  veneravel?: CertBox;
};

// Layout do template padrão (templates/certificado.pptx); o nome do VM vai
// na primeira linha do bloco da assinatura ("Jaime Caruso" no PPTX original).
const DEFAULT_LAYOUT: CertLayout = {
  nome: { x: 916300, y: 5386700, cx: 5734200, cy: 523200, size: 22 },
  sessao: { x: 682275, y: 6409050, cx: 6180600, cy: 477000, size: 19 },
  email: { x: 326475, y: 10041250, cx: 5486400, cy: 276900, size: 6 },
  veneravel: { x: 2605487, y: 9378210, cx: 2348700, cy: 373200, size: 13 },
};

export type CertificadoVisitaData = {
  nome: string; // nome do visitante
  sessao: string; // descrição da sessão (ex.: "Magna realizada em 05/07/2026")
  email: string; // e-mail do visitante (rodapé)
  veneravel?: string; // nome do Venerável Mestre atual
};

// ───────────── Processamento do template enviado pela loja ─────────────

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Extrai as caixas dos placeholders do slide 1. Lança erro se faltar
// <<NOME DO IRMÃO>> ou <<SESSAO>>.
export async function extrairLayoutDoPptx(pptx: Buffer): Promise<CertLayout> {
  const zip = await JSZip.loadAsync(pptx);
  const slide = zip.file(SLIDE_PATH);
  if (!slide) {
    throw new Error("PPTX inválido: o certificado deve ter 1 slide.");
  }
  const xml = await slide.async("string");

  const findBox = (placeholder: string): CertBox | undefined => {
    const escaped = escapeXmlText(placeholder);
    for (const m of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
      const sp = m[0];
      if (!sp.includes(`<a:t>${escaped}</a:t>`)) continue;
      const off = sp.match(/<a:off x="(\d+)" y="(\d+)"/);
      const ext = sp.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      const sz = sp.match(/sz="(\d+)"/);
      if (!off || !ext) continue;
      return {
        x: Number(off[1]),
        y: Number(off[2]),
        cx: Number(ext[1]),
        cy: Number(ext[2]),
        size: sz ? Number(sz[1]) / 100 : 18,
      };
    }
    return undefined;
  };

  const nome = findBox(PLACEHOLDERS.nome);
  const sessao = findBox(PLACEHOLDERS.sessao);
  if (!nome || !sessao) {
    throw new Error(
      `O template precisa dos marcadores ${PLACEHOLDERS.nome} e ${PLACEHOLDERS.sessao} em caixas de texto do slide.`
    );
  }
  return {
    nome,
    sessao,
    email: findBox(PLACEHOLDERS.email),
    veneravel: findBox(PLACEHOLDERS.veneravel),
  };
}

// Esvazia os placeholders e converte o PPTX em PDF (fundo) via LibreOffice.
export async function gerarFundoDoPptx(pptx: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(pptx);
  const slide = zip.file(SLIDE_PATH);
  if (!slide) throw new Error("PPTX inválido.");
  let xml = await slide.async("string");
  for (const ph of Object.values(PLACEHOLDERS)) {
    xml = xml.split(`<a:t>${escapeXmlText(ph)}</a:t>`).join("<a:t></a:t>");
  }
  zip.file(SLIDE_PATH, xml);
  const blanked: Buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const dir = await mkdtemp(path.join(tmpdir(), "cert-"));
  try {
    const src = path.join(dir, "template.pptx");
    await writeFile(src, blanked);
    await execFileAsync(
      "soffice",
      ["--headless", "--convert-to", "pdf", src, "--outdir", dir],
      { timeout: 120_000 }
    ).catch((e) => {
      throw new Error(
        `Falha ao renderizar o template (LibreOffice): ${e instanceof Error ? e.message : e}`
      );
    });
    return await readFile(path.join(dir, "template.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ───────────────────────── Geração do PDF ─────────────────────────

export async function gerarCertificadoVisitaPdf(
  data: CertificadoVisitaData,
  template?: { fundo: Buffer; layout: CertLayout }
): Promise<Buffer> {
  const fundoBytes = template?.fundo ?? (await readFile(FUNDO_PATH));
  const layout = template?.layout ?? DEFAULT_LAYOUT;

  const fundo = await PDFDocument.load(fundoBytes);
  const doc = await PDFDocument.create();
  const [page] = await doc.copyPages(fundo, [0]);
  doc.addPage(page);

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const H = page.getHeight();
  const vinho = rgb(0.35, 0.08, 0.08);

  const centered = (
    text: string,
    box: CertBox,
    font = bold,
    color = vinho
  ) => {
    if (!text) return;
    let fitted = box.size;
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

  centered(data.nome, layout.nome);
  centered(data.sessao, layout.sessao);
  if (data.veneravel && layout.veneravel) {
    centered(data.veneravel, layout.veneravel, bold, rgb(0.25, 0.25, 0.25));
  }
  if (data.email && layout.email) {
    page.drawText(data.email, {
      x: layout.email.x / EMU,
      y: H - layout.email.y / EMU - 8,
      size: layout.email.size,
      font: regular,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  return Buffer.from(await doc.save());
}

// Carrega o template personalizado da loja (ou undefined = padrão)
export async function templateDaLoja(
  lodgeId: string
): Promise<{ fundo: Buffer; layout: CertLayout } | undefined> {
  const lodge = await prisma.lodge.findUnique({
    where: { id: lodgeId },
    select: { certFundoPdf: true, certLayout: true },
  });
  if (!lodge?.certFundoPdf || !lodge.certLayout) return undefined;
  return {
    fundo: Buffer.from(lodge.certFundoPdf),
    layout: lodge.certLayout as CertLayout,
  };
}

// ───────────────────────── Envio por e-mail ─────────────────────────

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
  const pdf = await gerarCertificadoVisitaPdf(
    {
      nome: att.visitorName,
      sessao: `${tipo} realizada em ${dataSessao}`,
      email: att.visitorEmail,
      veneravel: veneravel?.name,
    },
    await templateDaLoja(att.lodgeId)
  );

  await sendLodgeEmail({
    to: att.visitorEmail,
    subject: `Certificado de Visita — ${att.lodge.name}`,
    text:
      `Prezado Ir∴ ${att.visitorName},\n\n` +
      `Agradecemos a sua visita à ${att.lodge.name} na Sessão ${tipo} ` +
      `de ${dataSessao}.\n\n` +
      `Segue em anexo o seu Certificado de Visita.\n\nTFA,\n${att.lodge.name}`,
    attachments: [{ filename: "certificado-de-visita.pdf", content: pdf }],
  });
}
