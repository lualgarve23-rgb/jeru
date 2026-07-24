import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Download de item da Biblioteca Digital — qualquer irmão logado da Loja.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(
      new URL("/login", process.env.APP_URL ?? req.url)
    );
  }
  const { id } = await params;
  const item = await prisma.bibliotecaItem.findUnique({
    where: { id, lodgeId: session.user.lodgeId },
    select: { titulo: true, arquivo: true, mimeType: true },
  });
  if (!item) return new NextResponse("Item não encontrado.", { status: 404 });

  const nome = item.titulo.replace(/[^\p{L}\p{N} ._-]/gu, "").trim() || "arquivo";
  return new NextResponse(Buffer.from(item.arquivo), {
    headers: {
      "Content-Type": item.mimeType,
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
