import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readMedia, MEDIA_PREFIX } from "@/lib/media";

// Serve fotos/assinaturas do disco local — restrito a usuários logados da
// própria loja (o 1º segmento da chave é o lodgeId). A chave tem sufixo
// aleatório por upload, então o cache pode ser imutável.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Não autenticado.", { status: 401 });
  }
  const { path: partes } = await params;
  const rel = partes.map(decodeURIComponent).join("/");
  if (!rel.startsWith(`${session.user.lodgeId}/`)) {
    return new NextResponse("Sem acesso.", { status: 403 });
  }
  const m = await readMedia(MEDIA_PREFIX + rel);
  if (!m) return new NextResponse("Não encontrado.", { status: 404 });
  return new NextResponse(new Uint8Array(m.bytes), {
    headers: {
      "Content-Type": m.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
