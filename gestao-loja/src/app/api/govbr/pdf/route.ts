import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Download do PDF da ata com as assinaturas digitais gov.br
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
    select: { number: true, govbrPdf: true },
  });
  if (!ata?.govbrPdf) {
    return new NextResponse("Ata sem assinatura gov.br.", { status: 404 });
  }
  return new NextResponse(Buffer.from(ata.govbrPdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ata-${ata.number}-govbr.pdf"`,
    },
  });
}
