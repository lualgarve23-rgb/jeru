import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Form. 116 do pedido (PDF gerado pela Secretaria; com as assinaturas gov.br
// quando houver). Fiscalização da Loja sempre; o irmão dono só depois de o
// formulário existir (fluxo do portal assinador.iti.br para os cargos).
const FISCAL = ["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO", "CONSELHO_CONTAS"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;
  const p = await prisma.pedidoAfastamento.findUnique({
    where: { id, lodgeId: user.lodgeId },
    select: { userId: true, formularioPdf: true, govbrPdf: true },
  });
  if (!p || (p.userId !== user.id && !FISCAL.includes(user.role))) {
    return new Response("Não encontrado", { status: 404 });
  }
  const pdf = p.govbrPdf ?? p.formularioPdf;
  if (!pdf) return new Response("Form. 116 ainda não gerado", { status: 404 });
  const attachment = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="form-116-pedido-licenca.pdf"`,
    },
  });
}
