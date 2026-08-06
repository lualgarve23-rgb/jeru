import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import {
  CAMPOS_POR_FORMULARIO,
  gerarFormularioPreenchido,
} from "@/lib/formularios-fill";
import { ehFormularioDeIndicacao } from "@/lib/formularios-candidato";

// Download público (pelo token do candidato) dos formulários de indicação.
// Os .docx da série 105 saem preenchidos com a Loja e o nome do candidato;
// os demais (questionário, testamento) vão no original.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const arquivo = new URL(request.url).searchParams.get("arquivo") ?? "";
  if (!ehFormularioDeIndicacao(arquivo)) {
    return new Response("Formulário não disponível neste link.", { status: 404 });
  }

  const processo = await prisma.processoAdmissao.findUnique({
    where: { token },
    select: { lodgeId: true, nomeCandidato: true },
  });
  if (!processo) return new Response("Link inválido.", { status: 404 });

  if (arquivo in CAMPOS_POR_FORMULARIO) {
    const docx = await gerarFormularioPreenchido(arquivo, processo.lodgeId, {
      candidato: processo.nomeCandidato,
    });
    return new Response(new Uint8Array(docx), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="preenchido-${arquivo}"`,
      },
    });
  }

  // Formulário sem preenchimento automático: entrega o original do GOB-SP.
  // O nome vem da lista fechada de indicação, então não há travessia de path.
  const original = await readFile(
    path.join(process.cwd(), "public", "formularios-gob", arquivo)
  );
  return new Response(new Uint8Array(original), {
    headers: {
      "Content-Type": arquivo.endsWith(".pdf")
        ? "application/pdf"
        : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
    },
  });
}
