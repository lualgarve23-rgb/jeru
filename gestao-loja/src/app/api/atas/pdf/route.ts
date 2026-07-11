import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { gerarPdfAtaAssinada } from "@/lib/ata-final";

// Download do PDF final da ata (com as assinaturas internas) — usado para
// levar o arquivo ao assinador externo (assinador.iti.br) e depois subir
// a versão assinada de volta.
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
    select: { status: true },
  });
  if (!ata) return new NextResponse("Ata não encontrada.", { status: 404 });
  if (ata.status !== "ASSINADA") {
    return new NextResponse(
      "A ata precisa das duas assinaturas internas antes do download.",
      { status: 400 }
    );
  }

  const { ata: dados, pdf } = await gerarPdfAtaAssinada(
    ataId,
    session.user.lodgeId
  );
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ata-${dados.number}.pdf"`,
    },
  });
}
