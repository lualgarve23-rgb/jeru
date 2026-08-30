import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Mensagens de uma conversa do assistente, para retomá-la no painel.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user)
    return new NextResponse("Não autenticado.", { status: 401 });
  const { id } = await params;

  const conversa = await prisma.assistenteConversa.findFirst({
    where: { id, lodgeId: session.user.lodgeId, userId: session.user.id },
    select: {
      id: true,
      mensagens: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      },
    },
  });
  if (!conversa)
    return new NextResponse("Conversa não encontrada.", { status: 404 });
  return NextResponse.json(conversa);
}

// Apagar uma conversa (e as mensagens, por cascade).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user)
    return new NextResponse("Não autenticado.", { status: 401 });
  const { id } = await params;

  const { count } = await prisma.assistenteConversa.deleteMany({
    where: { id, lodgeId: session.user.lodgeId, userId: session.user.id },
  });
  if (!count)
    return new NextResponse("Conversa não encontrada.", { status: 404 });
  return NextResponse.json({ ok: true });
}
