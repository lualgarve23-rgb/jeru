import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { attachmentResponse } from "@/lib/download";
import { cargosProcessoDoUsuario } from "@/lib/processos";

// Download da ata da sessão em que o pedido de Quitte Placet foi comunicado.
// Visível para a gestão, o Orador (assinante) e o próprio irmão do pedido.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;
  const placet = await prisma.quittePlacet.findUnique({
    where: { id, lodgeId: user.lodgeId },
    select: { userId: true, ataArquivo: true, ataNome: true, ataMime: true },
  });
  const fiscal = ["SECRETARIO", "VENERAVEL_MESTRE", "CONSELHO_CONTAS"].includes(
    user.role
  );
  const orador =
    !fiscal && (await cargosProcessoDoUsuario(user)).includes("ORADOR");
  if (!placet || (!fiscal && !orador && placet.userId !== user.id)) {
    return new Response("Não encontrado.", { status: 404 });
  }
  if (!placet.ataArquivo) {
    return new Response("Ata não anexada.", { status: 404 });
  }
  return attachmentResponse(
    placet.ataArquivo,
    placet.ataNome ?? "ata-sessao-quitte-placet",
    placet.ataMime
  );
}
