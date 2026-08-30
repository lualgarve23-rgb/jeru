// Extração de texto de arquivos para busca/leitura (Assistente IA e biblioteca).
// PDFs via pdftotext (poppler, instalado no servidor); text/* direto.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export async function textoDePdf(pdf: Buffer): Promise<string> {
  const tmp = join(tmpdir(), `extrai-${randomUUID()}.pdf`);
  await writeFile(tmp, pdf);
  try {
    const { stdout } = await promisify(execFile)(
      "pdftotext",
      ["-layout", tmp, "-"],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    return stdout;
  } finally {
    await rm(tmp, { force: true });
  }
}

// Devolve o texto extraído ou null quando o formato não é suportado/falha.
export async function extraiTexto(
  arquivo: Buffer,
  mimeType: string
): Promise<string | null> {
  try {
    let texto: string;
    if (mimeType === "application/pdf") texto = await textoDePdf(arquivo);
    else if (mimeType.startsWith("text/")) texto = arquivo.toString("utf8");
    else return null;
    texto = texto.replace(/\n{3,}/g, "\n\n").trim();
    return texto || null;
  } catch {
    return null;
  }
}
