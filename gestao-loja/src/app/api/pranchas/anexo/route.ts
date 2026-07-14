import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { downloadFromLodgeDrive } from "@/lib/google-drive";

// Abre o anexo da prancha dentro do aplicativo (inline no navegador).
// Se já houver a versão assinada no gov.br, ela tem prioridade.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(
      new URL("/login", process.env.APP_URL ?? req.url)
    );
  }
  const pranchaId = req.nextUrl.searchParams.get("prancha");
  if (!pranchaId) {
    return new NextResponse("Prancha não informada.", { status: 400 });
  }

  const prancha = await prisma.prancha.findUnique({
    where: { id: pranchaId, lodgeId: session.user.lodgeId },
    select: {
      number: true,
      year: true,
      driveFileId: true,
      govbrPdf: true,
    },
  });
  if (!prancha) {
    return new NextResponse("Prancha não encontrada.", { status: 404 });
  }

  if (prancha.govbrPdf) {
    return new NextResponse(Buffer.from(prancha.govbrPdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="prancha-${prancha.number}-${prancha.year}-assinada-govbr.pdf"`,
      },
    });
  }

  if (!prancha.driveFileId) {
    return new NextResponse("Prancha sem anexo.", { status: 404 });
  }
  try {
    const { data, mimeType, name } = await downloadFromLodgeDrive(
      session.user.lodgeId,
      prancha.driveFileId
    );
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
      },
    });
  } catch (e) {
    return new NextResponse(
      e instanceof Error ? e.message : "Falha ao baixar o anexo do Drive.",
      { status: 502 }
    );
  }
}
