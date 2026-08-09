import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readMedia, isMediaKey } from "@/lib/media";

// Foto do membro na verificação pública da carteirinha (QR code) — acesso
// pelo cardToken, sem expor a chave interna de media. Rate limit por IP
// aplicado no middleware (prefixo /api/verificar/).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const member = await prisma.user.findUnique({
    where: { cardToken: token },
    select: { photoUrl: true },
  });
  if (!member?.photoUrl) {
    return new NextResponse("Não encontrado.", { status: 404 });
  }
  if (isMediaKey(member.photoUrl)) {
    const m = await readMedia(member.photoUrl);
    if (!m) return new NextResponse("Não encontrado.", { status: 404 });
    return new NextResponse(new Uint8Array(m.bytes), {
      headers: {
        "Content-Type": m.mime,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
  // Data URI legado (registro ainda não migrado)
  const [, meta, base64] =
    member.photoUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/) ?? [];
  if (!base64) return new NextResponse("Não encontrado.", { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(base64, "base64")), {
    headers: {
      "Content-Type": meta,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
