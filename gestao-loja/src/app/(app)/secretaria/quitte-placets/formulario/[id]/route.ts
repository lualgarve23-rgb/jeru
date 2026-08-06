import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { attachmentResponse } from "@/lib/download";

// Download do Form. 122 anexado ao Quitte Placet (guardado no banco).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole("SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS");
  const { id } = await params;
  const placet = await prisma.quittePlacet.findUnique({
    where: { id, lodgeId: user.lodgeId },
    select: { formularioArquivo: true, formularioNome: true, formularioMime: true },
  });
  if (!placet?.formularioArquivo) {
    return new Response("Formulário não anexado.", { status: 404 });
  }
  return attachmentResponse(
    placet.formularioArquivo,
    placet.formularioNome ?? "quitte-placet",
    placet.formularioMime
  );
}
