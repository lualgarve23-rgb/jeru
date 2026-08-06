import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

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
  return new Response(new Uint8Array(placet.formularioArquivo), {
    headers: {
      "Content-Type": placet.formularioMime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${(
        placet.formularioNome ?? "quitte-placet"
      ).replace(/"/g, "")}"`,
    },
  });
}
