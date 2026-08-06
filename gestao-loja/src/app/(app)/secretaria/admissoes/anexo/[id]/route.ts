import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { attachmentResponse } from "@/lib/download";

// Download de um formulário anexado ao processo de admissão (guardado no banco).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;
  const anexo = await prisma.candidatoAnexo.findUnique({
    where: { id },
    include: { processo: { select: { lodgeId: true } } },
  });
  if (!anexo || anexo.processo.lodgeId !== user.lodgeId) {
    return new Response("Anexo não encontrado.", { status: 404 });
  }
  return attachmentResponse(anexo.arquivo, anexo.nome, anexo.mimeType);
}
