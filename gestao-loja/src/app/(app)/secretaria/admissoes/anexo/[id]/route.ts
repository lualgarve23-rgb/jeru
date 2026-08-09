import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { canWriteSecretaria } from "@/lib/permissions";
import { attachmentResponse } from "@/lib/download";

// Download de formulário do candidato: Secretaria/VM ou o padrinho do processo.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;
  const anexo = await prisma.candidatoAnexo.findUnique({
    where: { id },
    include: {
      processo: { select: { lodgeId: true, padrinhoId: true } },
    },
  });
  if (!anexo || anexo.processo.lodgeId !== user.lodgeId) {
    return new Response("Anexo não encontrado.", { status: 404 });
  }
  const permitido =
    canWriteSecretaria(user.role) || anexo.processo.padrinhoId === user.id;
  if (!permitido) {
    return new Response("Sem permissão para baixar este anexo.", { status: 403 });
  }
  return attachmentResponse(anexo.arquivo, anexo.nome, anexo.mimeType);
}
