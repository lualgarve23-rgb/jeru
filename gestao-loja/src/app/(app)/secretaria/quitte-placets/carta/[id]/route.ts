import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { attachmentResponse } from "@/lib/download";

// Download da carta de próprio punho anexada ao pedido de Quitte Placet.
// Visível para os fiscais da Secretaria e para o próprio irmão do pedido.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;
  const placet = await prisma.quittePlacet.findUnique({
    where: { id, lodgeId: user.lodgeId },
    select: { userId: true, cartaArquivo: true, cartaNome: true, cartaMime: true },
  });
  const fiscal = ["SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"].includes(
    user.role
  );
  if (!placet || (!fiscal && placet.userId !== user.id)) {
    return new Response("Não encontrado.", { status: 404 });
  }
  if (!placet.cartaArquivo) {
    return new Response("Carta não anexada.", { status: 404 });
  }
  return attachmentResponse(
    placet.cartaArquivo,
    placet.cartaNome ?? "carta-quitte-placet",
    placet.cartaMime
  );
}
