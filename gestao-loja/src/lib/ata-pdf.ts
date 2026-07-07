import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// PDF da Ata no formato do preview da página (papel branco, bloco de
// assinaturas com a imagem de cada signatário). Fontes DejaVu Sans
// embutidas — o texto usa "∴" (U+2234), que falta no WinAnsi e no
// DejaVu Serif.
const FONTS_DIR = path.join(process.cwd(), "templates", "fonts");

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 64;
const BODY_SIZE = 11;
const LINE_HEIGHT = 17;

export type AtaPdfSigner = {
  name: string;
  cargo: string;
  signedAt?: Date | null;
  signatureUrl?: string | null; // data URI png/jpg
};

export type AtaPdfData = {
  lodgeName: string;
  lodgeNumber?: string; // nº da Loja na potência (cabeçalho/rodapé)
  number: number;
  content: string;
  signers: AtaPdfSigner[]; // vazio na minuta em validação
  minuta?: boolean; // marca "MINUTA PARA VALIDAÇÃO"
  logoUrl?: string | null; // símbolo da Loja no cabeçalho (data URI png/jpg)
  cabecalho?: string | null; // linhas institucionais sob o nome (Lodge.ataCabecalho)
  address?: string | null; // endereço da sede (última linha do cabeçalho)
  divisa?: string | null; // frase do rodapé (Lodge.ataDivisa)
};

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const tentative = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(tentative, size) <= maxWidth) {
        line = tentative;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function gerarAtaPdf(data: AtaPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const serif = await doc.embedFont(
    await readFile(path.join(FONTS_DIR, "DejaVuSans.ttf")),
    { subset: true }
  );
  const serifBold = await doc.embedFont(
    await readFile(path.join(FONTS_DIR, "DejaVuSans-Bold.ttf")),
    { subset: true }
  );

  const maxWidth = PAGE.width - 2 * MARGIN;
  const FOOTER_H = 46; // reserva para o rodapé institucional
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - 52;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN + FOOTER_H) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN;
    }
  };

  const vermelho = rgb(0.55, 0.08, 0.08);
  const centered = (
    text: string,
    size: number,
    font: PDFFont,
    color = rgb(0, 0, 0)
  ) => {
    page.drawText(text, {
      x: (PAGE.width - font.widthOfTextAtSize(text, size)) / 2,
      y,
      size,
      font,
      color,
    });
  };

  // Cabeçalho institucional (1ª página): símbolo da Loja à esquerda,
  // nome + linhas do Lodge.ataCabecalho + endereço centralizados, e
  // filete vermelho separando do corpo
  const headerTop = y;
  if (data.logoUrl?.startsWith("data:image/")) {
    try {
      const bytes = Buffer.from(data.logoUrl.split(",")[1], "base64");
      const img = data.logoUrl.includes("png")
        ? await doc.embedPng(bytes)
        : await doc.embedJpg(bytes);
      const size = 68;
      const scale = Math.min(size / img.width, size / img.height);
      page.drawImage(img, {
        x: MARGIN - 14,
        y: headerTop - size + 12,
        width: img.width * scale,
        height: img.height * scale,
      });
    } catch {
      // logo ilegível — segue sem imagem
    }
  }
  const title = data.lodgeNumber
    ? `${data.lodgeName} nº ${data.lodgeNumber}`
    : data.lodgeName;
  centered(title, 14, serifBold);
  y -= 15;
  const headerLines = (data.cabecalho ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (data.address) headerLines.push(data.address);
  for (const line of headerLines) {
    centered(line, 8.5, serif, rgb(0.15, 0.15, 0.15));
    y -= 12;
  }
  y = Math.min(y, headerTop - 58); // não invadir o logo
  page.drawLine({
    start: { x: MARGIN - 14, y },
    end: { x: PAGE.width - MARGIN + 14, y },
    thickness: 3,
    color: vermelho,
  });
  y -= 24;
  const sub = data.minuta
    ? `Ata nº ${data.number} — MINUTA PARA VALIDAÇÃO`
    : `Ata nº ${data.number}`;
  centered(sub, 11, serif, data.minuta ? rgb(0.6, 0.1, 0.1) : rgb(0.2, 0.2, 0.2));
  y -= 28;

  // Corpo
  for (const line of wrapText(data.content, serif, BODY_SIZE, maxWidth)) {
    newPageIfNeeded(LINE_HEIGHT);
    if (line) {
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font: serif });
    }
    y -= LINE_HEIGHT;
  }

  // Assinaturas lado a lado
  if (data.signers.length) {
    const blockH = 64 + 40; // imagem + linha + nome/cargo
    newPageIfNeeded(blockH + 30);
    y -= 30;
    const colW = maxWidth / data.signers.length;
    for (let i = 0; i < data.signers.length; i++) {
      const s = data.signers[i];
      const cx = MARGIN + colW * i + colW / 2;
      const sigBottom = y - 48;
      if (s.signatureUrl?.startsWith("data:image/")) {
        try {
          const base64 = s.signatureUrl.split(",")[1];
          const bytes = Buffer.from(base64, "base64");
          const img = s.signatureUrl.includes("png")
            ? await doc.embedPng(bytes)
            : await doc.embedJpg(bytes);
          const scale = Math.min(48 / img.height, (colW - 40) / img.width);
          const w = img.width * scale;
          const h = img.height * scale;
          page.drawImage(img, { x: cx - w / 2, y: sigBottom, width: w, height: h });
        } catch {
          // assinatura ilegível — segue sem imagem
        }
      }
      const lineW = Math.min(190, colW - 30);
      page.drawLine({
        start: { x: cx - lineW / 2, y: sigBottom - 6 },
        end: { x: cx + lineW / 2, y: sigBottom - 6 },
        thickness: 0.8,
        color: rgb(0.45, 0.45, 0.45),
      });
      page.drawText(s.name, {
        x: cx - serifBold.widthOfTextAtSize(s.name, 10) / 2,
        y: sigBottom - 20,
        size: 10,
        font: serifBold,
      });
      const cargoLine = s.signedAt
        ? `${s.cargo} — ${s.signedAt.toLocaleDateString("pt-BR")}`
        : s.cargo;
      page.drawText(cargoLine, {
        x: cx - serif.widthOfTextAtSize(cargoLine, 8.5) / 2,
        y: sigBottom - 33,
        size: 8.5,
        font: serif,
        color: rgb(0.35, 0.35, 0.35),
      });
    }
    y -= blockH;
  }

  // Rodapé institucional em todas as páginas: nome da Loja e divisa
  const footerName = data.lodgeNumber
    ? `${data.lodgeName} – nº ${data.lodgeNumber}`
    : data.lodgeName;
  for (const p of doc.getPages()) {
    p.drawLine({
      start: { x: MARGIN, y: 46 },
      end: { x: PAGE.width - MARGIN, y: 46 },
      thickness: 1,
      color: rgb(0.1, 0.1, 0.1),
    });
    p.drawText(footerName, {
      x: (PAGE.width - serifBold.widthOfTextAtSize(footerName, 9)) / 2,
      y: 34,
      size: 9,
      font: serifBold,
    });
    if (data.divisa) {
      const divisa = `“${data.divisa.replace(/^[“"]|[”"]$/g, "")}”`;
      p.drawText(divisa, {
        x: (PAGE.width - serif.widthOfTextAtSize(divisa, 7.5)) / 2,
        y: 23,
        size: 7.5,
        font: serif,
        color: rgb(0.35, 0.35, 0.35),
      });
    }
  }

  return Buffer.from(await doc.save());
}
