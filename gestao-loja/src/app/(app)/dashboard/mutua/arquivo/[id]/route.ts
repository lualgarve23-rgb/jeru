import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { attachmentResponse } from "@/lib/download";

// Cargos que enxergam as entregas da Mútua de todos os irmãos
const CARGOS_MUTUA = ["SECRETARIO", "VENERAVEL_MESTRE", "TESOUREIRO", "ESMOLER"];

// Download da Declaração de Beneficiários entregue (banco). O próprio irmão
// baixa a sua; Secretário, VM, Tesoureiro e Esmoler baixam as de todos.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;
  const entrega = await prisma.mutuaEntrega.findUnique({
    where: { id, lodgeId: user.lodgeId },
    select: { userId: true, arquivo: true, nome: true, mimeType: true },
  });
  if (!entrega) return new Response("Entrega não encontrada.", { status: 404 });
  if (entrega.userId !== user.id && !CARGOS_MUTUA.includes(user.role)) {
    return new Response("Sem permissão.", { status: 403 });
  }
  // Entrega anterior ao sistema: registro sem anexo
  if (!entrega.arquivo) {
    return new Response("Entrega registrada sem arquivo.", { status: 404 });
  }
  return attachmentResponse(
    entrega.arquivo,
    entrega.nome ?? "declaracao-beneficiarios",
    entrega.mimeType
  );
}
