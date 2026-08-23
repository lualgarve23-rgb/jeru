import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { attachmentResponse } from "@/lib/download";

// Download do documento do processo. Havendo assinaturas gov.br, baixa a
// versão com as PAdES embutidas — é ela que o próximo assinante leva ao ITI.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole(
    "SECRETARIO",
    "TESOUREIRO",
    "VENERAVEL_MESTRE",
    "CONSELHO_CONTAS"
  );
  const { id } = await params;
  const doc = await prisma.processoDocumento.findUnique({
    where: { id, lodgeId: user.lodgeId },
    select: { arquivo: true, arquivoNome: true, govbrPdf: true },
  });
  if (!doc) return new Response("Processo não encontrado.", { status: 404 });
  if (doc.govbrPdf) {
    return attachmentResponse(
      doc.govbrPdf,
      "documento-assinado-govbr.pdf",
      "application/pdf"
    );
  }
  return attachmentResponse(doc.arquivo, doc.arquivoNome, "application/pdf");
}
