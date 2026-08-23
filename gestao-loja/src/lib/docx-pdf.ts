import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function ehPdf(buf: Buffer) {
  return buf.subarray(0, 5).toString("latin1").startsWith("%PDF-");
}

export function ehDocx(buf: Buffer, nome = "", mime = "") {
  // .docx é um ZIP ("PK\x03\x04"); aceita pelo nome/mime também
  const zip = buf.subarray(0, 4).toString("latin1") === "PK\x03\x04";
  return zip && (nome.toLowerCase().endsWith(".docx") || mime === DOCX_MIME || nome === "");
}

/*
 * Converte um .docx em PDF com o LibreOffice headless (pacote
 * libreoffice-writer no host). Usado para que formulários do GOB baixados
 * em Word possam entrar na cadeia de assinaturas gov.br, que só assina PDF.
 * Cada conversão usa um HOME temporário para não colidir com outras
 * instâncias do soffice.
 */
export async function docxParaPdf(docx: Buffer): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "docx2pdf-"));
  try {
    const entrada = path.join(dir, "documento.docx");
    await fs.writeFile(entrada, docx);
    await execFileP(
      "soffice",
      ["--headless", "--norestore", "--convert-to", "pdf", "--outdir", dir, entrada],
      { env: { ...process.env, HOME: dir }, timeout: 90_000 }
    );
    const pdf = await fs.readFile(path.join(dir, "documento.pdf"));
    if (!ehPdf(pdf)) throw new Error("conversão não produziu PDF");
    return pdf;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Devolve o buffer como PDF: passa direto se já for PDF, converte se for .docx, senão null. */
export async function garantirPdf(
  buf: Buffer,
  nome = "",
  mime = ""
): Promise<{ pdf: Buffer; nome: string } | null> {
  if (ehPdf(buf)) return { pdf: buf, nome };
  if (ehDocx(buf, nome, mime)) {
    const pdf = await docxParaPdf(buf);
    return { pdf, nome: nome.replace(/\.docx$/i, "") + ".pdf" };
  }
  return null;
}
