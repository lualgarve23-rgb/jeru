import { readFile, writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHmac, timingSafeEqual } from "node:crypto";
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
export const EMU = 12700;

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
export const DEFAULT_LAYOUT: CertLayout = {
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

// Fundo em vigor (PDF): o upload da loja ou o template padrão do repositório
export async function fundoAtual(lodgeId: string): Promise<Buffer> {
  const lodge = await prisma.lodge.findUnique({
    where: { id: lodgeId },
    select: { certFundoPdf: true },
  });
  return lodge?.certFundoPdf
    ? Buffer.from(lodge.certFundoPdf)
    : await readFile(FUNDO_PATH);
}

// Carrega o template personalizado da loja (ou undefined = padrão)
export async function templateDaLoja(
  lodgeId: string
): Promise<{ fundo: Buffer; layout: CertLayout } | undefined> {
  const lodge = await prisma.lodge.findUnique({
    where: { id: lodgeId },
    select: { certFundoPdf: true, certLayout: true },
  });
  // Loja pode personalizar só o layout (editor visual) mantendo o fundo
  // padrão, ou o fundo (PPTX) com o layout extraído/ajustado
  if (!lodge?.certFundoPdf && !lodge?.certLayout) return undefined;
  return {
    fundo: lodge.certFundoPdf
      ? Buffer.from(lodge.certFundoPdf)
      : await readFile(FUNDO_PATH),
    layout: (lodge.certLayout as CertLayout | null) ?? DEFAULT_LAYOUT,
  };
}

// ───────────────────────── Envio por e-mail ─────────────────────────

// Gera e envia o Certificado de Visita em PDF para o e-mail do visitante.
// Lança erro se o Gmail não estiver configurado ou o envio falhar.
// Gera o PDF do Certificado de Visita de uma presença de visitante (usado no
// e-mail e no link público do WhatsApp). O e-mail é opcional aqui.
export async function gerarCertificadoDaPresenca(attendanceId: string) {
  const att = await prisma.attendance.findUniqueOrThrow({
    where: { id: attendanceId },
    include: { session: true, lodge: true },
  });
  if (!att.visitorName) throw new Error("Presença sem nome de visitante.");
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
      email: att.visitorEmail ?? "",
      veneravel: veneravel?.name,
    },
    await templateDaLoja(att.lodgeId)
  );
  return { att, pdf, tipo, dataSessao };
}

export async function enviarCertificadoVisita(attendanceId: string) {
  const att0 = await prisma.attendance.findUniqueOrThrow({
    where: { id: attendanceId },
    select: { visitorName: true, visitorEmail: true, lodgeId: true },
  });
  if (!att0.visitorName || !att0.visitorEmail) {
    throw new Error("Presença sem nome ou e-mail de visitante.");
  }
  if (!(await isGmailConfigured(att0.lodgeId))) {
    throw new Error("Gmail da loja não configurado.");
  }
  const { att, pdf, tipo, dataSessao } = await gerarCertificadoDaPresenca(attendanceId);

  await sendLodgeEmail({
    lodgeId: att.lodgeId,
    to: att0.visitorEmail,
    subject: `Certificado de Visita — ${att.lodge.name}`,
    text:
      `Prezado Ir∴ ${att.visitorName},\n\n` +
      `Agradecemos a sua visita à ${att.lodge.name} na Sessão ${tipo} ` +
      `de ${dataSessao}.\n\n` +
      `Segue em anexo o seu Certificado de Visita.\n\nTFA,\n${att.lodge.name}`,
    attachments: [{ filename: "certificado-de-visita.pdf", content: pdf }],
  });
}

// ── Link público assinado do certificado (envio pelo WhatsApp) ──
// O token é o id da presença + HMAC (AUTH_SECRET): não expira, não dá para
// enumerar e só serve para baixar este PDF.
function segredoCertificado() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET ausente para o link do certificado.");
  return s;
}

function assinarCertificado(attendanceId: string) {
  return createHmac("sha256", segredoCertificado())
    .update(`certificado.${attendanceId}`)
    .digest("base64url");
}

export function tokenCertificado(attendanceId: string) {
  return `${attendanceId}.${assinarCertificado(attendanceId)}`;
}

export function attendanceDoTokenCertificado(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const id = token.slice(0, i);
  const assinatura = token.slice(i + 1);
  if (!/^[A-Za-z0-9]+$/.test(id)) return null;
  const esperada = assinarCertificado(id);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

export function urlCertificado(attendanceId: string) {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3100";
  return `${baseUrl}/certificado/${tokenCertificado(attendanceId)}`;
}

// Telefone para o wa.me: só dígitos; sem DDI (10–11 dígitos) assume Brasil (55)
export function telefoneWhatsApp(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

// Mensagem pronta para o Secretário/VM enviar ao visitante pelo WhatsApp
export function mensagemWhatsAppCertificado(p: {
  nome: string;
  loja: string;
  tipo: string;
  dataSessao: string;
  attendanceId: string;
}) {
  return (
    `Prezado Ir∴ ${p.nome}, agradecemos a sua visita à ${p.loja} na Sessão ${p.tipo} de ${p.dataSessao}. ` +
    `Seu Certificado de Visita em PDF: ${urlCertificado(p.attendanceId)}\n\nTFA, ${p.loja}`
  );
}

export function linkWhatsAppCertificado(telefone: string, mensagem: string) {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
}
