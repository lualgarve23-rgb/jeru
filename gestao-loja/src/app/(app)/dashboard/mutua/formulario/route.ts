import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { attachmentResponse } from "@/lib/download";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// Download do Form. 108 (Declaração de Beneficiários) pré-preenchido com os
// dados do próprio irmão e da Loja. O PDF oficial não tem campos AcroForm, por
// isso os valores são desenhados sobre as linhas do cabeçalho e do "Local e
// data" (coordenadas medidas no arquivo original — página A4, 595,2 × 841,92).
export async function GET() {
  const user = await requireUser();
  const [dbUser, lodge] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true, cim: true },
    }),
    prisma.lodge.findUniqueOrThrow({
      where: { id: user.lodgeId },
      select: { name: true, number: true, oriente: true },
    }),
  ]);

  const original = await readFile(
    path.join(
      process.cwd(),
      "public/formularios-gob/form-108-declaracao-beneficiario.pdf"
    )
  );
  const pdf = await PDFDocument.load(original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPage(0);
  const h = page.getHeight();
  const draw = (text: string, x: number, yTopo: number) =>
    page.drawText(text, { x, y: h - yTopo, size: 10, font });

  // Cabeçalho: NOME / CIM / LOJA / NÚMERO / ORIENTE
  draw(dbUser.name, 70, 241);
  draw(dbUser.cim, 56, 269.2);
  draw(lodge.name, 176, 269.2);
  draw(lodge.number, 82, 297.1);
  draw(lodge.oriente ?? "", 226, 297.1);

  // Linha "Local e data ______ , __ / ____ / ____"
  const hoje = new Date();
  draw(lodge.oriente ?? "", 198, 603.3);
  draw(String(hoje.getDate()).padStart(2, "0"), 405, 603.3);
  draw(MESES[hoje.getMonth()], 440, 603.3);
  draw(String(hoje.getFullYear()), 505, 603.3);

  return attachmentResponse(
    await pdf.save(),
    "form-108-declaracao-beneficiario-preenchido.pdf",
    "application/pdf"
  );
}
