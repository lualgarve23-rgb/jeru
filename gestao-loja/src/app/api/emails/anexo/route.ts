import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { baixarAnexo } from "@/lib/gmail-inbox";

// Download de anexo de e-mail da caixa da Loja (Secretário/VM)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (
    !session?.user ||
    !["SECRETARIO", "VENERAVEL_MESTRE"].includes(session.user.role)
  ) {
    return NextResponse.redirect(
      new URL("/login", process.env.APP_URL ?? req.url)
    );
  }
  const uid = Number(req.nextUrl.searchParams.get("uid"));
  const idx = Number(req.nextUrl.searchParams.get("idx"));
  if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(idx) || idx < 0) {
    return new NextResponse("Parâmetros inválidos.", { status: 400 });
  }

  const anexo = await baixarAnexo(uid, idx);
  if (!anexo) return new NextResponse("Anexo não encontrado.", { status: 404 });

  return new NextResponse(new Uint8Array(anexo.content), {
    headers: {
      "Content-Type": anexo.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${anexo.filename.replace(/"/g, "")}"`,
    },
  });
}
