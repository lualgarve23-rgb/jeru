import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Abertura de uma notificação a partir do sino, da central ou do e-mail:
// marca como lida (só a própria loja; dirigida só pelo destinatário) e
// redireciona ao item. A autenticação é exigida pelo middleware
// (/n/ não está na lista de rotas públicas); aqui só reconfere.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const baseUrl = process.env.APP_URL ?? req.url;
  const session = await auth();
  if (!session?.user || session.user.invalid) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }
  const { id } = await params;
  const n = await prisma.notification.findUnique({
    where: { id, lodgeId: session.user.lodgeId },
    select: { link: true, userId: true, isRead: true },
  });
  const fallback = "/dashboard/notificacoes";
  if (!n) return NextResponse.redirect(new URL(fallback, baseUrl));
  if (!n.isRead && (n.userId === null || n.userId === session.user.id)) {
    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }
  // só rotas internas (o link vem do banco, mas nunca de input do usuário)
  const destino = n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : fallback;
  return NextResponse.redirect(new URL(destino, baseUrl));
}
