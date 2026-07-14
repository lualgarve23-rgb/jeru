import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { gerarPdfAtaAssinada } from "@/lib/ata-final";

// Download do PDF final da ata — usado para levar o arquivo ao assinador
// externo (assinador.iti.br) e depois subir a versão assinada de volta.
// No fluxo gov.br (exclusivo) o PDF sai sem assinaturas internas.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(
      new URL("/login", process.env.APP_URL ?? req.url)
    );
  }
  const ataId = req.nextUrl.searchParams.get("ata");
  if (!ataId) return new NextResponse("Ata não informada.", { status: 400 });

  const ata = await prisma.ata.findUnique({
    where: { id: ataId, lodgeId: session.user.lodgeId },
    select: {
      status: true,
      number: true,
      govbrPdf: true,
      govbrSolicitado: true,
    },
  });
  if (!ata) return new NextResponse("Ata não encontrada.", { status: 404 });
  const liberada = ata.status !== "RASCUNHO" && ata.status !== "EM_VALIDACAO";
  if (ata.govbrSolicitado ? !liberada : ata.status !== "ASSINADA") {
    return new NextResponse(
      ata.govbrSolicitado
        ? "A ata precisa ser liberada para assinaturas antes do download."
        : "A ata precisa das duas assinaturas internas antes do download.",
      { status: 400 }
    );
  }

  // Se o Venerável Mestre já assinou no gov.br, o Secretário baixa essa
  // versão para acrescentar a própria assinatura sobre ela
  const pdf = ata.govbrPdf
    ? Buffer.from(ata.govbrPdf)
    : (await gerarPdfAtaAssinada(ataId, session.user.lodgeId)).pdf;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ata-${ata.number}.pdf"`,
    },
  });
}
