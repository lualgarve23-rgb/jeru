import { prisma } from "@/lib/prisma";
import { arteDoConvite } from "@/lib/convite";
import { arteComDados, isConviteArteLayout } from "@/lib/convite-arte";

// Imagem pública do convite (arte da loja composta com os dados da sessão),
// usada como og:image para o WhatsApp/Telegram mostrarem o convite no preview
// do link. O token do convite é o segredo — mesma exposição da própria página.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await prisma.lodgeSession.findUnique({
    where: { inviteToken: token },
    include: { lodge: true },
  });
  const arte = session
    ? arteDoConvite(session.lodge.conviteTemplateHtml)
    : null;
  if (!session || !arte) {
    return new Response("Não encontrado", { status: 404 });
  }
  const dataUri = await arteComDados(
    arte,
    session,
    isConviteArteLayout(session.lodge.conviteArteLayout)
      ? session.lodge.conviteArteLayout
      : null
  );
  const jpeg = Buffer.from(dataUri.split(",")[1], "base64");
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": 'inline; filename="convite.jpg"',
    },
  });
}
