import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gerarBackupLoja } from "@/lib/backup";

// Download do backup completo da Loja (ZIP) — restrito a Venerável e Secretário.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Não autenticado.", { status: 401 });
  }
  if (!["VENERAVEL_MESTRE", "SECRETARIO"].includes(session.user.role)) {
    return new NextResponse(
      "Apenas o Venerável Mestre e o Secretário podem baixar o backup.",
      { status: 403 }
    );
  }

  const { zip, fileName } = await gerarBackupLoja(session.user.lodgeId);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(zip.length),
    },
  });
}
