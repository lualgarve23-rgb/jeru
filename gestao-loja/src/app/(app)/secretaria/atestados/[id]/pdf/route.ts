import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { gerarAtestadoPdf } from "@/lib/atestado";

// PDF do Atestado de Regularidade: o próprio irmão (dono) ou a fiscalização
// da Loja. Quando houver assinatura gov.br, vale o PDF selado pelo ITI.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;
  const atestado = await prisma.atestadoRegularidade.findUnique({
    where: { id, lodgeId: user.lodgeId },
    select: { userId: true, govbrPdf: true },
  });
  const fiscal = [
    "VENERAVEL_MESTRE",
    "SECRETARIO",
    "TESOUREIRO",
    "CONSELHO_CONTAS",
  ];
  if (!atestado || (atestado.userId !== user.id && !fiscal.includes(user.role))) {
    return new Response("Não encontrado", { status: 404 });
  }
  const pdf = atestado.govbrPdf
    ? Buffer.from(atestado.govbrPdf)
    : (await gerarAtestadoPdf(id, user.lodgeId)).pdf;
  // ?download=1: força salvar o arquivo (fluxo do portal assinador.iti.br)
  const attachment = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="atestado-regularidade.pdf"`,
    },
  });
}
