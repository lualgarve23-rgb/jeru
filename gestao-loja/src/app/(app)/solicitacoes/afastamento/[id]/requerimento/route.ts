import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { gerarRequerimentoPdf } from "@/lib/afastamento";

// PDF do requerimento de afastamento: o próprio irmão (dono) ou a
// fiscalização da Loja. Depois da assinatura gov.br do irmão vale o PDF
// selado pelo ITI; antes, é gerado sob demanda (para assinar no portal).
const FISCAL = ["VENERAVEL_MESTRE", "SECRETARIO", "TESOUREIRO", "CONSELHO_CONTAS"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id } = await params;
  const p = await prisma.pedidoAfastamento.findUnique({
    where: { id, lodgeId: user.lodgeId },
    select: { userId: true, requerimentoPdf: true },
  });
  if (!p || (p.userId !== user.id && !FISCAL.includes(user.role))) {
    return new Response("Não encontrado", { status: 404 });
  }
  const pdf = p.requerimentoPdf
    ? Buffer.from(p.requerimentoPdf)
    : (await gerarRequerimentoPdf(id, user.lodgeId)).pdf;
  const attachment = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="requerimento-afastamento.pdf"`,
    },
  });
}
