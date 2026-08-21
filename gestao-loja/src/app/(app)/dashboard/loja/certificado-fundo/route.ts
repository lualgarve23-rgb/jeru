import { writeFile, readFile, readdir, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { requireRole } from "@/lib/session";
import { fundoAtual } from "@/lib/certificado";

const execFileAsync = promisify(execFile);

// Fundo do Certificado de Visita renderizado em PNG (via pdftoppm), usado como
// imagem de base do editor visual de posicionamento das caixas de texto.
export async function GET() {
  const user = await requireRole("VENERAVEL_MESTRE", "SECRETARIO");
  const pdf = await fundoAtual(user.lodgeId);
  const dir = await mkdtemp(path.join(tmpdir(), "cert-png-"));
  try {
    const src = path.join(dir, "fundo.pdf");
    await writeFile(src, pdf);
    await execFileAsync(
      "pdftoppm",
      ["-png", "-r", "110", "-f", "1", "-l", "1", src, path.join(dir, "fundo")],
      { timeout: 60_000 }
    );
    // O sufixo numérico varia com a versão do poppler (fundo-1.png / fundo-01.png)
    const nome = (await readdir(dir)).find((f) => f.endsWith(".png"));
    if (!nome) throw new Error("pdftoppm não gerou o PNG do fundo.");
    const png = await readFile(path.join(dir, nome));
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
