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
  let pdf: Buffer;
  if (p.requerimentoPdf) {
    pdf = Buffer.from(p.requerimentoPdf);
  } else {
    // Gera e PERSISTE o PDF base: o upload assinado no portal ITI precisa ser
    // uma continuação byte a byte deste arquivo (validarUploadAssinado), e a
    // geração não é determinística (data/timestamps).
    pdf = (await gerarRequerimentoPdf(id, user.lodgeId)).pdf;
    await prisma.pedidoAfastamento.updateMany({
      where: { id, lodgeId: user.lodgeId, requerimentoPdf: null },
      data: { requerimentoPdf: new Uint8Array(pdf) },
    });
    const atual = await prisma.pedidoAfastamento.findUnique({
      where: { id },
      select: { requerimentoPdf: true },
    });
    if (atual?.requerimentoPdf) pdf = Buffer.from(atual.requerimentoPdf);
  }
  const attachment = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="requerimento-afastamento.pdf"`,
    },
  });
}
