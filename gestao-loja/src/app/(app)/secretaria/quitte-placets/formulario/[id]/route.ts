import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { attachmentResponse } from "@/lib/download";

// Download do Form. 122 anexado ao Quitte Placet (guardado no banco).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Fiscais sempre; o próprio irmão só quando o documento está pronto
  // (APROVADO = assinado pelo Secretário e pelo VM)
  const user = await requireUser();
  const fiscal = ["SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"].includes(
    user.role
  );
  const { id } = await params;
  const placet = await prisma.quittePlacet.findUnique({
    where: { id, lodgeId: user.lodgeId },
    select: {
      userId: true,
      status: true,
      formularioArquivo: true,
      formularioNome: true,
      formularioMime: true,
      govbrPdf: true,
    },
  });
  if (
    placet &&
    !fiscal &&
    !(placet.userId === user.id && placet.status === "APROVADO")
  ) {
    return new Response("Sem permissão.", { status: 403 });
  }
  if (!placet?.formularioArquivo) {
    return new Response("Formulário não anexado.", { status: 404 });
  }
  // Havendo assinaturas gov.br, baixa a versão com as PAdES embutidas —
  // é ela que o próximo assinante leva ao portal do ITI
  if (placet.govbrPdf) {
    return attachmentResponse(
      placet.govbrPdf,
      "quitte-placet-assinado-govbr.pdf",
      "application/pdf"
    );
  }
  return attachmentResponse(
    placet.formularioArquivo,
    placet.formularioNome ?? "quitte-placet",
    placet.formularioMime
  );
}
